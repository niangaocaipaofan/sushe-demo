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

import type { WorkflowNode, WorkspaceTabIcon } from "../data/workflows";
import { useMaterialGeneration } from "../hooks/useMaterialGeneration";
import { getWanzhenProductFacts } from "../data/material-product-facts";
import type { ImageGenerationModel } from "../types/material-generation";
import { AgentTabIcon } from "./AgentTabIcon";
import { DataSyncWorkspace } from "./DataSyncWorkspace";
import { MaterialCategorySection } from "./MaterialCategorySection";
import { MaterialGenerationHistory } from "./MaterialGenerationHistory";
import { MaterialGenerationStatus } from "./MaterialGenerationStatus";
import { workspaceTabIconPaths } from "./WorkspaceTabIcon";

interface NodeWorkspaceProps {
  node: WorkflowNode | null;
  workflowId: string;
  spuId: string;
  onComplete: () => Promise<void>;
  isCompleting: boolean;
  onRollback: () => Promise<void>;
  isRollingBack: boolean;
  completionError: string | null;
  isSavingNodeMetadata: boolean;
  nodeMetadataError: string | null;
  onOwnerChange: (owner: string[] | undefined) => Promise<void>;
  onScheduleChange: (plannedStart: string | undefined, plannedCompletion: string | undefined) => Promise<void>;
  onSopChange: (sop: string) => Promise<void>;
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
  { id: "商品部", name: "商品部" },
  { id: "视觉部", name: "视觉部" },
  { id: "设计部", name: "设计部" },
  { id: "搭配间", name: "搭配间" },
  { id: "采购部", name: "采购部" },
  { id: "版房", name: "版房" },
  { id: "理单", name: "理单" },
];

// Temporary display value until completion timestamps are provided by workflow data.
const completedAtPlaceholder = "2026-08-30 14:30";

const imageModelOptions: Array<{ value: ImageGenerationModel; label: string }> = [
  { value: "smart-elderly", label: "智慧老人" },
  { value: "gpt2", label: "GPT-2" },
  { value: "nano-banana", label: "Nano Banana" },
  { value: "seedream5", label: "Seedream 5" },
];

const promptPresetOptions = [
  { value: "full", label: "完整商详页素材生成" },
  { value: "model-face-outfit", label: "模特换脸/换衣" },
  { value: "none", label: "无" },
] as const;


const workspaceTabIcons: Record<Exclude<WorkspaceTabIcon, "ai" | "data-sync">, string> = {
  database: workspaceTabIconPaths.database,
  "attach-file": workspaceTabIconPaths.attachFile,
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

const modelFaceOutfitRequirements = `【本次生成】

1. 服装上身

- 仅使用文件名属于「1换衣测试底图」的模特底图执行本任务。
- 「款式图」中的每一张服装，都必须分别应用到每一张「1换衣测试底图」上。
- 不得只为每张款式图选择一张模特底图。
- 服装上身任务数量 = 款式图数量 × 换衣测试底图数量。
- 例如：7 张款式图 × 3 张换衣测试底图 = 21 张结果。
- 半身图只替换上衣；尽量还原服装面料纹理和图案。
- 除服装外，背景、光影、色调、模特姿势、动作和身体朝向保持不变。

2. 头部替换

- 仅使用文件名属于「2换脸测试底图」的模特底图执行本任务。
- 将 AI数字人脸 按正脸、左侧脸、右侧脸与对应角度的换脸测试底图进行匹配。
- 每张 AI数字人脸至少产生 1 张对应结果。
- 本组素材共有 3 张 AI数字人脸，因此生成 3 张头部替换结果。
- 只替换头部，其他内容保持不变，头部与躯干融合自然。

3. 服装上身 + 头部替换

- 额外生成 3 张同时完成服装上身和头部替换的结果。
- 从前两类素材中选择合理组合。
- 这 3 张属于额外结果，不得替代前两类任务。

【数量校验】

在生成 Job Plan 前，先计算并返回各类 expectedCount。
本次素材应满足：

- 服装上身：7 × 3 = 21
- 头部替换：3
- 服装上身 + 头部替换：3
- total = 27

实际生成的 task 数量必须严格等于 expectedCount。
如果实际 task 数量不等于 27，则 Job Plan 无效，必须自行重新规划后再返回。`;

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

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, operation: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function uploadMaterialAsset(file: File) {
  const response = await fetch("/api/material-generation/assets", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Material-File-Name": encodeURIComponent(getReferenceFilePath(file)),
    },
    body: file,
  });
  const payload = await response.json().catch(() => null) as { asset?: { assetId?: string }; error?: string } | null;
  if (!response.ok || !payload?.asset?.assetId) {
    throw new Error(payload?.error || `上传参考图片失败：${file.name}`);
  }
  return { kind: "asset_id" as const, value: payload.asset.assetId };
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

function MaterialWorkspaceModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: "configure" | "history";
  onChange: (mode: "configure" | "history") => void;
  disabled?: boolean;
}) {
  return (
    <div className="material-workspace-mode-switch" aria-label="物料生成工作区视图">
      <button className={mode === "configure" ? "is-active" : ""} disabled={disabled} type="button" onClick={() => onChange("configure")}>生成配置</button>
      <button className={mode === "history" ? "is-active" : ""} disabled={disabled} type="button" onClick={() => onChange("history")}>历史任务</button>
    </div>
  );
}

function MaterialGenerationWorkspace({ workflowId, nodeId, spuId }: { workflowId: string; nodeId: string; spuId: string }) {
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
  const [promptPreset, setPromptPreset] = useState<(typeof promptPresetOptions)[number]["value"]>("full");
  const [isPromptPresetMenuOpen, setIsPromptPresetMenuOpen] = useState(false);
  const [imageModel, setImageModel] = useState<ImageGenerationModel>("smart-elderly");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"configure" | "history">("configure");
  const {
    workflowStatus,
    plan,
    tasks,
    errorMessage,
    currentJob,
    history,
    isLoadingHistory,
    isSubmitting,
    isSelectingJobId,
    handleStartGeneration,
    selectJob,
    loadHistory,
  } = useMaterialGeneration(workflowId, nodeId);
  const isGenerating = workflowStatus === "planning" || workflowStatus === "running";
  const [isPreparingSubmission, setIsPreparingSubmission] = useState(false);
  const [preparationError, setPreparationError] = useState<string>();
  const isStartingGeneration = isPreparingSubmission || isSubmitting;
  const productFactRows = getWanzhenProductFacts(spuId);

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
      setIsPreparingSubmission(true);
      setPreparationError(undefined);
      try {
        const referenceMaterials = await mapWithConcurrency(referenceFiles, 5, async (file) => ({
          name: getReferenceFilePath(file),
          type: file.type || "application/octet-stream",
          size: file.size,
          recognizedRole: recognizeReferenceMaterial(file.name).split(" · ")[0],
          // Archives remain planner metadata; images are uploaded separately so
          // the task JSON never contains a second Base64 copy of the full library.
          source: file.type.startsWith("image/")
            ? await uploadMaterialAsset(file)
            : undefined,
        }));
        await handleStartGeneration({
          productFacts: (includeProductFacts ? productFactRows : [])
            .map(({ id: _id, ...fact }) => ({ ...fact })),
          referenceMaterials,
          generationRequirements: materialRequirements,
          imageModel,
        });
      } catch (error) {
        setPreparationError(error instanceof Error ? error.message : "无法上传参考素材");
      } finally {
        setIsPreparingSubmission(false);
      }
    })();
  };

  const handleWorkspaceModeChange = (mode: "configure" | "history") => {
    setWorkspaceMode(mode);
    if (mode === "history") void loadHistory(true);
  };

  return (
    <div className="material-agent-workspace">
      {workspaceMode === "configure" ? (
      <form className="material-agent-form" onSubmit={(event) => { event.preventDefault(); startGeneration(); }}>
        <MaterialWorkspaceModeSwitch mode={workspaceMode} onChange={handleWorkspaceModeChange} disabled={isStartingGeneration} />
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
            <span className="material-input-hint">读取本地万阵商品文件</span>
          </div>
          <Table className="material-facts-table" variant="secondary">
            <Table.ScrollContainer>
              <Table.Content aria-label="从本地万阵文件读取的商品事实表格">
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
                          setMaterialRequirements(option.value === "full"
                            ? defaultMaterialRequirements
                            : option.value === "model-face-outfit" ? modelFaceOutfitRequirements : "");
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
              disabled={isGenerating || isStartingGeneration}
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
          <button className="material-generate-button" type="submit" disabled={isGenerating || isStartingGeneration || !materialRequirements.trim()}>
            {isPreparingSubmission ? "正在整理素材..." : isSubmitting ? "正在提交任务..." : workflowStatus === "planning" ? "正在规划..." : workflowStatus === "running" ? "生成进行中" : tasks.length ? "重新生成" : "开始生成"}
          </button>
        </div>
      </form>
      ) : (
        <aside className="material-history-panel">
          <MaterialWorkspaceModeSwitch mode={workspaceMode} onChange={handleWorkspaceModeChange} disabled={Boolean(isSelectingJobId)} />
          <MaterialGenerationHistory
            tasks={history}
            selectedTaskId={currentJob?.id}
            loading={isLoadingHistory}
            loadingTaskId={isSelectingJobId}
            onSelect={(taskId) => { void selectJob(taskId); }}
          />
        </aside>
      )}

      <section className="material-image-stage" aria-label="生成的图片展示">
        <div className="material-image-stage-header">
          <MaterialGenerationStatus
            status={workflowStatus}
            tasks={tasks}
            errorMessage={preparationError ?? errorMessage}
            startedAt={currentJob?.startedAt}
            completedAt={currentJob?.completedAt}
          />
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
      {isSelectingJobId && (
        <div className="material-result-loading" role="status">
          <span className="material-result-loading-spinner" />
          正在加载任务结果...
        </div>
      )}
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
  workflowId,
  spuId,
  onComplete,
  isCompleting,
  onRollback,
  isRollingBack,
  completionError,
  isSavingNodeMetadata,
  nodeMetadataError,
  onOwnerChange,
  onScheduleChange,
  onSopChange,
}: NodeWorkspaceProps) {
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [isSopOpen, setIsSopOpen] = useState(false);
  const [sopDraft, setSopDraft] = useState("");
  const sopControlRef = useRef<HTMLDivElement>(null);
  const tabs = node?.tabs ?? [];

  useEffect(() => {
    if (!node || tabs.length === 0 || activeTabs[node.id]) return;

    setActiveTabs((currentTabs) => ({
      ...currentTabs,
      [node.id]: tabs[0].id,
    }));
  }, [activeTabs, node, tabs]);

  useEffect(() => {
    setSopDraft(node?.sop ?? "");
    setIsSopOpen(false);
  }, [node?.id, node?.sop]);

  useEffect(() => {
    if (!isSopOpen) return;

    const closeSopOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !sopControlRef.current?.contains(event.target)) {
        setIsSopOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeSopOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeSopOnOutsidePress);
  }, [isSopOpen]);

  if (!node) {
    return (
      <Card className="mt-2 rounded-lg" variant="secondary">
        <Card.Content>
          <Card.Description>选择上方流程节点开始</Card.Description>
        </Card.Content>
      </Card>
    );
  }

  const activeTabId = tabs.length > 0 ? activeTabs[node.id] ?? tabs[0].id : null;
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const materialTab = tabs.find((tab) => tab.display.kind === "workspace" && tab.display.renderer === "material-generation");

  return (
    <section aria-live="polite" className="node-workspace-shell">
      <div className="integration-column">
        <div className="section-heading integration-heading">
          <h2>工作区</h2>
        </div>
        {tabs.length > 0 ? (
          <Tabs
            aria-label={`${node.label} 工作区`}
            className="integration-tabs"
            onSelectionChange={(tabId) =>
              setActiveTabs((currentTabs) => ({
                ...currentTabs,
                [node.id]: String(tabId),
              }))
            }
            selectedKey={activeTabId ?? undefined}
          >
            <Tabs.ListContainer className="integration-tab-list">
              <Tabs.List>
                {tabs.map((tab) => (
                  <Tabs.Tab className="integration-tab" id={tab.id} key={tab.id}>
                    {tab.icon === "ai" ? (
                      <AgentTabIcon label="AI" />
                    ) : tab.icon === "data-sync" ? (
                      <AgentTabIcon label="AI" />
                    ) : (
                      <svg aria-hidden="true" className="size-4 shrink-0 fill-current" viewBox="0 -960 960 960">
                        <path d={workspaceTabIcons[tab.icon]} />
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
          className={`node-embed-panel ${activeTab?.display.kind === "embedded" && activeTab.id === "wanzhen" ? "is-active" : "is-hidden"}`}
          aria-hidden={activeTab?.display.kind !== "embedded" || activeTab.id !== "wanzhen"}
          aria-label={activeTab?.display.kind === "embedded" ? activeTab.display.title : "万阵嵌入页面"}
        >
          {activeTab?.display.kind === "embedded" && activeTab.id === "wanzhen" && <iframe className="node-embed-frame" src={activeTab.display.src} title={activeTab.display.title} loading="lazy" />}
        </div>
        <div
          className={`node-embed-panel ${activeTab?.display.kind === "embedded" && activeTab.id === "ecpro" ? "is-active" : "is-hidden"}`}
          aria-hidden={activeTab?.display.kind !== "embedded" || activeTab.id !== "ecpro"}
          aria-label={activeTab?.display.kind === "embedded" ? activeTab.display.title : "易尚货嵌入页面"}
        >
          {activeTab?.display.kind === "embedded" && activeTab.id === "ecpro" && <iframe className="node-embed-frame" src={activeTab.display.src} title={activeTab.display.title} loading="lazy" />}
        </div>
        {materialTab && (
          <div
            className={`material-workspace-panel ${activeTabId === materialTab.id ? "is-active" : "is-hidden"}`}
            aria-hidden={activeTabId !== materialTab.id}
          >
            <MaterialGenerationWorkspace key={`${workflowId}:${node.id}`} workflowId={workflowId} nodeId={node.id} spuId={spuId} />
          </div>
        )}
        {activeTab?.display.kind === "workspace" && activeTab.display.renderer === "data-sync" && <DataSyncWorkspace key={spuId} spuId={spuId} />}
        {activeTab?.display.kind === "placeholder" && <div className="empty-workspace">{activeTab.display.message}</div>}
      </div>

      <aside className="node-inspector" aria-label="节点详情">
        <div className="inspector-header">
          <div className="inspector-title-row">
            <Chip className={`inspector-status-chip is-${node.status}`} color={statusColors[node.status]} size="sm" variant="soft">{statusLabels[node.status]}</Chip>
            <h2>{node.label}</h2>
          </div>
          <div className="sop-control" ref={sopControlRef}>
            <button
              aria-expanded={isSopOpen}
              aria-label="查看并编辑 SOP"
              className={`sop-trigger ${isSopOpen ? "is-active" : ""}`}
              onClick={() => {
                if (!isSopOpen) setSopDraft(node.sop);
                setIsSopOpen((isOpen) => !isOpen);
              }}
              type="button"
            >
              SOP
            </button>
            {isSopOpen && (
              <div className="sop-popover" role="dialog" aria-label={`${node.label} SOP`}>
                <div className="sop-popover-heading">
                  <strong>SOP</strong>
                  <button
                    className="sop-save-button"
                    disabled={isSavingNodeMetadata || sopDraft === node.sop}
                    onClick={() => void onSopChange(sopDraft)}
                    type="button"
                  >
                    {isSavingNodeMetadata ? "保存中…" : "保存"}
                  </button>
                </div>
                <textarea
                  aria-label={`${node.label} SOP 内容`}
                  className="sop-textarea"
                  onChange={(event) => setSopDraft(event.target.value)}
                  placeholder="请输入此节点的 SOP"
                  value={sopDraft}
                />
              </div>
            )}
          </div>
        </div>
        <div className="inspector-fields">
            <Select
              aria-label="负责人"
              className="w-full"
              key={node.id}
              onChange={(selection) => {
                const ownerValues = selection.map(String);
                void onOwnerChange(ownerValues.length > 0 ? ownerValues : undefined);
              }}
              value={node.owner ?? []}
              isDisabled={isSavingNodeMetadata}
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
                void onScheduleChange(range?.start?.toString(), range?.end?.toString());
              }}
              isDisabled={isSavingNodeMetadata}
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
            <div className="completed-actions">
              <div className="completed-message"><CheckIcon /> 已完成 <span>{completedAtPlaceholder}</span></div>
              <Button className="rollback-button rounded-md" size="sm" variant="primary" isDisabled={isRollingBack} onPress={() => void onRollback()}>
                {isRollingBack ? "正在回滚..." : "回滚"}
              </Button>
            </div>
          ) : node.status === "running" ? (
            <Button className="complete-button w-full rounded-md" size="sm" variant="primary" isDisabled={isCompleting} onPress={() => void onComplete()}>
              <CheckIcon /> {isCompleting ? "正在完成..." : "标记为完成"}
            </Button>
          ) : (
            <div className="pending-message">等待上游节点完成</div>
          )}
          {completionError && <div className="pending-message">{completionError}</div>}
          {nodeMetadataError && <div className="pending-message">{nodeMetadataError}</div>}
        </div>
      </aside>
    </section>
  );
}
