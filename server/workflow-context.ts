import type { ProductWorkflow, WorkflowNodeTemplate } from "../src/data/workflows.ts";
import { dagTemplates } from "../src/data/templates/index.ts";
import { getStoredWorkflow } from "./workflow-store.ts";

export interface WorkflowContextNode {
  id: string;
  /** Instance-level template reference, useful when writing back to the workflow. */
  nodeTemplateId: string;
  templateId: string;
  label: string;
  status: string;
  /** Instance-owned SOP for this node. */
  sop: string;
  /** Explicit null means this node has not been assigned yet. */
  owner: string[] | null;
  /** Explicit null means the schedule has not been set yet. */
  plannedStart: string | null;
  /** Explicit null means the schedule has not been set yet. */
  plannedCompletion: string | null;
  workspace: WorkflowNodeTemplate["workspace"];
  upstreamNodeIds: string[];
  downstreamNodeIds: string[];
  /** Capability definitions only. Tab runtime state and per-workflow configuration are not modeled yet. */
  tabs: ProductWorkflow["nodes"][number]["tabs"];
}

export interface WorkflowContext {
  workflow: {
    id: string;
    spu: string;
    name: string;
    dagTemplateId: string;
    version: number;
    progress: { totalNodes: number; completedNodes: number; runningNodes: number; pendingNodes: number };
  };
  dag: {
    nodes: WorkflowContextNode[];
    edges: ProductWorkflow["edges"];
  };
}

export async function getWorkflowContext(workflowId: string): Promise<WorkflowContext | undefined> {
  const record = await getStoredWorkflow(workflowId);
  if (!record) return undefined;
  const { workflow } = record;
  const dagTemplate = dagTemplates.find((template) => template.id === workflow.dagTemplateId);
  if (!dagTemplate) throw new Error(`未找到 DAG 模板：${workflow.dagTemplateId}`);
  const templatesById = new Map(dagTemplate.nodes.map((template) => [template.id, template]));

  const nodes = workflow.nodes.map((node) => {
    const nodeTemplate = templatesById.get(node.templateId);
    if (!nodeTemplate) throw new Error(`workflow ${workflow.id} 引用了未知节点模板：${node.templateId}`);
    return {
      id: node.id,
      nodeTemplateId: node.nodeTemplateId,
      templateId: node.templateId,
      label: node.label,
      status: node.status,
      sop: node.sop,
      owner: node.owner ?? null,
      plannedStart: node.plannedStart ?? null,
      plannedCompletion: node.plannedCompletion ?? null,
      workspace: nodeTemplate.workspace,
      upstreamNodeIds: workflow.edges.filter((edge) => edge.target === node.id).map((edge) => edge.source),
      downstreamNodeIds: workflow.edges.filter((edge) => edge.source === node.id).map((edge) => edge.target),
      tabs: nodeTemplate.tabs ?? [],
    };
  });

  return {
    workflow: {
      id: workflow.id,
      spu: workflow.spu,
      name: workflow.name,
      dagTemplateId: workflow.dagTemplateId,
      version: record.version,
      progress: {
        totalNodes: workflow.nodes.length,
        completedNodes: workflow.nodes.filter((node) => node.status === "completed").length,
        runningNodes: workflow.nodes.filter((node) => node.status === "running").length,
        pendingNodes: workflow.nodes.filter((node) => node.status === "pending").length,
      },
    },
    dag: { nodes, edges: workflow.edges },
  };
}
