import type { DifferenceResult, PlatformId, SyncDifference, SyncPlatform } from "../../types/data-sync";

interface DifferenceTableProps { differences: SyncDifference[]; platforms: SyncPlatform[]; }

const resultLabels: Record<DifferenceResult, string> = { added: "新增", updated: "更新", conflict: "冲突", skipped: "跳过" };

function platformLabel(platforms: SyncPlatform[], id: PlatformId) {
  return platforms.find((platform) => platform.id === id)?.label ?? id;
}

export function DifferenceTable({ differences, platforms }: DifferenceTableProps) {
  return (
    <section className="sync-difference-section" aria-label="差异明细">
      <div className="sync-difference-heading"><strong>差异明细</strong><span>当前显示 {differences.length} 条本地 Mock 对比结果</span></div>
      <div className="sync-difference-table-wrap">
        <table className="sync-difference-table">
          <thead><tr><th>数据项</th><th>来源</th><th>目标</th><th>来源值</th><th>目标值</th><th>结果</th></tr></thead>
          <tbody>
            {differences.length ? differences.map((difference) => (
              <tr key={difference.id}>
                <td>{difference.dataItem}</td><td>{platformLabel(platforms, difference.sourcePlatform)}</td><td>{platformLabel(platforms, difference.targetPlatform)}</td>
                <td>{difference.sourceValue}</td><td>{difference.targetValue}</td>
                <td><span className={`sync-result is-${difference.result}`}>{resultLabels[difference.result]}</span></td>
              </tr>
            )) : <tr><td className="sync-difference-empty" colSpan={6}>当前选择下没有可显示的差异</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
