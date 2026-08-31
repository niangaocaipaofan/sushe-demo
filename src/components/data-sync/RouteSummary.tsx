import { ArrowRight } from "@phosphor-icons/react";

import type { DataScopeId, PlatformId, SyncPlatform } from "../../types/data-sync";

interface RouteSummaryProps {
  platforms: SyncPlatform[];
  sourceIds: Set<PlatformId>;
  targetIds: Set<PlatformId>;
  scopeIds: Set<DataScopeId>;
}

function getPlatformLabel(platforms: SyncPlatform[], id: PlatformId) {
  const platform = platforms.find((item) => item.id === id);
  if (!platform) return id;
  return `${platform.label}（${id === "local" ? "本机数据" : "本地模拟"}）`;
}

export function RouteSummary({ platforms, sourceIds, targetIds, scopeIds }: RouteSummaryProps) {
  return (
    <div className="sync-route-summary" aria-label="当前同步路线">
      <strong>同步路线</strong>
      <div className="sync-route-summary-group">
        {sourceIds.size ? Array.from(sourceIds).map((id) => <span key={id}>{getPlatformLabel(platforms, id)}</span>) : <em>未选择来源</em>}
      </div>
      <ArrowRight aria-hidden="true" size={17} weight="bold" />
      <span className="sync-route-payload">{scopeIds.size} 类数据</span>
      <ArrowRight aria-hidden="true" size={17} weight="bold" />
      <div className="sync-route-summary-group">
        {targetIds.size ? Array.from(targetIds).map((id) => <span key={id}>{getPlatformLabel(platforms, id)}</span>) : <em>未选择目标</em>}
      </div>
    </div>
  );
}
