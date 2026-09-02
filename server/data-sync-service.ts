import type {
  DifferenceResolution,
  LocalSyncTask,
  PlatformId,
  SchemaMappingSuggestion,
  SchemaMappings,
  SyncDifference,
  SyncContent,
  SyncSchemaField,
  SyncSourceId,
  ValueMappingSuggestion,
} from "../src/types/data-sync.ts";
import { compareContents } from "../src/services/data-sync-core.ts";
import {
  executeMockSync,
  getMockContent,
  mappingsFromSuggestions,
  platformLabel,
  schemaForContent,
} from "./data-sync-mock-adapter.ts";

export interface DataAgentMessageInput {
  conversationId: string;
  messageId: string;
  userId: string;
  message: string;
  context?: { spuId?: string };
}

export type DataSyncIntent = "validation" | "sync";
export type DataSyncRoute = {
  intent: DataSyncIntent;
  spuId: string;
  sourceType: "platform" | "file";
  sourceId: PlatformId | null;
  targetId: PlatformId;
};

export type RunDataSyncAgentStage = (stage: "route" | "schema" | "value", input: Record<string, unknown>) => Promise<unknown>;

export function createDataSyncService(runAgentStage: RunDataSyncAgentStage) {
  const comparisonCache = new Map<string, ReturnType<typeof computeComparison>>();
  async function route(conversation: Array<{ role: "user" | "assistant"; content: string }>, context?: { spuId?: string }) {
    return runAgentStage("route", {
      conversation,
      hasFile: false,
      ...(context?.spuId ? { currentPageSpuId: context.spuId } : {}),
    }) as Promise<{ reply: string; action: DataSyncRoute | null }>;
  }

  async function suggestSchemaMappings(input: { spuId: string; sourceId: SyncSourceId; targetId: PlatformId; sourceContent?: SyncContent }) {
    const sourceContent = input.sourceContent ?? getMockContent(input.sourceId as PlatformId, input.spuId);
    const targetContent = getMockContent(input.targetId, input.spuId);
    const sourceSchema = schemaForContent(sourceContent);
    const targetSchema = schemaForContent(targetContent);
    const result = await runAgentStage("schema", { ...input, sourceSchema, targetSchema, sourceContent, targetContent }) as { mappings: SchemaMappingSuggestion[] };
    const schemaMappings = mappingsFromSuggestions(input.targetId, sourceSchema, targetSchema, result.mappings);
    return {
      sourceSchema,
      targetSchema,
      schemaMappings,
      suggestions: sourceSchema.map((sourceField) => ({
        sourceFieldKey: sourceField.key,
        sourceScope: sourceField.scope,
        ...schemaMappings[`${input.targetId}:${sourceField.scope}:${sourceField.key}`],
      })),
    };
  }

  async function suggestValueResolutions(input: { sourceId: SyncSourceId; targetId: PlatformId; schemaMappings: SchemaMappings; differences: SyncDifference[] }) {
    const pendingDifferences = input.differences.filter((difference) => difference.result !== "skipped");
    const result = pendingDifferences.length
      ? await runAgentStage("value", { sourceId: input.sourceId, targetId: input.targetId, schemaMappings: input.schemaMappings, differences: pendingDifferences }) as { resolutions: ValueMappingSuggestion[] }
      : { resolutions: [] as ValueMappingSuggestion[] };
    const suggestions = new Map(result.resolutions.map((resolution) => [resolution.differenceId, resolution.resolution]));
    const missing = pendingDifferences.filter((difference) => !suggestions.has(difference.id));
    if (missing.length) throw new Error(`Value Mapping 缺少 ${missing.length} 条差异处理建议`);
    return input.differences.map((difference) => ({
      differenceId: difference.id,
      resolution: difference.result === "skipped" ? "skip" as const : suggestions.get(difference.id)!,
    }));
  }

  async function previewValues(input: { spuId: string; sourceId: SyncSourceId; targetId: PlatformId; schemaMappings: SchemaMappings; sourceContent?: SyncContent; selectedMappingIds?: string[] }) {
    const sourceContent = input.sourceContent ?? getMockContent(input.sourceId as PlatformId, input.spuId);
    const differences = compareContents({
      spuId: input.spuId,
      sourceId: input.sourceId,
      sourceContent,
      targetId: input.targetId,
      targetContent: getMockContent(input.targetId, input.spuId),
      schemaMappings: input.schemaMappings,
      selectedMappingIds: input.selectedMappingIds,
    });
    const suggestions = await suggestValueResolutions({ ...input, differences });
    const resolutions = Object.fromEntries(suggestions.map((suggestion) => [suggestion.differenceId, suggestion.resolution])) as Record<string, DifferenceResolution>;
    return { differences, resolutions };
  }

  function executeSync(differences: SyncDifference[], resolutions: Record<string, DifferenceResolution>) {
    return executeMockSync(differences, resolutions);
  }

  function executePlan(input: {
    spuId: string;
    sourceId: SyncSourceId;
    targetId: PlatformId;
    schemaMappings: SchemaMappings;
    selectedMappingIds: string[];
    resolutions: Record<string, DifferenceResolution>;
    sourceContent?: SyncContent;
  }): LocalSyncTask {
    const sourceContent = input.sourceContent ?? getMockContent(input.sourceId as PlatformId, input.spuId);
    const differences = compareContents({
      spuId: input.spuId,
      sourceId: input.sourceId,
      sourceContent,
      targetId: input.targetId,
      targetContent: getMockContent(input.targetId, input.spuId),
      schemaMappings: input.schemaMappings,
      selectedMappingIds: input.selectedMappingIds,
    });
    const execution = executeMockSync(differences, input.resolutions);
    return {
      id: execution.executionId,
      createdAt: execution.executedAt,
      spuId: input.spuId,
      sourceId: input.sourceId,
      targetIds: [input.targetId],
      differenceCount: execution.differenceCount,
      overwriteCount: execution.overwriteCount,
      skippedCount: execution.skippedCount,
      resolutions: input.resolutions,
      schemaMappings: input.schemaMappings,
      selectedMappingIds: input.selectedMappingIds,
      mode: "local-mock",
    };
  }

  async function computeComparison(input: DataAgentMessageInput) {
    const routeResult = await route([{ role: "user", content: input.message }], input.context);
    if (!routeResult.action) return { status: "collecting_route" as const, message: routeResult.reply };
    if (routeResult.action.sourceType !== "platform" || !routeResult.action.sourceId) {
      return { status: "collecting_route" as const, message: "一次性字段对比暂不支持文件来源，请说明来源平台。" };
    }
    const { spuId, sourceId, targetId } = routeResult.action;
    const schema = await suggestSchemaMappings({ spuId, sourceId, targetId });
    const preview = await previewValues({ spuId, sourceId, targetId, schemaMappings: schema.schemaMappings });
    return {
      status: "completed" as const,
      message: `字段对比完成：${spuId} · ${platformLabel(sourceId)} → ${platformLabel(targetId)}；本次未执行同步。`,
      schemaMappings: schema.sourceSchema.map((sourceField: SyncSchemaField) => {
        const mapping = schema.schemaMappings[`${targetId}:${sourceField.scope}:${sourceField.key}`];
        return { scope: sourceField.scope, sourceFieldKey: sourceField.key, sourceFieldLabel: sourceField.label, targetFieldKey: mapping.targetFieldKey, createTargetField: mapping.createTargetField };
      }),
      differences: preview.differences.map((difference) => ({ ...difference, suggestion: preview.resolutions[difference.id] })),
      summary: {
        total: preview.differences.length,
        added: preview.differences.filter((difference) => difference.result === "added").length,
        changed: preview.differences.filter((difference) => difference.result === "pending").length,
        unchanged: preview.differences.filter((difference) => difference.result === "skipped").length,
        suggestedOverwrite: preview.differences.filter((difference) => preview.resolutions[difference.id] === "overwrite").length,
        suggestedSkip: preview.differences.filter((difference) => preview.resolutions[difference.id] === "skip").length,
      },
    };
  }

  function compareOnce(input: DataAgentMessageInput) {
    const key = `${input.conversationId}:${input.userId}:${input.messageId}`;
    const cached = comparisonCache.get(key);
    if (cached) return cached;
    const operation = computeComparison(input).catch((error) => {
      comparisonCache.delete(key);
      throw error;
    });
    comparisonCache.set(key, operation);
    return operation;
  }

  return { route, suggestSchemaMappings, suggestValueResolutions, previewValues, executeSync, executePlan, compareOnce };
}

export type DataSyncService = ReturnType<typeof createDataSyncService>;
