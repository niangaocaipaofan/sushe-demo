import type { DataSyncTaskView } from "../../hooks/useDataSyncWorkflow";
import type { DifferenceResolution, PlatformId, SyncPlatform } from "../../types/data-sync";
import { DataSourcePicker } from "./DataSourcePicker";
import { DifferenceTable } from "./DifferenceTable";
import { SchemaMappingTable } from "./SchemaMappingTable";

interface DataSyncTaskCardProps {
  index: number;
  task: DataSyncTaskView;
  platforms: SyncPlatform[];
  onRemove: () => void;
  onSelectSource: (id: PlatformId) => void;
  onSelectTarget: (id: PlatformId) => void;
  onMappingChange: (mappingId: string, targetFieldKey: string, createTargetField: boolean) => void;
  onToggleMapping: (mappingId: string) => void;
  onAdvanceToValues: () => void;
  onSetStep: (step: 1 | 2) => void;
  onResolveDifference: (differenceId: string, resolution: DifferenceResolution) => void;
}

function RemoveTaskIcon() {
  return <svg aria-hidden="true" viewBox="0 -960 960 960" fill="currentColor"><path d="M261-120q-24 0-42-18t-18-42v-540h-41v-80h200v-40h240v40h200v80h-41v540q0 24-18 42t-42 18H261Zm418-600H281v540h398v-540ZM360-260h80v-380h-80v380Zm160 0h80v-380h-80v380ZM281-720v540-540Z" /></svg>;
}

export function DataSyncTaskCard({ index, task, platforms, onRemove, onSelectSource, onSelectTarget, onMappingChange, onToggleMapping, onAdvanceToValues, onSetStep, onResolveDifference }: DataSyncTaskCardProps) {
  const valueComplete = task.schemaComplete && task.unresolvedDecisionCount === 0;
  const routeSelected = Boolean(task.sourceKey && task.targetId);
  return (
    <article className="sync-task-card" aria-label={`同步任务 ${index + 1}`}>
      <header className={`sync-task-header${routeSelected ? "" : " is-route-incomplete"}`}>
        <div className="sync-task-title" aria-label={`同步任务 ${index + 1}`}><span>{String(index + 1).padStart(2, "0")}</span></div>
        <nav className="sync-task-steps" aria-label="任务步骤">
          <button className={`${task.activeStep === 1 ? "is-active" : ""}${task.schemaComplete ? " is-complete" : ""}`} type="button" onClick={() => onSetStep(1)}><span>{task.schemaComplete ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.2 8.2 3 3 6.6-6.6" /></svg> : "1"}</span><strong>字段映射</strong><small>{task.schemaSelectedCount}/{task.sourceSchema.length}</small></button>
          <i aria-hidden="true" />
          <button className={`${task.activeStep === 2 ? "is-active" : ""}${valueComplete ? " is-complete" : ""}`} type="button" disabled={!task.schemaComplete} onClick={() => onSetStep(2)}><span>{valueComplete ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.2 8.2 3 3 6.6-6.6" /></svg> : "2"}</span><strong>值映射</strong><small>{!task.schemaComplete ? "等待选择" : task.unresolvedDecisionCount ? `${task.unresolvedDecisionCount} 项待处理` : "已完成"}</small></button>
        </nav>
        <div className="sync-task-header-actions">
          <div className="sync-task-route-inline" aria-label="任务同步路由">
            <DataSourcePicker label="数据源" platforms={platforms} selectedId={task.sourceId} selectedLabel={task.uploadedSource?.label} onSelect={onSelectSource} />
            <span className="sync-task-route-arrow" aria-hidden="true">→</span>
            <DataSourcePicker label="同步终点" platforms={platforms} selectedId={task.targetId} excludedIds={task.sourceId ? new Set([task.sourceId]) : new Set()} onSelect={onSelectTarget} />
          </div>
          <button className="sync-task-remove" type="button" onClick={onRemove} aria-label={`删除同步任务 ${index + 1}`}><RemoveTaskIcon /></button>
        </div>
      </header>

      {routeSelected && <div className="sync-task-body">
        <div className="sync-task-table-panel">
          {task.activeStep === 1 ? <SchemaMappingTable
            sourceSchema={task.sourceSchema}
            targetSchema={task.targetSchema}
            targetId={task.targetId}
            platforms={platforms}
            mappings={task.schemaMappings}
            selectedMappingIds={new Set(task.selectedMappingIds)}
            onChange={onMappingChange}
            onToggle={onToggleMapping}
            onNext={onAdvanceToValues}
          /> : <DifferenceTable differences={task.differences} resolutions={task.differenceResolutions} onResolve={onResolveDifference} />}
        </div>
      </div>}
    </article>
  );
}
