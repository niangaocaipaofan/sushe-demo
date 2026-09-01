import type { PlatformId, SchemaMappings, SyncPlatform, SyncSchemaField } from "../../types/data-sync";
import { MappingFieldPicker } from "./MappingFieldPicker";

interface SchemaMappingTableProps {
  sourceSchema: SyncSchemaField[];
  targetSchema: SyncSchemaField[];
  targetId: PlatformId | null;
  platforms: SyncPlatform[];
  mappings: SchemaMappings;
  selectedMappingIds: Set<string>;
  onChange: (mappingId: string, targetFieldKey: string, createTargetField: boolean) => void;
  onToggle: (mappingId: string) => void;
  onNext: () => void;
}

function platformLabel(platforms: SyncPlatform[], id: PlatformId | null) {
  return platforms.find((platform) => platform.id === id)?.label ?? id;
}

export function SchemaMappingTable({ sourceSchema, targetSchema, targetId, platforms, mappings, selectedMappingIds, onChange, onToggle, onNext }: SchemaMappingTableProps) {
  return (
    <section className="sync-schema-section" aria-label="字段映射选择">
      <div className="sync-table-wrap sync-schema-table-wrap">
        <table className="sync-table sync-schema-table">
          <thead><tr><th>来源字段</th><th>映射至 {platformLabel(platforms, targetId)}</th><th>同步字段</th></tr></thead>
          <tbody>
            {sourceSchema.map((field, fieldIndex) => {
              const mappingId = `${targetId}:${field.scope}:${field.key}`;
              const mapping = mappings[mappingId];
              const candidates = targetSchema.filter((candidate) => candidate.scope === field.scope);
              const selectedValue = mapping?.createTargetField ? "" : mapping?.targetFieldKey ?? "";
              const isSelected = selectedMappingIds.has(mappingId);
              const options = candidates.map((candidate) => ({ value: candidate.key, label: `${candidate.label}（${candidate.key}）` }));
              return <tr className={isSelected ? "is-mapping-selected" : ""} key={`${field.scope}:${field.key}`}>
                <td className="sync-schema-source"><strong>{field.label}</strong><small>{field.scope} · {field.key}</small></td>
                <td><MappingFieldPicker ariaLabel={`${field.label} 映射至 ${platformLabel(platforms, targetId)}`} value={selectedValue} options={options} openUpward={fieldIndex >= sourceSchema.length - 3} onSelect={(option) => onChange(mappingId, option.value, false)} /></td>
                <td><label className="sync-mapping-checkbox"><input type="checkbox" checked={isSelected} onChange={() => onToggle(mappingId)} /><span aria-hidden="true" />选择</label></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <footer className="sync-schema-actions">
        <span>已选择 {selectedMappingIds.size} / {sourceSchema.length} 个字段</span>
        <button type="button" disabled={!selectedMappingIds.size} onClick={onNext}>下一步：值映射</button>
      </footer>
    </section>
  );
}
