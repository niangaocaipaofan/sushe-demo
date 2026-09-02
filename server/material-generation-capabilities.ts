import type { WorkflowCapabilityDescriptor } from "../src/types/material-generation.ts";

export type WorkflowImageInput = {
  key: string;
  description: string;
  nodeId: string;
  fieldName: "image";
};

export type WorkflowTextInput = {
  key: string;
  description: string;
  apiDescription?: string;
  nodeId: string;
  fieldName: "value";
  source: "fixed" | "orchestrator";
  value?: string;
};

export type SmartElderlyCapability = {
  id: string;
  name: string;
  description: string;
  appId: string;
  imageInputs: WorkflowImageInput[];
  textInputs: WorkflowTextInput[];
};

const faceSwapPrompt = "使用图1作为基础构图和姿态。将图2的头部换到图1的女人上。保持身体结构正常，保持图1的构图和裁切。\n";
const outfitSwapPrompt = "使用图1作为基础构图和姿态。将图2中的着装穿在图1的女人身上。保持身体结构正常，保持图1的构图和裁切。无需将图2中的所有元素换入图1，如果不可见。\n";
const faceOutfitSwapPrompt = "使用图1作为基础构图和姿态。将图2中的着装穿在图1的女人身上。将图3的头部换到图1的女人上。保持身体结构正常，保持图1的构图和裁切。无需将图2中的所有元素换入图1，如果不可见。\n";

/**
 * Fixed RunningHub contracts live here instead of being spread through planner
 * and execution code. Adding another workflow should only require another
 * capability entry and its environment-backed identifiers.
 */
export function createSmartElderlyCapabilities(env: Record<string, string | undefined>): SmartElderlyCapability[] {
  return [
    {
      id: "model-face-swap",
      name: "模特换头",
      description: "保留模特身体、服装、姿势、构图和背景，只将身份参考图中的头部替换到模特底图。",
      appId: env.RUNNINGHUB_FACE_SWAP_APP_ID || "2095062447483871234",
      imageInputs: [
        { key: "identity", description: "用于替换头部的身份或数字人脸参考图", nodeId: env.RUNNINGHUB_FACE_SWAP_IDENTITY_NODE_ID || "81", fieldName: "image" },
        { key: "model_base", description: "需要被换头的模特底图", nodeId: env.RUNNINGHUB_FACE_SWAP_MODEL_NODE_ID || "76", fieldName: "image" },
      ],
      textInputs: [
        { key: "base_prompt", description: "工作流固定基础指令", nodeId: env.RUNNINGHUB_FACE_SWAP_PROMPT_NODE_ID || "175", fieldName: "value", source: "fixed", value: faceSwapPrompt },
      ],
    },
    {
      id: "model-outfit-swap",
      name: "模特换衣",
      description: "保留模特、姿势、构图和背景，将服装参考图中的着装替换到模特底图。",
      appId: env.RUNNINGHUB_OUTFIT_SWAP_APP_ID || "2095060120060391425",
      imageInputs: [
        { key: "model_base", description: "需要被换衣的模特底图", nodeId: env.RUNNINGHUB_OUTFIT_SWAP_MODEL_NODE_ID || "76", fieldName: "image" },
        { key: "cloth_ref", description: "目标服装或款式参考图", nodeId: env.RUNNINGHUB_OUTFIT_SWAP_CLOTH_NODE_ID || "81", fieldName: "image" },
      ],
      textInputs: [
        { key: "supplemental_description", description: "结合文件名、商品事实和用户要求生成的任务补充说明；可以描述服装，也可以补充其他与本次结果有关的约束", apiDescription: "cloth_description", nodeId: env.RUNNINGHUB_OUTFIT_SWAP_DESCRIPTION_NODE_ID || "176", fieldName: "value", source: "orchestrator" },
        { key: "base_prompt", description: "工作流固定基础指令", nodeId: env.RUNNINGHUB_OUTFIT_SWAP_PROMPT_NODE_ID || "175", fieldName: "value", source: "fixed", value: outfitSwapPrompt },
      ],
    },
    {
      id: "model-face-outfit-swap",
      name: "模特换头换衣",
      description: "在同一张模特底图上同时完成头部身份替换和服装替换。",
      appId: env.RUNNINGHUB_FACE_OUTFIT_SWAP_APP_ID || "2095052952716267521",
      imageInputs: [
        { key: "identity", description: "用于替换头部的身份或数字人脸参考图", nodeId: env.RUNNINGHUB_FACE_OUTFIT_SWAP_IDENTITY_NODE_ID || "170", fieldName: "image" },
        { key: "model_base", description: "需要同时换头和换衣的模特底图", nodeId: env.RUNNINGHUB_FACE_OUTFIT_SWAP_MODEL_NODE_ID || "76", fieldName: "image" },
        { key: "cloth_ref", description: "目标服装或款式参考图", nodeId: env.RUNNINGHUB_FACE_OUTFIT_SWAP_CLOTH_NODE_ID || "81", fieldName: "image" },
      ],
      textInputs: [
        { key: "supplemental_description", description: "结合文件名、商品事实和用户要求生成的任务补充说明；可以描述服装，也可以补充其他与本次结果有关的约束", apiDescription: "cloth_description", nodeId: env.RUNNINGHUB_FACE_OUTFIT_SWAP_DESCRIPTION_NODE_ID || "179", fieldName: "value", source: "orchestrator" },
        { key: "base_prompt", description: "工作流固定基础指令", nodeId: env.RUNNINGHUB_FACE_OUTFIT_SWAP_PROMPT_NODE_ID || "175", fieldName: "value", source: "fixed", value: faceOutfitSwapPrompt },
      ],
    },
  ];
}

export function describeWorkflowCapabilities(capabilities: SmartElderlyCapability[]): WorkflowCapabilityDescriptor[] {
  return capabilities.map((capability) => ({
    id: capability.id,
    name: capability.name,
    description: capability.description,
    imageInputs: capability.imageInputs.map(({ key, description }) => ({ key, description })),
    textInputs: capability.textInputs.map(({ key, description, source }) => ({
      key,
      description,
      generatedByOrchestrator: source === "orchestrator",
    })),
  }));
}
