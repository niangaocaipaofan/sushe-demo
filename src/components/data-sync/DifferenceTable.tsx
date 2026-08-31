import type { DifferenceResolution, DifferenceResult, PlatformId, SyncDifference, SyncPlatform } from "../../types/data-sync";

interface DifferenceTableProps {
  differences: SyncDifference[];
  platforms: SyncPlatform[];
  resolutions: Record<string, DifferenceResolution>;
  onResolve: (id: string, resolution: DifferenceResolution) => void;
}

const resultLabels: Record<DifferenceResult, string> = { added: "新增", updated: "更新", conflict: "冲突", skipped: "跳过" };

function platformLabel(platforms: SyncPlatform[], id: PlatformId) {
  return platforms.find((platform) => platform.id === id)?.label ?? id;
}

export function DifferenceTable({ differences, platforms, resolutions, onResolve }: DifferenceTableProps) {
  return (
    <section className="sync-difference-section" aria-label="差异明细">
      <div className="sync-difference-heading"><strong>差异明细</strong><span>当前显示 {differences.length} 条对比结果</span></div>
      <div className="sync-difference-table-wrap">
        <table className="sync-difference-table">
          <thead><tr><th>数据项</th><th>来源</th><th>目标</th><th>来源值</th><th>目标值</th><th>对比结果</th><th>处理方式</th></tr></thead>
          <tbody>
            {differences.length ? differences.map((difference) => (
              <tr key={difference.id}>
                <td>{difference.dataItem}</td><td>{platformLabel(platforms, difference.sourcePlatform)}</td><td>{platformLabel(platforms, difference.targetPlatform)}</td>
                <td>{difference.sourceValue}</td><td>{difference.targetValue}</td>
                <td><span className={`sync-result is-${difference.result}`}>{resultLabels[difference.result]}</span></td>
                <td>
                  {difference.result === "conflict" ? (
                    <div className="sync-resolution-options" aria-label={`${difference.dataItem}处理方式`}>
                      <button className={resolutions[difference.id] === "overwrite" ? "is-selected" : ""} type="button" onClick={() => onResolve(difference.id, "overwrite")}>来源覆盖</button>
                      <button className={resolutions[difference.id] === "skip" ? "is-selected" : ""} type="button" onClick={() => onResolve(difference.id, "skip")}>跳过</button>
                    </div>
                  ) : <span className="sync-resolution-auto">{difference.result === "skipped" ? "自动跳过" : difference.result === "added" ? "自动新增" : "来源覆盖"}</span>}
                </td>
              </tr>
            )) : <tr><td className="sync-difference-empty" colSpan={7}>当前选择下没有可显示的差异</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
