export type PlatformId = "wanzhen" | "ecpro" | "jushuitan" | "local";

export type DataScopeId = "product" | "sku" | "price" | "content" | "media" | "attributes";

export type DifferenceResult = "added" | "updated" | "conflict" | "skipped";

export type DifferenceResolution = "overwrite" | "skip";

export interface SyncPlatform {
  id: PlatformId;
  label: string;
  mode: "local-mock" | "local-files";
  recordCount: number;
  updatedAt: string;
  scopes: Record<DataScopeId, number>;
}

export interface SyncDataScope {
  id: DataScopeId;
  label: string;
  description: string;
  count: number;
}

export interface SyncDifference {
  id: string;
  scopeId: DataScopeId;
  dataItem: string;
  sourcePlatform: PlatformId;
  targetPlatform: PlatformId;
  sourceValue: string;
  targetValue: string;
  result: DifferenceResult;
}

export interface LocalSyncTask {
  id: string;
  createdAt: string;
  sourceIds: PlatformId[];
  targetIds: PlatformId[];
  scopeIds: DataScopeId[];
  differenceCount: number;
  overwriteCount: number;
  skippedCount: number;
  resolutions: Record<string, DifferenceResolution>;
  mode: "local-mock";
}
