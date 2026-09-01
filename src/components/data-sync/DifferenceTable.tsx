import type { DifferenceResolution, SyncDifference } from "../../types/data-sync";

interface DifferenceTableProps {
  differences: SyncDifference[];
  resolutions: Record<string, DifferenceResolution>;
  onResolve: (id: string, resolution: DifferenceResolution) => void;
}

export function DifferenceTable({ differences, resolutions, onResolve }: DifferenceTableProps) {
  return (
    <section className="sync-difference-section" aria-label="差异明细">
      <div className="sync-table-wrap sync-difference-table-wrap">
        {differences.length ? (
          <table className="sync-table sync-difference-table">
            <thead><tr><th>字段</th><th>已确认映射</th><th>来源拟写入值</th><th>目标当前值</th><th>处理方式</th></tr></thead>
            <tbody>
              {differences.map((difference) => (
                <tr className={`is-${difference.result}`} key={difference.id}>
                  <td className="sync-diff-identity"><strong>{difference.sourceFieldLabel}</strong><small>{difference.scope} · {difference.entityId}</small></td>
                  <td className="sync-field-mapping"><strong>{difference.sourceFieldLabel}</strong><span>→</span><strong>{difference.targetFieldLabel}</strong></td>
                  <td className="sync-source-value">{difference.sourceValue}</td>
                  <td className="sync-target-value">{difference.targetValue}</td>
                  <td>
                    {difference.result !== "skipped" ? (
                      <div className="sync-resolution-options" aria-label={`${difference.dataItem}处理方式`}>
                        <button className={resolutions[difference.id] === "overwrite" ? "is-selected" : ""} type="button" onClick={() => onResolve(difference.id, "overwrite")}>{difference.result === "added" ? "新增" : "覆盖"}</button>
                        <button className={resolutions[difference.id] === "skip" ? "is-selected" : ""} type="button" onClick={() => onResolve(difference.id, "skip")}>{difference.result === "added" ? "跳过" : "保留"}</button>
                      </div>
                    ) : <span className="sync-resolution-auto">无需处理</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="sync-difference-empty">当前选择下没有可显示的差异</div>}
      </div>
    </section>
  );
}
