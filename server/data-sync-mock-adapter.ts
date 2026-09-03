import jushuitanFixture from "../src/data/data-sync/jushuitan.json" with { type: "json" };
import wanzhenFixture from "../src/data/data-sync/wanzhen.json" with { type: "json" };
import yishanghuoFixture from "../src/data/data-sync/yishanghuo.json" with { type: "json" };
import {
  compareContents,
  fieldsFromAttributes,
  mappingId,
  normalizeSchemaMappings,
  schemaForContent,
  summarizeDifferences,
  validateResolutions,
} from "../src/services/data-sync-core.ts";
import type { DifferenceResolution, PlatformId, SchemaMappingSuggestion, SchemaMappings, SyncContent, SyncDifference } from "../src/types/data-sync.ts";

type DatabaseProduct = { spu: { id: string; attributes: Record<string, string | number> }; skus: Array<{ id: string; attributes: Record<string, string | number> }> };
type DatabaseFixture = { source: string; products: DatabaseProduct[] };
const fixtures = { wanzhen: wanzhenFixture, yishanghuo: yishanghuoFixture, jushuitan: jushuitanFixture } as unknown as Record<PlatformId, DatabaseFixture>;
const platformLabels: Record<PlatformId, string> = { wanzhen: "万阵", yishanghuo: "易尚货", jushuitan: "聚水潭" };
const fieldLabels: Record<string, string> = { category: "品类", material: "面料成分", fit: "修身指数", season: "上市季节", style: "风格", fitting_size: "试穿尺码", color: "颜色", size: "尺码", stock: "库存" };

export function platformLabel(platformId: PlatformId) { return platformLabels[platformId]; }

export function getMockContent(platformId: PlatformId, spuId: string): SyncContent {
  const product = fixtures[platformId].products.find((candidate) => candidate.spu.id === spuId);
  if (!product) throw new Error(`${platformLabel(platformId)} 中未找到 SPU ${spuId}`);
  return {
    spu: { id: product.spu.id, fields: fieldsFromAttributes(product.spu.id, product.spu.attributes, fieldLabels) },
    skus: product.skus.map((sku) => ({ id: sku.id, fields: fieldsFromAttributes(sku.id, sku.attributes, fieldLabels) })),
  };
}

export { mappingId, schemaForContent };

export function mappingsFromSuggestions(targetId: PlatformId, sourceSchema: ReturnType<typeof schemaForContent>, targetSchema: ReturnType<typeof schemaForContent>, suggestions: SchemaMappingSuggestion[]): SchemaMappings {
  return normalizeSchemaMappings(targetId, sourceSchema, targetSchema, suggestions);
}

export function compareMockValues(spuId: string, sourceId: PlatformId, targetId: PlatformId, schemaMappings: SchemaMappings): SyncDifference[] {
  return compareContents({ spuId, sourceId, sourceContent: getMockContent(sourceId, spuId), targetId, targetContent: getMockContent(targetId, spuId), schemaMappings });
}

export function executeMockSync(differences: SyncDifference[], resolutions: Record<string, DifferenceResolution>) {
  validateResolutions(differences, resolutions);
  return { executionId: `local-sync-${Date.now()}`, ...summarizeDifferences(differences, resolutions), executedAt: new Date().toISOString(), mode: "local-mock" as const };
}
