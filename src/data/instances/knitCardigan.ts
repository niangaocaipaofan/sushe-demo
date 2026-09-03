import type { ProductWorkflowInstance } from "../workflow/types";
import { defaultVisualAssetsSop } from "../material-generation-presets";

export const knitCardiganWorkflowInstance: ProductWorkflowInstance = {
  id: "knit-cardigan",
  spu: "SPU-260827-001",
  name: "奶白针织衫",
  dagTemplateId: "product-publishing",
  nodes: [
    { id: "knit-cardigan:new-task", nodeTemplateId: "new-task", sop: "", status: "completed" },
    { id: "knit-cardigan:product-facts", nodeTemplateId: "product-facts", sop: "", status: "completed" },
    { id: "knit-cardigan:basic-link", nodeTemplateId: "basic-link", sop: "", status: "completed" },
    { id: "knit-cardigan:styling", nodeTemplateId: "styling", sop: "", status: "completed" },
    {
      id: "knit-cardigan:visual-assets",
      nodeTemplateId: "visual-assets",
      sop: defaultVisualAssetsSop,
      status: "running",
    },
    {
      id: "knit-cardigan:complete-link",
      nodeTemplateId: "complete-link",
      sop: "",
      status: "pending",
    },
    { id: "knit-cardigan:link-review", nodeTemplateId: "link-review", sop: "", status: "pending" },
    { id: "knit-cardigan:publish-schedule", nodeTemplateId: "publish-schedule", sop: "", status: "pending" },
  ],
  edges: [
    { id: "new-task-product-facts", source: "knit-cardigan:new-task", target: "knit-cardigan:product-facts" },
    { id: "new-task-styling", source: "knit-cardigan:new-task", target: "knit-cardigan:styling" },
    { id: "product-facts-basic-link", source: "knit-cardigan:product-facts", target: "knit-cardigan:basic-link" },
    { id: "styling-visual-assets", source: "knit-cardigan:styling", target: "knit-cardigan:visual-assets" },
    { id: "basic-link-complete-link", source: "knit-cardigan:basic-link", target: "knit-cardigan:complete-link" },
    { id: "visual-assets-complete-link", source: "knit-cardigan:visual-assets", target: "knit-cardigan:complete-link" },
    { id: "complete-link-link-review", source: "knit-cardigan:complete-link", target: "knit-cardigan:link-review" },
    { id: "link-review-publish-schedule", source: "knit-cardigan:link-review", target: "knit-cardigan:publish-schedule" },
  ],
};
