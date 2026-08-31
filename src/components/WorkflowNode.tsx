import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { WorkflowFlowNode } from "../lib/layoutGraph";

const statusLabels = {
  completed: "已完成",
  running: "进行中",
  pending: "未开始",
} as const;

export function WorkflowNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return (
    <div className={`workflow-node${selected ? " is-selected" : ""}`} title={`${data.label} · ${statusLabels[data.status]}`}>
      <Handle className="workflow-handle" type="target" position={Position.Left} isConnectable={false} />
      <span className={`node-status-dot status-${data.status}`} />
      <span className="workflow-node-copy"><span className="workflow-node-label">{data.label}</span></span>
      <Handle className="workflow-handle" type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
