export type PlatformId = "wanzhen" | "yishanghuo" | "jushuitan";
export type SyncSourceId = PlatformId | "uploaded-file";

export type DifferenceResult = "added" | "pending" | "skipped";

export type DifferenceResolution = "overwrite" | "skip";

export interface SyncPlatform {
  id: PlatformId;
  label: string;
  mode: "local-mock";
}

export interface SyncField {
  id: string;
  key: string;
  label: string;
  value: string;
}

export interface SyncSpu { id: string; fields: SyncField[]; }
export interface SyncSku { id: string; fields: SyncField[]; }
export interface SyncContent { spu: SyncSpu; skus: SyncSku[]; }

export interface UploadedSyncSource {
  id: string;
  label: string;
  content: SyncContent;
}

export type SyncFieldScope = "SPU" | "SKU";

export interface SyncSchemaField {
  key: string;
  label: string;
  scope: SyncFieldScope;
}

export interface SyncSchemaMapping {
  targetFieldKey: string;
  createTargetField: boolean;
}

export type SchemaMappings = Record<string, SyncSchemaMapping>;

export interface SchemaMappingSuggestion extends SyncSchemaMapping {
  sourceFieldKey: string;
  sourceScope: SyncFieldScope;
}

export interface ValueMappingSuggestion {
  differenceId: string;
  resolution: DifferenceResolution;
}

export interface SyncDifference {
  id: string;
  dataItem: string;
  scope: SyncFieldScope;
  entityId: string;
  sourcePlatform: SyncSourceId;
  targetPlatform: PlatformId;
  sourceValue: string;
  targetValue: string;
  sourceFieldKey: string;
  sourceFieldLabel: string;
  targetFieldLabel: string;
  result: DifferenceResult;
}

export interface LocalSyncTask {
  id: string;
  createdAt: string;
  spuId: string;
  sourceId: SyncSourceId;
  targetIds: PlatformId[];
  differenceCount: number;
  overwriteCount: number;
  skippedCount: number;
  resolutions: Record<string, DifferenceResolution>;
  schemaMappings: SchemaMappings;
  selectedMappingIds: string[];
  mode: "local-mock";
}
