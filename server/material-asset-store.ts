import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const assetDirectory = resolve(process.env.MATERIAL_ASSET_STORE_PATH ?? ".runtime/material-assets");

const mimeExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function extensionFor(name: string, mimeType: string) {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : mimeExtensions[mimeType] ?? ".bin";
}

export async function persistMaterialAsset(bytes: Uint8Array, name: string, mimeType: string) {
  const digest = createHash("sha256").update(bytes).digest("hex");
  const assetId = `${digest}${extensionFor(name, mimeType)}`;
  const path = resolve(assetDirectory, assetId);
  await mkdir(assetDirectory, { recursive: true });
  try {
    await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const temporaryPath = resolve(assetDirectory, `${randomUUID()}.tmp`);
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, path);
  }
  return { assetId, path, size: bytes.byteLength, mimeType };
}

export async function persistDataUrlMaterialAsset(dataUrl: string, name: string, fallbackMimeType: string) {
  const matched = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!matched) throw new Error(`参考素材 ${name} 的 Data URL 格式不正确`);
  return persistMaterialAsset(Buffer.from(matched[2], "base64"), name, matched[1] || fallbackMimeType);
}

export function resolveMaterialAssetPath(assetId: string) {
  if (!/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(assetId) || basename(assetId) !== assetId) {
    throw new Error("本地素材 ID 格式不正确");
  }
  return resolve(assetDirectory, assetId);
}

export async function readMaterialAsset(assetId: string) {
  return readFile(resolveMaterialAssetPath(assetId));
}
