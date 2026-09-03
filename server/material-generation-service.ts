import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { defaultMaterialRequirements } from "../src/data/material-generation-presets.ts";
import type {
  GenerationTask,
  GenerationAttempt,
  ImageGenerationModel,
  MaterialGenerationJob,
  MaterialGenerationSource,
  ProductFact,
  ReferenceMaterial,
  RetryMaterialGenerationTaskInput,
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

export type RetryMaterialGenerationInput = RetryMaterialGenerationTaskInput & {
  workflowId: string;
  jobId: string;
  taskId: string;
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
  const getEffectivePrompt = (task: GenerationTask, imageModel: ImageGenerationModel) => {
    if (imageModel !== "smart-elderly") return task.instruction;
    const capability = smartElderlyCapabilities.find((item) => item.id === task.capabilityId);
    if (!capability) return task.instruction;
    return capability.textInputs
      .map((input) => input.source === "fixed" ? input.value : task.parameters?.[input.key])
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\n") || task.instruction;
  };
  const createAttempt = (
    prompt: string,
    referenceMaterials: ReferenceMaterial[],
    inputBindings?: Record<string, string>,
  ): GenerationAttempt => ({
    id: randomUUID(),
    prompt,
    referenceMaterials: structuredClone(referenceMaterials),
    ...(inputBindings ? { inputBindings: structuredClone(inputBindings) } : {}),
    status: "generating",
    createdAt: new Date().toISOString(),
  });
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
      const references = selectTaskReferences(job.referenceMaterials, currentTask);
      const prompt = currentTask.effectivePrompt ?? getEffectivePrompt(currentTask, job.imageModel);
      const attempt = createAttempt(prompt, references, currentTask.inputBindings);
      currentTask = { ...currentTask, status: "generating", attempts: [...(currentTask.attempts ?? []), attempt] };
      await updateTask(job.id, currentTask.taskId, currentTask);
      const generation = await runtime.generate({
        productFacts: job.productFacts,
        generationRequirements: job.generationRequirements,
        referenceMaterials: references,
        task: currentTask,
        prompt: currentTask.instruction,
        imageModel: job.imageModel,
      }, executionContext);
      const cost = Number(((currentTask.cost ?? 0) + (generation.cost ?? 0)).toFixed(2));
      const completedAt = new Date().toISOString();
      await updateTask(job.id, currentTask.taskId, {
        status: "completed",
        imageUrl: generation.imageUrl,
        cost,
        attempts: currentTask.attempts?.map((item) => item.id === attempt.id
          ? { ...item, status: "completed", imageUrl: generation.imageUrl, cost: generation.cost, completedAt }
          : item),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "生成服务暂时不可用";
      const completedAt = new Date().toISOString();
      await updateTask(job.id, currentTask.taskId, {
        status: "failed",
        errorMessage,
        attempts: currentTask.attempts?.map((item) => item.status === "generating"
          ? { ...item, status: "failed", errorMessage, completedAt }
          : item),
      });
    }
  }

  function createSmartElderlyRetryOverrides(task: GenerationTask, prompt: string) {
    const capability = smartElderlyCapabilities.find((item) => item.id === task.capabilityId);
    if (!capability) throw new Error(`智慧老人不支持任务能力：${task.capabilityId ?? "未指定"}`);
    const targetInput = capability.textInputs.find((item) => item.source === "fixed") ?? capability.textInputs[0];
    return Object.fromEntries(capability.textInputs.map((input) => [input.key, input.key === targetInput?.key ? prompt : ""]));
  }

  async function runRetry(
    job: MaterialGenerationJob,
    task: GenerationTask,
    attempt: GenerationAttempt,
  ) {
    try {
      const generation = await runtime.generate({
        productFacts: job.productFacts,
        generationRequirements: job.generationRequirements,
        referenceMaterials: attempt.referenceMaterials,
        task: { ...task, inputBindings: attempt.inputBindings ?? task.inputBindings },
        prompt: attempt.prompt,
        imageModel: job.imageModel,
        ...(job.imageModel === "smart-elderly"
          ? { textInputOverrides: createSmartElderlyRetryOverrides(task, attempt.prompt) }
          : {}),
      }, runtime.createExecutionContext());
      await updateMaterialGenerationJob(job.id, (current) => {
        const currentTask = current.tasks.find((item) => item.taskId === task.taskId);
        if (!currentTask) return;
        const completedAt = new Date().toISOString();
        currentTask.status = "completed";
        currentTask.effectivePrompt = attempt.prompt;
        currentTask.imageUrl = generation.imageUrl;
        currentTask.errorMessage = undefined;
        currentTask.cost = Number(((currentTask.cost ?? 0) + (generation.cost ?? 0)).toFixed(2));
        currentTask.attempts = currentTask.attempts?.map((item) => item.id === attempt.id
          ? { ...item, status: "completed", imageUrl: generation.imageUrl, cost: generation.cost, completedAt }
          : item);
        current.previewImageUrl = generation.imageUrl;
        const failedCount = current.tasks.filter((item) => item.status === "failed").length;
        current.status = failedCount ? "failed" : "completed";
        current.errorMessage = failedCount ? `${failedCount} / ${current.tasks.length} 个图片任务生成失败` : undefined;
        current.completedAt = completedAt;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "生成服务暂时不可用";
      await updateMaterialGenerationJob(job.id, (current) => {
        const currentTask = current.tasks.find((item) => item.taskId === task.taskId);
        if (!currentTask) return;
        const completedAt = new Date().toISOString();
        currentTask.status = "failed";
        currentTask.errorMessage = errorMessage;
        currentTask.attempts = currentTask.attempts?.map((item) => item.id === attempt.id
          ? { ...item, status: "failed", errorMessage, completedAt }
          : item);
        current.status = "failed";
        current.errorMessage = `${current.tasks.filter((item) => item.status === "failed").length} / ${current.tasks.length} 个图片任务生成失败`;
        current.completedAt = completedAt;
      });
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
      }))).map((task) => ({ ...task, effectivePrompt: getEffectivePrompt(task, job.imageModel) }));
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

  async function retry(input: RetryMaterialGenerationInput) {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("重试 Prompt 不能为空");
    const job = await getMaterialGenerationJob(input.jobId, input.workflowId);
    if (!job) throw new Error(`未找到物料生成任务：${input.jobId}`);
    const task = job.tasks.find((item) => item.taskId === input.taskId);
    if (!task) throw new Error(`任务中未找到图片：${input.taskId}`);
    if (task.status === "generating") throw new Error("该图片正在生成，请等待完成后再重试");

    const previousReferences = task.attempts?.at(-1)?.referenceMaterials
      ?? selectTaskReferences(job.referenceMaterials, task);
    const references = await resolveReferenceMaterials(
      input.referenceMaterials.length ? input.referenceMaterials : previousReferences,
    );
    if (references.length > 10) throw new Error("单张图片最多使用 10 张参考素材");
    const referenceNames = new Set(references.map((reference) => reference.name));
    if (referenceNames.size !== references.length) throw new Error("参考素材文件名不能重复");
    if (references.some((reference) => !reference.source?.value || !reference.type.startsWith("image/"))) {
      throw new Error("重试参考素材必须是可用图片");
    }

    let inputBindings: Record<string, string> | undefined;
    if (job.imageModel === "smart-elderly") {
      const capability = smartElderlyCapabilities.find((item) => item.id === task.capabilityId);
      if (!capability) throw new Error(`智慧老人不支持任务能力：${task.capabilityId ?? "未指定"}`);
      inputBindings = input.inputBindings ?? task.attempts?.at(-1)?.inputBindings ?? task.inputBindings;
      const expectedKeys = capability.imageInputs.map((item) => item.key).sort();
      const actualKeys = Object.keys(inputBindings ?? {}).sort();
      if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
        throw new Error(`${capability.name} 的参考素材绑定不完整：需要 ${expectedKeys.join(", ")}`);
      }
      for (const [key, name] of Object.entries(inputBindings ?? {})) {
        if (!referenceNames.has(name)) throw new Error(`${key} 绑定的参考素材不存在：${name}`);
      }
    }

    const attempt = createAttempt(prompt, references, inputBindings);
    const updatedJob = await updateMaterialGenerationJob(job.id, (current) => {
      const currentTask = current.tasks.find((item) => item.taskId === task.taskId);
      if (!currentTask) throw new Error(`任务中未找到图片：${task.taskId}`);
      if (currentTask.status === "generating") throw new Error("该图片正在生成，请等待完成后再重试");
      currentTask.status = "generating";
      currentTask.effectivePrompt = prompt;
      currentTask.errorMessage = undefined;
      currentTask.attempts = [...(currentTask.attempts ?? []), attempt];
      current.status = "running";
      current.errorMessage = undefined;
      current.startedAt = attempt.createdAt;
      current.completedAt = undefined;
    });
    const retryTask = updatedJob.tasks.find((item) => item.taskId === task.taskId)!;
    void withImageConcurrency(() => runRetry(updatedJob, retryTask, attempt));
    return updatedJob;
  }

  async function get(jobId: string, workflowId?: string) {
    const job = await getMaterialGenerationJob(jobId, workflowId);
    if (!job) return undefined;
    job.tasks = job.tasks.map((task) => ({
      ...task,
      effectivePrompt: task.attempts?.at(-1)?.prompt ?? task.effectivePrompt ?? getEffectivePrompt(task, job.imageModel),
    }));
    return job;
  }

  return { start, retry, get, list: listMaterialGenerationJobs };
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
