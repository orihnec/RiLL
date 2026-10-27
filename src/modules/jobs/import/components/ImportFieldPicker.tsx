import type { ImportField } from "../types";

export function ImportFieldPicker({ label, fields, value, disabled, onChange }: {
  label: string; fields: ImportField[]; value: string[]; disabled: boolean; onChange: (keys: string[]) => void;
}) {
  return <div className="space-y-1 text-xs">
    <label className="flex items-center gap-2"><span className="w-20 shrink-0">{label}</span>
      <select aria-label={`${label}映射`} className="min-w-0 flex-1 rounded-md border bg-background p-1.5" disabled={disabled}
        value={value[0] || ""} onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}>
        <option value="">未映射</option>
        {fields.map((field) => <option key={field.key} value={field.key}>{field.name}</option>)}
      </select>
    </label>
    <details className="ml-22 text-muted-foreground">
      <summary className="cursor-pointer">合并多列{value.length > 1 ? `（已选 ${value.length} 列）` : ""}</summary>
      <div className="mt-1 max-h-28 space-y-1 overflow-auto rounded-md border p-2">
        {fields.map((field) => <label key={field.key} className="flex items-center gap-2">
          <input type="checkbox" disabled={disabled} checked={value.includes(field.key)} onChange={(event) => onChange(event.target.checked ? [...value, field.key] : value.filter((key) => key !== field.key))} />{field.name}
        </label>)}
      </div>
    </details>
  </div>;
}
