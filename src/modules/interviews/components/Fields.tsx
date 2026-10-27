import type { ComponentProps, ReactNode } from "react";
import { Input } from "../../../components/ui/input";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-ui-11 text-muted-foreground">{label}</span>{children}</label>;
}
export function TextField({ label, ...props }: ComponentProps<typeof Input> & { label: string }) {
  return <Field label={label}><Input {...props} className="h-auto min-h-9 py-2 text-ui-12 md:text-ui-12" /></Field>;
}
export function SelectControl(props: ComponentProps<"select">) {
  return <select {...props} className="min-h-9 w-full min-w-0 rounded-md border border-input bg-[var(--popover)] px-2 py-2 text-ui-12 outline-none focus:border-indigo-400/60" />;
}
