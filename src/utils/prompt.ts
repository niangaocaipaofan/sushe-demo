export function appendReviewFeedback(instruction: string, feedback?: string) {
  if (!feedback) return instruction;

  return `${instruction}\n\n上一轮质检发现以下问题：\n${feedback}\n\n请重新生成，并重点修正上述问题。`;
}
