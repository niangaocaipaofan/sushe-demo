import type { MaterialGenerationJobSummary } from "../types/material-generation";

const statusLabels: Record<MaterialGenerationJobSummary["status"], string> = {
  queued: "等待执行",
  planning: "规划中",
  running: "生成中",
  completed: "已完成",
  failed: "失败",
};

const sourceLabels: Record<MaterialGenerationJobSummary["source"], string> = { web: "网页", mcp: "MCP" };

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function MaterialGenerationHistory({ tasks, selectedTaskId, loading, loadingTaskId, onSelect }: {
  tasks: MaterialGenerationJobSummary[];
  selectedTaskId?: string;
  loading: boolean;
  loadingTaskId?: string;
  onSelect: (taskId: string) => void;
}) {
  return (
    <div className="material-history-content">
      <div className="material-history-heading">
        <div><strong>历史任务</strong><small>仅显示当前商品发布工作流</small></div>
        <span>{tasks.length}</span>
      </div>
      {loading ? <div className="material-history-empty">正在加载任务...</div> : tasks.length ? (
        <div className="material-history-list">
          {tasks.map((task) => (
            <button
              className={`material-history-card${selectedTaskId === task.id ? " is-selected" : ""}`}
              disabled={Boolean(loadingTaskId)}
              key={task.id}
              onClick={() => onSelect(task.id)}
              type="button"
            >
              <div className="material-history-preview">
                {task.previewImageUrl ? <img src={task.previewImageUrl} alt="最后生成的物料" /> : <span />}
              </div>
              <div className="material-history-info">
                <div><strong>{task.id.slice(0, 8)}</strong><em className={`is-${task.status}`}>{statusLabels[task.status]}</em></div>
                <p>{loadingTaskId === task.id ? "正在加载任务结果..." : `${task.completedCount} / ${task.totalCount} 张 · ${sourceLabels[task.source]} · ${task.imageModel}`}</p>
                <small>{formatTime(task.createdAt)}{task.failedCount ? ` · ${task.failedCount} 张失败` : ""}</small>
              </div>
            </button>
          ))}
        </div>
      ) : <div className="material-history-empty">当前工作流暂无生成任务</div>}
    </div>
  );
}
