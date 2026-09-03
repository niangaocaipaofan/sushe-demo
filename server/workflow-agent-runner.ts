import type { WorkflowEvent } from "./workflow-events.ts";
import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");

/**
 * Delivers the minimal event to the Workflow Agent runtime. The runtime then
 * uses the MCP get_workflow_context tool to fetch its own working context.
 */
export async function wakeWorkflowAgent(event: WorkflowEvent) {
  const runnerUrl = env.WORKFLOW_AGENT_RUNNER_URL;
  if (!runnerUrl) {
    console.info(`[workflow-agent] local mock wake for ${event.type} (${event.eventId})`);
    return;
  }

  const response = await fetch(runnerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: event.eventId,
      type: event.type,
      workflowId: event.workflowId,
      nodeId: event.nodeId,
      materialTaskId: event.materialTaskId,
      workflowVersion: event.workflowVersion,
      occurredAt: event.occurredAt,
    }),
  });
  if (!response.ok) throw new Error(`Workflow Agent runner 返回 HTTP ${response.status}`);
}
