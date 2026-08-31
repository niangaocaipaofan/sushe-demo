import type { DataScopeId, SyncDataScope } from "../../types/data-sync";

interface DataScopeSelectorProps {
  scopes: SyncDataScope[];
  selectedIds: Set<DataScopeId>;
  onToggle: (id: DataScopeId) => void;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");

export function DataScopeSelector({ scopes, selectedIds, onToggle }: DataScopeSelectorProps) {
  return (
    <section className="sync-route-panel sync-scope-panel" aria-label="同步内容">
      <div className="sync-route-panel-title"><strong>同步内容</strong><span>{selectedIds.size} 类数据</span></div>
      <div className="sync-scope-options">
        {scopes.map((scope) => (
          <label className={`sync-scope-option${selectedIds.has(scope.id) ? " is-selected" : ""}`} key={scope.id}>
            <input type="checkbox" checked={selectedIds.has(scope.id)} onChange={() => onToggle(scope.id)} />
            <span><strong>{scope.label}</strong><small>{scope.description}</small></span>
            <b>{numberFormatter.format(scope.count)}</b>
          </label>
        ))}
      </div>
    </section>
  );
}
