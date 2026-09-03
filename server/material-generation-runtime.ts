import { readFile } from "node:fs/promises";
import type {
  GenerationTask,
  ImageGenerationInput,
  ImageGenerationModel,
  ImageGenerationResult,
  OrchestratorInput,
  OrchestratorPlan,
} from "../src/types/material-generation.ts";
import type { SmartElderlyCapability } from "./material-generation-capabilities.ts";

type RuntimeOptions = {
  deepSeekApiKey?: string;
  deepSeekModel: string;
  imageApiKey?: string;
  imageApiBaseUrl?: string;
  imageApiTimeoutMs: number;
  runningHubApiKey?: string;
  runningHubApiBaseUrl: string;
  runningHubPollIntervalMs: number;
  runningHubUploadConcurrency: number;
  smartElderlyCapabilities: SmartElderlyCapability[];
};

const imageModelConfigs: Record<Exclude<ImageGenerationModel, "smart-elderly">, { providerModel: string; path: string }> = {
  gpt2: { providerModel: "gpt-image-2-1k2k", path: "/v1/images/generations" },
  "nano-banana": { providerModel: "gemini-3-pro-image-preview-lite", path: "/v1beta/models/gemini-3-pro-image-preview:generateContent" },
  seedream5: { providerModel: "doubao-seedream-5-0-260128", path: "/api/v3/images/generations" },
};

type RunningHubUploadResponse = {
  code?: number;
  message?: string;
  data?: { fileName?: string };
};

type RunningHubTaskResponse = {
  taskId?: string;
  status?: string;
  errorMessage?: string;
  results?: Array<{ url?: string; outputType?: string }>;
};

export type MaterialGenerationExecutionContext = {
  runningHubUploads: Map<string, Promise<string>>;
  uploadLimiter: ReturnType<typeof createConcurrencyLimiter>;
};

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
  const release = () => {
    activeCount -= 1;
    queue.shift()?.();
  };
  return {
    async run<T>(operation: () => Promise<T>) {
      await acquire();
      try {
        return await operation();
      } finally {
        release();
      }
    },
  };
}

function isPlan(value: unknown): value is OrchestratorPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as OrchestratorPlan;
  return typeof plan.summary === "string" && Array.isArray(plan.categories)
    && plan.categories.every((category) => typeof category.categoryKey === "string"
      && typeof category.categoryLabel === "string" && Array.isArray(category.tasks)
      && category.tasks.every((task) => typeof task.taskId === "string" && typeof task.imageType === "string"
        && typeof task.imageLabel === "string" && typeof task.instruction === "string"
        && (task.references === undefined || (Array.isArray(task.references) && task.references.every((name) => typeof name === "string")))
        && (task.capabilityId === undefined || typeof task.capabilityId === "string")
        && (task.inputBindings === undefined || (Boolean(task.inputBindings) && typeof task.inputBindings === "object" && !Array.isArray(task.inputBindings)
          && Object.values(task.inputBindings).every((name) => typeof name === "string")))
        && (task.parameters === undefined || (Boolean(task.parameters) && typeof task.parameters === "object" && !Array.isArray(task.parameters)
          && Object.values(task.parameters).every((value) => typeof value === "string")))))
    && (plan.clarificationQuestions === undefined || (Array.isArray(plan.clarificationQuestions) && plan.clarificationQuestions.every((item) => typeof item === "string")))
    && (plan.unsupportedRequirements === undefined || (Array.isArray(plan.unsupportedRequirements) && plan.unsupportedRequirements.every((item) => typeof item === "string")));
}

function toNanoBananaImagePart(value: string) {
  const matched = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  return matched ? { inline_data: { mime_type: matched[1], data: matched[2] } } : { text: `参考图片：${value}` };
}

function getImageUrl(payload: unknown, imageModel: ImageGenerationModel) {
  const response = payload as {
    data?: Array<{ url?: string; b64_json?: string }>;
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> } }>;
  } | null;
  if (imageModel === "nano-banana") {
    const part = response?.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data || item.inline_data?.data);
    const inlineData = part?.inlineData ?? part?.inline_data;
    if (inlineData?.data) {
      const mimeType = (inlineData as { mimeType?: string; mime_type?: string }).mimeType
        ?? (inlineData as { mimeType?: string; mime_type?: string }).mime_type;
      return `data:${mimeType ?? "image/png"};base64,${inlineData.data}`;
    }
  }
  const result = response?.data?.[0];
  return result?.url ?? (result?.b64_json ? `data:image/png;base64,${result.b64_json}` : undefined);
}

async function sourceToBlob(reference: ImageGenerationInput["referenceMaterials"][number]) {
  const source = reference.source?.value;
  if (!source) throw new Error(`参考素材 ${reference.name} 没有可上传的图片内容`);
  if (source.startsWith("data:")) {
    const matched = /^data:([^;,]+);base64,(.+)$/s.exec(source);
    if (!matched) throw new Error(`参考素材 ${reference.name} 的 Data URL 格式不正确`);
    return new Blob([Buffer.from(matched[2], "base64")], { type: matched[1] });
  }
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`下载参考素材 ${reference.name} 失败（HTTP ${response.status}）`);
    return new Blob([await response.arrayBuffer()], { type: response.headers.get("content-type") || reference.type });
  }
  if (reference.source?.kind === "file_path") {
    return new Blob([await readFile(source)], { type: reference.type });
  }
  throw new Error(`参考素材 ${reference.name} 不支持 ${reference.source?.kind} 格式；请使用图片 URL、Data URL 或本地文件路径`);
}

async function sourceToProviderImage(reference: ImageGenerationInput["referenceMaterials"][number]) {
  const source = reference.source?.value;
  if (!source) throw new Error(`参考素材 ${reference.name} 没有可用的图片内容`);
  if (reference.source?.kind !== "file_path") return source;
  const data = await readFile(source);
  return `data:${reference.type || "application/octet-stream"};base64,${data.toString("base64")}`;
}

async function runningHubRequest<T>(url: string, apiKey: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null) as T;
  if (!response.ok) throw new Error(`RunningHub API 请求失败（HTTP ${response.status}）`);
  return payload;
}

export function createMaterialGenerationRuntime(options: RuntimeOptions) {
  const runningHubUploadLimiter = createConcurrencyLimiter(Math.max(1, Math.floor(options.runningHubUploadConcurrency)));

  async function plan(input: OrchestratorInput): Promise<OrchestratorPlan> {
    if (!options.deepSeekApiKey) throw new Error("未配置 DEEPSEEK_API_KEY。请填写 .env.local 后重启服务。");
    const plannerInput = {
      ...input,
      referenceMaterials: input.referenceMaterials.map(({ source: _source, ...reference }) => reference),
    };
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.deepSeekApiKey}` },
      body: JSON.stringify({
        model: options.deepSeekModel,
        temperature: 0.2,
        max_tokens: 16000,
        stream: false,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `你是通用的电商视觉物料 Orchestrator。根据商品事实、参考素材文件名、用户生成要求和当前模型提供的 workflowCapabilities，规划图片任务。你不生成图片，也不调用 API，只输出合法 JSON。

输出结构：{"summary":"规划摘要","categories":[{"categoryKey":"stable-kebab-case-key","categoryLabel":"分类中文名","tasks":[{"taskId":"unique-stable-id","imageType":"type-key","imageLabel":"图片名称 #序号","instruction":"这张结果的完整中文要求","capabilityId":"可选的能力 ID","inputBindings":{"能力图片输入key":"真实素材文件名"},"parameters":{"能力动态文本输入key":"任务补充说明"},"references":["通用模型可选的真实素材文件名"]}]}],"clarificationQuestions":[],"unsupportedRequirements":[]}。

通用规则：
1. 只规划图片任务，分类、数量、组合方式和类型由用户要求决定；“每个颜色”按商品事实展开；taskId 全局唯一。
2. 所有被引用的素材名称必须与 referenceMaterials.name 完全一致，不得虚构、缩写或只写 basename。
3. 根据完整文件名、目录名、商品事实和用户要求综合判断素材用途。文件名中的“换衣测试底图”“换脸测试底图”“模特底图”均可可靠判断为模特底图；角度、景别等描述也应直接采用。只有素材角色确实无法判断且会导致选错图片时，才在 clarificationQuestions 中要求说明。
4. 没有足够素材或没有能力支持的要求，不得用相似能力凑数；写入 unsupportedRequirements。
5. 同一批请求可以混合使用多个能力，每张输出都是独立 task。
6. 用户要求“配套文案”即授权你基于商品事实生成克制、通用且不虚构的电商文案，不得再要求用户提供文案。
7. 产品信息图默认使用商品事实中已有的品类、颜色、面料、版型、季节和风格；用户未要求时不添加价格、优惠、认证或其他不存在的信息，也不得为此提问。
8. 未指定的构图、场景、搭配下装、细节部位和裁剪方式，按电商上新最佳实践自行选择。风格已给出时，搭配应与该风格一致。
9. 同一张参考图默认允许用于多个任务，并可进行不同裁剪、构图、角度或场景变换；除非用户明确禁止，不得为是否复用素材提问。
10. clarificationQuestions 只用于缺失信息会让任务客观上无法执行或极可能使用错误素材的情况，不能把常规创意决策转交给用户。

当 imageModel 为 smart-elderly 时：
1. 每个任务必须选择 workflowCapabilities 中语义匹配的 capabilityId。
2. inputBindings 必须完整覆盖该能力的所有 imageInputs，且每个 key 恰好绑定一张真实素材；不得增加能力未声明的 key。
3. parameters 必须完整覆盖 generatedByOrchestrator=true 的 textInputs。其内容应结合文件名、商品事实和用户要求，写出本任务有帮助的补充说明，不要复述固定基础指令。
4. 固定基础指令由执行器注入，绝对不要在 parameters 中生成 base_prompt。
5. references 可省略，执行器以 inputBindings 为准。

当 imageModel 不是 smart-elderly 时：不选择 workflowCapabilities；使用 references 列出这张任务真正需要的参考素材。`,
          },
          { role: "user", content: JSON.stringify(plannerInput) },
        ],
      }),
    });
    const payload = await response.json().catch(() => null) as { error?: { message?: string }; choices?: Array<{ message?: { content?: string | null } }> } | null;
    if (!response.ok) throw new Error(payload?.error?.message ?? `DeepSeek API 请求失败（HTTP ${response.status}）`);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek 没有返回规划内容");
    const nextPlan: unknown = JSON.parse(content);
    if (!isPlan(nextPlan)) throw new Error("DeepSeek 返回的规划结构不完整，请重试或调整 Prompt");
    const count = nextPlan.categories.reduce((total, category) => total + category.tasks.length, 0);
    return { ...nextPlan, summary: `本次需要生成 ${count} 张商品物料` };
  }

  function createExecutionContext(): MaterialGenerationExecutionContext {
    return {
      runningHubUploads: new Map(),
      uploadLimiter: runningHubUploadLimiter,
    };
  }

  async function generate(input: ImageGenerationInput, executionContext = createExecutionContext()): Promise<ImageGenerationResult> {
    if (input.imageModel === "smart-elderly") {
      if (!options.runningHubApiKey) throw new Error("未配置 RUNNINGHUB_API_KEY。请填写 .env.local 后重启服务。");
      const capability = options.smartElderlyCapabilities.find((item) => item.id === input.task.capabilityId);
      if (!capability) throw new Error(`智慧老人不支持任务能力：${input.task.capabilityId ?? "未指定"}`);
      const referencesByName = new Map(input.referenceMaterials.map((reference) => [reference.name, reference]));
      const baseUrl = options.runningHubApiBaseUrl.replace(/\/$/, "");
      const uploadedFileNames = new Map(await Promise.all(capability.imageInputs.map(async (definition) => {
        const referenceName = input.task.inputBindings?.[definition.key];
        const reference = referenceName ? referencesByName.get(referenceName) : undefined;
        if (!reference?.source?.value) throw new Error(`${capability.name}缺少图片输入 ${definition.key}`);
        const cacheKey = `${reference.source.kind}:${reference.source.value}`;
        let upload = executionContext.runningHubUploads.get(cacheKey);
        if (!upload) {
          upload = reference.source.kind === "file_id" ? Promise.resolve(reference.source.value) : executionContext.uploadLimiter.run(async () => {
            const form = new FormData();
            form.append("file", await sourceToBlob(reference), reference.name.split("/").pop() || "reference-image");
            const payload = await runningHubRequest<RunningHubUploadResponse>(
              `${baseUrl}/openapi/v2/media/upload/binary`,
              options.runningHubApiKey!,
              { method: "POST", body: form },
            );
            if (payload.code !== 0 || !payload.data?.fileName) throw new Error(payload.message || `上传参考素材 ${reference.name} 失败`);
            return payload.data.fileName;
          });
          executionContext.runningHubUploads.set(cacheKey, upload);
        }
        return [definition.key, await upload] as const;
      })));
      const nodeInfoList = [
        ...capability.imageInputs.map((definition) => ({
          nodeId: definition.nodeId,
          fieldName: definition.fieldName,
          fieldValue: uploadedFileNames.get(definition.key)!,
          description: definition.key,
        })),
        ...capability.textInputs.map((definition) => ({
          nodeId: definition.nodeId,
          fieldName: definition.fieldName,
          fieldValue: input.textInputOverrides?.[definition.key]
            ?? (definition.source === "fixed" ? definition.value! : input.task.parameters?.[definition.key] ?? ""),
          description: definition.apiDescription ?? definition.key,
        })),
      ];
      const started = await runningHubRequest<RunningHubTaskResponse>(
        `${baseUrl}/openapi/v2/run/ai-app/${encodeURIComponent(capability.appId)}`,
        options.runningHubApiKey,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeInfoList,
            instanceType: "default",
            usePersonalQueue: false,
          }),
        },
      );
      if (!started.taskId) throw new Error(started.errorMessage || "RunningHub 未返回任务 ID");
      const deadline = Date.now() + options.imageApiTimeoutMs;
      while (Date.now() < deadline) {
        const task = await runningHubRequest<RunningHubTaskResponse>(
          `${baseUrl}/openapi/v2/query`, options.runningHubApiKey,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: started.taskId }) },
        );
        if (task.status === "SUCCESS") {
          const imageUrl = task.results?.find((result) => result.url && (!result.outputType || /^(png|jpe?g|webp|gif)$/i.test(result.outputType)))?.url;
          if (!imageUrl) throw new Error("RunningHub 任务成功但未返回图片地址");
          return { imageUrl };
        }
        if (task.status === "FAILED") throw new Error(task.errorMessage || "RunningHub 图片生成失败");
        await new Promise((resolve) => setTimeout(resolve, Math.max(500, options.runningHubPollIntervalMs)));
      }
      throw new Error(`RunningHub 图片生成请求超时（${Math.ceil(options.imageApiTimeoutMs / 1000)} 秒）`);
    }
    if (!options.imageApiKey) throw new Error("未配置 IMAGE_API_KEY。请填写 .env.local 后重启服务。");
    const images = await Promise.all(input.referenceMaterials.slice(0, 10).map(sourceToProviderImage));
    const config = imageModelConfigs[input.imageModel];
    const origin = options.imageApiBaseUrl ? new URL(options.imageApiBaseUrl).origin : "https://maas.haoee.com";
    const requestBody: Record<string, unknown> = input.imageModel === "gpt2"
      ? { model: config.providerModel, prompt: input.prompt, size: "1024x1024", response_format: "url", ...(images.length ? { images } : {}) }
      : input.imageModel === "nano-banana"
        ? { contents: [{ role: "user", parts: [{ text: input.prompt }, ...images.map(toNanoBananaImagePart)] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "2K" } } }
        : { model: config.providerModel, prompt: input.prompt, size: "2K", output_format: "png", watermark: false, ...(images.length ? { image: images[0] } : {}) };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.imageApiTimeoutMs);
    let response: Response;
    try {
      response = await fetch(`${origin}${config.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: options.imageApiKey, ModelName: config.providerModel },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`图片生成请求超时（${Math.ceil(options.imageApiTimeoutMs / 1000)} 秒）`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => null) as { error?: { message?: string } | string; data?: Array<{ cost?: number }>; cost?: number; usage?: { cost?: number } } | null;
    if (!response.ok) {
      const message = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
      throw new Error(message ?? `图片生成 API 请求失败（HTTP ${response.status}）`);
    }
    const imageUrl = getImageUrl(payload, input.imageModel);
    if (!imageUrl) throw new Error("图片生成 API 未返回可用图片数据");
    return { imageUrl, cost: payload?.data?.[0]?.cost ?? payload?.cost ?? payload?.usage?.cost };
  }

  return { plan, generate, createExecutionContext };
}

export type MaterialGenerationRuntime = ReturnType<typeof createMaterialGenerationRuntime>;
