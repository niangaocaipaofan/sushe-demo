import type { DagTemplate } from "../workflow/types";
import { defaultVisualAssetsSop } from "../material-generation-presets";

const productDataTabs = [
  {
    id: "wanzhen",
    label: "万阵",
    kind: "integration" as const,
    icon: "database" as const,
    display: { kind: "embedded" as const, src: "https://outsofts.cn/personalCenter/settings", title: "Outsofts 设置页" },
    capabilities: [{ id: "read-product-data", label: "查看商品数据", access: "both" as const, mode: "read" as const }],
  },
  {
    id: "ecpro",
    label: "易尚货",
    kind: "integration" as const,
    icon: "database" as const,
    display: { kind: "embedded" as const, src: "https://cms.ecpro.com/login", title: "ECPro 登录页" },
    capabilities: [{ id: "read-product-data", label: "查看商品数据", access: "both" as const, mode: "read" as const }],
  },
  {
    id: "jushuitan",
    label: "聚水潭",
    kind: "integration" as const,
    icon: "database" as const,
    display: { kind: "placeholder" as const, message: "聚水潭暂未配置" },
    capabilities: [{ id: "read-product-data", label: "查看商品数据", access: "both" as const, mode: "read" as const }],
  },
  {
    id: "media",
    label: "资料",
    kind: "reference" as const,
    icon: "attach-file" as const,
    display: { kind: "placeholder" as const, message: "资料暂未配置" },
    capabilities: [{ id: "read-reference-materials", label: "查看参考资料", access: "both" as const, mode: "read" as const }],
  },
];

const dataSyncTab = {
  id: "data-sync",
  label: "数据协同专员",
  kind: "agent" as const,
  icon: "data-sync" as const,
  display: { kind: "workspace" as const, renderer: "data-sync" as const },
  capabilities: [
    { id: "inspect-sync-task", label: "查看同步任务", access: "both" as const, mode: "read" as const },
    { id: "configure-field-mapping", label: "配置字段映射", access: "both" as const, mode: "write" as const },
    { id: "resolve-data-difference", label: "处理数据差异", access: "both" as const, mode: "write" as const },
    { id: "submit-sync", label: "提交同步", access: "both" as const, mode: "execute" as const, requiresConfirmation: true },
  ],
};

const dataSyncPlaceholderTab = {
  ...dataSyncTab,
  display: { kind: "placeholder" as const, message: "数据协同专员暂未配置" },
};

const materialGenerationTab = {
  id: "ai-materials",
  label: "视觉物料专员",
  kind: "agent" as const,
  icon: "ai" as const,
  display: { kind: "workspace" as const, renderer: "material-generation" as const },
  capabilities: [
    { id: "inspect-material-plan", label: "查看物料计划", access: "both" as const, mode: "read" as const },
    { id: "configure-material-generation", label: "配置生成任务", access: "both" as const, mode: "write" as const },
    { id: "generate-materials", label: "生成物料", access: "both" as const, mode: "execute" as const, requiresConfirmation: true },
  ],
};

export const productPublishingDagTemplate: DagTemplate = {
  id: "product-publishing",
  name: "商品发布流程",
  nodes: [
    { id: "new-task", label: "上新任务", sop: "", workspace: "none" },
    { id: "product-facts", label: "商品事实完善", sop: "", workspace: "product-facts", tabs: productDataTabs },
    { id: "basic-link", label: "基础链接制作与平台预上货", sop: "", workspace: "publishing", tabs: [dataSyncPlaceholderTab, ...productDataTabs] },
    { id: "styling", label: "搭配方案制作", sop: "", workspace: "styling", tabs: productDataTabs },
    { id: "visual-assets", label: "视觉素材制作", sop: defaultVisualAssetsSop, workspace: "visual-assets", tabs: [materialGenerationTab, ...productDataTabs] },
    { id: "complete-link", label: "完整链接制作", sop: "", workspace: "publishing", tabs: [dataSyncTab, ...productDataTabs] },
    { id: "link-review", label: "商品链接检查", sop: "", workspace: "publishing", tabs: [dataSyncPlaceholderTab, ...productDataTabs] },
    { id: "publish-schedule", label: "设置上架定时", sop: "", workspace: "publishing", tabs: [dataSyncPlaceholderTab, ...productDataTabs] },
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
