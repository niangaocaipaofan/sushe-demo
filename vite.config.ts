import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createDataSyncMessageHandler, type DataSyncMessageInput } from "./server/data-sync-message-handler.ts";
import { runDeepSeekDataSyncAgent, type DataSyncAgentInput } from "./server/data-sync-agent-runtime.ts";
import { createDataSyncService } from "./server/data-sync-service.ts";
import { createMaterialGenerationServiceFromEnv, type StartMaterialGenerationInput } from "./server/material-generation-service.ts";
import { persistMaterialAsset } from "./server/material-asset-store.ts";
import { getWorkflowContext } from "./server/workflow-context.ts";
import { listWorkflowEvents, produceWorkflowEvent, type WorkflowEventType } from "./server/workflow-events.ts";
import { completeNodeAndProduceWorkflowEvent, resetWorkflowToNode, updateWorkflowNodeMetadata } from "./server/workflow-commands.ts";
import { listStoredWorkflowVersions, listStoredWorkflows } from "./server/workflow-store.ts";
import type { DifferenceResolution, PlatformId, SchemaMappings, SyncContent, SyncDifference, SyncSourceId } from "./src/types/data-sync.ts";
import type { ProductFact, ReferenceMaterial } from "./src/types/material-generation.ts";

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

type ImageModel = "smart-elderly" | "gpt2" | "nano-banana" | "seedream5";

const imageModelConfigs: Record<ImageModel, { providerModel: string; path: string }> = {
  "smart-elderly": { providerModel: "runninghub-smart-elderly", path: "/openapi/v2/run/ai-app" },
  gpt2: { providerModel: "gpt-image-2-1k2k", path: "/v1/images/generations" },
  "nano-banana": { providerModel: "gemini-3-pro-image-preview-lite", path: "/v1beta/models/gemini-3-pro-image-preview:generateContent" },
  seedream5: { providerModel: "doubao-seedream-5-0-260128", path: "/api/v3/images/generations" },
};

function isImageModel(value: unknown): value is ImageModel {
  return value === "smart-elderly" || value === "gpt2" || value === "nano-banana" || value === "seedream5";
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
    if (size > maxBytes) throw new Error(`请求内容过大（上限约 ${Math.floor(maxBytes / 1_000_000)} MB）`);
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

async function readBinaryBody(request: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error(`素材文件过大（单文件上限约 ${Math.floor(maxBytes / 1_000_000)} MB）`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function isWorkflowEventType(value: unknown): value is WorkflowEventType {
  return value === "workflow.created" || value === "workflow.node.completed";
}

function materialGenerationApiPlugin(
  materialService: ReturnType<typeof createMaterialGenerationServiceFromEnv>,
  maxRequestBytes: number,
  maxAssetBytes: number,
): Plugin {
  return {
    name: "local-material-generation-api",
    configureServer(server) {
      server.middlewares.use("/api/material-generation/assets", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        try {
          const encodedName = Array.isArray(request.headers["x-material-file-name"])
            ? request.headers["x-material-file-name"][0]
            : request.headers["x-material-file-name"];
          const mimeType = request.headers["content-type"]?.split(";")[0] || "application/octet-stream";
          if (!encodedName || !mimeType.startsWith("image/")) {
            return sendJson(response, 400, { error: "素材上传缺少文件名或不是支持的图片格式" });
          }
          let fileName: string;
          try {
            fileName = decodeURIComponent(encodedName);
          } catch {
            return sendJson(response, 400, { error: "素材文件名编码不正确" });
          }
          const bytes = await readBinaryBody(request, maxAssetBytes);
          if (!bytes.length) return sendJson(response, 400, { error: "素材文件内容为空" });
          const asset = await persistMaterialAsset(bytes, fileName, mimeType);
          return sendJson(response, 201, { asset: { assetId: asset.assetId, size: asset.size, type: asset.mimeType } });
        } catch (error) {
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "素材上传失败" });
        }
      });
      server.middlewares.use("/api/material-generation/tasks", async (request, response) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const taskId = url.pathname.split("/").filter(Boolean)[0];
        try {
          if (request.method === "GET" && taskId) {
            const workflowId = url.searchParams.get("workflowId");
            if (!workflowId) return sendJson(response, 400, { error: "缺少 workflowId" });
            const task = await materialService.get(taskId, workflowId);
            return task ? sendJson(response, 200, { task }) : sendJson(response, 404, { error: `未找到物料生成任务：${taskId}` });
          }
          if (request.method === "GET") {
            const workflowId = url.searchParams.get("workflowId");
            if (!workflowId) return sendJson(response, 400, { error: "缺少 workflowId" });
            return sendJson(response, 200, { tasks: await materialService.list(workflowId) });
          }
          if (request.method !== "POST" || taskId) return sendJson(response, 405, { error: "请求方法或路径不支持" });
          const input = await readJsonBody<Partial<StartMaterialGenerationInput> & {
            productFacts?: ProductFact[];
            referenceMaterials?: ReferenceMaterial[];
          }>(request, maxRequestBytes);
          if (typeof input.workflowId !== "string" || !input.workflowId.trim()
            || typeof input.nodeId !== "string" || !input.nodeId.trim()
            || !isImageModel(input.imageModel)
            || typeof input.generationRequirements !== "string"
            || !Array.isArray(input.productFacts) || !Array.isArray(input.referenceMaterials)) {
            return sendJson(response, 400, { error: "物料生成任务输入格式不正确" });
          }
          const task = await materialService.start({
            workflowId: input.workflowId,
            nodeId: input.nodeId,
            source: "web",
            imageModel: input.imageModel,
            generationRequirements: input.generationRequirements,
            productFacts: input.productFacts,
            referenceMaterials: input.referenceMaterials,
          });
          return sendJson(response, 202, { task });
        } catch (error) {
          console.error("[Material generation API error]", error);
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "物料生成服务异常" });
        }
      });
    },
  };
}

function isPlatformId(value: unknown): value is PlatformId {
  return value === "wanzhen" || value === "yishanghuo" || value === "jushuitan";
}

function isSyncSourceId(value: unknown): value is SyncSourceId {
  return value === "uploaded-file" || isPlatformId(value);
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

function workflowApiPlugin(): Plugin {
  return {
    name: "local-workflow-api",
    configureServer(server) {
      server.middlewares.use("/api/workflows", async (request, response) => {
        if (request.method !== "GET") return sendJson(response, 405, { error: "只支持 GET 请求" });
        return sendJson(response, 200, {
          workflows: await listStoredWorkflows(),
          workflowVersions: await listStoredWorkflowVersions(),
        });
      });

      server.middlewares.use("/api/workflow-context", async (request, response) => {
        if (request.method !== "GET") return sendJson(response, 405, { error: "只支持 GET 请求" });
        const workflowId = new URL(request.url ?? "", "http://localhost").searchParams.get("workflowId");
        if (!workflowId) return sendJson(response, 400, { error: "缺少 workflowId" });
        const context = await getWorkflowContext(workflowId);
        if (!context) return sendJson(response, 404, { error: `未找到 workflow：${workflowId}` });
        return sendJson(response, 200, context);
      });

      server.middlewares.use("/api/workflow-events", async (request, response) => {
        if (request.method === "GET") return sendJson(response, 200, { events: await listWorkflowEvents() });
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 GET 或 POST 请求" });
        try {
          const input = await readJsonBody<{ type?: unknown; workflowId?: unknown; nodeId?: unknown; workflowVersion?: unknown; idempotencyKey?: unknown }>(request);
          if (!isWorkflowEventType(input.type) || typeof input.workflowId !== "string" || !input.workflowId.trim()
            || typeof input.workflowVersion !== "number" || !Number.isInteger(input.workflowVersion) || (input.nodeId !== undefined && (typeof input.nodeId !== "string" || !input.nodeId.trim()))
            || (input.idempotencyKey !== undefined && (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()))) {
            return sendJson(response, 400, { error: "workflow 事件输入格式不正确" });
          }
          if (input.type === "workflow.node.completed" && !input.nodeId) {
            return sendJson(response, 400, { error: "workflow.node.completed 必须提供 nodeId" });
          }
          if (input.type === "workflow.created" && input.nodeId) {
            return sendJson(response, 400, { error: "workflow.created 不能提供 nodeId" });
          }
          const context = await getWorkflowContext(input.workflowId);
          if (!context) return sendJson(response, 404, { error: `未找到 workflow：${input.workflowId}` });
          if (input.nodeId && !context.dag.nodes.some((node) => node.id === input.nodeId)) {
            return sendJson(response, 404, { error: `workflow 中未找到 node：${input.nodeId}` });
          }
          const event = await produceWorkflowEvent({
            type: input.type,
            workflowId: input.workflowId,
            ...(input.nodeId ? { nodeId: input.nodeId } : {}),
            workflowVersion: input.workflowVersion,
            ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          });
          return sendJson(response, 202, { event });
        } catch (error) {
          console.error("[Workflow event error]", error);
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "workflow 事件写入异常" });
        }
      });

      server.middlewares.use("/api/workflow-node-completions", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        try {
          const input = await readJsonBody<{ workflowId?: unknown; nodeId?: unknown }>(request);
          if (typeof input.workflowId !== "string" || !input.workflowId.trim() || typeof input.nodeId !== "string" || !input.nodeId.trim()) {
            return sendJson(response, 400, { error: "workflowId 和 nodeId 必须提供" });
          }
          const result = await completeNodeAndProduceWorkflowEvent(input.workflowId, input.nodeId);
          return sendJson(response, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "完成节点失败";
          const status = message.startsWith("未找到") || message.includes("当前不是进行中") ? 409 : 500;
          return sendJson(response, status, { error: message });
        }
      });

      server.middlewares.use("/api/workflow-node-rollbacks", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        try {
          const input = await readJsonBody<{ workflowId?: unknown; nodeId?: unknown }>(request);
          if (typeof input.workflowId !== "string" || !input.workflowId.trim() || typeof input.nodeId !== "string" || !input.nodeId.trim()) {
            return sendJson(response, 400, { error: "workflowId 和 nodeId 必须提供" });
          }
          return sendJson(response, 200, await resetWorkflowToNode(input.workflowId, input.nodeId));
        } catch (error) {
          const message = error instanceof Error ? error.message : "回滚节点失败";
          return sendJson(response, message.includes("未找到") || message.includes("不能回滚") ? 409 : 500, { error: message });
        }
      });

      server.middlewares.use("/api/workflow-node-metadata", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        try {
          const input = await readJsonBody<{
            workflowId?: unknown;
            nodeId?: unknown;
            expectedVersion?: unknown;
            patch?: { owner?: unknown; plannedStart?: unknown; plannedCompletion?: unknown; sop?: unknown };
          }>(request);
          const patch = input.patch;
          if (typeof input.workflowId !== "string" || !input.workflowId.trim() || typeof input.nodeId !== "string" || !input.nodeId.trim()
            || typeof input.expectedVersion !== "number" || !Number.isInteger(input.expectedVersion) || !patch || typeof patch !== "object"
            || (patch.owner !== undefined && patch.owner !== null && (!Array.isArray(patch.owner) || !patch.owner.every((owner) => typeof owner === "string" && owner.trim())))
            || (patch.plannedStart !== undefined && patch.plannedStart !== null && (typeof patch.plannedStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(patch.plannedStart)))
            || (patch.plannedCompletion !== undefined && patch.plannedCompletion !== null && (typeof patch.plannedCompletion !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(patch.plannedCompletion)))
            || (patch.sop !== undefined && typeof patch.sop !== "string")
            || (patch.owner === undefined && patch.plannedStart === undefined && patch.plannedCompletion === undefined && patch.sop === undefined)) {
            return sendJson(response, 400, { error: "节点信息更新输入格式不正确" });
          }
          const result = await updateWorkflowNodeMetadata(
            input.workflowId,
            input.nodeId,
            patch as { owner?: string[] | null; plannedStart?: string | null; plannedCompletion?: string | null; sop?: string },
            input.expectedVersion,
          );
          return sendJson(response, 200, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "更新节点信息失败";
          const status = message.includes("版本已变化") ? 409 : 500;
          return sendJson(response, status, { error: message });
        }
      });
    },
  };
}

function deepSeekDataSyncPlugin(apiKey: string | undefined, model: string): Plugin {
  const dataSyncService = createDataSyncService((stage, input) => {
    if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
    return runDeepSeekDataSyncAgent(apiKey, model, { stage, ...input });
  });
  const handleDataSyncMessage = createDataSyncMessageHandler(dataSyncService);
  return {
    name: "local-deepseek-data-sync-agent",
    configureServer(server) {
      server.middlewares.use("/api/data-sync/schema", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        if (!apiKey) return sendJson(response, 503, { error: "未配置 DEEPSEEK_API_KEY。请填写 .env.local 后重启 npm run dev。" });
        try {
          const input = await readJsonBody<{ spuId?: unknown; sourceId?: unknown; targetId?: unknown; sourceContent?: unknown }>(request);
          if (typeof input.spuId !== "string" || !input.spuId.trim() || !isSyncSourceId(input.sourceId) || !isPlatformId(input.targetId)
            || (input.sourceId === "uploaded-file" && (!input.sourceContent || typeof input.sourceContent !== "object"))) {
            return sendJson(response, 400, { error: "Schema mapping 输入格式不正确" });
          }
          const output = await dataSyncService.suggestSchemaMappings({
            spuId: input.spuId,
            sourceId: input.sourceId,
            targetId: input.targetId,
            ...(input.sourceContent ? { sourceContent: input.sourceContent as SyncContent } : {}),
          });
          return sendJson(response, 200, { mappings: output.suggestions });
        } catch (error) {
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "Schema mapping 异常" });
        }
      });

      server.middlewares.use("/api/data-sync/value-suggestions", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        if (!apiKey) return sendJson(response, 503, { error: "未配置 DEEPSEEK_API_KEY。请填写 .env.local 后重启 npm run dev。" });
        try {
          const input = await readJsonBody<{ sourceId?: unknown; targetId?: unknown; schemaMappings?: unknown; differences?: unknown }>(request);
          if (!isSyncSourceId(input.sourceId) || !isPlatformId(input.targetId) || !input.schemaMappings || !Array.isArray(input.differences)) {
            return sendJson(response, 400, { error: "Value mapping 输入格式不正确" });
          }
          const resolutions = await dataSyncService.suggestValueResolutions({
            sourceId: input.sourceId,
            targetId: input.targetId,
            schemaMappings: input.schemaMappings as SchemaMappings,
            differences: input.differences as SyncDifference[],
          });
          return sendJson(response, 200, { resolutions });
        } catch (error) {
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "Value mapping 异常" });
        }
      });

      server.middlewares.use("/api/data-sync/execute", async (request, response) => {
        if (request.method !== "POST") return sendJson(response, 405, { error: "只支持 POST 请求" });
        try {
          const input = await readJsonBody<{
            spuId?: unknown; sourceId?: unknown; targetId?: unknown; schemaMappings?: unknown;
            selectedMappingIds?: unknown; resolutions?: unknown; sourceContent?: unknown;
          }>(request);
          if (typeof input.spuId !== "string" || !input.spuId.trim() || !isSyncSourceId(input.sourceId) || !isPlatformId(input.targetId)
            || !input.schemaMappings || !Array.isArray(input.selectedMappingIds) || !input.resolutions
            || (input.sourceId === "uploaded-file" && (!input.sourceContent || typeof input.sourceContent !== "object"))) {
            return sendJson(response, 400, { error: "数据同步执行输入格式不正确" });
          }
          const output = dataSyncService.executePlan({
            spuId: input.spuId,
            sourceId: input.sourceId,
            targetId: input.targetId,
            schemaMappings: input.schemaMappings as SchemaMappings,
            selectedMappingIds: input.selectedMappingIds as string[],
            resolutions: input.resolutions as Record<string, DifferenceResolution>,
            ...(input.sourceContent ? { sourceContent: input.sourceContent as SyncContent } : {}),
          });
          return sendJson(response, 200, output);
        } catch (error) {
          return sendJson(response, 500, { error: error instanceof Error ? error.message : "数据同步执行异常" });
        }
      });

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

          const result = await runDeepSeekDataSyncAgent(apiKey, model, input as DataSyncAgentInput);
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
          if (input.imageModel === "smart-elderly") {
            return sendJson(response, 400, { error: "“智慧老人”模型仅支持物料生成任务接口，请从物料生成 Agent 发起任务。" });
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
  const materialService = createMaterialGenerationServiceFromEnv(env);
  const configuredMaterialRequestBytes = Number(env.MATERIAL_GENERATION_MAX_REQUEST_BYTES || 10_000_000);
  const materialRequestBytes = Number.isFinite(configuredMaterialRequestBytes) && configuredMaterialRequestBytes > 0
    ? configuredMaterialRequestBytes
    : 10_000_000;
  const configuredMaterialAssetBytes = Number(env.MATERIAL_ASSET_MAX_BYTES || 100_000_000);
  const materialAssetBytes = Number.isFinite(configuredMaterialAssetBytes) && configuredMaterialAssetBytes > 0
    ? configuredMaterialAssetBytes
    : 100_000_000;
  return {
    plugins: [
      react(),
      tailwindcss(),
      workflowApiPlugin(),
      materialGenerationApiPlugin(
        materialService,
        materialRequestBytes,
        materialAssetBytes,
      ),
      deepSeekDataSyncPlugin(env.DEEPSEEK_API_KEY, env.DEEPSEEK_MODEL || "deepseek-v4-flash"),
      imageGenerationPlugin(env.IMAGE_API_KEY, env.IMAGE_API_BASE_URL, Number(env.IMAGE_API_TIMEOUT_MS || 120_000)),
    ],
  };
});
