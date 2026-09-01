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

在 `.env.local` 中填写 `DEEPSEEK_API_KEY` 后，重启 `npm run dev`。物料生成主 Agent 和数据同步 Agent 的 schema/value mapping 提议均使用 DeepSeek；图片生成和 Reviewer 仍为明确标注的本地 Mock，方便先验证规划与编排流程。

当前数据同步页面只提供手动来源/目标选择，页面上的对话框与文件上传入口暂未开放。底层仍保留通用路由协议与文件解析层：调用方提供 `currentPageSpuId` 时使用可信页面上下文，否则用户必须在对话中明确写出 SPU ID。三个 mock 平台的数据、上传数据校验、字段映射、值映射与提交都以该 SPU 为数据边界。

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
