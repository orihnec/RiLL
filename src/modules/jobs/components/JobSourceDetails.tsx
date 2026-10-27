export function JobSourceDetails({ extras }: { extras: Record<string, unknown> | null }) {
  if (!extras) return null;
  return <details className="max-h-52 overflow-auto rounded-lg border p-2 text-xs">
    <summary className="cursor-pointer">飞书来源、阶段与原始字段</summary>
    <pre className="mt-2 whitespace-pre-wrap break-all font-sans text-muted-foreground">{JSON.stringify(extras, null, 2)}</pre>
  </details>;
}
