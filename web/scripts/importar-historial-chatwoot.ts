import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";

createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());

const { dbRaw } = await import("../src/lib/db");
const { transaccionTenant } = await import("../src/lib/retail-db");
const { telefonoContacto } = await import("../src/lib/reservas/telefono");

const PREFIJO_IMPORTADO = "chatwoot-import-";
const TAMANO_LOTE_SQL = 1000;
const TAMANO_LOTE_INSERCION = 1000;
const MAX_PAGINAS_MENSAJES = 5000;

type Direccion = "entrante" | "saliente";
type TipoImportado = "texto" | "imagen" | "audio" | "video" | "documento" | "plantilla";

type CwInbox = {
  id: number | string;
  name?: string;
  channel_type?: string;
};

type CwSender = {
  id?: number | string;
  name?: string | null;
  phone_number?: string | null;
  identifier?: string | null;
  type?: string;
};

type CwAttachment = {
  file_type?: string;
  data_url?: string;
};

type CwMessage = {
  id: number | string;
  content?: string | null;
  message_type?: number | string;
  content_type?: string;
  created_at?: number | string;
  private?: boolean;
  source_id?: string | null;
  sender?: CwSender;
  attachments?: CwAttachment[];
};

type CwConversation = {
  id: number | string;
  inbox_id?: number | string;
  status?: string;
  created_at?: number | string;
  updated_at?: number | string;
  last_activity_at?: number | string;
  contact_id?: number | string;
  meta?: { sender?: CwSender };
  sender?: CwSender;
};

type MensajeImportable = {
  chatwootId: number;
  syntheticId: string;
  sourceId: string | null;
  fecha: Date;
  direccion: Direccion;
  tipo: TipoImportado;
  contenido: string;
  interna: boolean;
};

type MotivosSaltado = {
  duplicados: number;
  ya_en_canal: number;
  actividad: number;
  nota_privada: number;
  sin_fecha: number;
  sin_id: number;
  sin_telefono: number;
};

type Opciones = {
  dryRun: boolean;
  verificar: boolean;
  incluirPrivadas: boolean;
  confirmoProduccion: boolean;
  forzarInbox: boolean;
  permitirHttp: boolean;
  orgSlug: string;
  canalId: bigint | null;
  inboxId: number | null;
  limiteConversaciones: number | null;
};

type GrupoContacto = {
  ultimos10: string;
  telefono: { completo: string; ultimos10: string };
  nombre: string;
  conversaciones: CwConversation[];
};

type ResultadoGrupo = {
  contacto: string;
  telefono: string;
  conversacionesChatwoot: number;
  mensajesChatwoot: number;
  insertados: number;
  saltados: number;
  motivos: MotivosSaltado;
  contactoEstado: "creado" | "encontrado";
  conversacionCrm: bigint | null;
  error?: string;
};

const motivosVacios = (): MotivosSaltado => ({
  duplicados: 0,
  ya_en_canal: 0,
  actividad: 0,
  nota_privada: 0,
  sin_fecha: 0,
  sin_id: 0,
  sin_telefono: 0,
});

function sumarMotivos(destino: MotivosSaltado, origen: MotivosSaltado) {
  for (const clave of Object.keys(destino) as Array<keyof MotivosSaltado>) {
    destino[clave] += origen[clave];
  }
}

function enteroDeEnv(nombre: string): number | null {
  const valor = process.env[nombre]?.trim();
  if (!valor) return null;
  if (!/^\d+$/.test(valor)) throw new Error(`${nombre} debe ser un entero positivo`);
  return Number(valor);
}

function bigintDeEnv(nombre: string): bigint | null {
  const valor = process.env[nombre]?.trim();
  if (!valor) return null;
  if (!/^\d+$/.test(valor)) throw new Error(`${nombre} debe ser un entero positivo`);
  return BigInt(valor);
}

function parsearOpciones(argv: string[]): Opciones {
  const opciones: Opciones = {
    dryRun: false,
    verificar: false,
    incluirPrivadas: false,
    confirmoProduccion: false,
    forzarInbox: false,
    permitirHttp: false,
    orgSlug: process.env.CHATWOOT_ORG_SLUG?.trim() || "serenica-health-center",
    canalId: bigintDeEnv("CHATWOOT_CANAL_ID"),
    inboxId: enteroDeEnv("CHATWOOT_INBOX_ID"),
    limiteConversaciones: null,
  };

  for (const argumento of argv) {
    if (argumento === "--dry-run") opciones.dryRun = true;
    else if (argumento === "--verificar") opciones.verificar = true;
    else if (argumento === "--incluir-privadas") opciones.incluirPrivadas = true;
    else if (argumento === "--confirmo-produccion") opciones.confirmoProduccion = true;
    else if (argumento === "--forzar-inbox") opciones.forzarInbox = true;
    else if (argumento === "--permitir-http") opciones.permitirHttp = true;
    else if (argumento.startsWith("--org-slug=")) opciones.orgSlug = argumento.slice("--org-slug=".length).trim();
    else if (argumento.startsWith("--canal-id=")) {
      const valor = argumento.slice("--canal-id=".length);
      if (!/^\d+$/.test(valor)) throw new Error("--canal-id debe ser un entero positivo");
      opciones.canalId = BigInt(valor);
    } else if (argumento.startsWith("--inbox-id=")) {
      const valor = argumento.slice("--inbox-id=".length);
      if (!/^\d+$/.test(valor)) throw new Error("--inbox-id debe ser un entero positivo");
      opciones.inboxId = Number(valor);
    } else if (argumento.startsWith("--limite-conversaciones=")) {
      const valor = argumento.slice("--limite-conversaciones=".length);
      if (!/^\d+$/.test(valor) || Number(valor) <= 0) throw new Error("--limite-conversaciones debe ser un entero positivo");
      opciones.limiteConversaciones = Number(valor);
    } else {
      throw new Error(`Argumento no reconocido: ${argumento}`);
    }
  }

  if (opciones.dryRun && opciones.verificar) throw new Error("--dry-run y --verificar son excluyentes");
  if (!opciones.orgSlug) throw new Error("--org-slug no puede estar vacío");
  return opciones;
}

function validarBaseDeDatos(opciones: Opciones) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (rol de aplicación crm_app)");
  let nombre: string;
  try {
    nombre = decodeURIComponent(new URL(url).pathname.slice(1)).split("/")[0] ?? "";
  } catch {
    throw new Error("DATABASE_URL no es una URL válida");
  }
  if (/prod/i.test(nombre) && !opciones.confirmoProduccion) {
    throw new Error("La base parece producción; agrega --confirmo-produccion solo cuando Julio autorice la importación");
  }
}

async function verificarRolAplicacion() {
  const filas = await dbRaw.$queryRaw<Array<{ usuario: string; superusuario: boolean; bypass: boolean }>>`
    SELECT current_user AS usuario, rolsuper AS superusuario, rolbypassrls AS bypass
    FROM pg_roles
    WHERE rolname = current_user
  `;
  const rol = filas[0];
  if (!rol) throw new Error("No se pudo leer el rol actual de PostgreSQL");
  if (rol.superusuario || rol.bypass) {
    throw new Error("DATABASE_URL debe usar el rol de aplicación crm_app (sin SUPERUSER ni BYPASSRLS); no uses el dueño de la base");
  }
  return rol.usuario;
}

function validarChatwoot(opciones: Opciones) {
  const raw = process.env.CHATWOOT_URL?.trim();
  if (!raw) throw new Error("Falta CHATWOOT_URL (por ejemplo https://chatwoot.serenica.mx)");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("CHATWOOT_URL no es una URL válida");
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(opciones.permitirHttp || local)) {
    throw new Error("CHATWOOT_URL debe ser https:// (usa --permitir-http solo en una red de confianza)");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("CHATWOOT_URL debe ser http(s)");
  const token = process.env.CHATWOOT_API_TOKEN?.trim();
  if (!token) throw new Error("Falta CHATWOOT_API_TOKEN (token de acceso de Chatwoot)");
  const accountId = process.env.CHATWOOT_ACCOUNT_ID?.trim() || "5";
  if (!/^\d+$/.test(accountId)) throw new Error("CHATWOOT_ACCOUNT_ID debe ser un entero positivo");
  return {
    baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, "")}`,
    token,
    accountId,
    local,
  };
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function esperar(ms: number) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function listaDe<T>(respuesta: unknown): T[] {
  if (Array.isArray(respuesta)) return respuesta as T[];
  if (!respuesta || typeof respuesta !== "object") return [];
  const obj = respuesta as Record<string, unknown>;
  const data = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : undefined;
  const fuentes = [obj.payload, data?.payload, obj.data, obj.conversations, obj.messages];
  for (const fuente of fuentes) {
    if (Array.isArray(fuente)) return fuente as T[];
  }
  return [];
}

function metaDe(respuesta: unknown): Record<string, unknown> {
  if (!respuesta || typeof respuesta !== "object") return {};
  const obj = respuesta as Record<string, unknown>;
  const data = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : undefined;
  const meta = data?.meta ?? obj.meta;
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

function fechaDe(valor: unknown): Date | null {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  const ms = numero > 1_000_000_000_000 ? numero : numero * 1000;
  const fecha = new Date(ms);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function esP2002(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function enLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let indice = 0; indice < items.length; indice += tamano) {
    lotes.push(items.slice(indice, indice + tamano));
  }
  return lotes;
}

function crearClienteChatwoot(baseUrl: string, token: string, accountId: string) {
  async function pedir<T>(ruta: string): Promise<T> {
    const url = `${baseUrl}/api/v1/accounts/${accountId}${ruta}`;
    for (let intento = 1; intento <= 5; intento++) {
      let respuesta: Response;
      try {
        respuesta = await fetch(url, {
          headers: { api_access_token: token, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        if (intento === 5) throw new Error(`No se pudo conectar a Chatwoot (${ruta}): ${mensajeDeError(error)}`);
        await esperar(1000 * intento);
        continue;
      }

      if (respuesta.status === 429) {
        const segundos = Number(respuesta.headers.get("retry-after") ?? "2");
        await esperar(Math.max(1, Number.isFinite(segundos) ? segundos : 2) * 1000);
        continue;
      }

      if (respuesta.status >= 500) {
        if (intento === 5) throw new Error(`Chatwoot ${respuesta.status} en ${ruta}: ${(await respuesta.text()).slice(0, 300)}`);
        await esperar(1000 * intento);
        continue;
      }

      if (!respuesta.ok) {
        throw new Error(`Chatwoot ${respuesta.status} en ${ruta}: ${(await respuesta.text()).slice(0, 300)}`);
      }

      return (await respuesta.json()) as T;
    }
    throw new Error(`Chatwoot no respondió después de varios intentos (${ruta})`);
  }

  async function listarInboxes(): Promise<CwInbox[]> {
    return listaDe<CwInbox>(await pedir<unknown>("/inboxes"));
  }

  async function listarConversacionesDeInbox(inboxId: number, limite: number | null): Promise<CwConversation[]> {
    const conversaciones: CwConversation[] = [];
    const vistos = new Set<number>();

    for (let pagina = 1; pagina <= 500; pagina++) {
      const params = new URLSearchParams({ status: "all", page: String(pagina), inbox_id: String(inboxId) });
      const respuesta = await pedir<unknown>(`/conversations?${params.toString()}`);
      const crudo = listaDe<CwConversation>(respuesta);
      if (!crudo.length) break;

      let nuevos = 0;
      for (const conversacion of crudo) {
        if (Number(conversacion.inbox_id) !== inboxId) continue;
        const id = Number(conversacion.id);
        if (!vistos.has(id)) {
          vistos.add(id);
          conversaciones.push(conversacion);
          nuevos++;
        }
      }

      if (limite !== null && conversaciones.length >= limite) return conversaciones.slice(0, limite);
      const meta = metaDe(respuesta);
      const total = Number(meta.all_count ?? meta.count ?? NaN);
      if (Number.isFinite(total) && conversaciones.length >= total) break;
      if (nuevos === 0) break;
    }

    return limite === null ? conversaciones : conversaciones.slice(0, limite);
  }

  async function listarMensajes(conversacionId: number): Promise<CwMessage[]> {
    const porId = new Map<number, CwMessage>();
    let antes: number | null = null;

    for (let pagina = 0; pagina < MAX_PAGINAS_MENSAJES; pagina++) {
      const query = antes === null ? "" : `?before=${antes}`;
      const respuesta = await pedir<unknown>(`/conversations/${conversacionId}/messages${query}`);
      const lote = listaDe<CwMessage>(respuesta);
      if (!lote.length) break;

      let nuevos = 0;
      for (const mensaje of lote) {
        const id = Number(mensaje.id);
        if (!porId.has(id)) {
          porId.set(id, mensaje);
          nuevos++;
        }
      }
      if (nuevos === 0) break;

      const minimo = Math.min(...lote.map((mensaje) => Number(mensaje.id)).filter((id) => Number.isFinite(id)));
      if (!Number.isFinite(minimo)) break;
      if (antes !== null && minimo >= antes) break;
      antes = minimo;
    }

    return [...porId.values()].sort((a, b) => {
      const fechaA = fechaDe(a.created_at)?.getTime() ?? 0;
      const fechaB = fechaDe(b.created_at)?.getTime() ?? 0;
      return fechaA - fechaB || Number(a.id) - Number(b.id);
    });
  }

  async function resolverSender(conversacion: CwConversation): Promise<CwSender | null> {
    let sender = conversacion.meta?.sender ?? conversacion.sender ?? null;
    if (sender && (sender.phone_number || sender.identifier)) return sender;

    try {
      const detalle = await pedir<unknown>(`/conversations/${conversacion.id}`);
      const obj = detalle as Record<string, unknown>;
      const data = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : undefined;
      const meta = (data?.meta ?? obj.meta) as Record<string, unknown> | undefined;
      sender = (meta?.sender as CwSender | undefined) ?? sender;
      if (sender && (sender.phone_number || sender.identifier)) return sender;
    } catch {
      // Si el detalle falla, se intenta con el contacto.
    }

    const contactId = sender?.id ?? conversacion.contact_id;
    if (contactId !== undefined && contactId !== null) {
      try {
        const respuesta = await pedir<unknown>(`/contacts/${contactId}`);
        const obj = respuesta as Record<string, unknown>;
        const payload = obj.payload && typeof obj.payload === "object" ? (obj.payload as Record<string, unknown>) : obj;
        if (payload && typeof payload === "object") {
          return {
            id: contactId,
            name: (payload.name as string | null | undefined) ?? sender?.name ?? null,
            phone_number: (payload.phone_number as string | null | undefined) ?? null,
            identifier: (payload.identifier as string | null | undefined) ?? null,
          };
        }
      } catch {
        // Sin teléfono en el contacto: la conversación se reporta como omitida.
      }
    }

    return sender;
  }

  function urlAdjunto(valor: string): string {
    if (/^https?:\/\//i.test(valor)) return valor;
    return `${baseUrl}${valor.startsWith("/") ? "" : "/"}${valor}`;
  }

  return { listarInboxes, listarConversacionesDeInbox, listarMensajes, resolverSender, urlAdjunto };
}

type ClienteChatwoot = ReturnType<typeof crearClienteChatwoot>;

function estadoDeChatwoot(status: unknown): "abierta" | "pendiente" | "cerrada" {
  const valor = String(status ?? "").toLowerCase();
  if (valor === "pending" || valor === "snoozed") return "pendiente";
  if (valor === "resolved") return "cerrada";
  return "abierta";
}

function pesoDeConversacion(conversacion: CwConversation): number {
  return fechaDe(conversacion.last_activity_at ?? conversacion.updated_at ?? conversacion.created_at)?.getTime() ?? 0;
}

function estadoDelGrupo(grupo: GrupoContacto): "abierta" | "pendiente" | "cerrada" {
  const masReciente = [...grupo.conversaciones].sort((a, b) => pesoDeConversacion(b) - pesoDeConversacion(a))[0];
  return estadoDeChatwoot(masReciente?.status);
}

function direccionDe(mensaje: CwMessage): Direccion | null {
  const tipo = mensaje.message_type;
  if (tipo === 0 || tipo === "0" || tipo === "incoming") return "entrante";
  if (tipo === 1 || tipo === "1" || tipo === "outgoing" || tipo === 3 || tipo === "3" || tipo === "template") return "saliente";
  return null;
}

function tipoDe(mensaje: CwMessage): TipoImportado {
  if (mensaje.content_type === "template" || Number(mensaje.message_type) === 3) return "plantilla";
  const archivo = mensaje.attachments?.[0];
  if (!archivo) return "texto";
  const tipo = String(archivo.file_type ?? "").toLowerCase();
  if (tipo.includes("image")) return "imagen";
  if (tipo.includes("audio")) return "audio";
  if (tipo.includes("video")) return "video";
  return "documento";
}

function contenidoDe(mensaje: CwMessage, cliente: ClienteChatwoot): string {
  const texto = String(mensaje.content ?? "").trim();
  const adjuntos = (mensaje.attachments ?? [])
    .map((adjunto) => (adjunto.data_url ? cliente.urlAdjunto(adjunto.data_url) : null))
    .filter((url): url is string => Boolean(url));

  if (adjuntos.length) {
    const referencia = `[adjunto Chatwoot] ${adjuntos.join(" ")}`;
    return texto ? `${texto}\n\n${referencia}` : referencia;
  }
  return texto || "[mensaje sin texto]";
}

function normalizarMensaje(
  mensaje: CwMessage,
  opciones: Opciones,
  cliente: ClienteChatwoot
): { mensaje?: MensajeImportable; motivo?: keyof MotivosSaltado } {
  const id = Number(mensaje.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { motivo: "sin_id" };

  const direccion = direccionDe(mensaje);
  if (!direccion) return { motivo: "actividad" };

  const esPrivada = mensaje.private === true;
  if (esPrivada && !opciones.incluirPrivadas) return { motivo: "nota_privada" };

  const fecha = fechaDe(mensaje.created_at);
  if (!fecha) return { motivo: "sin_fecha" };

  return {
    mensaje: {
      chatwootId: id,
      syntheticId: `${PREFIJO_IMPORTADO}${id}`,
      sourceId: mensaje.source_id ? String(mensaje.source_id).trim() || null : null,
      fecha,
      direccion,
      tipo: esPrivada ? "texto" : tipoDe(mensaje),
      contenido: contenidoDe(mensaje, cliente),
      interna: esPrivada,
    },
  };
}

async function construirGrupos(
  conversaciones: CwConversation[],
  cliente: ClienteChatwoot
): Promise<{ grupos: GrupoContacto[]; sinTelefono: CwConversation[] }> {
  const grupos = new Map<string, GrupoContacto>();
  const sinTelefono: CwConversation[] = [];

  for (const conversacion of conversaciones) {
    const sender = await cliente.resolverSender(conversacion);
    const identificador = String(sender?.identifier ?? "");
    if (identificador.includes("@g.us") || identificador.includes("@broadcast")) {
      sinTelefono.push(conversacion);
      continue;
    }
    const telefono = telefonoContacto(sender?.phone_number ?? sender?.identifier);
    if (!telefono) {
      sinTelefono.push(conversacion);
      continue;
    }

    const nombre = String(sender?.name ?? "").trim().slice(0, 120) || telefono.completo;
    const existente = grupos.get(telefono.ultimos10);
    if (existente) {
      existente.conversaciones.push(conversacion);
      if (existente.nombre === existente.telefono.completo && nombre !== telefono.completo) existente.nombre = nombre;
    } else {
      grupos.set(telefono.ultimos10, {
        ultimos10: telefono.ultimos10,
        telefono,
        nombre,
        conversaciones: [conversacion],
      });
    }
  }

  return { grupos: [...grupos.values()], sinTelefono };
}

function ultimoEntrante(mensajes: MensajeImportable[]): MensajeImportable | null {
  for (let indice = mensajes.length - 1; indice >= 0; indice--) {
    const mensaje = mensajes[indice];
    if (mensaje.direccion === "entrante" && !mensaje.interna) return mensaje;
  }
  return null;
}

async function buscarIdsExistentes(
  tx: Prisma.TransactionClient,
  canalId: bigint,
  ids: string[]
): Promise<Set<string>> {
  const encontrados = new Set<string>();
  for (const lote of enLotes([...new Set(ids)], TAMANO_LOTE_SQL)) {
    if (!lote.length) continue;
    const filas = await tx.mensaje.findMany({
      where: { canalId, waMessageId: { in: lote } },
      select: { waMessageId: true },
    });
    for (const fila of filas) {
      if (fila.waMessageId) encontrados.add(fila.waMessageId);
    }
  }
  return encontrados;
}

async function actualizarFechasConversacion(
  tx: Prisma.TransactionClient,
  conversacionId: bigint,
  primero: Date,
  ultimo: Date,
  ultimoEntranteAt: Date | null
) {
  const asignaciones: Prisma.Sql[] = [
    Prisma.sql`ultimo_mensaje_at = GREATEST(COALESCE(ultimo_mensaje_at, ${ultimo}::timestamptz), ${ultimo}::timestamptz)`,
    Prisma.sql`created_at = LEAST(created_at, ${primero}::timestamptz)`,
  ];
  if (ultimoEntranteAt) {
    asignaciones.push(
      Prisma.sql`ultimo_entrante_at = GREATEST(COALESCE(ultimo_entrante_at, ${ultimoEntranteAt}::timestamptz), ${ultimoEntranteAt}::timestamptz)`
    );
  }
  await tx.$executeRaw(Prisma.sql`UPDATE conversaciones SET ${Prisma.join(asignaciones)} WHERE id = ${conversacionId}`);
}

const seleccionConversacion = {
  id: true,
  createdAt: true,
  ultimoMensajeAt: true,
  ultimoEntranteAt: true,
} as const;

async function procesarGrupo(
  grupo: GrupoContacto,
  opciones: Opciones,
  orgId: bigint,
  canalId: bigint,
  cliente: ClienteChatwoot
): Promise<ResultadoGrupo> {
  const resultado: ResultadoGrupo = {
    contacto: grupo.nombre,
    telefono: grupo.telefono.completo,
    conversacionesChatwoot: grupo.conversaciones.length,
    mensajesChatwoot: 0,
    insertados: 0,
    saltados: 0,
    motivos: motivosVacios(),
    contactoEstado: "encontrado",
    conversacionCrm: null,
  };

  const porChatwootId = new Map<number, MensajeImportable>();
  const sourceVistos = new Set<string>();

  for (const conversacion of grupo.conversaciones) {
    let mensajes: CwMessage[];
    try {
      mensajes = await cliente.listarMensajes(Number(conversacion.id));
    } catch (error) {
      resultado.error = `Chatwoot conversación ${conversacion.id}: ${mensajeDeError(error)}`;
      return resultado;
    }

    resultado.mensajesChatwoot += mensajes.length;
    for (const mensaje of mensajes) {
      const normalizado = normalizarMensaje(mensaje, opciones, cliente);
      if (!normalizado.mensaje) {
        const motivo = normalizado.motivo ?? "actividad";
        resultado.motivos[motivo]++;
        continue;
      }
      if (porChatwootId.has(normalizado.mensaje.chatwootId)) {
        resultado.motivos.duplicados++;
        continue;
      }
      if (normalizado.mensaje.sourceId) {
        if (sourceVistos.has(normalizado.mensaje.sourceId)) {
          resultado.motivos.duplicados++;
          continue;
        }
        sourceVistos.add(normalizado.mensaje.sourceId);
      }
      porChatwootId.set(normalizado.mensaje.chatwootId, normalizado.mensaje);
    }
  }

  const mensajes = [...porChatwootId.values()].sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime() || a.chatwootId - b.chatwootId
  );
  if (!mensajes.length) {
    resultado.saltados = Object.values(resultado.motivos).reduce((total, valor) => total + valor, 0);
    return resultado;
  }

  if (opciones.dryRun) {
    const existentes = await transaccionTenant(orgId, async (tx) => {
      const contacto = await tx.contacto.findFirst({
        where: { telefono: { endsWith: grupo.ultimos10 } },
        select: { id: true },
      });
      const synthetic = await buscarIdsExistentes(
        tx,
        canalId,
        mensajes.map((mensaje) => mensaje.syntheticId)
      );
      const source = await buscarIdsExistentes(
        tx,
        canalId,
        mensajes.map((mensaje) => mensaje.sourceId).filter((id): id is string => Boolean(id))
      );
      return { contacto: Boolean(contacto), synthetic, source };
    });

    resultado.contactoEstado = existentes.contacto ? "encontrado" : "creado";
    for (const mensaje of mensajes) {
      if (existentes.synthetic.has(mensaje.syntheticId)) {
        resultado.motivos.duplicados++;
        continue;
      }
      if (mensaje.sourceId && existentes.source.has(mensaje.sourceId)) {
        resultado.motivos.ya_en_canal++;
        continue;
      }
      resultado.insertados++;
    }
    resultado.saltados = Object.values(resultado.motivos).reduce((total, valor) => total + valor, 0);
    return resultado;
  }

  const guardado = await transaccionTenant(
    orgId,
    async (tx) => {
      let contacto = await tx.contacto.findFirst({
        where: { telefono: { endsWith: grupo.ultimos10 } },
        orderBy: { createdAt: "asc" },
        select: { id: true, nombre: true },
      });
      let contactoNuevo = false;

      if (!contacto) {
        try {
          contacto = await tx.contacto.create({
            data: { nombre: grupo.nombre, telefono: grupo.telefono.completo, fuente: "whatsapp" },
            select: { id: true, nombre: true },
          });
          contactoNuevo = true;
        } catch (error) {
          if (!esP2002(error)) throw error;
          contacto = await tx.contacto.findFirst({
            where: { telefono: { endsWith: grupo.ultimos10 } },
            select: { id: true, nombre: true },
          });
          if (!contacto) throw error;
        }
      }

      let conversacion = await tx.conversacion.findUnique({
        where: { contactoId_canalId: { contactoId: contacto.id, canalId } },
        select: seleccionConversacion,
      });
      let conversacionNueva = false;

      if (!conversacion) {
        const entrante = ultimoEntrante(mensajes);
        try {
          conversacion = await tx.conversacion.create({
            data: {
              contactoId: contacto.id,
              canalId,
              estado: estadoDelGrupo(grupo),
              createdAt: mensajes[0].fecha,
              ultimoMensajeAt: mensajes[mensajes.length - 1].fecha,
              ultimoEntranteAt: entrante?.fecha ?? null,
            },
            select: seleccionConversacion,
          });
          conversacionNueva = true;
        } catch (error) {
          if (!esP2002(error)) throw error;
          conversacion = await tx.conversacion.findUnique({
            where: { contactoId_canalId: { contactoId: contacto.id, canalId } },
            select: seleccionConversacion,
          });
          if (!conversacion) throw error;
        }
      }

      const syntheticIds = mensajes.map((mensaje) => mensaje.syntheticId);
      const sourceIds = mensajes.map((mensaje) => mensaje.sourceId).filter((id): id is string => Boolean(id));
      const existentesSynthetic = await buscarIdsExistentes(tx, canalId, syntheticIds);
      const existentesSource = await buscarIdsExistentes(tx, canalId, sourceIds);

      const insertables: MensajeImportable[] = [];
      for (const mensaje of mensajes) {
        if (existentesSynthetic.has(mensaje.syntheticId)) {
          resultado.motivos.duplicados++;
          continue;
        }
        if (mensaje.sourceId && existentesSource.has(mensaje.sourceId)) {
          resultado.motivos.ya_en_canal++;
          continue;
        }
        insertables.push(mensaje);
      }

      let insertados = 0;
      for (const lote of enLotes(insertables, TAMANO_LOTE_INSERCION)) {
        if (!lote.length) continue;
        const filas: Prisma.MensajeCreateManyInput[] = lote.map((mensaje) => ({
          conversacionId: conversacion!.id,
          canalId,
          direccion: mensaje.direccion,
          tipo: mensaje.tipo,
          contenido: mensaje.contenido,
          interna: mensaje.interna,
          status: mensaje.direccion === "entrante" ? "entregado" : "enviado",
          waMessageId: mensaje.syntheticId,
          timestamp: mensaje.fecha,
          createdAt: mensaje.fecha,
        }));
        const creados = await tx.mensaje.createMany({ data: filas, skipDuplicates: true });
        insertados += creados.count;
      }

      const sobrantes = insertables.length - insertados;
      if (sobrantes > 0) resultado.motivos.duplicados += sobrantes;

      if (!conversacionNueva && insertables.length) {
        await actualizarFechasConversacion(
          tx,
          conversacion.id,
          insertables[0].fecha,
          insertables[insertables.length - 1].fecha,
          ultimoEntrante(insertables)?.fecha ?? null
        );
      }

      return { insertados, contactoNuevo, conversacionId: conversacion.id };
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  resultado.insertados = guardado.insertados;
  resultado.contactoEstado = guardado.contactoNuevo ? "creado" : "encontrado";
  resultado.conversacionCrm = guardado.conversacionId;
  resultado.saltados = Object.values(resultado.motivos).reduce((total, valor) => total + valor, 0);
  return resultado;
}

async function recolectarCandidatos(
  grupos: GrupoContacto[],
  conversacionesSinTelefono: CwConversation[],
  opciones: Opciones,
  cliente: ClienteChatwoot
) {
  const esperados = new Set<string>();
  const candidatos: MensajeImportable[] = [];
  let totalChatwoot = 0;
  let totalSinTelefono = 0;

  for (const conversacion of conversacionesSinTelefono) {
    const mensajes = await cliente.listarMensajes(Number(conversacion.id));
    totalChatwoot += mensajes.length;
    totalSinTelefono += mensajes.length;
  }

  for (const grupo of grupos) {
    for (const conversacion of grupo.conversaciones) {
      const mensajes = await cliente.listarMensajes(Number(conversacion.id));
      totalChatwoot += mensajes.length;
      for (const mensaje of mensajes) {
        const normalizado = normalizarMensaje(mensaje, opciones, cliente);
        if (!normalizado.mensaje) continue;
        if (esperados.has(normalizado.mensaje.syntheticId)) continue;
        esperados.add(normalizado.mensaje.syntheticId);
        candidatos.push(normalizado.mensaje);
      }
    }
  }

  return { esperados, candidatos, totalChatwoot, totalSinTelefono };
}

async function verificarImportacion(
  grupos: GrupoContacto[],
  conversacionesSinTelefono: CwConversation[],
  opciones: Opciones,
  orgId: bigint,
  canalId: bigint,
  cliente: ClienteChatwoot
) {
  const { esperados, candidatos, totalChatwoot, totalSinTelefono } = await recolectarCandidatos(
    grupos,
    conversacionesSinTelefono,
    opciones,
    cliente
  );

  const sourceIds = candidatos.map((mensaje) => mensaje.sourceId).filter((id): id is string => Boolean(id));
  const presentes = await transaccionTenant(orgId, async (tx) => {
    const synthetic = await buscarIdsExistentes(tx, canalId, [...esperados]);
    const source = await buscarIdsExistentes(tx, canalId, sourceIds);
    return { synthetic, source };
  });

  const faltantes = candidatos.filter((mensaje) => {
    if (presentes.synthetic.has(mensaje.syntheticId)) return false;
    if (mensaje.sourceId && presentes.source.has(mensaje.sourceId)) return false;
    return true;
  });
  const sobrantes = [...presentes.synthetic].filter((id) => !esperados.has(id));

  return {
    totalChatwoot,
    totalSinTelefono,
    esperados: esperados.size,
    presentesImportados: presentes.synthetic.size,
    presentesPorSourceId: presentes.source.size,
    faltantes,
    sobrantes,
  };
}

async function resolverCanal(opciones: Opciones, orgId: bigint) {
  const canales = await transaccionTenant(orgId, (tx) =>
    tx.canalWhatsapp.findMany({
      where: { activo: true, ...(opciones.canalId === null ? {} : { id: opciones.canalId }) },
      select: { id: true, nombre: true, proveedor: true, telefono: true },
    })
  );

  const candidatos = canales.filter((canal) => canal.proveedor === "cloud_api" || canal.proveedor === "api");
  if (candidatos.length === 1) return candidatos[0];
  if (candidatos.length === 0) {
    throw new Error(
      `No hay un canal de WhatsApp activo${opciones.canalId === null ? "" : ` con id ${opciones.canalId}`}. Canales: ${canales
        .map((canal) => `${canal.id}:${canal.nombre} (${canal.proveedor})`)
        .join(", ") || "ninguno"}`
    );
  }
  throw new Error(
    `Hay varios canales de WhatsApp; elige uno con --canal-id: ${candidatos
      .map((canal) => `${canal.id}:${canal.nombre} (${canal.telefono ?? "sin teléfono"})`)
      .join(", ")}`
  );
}

async function resolverInboxes(opciones: Opciones, cliente: ClienteChatwoot): Promise<CwInbox[]> {
  const inboxes = await cliente.listarInboxes();
  const whatsapp = inboxes.filter((inbox) => /whatsapp/i.test(String(inbox.channel_type ?? "")));

  if (opciones.inboxId !== null) {
    const elegido = inboxes.find((inbox) => Number(inbox.id) === opciones.inboxId);
    if (!elegido) throw new Error(`No existe el inbox ${opciones.inboxId} en Chatwoot`);
    if (!whatsapp.some((inbox) => Number(inbox.id) === opciones.inboxId) && !opciones.forzarInbox) {
      throw new Error(
        `El inbox ${opciones.inboxId} no es de WhatsApp (${elegido.channel_type ?? "tipo desconocido"}). Usa --forzar-inbox solo si estás seguro`
      );
    }
    return [elegido];
  }

  if (!whatsapp.length) {
    throw new Error(
      `No hay inboxes de WhatsApp en la cuenta de Chatwoot. Inboxes: ${inboxes
        .map((inbox) => `${inbox.id}:${inbox.channel_type ?? "tipo desconocido"}`)
        .join(", ") || "ninguno"}`
    );
  }
  return whatsapp;
}

async function main() {
  const opciones = parsearOpciones(process.argv.slice(2));
  validarBaseDeDatos(opciones);
  const chatwootConfig = validarChatwoot(opciones);
  const rol = await verificarRolAplicacion();

  if (opciones.incluirPrivadas) {
    console.warn("Aviso: se importarán notas privadas. Requiere aprobación de Ricardo por escrito.");
  }

  const org = await dbRaw.org.findUnique({
    where: { slug: opciones.orgSlug },
    select: { id: true, nombre: true, slug: true },
  });
  if (!org) throw new Error(`No existe la organización con slug ${opciones.orgSlug}`);

  const canal = await resolverCanal(opciones, org.id);
  const cliente = crearClienteChatwoot(chatwootConfig.baseUrl, chatwootConfig.token, chatwootConfig.accountId);
  const inboxes = await resolverInboxes(opciones, cliente);

  console.log(`Chatwoot: ${chatwootConfig.baseUrl} · cuenta ${chatwootConfig.accountId}`);
  console.log(`Base: ${org.nombre} (${org.slug}) · rol ${rol}`);
  console.log(`Canal CRM: ${canal.id}:${canal.nombre} (${canal.proveedor})`);
  console.log(`Inbox(es) Chatwoot: ${inboxes.map((inbox) => `${inbox.id}:${inbox.name ?? inbox.channel_type}`).join(", ")}`);

  const conversaciones: CwConversation[] = [];
  for (const inbox of inboxes) {
    const lote = await cliente.listarConversacionesDeInbox(Number(inbox.id), opciones.limiteConversaciones);
    conversaciones.push(...lote);
    if (opciones.limiteConversaciones !== null && conversaciones.length >= opciones.limiteConversaciones) break;
  }
  const limitadas =
    opciones.limiteConversaciones === null ? conversaciones : conversaciones.slice(0, opciones.limiteConversaciones);
  console.log(`Conversaciones de Chatwoot a procesar: ${limitadas.length}`);

  const { grupos, sinTelefono } = await construirGrupos(limitadas, cliente);
  const resumen = {
    modo: opciones.verificar ? "verificar" : opciones.dryRun ? "dry-run" : "real",
    org: `${org.nombre} (${org.slug})`,
    canal: `${canal.id}:${canal.nombre}`,
    rol,
    conversaciones_chatwoot: limitadas.length,
    conversaciones_sin_telefono: sinTelefono.length,
    contactos: grupos.length,
    mensajes_chatwoot: 0,
    mensajes_insertados: 0,
    mensajes_saltados: motivosVacios(),
    contactos_creados: 0,
    contactos_encontrados: 0,
    errores: 0,
  };

  if (opciones.verificar) {
    const verificacion = await verificarImportacion(
      grupos,
      sinTelefono,
      opciones,
      org.id,
      canal.id,
      cliente
    );
    resumen.mensajes_chatwoot = verificacion.totalChatwoot;
    resumen.mensajes_saltados.sin_telefono = verificacion.totalSinTelefono;
    console.log(JSON.stringify(resumen, null, 2));
    console.log(
      JSON.stringify(
        {
          modo: "verificar",
          esperados_importables: verificacion.esperados,
          presentes_importados: verificacion.presentesImportados,
          presentes_por_source_id: verificacion.presentesPorSourceId,
          faltantes: verificacion.faltantes.length,
          sobrantes: verificacion.sobrantes.length,
          detalle_faltantes: verificacion.faltantes.slice(0, 50).map((mensaje) => mensaje.syntheticId),
          detalle_sobrantes: verificacion.sobrantes.slice(0, 50),
        },
        null,
        2
      )
    );
    if (verificacion.faltantes.length || verificacion.sobrantes.length) process.exitCode = 1;
    return;
  }

  for (const conversacion of sinTelefono) {
    const mensajes = await cliente.listarMensajes(Number(conversacion.id));
    resumen.mensajes_chatwoot += mensajes.length;
    resumen.mensajes_saltados.sin_telefono += mensajes.length;
  }

  for (const grupo of grupos) {
    let resultado: ResultadoGrupo;
    try {
      resultado = await procesarGrupo(grupo, opciones, org.id, canal.id, cliente);
    } catch (error) {
      resumen.errores++;
      console.error(`✗ ${grupo.telefono.completo} ${grupo.nombre}: ${mensajeDeError(error)}`);
      continue;
    }
    resumen.mensajes_chatwoot += resultado.mensajesChatwoot;
    resumen.mensajes_insertados += resultado.insertados;
    sumarMotivos(resumen.mensajes_saltados, resultado.motivos);
    if (resultado.contactoEstado === "creado") resumen.contactos_creados++;
    else if (resultado.contactoEstado === "encontrado") resumen.contactos_encontrados++;
    if (resultado.error) {
      resumen.errores++;
      console.error(`✗ ${resultado.telefono} ${resultado.contacto}: ${resultado.error}`);
    } else {
      const saltados = Object.values(resultado.motivos).reduce((total, valor) => total + valor, 0);
      console.log(
        `✓ ${resultado.telefono} ${resultado.contacto} · ${resultado.conversacionesChatwoot} conv. Chatwoot · ` +
          `${resultado.mensajesChatwoot} mensajes · ${resultado.insertados} insertados · ${saltados} saltados`
      );
    }
  }

  console.log(JSON.stringify(resumen, null, 2));
  if (resumen.errores) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(`Error: ${mensajeDeError(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbRaw.$disconnect();
  });
