import type { ProductWorkflow } from "../data/workflows";
import type { WorkspaceSection } from "./SidebarNav";

interface WorkspaceDashboardProps {
  section: Exclude<WorkspaceSection, "publish">;
  workflows: ProductWorkflow[];
}

export function WorkspaceDashboard({ section, workflows }: WorkspaceDashboardProps) {
  const nodes = workflows.flatMap((workflow) => workflow.nodes.map((node) => ({ ...node, workflow })));
  const completed = nodes.filter((node) => node.status === "completed").length;
  const running = nodes.filter((node) => node.status === "running");
  const pending = nodes.filter((node) => node.status === "pending").length;
  const isInsights = section === "insights";
  return (
    <div className="feature-page">
      <header className="feature-page-header">
        <div>
          <span className="section-kicker">{isInsights ? "WORKSPACE OVERVIEW" : "MY WORK QUEUE"}</span>
          <h1>{isInsights ? "全景洞察" : "个人任务"}</h1>
        </div>
        <span>{isInsights ? "商品发布全链路概览" : "当前进行中的发布节点"}</span>
      </header>
      {isInsights && <div className="insight-metrics">
          <div><span>发布任务</span><strong>{workflows.length}</strong></div>
          <div><span>进行中节点</span><strong>{running.length}</strong></div>
          <div><span>待处理节点</span><strong>{pending}</strong></div>
          <div><span>完成进度</span><strong>{completed}/{nodes.length}</strong></div>
        </div>}
      <section className="feature-panel">
        <div className="feature-panel-heading"><h2>{isInsights ? "发布任务进度" : "待处理节点"}</h2><span>{isInsights ? "按商品查看" : `${running.length} 项进行中`}</span></div>
        <div className="workflow-summary-list">
          {isInsights ? workflows.map((workflow) => {
            const completeCount = workflow.nodes.filter((node) => node.status === "completed").length;
            return <div className="workflow-summary-row" key={workflow.id}><strong>{workflow.name}</strong><span>{workflow.spu}</span><small>{completeCount}/{workflow.nodes.length} 完成</small></div>;
          }) : running.map(({ workflow, ...node }) => <div className="workflow-summary-row" key={node.id}><strong>{node.label}</strong><span>{workflow.name}</span><small className="is-running">进行中</small></div>)}
        </div>
      </section>
    </div>
  );
}
