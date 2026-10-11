"use client";

// Configuración: ConfiguracionCliente real con las props de app/(app)/configuracion/page.tsx, desde el almacén.
import { ConfiguracionCliente } from "@/components/config/ConfiguracionCliente";
import { MODULOS, puestoPuedeAcceder } from "@/lib/modulos-catalogo";
import { puestosParaModulos } from "@/lib/puestos";
import { useDatos } from "@/lib/demo/usar-almacen";
import { embudosConEtapas } from "@/lib/demo/vistas";

export function PantallaConfiguracion() {
  const d = useDatos();
  const activos = Object.entries(d.modulos).filter(([, m]) => m.activo);
  const ajustes = {
    ...d.ajustes,
    marcaNombre: d.marca.nombre, marcaLogo: d.marca.logo, marcaColorPrimario: d.marca.colorPrimario, marcaColorAcento: d.marca.colorAcento, marcaPreset: d.marca.preset,
  };
  return (
    <ConfiguracionCliente
      embudos={embudosConEtapas(d).map((e) => ({ ...e, activo: true }))}
      usuarios={d.usuarios.map((u) => ({
        ...u,
        modulosAccesibles: activos
          .filter(([clave, m]) => puestoPuedeAcceder(clave as any, m.config, u.puesto, u.rol))
          .map(([clave]) => MODULOS.find((x) => x.clave === clave)?.nombre)
          .filter(Boolean),
      }))}
      puestosSugeridos={puestosParaModulos(activos.map(([clave]) => clave))}
      canales={[]}
      plantillas={d.plantillas}
      ajustes={ajustes}
      bots={[]}
      orgs={null}
      modulosPorOrg={null}
      modulos={[...MODULOS]}
    />
  );
}
