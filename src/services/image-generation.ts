import type { ImageGenerationInput, ImageGenerationResult } from "../types/material-generation";

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

function hash(value: string) {
  return Array.from(value).reduce((result, character) => ((result << 5) - result + character.charCodeAt(0)) | 0, 0);
}

function createMockOutput(label: string, attempt: number, seed: number) {
  const accent = ["#3ecf8e", "#76a9fa", "#c0a46b", "#9b8afb"][Math.abs(seed) % 4];
  const safeLabel = label.replace(/[<>&'"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
    <rect width="900" height="1200" fill="#f7f7f5"/>
    <path d="M0 820L900 430V1200H0Z" fill="${accent}" opacity=".08"/>
    <rect x="90" y="120" width="720" height="840" rx="18" fill="none" stroke="#d7d7d2" stroke-width="3" stroke-dasharray="10 12"/>
    <circle cx="450" cy="480" r="82" fill="${accent}" opacity=".16"/>
    <path d="M408 480h84M450 438v84" stroke="${accent}" stroke-width="7" stroke-linecap="round"/>
    <text x="450" y="650" text-anchor="middle" fill="#3f3f3f" font-family="monospace" font-size="31">${safeLabel}</text>
    <text x="450" y="704" text-anchor="middle" fill="#8a8a8a" font-family="monospace" font-size="20">LOCAL MOCK OUTPUT · ATTEMPT ${attempt}</text>
    <text x="450" y="1035" text-anchor="middle" fill="#a0a0a0" font-family="monospace" font-size="17">当前为 Mock 生图，用于调试 DeepSeek Prompt</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function callImageGenerationLLM(input: ImageGenerationInput): Promise<ImageGenerationResult> {
  const response = await fetch("/api/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null) as ImageGenerationResult | { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload && "error" in payload && payload.error ? payload.error : "图片生成服务暂时不可用");
  }
  if (!payload || !("imageUrl" in payload) || !payload.imageUrl) {
    throw new Error("图片生成服务没有返回图片地址");
  }
  return payload;
}
