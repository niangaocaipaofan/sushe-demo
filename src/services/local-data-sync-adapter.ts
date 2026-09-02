import wanzhenFixture from "../data/data-sync/wanzhen.json";
import yishanghuoFixture from "../data/data-sync/yishanghuo.json";
import jushuitanFixture from "../data/data-sync/jushuitan.json";
import type { PlatformId, SchemaMappings, SyncContent, SyncPlatform, SyncSourceId } from "../types/data-sync";
import { compareContents, fieldsFromAttributes, mappingId, schemaForContent } from "./data-sync-core";

type DatabaseProduct = { spu: { id: string; attributes: Record<string, string | number> }; skus: Array<{ id: string; attributes: Record<string, string | number> }> };
type DatabaseFixture = { source: string; products: DatabaseProduct[] };
const fixtures = { wanzhen: wanzhenFixture, yishanghuo: yishanghuoFixture, jushuitan: jushuitanFixture } as unknown as Record<PlatformId, DatabaseFixture>;
const platforms: SyncPlatform[] = [
  { id: "wanzhen", label: "万阵", mode: "local-mock" },
  { id: "yishanghuo", label: "易尚货", mode: "local-mock" },
  { id: "jushuitan", label: "聚水潭", mode: "local-mock" },
];
const labels: Record<string, string> = { category: "品类", material: "面料成分", fit: "修身指数", season: "上市季节", style: "风格", fitting_size: "试穿尺码", color: "颜色", size: "尺码", stock: "库存" };

function contentFor(platformId: PlatformId, spuId: string): SyncContent {
  const product = fixtures[platformId].products.find((candidate) => candidate.spu.id === spuId);
  if (!product) throw new Error(`${platforms.find((platform) => platform.id === platformId)?.label ?? platformId} 中未找到 SPU ${spuId}`);
  return {
    spu: { id: product.spu.id, fields: fieldsFromAttributes(product.spu.id, product.spu.attributes, labels) },
    skus: product.skus.map((sku) => ({ id: sku.id, fields: fieldsFromAttributes(sku.id, sku.attributes, labels) })),
  };
}

function preview(spuId: string, sourceId: SyncSourceId, sourceContent: SyncContent, targetIds: PlatformId[], schemaMappings: SchemaMappings, selectedMappingIds?: string[]) {
  return targetIds.flatMap((targetId) => compareContents({ spuId, sourceId, sourceContent, targetId, targetContent: contentFor(targetId, spuId), schemaMappings, selectedMappingIds }));
}

export const localDataSyncAdapter = {
  async getPlatforms(): Promise<SyncPlatform[]> { return platforms; },
  getContent(sourceId: PlatformId, spuId: string): SyncContent { return contentFor(sourceId, spuId); },
  getSchema(platformId: PlatformId, spuId: string) { return schemaForContent(contentFor(platformId, spuId)); },
  getSchemaForContent: schemaForContent,
  mappingId,
  preview(spuId: string, sourceId: PlatformId, targetIds: PlatformId[], schemaMappings: SchemaMappings, selectedMappingIds?: string[]) {
    return preview(spuId, sourceId, contentFor(sourceId, spuId), targetIds, schemaMappings, selectedMappingIds);
  },
  previewContent(spuId: string, sourceId: SyncSourceId, sourceContent: SyncContent, targetIds: PlatformId[], schemaMappings: SchemaMappings, selectedMappingIds?: string[]) {
    return preview(spuId, sourceId, sourceContent, targetIds, schemaMappings, selectedMappingIds);
  },
};
