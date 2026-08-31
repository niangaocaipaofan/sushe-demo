import { Database, FolderOpen } from "@phosphor-icons/react";

import type { PlatformId, SyncPlatform } from "../../types/data-sync";

interface PlatformSelectorProps {
  label: string;
  platforms: SyncPlatform[];
  selectedIds: Set<PlatformId>;
  onToggle: (id: PlatformId) => void;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");

export function PlatformSelector({ label, platforms, selectedIds, onToggle }: PlatformSelectorProps) {
  return (
    <section className="sync-route-panel" aria-label={label}>
      <div className="sync-route-panel-title"><strong>{label}</strong><span>支持多选</span></div>
      <div className="sync-platform-options">
        {platforms.map((platform) => (
            <label className={`sync-platform-option${selectedIds.has(platform.id) ? " is-selected" : ""}`} key={platform.id}>
              <input type="checkbox" checked={selectedIds.has(platform.id)} onChange={() => onToggle(platform.id)} />
              {platform.id === "local" ? <FolderOpen aria-hidden="true" size={17} /> : <Database aria-hidden="true" size={17} weight="fill" />}
              <span className="sync-platform-copy"><strong>{platform.label}</strong><small>{platform.id === "local" ? "本机数据" : "本地模拟"}</small></span>
              <span className="sync-platform-meta"><b>{numberFormatter.format(platform.recordCount)}</b><small>条数据</small></span>
            </label>
        ))}
      </div>
    </section>
  );
}
