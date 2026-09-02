import { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";

import { NodeWorkspace } from "./components/NodeWorkspace";
import { SidebarNav, type WorkspaceSection } from "./components/SidebarNav";
import { WorkspaceDashboard } from "./components/WorkspaceDashboard";
import { WorkflowGraph } from "./components/WorkflowGraph";
import { productWorkflows, type ProductWorkflow } from "./data/workflows";

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
  const [isCompleting, setIsCompleting] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [isSavingNodeMetadata, setIsSavingNodeMetadata] = useState(false);
  const [nodeMetadataError, setNodeMetadataError] = useState<string | null>(null);
  const [workflowVersions, setWorkflowVersions] = useState<Record<string, number>>(
    () => Object.fromEntries(productWorkflows.map((workflow) => [workflow.id, 1])),
  );
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

  useEffect(() => {
    void fetch("/api/workflows")
      .then(async (response) => {
        if (!response.ok) throw new Error("无法加载 workflow 状态");
        return response.json() as Promise<{ workflows: ProductWorkflow[]; workflowVersions: Record<string, number> }>;
      })
      .then(({ workflows: storedWorkflows, workflowVersions: storedVersions }) => {
        setWorkflows(storedWorkflows);
        setWorkflowVersions(storedVersions);
      })
      .catch(() => undefined);
  }, []);

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

  const handleCompleteNode = async () => {
    if (!selectedNode || selectedNode.status !== "running") return;
    setIsCompleting(true);
    setCompletionError(null);
    try {
      const response = await fetch("/api/workflow-node-completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: selectedProductId, nodeId: selectedNode.id }),
      });
      const payload = await response.json().catch(() => ({})) as { workflow?: ProductWorkflow; workflowVersion?: number; error?: string };
      if (!response.ok || !payload.workflow) throw new Error(payload.error ?? "完成节点失败");
      const nextNode = payload.workflow.nodes.find((node) =>
        node.status === "running" && payload.workflow!.edges.some((edge) => edge.source === selectedNode.id && edge.target === node.id),
      ) ?? payload.workflow.nodes.find((node) => node.status === "running");
      setWorkflows((currentWorkflows) => currentWorkflows.map((workflow) =>
        workflow.id === payload.workflow!.id ? payload.workflow! : workflow,
      ));
      setWorkflowVersions((currentVersions) => ({ ...currentVersions, [selectedProductId]: payload.workflowVersion ?? currentVersions[selectedProductId] + 1 }));
      if (nextNode) setSelectedNodeId(nextNode.id);
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : "完成节点失败");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleRollbackNode = async () => {
    if (!selectedNode || selectedNode.status !== "completed") return;
    setIsRollingBack(true);
    setCompletionError(null);
    try {
      const response = await fetch("/api/workflow-node-rollbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: selectedProductId, nodeId: selectedNode.id }),
      });
      const payload = await response.json().catch(() => ({})) as { workflow?: ProductWorkflow; workflowVersion?: number; error?: string };
      if (!response.ok || !payload.workflow) throw new Error(payload.error ?? "回滚节点失败");
      setWorkflows((currentWorkflows) => currentWorkflows.map((workflow) =>
        workflow.id === payload.workflow!.id ? payload.workflow! : workflow,
      ));
      setWorkflowVersions((currentVersions) => ({ ...currentVersions, [selectedProductId]: payload.workflowVersion ?? currentVersions[selectedProductId] + 1 }));
      setSelectedNodeId(selectedNode.id);
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : "回滚节点失败");
    } finally {
      setIsRollingBack(false);
    }
  };

  const updateNodeMetadata = async (patch: { owner?: string[] | null; plannedStart?: string | null; plannedCompletion?: string | null; sop?: string }) => {
    if (!selectedNode) return;
    setIsSavingNodeMetadata(true);
    setNodeMetadataError(null);
    try {
      const response = await fetch("/api/workflow-node-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: selectedProductId,
          nodeId: selectedNode.id,
          expectedVersion: workflowVersions[selectedProductId],
          patch,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { workflow?: ProductWorkflow; workflowVersion?: number; error?: string };
      if (!response.ok || !payload.workflow || payload.workflowVersion === undefined) throw new Error(payload.error ?? "更新节点信息失败");
      setWorkflows((currentWorkflows) => currentWorkflows.map((workflow) =>
        workflow.id === payload.workflow!.id ? payload.workflow! : workflow,
      ));
      setWorkflowVersions((currentVersions) => ({ ...currentVersions, [selectedProductId]: payload.workflowVersion! }));
    } catch (error) {
      setNodeMetadataError(error instanceof Error ? error.message : "更新节点信息失败");
    } finally {
      setIsSavingNodeMetadata(false);
    }
  };

  const handleOwnerChange = async (owner: string[] | undefined) => {
    await updateNodeMetadata({ owner: owner ?? null });
  };

  const handleScheduleChange = async (plannedStart: string | undefined, plannedCompletion: string | undefined) => {
    await updateNodeMetadata({ plannedStart: plannedStart ?? null, plannedCompletion: plannedCompletion ?? null });
  };

  const handleSopChange = async (sop: string) => {
    await updateNodeMetadata({ sop });
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
              workflowId={selectedProduct.id}
              spuId={selectedProduct.spu}
              onComplete={handleCompleteNode}
              isCompleting={isCompleting}
              onRollback={handleRollbackNode}
              isRollingBack={isRollingBack}
              completionError={completionError}
              isSavingNodeMetadata={isSavingNodeMetadata}
              nodeMetadataError={nodeMetadataError}
              onOwnerChange={handleOwnerChange}
              onScheduleChange={handleScheduleChange}
              onSopChange={handleSopChange}
            />
          </div>
        ) : <WorkspaceDashboard section={activeSection} workflows={workflows} />}
      </div>
    </main>
  );
}
