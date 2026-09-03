import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { uploadMaterialAsset } from "../services/material-assets";
import type { GenerationTask, ImageGenerationModel, ReferenceMaterial, RetryMaterialGenerationTaskInput } from "../types/material-generation";

export function MaterialRetryDialog({ task, imageModel, jobReferences, onClose, onRetry }: {
  task: GenerationTask;
  imageModel: ImageGenerationModel;
  jobReferences: ReferenceMaterial[];
  onClose: () => void;
  onRetry: (input: RetryMaterialGenerationTaskInput) => Promise<unknown>;
}) {
  const latestAttempt = task.attempts?.at(-1);
  const initialBindings = latestAttempt?.inputBindings ?? task.inputBindings;
  const initialReferences = useMemo(() => {
    if (latestAttempt?.referenceMaterials) return latestAttempt.referenceMaterials;
    const names = new Set([...(task.references ?? []), ...Object.values(initialBindings ?? {})]);
    return jobReferences.filter((reference) => names.has(reference.name));
  }, [initialBindings, jobReferences, latestAttempt?.referenceMaterials, task.references]);
  const slots = useMemo(() => imageModel === "smart-elderly"
    ? Object.entries(initialBindings ?? {}).map(([key, name]) => ({ key, label: key, material: initialReferences.find((item) => item.name === name) }))
    : initialReferences.map((material, index) => ({ key: `reference-${index}`, label: `参考素材 ${index + 1}`, material })),
  [imageModel, initialBindings, initialReferences]);
  const [prompt, setPrompt] = useState(latestAttempt?.prompt ?? task.effectivePrompt ?? task.instruction);
  const [replacements, setReplacements] = useState<Record<string, File>>({});
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const submit = async () => {
    if (!prompt.trim()) return setErrorMessage("Prompt 不能为空");
    setIsSubmitting(true);
    setErrorMessage(undefined);
    try {
      const resolvedSlots = await Promise.all(slots.map(async (slot) => {
        const replacement = replacements[slot.key];
        if (replacement) {
          const name = imageModel === "smart-elderly" ? `${slot.key}-${replacement.name}` : replacement.name;
          return { ...slot, material: await uploadMaterialAsset(replacement, name) };
        }
        if (!slot.material) throw new Error(`${slot.label} 缺少参考素材`);
        return slot as typeof slot & { material: ReferenceMaterial };
      }));
      const additions = imageModel === "smart-elderly" ? [] : await Promise.all(additionalFiles.map((file) => uploadMaterialAsset(file)));
      const materialsByName = new Map<string, ReferenceMaterial>();
      [...resolvedSlots.map((slot) => slot.material), ...additions].forEach((material) => materialsByName.set(material.name, material));
      const inputBindings = imageModel === "smart-elderly"
        ? Object.fromEntries(resolvedSlots.map((slot) => [slot.key, slot.material.name]))
        : undefined;
      await onRetry({ prompt: prompt.trim(), referenceMaterials: Array.from(materialsByName.values()), ...(inputBindings ? { inputBindings } : {}) });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "单图重试失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="material-retry-overlay" role="presentation" onMouseDown={() => !isSubmitting && onClose()}>
      <section className="material-retry-dialog" role="dialog" aria-modal="true" aria-label={`重试 ${task.imageLabel}`} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><strong>重试单张图片</strong><small>{task.imageLabel}</small></div><button type="button" disabled={isSubmitting} onClick={onClose}>×</button></header>
        <label className="material-retry-prompt"><span>Prompt</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={isSubmitting} /></label>
        <div className="material-retry-references">
          <div className="material-retry-section-title"><span>参考素材</span><small>可替换后重试</small></div>
          {slots.map((slot) => (
            <label className="material-retry-reference" key={slot.key}>
              <span><strong>{slot.label}</strong><small>{replacements[slot.key]?.name ?? slot.material?.name ?? "未绑定"}</small></span>
              <input type="file" accept="image/*" disabled={isSubmitting} onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setReplacements((current) => ({ ...current, [slot.key]: file }));
              }} />
              <em>{replacements[slot.key] ? "已选择新素材" : "替换"}</em>
            </label>
          ))}
          {imageModel !== "smart-elderly" && <label className="material-retry-add-reference"><input type="file" accept="image/*" multiple disabled={isSubmitting} onChange={(event) => setAdditionalFiles(Array.from(event.target.files ?? []))} /><span>+ 添加参考素材</span>{additionalFiles.length > 0 && <small>{additionalFiles.map((file) => file.name).join("、")}</small>}</label>}
        </div>
        {errorMessage && <p className="material-retry-error">{errorMessage}</p>}
        <footer><span>重试会产生一次新的图片生成费用</span><div><button type="button" disabled={isSubmitting} onClick={onClose}>取消</button><button className="is-primary" type="button" disabled={isSubmitting} onClick={() => { void submit(); }}>{isSubmitting ? "正在提交..." : "确认重试"}</button></div></footer>
      </section>
    </div>,
    document.body,
  );
}
