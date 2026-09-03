import { claimNextWorkflowEvent, completeWorkflowEvent, retryWorkflowEvent } from "./workflow-events.ts";
import { wakeWorkflowAgent } from "./workflow-agent-runner.ts";
import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");
const pollIntervalMs = Number(env.WORKFLOW_EVENT_POLL_INTERVAL_MS ?? 1_000);

async function consumeOneEvent() {
  const event = await claimNextWorkflowEvent();
  if (!event) return false;
  try {
    await wakeWorkflowAgent(event);
    await completeWorkflowEvent(event.eventId);
    console.info(`[workflow-worker] delivered ${event.type} (${event.eventId})`);
  } catch (error) {
    await retryWorkflowEvent(event.eventId, error);
    console.error(`[workflow-worker] delivery failed for ${event.eventId}`, error);
  }
  return true;
}

async function main() {
  console.info(`[workflow-worker] polling every ${pollIntervalMs}ms`);
  for (;;) {
    const consumed = await consumeOneEvent();
    if (!consumed) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

void main();
