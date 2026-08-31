import {
  Button,
  Card,
  Chip,
  DateField,
  DateRangePicker,
  Label,
  ListBox,
  RangeCalendar,
  Select,
  Table,
  Tabs,
} from "@heroui/react";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";

import type { WorkflowNode } from "../data/workflows";
import { useMaterialGeneration } from "../hooks/useMaterialGeneration";
import type { ImageGenerationModel } from "../types/material-generation";
import { AgentTabIcon } from "./AgentTabIcon";
import { DataSyncWorkspace } from "./DataSyncWorkspace";
import { MaterialCategorySection } from "./MaterialCategorySection";
import { MaterialGenerationStatus } from "./MaterialGenerationStatus";

interface NodeWorkspaceProps {
  node: WorkflowNode | null;
  onComplete: () => void;
  onOwnerChange: (owner: string[] | undefined) => void;
  onPlannedStartChange: (plannedStart: string | undefined) => void;
  onPlannedCompletionChange: (plannedCompletion: string | undefined) => void;
}

const statusLabels = {
  completed: "已完成",
  running: "进行中",
  pending: "未开始",
} as const;

const statusColors = {
  completed: "success",
  running: "accent",
  pending: "default",
} as const;

const owners = [
  { id: "李娜", name: "李娜" },
  { id: "周然", name: "周然" },
  { id: "陈默", name: "陈默" },
];

// Temporary display value until completion timestamps are provided by workflow data.
const completedAtPlaceholder = "2026-08-30 14:30";

const imageModelOptions: Array<{ value: ImageGenerationModel; label: string }> = [
  { value: "gpt2", label: "GPT-2" },
  { value: "nano-banana", label: "Nano Banana" },
  { value: "seedream5", label: "Seedream 5" },
];

const promptPresetOptions = [
  { value: "full", label: "完整商详页素材生成" },
  { value: "none", label: "无" },
] as const;

const tabIcons = {
  database: "M735-567q105-47 105-113T735-793q-105-47-255-47t-255 47q-105 47-105 113t105 113q105 47 255 47t255-47ZM582.5-428.5Q644-437 701-456t98-49.5q41-30.5 41-74.5v100q0 44-41 74.5T701-356q-57 19-118.5 27.5T480-320q-41 0-102.5-8.5T259-356q-57-19-98-49.5T120-480v-100q0 44 41 74.5t98 49.5q57 19 118.5 27.5T480-420q41 0 102.5-8.5Zm0 200Q644-237 701-256t98-49.5q41-30.5 41-74.5v100q0 44-41 74.5T701-156q-57 19-118.5 27.5T480-120q-41 0-102.5-8.5T259-156q-57-19-98-49.5T120-280v-100q0 44 41 74.5t98 49.5q57 19 118.5 27.5T480-220q41 0 102.5-8.5Z",
  attachFile: "M720-330q0 104-73 177T470-80q-104 0-177-73t-73-177v-370q0-75 52.5-127.5T400-880q75 0 127.5 52.5T580-700v350q0 46-32 78t-78 32q-46 0-78-32t-32-78v-330q0-17 11.5-28.5T400-720q17 0 28.5 11.5T440-680v330q0 13 8.5 21.5T470-320q13 0 21.5-8.5T500-350v-350q-1-42-29.5-71T400-800q-42 0-71 29t-29 71v370q-1 71 49 120.5T470-160q70 0 119-49.5T640-330v-350q0-17 11.5-28.5T680-720q17 0 28.5 11.5T720-680v350Z",
  flashOn: "M406-157.5q-6-7.5-6-18.5v-224h-40q-33 0-56.5-23.5T280-480v-320q0-33 23.5-56.5T360-880h234q32 0 51.5 25t11.5 55l-57 200h45q36 0 53.5 32t-3.5 62L455-159q-6 9-15.5 12t-18.5 0q-9-3-15-10.5Z",
  sync: "M240-478q0 45 17 87.5t53 78.5l10 10v-58q0-17 11.5-28.5T360-400q17 0 28.5 11.5T400-360v160q0 17-11.5 28.5T360-160H200q-17 0-28.5-11.5T160-200q0-17 11.5-28.5T200-240h70l-16-14q-52-46-73-105t-21-119q0-94 48-170.5T337-766q14-8 29.5-1t20.5 23q5 15-.5 30T367-691q-58 32-92.5 88.5T240-478Zm480-4q0-45-17-87.5T650-648l-10-10v58q0 17-11.5 28.5T600-560q-17 0-28.5-11.5T560-600v-160q0-17 11.5-28.5T600-800h160q17 0 28.5 11.5T800-760q0 17-11.5 28.5T760-720h-70l16 14q49 49 71.5 106.5T800-482q0 94-48 170.5T623-194q-14 8-29.5 1T573-216q-5-15 .5-30t19.5-23q58-32 92.5-88.5T720-482Z",
  eyeTracking: "M120-40q-33 0-56.5-23.5T40-120v-80q0-17 11.5-28.5T80-240q17 0 28.5 11.5T120-200v80h80q17 0 28.5 11.5T240-80q0 17-11.5 28.5T200-40h-80Zm720 0h-80q-17 0-28.5-11.5T720-80q0-17 11.5-28.5T760-120h80v-80q0-17 11.5-28.5T880-240q17 0 28.5 11.5T920-200v80q0 33-23.5 56.5T840-40ZM480-220q-106 0-196-56T143-429q-6-12-9-24.5t-3-25.5q0-14 3-27t9-25q51-97 141-153t196-56q106 0 196 56t141 153q6 12 9 24.5t3 26.5q0 14-3 26.5t-9 24.5q-51 97-141 153t-196 56Zm0-120q58 0 99-41t41-99q0-58-41-99t-99-41q-58 0-99 41t-41 99q0 58 41 99t99 41Zm0-80q-25 0-42.5-17.5T420-480q0-25 17.5-42.5T480-540q25 0 42.5 17.5T540-480q0 25-17.5 42.5T480-420Zm440-420v80q0 17-11.5 28.5T880-720q-17 0-28.5-11.5T840-760v-80h-80q-17 0-28.5-11.5T720-880q0-17 11.5-28.5T760-920h80q33 0 56.5 23.5T920-840Zm-800-80h80q17 0 28.5 11.5T240-880q0 17-11.5 28.5T200-840h-80v80q0 17-11.5 28.5T80-720q-17 0-28.5-11.5T40-760v-80q0-33 23.5-56.5T120-920Z",
} as const;
type TabIconName = keyof typeof tabIcons;

const nodeTabs = {
  "product-facts": [
    { id: "wanzhen", label: "万阵", icon: "database" },
    { id: "ecpro", label: "易尚货", icon: "database" },
    { id: "jushuitan", label: "聚水潭", icon: "database" },
    { id: "media", label: "资料", icon: "attachFile" },
  ],
  styling: [
    { id: "wanzhen", label: "万阵", icon: "database" },
    { id: "ecpro", label: "易尚货", icon: "database" },
    { id: "jushuitan", label: "聚水潭", icon: "database" },
    { id: "media", label: "资料", icon: "attachFile" },
  ],
  "visual-assets": [
    { id: "ai-materials", label: "物料生成 Agent", icon: "ai" },
    { id: "wanzhen", label: "万阵", icon: "database" },
    { id: "ecpro", label: "易尚货", icon: "database" },
    { id: "jushuitan", label: "聚水潭", icon: "database" },
    { id: "media", label: "资料", icon: "attachFile" },
  ],
  "basic-link": [
    { id: "data-sync", label: "数据同步 Agent", icon: "agent-data-sync" },
    { id: "wanzhen", label: "万阵", icon: "database" },
    { id: "ecpro", label: "易尚货", icon: "database" },
    { id: "jushuitan", label: "聚水潭", icon: "database" },
    { id: "media", label: "资料", icon: "attachFile" },
  ],
  "complete-link": [
    { id: "data-sync", label: "数据同步 Agent", icon: "agent-data-sync" },
    { id: "wanzhen", label: "万阵", icon: "database" },
    { id: "ecpro", label: "易尚货", icon: "database" },
    { id: "jushuitan", label: "聚水潭", icon: "database" },
    { id: "media", label: "资料", icon: "attachFile" },
  ],
  "link-review": [
    { id: "data-sync", label: "数据同步 Agent", icon: "agent-data-sync" },
    { id: "wanzhen", label: "万阵", icon: "database" },
    { id: "ecpro", label: "易尚货", icon: "database" },
    { id: "jushuitan", label: "聚水潭", icon: "database" },
    { id: "media", label: "资料", icon: "attachFile" },
  ],
  "publish-schedule": [
    { id: "data-sync", label: "数据同步 Agent", icon: "agent-data-sync" },
    { id: "wanzhen", label: "万阵", icon: "database" },
    { id: "ecpro", label: "易尚货", icon: "database" },
    { id: "jushuitan", label: "聚水潭", icon: "database" },
    { id: "media", label: "资料", icon: "attachFile" },
  ],
} as const;

type NodeTabId = (typeof nodeTabs)[keyof typeof nodeTabs][number]["id"];

const tabPlaceholders: Partial<Record<NodeTabId, string>> = {
  jushuitan: "聚水潭暂未配置",
  media: "资料暂未配置",
  "data-sync": "数据同步 Agent 暂未配置",
};

const productFactColumns = [
  { id: "sku", label: "货号" },
  { id: "category", label: "品类" },
  { id: "color", label: "颜色" },
  { id: "size", label: "尺码" },
  { id: "material", label: "面料成分" },
  { id: "fit", label: "修身指数" },
  { id: "season", label: "上市季节" },
  { id: "style", label: "风格" },
  { id: "tryOnSize", label: "试穿尺码" },
] as const;

const productFactRows = [
  { id: "white-knit", sku: "XZ2608123", category: "针织上衣", color: "白色", size: "S/M/L/XL", material: "90%聚酯纤维 10%氨纶", fit: "修身", season: "2026秋季", style: "通勤", tryOnSize: "M" },
  { id: "black-knit", sku: "XZ2608123", category: "针织上衣", color: "黑色", size: "S/M/L/XL", material: "90%聚酯纤维 10%氨纶", fit: "修身", season: "2026秋季", style: "通勤", tryOnSize: "M" },
] as const;

const defaultMaterialRequirements = `【本次生成】
请为该商品生成一套完整的上新素材，包含：

1. 主图
- 天猫主图：5张
- 京东主图：每个颜色 5 张

2. 首图海报
- 首图海报：1张
- 配套首图文案

3. 产品信息
- 每个颜色 1 张产品信息图

4. 检测报告
- 根据已上传检测报告生成对应展示图，不得编造

5. 模特卖点图
- 模特卖点图：最多 10 张
- 配套卖点文案

6. 模特信息
- 模特信息模块
- 展示模特基本信息与试穿尺码

7. 搭配推荐
- 搭配推荐图：最多 6 张
- 配套搭配文案

8. 细节展示
- 细节展示图：3 张
- 配套细节文案

9. 模特展示
- 模特展示图：最多 20 张

10. 洗护信息
- 根据商品面料成分生成洗护模块

11. 平台资源图
- 商品图片（方图）
- 3:4 视频主图
- 无线主图
- 9:16 商品图片
- 商品长图
- 透明素材图
- 颜色图

【素材角色】
- 款式图：作为服装外观参考，用于颜色、版型、面料纹理、图案、结构参考
- 模特底图：作为姿势、构图、背景、光影、身体朝向参考
- AI数字人脸：作为头部参考
- 细节图：作为领口、袖口、面料等局部细节参考
- 搭配图：作为搭配推荐参考
- 检测报告：作为检测报告模块唯一依据

【商品一致性】
- 严格保持真实商品的颜色、版型、面料纹理、图案、结构和比例
- 不得自行增加、删除或修改服装设计元素
- 不得虚构商品材质、功能、卖点、认证或检测结果

【服装上身要求】
- 将款式图中的服装替换到模特底图中的模特身上
- 半身图只替换上衣区域
- 尽可能还原服装面料纹理和图案
- 只修改服装区域；除服装外，背景、光影、色调、模特姿势、动作、身体朝向、构图尽量保持不变

【头部替换要求】
- 将 AI数字人脸 替换到模特底图对应人物头部
- 正脸对应正脸，侧脸对应侧脸
- 只替换头部相关区域；除头部外，躯干、服装、姿势、背景、光影保持不变
- 替换后头部与脖子、肩颈、身体融合自然

【组合要求】
- 如同时进行服装上身与头部替换，优先保证商品一致性
- 最终图应自然统一，像同一次真实拍摄

【视觉方向】
- 自然真实的电商服装摄影风格
- 高级、干净、克制
- 避免明显 AI 感、错误肢体、错误褶皱、过度磨皮

【输出原则】
- 根据不同素材类型自动规划最合适构图
- 未特别说明的部分按电商上新最佳实践处理`;

function EmptyImageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 -960 960 960" fill="currentColor">
      <path d="M160-120q-33 0-56.5-23.5T80-200v-560q0-33 23.5-56.5T160-840h640q33 0 56.5 23.5T880-760v560q0 33-23.5 56.5T800-120H160Zm0-80h640v-560H160v560Zm40-80h560L585-513 440-320l-95-127-145 167Zm0 80v-560 560Z" />
    </svg>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function recognizeReferenceMaterial(fileName: string) {
  const tags = [
    ["款式", "款式图"],
    ["模特", "模特底图"],
    ["数字人脸", "数字人脸"],
    ["细节", "细节图"],
    ["搭配", "搭配图"],
  ].find(([keyword]) => fileName.includes(keyword));
  const color = ["白色", "黑色", "正面", "背面", "侧面", "领口"].find((keyword) => fileName.includes(keyword));

  return [tags?.[1] ?? "待识别", color].filter(Boolean).join(" · ");
}

interface ReferenceFileTreeNode {
  name: string;
  path: string;
  file?: File;
  children: ReferenceFileTreeNode[];
}

function getReferenceFilePath(file: File) {
  return file.webkitRelativePath || file.name;
}

function isSupportedReferenceFile(file: File) {
  const fileName = file.name.toLowerCase();
  return file.type.startsWith("image/") || fileName.endsWith(".zip");
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取参考图片：${file.name}`));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error(`无法读取参考图片：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function getFolderPaths(files: File[]) {
  return files.flatMap((file) => {
    const parts = getReferenceFilePath(file).split("/").filter(Boolean);
    return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
  });
}

function buildReferenceFileTree(files: File[]) {
  const root = new Map<string, { node: ReferenceFileTreeNode; children: Map<string, unknown> }>();

  files.forEach((file) => {
    const parts = getReferenceFilePath(file).split("/").filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      let entry = current.get(part) as { node: ReferenceFileTreeNode; children: Map<string, unknown> } | undefined;
      if (!entry) {
        entry = { node: { name: part, path, children: [] }, children: new Map() };
        current.set(part, entry);
      }
      if (index === parts.length - 1) entry.node.file = file;
      current = entry.children as Map<string, { node: ReferenceFileTreeNode; children: Map<string, unknown> }>;
    });
  });

  const toNodes = (entries: Map<string, { node: ReferenceFileTreeNode; children: Map<string, unknown> }>): ReferenceFileTreeNode[] =>
    Array.from(entries.values()).map((entry) => ({
      ...entry.node,
      children: toNodes(entry.children as Map<string, { node: ReferenceFileTreeNode; children: Map<string, unknown> }>),
    }));

  return toNodes(root);
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 -960 960 960" fill="currentColor">
      <path d="M440-440H280q-17 0-28.5-11.5T240-480q0-17 11.5-28.5T280-520h160v-160q0-17 11.5-28.5T480-720q17 0 28.5 11.5T520-680v160h160q17 0 28.5 11.5T720-480q0 17-11.5 28.5T680-440H520v160q0 17-11.5 28.5T480-240q-17 0-28.5-11.5T440-280v-160ZM180-120q-25 0-42.5-17.5T120-180v-120q0-17 11.5-28.5T160-340q17 0 28.5 11.5T200-300v100h560v-100q0-17 11.5-28.5T800-340q17 0 28.5 11.5T840-300v120q0 25-17.5 42.5T780-120H180Z" />
    </svg>
  );
}

function RemoveFileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 -960 960 960" fill="currentColor">
      <path d="M261-120q-24 0-42-18t-18-42v-540h-41v-80h200v-40h240v40h200v80h-41v540q0 24-18 42t-42 18H261Zm418-600H281v540h398v-540ZM360-260h80v-380h-80v380Zm160 0h80v-380h-80v380ZM281-720v540-540Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 -960 960 960" fill="currentColor">
      <path d="m291-230-61-61 189-189-189-189 61-61 189 189 189-189 61 61-189 189 189 189-61 61-189-189-189 189Z" />
    </svg>
  );
}

function ReferenceFileTree({
  nodes,
  selectedFile,
  expandedPaths,
  onSelect,
  onDelete,
  onToggleFolder,
}: {
  nodes: ReferenceFileTreeNode[];
  selectedFile: File | null;
  expandedPaths: Set<string>;
  onSelect: (file: File) => void;
  onDelete: (file: File) => void;
  onToggleFolder: (path: string) => void;
}) {
  return (
    <ul className="material-file-tree">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.file ? (
            <div className={`material-file-tree-file ${selectedFile === node.file ? "is-selected" : ""}`}>
              <button type="button" onClick={() => onSelect(node.file!)}>
                <span>{node.file.name.toLowerCase().endsWith(".zip") ? "ZIP" : "IMG"}</span>
                <strong>{node.name}</strong>
              </button>
              <button type="button" aria-label={`删除 ${node.name}`} onClick={() => onDelete(node.file!)}>
                <RemoveFileIcon />
              </button>
            </div>
          ) : (
            <>
              <button
                className="material-file-tree-folder"
                type="button"
                aria-expanded={expandedPaths.has(node.path)}
                onClick={() => onToggleFolder(node.path)}
              >
                <span>{expandedPaths.has(node.path) ? "▾" : "▸"}</span>{node.name}
              </button>
              {expandedPaths.has(node.path) && (
                <ReferenceFileTree
                  nodes={node.children}
                  selectedFile={selectedFile}
                  expandedPaths={expandedPaths}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onToggleFolder={onToggleFolder}
                />
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function MaterialGenerationWorkspace() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const promptPresetPickerRef = useRef<HTMLDivElement>(null);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [selectedReferenceFile, setSelectedReferenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isOriginalPreviewOpen, setIsOriginalPreviewOpen] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState<{ imageUrl: string; imageLabel: string } | null>(null);
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(new Set());
  const [includeProductFacts, setIncludeProductFacts] = useState(true);
  const [materialRequirements, setMaterialRequirements] = useState(defaultMaterialRequirements);
  const [promptPreset, setPromptPreset] = useState<"full" | "none">("full");
  const [isPromptPresetMenuOpen, setIsPromptPresetMenuOpen] = useState(false);
  const [imageModel, setImageModel] = useState<ImageGenerationModel>("gpt2");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const { workflowStatus, plan, tasks, errorMessage, handleStartGeneration } = useMaterialGeneration();
  const isGenerating = workflowStatus === "planning" || workflowStatus === "running";

  useEffect(() => {
    if (!selectedReferenceFile?.type.startsWith("image/")) {
      setPreviewUrl(null);
      return undefined;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedReferenceFile);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedReferenceFile]);

  useEffect(() => {
    if (!isOriginalPreviewOpen && !generatedPreview) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOriginalPreviewOpen(false);
        setGeneratedPreview(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [generatedPreview, isOriginalPreviewOpen]);

  useEffect(() => {
    const closeOnClickOutside = (event: MouseEvent) => {
      if (!modelPickerRef.current?.contains(event.target as Node)) setIsModelMenuOpen(false);
      if (!promptPresetPickerRef.current?.contains(event.target as Node)) setIsPromptPresetMenuOpen(false);
    };
    window.addEventListener("mousedown", closeOnClickOutside);
    return () => window.removeEventListener("mousedown", closeOnClickOutside);
  }, []);

  const addReferenceFiles = (files: File[]) => {
    const incomingFiles = files.filter(isSupportedReferenceFile);
    setReferenceFiles((currentFiles) => {
      const filesBySignature = new Map(
        currentFiles.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]),
      );
      incomingFiles.forEach((file) => {
        filesBySignature.set(`${file.name}-${file.size}-${file.lastModified}`, file);
      });
      return Array.from(filesBySignature.values());
    });
    setExpandedFolderPaths((currentPaths) => new Set([...currentPaths, ...getFolderPaths(incomingFiles)]));
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addReferenceFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    addReferenceFiles(Array.from(event.dataTransfer.files));
  };

  const handleDeleteFile = (fileToDelete: File) => {
    setReferenceFiles((currentFiles) => currentFiles.filter((file) => file !== fileToDelete));
    if (selectedReferenceFile === fileToDelete) setSelectedReferenceFile(null);
  };

  const referenceFileTree = buildReferenceFileTree(referenceFiles);
  const toggleFolder = (path: string) => {
    setExpandedFolderPaths((currentPaths) => {
      const nextPaths = new Set(currentPaths);
      if (nextPaths.has(path)) nextPaths.delete(path);
      else nextPaths.add(path);
      return nextPaths;
    });
  };

  const startGeneration = () => {
    void (async () => {
      const referenceMaterials = await Promise.all(referenceFiles.map(async (file) => ({
        name: getReferenceFilePath(file),
        type: file.type || "application/octet-stream",
        size: file.size,
        recognizedRole: recognizeReferenceMaterial(file.name).split(" · ")[0],
        // The image API accepts data URI Base64 in its `image` array. ZIP files
        // remain available to the planner as metadata but are never sent as images.
        source: file.type.startsWith("image/")
          ? { kind: "data_url" as const, value: await fileToDataUrl(file) }
          : undefined,
      })));
      await handleStartGeneration({
        productFacts: (includeProductFacts ? productFactRows : [])
          .map(({ id: _id, ...fact }) => ({ ...fact })),
        referenceMaterials,
        generationRequirements: materialRequirements,
        imageModel,
      });
    })();
  };

  return (
    <div className="material-agent-workspace">
      <form className="material-agent-form" onSubmit={(event) => { event.preventDefault(); startGeneration(); }}>
        <section className="material-input-group" aria-label="商品事实">
          <div className="material-label-row">
            <div className="material-label-primary">
              <span className="material-input-label">商品事实</span>
              <label className="material-section-toggle" title="控制整张商品事实表是否加入 Prompt">
                <input
                  type="checkbox"
                  checked={includeProductFacts}
                  onChange={(event) => setIncludeProductFacts(event.target.checked)}
                />
                <span className="material-section-toggle-mark" aria-hidden="true">
                  <svg viewBox="0 -960 960 960" fill="currentColor"><path d="m382-354 339-339q12-12 28-12t28 12q12 12 12 28.5T777-636L410-268q-12 12-28 12t-28-12L182-440q-12-12-11.5-28.5T183-497q12-12 28.5-12t28.5 12l142 143Z" /></svg>
                  <span>-</span>
                </span>
                <span>采用</span>
              </label>
            </div>
            <span className="material-input-hint">从万阵同步</span>
          </div>
          <Table className="material-facts-table" variant="secondary">
            <Table.ScrollContainer>
              <Table.Content aria-label="从万阵同步的商品事实表格">
                <Table.Header columns={productFactColumns}>
                  {(column) => <Table.Column id={column.id}>{column.label}</Table.Column>}
                </Table.Header>
                <Table.Body items={productFactRows}>
                  {(item) => (
                    <Table.Row id={item.id} columns={productFactColumns}>
                      {(column) => <Table.Cell>{item[column.id as keyof typeof item]}</Table.Cell>}
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </section>

        <div className="material-input-group">
          <div className="material-label-row">
            <span className="material-input-label">参考素材</span>
            <span className="material-input-hint">系统会根据文件名理解素材用途，无需严格遵循命名规范</span>
          </div>
          <div className="material-reference-layout">
            <div className="material-upload-panel">
              <input
                ref={fileInputRef}
                className="material-file-input"
                type="file"
                accept="image/*,.zip,application/zip,application/x-zip-compressed"
                multiple
                onChange={handleFiles}
              />
              <input
                ref={folderInputRef}
                className="material-file-input"
                type="file"
                multiple
                onChange={handleFiles}
                {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement>)}
              />
              <div
                className="material-upload-box"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <UploadIcon />
                <span>上传素材</span>
                <button type="button" onClick={() => fileInputRef.current?.click()}>文件（支持 ZIP 和多张图片）</button>
                <button type="button" onClick={() => folderInputRef.current?.click()}>文件夹</button>
                <div className="material-naming-guide">
                  <span>建议命名（非强制）</span>
                  <ul>
                    <li>款式图_白色_正面.jpg</li>
                    <li>款式图_黑色_背面.jpg</li>
                    <li>模特底图_正面_01.jpg</li>
                    <li>模特底图_侧面_02.jpg</li>
                    <li>数字人脸_正脸_A.jpg</li>
                    <li>数字人脸_侧脸_A.jpg</li>
                    <li>细节图_领口.jpg</li>
                    <li>搭配图_01.jpg</li>
                  </ul>
                </div>
              </div>
            </div>

            <section className="material-uploaded-files" aria-label="已上传文件内容识别展示">
              <div className="material-uploaded-files-header">
                <span>已上传文件</span>
                <small>{referenceFiles.length}</small>
              </div>
              {referenceFiles.length ? (
                <div className={`material-file-browser ${selectedReferenceFile ? "is-previewing" : ""}`}>
                  <div className="material-file-tree-wrap">
                    <ReferenceFileTree
                      nodes={referenceFileTree}
                      selectedFile={selectedReferenceFile}
                      expandedPaths={expandedFolderPaths}
                      onSelect={setSelectedReferenceFile}
                      onDelete={handleDeleteFile}
                      onToggleFolder={toggleFolder}
                    />
                  </div>
                  {selectedReferenceFile ? (
                    <div className="material-file-preview">
                      <button className="material-file-preview-close" type="button" aria-label="关闭预览" onClick={() => { setIsOriginalPreviewOpen(false); setSelectedReferenceFile(null); }}><CloseIcon /></button>
                      {previewUrl ? (
                        <button className="material-preview-image-trigger" type="button" aria-label="放大查看原图" onClick={() => setIsOriginalPreviewOpen(true)}>
                          <img src={previewUrl} alt={selectedReferenceFile.name} />
                        </button>
                      ) : (
                        <div className="material-file-preview-placeholder">{selectedReferenceFile.name.toLowerCase().endsWith(".zip") ? "ZIP" : "FILE"}</div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="material-files-empty">上传后将在此处展示文件名称与用途识别结果</div>
              )}
            </section>
          </div>
        </div>

        <div className="material-input-group material-prompt-group">
          <div className="material-label-row">
            <div className="material-label-primary">
              <span className="material-input-label">生成要求</span>
              <div className="material-prompt-preset-picker" ref={promptPresetPickerRef}>
                <button
                  className={`material-prompt-preset-trigger${promptPreset !== "none" ? " is-active" : ""}${isPromptPresetMenuOpen ? " is-open" : ""}`}
                  type="button"
                  aria-label="生成要求预设"
                  aria-haspopup="listbox"
                  aria-expanded={isPromptPresetMenuOpen}
                  onClick={() => setIsPromptPresetMenuOpen((open) => !open)}
                >
                  <span>{promptPresetOptions.find((option) => option.value === promptPreset)?.label}</span>
                  <span className="material-model-chevron" aria-hidden="true" />
                </button>
                {isPromptPresetMenuOpen ? (
                  <div className="material-prompt-preset-menu" role="listbox" aria-label="选择生成要求预设">
                    {promptPresetOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`material-prompt-preset-option${option.value === promptPreset ? " is-selected" : ""}`}
                        type="button"
                        role="option"
                        aria-selected={option.value === promptPreset}
                        onClick={() => {
                          setPromptPreset(option.value);
                          setMaterialRequirements(option.value === "full" ? defaultMaterialRequirements : "");
                          setIsPromptPresetMenuOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <textarea
            className="material-textarea material-prompt-input"
            value={materialRequirements}
            onChange={(event) => setMaterialRequirements(event.target.value)}
            aria-label="生成要求文本输入框"
          />
        </div>
        <div className="material-generate-panel">
          <div className="material-model-picker" ref={modelPickerRef}>
            <button
              className={`material-model-trigger${isModelMenuOpen ? " is-open" : ""}`}
              type="button"
              disabled={isGenerating}
              aria-label="图片生成模型"
              aria-haspopup="listbox"
              aria-expanded={isModelMenuOpen}
              onClick={() => setIsModelMenuOpen((open) => !open)}
            >
              <span>{imageModelOptions.find((option) => option.value === imageModel)?.label}</span>
              <span className="material-model-chevron" aria-hidden="true" />
            </button>
            {isModelMenuOpen ? (
              <div className="material-model-menu" role="listbox" aria-label="选择图片生成模型">
                {imageModelOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`material-model-option${option.value === imageModel ? " is-selected" : ""}`}
                    type="button"
                    role="option"
                    aria-selected={option.value === imageModel}
                    onClick={() => { setImageModel(option.value); setIsModelMenuOpen(false); }}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button className="material-generate-button" type="submit" disabled={isGenerating || !materialRequirements.trim()}>
            {workflowStatus === "planning" ? "正在规划..." : workflowStatus === "running" ? "生成进行中" : tasks.length ? "重新生成" : "开始生成"}
          </button>
        </div>
      </form>

      <section className="material-image-stage" aria-label="生成的图片展示">
        <div className="material-image-stage-header">
          <MaterialGenerationStatus status={workflowStatus} tasks={tasks} errorMessage={errorMessage} />
          <div className="material-image-stage-actions">
            <button type="button" disabled={!tasks.some((task) => task.status === "completed")}>下载素材包</button>
            <button type="button" disabled={!tasks.some((task) => task.status === "completed")}>一键同步至易尚货</button>
          </div>
        </div>
        {plan && tasks.length ? (
          <div className="material-gallery">
            {plan.categories.map((category, index) => (
              <MaterialCategorySection
                key={category.categoryKey}
                index={index}
                label={category.categoryLabel}
                tasks={tasks.filter((task) => task.categoryKey === category.categoryKey)}
                onPreview={(imageUrl, imageLabel) => setGeneratedPreview({ imageUrl, imageLabel })}
              />
            ))}
          </div>
        ) : (
          <div className="material-image-empty" aria-label="暂无生成图片">
            <div className="material-empty-copy">
              <EmptyImageIcon />
              <strong>{workflowStatus === "planning" ? "正在拆解物料任务" : "暂无生成结果"}</strong>
              <span>{workflowStatus === "planning" ? "Orchestrator 正在规划图片类型和数量" : "填写生成要求后开始生成，结果将按物料分类展示"}</span>
            </div>
          </div>
        )}
      </section>
      {isOriginalPreviewOpen && previewUrl && selectedReferenceFile && createPortal(
        <div className="material-original-image-overlay" role="presentation" onMouseDown={() => setIsOriginalPreviewOpen(false)}>
          <div className="material-original-image-dialog" aria-label={`${selectedReferenceFile.name} 原图预览`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <img src={previewUrl} alt={selectedReferenceFile.name} />
          </div>
        </div>,
        document.body,
      )}
      {generatedPreview && createPortal(
        <div className="material-original-image-overlay material-generated-image-overlay" role="presentation" onMouseDown={() => setGeneratedPreview(null)}>
          <div className="material-original-image-dialog" aria-label={`${generatedPreview.imageLabel} 放大预览`} role="dialog" aria-modal="true">
            <img src={generatedPreview.imageUrl} alt={`${generatedPreview.imageLabel} 生成结果`} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="complete-button-icon" viewBox="0 -960 960 960" fill="currentColor">
      <path d="m382-354 339-339q12-12 28-12t28 12q12 12 12 28.5T777-636L410-268q-12 12-28 12t-28-12L182-440q-12-12-11.5-28.5T183-497q12-12 28.5-12t28.5 12l142 143Z" />
    </svg>
  );
}

export function NodeWorkspace({
  node,
  onComplete,
  onOwnerChange,
  onPlannedStartChange,
  onPlannedCompletionChange,
}: NodeWorkspaceProps) {
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [ownerSelection, setOwnerSelection] = useState<Set<string>>(new Set());
  const tabs = node ? nodeTabs[node.templateId as keyof typeof nodeTabs] : undefined;

  useEffect(() => {
    if (!node || !tabs || activeTabs[node.id]) return;

    setActiveTabs((currentTabs) => ({
      ...currentTabs,
      [node.id]: tabs[0].id,
    }));
  }, [activeTabs, node, tabs]);

  useEffect(() => {
    setOwnerSelection(new Set(node?.owner ?? []));
  }, [node?.id, node?.owner]);

  if (!node) {
    return (
      <Card className="mt-2 rounded-lg" variant="secondary">
        <Card.Content>
          <Card.Description>选择上方流程节点开始</Card.Description>
        </Card.Content>
      </Card>
    );
  }

  const activeTab = tabs ? activeTabs[node.id] ?? tabs[0].id : null;
  const placeholder = activeTab && !(activeTab === "data-sync" && node.templateId === "complete-link")
    ? tabPlaceholders[activeTab as NodeTabId]
    : undefined;

  return (
    <section aria-live="polite" className="node-workspace-shell">
      <div className="integration-column">
        <div className="section-heading integration-heading">
          <h2>工作区</h2>
        </div>
        {tabs ? (
          <Tabs
            aria-label={`${node.label} 工作区`}
            className="integration-tabs"
            onSelectionChange={(tabId) =>
              setActiveTabs((currentTabs) => ({
                ...currentTabs,
                [node.id]: String(tabId),
              }))
            }
            selectedKey={activeTab ?? undefined}
          >
            <Tabs.ListContainer className="integration-tab-list">
              <Tabs.List>
                {tabs.map((tab) => (
                  <Tabs.Tab className="integration-tab" id={tab.id} key={tab.id}>
                    {tab.icon === "ai" ? (
                      <AgentTabIcon label="AI" />
                    ) : tab.icon === "agent-data-sync" ? (
                      <AgentTabIcon label="AI" />
                    ) : (
                      <svg aria-hidden="true" className="size-4 shrink-0 fill-current" viewBox="0 -960 960 960">
                        <path d={tabIcons[tab.icon as TabIconName]} />
                      </svg>
                    )}
                    {tab.label}
                    <Tabs.Indicator className="integration-tab-indicator" />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        ) : (
          <div className="empty-workspace">此节点暂无关联系统</div>
        )}
        <div
          className={`node-embed-panel ${activeTab === "wanzhen" ? "is-active" : "is-hidden"}`}
          aria-hidden={activeTab !== "wanzhen"}
          aria-label="万阵嵌入页面"
        >
          <iframe className="node-embed-frame" src="https://outsofts.cn/personalCenter/settings" title="Outsofts 设置页" loading="lazy" />
        </div>
        <div
          className={`node-embed-panel ${activeTab === "ecpro" ? "is-active" : "is-hidden"}`}
          aria-hidden={activeTab !== "ecpro"}
          aria-label="易尚货嵌入页面"
        >
          <iframe className="node-embed-frame" src="https://cms.ecpro.com/login" title="ECPro 登录页" loading="lazy" />
        </div>
        {activeTab === "ai-materials" && <MaterialGenerationWorkspace />}
        {activeTab === "data-sync" && node.templateId === "complete-link" && <DataSyncWorkspace />}
        {placeholder && <div className="empty-workspace">{placeholder}</div>}
      </div>

      <aside className="node-inspector" aria-label="节点详情">
        <div className="inspector-header">
          <div className="inspector-title-row">
            <Chip className={`inspector-status-chip is-${node.status}`} color={statusColors[node.status]} size="sm" variant="soft">{statusLabels[node.status]}</Chip>
            <h2>{node.label}</h2>
          </div>
        </div>
        <div className="inspector-fields">
            <Select
              aria-label="负责人"
              className="w-full"
              onSelectionChange={(selection) => {
                if (selection == null || selection === "all") return;

                const selectionValue = selection as unknown;

                const nextSelection =
                  selectionValue instanceof Set
                    ? new Set(Array.from(selectionValue, String))
                    : new Set(ownerSelection);

                if (!(selectionValue instanceof Set)) {
                  const selectedOwner = String(selectionValue);
                  if (nextSelection.has(selectedOwner)) {
                    nextSelection.delete(selectedOwner);
                  } else {
                    nextSelection.add(selectedOwner);
                  }
                }

                setOwnerSelection(nextSelection);
                const ownerValues = Array.from(nextSelection);
                onOwnerChange(ownerValues.length > 0 ? ownerValues : undefined);
              }}
              {...({ selectedKeys: node.owner ?? [] } as { selectedKeys: string[] })}
              selectionMode="multiple"
              variant="secondary"
            >
              <Label className="inspector-field-label">负责人</Label>
              <Select.Trigger className="node-meta-control rounded-md">
                <Select.Value>
                  {({ selectedItems, isPlaceholder }) =>
                    isPlaceholder
                      ? "请选择"
                      : selectedItems.map((owner) => (owner as { name?: string } | null)?.name).filter(Boolean).join("、")}
                </Select.Value>
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover className="node-owner-popover rounded-md">
                <ListBox items={owners}>{(owner) => <ListBox.Item id={owner.id}>{owner.name}</ListBox.Item>}</ListBox>
              </Select.Popover>
            </Select>
            <DateRangePicker
              aria-label="计划时间"
              className="w-full"
              value={
                node.plannedStart && node.plannedCompletion
                  ? { start: parseDate(node.plannedStart), end: parseDate(node.plannedCompletion) }
                  : null
              }
              onChange={(range) => {
                onPlannedStartChange(range?.start?.toString());
                onPlannedCompletionChange(range?.end?.toString());
              }}
              placeholderValue={today(getLocalTimeZone())}
            >
              <Label className="inspector-field-label">计划时间</Label>
              <DateField.Group className="node-meta-control rounded-md" variant="secondary">
                <DateField.InputContainer>
                  <DateField.Input slot="start">
                    {(segment) => <DateField.Segment segment={segment} />}
                  </DateField.Input>
                  <DateRangePicker.RangeSeparator />
                  <DateField.Input slot="end">
                    {(segment) => <DateField.Segment segment={segment} />}
                  </DateField.Input>
                </DateField.InputContainer>
                <DateField.Suffix>
                  <DateRangePicker.Trigger>
                    <DateRangePicker.TriggerIndicator />
                  </DateRangePicker.Trigger>
                </DateField.Suffix>
              </DateField.Group>
              <DateRangePicker.Popover className="node-date-popover rounded-lg">
                <RangeCalendar aria-label="选择计划时间">
                  <RangeCalendar.Header>
                    <RangeCalendar.YearPickerTrigger>
                      <RangeCalendar.YearPickerTriggerHeading />
                      <RangeCalendar.YearPickerTriggerIndicator />
                    </RangeCalendar.YearPickerTrigger>
                    <RangeCalendar.NavButton slot="previous" />
                    <RangeCalendar.NavButton slot="next" />
                  </RangeCalendar.Header>
                  <RangeCalendar.Grid>
                    <RangeCalendar.GridHeader>
                      {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                    </RangeCalendar.GridHeader>
                    <RangeCalendar.GridBody>
                      {(date) => <RangeCalendar.Cell date={date} />}
                    </RangeCalendar.GridBody>
                  </RangeCalendar.Grid>
                </RangeCalendar>
              </DateRangePicker.Popover>
            </DateRangePicker>
        </div>
        <div className="inspector-footer">
          {node.status === "completed" ? (
            <div className="completed-message"><CheckIcon /> 节点已完成 <span>{completedAtPlaceholder}</span></div>
          ) : node.status === "running" ? (
            <Button className="complete-button w-full rounded-md" size="sm" variant="primary" onPress={onComplete}>
              <CheckIcon /> 标记为完成
            </Button>
          ) : (
            <div className="pending-message">等待上游节点完成</div>
          )}
        </div>
      </aside>
    </section>
  );
}
