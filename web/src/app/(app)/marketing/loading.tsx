import { CargaCampanas } from "@/components/marketing/CargaCampanas";
import { EsqueletoEncabezado } from "@/components/Esqueletos";

export default function Loading() {
  return <div className="space-y-6 p-4 md:p-6"><EsqueletoEncabezado /><CargaCampanas /></div>;
}
