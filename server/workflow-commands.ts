import { produceWorkflowEvent } from "./workflow-events.ts";
import {
  createStoredWorkflow,
  resetStoredWorkflowToNode,
  updateStoredWorkflowNodeMetadata,
  updateStoredWorkflowNodeStatus,
  type CreateWorkflowInput,
  type UpdateWorkflowNodeMetadataInput,
} from "./workflow-store.ts";

/** Completes a node and then publishes the resulting domain event. */
export async function completeNodeAndProduceWorkflowEvent(workflowId: string, nodeId: string) {
  const record = await updateStoredWorkflowNodeStatus(workflowId, nodeId, "completed");
  const event = await produceWorkflowEvent({
    type: "workflow.node.completed",
    workflowId,
    nodeId,
    workflowVersion: record.version,
  });
  return { workflow: record.workflow, workflowVersion: record.version, event };
}

export async function resetWorkflowToNode(workflowId: string, nodeId: string) {
  const record = await resetStoredWorkflowToNode(workflowId, nodeId);
  return { workflow: record.workflow, workflowVersion: record.version };
}

export async function createWorkflowAndProduceEvent(input: CreateWorkflowInput) {
  const record = await createStoredWorkflow(input);
  const event = await produceWorkflowEvent({
    type: "workflow.created",
    workflowId: record.workflow.id,
    workflowVersion: record.version,
  });
  return { workflow: record.workflow, workflowVersion: record.version, event };
}

export async function updateWorkflowNodeStatusAndProduceEvent(
  workflowId: string,
  nodeId: string,
  status: "running" | "completed",
  expectedVersion: number,
  idempotencyKey: string,
) {
  const record = await updateStoredWorkflowNodeStatus(workflowId, nodeId, status, expectedVersion);
  const event = status === "completed"
    ? await produceWorkflowEvent({ type: "workflow.node.completed", workflowId, nodeId, workflowVersion: record.version, idempotencyKey })
    : undefined;
  return { workflow: record.workflow, workflowVersion: record.version, ...(event ? { event } : {}) };
}

export async function updateWorkflowNodeMetadata(
  workflowId: string,
  nodeId: string,
  patch: UpdateWorkflowNodeMetadataInput,
  expectedVersion: number,
) {
  const record = await updateStoredWorkflowNodeMetadata(workflowId, nodeId, patch, expectedVersion);
  return { workflow: record.workflow, workflowVersion: record.version };
}
