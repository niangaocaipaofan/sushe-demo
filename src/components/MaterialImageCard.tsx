import type { GenerationTask } from "../types/material-generation";

const statusLabel: Record<GenerationTask["status"], string> = {
  planned: "等待生成",
  generating: "生成中...",
  completed: "已完成",
  failed: "生成失败",
};

export function MaterialImageCard({
  task,
  onPreview,
  onRetry,
}: {
  task: GenerationTask;
  onPreview?: (imageUrl: string, imageLabel: string) => void;
  onRetry?: (task: GenerationTask) => void;
}) {
  const showImage = Boolean(task.imageUrl);
  const statusDetail = task.status === "failed"
    ? task.errorMessage || "生成失败，未返回具体原因"
    : task.status === "completed" ? "已生成" : "等待生成";

  return (
    <article className={`material-image-card is-${task.status}`}>
      <div className="material-image-card-heading">
        <strong title={task.imageLabel}>{task.imageLabel}</strong>
        <span className="material-image-card-meta">
          <em>{statusLabel[task.status]}</em>
        </span>
      </div>
      <div className="material-image-card-status">
        <span title={statusDetail}>{statusDetail}</span>
        {!["planned", "generating"].includes(task.status) && <button type="button" onClick={() => onRetry?.(task)}>重试</button>}
      </div>
      <div className="material-image-card-preview">
        {showImage ? (
          <button
            className="material-generated-image-trigger"
            type="button"
            aria-label={`放大查看 ${task.imageLabel}`}
            onClick={() => task.imageUrl && onPreview?.(task.imageUrl, task.imageLabel)}
          >
            <img src={task.imageUrl} alt={`${task.imageLabel} 生成结果`} />
          </button>
        ) : task.status === "failed" ? (
          <div className="material-image-failed-mark">!</div>
        ) : (
          <div className="material-image-skeleton" aria-label={`${task.imageLabel} 图片加载中`} />
        )}
      </div>
    </article>
  );
}
