import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CreateMaterialGenerationJobInput,
  MaterialGenerationJob,
  MaterialGenerationJobSummary,
  MaterialWorkflowStatus,
  RetryMaterialGenerationTaskInput,
} from "../types/material-generation";

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as T | { error?: string } | null;
  const errorPayload = payload && typeof payload === "object" ? payload as { error?: string } : null;
  if (!response.ok) throw new Error(errorPayload?.error || "物料生成服务暂时不可用");
  return payload as T;
}

export function useMaterialGeneration(workflowId: string, nodeId: string) {
  const [currentJob, setCurrentJob] = useState<MaterialGenerationJob | null>(null);
  const [history, setHistory] = useState<MaterialGenerationJobSummary[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSelectingJobId, setIsSelectingJobId] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();

  const loadHistory = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoadingHistory(true);
    try {
      const response = await fetch(`/api/material-generation/tasks?workflowId=${encodeURIComponent(workflowId)}`);
      const payload = await readResponse<{ tasks: MaterialGenerationJobSummary[] }>(response);
      setHistory((current) => JSON.stringify(current) === JSON.stringify(payload.tasks) ? current : payload.tasks);
      return payload.tasks;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法加载历史任务");
      return [];
    } finally {
      setIsLoadingHistory(false);
    }
  }, [workflowId]);

  const selectJob = useCallback(async (taskId: string, showLoading = true) => {
    if (showLoading) setIsSelectingJobId(taskId);
    try {
      setErrorMessage(undefined);
      const response = await fetch(`/api/material-generation/tasks/${encodeURIComponent(taskId)}?workflowId=${encodeURIComponent(workflowId)}`);
      const payload = await readResponse<{ task: MaterialGenerationJob }>(response);
      setCurrentJob(payload.task);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法加载物料生成任务");
    } finally {
      if (showLoading) setIsSelectingJobId((current) => current === taskId ? undefined : current);
    }
  }, [workflowId]);

  useEffect(() => {
    setCurrentJob(null);
    setHistory([]);
    setIsLoadingHistory(true);
    setErrorMessage(undefined);
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const timer = window.setInterval(() => { void loadHistory(); }, 3_000);
    return () => window.clearInterval(timer);
  }, [loadHistory]);

  useEffect(() => {
    if (!currentJob || !["queued", "planning", "running"].includes(currentJob.status)) return undefined;
    const timer = window.setInterval(() => {
      void selectJob(currentJob.id, false);
      void loadHistory();
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [currentJob, loadHistory, selectJob]);

  const handleStartGeneration = useCallback(async (
    input: Omit<CreateMaterialGenerationJobInput, "workflowId" | "nodeId" | "spuId" | "source">,
  ) => {
    try {
      setIsSubmitting(true);
      setErrorMessage(undefined);
      const response = await fetch("/api/material-generation/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, workflowId, nodeId }),
      });
      const payload = await readResponse<{ task: MaterialGenerationJob }>(response);
      setCurrentJob(payload.task);
      await loadHistory();
      return payload.task;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法创建物料生成任务");
      return undefined;
    } finally {
      setIsSubmitting(false);
    }
  }, [loadHistory, nodeId, workflowId]);

  const retryImage = useCallback(async (taskId: string, input: RetryMaterialGenerationTaskInput) => {
    if (!currentJob) throw new Error("请先选择需要重试的物料任务");
    try {
      setErrorMessage(undefined);
      const response = await fetch(`/api/material-generation/tasks/${encodeURIComponent(currentJob.id)}/images/${encodeURIComponent(taskId)}/retries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, workflowId }),
      });
      const payload = await readResponse<{ task: MaterialGenerationJob }>(response);
      setCurrentJob(payload.task);
      await loadHistory();
      return payload.task;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法重试图片生成");
      throw error;
    }
  }, [currentJob, loadHistory, workflowId]);

  const workflowStatus = useMemo<MaterialWorkflowStatus>(() => {
    if (!currentJob) return "idle";
    if (currentJob.status === "queued") return "planning";
    return currentJob.status;
  }, [currentJob]);

  return {
    workflowStatus,
    plan: currentJob?.plan ?? null,
    tasks: currentJob?.tasks ?? [],
    errorMessage: currentJob?.errorMessage ?? errorMessage,
    currentJob,
    history,
    isLoadingHistory,
    isSubmitting,
    isSelectingJobId,
    handleStartGeneration,
    retryImage,
    selectJob,
    loadHistory,
  };
}
