import type { Metadata } from "next";
import { DemoCRM } from "@/components/demo/DemoCRM";

export const metadata: Metadata = {
  title: "Demo interactiva | AmbarCRM",
  description:
    "Recorre el chat, embudo, automatizaciones y los 22 módulos de AmbarCRM con datos ficticios.",
};

export default function DemoPage() {
  return <DemoCRM />;
}
