import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, type NodeMouseHandler, type NodeTypes } from "@xyflow/react";

import type { ProductWorkflow } from "../data/workflows";
import { layoutGraph, type WorkflowFlowNode } from "../lib/layoutGraph";
import { WorkflowNode } from "./WorkflowNode";

const nodeTypes: NodeTypes = { workflow: WorkflowNode };
interface WorkflowGraphProps {
  workflow: ProductWorkflow;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function WorkflowGraph({
  workflow,
  selectedNodeId,
  onSelectNode,
}: WorkflowGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const graph = useMemo(() => layoutGraph(workflow), [workflow]);
  const completedCount = workflow.nodes.filter((node) => node.status === "completed").length;
  const nodes = useMemo(
    () =>
      graph.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [graph.nodes, selectedNodeId],
  );
  const edges = useMemo(
    () =>
      graph.edges.map((edge) => {
        const connected =
          hoveredNodeId !== null &&
          (edge.source === hoveredNodeId || edge.target === hoveredNodeId);

        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: "#d9d9d9",
            strokeWidth: connected ? 1.25 : 1,
          },
        };
      }),
    [graph.edges, hoveredNodeId],
  );

  useEffect(() => {
    const runningNode = graph.nodes.find((node) => node.data.status === "running");
    const viewport = scrollRef.current;
    if (!runningNode || !viewport) return;

    const targetLeft =
      runningNode.position.x + runningNode.data.width / 2 - viewport.clientWidth / 2;
    viewport.scrollTo({ left: Math.max(0, targetLeft), behavior: "instant" });
  }, [graph, workflow.id]);

  const handleNodeClick: NodeMouseHandler<WorkflowFlowNode> = (_, node) => {
    onSelectNode(node.id);
  };

  return (
    <div
      className="workflow-graph"
      style={{ height: graph.canvasHeight + 8 }}
      aria-label={`${workflow.name} 发布流程`}
    >
      <div className="graph-canvas-meta" aria-hidden="true">
        <span>工作流程</span>
        <span>{completedCount}/{workflow.nodes.length} 完成</span>
        <span>已进行：—</span>
      </div>
      <div className="workflow-graph-scroll" ref={scrollRef}>
        <div
          className="workflow-graph-canvas"
          style={{ width: graph.canvasWidth, height: graph.canvasHeight }}
        >
          <ReactFlow
            key={workflow.id}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            edgesFocusable={false}
            nodesFocusable
            deleteKeyCode={null}
            onNodeClick={handleNodeClick}
            onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
            onNodeMouseLeave={() => setHoveredNodeId(null)}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={1}
            maxZoom={1}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
            className="supabase-flow"
          />
        </div>
      </div>
    </div>
  );
}
