-- ============================================================
-- AmbarCRM — Schema Postgres 16 (single-tenant, instancia por cliente)
-- Idempotente: se puede correr de cero. Incluye seed mínimo.
-- ============================================================

-- ---------- ENUMs ----------
DO $$ BEGIN
  CREATE TYPE rol_usuario      AS ENUM ('admin', 'agente');
  CREATE TYPE tipo_etapa       AS ENUM ('normal', 'ganado', 'perdido');
  CREATE TYPE estado_oport     AS ENUM ('abierto', 'ganado', 'perdido');
  CREATE TYPE fuente_contacto  AS ENUM ('whatsapp', 'manual', 'meta_ads', 'web', 'otro');
  CREATE TYPE estado_conv      AS ENUM ('abierta', 'pendiente', 'cerrada');
  CREATE TYPE direccion_msg    AS ENUM ('entrante', 'saliente');
  CREATE TYPE tipo_msg         AS ENUM ('texto','imagen','audio','video','documento','ubicacion','plantilla');
  CREATE TYPE status_msg       AS ENUM ('pendiente','enviado','entregado','leido','fallido');
  CREATE TYPE proveedor_canal  AS ENUM ('evolution', 'cloud_api');
  CREATE TYPE estado_canal     AS ENUM ('conectado', 'desconectado');
  CREATE TYPE tipo_evento      AS ENUM ('creada','etapa_cambio','ganada','perdida','nota','tarea','mensaje','asignacion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- usuarios ----------
CREATE TABLE IF NOT EXISTS usuarios (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre        TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  rol           rol_usuario NOT NULL DEFAULT 'agente',
  avatar_url    TEXT,
  activo        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- embudos ----------
CREATE TABLE IF NOT EXISTS embudos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre      TEXT    NOT NULL,
  descripcion TEXT,
  color       TEXT    NOT NULL DEFAULT '#1E3A5F',
  orden       INT     NOT NULL DEFAULT 0,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- etapas (columnas del kanban) ----------
CREATE TABLE IF NOT EXISTS etapas (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  embudo_id  BIGINT     NOT NULL REFERENCES embudos(id) ON DELETE CASCADE,
  nombre     TEXT       NOT NULL,
  color      TEXT       NOT NULL DEFAULT '#94A3B8',
  orden      INT        NOT NULL DEFAULT 0,
  tipo       tipo_etapa NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_etapas_embudo ON etapas(embudo_id, orden);

-- ---------- contactos (leads) ----------
CREATE TABLE IF NOT EXISTS contactos (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre         TEXT            NOT NULL,
  telefono       TEXT            UNIQUE,          -- E.164, llave natural de WhatsApp
  email          TEXT,
  empresa        TEXT,
  avatar_url     TEXT,
  fuente         fuente_contacto NOT NULL DEFAULT 'manual',
  notas          TEXT,
  responsable_id BIGINT          REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contactos_responsable ON contactos(responsable_id);

-- ---------- etiquetas ----------
CREATE TABLE IF NOT EXISTS etiquetas (
  id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  color  TEXT NOT NULL DEFAULT '#B45309'
);

CREATE TABLE IF NOT EXISTS contacto_etiquetas (
  contacto_id BIGINT NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  etiqueta_id BIGINT NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (contacto_id, etiqueta_id)
);

-- ---------- oportunidades (tarjetas del kanban) ----------
CREATE TABLE IF NOT EXISTS oportunidades (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contacto_id           BIGINT       NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  embudo_id             BIGINT       NOT NULL REFERENCES embudos(id)   ON DELETE CASCADE,
  etapa_id              BIGINT       NOT NULL REFERENCES etapas(id)    ON DELETE RESTRICT,
  titulo                TEXT         NOT NULL,
  valor                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  moneda                TEXT         NOT NULL DEFAULT 'MXN',
  responsable_id        BIGINT       REFERENCES usuarios(id) ON DELETE SET NULL,
  orden                 INT          NOT NULL DEFAULT 0,   -- posición dentro de la etapa
  estado                estado_oport NOT NULL DEFAULT 'abierto',
  motivo_perdida        TEXT,
  fecha_cierre_estimada DATE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_oport_etapa  ON oportunidades(etapa_id, orden);
CREATE INDEX IF NOT EXISTS idx_oport_embudo ON oportunidades(embudo_id);
CREATE INDEX IF NOT EXISTS idx_oport_contacto ON oportunidades(contacto_id);

-- ---------- canales_whatsapp (abstracción de proveedor) ----------
CREATE TABLE IF NOT EXISTS canales_whatsapp (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre     TEXT            NOT NULL,
  proveedor  proveedor_canal NOT NULL DEFAULT 'evolution',
  telefono   TEXT,
  instancia  TEXT,            -- nombre de instancia Evolution / phone_number_id de Meta
  estado     estado_canal    NOT NULL DEFAULT 'desconectado',
  config     JSONB           NOT NULL DEFAULT '{}'::jsonb,  -- urls, tokens NO secretos
  activo     BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- ---------- bots (estilo Agent Bot de Chatwoot) ----------
CREATE TABLE IF NOT EXISTS bots (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre      TEXT    NOT NULL,
  webhook_url TEXT    NOT NULL,            -- CRM -> n8n (mensajes entrantes)
  api_token   TEXT    NOT NULL UNIQUE,     -- n8n -> CRM (header api_access_token)
  canal_id    BIGINT  REFERENCES canales_whatsapp(id) ON DELETE SET NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- grupos (bandeja aparte, no son leads) ----------
CREATE TABLE IF NOT EXISTS grupos (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canal_id         BIGINT      REFERENCES canales_whatsapp(id) ON DELETE SET NULL,
  jid              TEXT        NOT NULL UNIQUE,
  nombre           TEXT        NOT NULL,
  no_leidos        INT         NOT NULL DEFAULT 0,
  ultimo_mensaje_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mensajes_grupo (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grupo_id      BIGINT        NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  direccion     direccion_msg NOT NULL,
  tipo          tipo_msg      NOT NULL DEFAULT 'texto',
  contenido     TEXT,
  media_url     TEXT,
  media_mime    TEXT,
  remitente     TEXT,
  remitente_tel TEXT,
  status        status_msg    NOT NULL DEFAULT 'enviado',
  wa_message_id TEXT          UNIQUE,
  enviado_por   BIGINT        REFERENCES usuarios(id) ON DELETE SET NULL,
  "timestamp"   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_grupo ON mensajes_grupo(grupo_id, "timestamp");

-- ---------- conversaciones ----------
CREATE TABLE IF NOT EXISTS conversaciones (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contacto_id      BIGINT      NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  canal_id         BIGINT      REFERENCES canales_whatsapp(id) ON DELETE SET NULL,
  estado           estado_conv NOT NULL DEFAULT 'abierta',
  responsable_id   BIGINT      REFERENCES usuarios(id) ON DELETE SET NULL,
  no_leidos        INT         NOT NULL DEFAULT 0,
  bot_activo       BOOLEAN     NOT NULL DEFAULT TRUE,
  etiquetas        TEXT[]      NOT NULL DEFAULT '{}',
  csat_score       INT,
  csat_enviado_at  TIMESTAMPTZ,
  aviso_fuera_at   TIMESTAMPTZ,
  ultimo_mensaje_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contacto_id, canal_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_orden ON conversaciones(ultimo_mensaje_at DESC NULLS LAST);
-- Para BD existentes (idempotente):
ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS bot_activo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS etiquetas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS csat_score INT;
ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS csat_enviado_at TIMESTAMPTZ;
ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS aviso_fuera_at TIMESTAMPTZ;

-- ---------- mensajes ----------
CREATE TABLE IF NOT EXISTS mensajes (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id BIGINT       NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  direccion      direccion_msg NOT NULL,
  tipo           tipo_msg      NOT NULL DEFAULT 'texto',
  contenido      TEXT,
  media_url      TEXT,
  media_mime     TEXT,
  interna        BOOLEAN       NOT NULL DEFAULT FALSE,
  status         status_msg    NOT NULL DEFAULT 'enviado',
  wa_message_id  TEXT          UNIQUE,        -- idempotencia de webhooks
  enviado_por    BIGINT        REFERENCES usuarios(id) ON DELETE SET NULL, -- null = cliente/bot
  "timestamp"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON mensajes(conversacion_id, "timestamp");
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS interna BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------- plantillas de mensaje (respuestas rápidas) ----------
CREATE TABLE IF NOT EXISTS plantillas_mensaje (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre     TEXT NOT NULL,
  contenido  TEXT NOT NULL,
  categoria  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- notas ----------
CREATE TABLE IF NOT EXISTS notas (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oportunidad_id BIGINT     NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  usuario_id    BIGINT      REFERENCES usuarios(id) ON DELETE SET NULL,
  contenido     TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- tareas ----------
CREATE TABLE IF NOT EXISTS tareas (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oportunidad_id BIGINT      REFERENCES oportunidades(id) ON DELETE CASCADE,
  responsable_id BIGINT      REFERENCES usuarios(id) ON DELETE SET NULL,
  titulo         TEXT        NOT NULL,
  descripcion    TEXT,
  vence_at       TIMESTAMPTZ,
  completada     BOOLEAN     NOT NULL DEFAULT FALSE,
  completada_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tareas_pendientes ON tareas(responsable_id, vence_at) WHERE completada = FALSE;

-- ---------- eventos (timeline / auditoría de la oportunidad) ----------
CREATE TABLE IF NOT EXISTS eventos (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oportunidad_id BIGINT      NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  tipo           tipo_evento NOT NULL,
  descripcion    TEXT,
  usuario_id     BIGINT      REFERENCES usuarios(id) ON DELETE SET NULL,
  payload        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_oport ON eventos(oportunidad_id, created_at);

-- ---------- ajustes (automatizaciones, fila única) ----------
CREATE TABLE IF NOT EXISTS ajustes (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auto_asignar      BOOLEAN NOT NULL DEFAULT FALSE,
  bienvenida_activa BOOLEAN NOT NULL DEFAULT FALSE,
  bienvenida_texto  TEXT,
  crear_lead_auto   BOOLEAN NOT NULL DEFAULT TRUE,
  csat_activo       BOOLEAN NOT NULL DEFAULT FALSE,
  csat_texto        TEXT,
  horario_activo    BOOLEAN NOT NULL DEFAULT FALSE,
  horario_inicio    TEXT,
  horario_fin       TEXT,
  horario_dias      TEXT,
  fuera_horario_texto TEXT,
  auto_resolver_activo BOOLEAN NOT NULL DEFAULT FALSE,
  auto_resolver_horas  INT NOT NULL DEFAULT 24,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Para BD existentes (idempotente):
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS crear_lead_auto BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS csat_activo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS csat_texto TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS horario_activo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS horario_inicio TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS horario_fin TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS horario_dias TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS fuera_horario_texto TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS auto_resolver_activo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS auto_resolver_horas INT NOT NULL DEFAULT 24;

-- ============================================================
-- Realtime: NOTIFY al insertar mensaje (lo consume el SSE de Next.js)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_notify_mensaje() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('nuevo_mensaje', json_build_object(
    'conversacion_id', NEW.conversacion_id,
    'mensaje_id',      NEW.id,
    'direccion',       NEW.direccion
  )::text);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_mensaje ON mensajes;
CREATE TRIGGER trg_notify_mensaje
  AFTER INSERT ON mensajes
  FOR EACH ROW EXECUTE FUNCTION fn_notify_mensaje();

-- ============================================================
-- SEED mínimo
-- ============================================================

-- Usuario admin demo (password: demo1234 -> reemplazar hash bcrypt real en deploy)
INSERT INTO usuarios (nombre, email, password_hash, rol)
SELECT 'Admin', 'admin@ambarcrm.mx', '$2a$10$DEMOHASHREPLACEME', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM usuarios);

-- Embudo de ventas por defecto + etapas
WITH e AS (
  INSERT INTO embudos (nombre, descripcion, orden)
  SELECT 'Ventas', 'Embudo principal de ventas', 0
  WHERE NOT EXISTS (SELECT 1 FROM embudos)
  RETURNING id
)
INSERT INTO etapas (embudo_id, nombre, color, orden, tipo)
SELECT e.id, x.nombre, x.color, x.orden, x.tipo::tipo_etapa
FROM e CROSS JOIN (VALUES
  ('Nuevo lead',     '#94A3B8', 0, 'normal'),
  ('Contactado',     '#3B82F6', 1, 'normal'),
  ('En negociación', '#B45309', 2, 'normal'),
  ('Propuesta',      '#8B5CF6', 3, 'normal'),
  ('Ganado',         '#16A34A', 4, 'ganado'),
  ('Perdido',        '#DC2626', 5, 'perdido')
) AS x(nombre, color, orden, tipo);

-- Canal de WhatsApp por defecto (Evolution)
INSERT INTO canales_whatsapp (nombre, proveedor, estado)
SELECT 'WhatsApp principal', 'evolution', 'desconectado'
WHERE NOT EXISTS (SELECT 1 FROM canales_whatsapp);

-- Fila única de ajustes (automatizaciones desactivadas por defecto)
INSERT INTO ajustes (auto_asignar, bienvenida_activa, bienvenida_texto)
SELECT FALSE, FALSE, '¡Hola {{nombre}}! Gracias por escribirnos 👋 En breve un asesor te atiende.'
WHERE NOT EXISTS (SELECT 1 FROM ajustes);
