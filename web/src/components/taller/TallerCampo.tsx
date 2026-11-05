import type { InputHTMLAttributes } from "react";
import { CLASE_CAMPO } from "@/components/ui";

export function TallerCampo({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block min-w-0 space-y-1"><span className="text-xs font-semibold text-muted-foreground">{label}</span><input className={`${CLASE_CAMPO} min-h-11`} {...props} /></label>;
}
