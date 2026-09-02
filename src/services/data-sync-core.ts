import type {
  DifferenceResolution,
  PlatformId,
  SchemaMappingSuggestion,
  SchemaMappings,
  SyncContent,
  SyncDifference,
  SyncField,
  SyncFieldScope,
  SyncSchemaField,
  SyncSourceId,
} from "../types/data-sync";

export function fieldsFromAttributes(entityId: string, attributes: Record<string, string | number>, labels: Record<string, string>): SyncField[] {
  return Object.entries(attributes).map(([key, value]) => ({ id: `${entityId}:${key}`, key, label: labels[key] ?? key, value: String(value) }));
}

export function comparableFields(content: SyncContent) {
  return [
    ...content.spu.fields.map((field) => ({ ...field, scope: "SPU" as const, entityId: content.spu.id })),
    ...content.skus.flatMap((sku) => sku.fields.map((field) => ({ ...field, scope: "SKU" as const, entityId: sku.id }))),
  ];
}

export function schemaForContent(content: SyncContent): SyncSchemaField[] {
  const uniqueFields = (scope: SyncFieldScope, fields: SyncField[]) => Array.from(
    new Map(fields.map((field) => [field.key, { key: field.key, label: field.label, scope }])).values(),
  );
  return [...uniqueFields("SPU", content.spu.fields), ...uniqueFields("SKU", content.skus.flatMap((sku) => sku.fields))];
}

export function mappingId(targetId: PlatformId, scope: SyncFieldScope, sourceFieldKey: string) {
  return `${targetId}:${scope}:${sourceFieldKey}`;
}

export function normalizeSchemaMappings(targetId: PlatformId, sourceSchema: SyncSchemaField[], targetSchema: SyncSchemaField[], suggestions: SchemaMappingSuggestion[]): SchemaMappings {
  return Object.fromEntries(sourceSchema.map((sourceField) => {
    const suggestion = suggestions.find((candidate) => candidate.sourceScope === sourceField.scope && candidate.sourceFieldKey === sourceField.key);
    const validExistingTarget = suggestion && !suggestion.createTargetField
      && targetSchema.some((field) => field.scope === sourceField.scope && field.key === suggestion.targetFieldKey);
    const validNewTarget = suggestion?.createTargetField && suggestion.targetFieldKey === sourceField.key;
    const exactTarget = targetSchema.find((field) => field.scope === sourceField.scope && field.key === sourceField.key);
    const mapping = suggestion && (validExistingTarget || validNewTarget)
      ? { targetFieldKey: suggestion.targetFieldKey, createTargetField: suggestion.createTargetField }
      : { targetFieldKey: exactTarget?.key ?? sourceField.key, createTargetField: !exactTarget };
    return [mappingId(targetId, sourceField.scope, sourceField.key), mapping];
  }));
}

export function compareContents(input: {
  spuId: string;
  sourceId: SyncSourceId;
  sourceContent: SyncContent;
  targetId: PlatformId;
  targetContent: SyncContent;
  schemaMappings: SchemaMappings;
  selectedMappingIds?: string[];
}): SyncDifference[] {
  const { spuId, sourceId, sourceContent, targetId, targetContent, schemaMappings, selectedMappingIds } = input;
  if (sourceContent.spu.id !== spuId) throw new Error(`来源数据 SPU ${sourceContent.spu.id} 与任务 SPU ${spuId} 不一致`);
  const selected = selectedMappingIds ? new Set(selectedMappingIds) : null;
  const targetFields = comparableFields(targetContent);
  const targetSchema = schemaForContent(targetContent);
  return comparableFields(sourceContent)
    .filter((field) => !selected || selected.has(mappingId(targetId, field.scope, field.key)))
    .map((field): SyncDifference => {
      const mapping = schemaMappings[mappingId(targetId, field.scope, field.key)];
      if (!mapping) throw new Error(`缺少字段映射：${targetId} · ${field.scope} · ${field.key}`);
      const targetField = targetFields.find((candidate) => candidate.entityId === field.entityId && candidate.key === mapping.targetFieldKey);
      const targetSchemaField = targetSchema.find((candidate) => candidate.scope === field.scope && candidate.key === mapping.targetFieldKey);
      const targetValue = targetField?.value;
      return {
        id: `${sourceId}:${targetId}:${field.entityId}:${field.key}`,
        dataItem: `${field.scope} · ${field.entityId} · ${field.label}`,
        scope: field.scope,
        entityId: field.entityId,
        sourcePlatform: sourceId,
        targetPlatform: targetId,
        sourceValue: field.value,
        targetValue: targetValue ?? "不存在",
        sourceFieldKey: field.key,
        sourceFieldLabel: field.label,
        targetFieldLabel: mapping.createTargetField ? `${field.label}（新建）` : targetSchemaField?.label ?? mapping.targetFieldKey,
        result: targetValue == null ? "added" : targetValue === field.value ? "skipped" : "pending",
      };
    });
}

export function validateResolutions(differences: SyncDifference[], resolutions: Record<string, DifferenceResolution>) {
  const unresolved = differences.filter((difference) => difference.result !== "skipped" && !resolutions[difference.id]);
  if (unresolved.length) throw new Error(`仍有 ${unresolved.length} 条值差异未处理`);
}

export function summarizeDifferences(differences: SyncDifference[], resolutions: Record<string, DifferenceResolution>) {
  return {
    differenceCount: differences.length,
    overwriteCount: differences.filter((difference) => resolutions[difference.id] === "overwrite").length,
    skippedCount: differences.filter((difference) => difference.result === "skipped" || resolutions[difference.id] === "skip").length,
  };
}
