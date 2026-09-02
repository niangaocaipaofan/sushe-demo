import type { ReferenceMaterial } from "../types/material-generation";

export async function uploadMaterialAsset(file: File, name = file.name): Promise<ReferenceMaterial> {
  const response = await fetch("/api/material-generation/assets", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", "X-Material-File-Name": encodeURIComponent(name) },
    body: file,
  });
  const payload = await response.json().catch(() => null) as { asset?: { assetId?: string }; error?: string } | null;
  if (!response.ok || !payload?.asset?.assetId) throw new Error(payload?.error || `上传参考图片失败：${file.name}`);
  return {
    name,
    type: file.type || "application/octet-stream",
    size: file.size,
    source: { kind: "asset_id", value: payload.asset.assetId },
  };
}
