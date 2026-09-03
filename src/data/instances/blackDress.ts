import type { ProductWorkflowInstance } from "../workflow/types";
import { defaultVisualAssetsSop } from "../material-generation-presets";

export const blackDressWorkflowInstance: ProductWorkflowInstance = {
  id: "black-dress",
  spu: "SPU-260827-002",
  name: "黑色连衣裙",
  dagTemplateId: "product-publishing",
  nodes: [
    { id: "black-dress:new-task", nodeTemplateId: "new-task", sop: "", status: "completed" },
    { id: "black-dress:product-facts", nodeTemplateId: "product-facts", sop: "", status: "completed" },
    { id: "black-dress:basic-link", nodeTemplateId: "basic-link", sop: "", status: "completed" },
    { id: "black-dress:styling", nodeTemplateId: "styling", sop: "", status: "completed" },
    {
      id: "black-dress:visual-assets",
      nodeTemplateId: "visual-assets",
      sop: defaultVisualAssetsSop,
      status: "running",
    },
    {
      id: "black-dress:complete-link",
      nodeTemplateId: "complete-link",
      sop: "",
      status: "pending",
    },
    { id: "black-dress:link-review", nodeTemplateId: "link-review", sop: "", status: "pending" },
    { id: "black-dress:publish-schedule", nodeTemplateId: "publish-schedule", sop: "", status: "pending" },
  ],
  edges: [
    { id: "new-task-product-facts", source: "black-dress:new-task", target: "black-dress:product-facts" },
    { id: "new-task-styling", source: "black-dress:new-task", target: "black-dress:styling" },
    { id: "product-facts-basic-link", source: "black-dress:product-facts", target: "black-dress:basic-link" },
    { id: "styling-visual-assets", source: "black-dress:styling", target: "black-dress:visual-assets" },
    { id: "basic-link-complete-link", source: "black-dress:basic-link", target: "black-dress:complete-link" },
    { id: "visual-assets-complete-link", source: "black-dress:visual-assets", target: "black-dress:complete-link" },
    { id: "complete-link-link-review", source: "black-dress:complete-link", target: "black-dress:link-review" },
    { id: "link-review-publish-schedule", source: "black-dress:link-review", target: "black-dress:publish-schedule" },
  ],
};
