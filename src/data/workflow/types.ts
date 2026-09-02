export type WorkflowStatus = "completed" | "running" | "pending";
export type WorkspaceTabKind = "integration" | "agent" | "reference";
export type WorkspaceTabIcon = "database" | "attach-file" | "ai" | "data-sync";

export interface WorkspaceTabCapability {
  id: string;
  label: string;
  access: "human" | "agent" | "both";
  mode: "read" | "write" | "execute";
  requiresConfirmation?: boolean;
}

export type WorkspaceTabDisplay =
  | { kind: "embedded"; src: string; title: string }
  | { kind: "workspace"; renderer: "material-generation" | "data-sync" }
  | { kind: "placeholder"; message: string };

/** A reusable workspace capability available below a node type. */
export interface WorkspaceTabTemplate {
  id: string;
  label: string;
  kind: WorkspaceTabKind;
  icon: WorkspaceTabIcon;
  display: WorkspaceTabDisplay;
  capabilities: WorkspaceTabCapability[];
}

/** A tab is a front-end capability definition. It has no runtime state or per-workflow configuration yet. */
export type WorkspaceTab = WorkspaceTabTemplate;

export interface WorkflowNodeTemplate {
  id: string;
  label: string;
  /** Default SOP copied into each workflow node when an instance is created. */
  sop: string;
  workspace: "none" | "product-facts" | "styling" | "visual-assets" | "publishing";
  tabs?: WorkspaceTabTemplate[];
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
  /** Instance-owned SOP. It can diverge from its source template after creation. */
  sop: string;
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
  tabs: WorkspaceTab[];
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
