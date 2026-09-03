import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type WorkflowEventType =
  | "workflow.created"
  | "workflow.node.completed"
  | "material.generation.completed"
  | "material.generation.failed";
export type WorkflowEventStatus = "pending" | "processing" | "completed" | "failed";

export interface WorkflowEvent {
  eventId: string;
  type: WorkflowEventType;
  workflowId: string;
  nodeId?: string;
  materialTaskId?: string;
  workflowVersion: number;
  occurredAt: string;
  idempotencyKey: string;
  status: WorkflowEventStatus;
  attemptCount: number;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface ProduceWorkflowEventInput {
  type: WorkflowEventType;
  workflowId: string;
  nodeId?: string;
  materialTaskId?: string;
  workflowVersion: number;
  idempotencyKey?: string;
}

const eventStorePath = resolve(process.env.WORKFLOW_EVENT_STORE_PATH ?? ".runtime/workflow-events.json");

async function readEvents(): Promise<WorkflowEvent[]> {
  try {
    return JSON.parse(await readFile(eventStorePath, "utf8")) as WorkflowEvent[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveEvents(events: WorkflowEvent[]) {
  await mkdir(dirname(eventStorePath), { recursive: true });
  const temporaryPath = `${eventStorePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  await rename(temporaryPath, eventStorePath);
}

export async function produceWorkflowEvent(input: ProduceWorkflowEventInput): Promise<WorkflowEvent> {
  const now = new Date().toISOString();
  const idempotencyKey = input.idempotencyKey ?? `${input.type}:${input.workflowId}:${input.nodeId ?? ""}:${input.workflowVersion}`;
  const events = await readEvents();
  const duplicate = events.find((event) => event.idempotencyKey === idempotencyKey);
  if (duplicate) return duplicate;

  const event: WorkflowEvent = {
    eventId: randomUUID(),
    type: input.type,
    workflowId: input.workflowId,
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.materialTaskId ? { materialTaskId: input.materialTaskId } : {}),
    workflowVersion: input.workflowVersion,
    occurredAt: now,
    idempotencyKey,
    status: "pending",
    attemptCount: 0,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  };
  events.push(event);
  await saveEvents(events);
  return event;
}

export async function claimNextWorkflowEvent(): Promise<WorkflowEvent | undefined> {
  const events = await readEvents();
  const now = new Date().toISOString();
  const event = events.find((item) => item.status === "pending" && item.availableAt <= now);
  if (!event) return undefined;

  event.status = "processing";
  event.attemptCount += 1;
  event.updatedAt = now;
  await saveEvents(events);
  return event;
}

export async function completeWorkflowEvent(eventId: string) {
  const events = await readEvents();
  const event = events.find((item) => item.eventId === eventId);
  if (!event) throw new Error(`未找到 workflow 事件：${eventId}`);
  event.status = "completed";
  event.updatedAt = new Date().toISOString();
  event.lastError = undefined;
  await saveEvents(events);
}

export async function retryWorkflowEvent(eventId: string, error: unknown) {
  const events = await readEvents();
  const event = events.find((item) => item.eventId === eventId);
  if (!event) throw new Error(`未找到 workflow 事件：${eventId}`);
  const delayMs = Math.min(60_000, 1_000 * 2 ** Math.min(event.attemptCount, 6));
  event.status = event.attemptCount >= 8 ? "failed" : "pending";
  event.availableAt = new Date(Date.now() + delayMs).toISOString();
  event.updatedAt = new Date().toISOString();
  event.lastError = error instanceof Error ? error.message : String(error);
  await saveEvents(events);
}

export async function listWorkflowEvents() {
  return readEvents();
}
