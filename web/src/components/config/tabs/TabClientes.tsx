"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { Boton, Campo } from "@/components/ui";
import { api, slugificar } from "@/components/config/tabs/shared";

export function TabClientes({
  orgs,
  modulosPorOrg,
  modulos,
}: {
  orgs: any[];
  modulosPorOrg: Record<string, any[]>;
  modulos: any[];
}) {
  const router = useRouter();
  const vacio = {
    nombre: "",
    slug: "",
    adminNombre: "",
    adminEmail: "",
    adminPassword: "",
  };
  const [f, setF] = useState(vacio);
  const [slugTocado, setSlugTocado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [creado, setCreado] = useState<{ slug: string; email: string } | null>(
    null,
  );
  const [modulosActivos, setModulosActivos] = useState(modulosPorOrg);

  function setNombre(nombre: string) {
    setF((prev) => ({
      ...prev,
      nombre,
      slug: slugTocado ? prev.slug : slugificar(nombre),
    }));
  }
  async function toggleModulo(orgId: string, clave: string, activo: boolean) {
    const ok = await api("/api/modulos", "POST", { orgId, clave, activo });
    if (ok)
      setModulosActivos((prev) => ({
        ...prev,
        [orgId]: [
          ...(prev[orgId] ?? []).filter((m) => m.clave !== clave),
          { clave, activo },
        ],
      }));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    const ok = await api("/api/orgs", "POST", f);
    setCreando(false);
    if (ok) {
      setCreado({ slug: f.slug, email: f.adminEmail });
      toast(`Cliente "${f.nombre}" creado`);
      setF(vacio);
      setSlugTocado(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-amber-50/60 p-3 text-xs text-muted-foreground">
        Cada cliente es una <b>organización aislada</b>: sus chats, contactos y
        usuarios no se mezclan con los de nadie más. Al crearla se genera su
        admin, su embudo de ventas y su canal oficial de WhatsApp mediante Meta
        Embedded Signup.
      </div>

      <form
        onSubmit={crear}
        className="space-y-4 rounded-xl border border-border bg-card p-4"
      >
        <p className="font-medium text-foreground">Nuevo cliente de Ámbar CRM</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            label="Nombre del negocio"
            value={f.nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Clínica X"
            required
          />
          <Campo
            label="Slug (identificador para entrar)"
            value={f.slug}
            onChange={(e) => {
              setSlugTocado(true);
              setF({ ...f, slug: slugificar(e.target.value) });
            }}
            placeholder="clinica-x"
            required
          />
          <Campo
            label="Nombre del admin"
            value={f.adminNombre}
            onChange={(e) => setF({ ...f, adminNombre: e.target.value })}
            placeholder="Dueño"
          />
          <Campo
            label="Email del admin"
            type="email"
            value={f.adminEmail}
            onChange={(e) => setF({ ...f, adminEmail: e.target.value })}
            required
          />
          <Campo
            label="Contraseña del admin (mín. 8)"
            type="text"
            value={f.adminPassword}
            onChange={(e) => setF({ ...f, adminPassword: e.target.value })}
            minLength={8}
            required
          />
        </div>
        <Boton type="submit" disabled={creando}>
          {creando ? "Creando…" : "Crear cliente"}
        </Boton>
      </form>

      {creado && (
        <div className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="flex items-center gap-2 font-medium text-green-800">
            ✓ Cliente creado
          </p>
          <p className="text-sm text-green-900">
            Comparte esta liga de acceso junto con el usuario{" "}
            <b>{creado.email}</b> y su contraseña:
          </p>
          <div className="flex items-center gap-2">
            <code
              className={[
                "min-w-0 flex-1 truncate rounded-lg border border-green-200",
                "bg-card px-3 py-2 text-xs text-foreground",
              ].join(" ")}
            >
              {typeof window !== "undefined" ? location.origin : ""}/login?org=
              {creado.slug}
            </code>
            <Boton
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${location.origin}/login?org=${creado.slug}`,
                );
                toast("Liga copiada");
              }}
            >
              Copiar
            </Boton>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Módulos</th>
              <th className="px-4 py-2">Soporte</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr
                key={o.id}
                className="border-b border-border/60 last:border-0"
              >
                <td className="px-4 py-2 font-medium text-foreground">
                  {o.nombre}
                  {String(o.id) === "1" && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      (plataforma)
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{o.slug}</td>
                <td className="px-4 py-2">
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-xs",
                      o.activo
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {o.activo ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    {modulos.map((m) => {
                      const activo = (modulosActivos[String(o.id)] ?? []).some(
                        (x) => x.clave === m.clave && x.activo,
                      );
                      return (
                        <label
                          key={m.clave}
                          className="flex items-center gap-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={activo}
                            onChange={(e) =>
                              toggleModulo(
                                String(o.id),
                                m.clave,
                                e.target.checked,
                              )
                            }
                          />{" "}
                          {m.nombre}
                        </label>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <Link
                      href={`/configuracion/clientes/${o.id}`}
                      className="text-xs font-medium text-primary underline"
                    >
                      Ver detalles
                    </Link>
                    <a
                      href={`/login?org=${o.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      Abrir acceso
                    </a>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${location.origin}/login?org=${o.slug}`,
                        );
                        toast("Liga copiada");
                      }}
                    >
                      Copiar liga
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
