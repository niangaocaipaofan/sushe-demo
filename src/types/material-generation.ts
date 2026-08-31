export type ProductFact = Record<string, string>;

export type ImageGenerationModel = "gpt2" | "nano-banana" | "seedream5";

export type ReferenceMaterial = {
  name: string;
  type: string;
  size: number;
  recognizedRole?: string;
  /** A provider-ready image input. Archive files intentionally have no source. */
  source?: {
    kind: "data_url" | "url" | "file_id";
    value: string;
  };
};

export type OrchestratorInput = {
  productFacts: ProductFact[];
  referenceMaterials: ReferenceMaterial[];
  generationRequirements: string;
};

export type OrchestratorTask = {
  taskId: string;
  imageType: string;
  imageLabel: string;
  instruction: string;
  references?: string[];
  qaChecklist?: string[];
};

export type OrchestratorPlan = {
  summary: string;
  categories: Array<{
    categoryKey: string;
    categoryLabel: string;
    tasks: OrchestratorTask[];
  }>;
};

export type TaskStatus =
  | "planned"
  | "generating"
  | "reviewing"
  | "retrying"
  | "completed"
  | "failed";

export type GenerationTask = OrchestratorTask & {
  categoryKey: string;
  categoryLabel: string;
  status: TaskStatus;
  attempt: number;
  reviewFailureCount: number;
  imageUrl?: string;
  reviewScore?: number;
  reviewFeedback?: string;
  errorMessage?: string;
  cost?: number;
};

export type ImageGenerationInput = {
  productFacts: ProductFact[];
  referenceMaterials: ReferenceMaterial[];
  generationRequirements: string;
  task: GenerationTask;
  prompt: string;
  attempt: number;
  imageModel: ImageGenerationModel;
};

export type ImageGenerationResult = {
  imageUrl: string;
  cost?: number;
};

export type ReviewerInput = {
  productFacts: ProductFact[];
  generationRequirements: string;
  task: GenerationTask;
  imageUrl: string;
  qaChecklist?: string[];
  attempt: number;
};

export type ReviewResult = {
  pass: boolean;
  score?: number;
  feedback?: string;
};

export type MaterialWorkflowStatus = "idle" | "planning" | "running" | "completed" | "failed";
