import jushuitanFixture from "../src/data/data-sync/jushuitan.json" with { type: "json" };
import wanzhenFixture from "../src/data/data-sync/wanzhen.json" with { type: "json" };
import yishanghuoFixture from "../src/data/data-sync/yishanghuo.json" with { type: "json" };
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
} from "../src/types/data-sync.ts";

type DatabaseProduct = {
  spu: { id: string; attributes: Record<string, string | number> };
  skus: Array<{ id: string; attributes: Record<string, string | number> }>;
};
type DatabaseFixture = { source: string; products: DatabaseProduct[] };

const fixtures = {
  wanzhen: wanzhenFixture,
  yishanghuo: yishanghuoFixture,
  jushuitan: jushuitanFixture,
} as unknown as Record<PlatformId, DatabaseFixture>;

const platformLabels: Record<PlatformId, string> = {
  wanzhen: "万阵",
  yishanghuo: "易尚货",
  jushuitan: "聚水潭",
};

const fieldLabels: Record<string, string> = {
  category: "品类",
  material: "面料成分",
  fit: "修身指数",
  season: "上市季节",
  style: "风格",
  fitting_size: "试穿尺码",
  color: "颜色",
  size: "尺码",
  stock: "库存",
};

function fieldsFor(entityId: string, attributes: Record<string, string | number>): SyncField[] {
  return Object.entries(attributes).map(([key, value]) => ({
    id: `${entityId}:${key}`,
    key,
    label: fieldLabels[key] ?? key,
    value: String(value),
  }));
}

function comparableFields(content: SyncContent) {
  return [
    ...content.spu.fields.map((field) => ({ ...field, scope: "SPU" as const, entityId: content.spu.id })),
    ...content.skus.flatMap((sku) => sku.fields.map((field) => ({ ...field, scope: "SKU" as const, entityId: sku.id }))),
  ];
}

export function platformLabel(platformId: PlatformId) {
  return platformLabels[platformId];
}

export function getMockContent(platformId: PlatformId, spuId: string): SyncContent {
  const product = fixtures[platformId].products.find((candidate) => candidate.spu.id === spuId);
  if (!product) throw new Error(`${platformLabel(platformId)} 中未找到 SPU ${spuId}`);
  return {
    spu: { id: product.spu.id, fields: fieldsFor(product.spu.id, product.spu.attributes) },
    skus: product.skus.map((sku) => ({ id: sku.id, fields: fieldsFor(sku.id, sku.attributes) })),
  };
}

export function schemaForContent(content: SyncContent): SyncSchemaField[] {
  const uniqueFields = (scope: SyncFieldScope, fields: SyncField[]) => Array.from(
    new Map(fields.map((field) => [field.key, { key: field.key, label: field.label, scope }])).values(),
  );
  return [
    ...uniqueFields("SPU", content.spu.fields),
    ...uniqueFields("SKU", content.skus.flatMap((sku) => sku.fields)),
  ];
}

export function mappingId(targetId: PlatformId, scope: SyncFieldScope, sourceFieldKey: string) {
  return `${targetId}:${scope}:${sourceFieldKey}`;
}

export function mappingsFromSuggestions(
  targetId: PlatformId,
  sourceSchema: SyncSchemaField[],
  targetSchema: SyncSchemaField[],
  suggestions: SchemaMappingSuggestion[],
): SchemaMappings {
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

export function compareMockValues(
  spuId: string,
  sourceId: PlatformId,
  targetId: PlatformId,
  schemaMappings: SchemaMappings,
): SyncDifference[] {
  const sourceContent = getMockContent(sourceId, spuId);
  const targetContent = getMockContent(targetId, spuId);
  const targetFields = comparableFields(targetContent);
  const targetSchema = schemaForContent(targetContent);

  return comparableFields(sourceContent).map((field): SyncDifference => {
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

export function executeMockSync(differences: SyncDifference[], resolutions: Record<string, DifferenceResolution>) {
  const unresolved = differences.filter((difference) => difference.result !== "skipped" && !resolutions[difference.id]);
  if (unresolved.length) throw new Error(`仍有 ${unresolved.length} 条值差异未处理`);
  return {
    executionId: `local-sync-${Date.now()}`,
    differenceCount: differences.length,
    overwriteCount: differences.filter((difference) => resolutions[difference.id] === "overwrite").length,
    skippedCount: differences.filter((difference) => difference.result === "skipped" || resolutions[difference.id] === "skip").length,
    executedAt: new Date().toISOString(),
    mode: "local-mock" as const,
  };
}
