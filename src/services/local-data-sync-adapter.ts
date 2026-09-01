import wanzhenFixture from "../data/data-sync/wanzhen.json";
import yishanghuoFixture from "../data/data-sync/yishanghuo.json";
import jushuitanFixture from "../data/data-sync/jushuitan.json";
import type { DifferenceResolution, LocalSyncTask, PlatformId, SchemaMappings, SyncContent, SyncDifference, SyncField, SyncFieldScope, SyncPlatform, SyncSchemaField, SyncSourceId } from "../types/data-sync";

type DatabaseProduct = { spu: { id: string; attributes: Record<string, string | number> }; skus: Array<{ id: string; attributes: Record<string, string | number> }>; };
type DatabaseFixture = { source: string; products: DatabaseProduct[] };
const fixtures = { wanzhen: wanzhenFixture, yishanghuo: yishanghuoFixture, jushuitan: jushuitanFixture } as unknown as Record<PlatformId, DatabaseFixture>;
const platforms: SyncPlatform[] = [
  { id: "wanzhen", label: "万阵", mode: "local-mock" }, { id: "yishanghuo", label: "易尚货", mode: "local-mock" }, { id: "jushuitan", label: "聚水潭", mode: "local-mock" },
];
const labels: Record<string, string> = { category: "品类", material: "面料成分", fit: "修身指数", season: "上市季节", style: "风格", fitting_size: "试穿尺码", color: "颜色", size: "尺码", stock: "库存" };

function fieldsFor(entityId: string, attributes: Record<string, string | number>): SyncField[] {
  return Object.entries(attributes).map(([key, value]) => ({ id: `${entityId}:${key}`, key, label: labels[key] ?? key, value: String(value) }));
}
function contentFor(platformId: PlatformId, spuId: string): SyncContent {
  const product = fixtures[platformId].products.find((candidate) => candidate.spu.id === spuId);
  if (!product) throw new Error(`${platforms.find((platform) => platform.id === platformId)?.label ?? platformId} 中未找到 SPU ${spuId}`);
  return { spu: { id: product.spu.id, fields: fieldsFor(product.spu.id, product.spu.attributes) }, skus: product.skus.map((sku) => ({ id: sku.id, fields: fieldsFor(sku.id, sku.attributes) })) };
}
function comparableFields(content: SyncContent) {
  return [...content.spu.fields.map((field) => ({ ...field, scope: "SPU" as const, entityId: content.spu.id })), ...content.skus.flatMap((sku) => sku.fields.map((field) => ({ ...field, scope: "SKU" as const, entityId: sku.id })) )];
}

function schemaForContent(content: SyncContent): SyncSchemaField[] {
  const byScope = (scope: SyncFieldScope, fields: SyncField[]) => Array.from(
    new Map(fields.map((field) => [field.key, { key: field.key, label: field.label, scope }])).values(),
  );
  return [
    ...byScope("SPU", content.spu.fields),
    ...byScope("SKU", content.skus.flatMap((sku) => sku.fields)),
  ];
}

function schemaFor(platformId: PlatformId, spuId: string): SyncSchemaField[] { return schemaForContent(contentFor(platformId, spuId)); }

function mappingId(targetId: PlatformId, scope: SyncFieldScope, sourceFieldKey: string) {
  return `${targetId}:${scope}:${sourceFieldKey}`;
}

function differencesForContent(spuId: string, sourceId: SyncSourceId, sourceContent: SyncContent, targetIds: PlatformId[], schemaMappings: SchemaMappings, selectedMappingIds?: string[]) {
  if (sourceContent.spu.id !== spuId) throw new Error(`来源数据 SPU ${sourceContent.spu.id} 与任务 SPU ${spuId} 不一致`);
  const sourceFields = comparableFields(sourceContent);
  const selected = selectedMappingIds ? new Set(selectedMappingIds) : null;
  return targetIds.flatMap((targetId) => {
    const targetFields = comparableFields(contentFor(targetId, spuId));
    return sourceFields.filter((field) => !selected || selected.has(mappingId(targetId, field.scope, field.key))).map((field): SyncDifference => {
      const mapping = schemaMappings[mappingId(targetId, field.scope, field.key)];
      if (!mapping) throw new Error(`缺少字段映射：${targetId} · ${field.scope} · ${field.key}`);
      const targetField = targetFields.find((candidate) => candidate.entityId === field.entityId && candidate.key === mapping.targetFieldKey);
      const targetSchemaField = schemaFor(targetId, spuId).find((candidate) => candidate.scope === field.scope && candidate.key === mapping.targetFieldKey);
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
  });
}

function differencesFor(spuId: string, sourceId: PlatformId, targetIds: PlatformId[], schemaMappings: SchemaMappings, selectedMappingIds?: string[]) {
  return differencesForContent(spuId, sourceId, contentFor(sourceId, spuId), targetIds, schemaMappings, selectedMappingIds);
}

export const localDataSyncAdapter = {
  async getPlatforms(): Promise<SyncPlatform[]> { return platforms; },
  getContent(sourceId: PlatformId, spuId: string): SyncContent { return contentFor(sourceId, spuId); },
  getSchema(platformId: PlatformId, spuId: string): SyncSchemaField[] { return schemaFor(platformId, spuId); },
  getSchemaForContent(content: SyncContent): SyncSchemaField[] { return schemaForContent(content); },
  mappingId,
  preview(spuId: string, sourceId: PlatformId, targetIds: PlatformId[], schemaMappings: SchemaMappings, selectedMappingIds?: string[]): SyncDifference[] { return differencesFor(spuId, sourceId, targetIds, schemaMappings, selectedMappingIds); },
  previewContent(spuId: string, sourceId: SyncSourceId, sourceContent: SyncContent, targetIds: PlatformId[], schemaMappings: SchemaMappings, selectedMappingIds?: string[]): SyncDifference[] { return differencesForContent(spuId, sourceId, sourceContent, targetIds, schemaMappings, selectedMappingIds); },
  async createTask(spuId: string, sourceId: SyncSourceId, targetIds: PlatformId[], resolutions: Record<string, DifferenceResolution>, schemaMappings: SchemaMappings, selectedMappingIds: string[], sourceContent?: SyncContent): Promise<LocalSyncTask> {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    const differences = sourceContent
      ? differencesForContent(spuId, sourceId, sourceContent, targetIds, schemaMappings, selectedMappingIds)
      : differencesFor(spuId, sourceId as PlatformId, targetIds, schemaMappings, selectedMappingIds);
    return { id: `local-sync-${Date.now()}`, createdAt: new Date().toISOString(), spuId, sourceId, targetIds, differenceCount: differences.length, overwriteCount: differences.filter((difference) => resolutions[difference.id] === "overwrite").length, skippedCount: differences.filter((difference) => resolutions[difference.id] === "skip").length, resolutions, schemaMappings, selectedMappingIds, mode: "local-mock" };
  },
};
