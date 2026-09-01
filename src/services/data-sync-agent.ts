import type {
  PlatformId,
  SchemaMappingSuggestion,
  SchemaMappings,
  SyncContent,
  SyncDifference,
  SyncSchemaField,
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
  sourceSchema: SyncSchemaField[];
  targetSchema: SyncSchemaField[];
  sourceContent: SyncContent;
  targetContent: SyncContent;
}

interface ValueProposalInput {
  sourceId: SyncSourceId;
  targetId: PlatformId;
  schemaMappings: SchemaMappings;
  differences: SyncDifference[];
}

async function callDataSyncAgent<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/data-sync-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === "object" && "error" in payload && payload.error
      ? payload.error
      : "数据同步 Agent 暂时不可用");
  }
  return payload as T;
}

export async function proposeSchemaMappings(input: SchemaProposalInput): Promise<SchemaMappingSuggestion[]> {
  const result = await callDataSyncAgent<{ mappings: SchemaMappingSuggestion[] }>({ stage: "schema", ...input });
  return result.mappings;
}

export async function proposeValueMappings(input: ValueProposalInput): Promise<ValueMappingSuggestion[]> {
  const result = await callDataSyncAgent<{ resolutions: ValueMappingSuggestion[] }>({ stage: "value", ...input });
  return result.resolutions;
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
