import type { DifferenceResolution, DifferenceResult, PlatformId, SyncDifference, SyncPlatform } from "../../types/data-sync";

interface DifferenceTableProps {
  differences: SyncDifference[];
  platforms: SyncPlatform[];
  resolutions: Record<string, DifferenceResolution>;
  onResolve: (id: string, resolution: DifferenceResolution) => void;
}

const resultLabels: Record<DifferenceResult, string> = { added: "新增", pending: "待确认", skipped: "无变化" };

function platformLabel(platforms: SyncPlatform[], id: PlatformId) {
  return platforms.find((platform) => platform.id === id)?.label ?? id;
}

export function DifferenceTable({ differences, platforms, resolutions, onResolve }: DifferenceTableProps) {
  return (
    <section className="sync-difference-section" aria-label="差异明细">
      <div className="sync-difference-heading"><strong>差异明细</strong><span>当前显示 {differences.length} 条对比结果</span></div>
      <div className="sync-difference-list">
        {differences.length ? differences.map((difference) => (
          <article className={`sync-diff-item is-${difference.result}`} key={difference.id} aria-label={difference.dataItem}>
            <header className="sync-diff-item-header">
              <div className="sync-diff-item-title">
                <strong>{difference.dataItem}</strong>
                <span>{platformLabel(platforms, difference.sourcePlatform)} → {platformLabel(platforms, difference.targetPlatform)}</span>
                <em className={`sync-result is-${difference.result}`}>{resultLabels[difference.result]}</em>
              </div>
              {difference.result !== "skipped" ? (
                <div className="sync-resolution-options" aria-label={`${difference.dataItem}处理方式`}>
                  <button className={resolutions[difference.id] === "overwrite" ? "is-selected" : ""} type="button" onClick={() => onResolve(difference.id, "overwrite")}>{difference.result === "added" ? "新增到目标" : "来源覆盖"}</button>
                  <button className={resolutions[difference.id] === "skip" ? "is-selected" : ""} type="button" onClick={() => onResolve(difference.id, "skip")}>{difference.result === "added" ? "跳过" : "保留目标"}</button>
                </div>
              ) : <span className="sync-resolution-auto">无需处理</span>}
            </header>
            <div className="sync-diff-compare">
              <div className="sync-diff-value is-before">
                <b aria-hidden="true">−</b>
                <span><small>目标当前值 · {platformLabel(platforms, difference.targetPlatform)}</small><strong>{difference.targetValue}</strong></span>
              </div>
              <div className="sync-diff-value is-after">
                <b aria-hidden="true">+</b>
                <span><small>来源拟写入值 · {platformLabel(platforms, difference.sourcePlatform)}</small><strong>{difference.sourceValue}</strong></span>
              </div>
            </div>
          </article>
        )) : <div className="sync-difference-empty">当前选择下没有可显示的差异</div>}
      </div>
    </section>
  );
}
