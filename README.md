# 商品发布工作台 Demo

基于 Vite、React 19、TypeScript、Tailwind CSS v4、HeroUI v3、React Flow 与 Dagre 的纯前端演示项目。共享流程定义位于 `src/data/templates/`，每个商品发布流的独立实例位于 `src/data/instances/`。

## 运行

```bash
npm install
npm run dev
```

生产构建检查：

```bash
npm run build
```

## DeepSeek 主 Agent（本地）

物料生成 Agent 的规划阶段通过本地 Vite API 调用 DeepSeek，API Key 不会发送到浏览器。

```bash
cp .env.example .env.local
```

在 `.env.local` 中填写 `DEEPSEEK_API_KEY` 和所选图片服务的配置后，重启 `npm run dev`。物料生成依次执行任务编排和并行图片生成；每个图片任务只生成一次，不包含本地质检或重试逻辑。

当前数据同步页面只提供手动来源/目标选择，页面上的对话框与文件上传入口暂未开放。底层仍保留通用路由协议与文件解析层：调用方提供 `currentPageSpuId` 时使用可信页面上下文，否则用户必须在对话中明确写出 SPU ID。三个 mock 平台的数据、上传数据校验、字段映射、值映射与提交都以该 SPU 为数据边界。

## Workflow Agent MVP

本地 MVP 提供一个只读 MCP tool 和一个持久化 outbox worker：

```bash
npm run workflow:mcp
npm run workflow:worker
```

`get_workflow_context` 返回指定 workflow 的完整 DAG、节点、依赖、负责人、节点实例 SOP 和 workspace tab/capability 信息。MCP server 使用 stdio，供外部 Workflow Agent runtime 启动和调用。

当前 MCP server 还提供三项 workflow 写能力：

- `create_workflow`：基于 DAG 模板创建 workflow，并生产 `workflow.created` 事件。
- `update_workflow_node_status`：将 node 变为 `running` 或 `completed`；完成时会校验依赖、自动解锁下游节点，并生产 `workflow.node.completed` 事件。
- `update_workflow_node`：仅更新负责人、计划开始时间和计划完成时间。

所有更新工具都要求传入从 `get_workflow_context` 读取的 `workflow.version`。版本不一致时服务端会拒绝写入，Agent 应重新读取完整上下文后再决定操作。

状态已经由业务服务提交后，可向本地 outbox 生产最小事件：

```http
POST /api/workflow-events
Content-Type: application/json
```

```json
{
  "type": "workflow.node.completed",
  "workflowId": "gray-suit",
  "nodeId": "gray-suit:visual-assets",
  "workflowVersion": 1
}
```

Worker 会消费 `.runtime/workflow-events.json` 中的事件，并将最小 event POST 到 `WORKFLOW_AGENT_RUNNER_URL`。该 Agent runtime 再通过 MCP 的 `get_workflow_context` 获取完整上下文。未配置该 URL 时，worker 使用本地 mock wake 记录投递，便于验证 outbox、重试和幂等链路。

工作台中的“标记为完成”会调用：

```http
POST /api/workflow-node-completions
Content-Type: application/json
```

```json
{
  "workflowId": "gray-suit",
  "nodeId": "gray-suit:visual-assets"
}
```

服务端会持久化节点状态、解锁满足依赖的下游节点，并生产 `workflow.node.completed` outbox 事件。workflow 运行态保存在被 Git 忽略的 `.runtime/workflows.json` 中；删除该目录即可重置本地 demo 状态。

### 对话式 Data Sync Agent API

飞书等入口 Agent 可以把用户原始消息持续转发到同一个接口：

```http
POST /api/data-sync-agent/message
Content-Type: application/json
```

```json
{
  "conversationId": "feishu-chat-123",
  "messageId": "msg-001",
  "userId": "ou-user-001",
  "message": "把 SPU-260827-001 从万阵同步到易尚货"
}
```

服务端以 `conversationId + userId` 保存当前内存会话，并用 `messageId` 防止重复处理。接口会依次返回 `waiting_for_schema_confirmation`、`waiting_for_value_confirmation` 和 `completed`；入口 Agent 只需展示返回的 `message`/`display`，并把用户后续的 `OK` 原样转发。当前会话存储与执行均为 `local-mock`，重启开发服务后会清空，也不会改写源码目录里的 JSON 文件。

### 数据 Agent MCP（飞书透传入口）

```bash
npm run workflow:mcp
```

数据 Agent 与 workflow 共用一个 stdio MCP server，提供 `get_data_agent_status`、`compare_data_sync` 和 `data_agent_message` 三个 tool。飞书 Agent 启动或重连后可先调用 `get_data_agent_status`：返回 `available: true` 才转发用户消息；未配置时会说明如何处理，且不会泄露 Key。只需一次性返回字段映射和值对比时，调用 `compare_data_sync`；需要保留用户对 schema/value 的逐步确认时，透传给 `data_agent_message`。两种调用都使用稳定的 `conversationId`、`messageId`、`userId`，飞书不需要生成或理解 mapping。

数据 Agent 会自行识别只读校验或同步意图，并在自己的会话中保存 schema mapping。对于“查看/对比/校验字段状态”这类请求：首次调用返回字段映射并等待 `OK`；用户回复 `OK` 后返回字段值对比并结束，绝不执行同步。`messageId` 可安全重试，开发服务或 MCP server 重启后会话会清空。

网页端 HTTP 与 MCP 共用 `server/data-sync-service.ts`：schema mapping、value mapping 和执行由同一个应用服务编排；字段 schema、mapping 归一化、值差异与 resolution 校验共用 `src/services/data-sync-core.ts`。网页端保留交互草稿和字段勾选状态，通过 `/api/data-sync/schema`、`/api/data-sync/value-suggestions`、`/api/data-sync/execute` 调用服务；MCP 则在进程内直接调用同一服务。

### 物料生成任务、历史与 MCP

物料生成现在由服务端任务驱动。网页和 MCP 共用 `server/material-generation-service.ts`，任务与逐图状态持久化在被 Git 忽略的 `.runtime/material-generation-tasks.json`。页面刷新后仍可在“物料生成 Agent → 历史任务”中查看；历史列表和详情都以 `workflowId` 为强制数据边界。

网页接口：

```http
POST /api/material-generation/tasks
GET  /api/material-generation/tasks?workflowId=knit-cardigan
GET  /api/material-generation/tasks/:taskId?workflowId=knit-cardigan
```

MCP 提供 `create_material_generation_task`。调用方传入 `workflowId`、支持物料生成的 `nodeId` 和稳定的 `idempotencyKey`，工具会持久化任务并立即返回 `taskId`；不传 `generationRequirements` 时使用完整商详页默认预设。推荐使用触发本次生成的 workflow eventId 作为幂等键。参考素材不要求必须是 URL：同机 MCP 可传 `source.kind: "file_path"` 和绝对路径，服务端会直接读取本地文件并上传；也支持 `url`、`data_url` 和已上传 RunningHub 文件的 `file_id`。

任务进入终态后会写入 `material.generation.completed` 或 `material.generation.failed` outbox 事件。现有 `workflow:worker` 会沿用同一条投递链路唤醒飞书 Agent，事件中包含 `workflowId`、`nodeId` 和 `materialTaskId`。

网页会先把参考图片逐文件写入 `.runtime/material-assets`，再用轻量素材 ID 创建任务；任务历史 JSON 不保存 Base64。单素材默认上限约 100 MB，任务 JSON 默认上限约 10 MB，可分别用 `MATERIAL_ASSET_MAX_BYTES` 和 `MATERIAL_GENERATION_MAX_REQUEST_BYTES` 调整。

### RunningHub「智慧老人」模型

物料生成 Agent 的前端仍只展示一个「智慧老人」模型。服务端为该模型注册了三个固定契约的能力：模特换头、模特换衣、模特换头换衣。通用 Orchestrator 会结合生成要求、商品事实和素材完整文件名选择能力，并为能力声明的图片与动态文本输入绑定参数；前端不要求用户另选工作流。

三个能力的应用与节点默认采用 RunningHub 导出的接口值，也可通过 `.env.local` 中的 `RUNNINGHUB_FACE_SWAP_*`、`RUNNINGHUB_OUTFIT_SWAP_*` 和 `RUNNINGHUB_FACE_OUTFIT_SWAP_*` 覆盖。原通用两图智慧老人应用已不再使用。当要求不属于这三个能力，或者仅凭文件名无法可靠判断素材用途时，规划会在调用 RunningHub 前失败并把需要补充的说明展示给用户，不会用相似工作流凑数。

本地和 URL 素材会先上传到 RunningHub，再把返回的 `fileName` 绑定到工作流节点；MCP 的 `file_id` 可直接复用已有 RunningHub 文件。相同素材在同一 Job 内只上传一次。整个服务默认最多并发生成 10 张，可用 `MATERIAL_GENERATION_CONCURRENCY` 调整；上传默认全局最多并发 5 个，可用 `RUNNINGHUB_UPLOAD_CONCURRENCY` 调整。每个任务只保存 `results` 中第一张有效图片。

RunningHub 的上传文件和结果链接均可能在 24 小时后失效；正式上线时应在任务成功后立即将结果转存到自己的对象存储，再把持久 URL 保存到物料任务中。
