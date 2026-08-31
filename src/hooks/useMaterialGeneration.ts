import { useCallback, useEffect, useRef, useState } from "react";

import { callImageGenerationLLM } from "../services/image-generation";
import { callOrchestratorLLM } from "../services/orchestrator";
import { callReviewerLLM } from "../services/reviewer";
import type {
  GenerationTask,
  ImageGenerationModel,
  MaterialWorkflowStatus,
  OrchestratorInput,
  OrchestratorPlan,
} from "../types/material-generation";
import { appendReviewFeedback } from "../utils/prompt";

export const MAX_REVIEW_FAILURES = 2;

type TaskPatch = Partial<GenerationTask> | ((task: GenerationTask) => Partial<GenerationTask>);

function selectTaskReferences(input: OrchestratorInput, task: GenerationTask) {
  const referenceNames = new Set(task.references ?? []);
  return input.referenceMaterials.filter((reference) => referenceNames.has(reference.name));
}

export function useMaterialGeneration() {
  const [workflowStatus, setWorkflowStatus] = useState<MaterialWorkflowStatus>("idle");
  const [plan, setPlan] = useState<OrchestratorPlan | null>(null);
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const runIdRef = useRef(0);

  useEffect(() => () => { runIdRef.current += 1; }, []);

  const updateTask = useCallback((taskId: string, patch: TaskPatch, runId: number) => {
    if (runIdRef.current !== runId) return;
    setTasks((currentTasks) => currentTasks.map((task) => {
      if (task.taskId !== taskId) return task;
      const nextPatch = typeof patch === "function" ? patch(task) : patch;
      return { ...task, ...nextPatch };
    }));
  }, []);

  const runGenerationTask = useCallback(async (
    initialTask: GenerationTask,
    input: OrchestratorInput & { imageModel: ImageGenerationModel },
    runId: number,
  ) => {
    let currentTask = { ...initialTask };
    let prompt = currentTask.instruction;

    try {
      while (currentTask.reviewFailureCount < MAX_REVIEW_FAILURES && runIdRef.current === runId) {
        const nextAttempt = currentTask.attempt + 1;
        updateTask(currentTask.taskId, {
          status: currentTask.attempt === 0 ? "generating" : "retrying",
          attempt: nextAttempt,
        }, runId);

        const generationResult = await callImageGenerationLLM({
          ...input,
          // Keep global product facts, but scope visual references to this task.
          // An omitted references list means no reference image is sent.
          referenceMaterials: selectTaskReferences(input, currentTask),
          task: currentTask,
          prompt,
          attempt: nextAttempt,
          imageModel: input.imageModel,
        });
        if (runIdRef.current !== runId) return;

        const nextCost = Number(((currentTask.cost ?? 0) + (generationResult.cost ?? 0)).toFixed(2));
        currentTask = {
          ...currentTask,
          status: "reviewing",
          attempt: nextAttempt,
          imageUrl: generationResult.imageUrl,
          cost: nextCost,
        };
        updateTask(currentTask.taskId, currentTask, runId);

        const review = await callReviewerLLM({
          productFacts: input.productFacts,
          generationRequirements: input.generationRequirements,
          task: currentTask,
          imageUrl: generationResult.imageUrl,
          qaChecklist: currentTask.qaChecklist,
          attempt: nextAttempt,
        });
        if (runIdRef.current !== runId) return;

        if (review.pass) {
          updateTask(currentTask.taskId, {
            status: "completed",
            reviewScore: review.score,
            reviewFeedback: review.feedback,
          }, runId);
          return;
        }

        const reviewFailureCount = currentTask.reviewFailureCount + 1;
        currentTask = {
          ...currentTask,
          reviewFailureCount,
          reviewScore: review.score,
          reviewFeedback: review.feedback,
        };

        if (reviewFailureCount >= MAX_REVIEW_FAILURES) {
          updateTask(currentTask.taskId, {
            status: "failed",
            reviewFailureCount,
            reviewScore: review.score,
            reviewFeedback: review.feedback,
            errorMessage: review.feedback || "连续两次未通过质检",
          }, runId);
          return;
        }

        prompt = appendReviewFeedback(currentTask.instruction, review.feedback);
        updateTask(currentTask.taskId, { ...currentTask, status: "retrying" }, runId);
      }
    } catch (error) {
      updateTask(currentTask.taskId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "生成服务暂时不可用",
      }, runId);
      throw error;
    }
  }, [updateTask]);

  const handleStartGeneration = useCallback(async (input: OrchestratorInput & { imageModel: ImageGenerationModel }) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setWorkflowStatus("planning");
    setPlan(null);
    setTasks([]);
    setErrorMessage(undefined);

    try {
      const nextPlan = await callOrchestratorLLM(input);
      if (runIdRef.current !== runId) return;

      const nextTasks = nextPlan.categories.flatMap((category) => category.tasks.map((task) => ({
        ...task,
        categoryKey: category.categoryKey,
        categoryLabel: category.categoryLabel,
        status: "planned" as const,
        attempt: 0,
        reviewFailureCount: 0,
        cost: 0,
      })));
      setPlan(nextPlan);
      setTasks(nextTasks);
      setWorkflowStatus("running");

      await Promise.allSettled(nextTasks.map((task) => runGenerationTask(task, input, runId)));
      if (runIdRef.current === runId) setWorkflowStatus("completed");
    } catch (error) {
      if (runIdRef.current !== runId) return;
      setWorkflowStatus("failed");
      setErrorMessage(error instanceof Error ? error.message : "规划服务暂时不可用");
    }
  }, [runGenerationTask]);

  return { workflowStatus, plan, tasks, errorMessage, handleStartGeneration };
}
