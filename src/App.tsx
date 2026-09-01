import { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";

import { NodeWorkspace } from "./components/NodeWorkspace";
import { SidebarNav, type WorkspaceSection } from "./components/SidebarNav";
import { WorkspaceDashboard } from "./components/WorkspaceDashboard";
import { WorkflowGraph } from "./components/WorkflowGraph";
import { productWorkflows } from "./data/workflows";

function LinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 -960 960 960" fill="currentColor">
      <path d="M318-120q-82 0-140-58t-58-140q0-40 15-76t43-64l134-133 56 56-134 134q-17 17-25.5 38.5T200-318q0 49 34.5 83.5T318-200q23 0 45-8.5t39-25.5l133-134 57 57-134 133q-28 28-64 43t-76 15Zm79-220-57-57 223-223 57 57-223 223Zm251-28-56-57 134-133q17-17 25-38t8-44q0-50-34-85t-84-35q-23 0-44.5 8.5T558-726L425-592l-57-56 134-134q28-28 64-43t76-15q82 0 139.5 58T839-641q0 39-14.5 75T782-502L648-368Z" />
    </svg>
  );
}

export default function App() {
  const [workflows, setWorkflows] = useState(productWorkflows);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("publish");
  const [copied, setCopied] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(
    () => localStorage.getItem("sushe:selected-product") ?? productWorkflows[0].id,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => localStorage.getItem("sushe:selected-node") ?? productWorkflows[0].nodes.find((node) => node.status === "running")?.id ?? null,
  );

  useEffect(() => {
    localStorage.setItem("sushe:selected-product", selectedProductId);
  }, [selectedProductId]);

  useEffect(() => {
    if (selectedNodeId) {
      localStorage.setItem("sushe:selected-node", selectedNodeId);
    } else {
      localStorage.removeItem("sushe:selected-node");
    }
  }, [selectedNodeId]);

  const selectedProduct = useMemo(
    () =>
      workflows.find((product) => product.id === selectedProductId) ??
      workflows[0],
    [selectedProductId, workflows],
  );

  const selectedNode =
    selectedProduct.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const handleProductChange = (productId: string) => {
    const nextProduct =
      workflows.find((product) => product.id === productId) ?? workflows[0];
    setSelectedProductId(productId);
    setSelectedNodeId(
      nextProduct.nodes.find((node) => node.status === "running")?.id ?? null,
    );
  };

  const handleCompleteNode = () => {
    if (!selectedNode || selectedNode.status !== "running") return;

    setWorkflows((currentWorkflows) =>
      currentWorkflows.map((workflow) => {
        if (workflow.id !== selectedProductId) return workflow;

        const completedNodeIds = new Set(
          workflow.nodes
            .filter((node) => node.status === "completed" || node.id === selectedNode.id)
            .map((node) => node.id),
        );
        const nextNodes = workflow.nodes.map((node) => {
          if (node.id === selectedNode.id) return { ...node, status: "completed" as const };
          if (node.status !== "pending") return node;

          const dependencies = workflow.edges.filter((edge) => edge.target === node.id);
          return dependencies.length > 0 && dependencies.every((edge) => completedNodeIds.has(edge.source))
            ? { ...node, status: "running" as const }
            : node;
        });

        return { ...workflow, nodes: nextNodes };
      }),
    );
  };

  const handleOwnerChange = (owner: string[] | undefined) => {
    if (!selectedNode) return;

    setWorkflows((currentWorkflows) =>
      currentWorkflows.map((workflow) =>
        workflow.id !== selectedProductId
          ? workflow
          : {
              ...workflow,
              nodes: workflow.nodes.map((node) =>
                node.id === selectedNode.id ? { ...node, owner } : node,
              ),
            },
      ),
    );
  };

  const handlePlannedCompletionChange = (plannedCompletion: string | undefined) => {
    if (!selectedNode) return;

    setWorkflows((currentWorkflows) =>
      currentWorkflows.map((workflow) =>
        workflow.id !== selectedProductId
          ? workflow
          : {
              ...workflow,
              nodes: workflow.nodes.map((node) =>
                node.id === selectedNode.id ? { ...node, plannedCompletion } : node,
              ),
            },
      ),
    );
  };

  const handlePlannedStartChange = (plannedStart: string | undefined) => {
    if (!selectedNode) return;

    setWorkflows((currentWorkflows) =>
      currentWorkflows.map((workflow) =>
        workflow.id !== selectedProductId
          ? workflow
          : {
              ...workflow,
              nodes: workflow.nodes.map((node) =>
                node.id === selectedNode.id ? { ...node, plannedStart } : node,
              ),
            },
      ),
    );
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="app-shell">
      <SidebarNav
        products={workflows}
        activeSection={activeSection}
        selectedProductId={selectedProductId}
        onSelectSection={setActiveSection}
        onSelectProduct={handleProductChange}
      />

      <div className="workspace-main">
        <header className="top-navbar">
          <div className="navbar-title">
            <strong>{activeSection === "publish" ? selectedProduct.name : activeSection === "insights" ? "全景洞察" : "个人任务"}</strong>
            {activeSection === "publish" && <span className="navbar-spu">{selectedProduct.spu}</span>}
          </div>
          {activeSection === "publish" && (
            <Button className="copy-link-button rounded-md" size="sm" variant="outline" onPress={handleCopyLink}>
              <LinkIcon />
              {copied ? "已复制" : "复制链接"}
            </Button>
          )}
        </header>
        {activeSection === "publish" ? (
          <div className="product-workbench">
            <section className="graph-section" aria-label={`${selectedProduct.name} 发布流程`}>
              <WorkflowGraph
                workflow={selectedProduct}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
            </section>

            <NodeWorkspace
              node={selectedNode}
              spuId={selectedProduct.spu}
              onComplete={handleCompleteNode}
              onOwnerChange={handleOwnerChange}
              onPlannedStartChange={handlePlannedStartChange}
              onPlannedCompletionChange={handlePlannedCompletionChange}
            />
          </div>
        ) : <WorkspaceDashboard section={activeSection} workflows={workflows} />}
      </div>
    </main>
  );
}
