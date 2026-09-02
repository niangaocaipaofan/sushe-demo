import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { defaultMaterialRequirements } from "../src/data/material-generation-presets.ts";
import type {
  GenerationTask,
  ImageGenerationModel,
  MaterialGenerationJob,
  MaterialGenerationSource,
  ProductFact,
  ReferenceMaterial,
} from "../src/types/material-generation.ts";
import { persistDataUrlMaterialAsset, resolveMaterialAssetPath } from "./material-asset-store.ts";
import {
  createSmartElderlyCapabilities,
  describeWorkflowCapabilities,
  type SmartElderlyCapability,
} from "./material-generation-capabilities.ts";
import { createMaterialGenerationRuntime, type MaterialGenerationRuntime } from "./material-generation-runtime.ts";
import {
  createMaterialGenerationJob,
  getMaterialGenerationJob,
  listMaterialGenerationJobs,
  updateMaterialGenerationJob,
} from "./material-generation-store.ts";
import { produceWorkflowEvent } from "./workflow-events.ts";
import { getStoredWorkflow } from "./workflow-store.ts";

export type StartMaterialGenerationInput = {
  workflowId: string;
  nodeId: string;
  source: MaterialGenerationSource;
  imageModel?: ImageGenerationModel;
  generationRequirements?: string;
  productFacts?: ProductFact[];
  referenceMaterials?: ReferenceMaterial[];
  idempotencyKey?: string;
};

function selectTaskReferences(references: ReferenceMaterial[], task: GenerationTask) {
  const selected = new Set([
    ...(task.references ?? []),
    ...Object.values(task.inputBindings ?? {}),
  ]);
  return references.filter((reference) => selected.has(reference.name));
}

function validatePlanBeforeGeneration(
  plan: NonNullable<Awaited<ReturnType<MaterialGenerationRuntime["plan"]>>>,
  imageModel: ImageGenerationModel,
  references: ReferenceMaterial[],
  capabilities: SmartElderlyCapability[],
) {
  if (plan.clarificationQuestions?.length) {
    throw new Error(`需要补充说明后才能生成：${plan.clarificationQuestions.join("；")}`);
  }
  if (plan.unsupportedRequirements?.length) {
    throw new Error(`当前所选模型不支持：${plan.unsupportedRequirements.join("；")}`);
  }
  const tasks = plan.categories.flatMap((category) => category.tasks);
  if (!tasks.length) throw new Error("Orchestrator 没有规划可执行的图片任务，请补充更明确的生成要求和素材文件名");
  const taskIds = new Set<string>();
  const referencesByName = new Map(references.map((reference) => [reference.name, reference]));
  for (const task of tasks) {
    if (taskIds.has(task.taskId)) throw new Error(`Orchestrator 生成了重复 taskId：${task.taskId}`);
    taskIds.add(task.taskId);
    if (imageModel !== "smart-elderly") {
      for (const referenceName of task.references ?? []) {
        if (!referencesByName.has(referenceName)) throw new Error(`任务 ${task.taskId} 引用了不存在的素材：${referenceName}`);
      }
      continue;
    }
    const capability = capabilities.find((item) => item.id === task.capabilityId);
    if (!capability) throw new Error(`任务 ${task.taskId} 使用了智慧老人未提供的能力：${task.capabilityId ?? "未指定"}`);
    const expectedImageKeys = capability.imageInputs.map((input) => input.key).sort();
    const actualImageKeys = Object.keys(task.inputBindings ?? {}).sort();
    if (JSON.stringify(expectedImageKeys) !== JSON.stringify(actualImageKeys)) {
      throw new Error(`任务 ${task.taskId} 的图片输入不符合 ${capability.name} 契约：需要 ${expectedImageKeys.join(", ")}`);
    }
    for (const [key, referenceName] of Object.entries(task.inputBindings ?? {})) {
      const reference = referencesByName.get(referenceName);
      if (!reference?.source?.value || !reference.type.startsWith("image/")) {
        throw new Error(`任务 ${task.taskId} 的 ${key} 未绑定可用图片：${referenceName}`);
      }
    }
    const expectedParameterKeys = capability.textInputs
      .filter((input) => input.source === "orchestrator")
      .map((input) => input.key)
      .sort();
    const actualParameterKeys = Object.keys(task.parameters ?? {}).sort();
    if (JSON.stringify(expectedParameterKeys) !== JSON.stringify(actualParameterKeys)
      || expectedParameterKeys.some((key) => !task.parameters?.[key]?.trim())) {
      throw new Error(`任务 ${task.taskId} 的动态文本输入不符合 ${capability.name} 契约：需要 ${expectedParameterKeys.join(", ") || "无"}`);
    }
  }
}

function createConcurrencyLimiter(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];
  const acquire = () => new Promise<void>((resolve) => {
    if (activeCount < concurrency) {
      activeCount += 1;
      resolve();
      return;
    }
    queue.push(() => {
      activeCount += 1;
      resolve();
    });
  });
  return async <T>(operation: () => Promise<T>) => {
    await acquire();
    try {
      return await operation();
    } finally {
      activeCount -= 1;
      queue.shift()?.();
    }
  };
}

async function resolveReferenceMaterials(references: ReferenceMaterial[]) {
  return Promise.all(references.map(async (reference) => {
    if (!reference.source) return reference;
    let source = reference.source;
    if (source.kind === "data_url") {
      const stored = await persistDataUrlMaterialAsset(source.value, reference.name, reference.type);
      source = { kind: "file_path", value: stored.path };
    } else if (source.kind === "asset_id") {
      source = { kind: "file_path", value: resolveMaterialAssetPath(source.value) };
    }
    if (source.kind !== "file_path") return { ...reference, source };
    const file = await stat(source.value);
    const extension = extname(source.value).toLowerCase();
    const mimeType = reference.type.startsWith("image/")
      ? reference.type
      : ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extension] ?? "application/octet-stream");
    return {
      ...reference,
      type: mimeType,
      size: file.size,
      source,
    };
  }));
}

export function createMaterialGenerationService(
  runtime: MaterialGenerationRuntime,
  options: { smartElderlyCapabilities?: SmartElderlyCapability[]; imageConcurrency?: number } = {},
) {
  const smartElderlyCapabilities = options.smartElderlyCapabilities ?? [];
  const imageConcurrency = Math.max(1, Math.floor(options.imageConcurrency ?? 10));
  const withImageConcurrency = createConcurrencyLimiter(imageConcurrency);
  async function updateTask(jobId: string, taskId: string, patch: Partial<GenerationTask>) {
    return updateMaterialGenerationJob(jobId, (job) => {
      job.tasks = job.tasks.map((task) => task.taskId === taskId ? { ...task, ...patch } : task);
      if (patch.imageUrl) job.previewImageUrl = patch.imageUrl;
    });
  }

  async function runImageTask(
    job: Pick<MaterialGenerationJob, "id" | "productFacts" | "generationRequirements" | "referenceMaterials" | "imageModel">,
    initialTask: GenerationTask,
    executionContext: ReturnType<MaterialGenerationRuntime["createExecutionContext"]>,
  ) {
    let currentTask = { ...initialTask };
    try {
      currentTask = { ...currentTask, status: "generating" };
      await updateTask(job.id, currentTask.taskId, currentTask);
      const generation = await runtime.generate({
        productFacts: job.productFacts,
        generationRequirements: job.generationRequirements,
        referenceMaterials: selectTaskReferences(job.referenceMaterials, currentTask),
        task: currentTask,
        prompt: currentTask.instruction,
        imageModel: job.imageModel,
      }, executionContext);
      const cost = Number(((currentTask.cost ?? 0) + (generation.cost ?? 0)).toFixed(2));
      await updateTask(job.id, currentTask.taskId, { status: "completed", imageUrl: generation.imageUrl, cost });
    } catch (error) {
      await updateTask(job.id, currentTask.taskId, { status: "failed", errorMessage: error instanceof Error ? error.message : "生成服务暂时不可用" });
    }
  }

  async function runJob(jobId: string, workflowVersion: number) {
    try {
      let job = await updateMaterialGenerationJob(jobId, (current) => {
        current.status = "planning";
        current.startedAt = new Date().toISOString();
      });
      const plan = await runtime.plan({
        productFacts: job.productFacts,
        referenceMaterials: job.referenceMaterials,
        generationRequirements: job.generationRequirements,
        imageModel: job.imageModel,
        ...(job.imageModel === "smart-elderly"
          ? { workflowCapabilities: describeWorkflowCapabilities(smartElderlyCapabilities) }
          : {}),
      });
      validatePlanBeforeGeneration(plan, job.imageModel, job.referenceMaterials, smartElderlyCapabilities);
      const tasks = plan.categories.flatMap((category) => category.tasks.map((task) => ({
        ...task,
        categoryKey: category.categoryKey,
        categoryLabel: category.categoryLabel,
        status: "planned" as const,
        cost: 0,
      })));
      job = await updateMaterialGenerationJob(jobId, (current) => {
        current.plan = plan;
        current.tasks = tasks;
        current.status = "running";
      });
      const executionContext = runtime.createExecutionContext();
      const executionJob = job;
      await Promise.all(tasks.map((task) => withImageConcurrency(() => runImageTask(executionJob, task, executionContext))));
      job = await updateMaterialGenerationJob(jobId, (current) => {
        const failedCount = current.tasks.filter((task) => task.status === "failed").length;
        current.status = failedCount ? "failed" : "completed";
        if (failedCount) current.errorMessage = `${failedCount} / ${current.tasks.length} 个图片任务生成失败`;
        current.completedAt = new Date().toISOString();
      });
      await produceWorkflowEvent({
        type: job.status === "completed" ? "material.generation.completed" : "material.generation.failed",
        workflowId: job.workflowId,
        nodeId: job.nodeId,
        workflowVersion,
        materialTaskId: job.id,
        idempotencyKey: `material.generation.${job.status}:${job.id}`,
      });
    } catch (error) {
      const job = await updateMaterialGenerationJob(jobId, (current) => {
        current.status = "failed";
        current.errorMessage = error instanceof Error ? error.message : "物料生成失败";
        current.completedAt = new Date().toISOString();
      });
      await produceWorkflowEvent({
        type: "material.generation.failed",
        workflowId: job.workflowId,
        nodeId: job.nodeId,
        workflowVersion,
        materialTaskId: job.id,
        idempotencyKey: `material.generation.failed:${job.id}`,
      });
    }
  }

  async function start(input: StartMaterialGenerationInput) {
    const record = await getStoredWorkflow(input.workflowId);
    if (!record) throw new Error(`未找到 workflow：${input.workflowId}`);
    const node = record.workflow.nodes.find((item) => item.id === input.nodeId);
    if (!node) throw new Error(`workflow 中未找到 node：${input.nodeId}`);
    if (!node.tabs.some((tab) => tab.display.kind === "workspace" && tab.display.renderer === "material-generation")) {
      throw new Error(`节点 ${input.nodeId} 不支持物料生成`);
    }
    const referenceMaterials = await resolveReferenceMaterials(input.referenceMaterials ?? []);
    const created = await createMaterialGenerationJob({
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      spuId: record.workflow.spu,
      source: input.source,
      imageModel: input.imageModel ?? "smart-elderly",
      generationRequirements: input.generationRequirements?.trim() || defaultMaterialRequirements,
      productFacts: input.productFacts ?? [],
      referenceMaterials,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    });
    if (created.created) void runJob(created.job.id, record.version);
    return created.job;
  }

  return { start, get: getMaterialGenerationJob, list: listMaterialGenerationJobs };
}

export function createMaterialGenerationServiceFromEnv(env: Record<string, string | undefined>) {
  const smartElderlyCapabilities = createSmartElderlyCapabilities(env);
  const configuredConcurrency = Number(env.MATERIAL_GENERATION_CONCURRENCY || 10);
  const imageConcurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.floor(configuredConcurrency)
    : 10;
  const configuredUploadConcurrency = Number(env.RUNNINGHUB_UPLOAD_CONCURRENCY || 5);
  const runningHubUploadConcurrency = Number.isFinite(configuredUploadConcurrency) && configuredUploadConcurrency > 0
    ? Math.floor(configuredUploadConcurrency)
    : 5;
  const runtime = createMaterialGenerationRuntime({
    deepSeekApiKey: env.DEEPSEEK_API_KEY,
    deepSeekModel: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    imageApiKey: env.IMAGE_API_KEY,
    imageApiBaseUrl: env.IMAGE_API_BASE_URL,
    imageApiTimeoutMs: Number(env.IMAGE_API_TIMEOUT_MS || 120_000),
    runningHubApiKey: env.RUNNINGHUB_API_KEY,
    runningHubApiBaseUrl: env.RUNNINGHUB_API_BASE_URL || "https://www.runninghub.cn",
    runningHubPollIntervalMs: Number(env.RUNNINGHUB_POLL_INTERVAL_MS || 2_000),
    runningHubUploadConcurrency,
    smartElderlyCapabilities,
  });
  return createMaterialGenerationService(runtime, { smartElderlyCapabilities, imageConcurrency });
}
