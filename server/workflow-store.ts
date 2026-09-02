import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { resolveWorkflowInstance, productWorkflows, type ProductWorkflow, type WorkflowStatus } from "../src/data/workflows.ts";
import { dagTemplates } from "../src/data/templates/index.ts";

export interface StoredWorkflow {
  version: number;
  workflow: ProductWorkflow;
}

interface WorkflowStore {
  workflows: StoredWorkflow[];
}

const workflowStorePath = resolve(process.env.WORKFLOW_STORE_PATH ?? ".runtime/workflows.json");

export interface CreateWorkflowInput {
  workflowId: string;
  templateId: string;
  spu: string;
  name: string;
}

export interface UpdateWorkflowNodeMetadataInput {
  owner?: string[] | null;
  plannedStart?: string | null;
  plannedCompletion?: string | null;
  sop?: string;
}

function createSeedStore(): WorkflowStore {
  return { workflows: productWorkflows.map((workflow) => ({ version: 1, workflow: structuredClone(workflow) })) };
}

/**
 * Tabs are defined by the DAG template, not by a workflow snapshot. This also
 * removes the obsolete tab state/configuration fields from older local stores.
 */
function hydrateTemplateTabs(store: WorkflowStore): WorkflowStore {
  return {
    workflows: store.workflows.map((record) => {
      const template = dagTemplates.find((item) => item.id === record.workflow.dagTemplateId);
      if (!template) return record;
      const templatesByNodeId = new Map(template.nodes.map((node) => [node.id, node]));
      return {
        ...record,
        workflow: {
          ...record.workflow,
          nodes: record.workflow.nodes.map((node) => ({
            ...node,
            // Older local runtime files predate SOP; initialize them from their template once.
            sop: typeof node.sop === "string" ? node.sop : templatesByNodeId.get(node.templateId)?.sop ?? "",
            tabs: structuredClone(templatesByNodeId.get(node.templateId)?.tabs ?? []),
          })),
        },
      };
    }),
  };
}

async function readStore(): Promise<WorkflowStore> {
  try {
    return hydrateTemplateTabs(JSON.parse(await readFile(workflowStorePath, "utf8")) as WorkflowStore);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return hydrateTemplateTabs(createSeedStore());
    throw error;
  }
}

async function saveStore(store: WorkflowStore) {
  await mkdir(dirname(workflowStorePath), { recursive: true });
  const temporaryPath = `${workflowStorePath}.${randomUUID()}.tmp`;
  const persistentStore = {
    workflows: store.workflows.map((record) => ({
      ...record,
      workflow: {
        ...record.workflow,
        // Tab definitions belong exclusively to the DAG template.
        nodes: record.workflow.nodes.map(({ tabs: _tabs, ...node }) => node),
      },
    })),
  };
  await writeFile(temporaryPath, `${JSON.stringify(persistentStore, null, 2)}\n`, "utf8");
  await rename(temporaryPath, workflowStorePath);
}

export async function getStoredWorkflow(workflowId: string): Promise<StoredWorkflow | undefined> {
  const store = await readStore();
  const record = store.workflows.find((item) => item.workflow.id === workflowId);
  return record && structuredClone(record);
}

export async function listStoredWorkflows(): Promise<ProductWorkflow[]> {
  const store = await readStore();
  return structuredClone(store.workflows.map((record) => record.workflow));
}

export async function listStoredWorkflowVersions(): Promise<Record<string, number>> {
  const store = await readStore();
  return Object.fromEntries(store.workflows.map((record) => [record.workflow.id, record.version]));
}

function assertExpectedVersion(record: StoredWorkflow, expectedVersion?: number) {
  if (expectedVersion !== undefined && record.version !== expectedVersion) {
    throw new Error(`workflow 版本已变化：当前为 ${record.version}，请求基于 ${expectedVersion}`);
  }
}

function unlockReadyNodes(record: StoredWorkflow) {
  const completedNodeIds = new Set(
    record.workflow.nodes.filter((node) => node.status === "completed").map((node) => node.id),
  );
  record.workflow.nodes.forEach((node) => {
    if (node.status !== "pending") return;
    const dependencies = record.workflow.edges.filter((edge) => edge.target === node.id);
    if (dependencies.length > 0 && dependencies.every((edge) => completedNodeIds.has(edge.source))) node.status = "running";
  });
}

export async function createStoredWorkflow(input: CreateWorkflowInput): Promise<StoredWorkflow> {
  const store = await readStore();
  if (store.workflows.some((item) => item.workflow.id === input.workflowId)) {
    throw new Error(`workflow 已存在：${input.workflowId}`);
  }
  const template = dagTemplates.find((item) => item.id === input.templateId);
  if (!template) throw new Error(`未找到 DAG 模板：${input.templateId}`);
  const targetTemplateIds = new Set(template.edges.map((edge) => edge.targetTemplateId));
  const record: StoredWorkflow = {
    version: 1,
    workflow: resolveWorkflowInstance({
      id: input.workflowId,
      spu: input.spu,
      name: input.name,
      dagTemplateId: template.id,
      nodes: template.nodes.map((node) => ({
        id: `${input.workflowId}:${node.id}`,
        nodeTemplateId: node.id,
        sop: node.sop,
        status: targetTemplateIds.has(node.id) ? "pending" : "running",
      })),
      edges: template.edges.map((edge) => ({
        id: `${edge.sourceTemplateId}-${edge.targetTemplateId}`,
        source: `${input.workflowId}:${edge.sourceTemplateId}`,
        target: `${input.workflowId}:${edge.targetTemplateId}`,
      })),
    }),
  };
  store.workflows.push(record);
  await saveStore(store);
  return structuredClone(record);
}

export async function updateStoredWorkflowNodeStatus(
  workflowId: string,
  nodeId: string,
  status: Extract<WorkflowStatus, "running" | "completed">,
  expectedVersion?: number,
): Promise<StoredWorkflow> {
  const store = await readStore();
  const record = store.workflows.find((item) => item.workflow.id === workflowId);
  if (!record) throw new Error(`未找到 workflow：${workflowId}`);
  assertExpectedVersion(record, expectedVersion);

  const node = record.workflow.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`workflow 中未找到 node：${nodeId}`);
  if (node.status === status) return structuredClone(record);

  if (status === "running") {
    if (node.status !== "pending") throw new Error(`node ${nodeId} 当前状态不能变为进行中`);
    const dependencies = record.workflow.edges.filter((edge) => edge.target === node.id);
    const allDependenciesCompleted = dependencies.every((edge) =>
      record.workflow.nodes.find((item) => item.id === edge.source)?.status === "completed",
    );
    if (!allDependenciesCompleted) throw new Error(`node ${nodeId} 的前置依赖尚未完成`);
  }
  if (status === "completed" && node.status !== "running") throw new Error(`node ${nodeId} 当前不是进行中状态，不能完成`);

  node.status = status;
  if (status === "completed") unlockReadyNodes(record);
  record.version += 1;
  await saveStore(store);
  return structuredClone(record);
}

/** Resets the DAG to a completed node so it can be worked on again. */
export async function resetStoredWorkflowToNode(workflowId: string, nodeId: string): Promise<StoredWorkflow> {
  const store = await readStore();
  const record = store.workflows.find((item) => item.workflow.id === workflowId);
  if (!record) throw new Error(`未找到 workflow：${workflowId}`);

  const targetNode = record.workflow.nodes.find((item) => item.id === nodeId);
  if (!targetNode) throw new Error(`workflow 中未找到 node：${nodeId}`);
  if (targetNode.status !== "completed") throw new Error(`node ${nodeId} 当前不是已完成状态，不能回滚`);

  const ancestorIds = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const currentNodeId = stack.pop()!;
    for (const edge of record.workflow.edges) {
      if (edge.target !== currentNodeId || ancestorIds.has(edge.source)) continue;
      ancestorIds.add(edge.source);
      stack.push(edge.source);
    }
  }

  record.workflow.nodes.forEach((node) => {
    node.status = node.id === nodeId ? "running" : ancestorIds.has(node.id) ? "completed" : "pending";
  });
  record.version += 1;
  await saveStore(store);
  return structuredClone(record);
}

export async function updateStoredWorkflowNodeMetadata(
  workflowId: string,
  nodeId: string,
  input: UpdateWorkflowNodeMetadataInput,
  expectedVersion: number,
): Promise<StoredWorkflow> {
  const store = await readStore();
  const record = store.workflows.find((item) => item.workflow.id === workflowId);
  if (!record) throw new Error(`未找到 workflow：${workflowId}`);
  assertExpectedVersion(record, expectedVersion);
  const node = record.workflow.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`workflow 中未找到 node：${nodeId}`);

  if ("owner" in input) node.owner = input.owner ?? undefined;
  if ("plannedStart" in input) node.plannedStart = input.plannedStart ?? undefined;
  if ("plannedCompletion" in input) node.plannedCompletion = input.plannedCompletion ?? undefined;
  if (input.sop !== undefined) node.sop = input.sop;
  record.version += 1;
  await saveStore(store);
  return structuredClone(record);
}

export async function completeWorkflowNode(workflowId: string, nodeId: string): Promise<StoredWorkflow> {
  return updateStoredWorkflowNodeStatus(workflowId, nodeId, "completed");
}
