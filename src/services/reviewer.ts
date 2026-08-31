import type { ReviewerInput, ReviewResult } from "../types/material-generation";

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

function hash(value: string) {
  return Math.abs(Array.from(value).reduce((result, character) => ((result << 5) - result + character.charCodeAt(0)) | 0, 0));
}

export async function callReviewerLLM(input: ReviewerInput): Promise<ReviewResult> {
  const seed = hash(input.task.taskId);
  await wait(350 + (seed % 600));

  const permanentlyFailsInMock = seed % 29 === 0;
  const needsFirstRetry = seed % 5 === 0;
  const pass = !permanentlyFailsInMock && !(needsFirstRetry && input.attempt === 1);

  return pass
    ? { pass: true, score: 92 + (seed % 7), feedback: "商品事实、构图和视觉质量符合当前任务要求。" }
    : {
        pass: false,
        score: 71 + (seed % 9),
        feedback: permanentlyFailsInMock ? "局部结构与商品事实仍不一致" : "商品颜色与参考素材存在轻微偏差",
      };
}
