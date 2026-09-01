import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createDataSyncMessageHandler, type DataSyncMessageInput } from "./server/data-sync-message-handler.ts";
import { routeIntentPrompt, schemaMappingPrompt, valueMappingPrompt } from "./server/data-sync-prompts.ts";

type OrchestratorRequest = {
  productFacts: unknown;
  referenceMaterials: unknown;
  generationRequirements: unknown;
};

type DataSyncAgentRequest = {
  stage?: unknown;
  sourceId?: unknown;
  targetId?: unknown;
  sourceSchema?: unknown;
  targetSchema?: unknown;
  sourceContent?: unknown;
  targetContent?: unknown;
  schemaMappings?: unknown;
  differences?: unknown;
  conversation?: unknown;
  hasFile?: unknown;
  fileName?: unknown;
  currentPageSpuId?: unknown;
};

type ImageGenerationRequest = {
  prompt?: unknown;
  task?: unknown;
  referenceMaterials?: unknown;
  imageModel?: unknown;
};

type ImageModel = "gpt2" | "nano-banana" | "seedream5";

const imageModelConfigs: Record<ImageModel, { providerModel: string; path: string }> = {
  gpt2: { providerModel: "gpt-image-2-1k2k", path: "/v1/images/generations" },
  "nano-banana": { providerModel: "gemini-3-pro-image-preview-lite", path: "/v1beta/models/gemini-3-pro-image-preview:generateContent" },
  seedream5: { providerModel: "doubao-seedream-5-0-260128", path: "/api/v3/images/generations" },
};

function isImageModel(value: unknown): value is ImageModel {
  return value === "gpt2" || value === "nano-banana" || value === "seedream5";
}

function toNanoBananaImagePart(value: string) {
  const matched = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  return matched
    ? { inline_data: { mime_type: matched[1], data: matched[2] } }
    : { text: `参考图片：${value}` };
}

function getImageUrl(payload: unknown, imageModel: ImageModel): string | undefined {
  const response = payload as {
    data?: Array<{ url?: string; b64_json?: string }>;
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> } }>;
  } | null;
  if (imageModel === "nano-banana") {
    const imagePart = response?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data || part.inline_data?.data);
    const inlineData = imagePart?.inlineData ?? imagePart?.inline_data;
    if (inlineData?.data) {
      const mimeType = (inlineData as { mimeType?: string; mime_type?: string }).mimeType
        ?? (inlineData as { mimeType?: string; mime_type?: string }).mime_type;
      return `data:${mimeType ?? "image/png"};base64,${inlineData.data}`;
    }
  }
  const result = response?.data?.[0];
  return result?.url ?? (result?.b64_json ? `data:image/png;base64,${result.b64_json}` : undefined);
}

function redactImageData(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:") || ((key === "data" || key === "b64_json") && value.length > 200)) {
      const prefix = value.startsWith("data:") ? value.slice(0, value.indexOf(",") + 1) : "Base64 ";
      return `${prefix}[omitted; ${value.length} chars]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => redactImageData(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactImageData(entryValue, entryKey)]));
  }
  return value;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJsonBody<T>(request: IncomingMessage, maxBytes = 1_000_000): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("请求内容过大");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function isPlan(value: unknown): value is { summary: string; categories: unknown[] } {
  if (!value || typeof value !== "object") return false;
  const plan = value as { summary?: unknown; categories?: unknown };
  if (typeof plan.summary !== "string" || !Array.isArray(plan.categories)) return false;
  return plan.categories.every((category) => {
    if (!category || typeof category !== "object") return false;
    const item = category as { categoryKey?: unknown; categoryLabel?: unknown; tasks?: unknown };
    return typeof item.categoryKey === "string"
      && typeof item.categoryLabel === "string"
      && Array.isArray(item.tasks)
      && item.tasks.every((task) => task && typeof task === "object"
        && typeof (task as { taskId?: unknown }).taskId === "string"
        && typeof (task as { imageType?: unknown }).imageType === "string"
        && typeof (task as { imageLabel?: unknown }).imageLabel === "string"
        && typeof (task as { instruction?: unknown }).instruction === "string");
  });
}

function isSyncPlatformId(value: unknown) {
  return value === "wanzhen" || value === "yishanghuo" || value === "jushuitan";
}

function isDataSyncAgentResult(stage: "route" | "schema" | "value", value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (stage === "route") {
    const route = value as { reply?: unknown; action?: unknown };
    if (typeof route.reply !== "string") return false;
    if (route.action === null) return true;
    if (!route.action || typeof route.action !== "object") return false;
    const action = route.action as { spuId?: unknown; sourceType?: unknown; sourceId?: unknown; targetId?: unknown };
    if (typeof action.spuId !== "string" || !action.spuId.trim() || !isSyncPlatformId(action.targetId)) return false;
    return action.sourceType === "file"
      ? action.sourceId === null
      : action.sourceType === "platform" && isSyncPlatformId(action.sourceId) && action.sourceId !== action.targetId;
  }
  if (stage === "schema") {
    const mappings = (value as { mappings?: unknown }).mappings;
    return Array.isArray(mappings) && mappings.every((mapping) => mapping && typeof mapping === "object"
      && typeof (mapping as { sourceFieldKey?: unknown }).sourceFieldKey === "string"
      && ((mapping as { sourceScope?: unknown }).sourceScope === "SPU" || (mapping as { sourceScope?: unknown }).sourceScope === "SKU")
      && typeof (mapping as { targetFieldKey?: unknown }).targetFieldKey === "string"
      && typeof (mapping as { createTargetField?: unknown }).createTargetField === "boolean");
  }
  const resolutions = (value as { resolutions?: unknown }).resolutions;
  return Array.isArray(resolutions) && resolutions.every((resolution) => resolution && typeof resolution === "object"
    && typeof (resolution as { differenceId?: unknown }).differenceId === "string"
    && ((resolution as { resolution?: unknown }).resolution === "overwrite" || (resolution as { resolution?: unknown }).resolution === "skip"));
}

function isDataSyncMessageInput(value: unknown): value is DataSyncMessageInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<DataSyncMessageInput>;
  if (typeof input.conversationId !== "string" || !input.conversationId.trim()
    || typeof input.messageId !== "string" || !input.messageId.trim()
    || typeof input.userId !== "string" || !input.userId.trim()
    || typeof input.message !== "string" || !input.message.trim()) return false;
  return input.context === undefined || (Boolean(input.context) && typeof input.context === "object" && !Array.isArray(input.context)
    && (input.context.spuId === undefined || (typeof input.context.spuId === "string" && Boolean(input.context.spuId.trim()))));
}

async function callDeepSeekDataSync(apiKey: string, model: string, input: DataSyncAgentRequest) {
  const stage = input.stage as "route" | "schema" | "value";
  const systemPrompt = stage === "route"
    ? `${routeIntentPrompt}\n\n调用上下文：${typeof input.currentPageSpuId === "string" ? `currentPageSpuId=${JSON.stringify(input.currentPageSpuId)}。这是当前页面可信上下文。` : "未提供 currentPageSpuId，必须要求用户在对话中明确提供 SPU ID。"}`
    : stage === "schema" ? schemaMappingPrompt : valueMappingPrompt;

  console.log(`\n[DeepSeek req] /api/data-sync-agent · ${stage}`);
  console.log(JSON.stringify(input, null, 2));
  const deepSeekResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 4000,
      stream: false,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  const apiPayload = await deepSeekResponse.json().catch(() => null) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | null } }>;
  } | null;
  console.log(`[DeepSeek resp · data-sync/${stage}] HTTP ${deepSeekResponse.status}`);
  console.log(JSON.stringify(apiPayload, null, 2));
  if (!deepSeekResponse.ok) throw new Error(apiPayload?.error?.message ?? "DeepSeek API 请求失败");
  const content = apiPayload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 没有返回数据同步建议");
  const result: unknown = JSON.parse(content);
  if (!isDataSyncAgentResult(stage, result)) throw new Error("DeepSeek 返回的数据同步建议结构不完整");
  if (stage === "route") {
    const route = result as { reply: string; action: null | { spuId: string } };
    if (route.action) {
      if (typeof input.currentPageSpuId === "string" && route.action.spuId !== input.currentPageSpuId) {
        return { reply: `当前页面只能同步 SPU ${input.currentPageSpuId}`, action: null };
      }
      if (input.currentPageSpuId === undefined) {
        const userText = (input.conversation as Array<{ role: string; content: string }>)
          .filter((message) => message.role === "user")
          .map((message) => message.content)
          .join("\n");
        if (!userText.includes(route.action.spuId)) return { reply: "请明确提供本次同步的 SPU ID", action: null };
      }
    }
  }
  return result;
}

function deepSeekOrchestratorPlugin(apiKey: string | undefined, model: string): Plugin {
  return {
    name: "local-deepseek-orchestrator",
    configureServer(server) {
      server.middlewares.use("/api/orchestrator", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        if (!apiKey) return sendJson(response, 503, { error: "未配置 DEEPSEEK_API_KEY。请复制 .env.example 为 .env.local 并填写 Key，然后重启 npm run dev。" });

        try {
          const input = await readJsonBody<OrchestratorRequest>(request);
          if (!Array.isArray(input.productFacts) || !Array.isArray(input.referenceMaterials) || typeof input.generationRequirements !== "string") {
            return sendJson(response, 400, { error: "物料规划输入格式不正确" });
          }

          console.log("\n[DeepSeek req] /api/orchestrator");
          console.log(JSON.stringify(input, null, 2));

          const deepSeekResponse = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              temperature: 0.2,
              max_tokens: 16000,
              stream: false,
              thinking: { type: "disabled" },
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: `你是电商物料生成的 Orchestrator Agent。根据商品事实、参考素材和用户的生成要求，规划需要生成的图片任务。

只输出一个合法 JSON 对象，不要输出 Markdown、解释或代码块。为避免无关冗余，每个 instruction 建议控制在 120 字以内，每个 qaChecklist 最多 5 项。JSON 必须严格符合：
{"summary":"本次需要生成 N 张商品物料","categories":[{"categoryKey":"stable-kebab-case-key","categoryLabel":"分类中文名","tasks":[{"taskId":"unique-stable-id","imageType":"type-key","imageLabel":"图片名称 #序号","instruction":"可直接交给图片生成模型的完整中文指令","references":["可选的参考素材文件名"],"qaChecklist":["商品一致性","构图符合用途","无虚构信息"]}]}]}

规则：只规划图片任务，跳过“配套文案”等非图片任务；分类、数量和类型必须由用户要求动态决定；“每个颜色”必须按商品事实中的颜色展开；“最多 N 张”不得超过 N 张；没有检测报告参考素材时不得规划检测报告图片；每个明确请求的图片只创建一个任务，不要自行增加变体；每个 taskId 必须全局唯一，references 只能引用输入中的真实文件名；summary 中的 N 必须等于所有 tasks 的实际数量。`,
                },
                { role: "user", content: JSON.stringify(input) },
              ],
            }),
          });

          const apiPayload = await deepSeekResponse.json().catch(() => null) as {
            error?: { message?: string };
            choices?: Array<{ message?: { content?: string | null } }>;
          } | null;
          if (!deepSeekResponse.ok) {
            console.error(`[DeepSeek resp] HTTP ${deepSeekResponse.status}`);
            console.error(JSON.stringify(apiPayload, null, 2));
            return sendJson(response, deepSeekResponse.status, { error: apiPayload?.error?.message ?? "DeepSeek API 请求失败" });
          }

          const content = apiPayload?.choices?.[0]?.message?.content;
          console.log(`[DeepSeek resp] HTTP ${deepSeekResponse.status}`);
          console.log(JSON.stringify(apiPayload, null, 2));
          if (!content) throw new Error("DeepSeek 没有返回规划内容");
          const plan: unknown = JSON.parse(content);
          if (!isPlan(plan)) throw new Error("DeepSeek 返回的规划结构不完整，请重试或调整 Prompt");

          // The model's prose summary can drift from the structured task list.
          // The UI must use one source of truth, so normalize it server-side.
          const taskCount = plan.categories.reduce<number>((total, category) => {
            const tasks = (category as { tasks: unknown[] }).tasks;
            return total + tasks.length;
          }, 0);
          return sendJson(response, 200, {
            ...plan,
            summary: `本次需要生成 ${taskCount} 张商品物料`,
          });
        } catch (error) {
          console.error("[DeepSeek error]", error);
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "物料规划服务异常" });
        }
      });
    },
  };
}

function deepSeekDataSyncPlugin(apiKey: string | undefined, model: string): Plugin {
  const handleDataSyncMessage = createDataSyncMessageHandler((stage, input) => {
    if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
    return callDeepSeekDataSync(apiKey, model, { stage, ...input });
  });
  return {
    name: "local-deepseek-data-sync-agent",
    configureServer(server) {
      server.middlewares.use("/api/data-sync-agent/message", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        if (!apiKey) return sendJson(response, 503, { error: "未配置 DEEPSEEK_API_KEY。请填写 .env.local 后重启 npm run dev。" });
        try {
          const input = await readJsonBody<unknown>(request);
          if (!isDataSyncMessageInput(input)) return sendJson(response, 400, { error: "数据同步消息输入格式不正确" });
          console.log("\n[Data Sync message req]");
          console.log(JSON.stringify(input, null, 2));
          const result = await handleDataSyncMessage(input);
          console.log("[Data Sync message resp]");
          console.log(JSON.stringify(result, null, 2));
          return sendJson(response, 200, result);
        } catch (error) {
          console.error("[Data Sync message error]", error);
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "数据同步消息处理异常" });
        }
      });

      server.middlewares.use("/api/data-sync-agent", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        if (!apiKey) return sendJson(response, 503, { error: "未配置 DEEPSEEK_API_KEY。请填写 .env.local 后重启 npm run dev。" });

        try {
          const input = await readJsonBody<DataSyncAgentRequest>(request);
          if (input.stage !== "route" && input.stage !== "schema" && input.stage !== "value") {
            return sendJson(response, 400, { error: "数据同步 Agent stage 不正确" });
          }
          if (input.stage !== "route" && (typeof input.sourceId !== "string" || typeof input.targetId !== "string")) {
            return sendJson(response, 400, { error: "数据同步 Agent 缺少来源或目标平台" });
          }
          if (input.stage === "route" && (!Array.isArray(input.conversation) || typeof input.hasFile !== "boolean")) {
            return sendJson(response, 400, { error: "同步路由对话输入格式不正确" });
          }
          if (input.stage === "route" && !(input.conversation as unknown[]).every((message) => message && typeof message === "object"
            && ((message as { role?: unknown }).role === "user" || (message as { role?: unknown }).role === "assistant")
            && typeof (message as { content?: unknown }).content === "string")) {
            return sendJson(response, 400, { error: "同步路由对话消息格式不正确" });
          }
          if (input.stage === "route" && input.currentPageSpuId !== undefined && (typeof input.currentPageSpuId !== "string" || !input.currentPageSpuId.trim())) {
            return sendJson(response, 400, { error: "当前页面 SPU ID 格式不正确" });
          }
          if (input.stage === "schema" && (!Array.isArray(input.sourceSchema) || !Array.isArray(input.targetSchema) || !input.sourceContent || !input.targetContent)) {
            return sendJson(response, 400, { error: "Schema mapping 输入格式不正确" });
          }
          if (input.stage === "value" && (!input.schemaMappings || !Array.isArray(input.differences))) {
            return sendJson(response, 400, { error: "Value mapping 输入格式不正确" });
          }

          const result = await callDeepSeekDataSync(apiKey, model, input);
          return sendJson(response, 200, result);
        } catch (error) {
          console.error("[DeepSeek data-sync error]", error);
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "数据同步 Agent 异常" });
        }
      });
    },
  };
}

function imageGenerationPlugin(apiKey: string | undefined, baseUrl: string | undefined, timeoutMs: number): Plugin {
  return {
    name: "local-image-generation",
    configureServer(server) {
      server.middlewares.use("/api/images/generations", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        if (!apiKey) return sendJson(response, 503, { error: "未配置 IMAGE_API_KEY。请填写 .env.local 后重启 npm run dev。" });

        try {
          const input = await readJsonBody<ImageGenerationRequest & {
            prompt: string;
            referenceMaterials: Array<{ source?: { kind?: string; value?: string } }>;
          }>(request, 55_000_000);
          if (typeof input.prompt !== "string" || !Array.isArray(input.referenceMaterials) || !isImageModel(input.imageModel)) {
            return sendJson(response, 400, { error: "图片生成输入格式不正确" });
          }

          // Haoee accepts image URLs or data URI Base64 values in `images`.
          // Values are selected in the hook before this endpoint is called, so no
          // unrelated task can receive another task's reference images.
          const images = input.referenceMaterials
            .map((reference) => reference.source)
            .filter((source): source is { kind: string; value: string } => Boolean(source?.value))
            .map((source) => source.value)
            .slice(0, 10);
          const config = imageModelConfigs[input.imageModel];
          const serviceOrigin = baseUrl ? new URL(baseUrl).origin : "https://maas.haoee.com";
          const endpoint = `${serviceOrigin}${config.path}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          const requestBody: Record<string, unknown> = input.imageModel === "gpt2"
            ? {
              model: config.providerModel,
              prompt: input.prompt,
              size: "1024x1024",
              response_format: "url",
              ...(images.length ? { images } : {}),
            }
            : input.imageModel === "nano-banana"
              ? {
                contents: [{ role: "user", parts: [{ text: input.prompt }, ...images.map(toNanoBananaImagePart)] }],
                generationConfig: {
                  responseModalities: ["TEXT", "IMAGE"],
                  imageConfig: { aspectRatio: "1:1", imageSize: "2K" },
                },
              }
              : {
                model: config.providerModel,
                prompt: input.prompt,
                size: "2K",
                output_format: "png",
                watermark: false,
                ...(images.length ? { image: images[0] } : {}),
              };

          const loggedRequestBody = redactImageData(requestBody);
          console.log(`\n[Haoee req · ${input.imageModel}] POST`, endpoint);
          console.log("Headers:", JSON.stringify({ Authorization: "[REDACTED]", ModelName: config.providerModel, "Content-Type": "application/json" }));
          console.log("Body:", JSON.stringify(loggedRequestBody, null, 2));

          let upstream: Response;
          try {
            upstream = await fetch(endpoint, {
              method: "POST",
              // Haoee expects the key itself (not an OpenAI-style `Bearer` prefix)
              // and requires the model in both the header and JSON body.
              headers: { "Content-Type": "application/json", Authorization: apiKey, ModelName: config.providerModel },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            });
          } catch (error) {
            if (controller.signal.aborted) throw new Error(`图片生成请求超时（${Math.ceil(timeoutMs / 1000)} 秒）`);
            throw error;
          } finally {
            clearTimeout(timeout);
          }
          const payload = await upstream.json().catch(() => null) as {
            error?: { message?: string } | string;
            data?: Array<{ url?: string; b64_json?: string; cost?: number }>;
            cost?: number;
            usage?: { cost?: number };
          } | null;
          console.log(`[Haoee resp · ${input.imageModel}] HTTP ${upstream.status}`);
          console.log(JSON.stringify(redactImageData(payload), null, 2));
          if (!upstream.ok) {
            const message = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
            return sendJson(response, upstream.status, { error: message ?? `图片生成 API 请求失败（HTTP ${upstream.status}）` });
          }
          const result = payload?.data?.[0];
          const imageUrl = getImageUrl(payload, input.imageModel);
          if (!imageUrl) throw new Error("图片生成 API 未返回可用图片数据");
          return sendJson(response, 200, { imageUrl, cost: result?.cost ?? payload?.cost ?? payload?.usage?.cost });
        } catch (error) {
          console.error("[Haoee error]", error);
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "图片生成服务异常" });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      tailwindcss(),
      deepSeekOrchestratorPlugin(env.DEEPSEEK_API_KEY, env.DEEPSEEK_MODEL || "deepseek-v4-flash"),
      deepSeekDataSyncPlugin(env.DEEPSEEK_API_KEY, env.DEEPSEEK_MODEL || "deepseek-v4-flash"),
      imageGenerationPlugin(env.IMAGE_API_KEY, env.IMAGE_API_BASE_URL, Number(env.IMAGE_API_TIMEOUT_MS || 120_000)),
    ],
  };
});
