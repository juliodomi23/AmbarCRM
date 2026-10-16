"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Boton } from "@/components/ui";
import { cargarFacebookSdk } from "@/lib/meta/facebook-sdk";

type Pagina = { id: string; nombre: string; foto: string | null };
type Inicio = { state: string; appId: string; scope: string };
const BASE = "/api/canales/messenger/facebook";

async function solicitar(ruta: string, body: object, state?: string) {
  const res = await fetch(`${BASE}/${ruta}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(state ? { "x-messenger-state": state } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "No se pudo conectar con Facebook. Usa la conexión manual.");
  return data;
}

export function MessengerFacebook({ canalId, pageId, nombre, appPropia }: { canalId?: string; pageId?: string | null; nombre: string; appPropia: boolean }) {
  const router = useRouter();
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [paginas, setPaginas] = useState<Pagina[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function finalizar(resp: any) {
    try {
      if (!resp?.authResponse?.code) throw new Error("Conexión cancelada o sin permisos en la app de Meta. Usa la conexión manual si tu cuenta no tiene un rol en la app.");
      const lista: Pagina[] = await solicitar("paginas", { code: resp.authResponse.code }, inicio?.state);
      setPaginas(lista);
      if (!lista.length) setError("Facebook no compartió páginas. Revisa las páginas autorizadas y tu rol en la app, o usa la conexión manual.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo conectar."); }
    finally { setOcupado(false); }
  }

  function conectar() {
    if (!inicio || !window.FB) return;
    setError(""); setOk(""); setOcupado(true);
    try {
      window.FB.login((resp: any) => { void finalizar(resp); }, {
        scope: inicio.scope, state: inicio.state, response_type: "code", override_default_response_type: true,
      });
    } catch { setOcupado(false); setError("No se pudo abrir Facebook. Revisa el bloqueador de ventanas emergentes."); }
  }

  async function elegir(id: string) {
    setOcupado(true); setError("");
    try {
      await solicitar("conectar", { page_id: id, nombre: nombre.trim() || undefined }, inicio?.state);
      setPaginas(null); setInicio(null);
      setOk("Página de Messenger conectada."); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo conectar."); }
    finally { setOcupado(false); }
  }

  async function reiniciar() {
    setOcupado(true); setError(""); setPaginas(null); setInicio(null); setOk("");
    try {
      const data = await solicitar("paginas", { accion: "iniciar", canal_id: canalId });
      await cargarFacebookSdk(data.appId); setInicio(data);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo conectar."); }
    finally { setOcupado(false); }
  }

  if (appPropia) return <p className="text-sm text-warning" role="status">Este canal usa una app propia de Meta. Usa la conexión manual para conservar sus credenciales.</p>;

  return <div className="space-y-3 rounded-lg border border-border p-3">
    <Boton type="button" onClick={() => inicio ? conectar() : void reiniciar()} disabled={ocupado || paginas !== null || Boolean(ok)}>{ocupado ? "Conectando…" : inicio ? "Iniciar sesión en Facebook" : "Conectar con Facebook"}</Boton>
    {inicio && paginas === null && !error && <p className="text-xs text-muted-foreground">Conexión preparada. Pulsa «Iniciar sesión en Facebook» para abrir la ventana de Meta.</p>}
    <p className="text-xs text-muted-foreground">En modo desarrollo o sin aprobación de Meta, solo las personas con rol en la app pueden iniciar sesión. Puedes usar la conexión manual de abajo.</p>
    {paginas && paginas.length > 0 && <ul className="space-y-2" aria-label="Páginas de Facebook">
      {paginas.map((pagina) => <li key={pagina.id} className="flex items-center gap-2">
        {pagina.foto && <Image src={pagina.foto} alt="" width={32} height={32} unoptimized referrerPolicy="no-referrer" />}
        <span className="min-w-0 flex-1 break-words">{pagina.nombre}</span>
        <Boton type="button" disabled={ocupado || Boolean(pageId && pagina.id !== pageId)} onClick={() => void elegir(pagina.id)}>Elegir página</Boton>
      </li>)}
    </ul>}
    {pageId && paginas && <p className="text-xs text-muted-foreground">Para reconectar este canal, elige su misma página ({pageId}).</p>}
    <div aria-live="polite">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {ok && <p className="text-sm text-success">{ok}</p>}
    </div>
    {(error || paginas !== null || ok) && <Boton type="button" disabled={ocupado} onClick={() => void reiniciar()}>Preparar otra conexión</Boton>}
  </div>;
}
