import { useDataSyncWorkflow } from "../hooks/useDataSyncWorkflow";
import type { PlatformId, SyncPlatform, SyncSourceId } from "../types/data-sync";
import { DataSyncTaskCard } from "./data-sync/DataSyncTaskCard";

interface DataSyncWorkspaceProps { spuId: string; }

function platformLabel(platforms: SyncPlatform[], id: SyncSourceId | null) {
  if (id === "uploaded-file") return "上传文件";
  return platforms.find((platform) => platform.id === id)?.label ?? id;
}

export function DataSyncWorkspace({ spuId }: DataSyncWorkspaceProps) {
  const workflow = useDataSyncWorkflow(spuId);
  const completedCount = workflow.tasks.filter((task) => task.canSubmit).length;
  const resultCount = workflow.tasks.filter((task) => task.result).length;

  return (
    <section className="data-sync-workspace" aria-label="数据协同专员工作区">
      <div className="sync-two-column-layout">
        <section className="sync-task-column" aria-label="任务列表">
          <div className="sync-column-heading"><div><strong>任务列表</strong><small>配置来源、终点以及两步映射</small></div><span>{workflow.tasks.length}</span></div>
          <div className="sync-task-list">
            {workflow.tasks.map((task, index) => <DataSyncTaskCard
              key={task.id}
              index={index}
              task={task}
              platforms={workflow.platforms}
              onRemove={() => workflow.removeTask(task.id)}
              onSelectSource={(id) => workflow.selectSource(task.id, id)}
              onSelectTarget={(id) => workflow.selectTarget(task.id, id)}
              onMappingChange={(mappingId, targetFieldKey, createTargetField) => workflow.updateSchemaMapping(task.id, mappingId, targetFieldKey, createTargetField)}
              onToggleMapping={(mappingId) => workflow.toggleSchemaMapping(task.id, mappingId)}
              onAdvanceToValues={() => workflow.advanceToValueMapping(task.id)}
              onSetStep={(step) => workflow.setActiveStep(task.id, step)}
              onResolveDifference={(differenceId, resolution) => workflow.resolveDifference(task.id, differenceId, resolution)}
            />)}
            {!workflow.tasks.length && <div className="sync-task-empty"><strong>还没有同步任务</strong><small>创建任务后，再配置数据源、终点以及两步映射。</small></div>}
          </div>
          <footer className="sync-batch-actions">
            <button className="sync-add-task" type="button" onClick={workflow.addTask}><span>＋</span>创建同步任务</button>
            <div className="sync-action-summary"><strong>{workflow.canSubmitAll ? "全部任务已就绪" : `${completedCount} / ${workflow.tasks.length} 个任务已就绪`}</strong><small>批量提交会一次执行全部任务</small></div>
            <button className="sync-primary-action" type="button" disabled={!workflow.canSubmitAll || workflow.isSubmitting} onClick={() => void workflow.submitAll()}>{workflow.isSubmitting ? "正在批量提交..." : `批量提交 ${workflow.tasks.length} 个任务`}</button>
          </footer>
        </section>

        <aside className="sync-results-column" aria-label="任务执行结果">
          <div className="sync-column-heading"><div><strong>执行结果</strong><small>批量提交后按任务展示结果</small></div><span>{resultCount}</span></div>
          <div className="sync-result-list">
            {workflow.tasks.map((task, index) => task.result ? <article className="sync-result-card" key={task.id}>
              <header><div><span>{String(index + 1).padStart(2, "0")}</span><strong>{task.uploadedSource?.label ?? platformLabel(workflow.platforms, task.sourceKey)} → {platformLabel(workflow.platforms, task.targetId)}</strong></div><em>执行成功</em></header>
              <div className="sync-result-metrics"><div><strong>{task.result.overwriteCount}</strong><small>写入</small></div><div><strong>{task.result.skippedCount}</strong><small>跳过/保留</small></div><div><strong>{task.result.differenceCount}</strong><small>处理总数</small></div></div>
              <footer><code>{task.result.id}</code><time dateTime={task.result.createdAt}>{new Date(task.result.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></footer>
            </article> : null)}
            {!resultCount && <div className="sync-results-empty"><span>✓</span><strong>等待任务执行</strong><small>完成左侧全部任务配置并批量提交后，结果将在这里展示。</small></div>}
          </div>
        </aside>
      </div>
    </section>
  );
}
