import type { ProductWorkflowInstance } from "../workflow/types";
import { defaultVisualAssetsSop } from "../material-generation-presets";

export const graySuitWorkflowInstance: ProductWorkflowInstance = {
  id: "gray-suit",
  spu: "SPU-260827-003",
  name: "灰色西装",
  dagTemplateId: "product-publishing",
  nodes: [
    { id: "gray-suit:new-task", nodeTemplateId: "new-task", sop: "", status: "completed" },
    { id: "gray-suit:product-facts", nodeTemplateId: "product-facts", sop: "", status: "completed" },
    { id: "gray-suit:basic-link", nodeTemplateId: "basic-link", sop: "", status: "completed" },
    { id: "gray-suit:styling", nodeTemplateId: "styling", sop: "", status: "completed" },
    {
      id: "gray-suit:visual-assets",
      nodeTemplateId: "visual-assets",
      sop: defaultVisualAssetsSop,
      status: "running",
    },
    {
      id: "gray-suit:complete-link",
      nodeTemplateId: "complete-link",
      sop: "",
      status: "pending",
    },
    { id: "gray-suit:link-review", nodeTemplateId: "link-review", sop: "", status: "pending" },
    { id: "gray-suit:publish-schedule", nodeTemplateId: "publish-schedule", sop: "", status: "pending" },
  ],
  edges: [
    { id: "new-task-product-facts", source: "gray-suit:new-task", target: "gray-suit:product-facts" },
    { id: "new-task-styling", source: "gray-suit:new-task", target: "gray-suit:styling" },
    { id: "product-facts-basic-link", source: "gray-suit:product-facts", target: "gray-suit:basic-link" },
    { id: "styling-visual-assets", source: "gray-suit:styling", target: "gray-suit:visual-assets" },
    { id: "basic-link-complete-link", source: "gray-suit:basic-link", target: "gray-suit:complete-link" },
    { id: "visual-assets-complete-link", source: "gray-suit:visual-assets", target: "gray-suit:complete-link" },
    { id: "complete-link-link-review", source: "gray-suit:complete-link", target: "gray-suit:link-review" },
    { id: "link-review-publish-schedule", source: "gray-suit:link-review", target: "gray-suit:publish-schedule" },
  ],
};
