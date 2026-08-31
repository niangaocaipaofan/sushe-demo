import { ArrowRight } from "@phosphor-icons/react";

import { useDataSyncWorkflow } from "../hooks/useDataSyncWorkflow";
import { DataScopeSelector } from "./data-sync/DataScopeSelector";
import { DifferenceTable } from "./data-sync/DifferenceTable";
import { PlatformSelector } from "./data-sync/PlatformSelector";
import { RouteSummary } from "./data-sync/RouteSummary";

export function DataSyncWorkspace() {
  const workflow = useDataSyncWorkflow();

  return (
    <section className="data-sync-workspace" aria-label="数据同步 Agent 工作区">
      <RouteSummary platforms={workflow.platforms} sourceIds={workflow.sourceIds} targetIds={workflow.targetIds} scopeIds={workflow.scopeIds} />

      <div className="sync-route-canvas">
        <PlatformSelector label="数据来源" platforms={workflow.platforms} selectedIds={workflow.sourceIds} onToggle={workflow.toggleSource} />
        <div className="sync-route-direction" aria-hidden="true"><ArrowRight size={20} weight="bold" /></div>
        <DataScopeSelector scopes={workflow.scopes} selectedIds={workflow.scopeIds} onToggle={workflow.toggleScope} />
        <div className="sync-route-direction" aria-hidden="true"><ArrowRight size={20} weight="bold" /></div>
        <PlatformSelector label="同步目标" platforms={workflow.platforms} selectedIds={workflow.targetIds} onToggle={workflow.toggleTarget} />
      </div>

      <DifferenceTable differences={workflow.differences} platforms={workflow.platforms} />

      {workflow.selectionNotice && <div className="sync-selection-notice" role="status">{workflow.selectionNotice}</div>}
      {workflow.createdTask && <div className="sync-task-created" role="status">本地模拟同步任务已创建：{workflow.createdTask.id}</div>}

      <div className="sync-workspace-actions">
        <button className="sync-primary-action" type="button" disabled={!workflow.canCreate || workflow.isCreating} onClick={() => void workflow.createTask()}>
          {workflow.isCreating ? "正在创建..." : "创建本地模拟同步任务"}
        </button>
      </div>
    </section>
  );
}
