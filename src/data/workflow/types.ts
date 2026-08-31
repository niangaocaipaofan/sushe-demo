export type WorkflowStatus = "completed" | "running" | "pending";

export interface WorkflowNodeTemplate {
  id: string;
  label: string;
  workspace: "none" | "product-facts" | "styling" | "visual-assets" | "publishing";
}

export interface WorkflowEdgeTemplate {
  sourceTemplateId: string;
  targetTemplateId: string;
}

export interface DagTemplate {
  id: string;
  name: string;
  nodes: WorkflowNodeTemplate[];
  edges: WorkflowEdgeTemplate[];
}

export interface WorkflowNodeInstance {
  id: string;
  nodeTemplateId: string;
  status: WorkflowStatus;
  owner?: string[];
  plannedStart?: string;
  plannedCompletion?: string;
}

export interface WorkflowEdgeInstance {
  id: string;
  source: string;
  target: string;
}

export interface ProductWorkflowInstance {
  id: string;
  spu: string;
  name: string;
  dagTemplateId: string;
  nodes: WorkflowNodeInstance[];
  edges: WorkflowEdgeInstance[];
}

export interface WorkflowNode extends WorkflowNodeInstance {
  templateId: string;
  label: string;
}

export interface WorkflowEdge {
  source: string;
  target: string;
}

export interface ProductWorkflow {
  id: string;
  spu: string;
  name: string;
  dagTemplateId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
