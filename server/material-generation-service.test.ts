import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ImageGenerationInput } from "../src/types/material-generation.ts";
import type { MaterialGenerationRuntime } from "./material-generation-runtime.ts";

test("retries one completed image with an edited prompt and replacement reference", async () => {
  const directory = await mkdtemp(join(tmpdir(), "material-retry-"));
  process.env.MATERIAL_GENERATION_STORE_PATH = join(directory, "tasks.json");
  process.env.MATERIAL_ASSET_STORE_PATH = join(directory, "assets");
  const originalPath = join(directory, "original.jpg");
  const replacementPath = join(directory, "replacement.jpg");
  await writeFile(originalPath, Buffer.from([1]));
  await writeFile(replacementPath, Buffer.from([2]));

  try {
    const [{ createMaterialGenerationJob, updateMaterialGenerationJob }, { createMaterialGenerationService }] = await Promise.all([
      import("./material-generation-store.ts"),
      import("./material-generation-service.ts"),
    ]);
    const created = await createMaterialGenerationJob({
      workflowId: "workflow-1",
      nodeId: "node-1",
      spuId: "spu-1",
      source: "web",
      imageModel: "gpt2",
      generationRequirements: "generate",
      productFacts: [],
      referenceMaterials: [{ name: "original.jpg", type: "image/jpeg", size: 1, source: { kind: "file_path", value: originalPath } }],
    });
    await updateMaterialGenerationJob(created.job.id, (job) => {
      job.status = "completed";
      job.tasks = [{
        taskId: "image-1",
        categoryKey: "main",
        categoryLabel: "主图",
        imageType: "main",
        imageLabel: "主图 #1",
        instruction: "original prompt",
        references: ["original.jpg"],
        status: "completed",
        imageUrl: "https://example.com/original.png",
        cost: 1,
      }];
    });

    let receivedInput: ImageGenerationInput | undefined;
    const runtime = {
      createExecutionContext: () => ({ runningHubUploads: new Map(), uploadLimiter: { run: async <T>(operation: () => Promise<T>) => operation() } }),
      generate: async (input: ImageGenerationInput) => {
        receivedInput = input;
        return { imageUrl: "https://example.com/retry.png", cost: 2 };
      },
    } as unknown as MaterialGenerationRuntime;
    const service = createMaterialGenerationService(runtime);
    const retrying = await service.retry({
      workflowId: "workflow-1",
      jobId: created.job.id,
      taskId: "image-1",
      prompt: "edited prompt",
      referenceMaterials: [{ name: "replacement.jpg", type: "image/jpeg", size: 1, source: { kind: "file_path", value: replacementPath } }],
    });
    assert.equal(retrying.tasks[0].status, "generating");

    let completed = await service.get(created.job.id, "workflow-1");
    for (let index = 0; index < 20 && completed?.status === "running"; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed = await service.get(created.job.id, "workflow-1");
    }
    assert.equal(receivedInput?.prompt, "edited prompt");
    assert.equal(receivedInput?.referenceMaterials[0].name, "replacement.jpg");
    assert.equal(completed?.tasks[0].status, "completed");
    assert.equal(completed?.tasks[0].imageUrl, "https://example.com/retry.png");
    assert.equal(completed?.tasks[0].attempts?.[0].prompt, "edited prompt");
    assert.equal(completed?.tasks[0].attempts?.[0].status, "completed");
    assert.equal(completed?.tasks[0].cost, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
