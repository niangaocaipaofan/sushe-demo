import type {
  DifferenceResolution,
  LocalSyncTask,
  PlatformId,
  SchemaMappingSuggestion,
  SchemaMappings,
  SyncContent,
  SyncDifference,
  SyncSourceId,
  ValueMappingSuggestion,
} from "../types/data-sync";

export interface SyncConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SyncRouteProposal {
  reply: string;
  action: null | {
    spuId: string;
    sourceType: "platform" | "file";
    sourceId: PlatformId | null;
    targetId: PlatformId;
  };
}

interface SchemaProposalInput {
  sourceId: SyncSourceId;
  targetId: PlatformId;
  sourceContent: SyncContent;
}

interface ValueProposalInput {
  sourceId: SyncSourceId;
  targetId: PlatformId;
  schemaMappings: SchemaMappings;
  differences: SyncDifference[];
}

async function callDataSyncAgent<T>(body: unknown, path = "/api/data-sync-agent"): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === "object" && "error" in payload && payload.error
      ? payload.error
      : "数据协同专员暂时不可用");
  }
  return payload as T;
}

export async function proposeSchemaMappings(input: SchemaProposalInput): Promise<SchemaMappingSuggestion[]> {
  const result = await callDataSyncAgent<{ mappings: SchemaMappingSuggestion[] }>({
    spuId: input.sourceContent.spu.id,
    sourceId: input.sourceId,
    targetId: input.targetId,
    ...(input.sourceId === "uploaded-file" ? { sourceContent: input.sourceContent } : {}),
  }, "/api/data-sync/schema");
  return result.mappings;
}

export async function proposeValueMappings(input: ValueProposalInput): Promise<ValueMappingSuggestion[]> {
  const result = await callDataSyncAgent<{ resolutions: ValueMappingSuggestion[] }>(input, "/api/data-sync/value-suggestions");
  return result.resolutions;
}

export async function executeDataSync(input: {
  spuId: string;
  sourceId: SyncSourceId;
  targetId: PlatformId;
  schemaMappings: SchemaMappings;
  selectedMappingIds: string[];
  resolutions: Record<string, DifferenceResolution>;
  sourceContent?: SyncContent;
}): Promise<LocalSyncTask> {
  return callDataSyncAgent<LocalSyncTask>(input, "/api/data-sync/execute");
}

export async function proposeSyncRoute(conversation: SyncConversationMessage[], fileName?: string, currentPageSpuId?: string): Promise<SyncRouteProposal> {
  return callDataSyncAgent<SyncRouteProposal>({
    stage: "route",
    conversation,
    hasFile: Boolean(fileName),
    fileName,
    currentPageSpuId,
  });
}
