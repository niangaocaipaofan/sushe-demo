import type { SyncContent } from "../../types/data-sync";

interface DataScopeSelectorProps { content: SyncContent; }

export function DataScopeSelector({ content }: DataScopeSelectorProps) {
  return <section className="sync-content-section" aria-label="同步内容">
    <div className="sync-section-heading"><div><strong>同步内容</strong><small>SPU 基础信息与其下所有 SKU 信息</small></div><span>{content.spu.id} · {content.skus.length} 个 SKU</span></div>
    <div className="sync-content-tables">
      <div className="sync-table-wrap sync-content-table-wrap"><table className="sync-table"><thead><tr><th colSpan={2}>SPU 信息 · {content.spu.id}</th></tr></thead><tbody>
        {content.spu.fields.map((field) => <tr key={field.id}><td>{field.label}</td><td className="sync-field-value">{field.value}</td></tr>)}
      </tbody></table></div>
      <div className="sync-table-wrap sync-content-table-wrap sync-sku-table-wrap"><table className="sync-table sync-sku-table"><thead><tr><th>SKU 信息</th><th>颜色</th><th>尺码</th><th>库存</th></tr></thead><tbody>
        {content.skus.map((sku) => { const values = Object.fromEntries(sku.fields.map((field) => [field.label, field.value])); return <tr key={sku.id}><td><code>{sku.id}</code></td><td>{values.颜色 ?? "—"}</td><td>{values.尺码 ?? "—"}</td><td>{values.库存 ?? "—"}</td></tr>; })}
      </tbody></table></div>
    </div>
  </section>;
}
