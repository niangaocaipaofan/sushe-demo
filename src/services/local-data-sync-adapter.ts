import differencesFixture from "../data/data-sync/differences.json";
import ecproFixture from "../data/data-sync/ecpro.json";
import jushuitanFixture from "../data/data-sync/jushuitan.json";
import localFilesFixture from "../data/data-sync/local-files.json";
import wanzhenFixture from "../data/data-sync/wanzhen.json";
import type {
  DataScopeId,
  DifferenceResolution,
  LocalSyncTask,
  PlatformId,
  SyncDataScope,
  SyncDifference,
  SyncPlatform,
} from "../types/data-sync";

const platformFixtures = [wanzhenFixture, ecproFixture, jushuitanFixture, localFilesFixture] as SyncPlatform[];

const scopeMeta: Array<Omit<SyncDataScope, "count">> = [
  { id: "product", label: "商品基础信息", description: "类目、品牌、属性、条码等" },
  { id: "sku", label: "SKU与库存", description: "SKU、库存、库存预警等" },
  { id: "price", label: "价格", description: "市场价、销售价、促销价等" },
  { id: "content", label: "标题与详情", description: "标题、卖点、详情描述等" },
  { id: "media", label: "图片与视频", description: "主图、SKU图、详情图、视频等" },
  { id: "attributes", label: "平台属性", description: "SPU/SKU编码、推广信息等" },
];

function filterDifferences(sourceIds: PlatformId[], targetIds: PlatformId[], scopeIds: DataScopeId[]) {
  return (differencesFixture as SyncDifference[]).filter((item) =>
    sourceIds.includes(item.sourcePlatform)
    && targetIds.includes(item.targetPlatform)
    && scopeIds.includes(item.scopeId));
}

export const localDataSyncAdapter = {
  async getPlatforms(): Promise<SyncPlatform[]> {
    return platformFixtures;
  },

  getScopes(sourceIds: PlatformId[]): SyncDataScope[] {
    return scopeMeta.map((scope) => ({
      ...scope,
      count: platformFixtures
        .filter((platform) => sourceIds.includes(platform.id))
        .reduce((sum, platform) => sum + platform.scopes[scope.id], 0),
    }));
  },

  preview(sourceIds: PlatformId[], targetIds: PlatformId[], scopeIds: DataScopeId[]): SyncDifference[] {
    return filterDifferences(sourceIds, targetIds, scopeIds);
  },

  async createTask(
    sourceIds: PlatformId[],
    targetIds: PlatformId[],
    scopeIds: DataScopeId[],
    resolutions: Record<string, DifferenceResolution>,
  ): Promise<LocalSyncTask> {
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    const differences = filterDifferences(sourceIds, targetIds, scopeIds);
    return {
      id: `local-sync-${Date.now()}`,
      createdAt: new Date().toISOString(),
      sourceIds,
      targetIds,
      scopeIds,
      differenceCount: differences.length,
      overwriteCount: differences.filter((difference) => resolutions[difference.id] === "overwrite").length,
      skippedCount: differences.filter((difference) => resolutions[difference.id] === "skip").length,
      resolutions,
      mode: "local-mock",
    };
  },
};
