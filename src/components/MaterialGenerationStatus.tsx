import { useEffect, useRef, useState } from "react";

import type { GenerationTask, MaterialWorkflowStatus } from "../types/material-generation";

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MaterialGenerationStatus({
  status,
  tasks,
  errorMessage,
}: {
  status: MaterialWorkflowStatus;
  tasks: GenerationTask[];
  errorMessage?: string;
}) {
  const completed = tasks.filter((task) => task.status === "completed").length;
  const failed = tasks.filter((task) => task.status === "failed").length;
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState(0);
  const startedAtRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (status === "planning") {
      startedAtRef.current = Date.now();
      setElapsedMilliseconds(0);
    }
    if ((status === "planning" || status === "running") && startedAtRef.current) {
      const updateElapsed = () => setElapsedMilliseconds(Date.now() - startedAtRef.current!);
      updateElapsed();
      const timer = window.setInterval(updateElapsed, 1_000);
      return () => window.clearInterval(timer);
    }
    if ((status === "completed" || status === "failed") && startedAtRef.current) {
      setElapsedMilliseconds(Date.now() - startedAtRef.current);
    }
    return undefined;
  }, [status]);

  let label = "等待生成";
  if (status === "planning") label = "规划中...";
  if (status === "running") label = "正在生成物料";
  if (status === "completed") label = "生成完成";
  if (status === "failed") label = "规划失败";

  const detail = errorMessage
    ?? (status === "planning" ? "正在分析生成要求，整理物料类型、数量和质检标准" : undefined)
    ?? (startedAtRef.current && status === "running" ? `${completed} 成功 / ${failed} 失败 · 耗时 ${formatElapsed(elapsedMilliseconds)}` : undefined)
    ?? (startedAtRef.current && status === "completed" ? `${completed} 成功 / ${failed} 失败 · 耗时 ${formatElapsed(elapsedMilliseconds)}` : undefined);

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
