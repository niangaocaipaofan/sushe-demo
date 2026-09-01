import { randomUUID } from "node:crypto";

import type {
  DifferenceResolution,
  PlatformId,
  SchemaMappingSuggestion,
  SchemaMappings,
  SyncDifference,
  SyncSchemaField,
  ValueMappingSuggestion,
} from "../src/types/data-sync.ts";
import {
  compareMockValues,
  executeMockSync,
  getMockContent,
  mappingId,
  mappingsFromSuggestions,
  platformLabel,
  schemaForContent,
} from "./data-sync-mock-adapter.ts";

export interface DataSyncMessageInput {
  conversationId: string;
  messageId: string;
  userId: string;
  message: string;
  context?: { spuId?: string };
}

type SessionStatus =
  | "collecting_route"
  | "waiting_for_schema_confirmation"
  | "waiting_for_value_confirmation"
  | "completed"
  | "cancelled";

interface DisplayTable {
  type: "schema_table" | "value_table" | "result";
  title: string;
  columns?: Array<{ key: string; label: string }>;
  rows?: Array<Record<string, string>>;
}

export interface DataSyncMessageResponse {
  sessionId: string;
  status: SessionStatus;
  message: string;
  display?: DisplayTable;
}

interface DataSyncSession {
  id: string;
  status: SessionStatus;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  spuId?: string;
  sourceId?: PlatformId;
  targetId?: PlatformId;
  sourceSchema?: SyncSchemaField[];
  targetSchema?: SyncSchemaField[];
  schemaMappings?: SchemaMappings;
  differences?: SyncDifference[];
  resolutions?: Record<string, DifferenceResolution>;
  lastResponse?: DataSyncMessageResponse;
}

type RunAgentStage = (stage: "route" | "schema" | "value", input: Record<string, unknown>) => Promise<unknown>;

const sessions = new Map<string, DataSyncSession>();
const responsesByMessage = new Map<string, DataSyncMessageResponse>();

function sessionKey(input: DataSyncMessageInput) {
  return `${input.conversationId}:${input.userId}`;
}

function messageKey(input: DataSyncMessageInput) {
  return `${sessionKey(input)}:${input.messageId}`;
}

function createSession(): DataSyncSession {
  return { id: `data-sync-${randomUUID()}`, status: "collecting_route", conversation: [] };
}

function isConfirmation(message: string) {
  return /^(ok|确认|继续|可以|好的|没问题)[！!。.\s]*$/i.test(message.trim());
}

function isCancellation(message: string) {
  return /^(取消|算了|停止|cancel)[！!。.\s]*$/i.test(message.trim());
}

function schemaResponse(session: DataSyncSession, message = "以下是字段映射建议。回复 OK 继续进行值对比。") : DataSyncMessageResponse {
  const { spuId, sourceId, targetId, sourceSchema = [], targetSchema = [], schemaMappings = {} } = session;
  const rows = sourceSchema.map((sourceField) => {
    const mapping = schemaMappings[mappingId(targetId!, sourceField.scope, sourceField.key)];
    const targetField = targetSchema.find((field) => field.scope === sourceField.scope && field.key === mapping?.targetFieldKey);
    return {
      scope: sourceField.scope,
      source: `${sourceField.label} · ${sourceField.key}`,
      target: mapping?.createTargetField
        ? `${sourceField.label} · ${mapping.targetFieldKey}（新建）`
        : `${targetField?.label ?? mapping?.targetFieldKey ?? "未映射"} · ${mapping?.targetFieldKey ?? "-"}`,
      result: mapping?.createTargetField ? "新建字段" : "已匹配",
    };
  });
  return {
    sessionId: session.id,
    status: "waiting_for_schema_confirmation",
    message,
    display: {
      type: "schema_table",
      title: `${spuId} · ${platformLabel(sourceId!)} → ${platformLabel(targetId!)} · 字段映射`,
      columns: [
        { key: "scope", label: "范围" },
        { key: "source", label: `${platformLabel(sourceId!)}字段` },
        { key: "target", label: `${platformLabel(targetId!)}字段` },
        { key: "result", label: "映射结果" },
      ],
      rows,
    },
  };
}

function valueResponse(session: DataSyncSession, message = "以下是值对比结果。回复 OK 执行同步。") : DataSyncMessageResponse {
  const { spuId, sourceId, targetId, differences = [], resolutions = {} } = session;
  return {
    sessionId: session.id,
    status: "waiting_for_value_confirmation",
    message,
    display: {
      type: "value_table",
      title: `${spuId} · ${platformLabel(sourceId!)} → ${platformLabel(targetId!)} · 值对比`,
      columns: [
        { key: "item", label: "数据项" },
        { key: "field", label: "字段" },
        { key: "sourceValue", label: `${platformLabel(sourceId!)}值` },
        { key: "targetValue", label: `${platformLabel(targetId!)}值` },
        { key: "action", label: "处理方式" },
      ],
      rows: differences.map((difference) => ({
        item: difference.entityId,
        field: difference.sourceFieldLabel,
        sourceValue: difference.sourceValue,
        targetValue: difference.targetValue,
        action: difference.result === "skipped" || resolutions[difference.id] === "skip" ? "跳过/保留" : "覆盖/新增",
      })),
    },
  };
}

function saveResponse(session: DataSyncSession, input: DataSyncMessageInput, response: DataSyncMessageResponse) {
  session.lastResponse = response;
  responsesByMessage.set(messageKey(input), response);
  return response;
}

export function createDataSyncMessageHandler(runAgentStage: RunAgentStage) {
  return async function handleDataSyncMessage(input: DataSyncMessageInput): Promise<DataSyncMessageResponse> {
    const cached = responsesByMessage.get(messageKey(input));
    if (cached) return cached;

    const key = sessionKey(input);
    let session = sessions.get(key) ?? createSession();
    sessions.set(key, session);

    if (session.status === "completed" || session.status === "cancelled") {
      if (isConfirmation(input.message)) {
        return saveResponse(session, input, session.lastResponse ?? {
          sessionId: session.id,
          status: session.status,
          message: session.status === "completed" ? "当前同步任务已经完成。" : "当前同步任务已经取消。",
        });
      }
      session = createSession();
      sessions.set(key, session);
    }

    if (isCancellation(input.message)) {
      session.status = "cancelled";
      return saveResponse(session, input, { sessionId: session.id, status: "cancelled", message: "已取消本次数据同步任务。" });
    }

    if (session.status === "collecting_route") {
      session.conversation.push({ role: "user", content: input.message });
      const routeResult = await runAgentStage("route", {
        conversation: session.conversation,
        hasFile: false,
        ...(input.context?.spuId ? { currentPageSpuId: input.context.spuId } : {}),
      }) as {
        reply: string;
        action: null | { spuId: string; sourceType: "platform" | "file"; sourceId: PlatformId | null; targetId: PlatformId };
      };

      if (!routeResult.action) {
        session.conversation.push({ role: "assistant", content: routeResult.reply });
        return saveResponse(session, input, { sessionId: session.id, status: "collecting_route", message: routeResult.reply });
      }
      if (routeResult.action.sourceType !== "platform" || !routeResult.action.sourceId) {
        return saveResponse(session, input, { sessionId: session.id, status: "collecting_route", message: "当前入口暂不支持文件来源，请说明来源平台。" });
      }

      const { spuId, sourceId, targetId } = routeResult.action;
      const sourceContent = getMockContent(sourceId, spuId);
      const targetContent = getMockContent(targetId, spuId);
      const sourceSchema = schemaForContent(sourceContent);
      const targetSchema = schemaForContent(targetContent);
      const schemaResult = await runAgentStage("schema", {
        sourceId,
        targetId,
        sourceSchema,
        targetSchema,
        sourceContent,
        targetContent,
      }) as { mappings: SchemaMappingSuggestion[] };

      Object.assign(session, {
        status: "waiting_for_schema_confirmation" as const,
        spuId,
        sourceId,
        targetId,
        sourceSchema,
        targetSchema,
        schemaMappings: mappingsFromSuggestions(targetId, sourceSchema, targetSchema, schemaResult.mappings),
      });
      return saveResponse(session, input, schemaResponse(session));
    }

    if (session.status === "waiting_for_schema_confirmation") {
      if (!isConfirmation(input.message)) {
        return saveResponse(session, input, schemaResponse(session, "当前等待确认字段映射。请回复 OK 继续，或回复“取消”。"));
      }
      const differences = compareMockValues(session.spuId!, session.sourceId!, session.targetId!, session.schemaMappings!);
      const pendingDifferences = differences.filter((difference) => difference.result !== "skipped");
      const valueResult = pendingDifferences.length
        ? await runAgentStage("value", {
            sourceId: session.sourceId,
            targetId: session.targetId,
            schemaMappings: session.schemaMappings,
            differences: pendingDifferences,
          }) as { resolutions: ValueMappingSuggestion[] }
        : { resolutions: [] as ValueMappingSuggestion[] };
      const suggestions = new Map(valueResult.resolutions.map((resolution) => [resolution.differenceId, resolution.resolution]));
      const missing = pendingDifferences.filter((difference) => !suggestions.has(difference.id));
      if (missing.length) throw new Error(`Value Mapping 缺少 ${missing.length} 条差异处理建议`);
      const resolutions = Object.fromEntries(differences.map((difference) => [
        difference.id,
        difference.result === "skipped" ? "skip" : suggestions.get(difference.id)!,
      ])) as Record<string, DifferenceResolution>;
      Object.assign(session, { status: "waiting_for_value_confirmation" as const, differences, resolutions });
      return saveResponse(session, input, valueResponse(session));
    }

    if (!isConfirmation(input.message)) {
      return saveResponse(session, input, valueResponse(session, "当前等待确认值对比结果。请回复 OK 执行同步，或回复“取消”。"));
    }

    const result = executeMockSync(session.differences!, session.resolutions!);
    session.status = "completed";
    return saveResponse(session, input, {
      sessionId: session.id,
      status: "completed",
      message: `同步完成：${session.spuId} 已从${platformLabel(session.sourceId!)}同步至${platformLabel(session.targetId!)}。`,
      display: {
        type: "result",
        title: "同步结果（local-mock）",
        rows: [{
          executionId: result.executionId,
          写入: String(result.overwriteCount),
          跳过: String(result.skippedCount),
          处理总数: String(result.differenceCount),
          执行时间: result.executedAt,
        }],
      },
    });
  };
}
