import type { Metadata } from "next";
import { DemoApp } from "@/components/demo/DemoApp";

export const metadata: Metadata = {
  title: "Demo interactiva | AmbarCRM",
  description: "Recorre el CRM real de AmbarCRM —chat, embudos, contactos, tareas y módulos por giro— con datos ficticios.",
};

export default function DemoPage() {
  return <DemoApp />;
}
