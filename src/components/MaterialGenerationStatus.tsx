import { useEffect, useState } from "react";

import type { GenerationTask, MaterialWorkflowStatus } from "../types/material-generation";

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MaterialGenerationStatus({
  status,
  tasks,
  errorMessage,
  startedAt,
  completedAt,
}: {
  status: MaterialWorkflowStatus;
  tasks: GenerationTask[];
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}) {
  const completed = tasks.filter((task) => task.status === "completed").length;
  const failed = tasks.filter((task) => task.status === "failed").length;
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState(0);

  useEffect(() => {
    const startedAtMilliseconds = startedAt ? Date.parse(startedAt) : Number.NaN;
    if (!Number.isFinite(startedAtMilliseconds)) {
      setElapsedMilliseconds(0);
      return undefined;
    }
    const completedAtMilliseconds = completedAt ? Date.parse(completedAt) : Number.NaN;
    const updateElapsed = () => setElapsedMilliseconds(Math.max(
      0,
      (Number.isFinite(completedAtMilliseconds) ? completedAtMilliseconds : Date.now()) - startedAtMilliseconds,
    ));
    updateElapsed();
    if (Number.isFinite(completedAtMilliseconds) || !["planning", "running"].includes(status)) return undefined;
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [completedAt, startedAt, status]);

  let label = "等待生成";
  if (status === "planning") label = "规划中...";
  if (status === "running") label = "正在生成物料";
  if (status === "completed") label = "生成完成";
  if (status === "failed") label = "规划失败";

  const detail = errorMessage
    ?? (status === "planning" ? "正在分析生成要求并整理物料类型和数量" : undefined)
    ?? (startedAt && status === "running" ? `${completed} 成功 / ${failed} 失败 · 耗时 ${formatElapsed(elapsedMilliseconds)}` : undefined)
    ?? (startedAt && status === "completed" ? `${completed} 成功 / ${failed} 失败 · 耗时 ${formatElapsed(elapsedMilliseconds)}` : undefined);

  return (
    <div className={`material-workflow-status is-${status}`} aria-live="polite">
      <span className="material-workflow-dot" />
      <div>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}
