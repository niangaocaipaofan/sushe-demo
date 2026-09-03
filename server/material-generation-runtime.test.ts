import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMaterialGenerationRuntime } from "./material-generation-runtime.ts";

test("gpt2 converts local reference files to data URLs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "material-generation-"));
  const imagePath = join(directory, "reference.jpg");
  await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ data: [{ url: "https://example.com/result.png" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const runtime = createMaterialGenerationRuntime({
      deepSeekModel: "unused",
      imageApiKey: "test-key",
      imageApiTimeoutMs: 1_000,
      runningHubApiBaseUrl: "https://www.runninghub.cn",
      runningHubPollIntervalMs: 500,
      runningHubUploadConcurrency: 1,
      smartElderlyCapabilities: [],
    });
    await runtime.generate({
      productFacts: [],
      generationRequirements: "test",
      referenceMaterials: [{
        name: "reference.jpg",
        type: "image/jpeg",
        size: 4,
        source: { kind: "file_path", value: imagePath },
      }],
      task: {
        taskId: "test-task",
        categoryKey: "main-image",
        categoryLabel: "主图",
        imageType: "main-image",
        imageLabel: "主图",
        instruction: "test",
        status: "planned",
        cost: 0,
      },
      prompt: "test",
      imageModel: "gpt2",
    });

    assert.deepEqual(requestBody?.images, ["data:image/jpeg;base64,/9j/2Q=="]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
