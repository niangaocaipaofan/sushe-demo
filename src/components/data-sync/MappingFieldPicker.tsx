import { useEffect, useRef, useState } from "react";

interface MappingOption {
  value: string;
  label: string;
}

interface MappingFieldPickerProps {
  ariaLabel: string;
  value: string;
  options: MappingOption[];
  openUpward?: boolean;
  onSelect: (option: MappingOption) => void;
}

export function MappingFieldPicker({ ariaLabel, value, options, openUpward = false, onSelect }: MappingFieldPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  return <div className="sync-mapping-picker" ref={pickerRef}>
    <button className={`sync-mapping-trigger${isOpen ? " is-open" : ""}`} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
      <span>{selected?.label ?? "请选择目标字段"}</span><i aria-hidden="true" />
    </button>
    {isOpen && <div className={`sync-mapping-menu${openUpward ? " is-upward" : ""}`} role="listbox" aria-label={ariaLabel}>
      {options.map((option) => <button className={option.value === value ? "is-selected" : ""} key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onSelect(option); setIsOpen(false); }}>{option.label}</button>)}
    </div>}
  </div>;
}
