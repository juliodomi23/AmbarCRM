"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { cargarFacebookSdk } from "@/lib/meta/facebook-sdk";
import { mensajeConexionMeta } from "@/lib/meta/mensaje-conexion";

type Pagina = { id: string; nombre: string; foto: string | null };
type Inicio = { state: string; appId: string; scope: string; configId?: string };

async function solicitar(base: string, ruta: string, body: object, state?: string) {
  const res = await fetch(`${base}/${ruta}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(state ? { "x-messenger-state": state } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo conectar con Facebook. Usa la conexión manual.");
  return data;
}

export function MessengerFacebook({ canalId, pageId, nombre, appPropia, proveedor = "messenger", login }: { canalId?: string; pageId?: string | null; nombre: string; appPropia: boolean; proveedor?: "messenger" | "instagram"; login?: string | null }) {
  const router = useRouter();
  const base = `/api/canales/${proveedor}/facebook`;
  const canalNombre = proveedor === "instagram" ? "Instagram" : "Messenger";
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [paginas, setPaginas] = useState<Pagina[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [conexionCompleta, setConexionCompleta] = useState(false);

  function mostrarError(error: unknown) {
    setError(mensajeConexionMeta(error instanceof Error ? error.message : "", canalNombre));
  }

  async function conectarInstagram() {
    setOcupado(true); setError("");
    try {
      const data = await solicitar("/api/canales/instagram/oauth", "iniciar", { canal_id: canalId, nombre: nombre.trim() || undefined });
      window.location.assign(data.url);
    } catch (e) { mostrarError(e); setOcupado(false); }
  }

  async function finalizar(resp: any) {
    try {
      const { code, accessToken } = resp?.authResponse ?? {};
      if (!code && !accessToken) throw new Error("Conexión cancelada o sin permisos en la app de Meta. Usa la conexión manual si tu cuenta no tiene un rol en la app.");
      const lista: Pagina[] = await solicitar(base, "paginas", { code, token: accessToken }, inicio?.state);
      setPaginas(lista);
      if (!lista.length) setError("Facebook no compartió páginas. Si tu página está en un portafolio empresarial, pide al administrador que comparta contigo el acceso a esa página y vuelve a iniciar sesión. También puedes usar la conexión manual.");
    } catch (e) { mostrarError(e); }
    finally { setOcupado(false); }
  }

  function conectar() {
    if (!inicio || !window.FB) return;
    setError(""); setConexionCompleta(false); setOcupado(true);
    try {
      window.FB.login((resp: any) => { void finalizar(resp); }, {
        ...(inicio.configId ? { config_id: inicio.configId, response_type: "code", override_default_response_type: true } : { scope: inicio.scope }),
        state: inicio.state,
      });
    } catch { setOcupado(false); setError("No se pudo abrir Facebook. Permite las ventanas emergentes e inténtalo de nuevo."); }
  }

  async function elegir(id: string) {
    setOcupado(true); setError("");
    try {
      await solicitar(base, "conectar", { page_id: id, nombre: nombre.trim() || undefined }, inicio?.state);
      setPaginas(null); setInicio(null);
      setConexionCompleta(true);
      const pagina = paginas?.find((item) => item.id === id);
      toast("¡Conectado con éxito!", "ok", pagina?.nombre || nombre.trim() || canalNombre);
      router.refresh();
    } catch (e) { mostrarError(e); }
    finally { setOcupado(false); }
  }

  async function reiniciar() {
    setOcupado(true); setError(""); setPaginas(null); setInicio(null); setConexionCompleta(false);
    try {
      const data = await solicitar(base, "paginas", { accion: "iniciar", canal_id: canalId });
      await cargarFacebookSdk(data.appId); setInicio(data);
    } catch (e) { mostrarError(e); }
    finally { setOcupado(false); }
  }

  if (appPropia) return <p className="text-sm text-warning" role="status">Este canal usa una app propia de Meta. Usa la conexión manual para conservar sus credenciales.</p>;

  if (proveedor === "instagram" && (!canalId || login === "instagram")) return <div className="space-y-2 rounded-lg border border-border p-3">
    <Boton type="button" onClick={() => void conectarInstagram()} disabled={ocupado} aria-busy={ocupado}>{ocupado ? "Redirigiendo a Instagram…" : "Conectar con Instagram"}</Boton>
    <p className="text-xs text-muted-foreground">Inicia sesión con tu cuenta profesional de Instagram (Empresa o Creador). También puedes usar la conexión manual de abajo.</p>
    {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
  </div>;

  return <div className="space-y-3 rounded-lg border border-border p-3">
    <Boton type="button" onClick={() => inicio ? conectar() : void reiniciar()} disabled={ocupado || paginas !== null || conexionCompleta} aria-busy={ocupado}>{ocupado ? inicio ? "Abriendo Facebook…" : "Preparando conexión…" : inicio ? "Iniciar sesión en Facebook" : "Conectar con Facebook"}</Boton>
    {inicio && paginas === null && !error && <p className="text-xs text-muted-foreground">Conexión preparada. Pulsa «Iniciar sesión en Facebook» para abrir la ventana de Meta.</p>}
    <p className="text-xs text-muted-foreground">{proveedor === "instagram" ? "La página debe tener una cuenta profesional de Instagram vinculada. " : ""}En modo desarrollo o sin aprobación de Meta, solo las personas con rol en la app pueden iniciar sesión. Puedes usar la conexión manual de abajo.</p>
    {paginas && paginas.length > 0 && <ul className="space-y-2" aria-label="Páginas de Facebook">
      {paginas.map((pagina) => <li key={pagina.id} className="flex items-center gap-2">
        {pagina.foto && <Image src={pagina.foto} alt="" width={32} height={32} unoptimized referrerPolicy="no-referrer" />}
        <span className="min-w-0 flex-1 break-words">{pagina.nombre}</span>
        <Boton type="button" disabled={ocupado || Boolean(pageId && pagina.id !== pageId)} onClick={() => void elegir(pagina.id)}>Elegir página</Boton>
      </li>)}
    </ul>}
    {pageId && paginas && <p className="text-xs text-muted-foreground">Para reconectar este canal, elige su misma página ({pageId}).</p>}
    <div aria-live="polite">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
    </div>
    {(error || paginas !== null || conexionCompleta) && <Boton type="button" disabled={ocupado} onClick={() => void reiniciar()}>Preparar otra conexión</Boton>}
  </div>;
}
