import type { PlatformId, SyncPlatform } from "../../types/data-sync";
import { WorkspaceTabIcon } from "../WorkspaceTabIcon";

interface PlatformSelectorProps {
  label: string;
  platforms: SyncPlatform[];
  selectedIds: Set<PlatformId>;
  selectionMode: "single" | "multiple";
  layout?: "stacked" | "inline";
  excludedIds?: Set<PlatformId>;
  inputName?: string;
  onToggle: (id: PlatformId) => void;
}

export function PlatformSelector({ label, platforms, selectedIds, selectionMode, layout = "stacked", excludedIds = new Set(), inputName, onToggle }: PlatformSelectorProps) {
  return (
    <section className={`sync-route-panel is-${layout}`} aria-label={label}>
      <div className="sync-route-panel-title"><strong>{label}</strong><span>{selectionMode === "single" ? "单选" : "多选"}</span></div>
      <div className="sync-platform-options">
        {platforms.filter((platform) => !excludedIds.has(platform.id)).map((platform) => (
            <label className={`sync-platform-option${selectedIds.has(platform.id) ? " is-selected" : ""}`} key={platform.id}>
              <input type={selectionMode === "single" ? "radio" : "checkbox"} name={selectionMode === "single" ? inputName ?? label : undefined} checked={selectedIds.has(platform.id)} onChange={() => onToggle(platform.id)} />
              <WorkspaceTabIcon kind="database" />
              <span className="sync-platform-copy"><strong>{platform.label}</strong></span>
              {selectedIds.has(platform.id) ? (
                <span className="sync-platform-check" aria-hidden="true">
                  <svg viewBox="0 -960 960 960" fill="currentColor"><path d="m382-354 339-339q12-12 28-12t28 12q12 12 12 28.5T777-636L410-268q-12 12-28 12t-28-12L182-440q-12-12-11.5-28.5T183-497q12-12 28.5-12t28.5 12l142 143Z" /></svg>
                </span>
              ) : null}
            </label>
        ))}
      </div>
    </section>
  );
}
