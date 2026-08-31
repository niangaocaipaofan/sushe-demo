import type { DagTemplate } from "../workflow/types";

export const productPublishingDagTemplate: DagTemplate = {
  id: "product-publishing",
  name: "商品发布流程",
  nodes: [
    { id: "new-task", label: "上新任务", workspace: "none" },
    { id: "product-facts", label: "商品事实完善", workspace: "product-facts" },
    { id: "basic-link", label: "基础链接制作与平台预上货", workspace: "publishing" },
    { id: "styling", label: "搭配方案制作", workspace: "styling" },
    { id: "visual-assets", label: "视觉素材制作", workspace: "visual-assets" },
    { id: "complete-link", label: "完整链接制作", workspace: "publishing" },
    { id: "link-review", label: "商品链接检查", workspace: "publishing" },
    { id: "publish-schedule", label: "设置上架定时", workspace: "publishing" },
  ],
  edges: [
    { sourceTemplateId: "new-task", targetTemplateId: "product-facts" },
    { sourceTemplateId: "new-task", targetTemplateId: "styling" },
    { sourceTemplateId: "product-facts", targetTemplateId: "basic-link" },
    { sourceTemplateId: "styling", targetTemplateId: "visual-assets" },
    { sourceTemplateId: "basic-link", targetTemplateId: "complete-link" },
    { sourceTemplateId: "visual-assets", targetTemplateId: "complete-link" },
    { sourceTemplateId: "complete-link", targetTemplateId: "link-review" },
    { sourceTemplateId: "link-review", targetTemplateId: "publish-schedule" },
  ],
};
