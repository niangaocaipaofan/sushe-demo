import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { PlatformId, SyncPlatform } from "../../types/data-sync";
import { WorkspaceTabIcon } from "../WorkspaceTabIcon";

interface DataSourcePickerProps {
  label: string;
  platforms: SyncPlatform[];
  selectedId: PlatformId | null;
  selectedLabel?: string;
  excludedIds?: Set<PlatformId>;
  onSelect: (id: PlatformId) => void;
}

export function DataSourcePicker({ label, platforms, selectedId, selectedLabel, excludedIds = new Set(), onSelect }: DataSourcePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);
  const selected = platforms.find((platform) => platform.id === selectedId);

  useLayoutEffect(() => {
    if (!isOpen || !pickerRef.current) return;
    const rect = pickerRef.current.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 4, left: rect.right - 126 });
  }, [isOpen]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  return <div className="sync-source-picker" ref={pickerRef}>
    <button className={`sync-source-trigger${isOpen ? " is-open" : ""}`} type="button" aria-label={`选择${label}`} aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
      <WorkspaceTabIcon kind="database" />
      <strong>{selectedLabel ?? selected?.label ?? "选择数据源"}</strong>
      <i aria-hidden="true" />
    </button>
    {isOpen && <div className="sync-source-menu" style={{ top: menuPosition.top, left: menuPosition.left }} role="listbox" aria-label={`${label}列表`}>
      {platforms.filter((platform) => !excludedIds.has(platform.id)).map((platform) => <button className={platform.id === selectedId ? "is-selected" : ""} key={platform.id} type="button" role="option" aria-selected={platform.id === selectedId} onClick={() => { onSelect(platform.id); setIsOpen(false); }}>
        <WorkspaceTabIcon kind="database" />
        {platform.label}
      </button>)}
    </div>}
  </div>;
}
