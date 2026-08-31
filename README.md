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

在 `.env.local` 中填写 `DEEPSEEK_API_KEY` 后，重启 `npm run dev`。当前仅主 Agent 使用 DeepSeek；图片生成和 Reviewer 仍为明确标注的本地 Mock，方便先验证规划与编排流程。
