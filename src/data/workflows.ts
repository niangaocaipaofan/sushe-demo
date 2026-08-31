import { productWorkflowInstances } from "./instances";
import { dagTemplates } from "./templates";
import type { ProductWorkflow, ProductWorkflowInstance } from "./workflow/types";

function resolveWorkflowInstance(instance: ProductWorkflowInstance): ProductWorkflow {
  const dagTemplate = dagTemplates.find((template) => template.id === instance.dagTemplateId);
  if (!dagTemplate) throw new Error(`未找到 DAG 模板：${instance.dagTemplateId}`);

  const templatesById = new Map(dagTemplate.nodes.map((node) => [node.id, node]));

  return {
    id: instance.id,
    spu: instance.spu,
    name: instance.name,
    dagTemplateId: instance.dagTemplateId,
    nodes: instance.nodes.map((node) => {
      const nodeTemplate = templatesById.get(node.nodeTemplateId);
      if (!nodeTemplate) throw new Error(`实例 ${instance.id} 引用了未知节点模板：${node.nodeTemplateId}`);

      return { ...node, templateId: nodeTemplate.id, label: nodeTemplate.label };
    }),
    edges: instance.edges.map(({ source, target }) => ({ source, target })),
  };
}

export const productWorkflows = productWorkflowInstances.map(resolveWorkflowInstance);

export type {
  ProductWorkflow,
  ProductWorkflowInstance,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeInstance,
  WorkflowNodeTemplate,
  WorkflowStatus,
} from "./workflow/types";
