import dagre from "@dagrejs/dagre";
import { Position, type Edge, type Node } from "@xyflow/react";

import type { ProductWorkflow, WorkflowStatus } from "../data/workflows";

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  status: WorkflowStatus;
  width: number;
}

export type WorkflowFlowNode = Node<WorkflowNodeData, "workflow">;

const NODE_HEIGHT = 32;
const CANVAS_VERTICAL_PADDING = 72;

export function layoutGraph(workflow: ProductWorkflow): {
  nodes: WorkflowFlowNode[];
  edges: Edge[];
  canvasWidth: number;
  canvasHeight: number;
} {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  const nodeWidths = new Map(
    workflow.nodes.map((node) => {
      const textWidth = Array.from(node.label).reduce(
        (width, character) =>
          width + (/^[\x00-\x7F]$/.test(character) ? (character === " " ? 5 : 7) : 13),
        0,
      );
      return [node.id, Math.max(84, Math.min(240, textWidth + 32))];
    }),
  );

  graph.setGraph({
    rankdir: "LR",
    align: "UL",
    nodesep: 20,
    ranksep: 58,
    marginx: 20,
    marginy: 20,
  });

  workflow.nodes.forEach((node) => {
    graph.setNode(node.id, {
      width: nodeWidths.get(node.id) ?? 64,
      height: NODE_HEIGHT,
    });
  });

  workflow.edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);

  const laidOutNodes = workflow.nodes.map((node) => graph.node(node.id));
  const minY = Math.min(...laidOutNodes.map((node) => node.y - NODE_HEIGHT / 2));
  const maxY = Math.max(...laidOutNodes.map((node) => node.y + NODE_HEIGHT / 2));
  const contentHeight = maxY - minY;
  const canvasHeight = Math.ceil(contentHeight + CANVAS_VERTICAL_PADDING * 2);
  const verticalOffset = CANVAS_VERTICAL_PADDING - minY;

  const nodes: WorkflowFlowNode[] = workflow.nodes.map((node) => {
    const position = graph.node(node.id);
    const width = nodeWidths.get(node.id) ?? 64;

    return {
      id: node.id,
      type: "workflow",
      position: {
        x: position.x - width / 2,
        y: position.y - NODE_HEIGHT / 2 + verticalOffset,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: node.label, status: node.status, width },
      style: { width },
    };
  });

  const edges: Edge[] = workflow.edges.map((edge, index) => ({
    id: `${edge.source}-${edge.target}-${index}`,
    source: edge.source,
    target: edge.target,
    type: "default",
    style: {
      stroke: "#d9d9d9",
      strokeWidth: 1,
    },
  }));

  const leftEdge = Math.min(...nodes.map((node) => node.position.x));
  const rightEdge = Math.max(...nodes.map((node) => node.position.x + node.data.width));
  const contentWidth = rightEdge - leftEdge;
  const canvasWidth = Math.ceil(contentWidth + 24);
  const horizontalOffset = (canvasWidth - contentWidth) / 2 - leftEdge;

  nodes.forEach((node) => {
    node.position.x += horizontalOffset;
  });

  return { nodes, edges, canvasWidth, canvasHeight };
}
