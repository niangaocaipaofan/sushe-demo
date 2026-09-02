import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { loadEnv } from "vite";
import { z } from "zod/v4";
import { runDeepSeekDataSyncAgent } from "./data-sync-agent-runtime.ts";
import { createDataSyncMessageHandler, type DataSyncMessageInput } from "./data-sync-message-handler.ts";
import { createDataSyncService } from "./data-sync-service.ts";
import { createMaterialGenerationServiceFromEnv } from "./material-generation-service.ts";
import { getWorkflowContext } from "./workflow-context.ts";
import {
  createWorkflowAndProduceEvent,
  updateWorkflowNodeMetadata,
  updateWorkflowNodeStatusAndProduceEvent,
} from "./workflow-commands.ts";

const server = new McpServer({ name: "sushe-workflow", version: "0.1.0" });
const env = loadEnv("development", process.cwd(), "");
const dataAgentApiKey = env.DEEPSEEK_API_KEY;
const dataAgentModel = env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const materialGenerationService = createMaterialGenerationServiceFromEnv(env);
const workflowIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, "workflowId 必须是小写字母、数字或连字符");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD");
const dataSyncService = createDataSyncService((stage, input) => {
  if (!dataAgentApiKey) throw new Error("数据 Agent 不可用：未配置 DEEPSEEK_API_KEY。请在项目 .env.local 中填写后重启 workflow MCP server。");
  return runDeepSeekDataSyncAgent(dataAgentApiKey, dataAgentModel, { stage, ...input });
});
const handleDataAgentMessage = createDataSyncMessageHandler(dataSyncService);

function result(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

server.registerTool(
  "get_data_agent_status",
  {
    title: "查看数据 Agent 状态",
    description: "检查数据 Agent 是否已配置并可处理数据对比或同步消息；不会返回任何密钥。",
    inputSchema: z.object({}),
  },
  async () => result({
    available: Boolean(dataAgentApiKey),
    model: dataAgentModel,
    message: dataAgentApiKey
      ? "数据 Agent 已配置，可调用 data_agent_message。"
      : "数据 Agent 未配置 DEEPSEEK_API_KEY。请在项目 .env.local 中填写后重启 workflow MCP server。",
  }),
);

server.registerTool(
  "compare_data_sync",
  {
    title: "一次性完成数据字段对比",
    description: "一次调用内由数据 Agent 自行完成路由识别、schema mapping、字段值差异和 value mapping 建议。仅校验，绝不执行同步；飞书可直接展示返回的 schemaMappings、differences 和 summary。",
    inputSchema: z.object({
      conversationId: z.string().min(1).describe("入口会话的稳定 ID"),
      messageId: z.string().min(1).describe("入口消息的唯一 ID，用于幂等"),
      userId: z.string().min(1).describe("入口用户的稳定 ID"),
      message: z.string().min(1).describe("用户原始消息，例如：对比 SPU-260827-001 在万阵和易尚货的字段"),
      context: z.object({ spuId: z.string().min(1).optional() }).optional(),
    }),
  },
  async (input) => {
    try {
      return result(await dataSyncService.compareOnce(input as DataSyncMessageInput));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "data_agent_message",
  {
    title: "向数据协同专员发送消息",
    description: "飞书等入口应原样转发用户消息，并原样展示返回的 message/display。数据 Agent 自行识别校验或同步意图、保存 schema mapping；用户查看字段对比时，确认 schema 后仅返回 value mapping，不会同步。",
    inputSchema: z.object({
      conversationId: z.string().min(1).describe("入口会话的稳定 ID"),
      messageId: z.string().min(1).describe("入口消息的唯一 ID，用于幂等"),
      userId: z.string().min(1).describe("入口用户的稳定 ID"),
      message: z.string().min(1).describe("用户原始消息，例如：我想看万阵和易尚货的字段对比状态"),
      context: z.object({ spuId: z.string().min(1).optional() }).optional(),
    }),
  },
  async (input) => {
    try {
      return result(await handleDataAgentMessage(input as DataSyncMessageInput));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "create_material_generation_task",
  {
    title: "创建物料生成任务",
    description: "为指定商品发布 workflow 的物料生成节点创建后台任务。任务会持久化到本地并立即返回 taskId；同一 workflowId 与 idempotencyKey 的重复调用不会重复创建。未提供生成要求时使用完整商详页默认预设。",
    inputSchema: z.object({
      workflowId: workflowIdSchema.describe("商品发布 workflow ID"),
      nodeId: z.string().min(1).describe("支持物料生成能力的节点实例 ID，例如 gray-suit:visual-assets"),
      idempotencyKey: z.string().min(1).describe("调用幂等键，推荐使用触发本次生成的 workflow eventId"),
      imageModel: z.enum(["smart-elderly", "gpt2", "nano-banana", "seedream5"]).default("smart-elderly"),
      generationRequirements: z.string().min(1).optional().describe("具体生成要求；不传时使用完整商详页默认预设"),
      referenceMaterials: z.array(z.object({
        name: z.string().min(1),
        type: z.string().min(1).default("image/*"),
        size: z.number().nonnegative().default(0),
        recognizedRole: z.string().optional(),
        source: z.object({
          kind: z.enum(["data_url", "url", "file_id", "file_path"]),
          value: z.string().min(1),
        }).optional(),
      })).max(20).default([]),
    }),
  },
  async (input) => {
    try {
      const task = await materialGenerationService.start({ ...input, source: "mcp" });
      return result({
        taskId: task.id,
        workflowId: task.workflowId,
        nodeId: task.nodeId,
        status: task.status,
        createdAt: task.createdAt,
      });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "get_workflow_context",
  {
    title: "获取工作流完整上下文",
    description: "返回指定 workflow 的完整 DAG、节点、依赖关系、负责人、SOP 和各节点 workspace tab/capability 数据。",
    inputSchema: z.object({ workflowId: z.string().min(1).describe("工作流 ID，例如 gray-suit") }),
  },
  async ({ workflowId }) => {
    const context = await getWorkflowContext(workflowId);
    if (!context) {
      return { content: [{ type: "text" as const, text: `未找到 workflow：${workflowId}` }], isError: true };
    }
    return result(context);
  },
);

server.registerTool(
  "create_workflow",
  {
    title: "创建工作流",
    description: "基于 DAG 模板创建 workflow，并生产 workflow.created 事件。根节点会以 running 状态创建，其余节点为 pending。",
    inputSchema: z.object({
      workflowId: workflowIdSchema.describe("新 workflow 的稳定 ID，例如 blue-dress"),
      templateId: z.string().min(1).describe("DAG 模板 ID，例如 product-publishing"),
      spu: z.string().min(1),
      name: z.string().min(1),
    }),
  },
  async (input) => {
    try {
      const output = await createWorkflowAndProduceEvent(input);
      return result({ workflowId: output.workflow.id, workflowVersion: output.workflowVersion, event: output.event });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "update_workflow_node_status",
  {
    title: "更新工作流节点状态",
    description: "将 pending 节点启动为 running，或将 running 节点完成为 completed。服务端会校验依赖；完成后自动解锁下游节点并生产 workflow.node.completed 事件。",
    inputSchema: z.object({
      workflowId: workflowIdSchema,
      nodeId: z.string().min(1),
      status: z.enum(["running", "completed"]),
      expectedVersion: z.number().int().positive().describe("从 get_workflow_context 读取的 workflow.version"),
      idempotencyKey: z.string().min(1),
    }),
  },
  async ({ workflowId, nodeId, status, expectedVersion, idempotencyKey }) => {
    try {
      const output = await updateWorkflowNodeStatusAndProduceEvent(workflowId, nodeId, status, expectedVersion, idempotencyKey);
      return result({ workflowId, nodeId, status, workflowVersion: output.workflowVersion, event: output.event });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  "update_workflow_node",
  {
    title: "更新工作流节点信息",
    description: "仅更新节点负责人和计划时间；不能通过此工具修改节点状态、DAG 或 workspace tab。传 null 可清空单个字段。",
    inputSchema: z.object({
      workflowId: workflowIdSchema,
      nodeId: z.string().min(1),
      patch: z.object({
        owner: z.array(z.string().min(1)).max(20).nullable().optional(),
        plannedStart: dateSchema.nullable().optional(),
        plannedCompletion: dateSchema.nullable().optional(),
      }).refine((patch) => Object.keys(patch).length > 0, "至少提供一个可更新字段"),
      expectedVersion: z.number().int().positive().describe("从 get_workflow_context 读取的 workflow.version"),
    }),
  },
  async ({ workflowId, nodeId, patch, expectedVersion }) => {
    try {
      const output = await updateWorkflowNodeMetadata(workflowId, nodeId, patch, expectedVersion);
      return result({ workflowId, nodeId, workflowVersion: output.workflowVersion });
    } catch (error) {
      return errorResult(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("sushe-workflow MCP server is running on stdio");
console.error(dataAgentApiKey
  ? `data Agent is configured (model: ${dataAgentModel})`
  : "data Agent is unavailable: DEEPSEEK_API_KEY is missing from .env.local");
