import { routeIntentPrompt, schemaMappingPrompt, valueMappingPrompt } from "./data-sync-prompts.ts";

export type DataSyncAgentStage = "route" | "schema" | "value";
export type DataSyncAgentInput = Record<string, unknown> & { stage: DataSyncAgentStage };

function isPlatformId(value: unknown) {
  return value === "wanzhen" || value === "yishanghuo" || value === "jushuitan";
}

function isAgentResult(stage: DataSyncAgentStage, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (stage === "route") {
    const route = value as { reply?: unknown; action?: unknown };
    if (typeof route.reply !== "string" || route.action === null) return route.action === null;
    if (!route.action || typeof route.action !== "object") return false;
    const action = route.action as Record<string, unknown>;
    if ((action.intent !== "validation" && action.intent !== "sync") || typeof action.spuId !== "string" || !action.spuId.trim() || !isPlatformId(action.targetId)) return false;
    return action.sourceType === "file"
      ? action.sourceId === null
      : action.sourceType === "platform" && isPlatformId(action.sourceId) && action.sourceId !== action.targetId;
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

export async function runDeepSeekDataSyncAgent(apiKey: string, model: string, input: DataSyncAgentInput): Promise<unknown> {
  const systemPrompt = input.stage === "route"
    ? `${routeIntentPrompt}\n\n调用上下文：${typeof input.currentPageSpuId === "string" ? `currentPageSpuId=${JSON.stringify(input.currentPageSpuId)}。这是当前页面可信上下文。` : "未提供 currentPageSpuId，必须要求用户在对话中明确提供 SPU ID。"}`
    : input.stage === "schema" ? schemaMappingPrompt : valueMappingPrompt;
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 4000,
      stream: false,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: JSON.stringify(input) }],
    }),
  });
  const payload = await response.json().catch(() => null) as { error?: { message?: string }; choices?: Array<{ message?: { content?: string | null } }> } | null;
  if (!response.ok) throw new Error(payload?.error?.message ?? "DeepSeek API 请求失败");
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 没有返回数据同步建议");
  const result: unknown = JSON.parse(content);
  if (!isAgentResult(input.stage, result)) throw new Error("DeepSeek 返回的数据同步建议结构不完整");
  if (input.stage === "route") {
    const route = result as { reply: string; action: null | { spuId: string } };
    if (route.action && typeof input.currentPageSpuId === "string" && route.action.spuId !== input.currentPageSpuId) {
      return { reply: `当前页面只能操作 SPU ${input.currentPageSpuId}`, action: null };
    }
    if (route.action && input.currentPageSpuId === undefined) {
      const userText = (input.conversation as Array<{ role?: unknown; content?: unknown }> | undefined)
        ?.filter((message) => message.role === "user")
        .map((message) => message.content)
        .filter((content): content is string => typeof content === "string")
        .join("\n") ?? "";
      if (!userText.includes(route.action.spuId)) return { reply: "请明确提供本次同步的 SPU ID", action: null };
    }
  }
  return result;
}
