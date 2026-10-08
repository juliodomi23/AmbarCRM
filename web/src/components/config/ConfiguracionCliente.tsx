"use client";

import { useEffect, useState } from "react";
import { MarcaConfig } from "@/components/config/MarcaConfig";
import { MetaCanales } from "@/components/config/MetaCanales";
import { TabAutomatizaciones } from "@/components/config/tabs/TabAutomatizaciones";
import { TabBots } from "@/components/config/tabs/TabBots";
import { TabCamposPersonalizados } from "@/components/config/tabs/TabCamposPersonalizados";
import { TabClientes } from "@/components/config/tabs/TabClientes";
import { TabEmbudos } from "@/components/config/tabs/TabEmbudos";
import { TabIA } from "@/components/config/tabs/TabIA";
import { TabModulos } from "@/components/config/tabs/TabModulos";
import { TabPlantillas } from "@/components/config/tabs/TabPlantillas";
import { TabUsuarios } from "@/components/config/tabs/TabUsuarios";

const TABS = [
  "Marca", "Embudos", "Usuarios", "Canal WhatsApp", "Plantillas",
  "Plantillas de Meta", "Automatizaciones", "Bots", "IA", "Módulos",
  "Campos personalizados",
] as const;
type Tab = (typeof TABS)[number] | "Clientes Ámbar CRM";

export function ConfiguracionCliente({
  embudos, usuarios, canales, plantillas, ajustes, bots, orgs = null,
  modulosPorOrg = null, modulos = [],
}: {
  embudos: any[];
  usuarios: any[];
  canales: any[];
  plantillas: any[];
  ajustes: any;
  bots: any[];
  orgs?: any[] | null;
  modulosPorOrg?: Record<string, any[]> | null;
  modulos?: any[];
}) {
  const [tab, setTab] = useState<Tab>("Embudos");
  const tabs: Tab[] = orgs ? [...TABS, "Clientes Ámbar CRM"] : [...TABS];

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    const mapa: Record<string, Tab> = {
      embudos: "Embudos", marca: "Marca", usuarios: "Usuarios",
      canal: "Canal WhatsApp", plantillas: "Plantillas",
      meta: "Plantillas de Meta", automatizaciones: "Automatizaciones",
      bots: "Bots", ia: "IA", clientes: "Clientes Ámbar CRM",
    };
    if (t && mapa[t]) setTab(mapa[t]);
  }, []);

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-primary">Configuración</h1>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((item) => (
          <button key={item} onClick={() => setTab(item)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === item ? "border-primary text-primary" :
                "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {item}
          </button>
        ))}
      </div>

      {tab === "Marca" && <MarcaConfig ajustes={ajustes} />}
      {tab === "Embudos" && <TabEmbudos embudos={embudos} />}
      {tab === "Usuarios" && <TabUsuarios usuarios={usuarios} />}
      {tab === "Canal WhatsApp" && <MetaCanales canales={canales} />}
      {tab === "Plantillas" && <TabPlantillas plantillas={plantillas} />}
      {tab === "Plantillas de Meta" && <MetaCanales canales={canales} vista="plantillas" />}
      {tab === "Automatizaciones" && <TabAutomatizaciones ajustes={ajustes} />}
      {tab === "Bots" && <TabBots bots={bots} canales={canales} />}
      {tab === "IA" && <TabIA ajustes={ajustes} />}
      {tab === "Clientes Ámbar CRM" && orgs && (
        <TabClientes orgs={orgs} modulosPorOrg={modulosPorOrg ?? {}} modulos={modulos} />
      )}
      {tab === "Módulos" && <TabModulos modulos={modulos} canales={canales} />}
      {tab === "Campos personalizados" && <TabCamposPersonalizados />}
    </div>
  );
}
