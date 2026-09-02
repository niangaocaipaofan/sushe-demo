import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  CreateMaterialGenerationJobInput,
  MaterialGenerationJob,
  MaterialGenerationJobSummary,
} from "../src/types/material-generation.ts";
import { persistDataUrlMaterialAsset } from "./material-asset-store.ts";

type MaterialGenerationStore = { jobs: MaterialGenerationJob[] };

const storePath = resolve(process.env.MATERIAL_GENERATION_STORE_PATH ?? ".runtime/material-generation-tasks.json");
let writeQueue = Promise.resolve();

async function readStore(): Promise<MaterialGenerationStore> {
  try {
    return JSON.parse(await readFile(storePath, "utf8")) as MaterialGenerationStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { jobs: [] };
    throw error;
  }
}

async function saveStore(store: MaterialGenerationStore) {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporaryPath, storePath);
}

function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

function toSummary(job: MaterialGenerationJob): MaterialGenerationJobSummary {
  const { productFacts: _productFacts, referenceMaterials: _referenceMaterials, generationRequirements: _requirements, plan: _plan, tasks, ...summary } = job;
  return {
    ...summary,
    totalCount: tasks.length,
    completedCount: tasks.filter((task) => task.status === "completed").length,
    failedCount: tasks.filter((task) => task.status === "failed").length,
  };
}

export async function createMaterialGenerationJob(input: CreateMaterialGenerationJobInput) {
  return withWriteLock(async () => {
    const store = await readStore();
    const duplicate = input.idempotencyKey
      ? store.jobs.find((job) => job.workflowId === input.workflowId && job.idempotencyKey === input.idempotencyKey)
      : undefined;
    if (duplicate) return { job: structuredClone(duplicate), created: false };

    const now = new Date().toISOString();
    const job: MaterialGenerationJob = {
      id: randomUUID(),
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      spuId: input.spuId,
      source: input.source,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      status: "queued",
      imageModel: input.imageModel,
      generationRequirements: input.generationRequirements,
      productFacts: structuredClone(input.productFacts),
      referenceMaterials: structuredClone(input.referenceMaterials),
      plan: null,
      tasks: [],
      createdAt: now,
      updatedAt: now,
    };
    store.jobs.push(job);
    await saveStore(store);
    return { job: structuredClone(job), created: true };
  });
}

export async function updateMaterialGenerationJob(
  jobId: string,
  update: (job: MaterialGenerationJob) => void,
): Promise<MaterialGenerationJob> {
  return withWriteLock(async () => {
    const store = await readStore();
    const job = store.jobs.find((item) => item.id === jobId);
    if (!job) throw new Error(`未找到物料生成任务：${jobId}`);
    update(job);
    job.updatedAt = new Date().toISOString();
    await saveStore(store);
    return structuredClone(job);
  });
}

export async function getMaterialGenerationJob(jobId: string, workflowId?: string) {
  const store = await readStore();
  const job = store.jobs.find((item) => item.id === jobId && (!workflowId || item.workflowId === workflowId));
  return job ? structuredClone(job) : undefined;
}

export async function listMaterialGenerationJobs(workflowId: string): Promise<MaterialGenerationJobSummary[]> {
  const store = await readStore();
  return store.jobs
    .filter((job) => job.workflowId === workflowId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(toSummary);
}

/** One-time compatible migration for jobs created before images had a file store. */
export async function compactStoredMaterialAssets() {
  return withWriteLock(async () => {
    const store = await readStore();
    let migratedAssets = 0;
    let migratedJobs = 0;
    for (const job of store.jobs) {
      let changed = false;
      for (const reference of job.referenceMaterials) {
        if (reference.source?.kind !== "data_url") continue;
        const asset = await persistDataUrlMaterialAsset(reference.source.value, reference.name, reference.type);
        reference.source = { kind: "file_path", value: asset.path };
        reference.type = asset.mimeType;
        reference.size = asset.size;
        migratedAssets += 1;
        changed = true;
      }
      if (changed) migratedJobs += 1;
    }
    if (migratedAssets) await saveStore(store);
    return { migratedAssets, migratedJobs };
  });
}
