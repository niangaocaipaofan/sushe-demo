import type { OrchestratorInput, OrchestratorPlan } from "../types/material-generation";

/** Calls the local server endpoint; the DeepSeek key never reaches the browser. */
export async function callOrchestratorLLM(input: OrchestratorInput): Promise<OrchestratorPlan> {
  // The planner only needs names and roles to select task references. Keep image
  // bytes local until the selected task is sent to the image-generation API.
  const plannerInput: OrchestratorInput = {
    ...input,
    referenceMaterials: input.referenceMaterials.map(({ source: _source, ...reference }) => reference),
  };
  const response = await fetch("/api/orchestrator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plannerInput),
  });
  const payload = await response.json().catch(() => null) as OrchestratorPlan | { error?: string } | null;

  if (!response.ok) {
    throw new Error(payload && "error" in payload && payload.error ? payload.error : "物料规划服务暂时不可用");
  }
  return payload as OrchestratorPlan;
}
