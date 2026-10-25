-- ============================================================================
-- AmbarCRM · Migración a multi-tenant (BD compartida + org_id + RLS)
-- Ver MULTI-TENANT.md. Corre esto en psql conectado como el DUEÑO/superusuario.
--
-- REGLA DE ORO: la app NO debe conectarse como el dueño/superusuario, sino como
-- `crm_app` (rol sin BYPASSRLS). Si la app usa el dueño, RLS se ignora y NO hay
-- aislamiento. Cambia DATABASE_URL a crm_app al final.
--
-- Orden recomendado:
--   · Deploy NUEVO (BD vacía): `npx prisma db push`  →  luego PARTE B y C.
--   · BD EXISTENTE (con datos del cliente actual):    PARTE A  →  PARTE B  →  PARTE C.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE A — Solo BD EXISTENTE: crear orgs, añadir org_id y backfillear a la org 1.
-- (En deploy nuevo esto lo hace `prisma db push`; sáltate la PARTE A.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orgs (
  id         BIGSERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO orgs (id, nombre, slug)
  VALUES (1, 'Cliente Inicial', 'inicial')
  ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'usuarios','embudos','etapas','contactos','etiquetas','contacto_etiquetas',
    'oportunidades','canales_whatsapp','grupos','mensajes_grupo','bots',
    'conversaciones','mensajes','plantillas_mensaje','notas','tareas','ajustes','eventos'
  ] LOOP
    -- añadir columna (nullable), backfill a org 1, fijar NOT NULL + DEFAULT por contexto
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS org_id BIGINT', t);
    EXECUTE format('UPDATE %I SET org_id = 1 WHERE org_id IS NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN org_id SET NOT NULL', t);
    EXECUTE format($q$ALTER TABLE %I ALTER COLUMN org_id
      SET DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint$q$, t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_org_fk') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (org_id) REFERENCES orgs(id)',
        t, t || '_org_fk');
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (org_id)', t || '_org_idx', t);
  END LOOP;
END $$;

-- Reemplazar las UNIQUE globales por compuestas con org_id (dos tenants pueden repetir).
ALTER TABLE usuarios  DROP CONSTRAINT IF EXISTS usuarios_email_key;
ALTER TABLE contactos DROP CONSTRAINT IF EXISTS contactos_telefono_key;
ALTER TABLE etiquetas DROP CONSTRAINT IF EXISTS etiquetas_nombre_key;
ALTER TABLE grupos    DROP CONSTRAINT IF EXISTS grupos_jid_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_org_email_key') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_org_email_key UNIQUE (org_id, email);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contactos_org_telefono_key') THEN
    ALTER TABLE contactos ADD CONSTRAINT contactos_org_telefono_key UNIQUE (org_id, telefono);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'etiquetas_org_nombre_key') THEN
    ALTER TABLE etiquetas ADD CONSTRAINT etiquetas_org_nombre_key UNIQUE (org_id, nombre);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grupos_org_jid_key') THEN
    ALTER TABLE grupos ADD CONSTRAINT grupos_org_jid_key UNIQUE (org_id, jid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ajustes_org_key') THEN
    ALTER TABLE ajustes ADD CONSTRAINT ajustes_org_key UNIQUE (org_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE B — SIEMPRE: activar RLS + política de aislamiento por tabla.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'usuarios','embudos','etapas','contactos','etiquetas','contacto_etiquetas',
    'oportunidades','canales_whatsapp','grupos','mensajes_grupo','bots',
    'conversaciones','mensajes','plantillas_mensaje','notas','tareas','ajustes','eventos'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY org_isolation ON %I
      USING      (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
      WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
    $p$, t);
  END LOOP;
END $$;

-- Funciones de resolución cruzada (sin contexto de tenant). SECURITY DEFINER:
-- corren como el dueño (que no está forzado por RLS) y por eso pueden leer entre orgs.
-- Se usan SOLO para enrutar: webhook (phone_number_id/canal) y bots (token).
CREATE OR REPLACE FUNCTION resolve_org_by_canal(p_id bigint)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM canales_whatsapp WHERE id = p_id
$$;
-- La versión vigente de resolve_org_by_phone vive en actualizaciones.sql,
-- que también se ejecuta en cada deploy sobre bases ya existentes.
CREATE OR REPLACE FUNCTION resolve_org_by_bot_token(p_token text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM bots WHERE api_token = p_token
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE C — SIEMPRE: rol de la app (sometido a RLS) y permisos.
-- ⚠️ Pon una contraseña real y usa este rol en DATABASE_URL.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO crm_app;
-- que los objetos futuros (migraciones nuevas) también queden con permiso
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO crm_app;

-- NOTA: `crm_app` NO es dueño de las tablas y NO tiene BYPASSRLS → respeta RLS. Correcto.
-- Mantén un rol aparte (el dueño/superusuario) para correr migraciones y Prisma.

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE D — Realtime multi-tenant: el NOTIFY incluye org_id para que el SSE
-- solo reenvíe eventos del tenant de la sesión. (Idempotente; en BD existentes
-- correr solo este bloque basta.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_notify_mensaje() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('nuevo_mensaje', json_build_object(
    'conversacion_id', NEW.conversacion_id,
    'mensaje_id',      NEW.id,
    'direccion',       NEW.direccion,
    'org_id',          NEW.org_id
  )::text);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE E — Tablas nuevas (2026-07): mensajes programados y suscripciones push.
-- Nacen multi-tenant (org_id + RLS). Idempotente: correr en BD nuevas y existentes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mensajes_programados (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id          BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  conversacion_id BIGINT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  contenido       TEXT   NOT NULL,
  enviar_at       TIMESTAMPTZ NOT NULL,
  estado          TEXT   NOT NULL DEFAULT 'pendiente',  -- pendiente | enviado | fallido | cancelado
  creado_por      BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensajes_programados_estado_enviar_at_idx ON mensajes_programados(estado, enviar_at);
CREATE INDEX IF NOT EXISTS mensajes_programados_org_idx ON mensajes_programados(org_id);

CREATE TABLE IF NOT EXISTS push_suscripciones (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id     BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  usuario_id BIGINT,
  endpoint   TEXT   NOT NULL UNIQUE,
  p256dh     TEXT   NOT NULL,
  auth       TEXT   NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_suscripciones_org_idx ON push_suscripciones(org_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mensajes_programados','push_suscripciones'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY org_isolation ON %I
      USING      (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
      WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
    $p$, t);
  END LOOP;
END $$;

-- crm_app hereda permisos por los DEFAULT PRIVILEGES de la PARTE C; por si esta parte
-- se corre en una BD donde aún no existían, se los damos explícitos:
GRANT SELECT, INSERT, UPDATE, DELETE ON mensajes_programados, push_suscripciones TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- Las actualizaciones que también deben correr en bases con volumen existente
-- viven en actualizaciones.sql y se aplican automáticamente en cada deploy.

-- ─────────────────────────────────────────────────────────────────────────────
-- Pagos en línea (Fase P0-1). Nacen multi-tenant; este bloque es idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos_online (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  origen_tipo TEXT NOT NULL CHECK (origen_tipo IN ('venta','cita','cotizacion','pedido')),
  origen_id BIGINT NOT NULL,
  proveedor TEXT NOT NULL CHECK (proveedor IN ('mercado_pago','mock')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','cancelado','reembolsado')),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  monto_reembolsado NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_reembolsado >= 0 AND monto_reembolsado <= monto),
  moneda TEXT NOT NULL DEFAULT 'MXN',
  referencia_externa TEXT,
  checkout_referencia TEXT,
  checkout_url TEXT,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  expira_at TIMESTAMPTZ,
  aprobado_at TIMESTAMPTZ,
  reembolsado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key)
);
ALTER TABLE pagos_online ADD COLUMN IF NOT EXISTS monto_reembolsado NUMERIC(12,2) NOT NULL DEFAULT 0;
UPDATE pagos_online
SET monto_reembolsado = LEAST(monto, GREATEST(0, monto_reembolsado))
WHERE monto_reembolsado < 0 OR monto_reembolsado > monto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagos_online_monto_reembolsado_check') THEN
    ALTER TABLE pagos_online ADD CONSTRAINT pagos_online_monto_reembolsado_check
      CHECK (monto_reembolsado >= 0 AND monto_reembolsado <= monto);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS pagos_online_org_estado_created_idx ON pagos_online(org_id, estado, created_at);
CREATE INDEX IF NOT EXISTS pagos_online_org_origen_idx ON pagos_online(org_id, origen_tipo, origen_id);
CREATE INDEX IF NOT EXISTS pagos_online_proveedor_referencia_idx ON pagos_online(proveedor, referencia_externa);
WITH duplicados AS (
  SELECT id, row_number() OVER (
    PARTITION BY org_id, origen_tipo, origen_id ORDER BY created_at DESC, id DESC
  ) AS posicion
  FROM pagos_online WHERE estado = 'pendiente'
)
UPDATE pagos_online
SET estado = 'cancelado',
    metadata = metadata || '{"motivo":"checkout_pendiente_duplicado_migracion"}'::jsonb
WHERE id IN (SELECT id FROM duplicados WHERE posicion > 1);
CREATE UNIQUE INDEX IF NOT EXISTS pagos_online_un_pendiente_origen_idx
  ON pagos_online(org_id, origen_tipo, origen_id) WHERE estado = 'pendiente';
CREATE UNIQUE INDEX IF NOT EXISTS pagos_online_id_org_idx ON pagos_online(id, org_id);

CREATE TABLE IF NOT EXISTS eventos_pago (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  pago_id BIGINT NOT NULL REFERENCES pagos_online(id) ON DELETE CASCADE,
  proveedor TEXT NOT NULL,
  evento_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  procesado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, proveedor, evento_id)
);
CREATE INDEX IF NOT EXISTS eventos_pago_org_pago_created_idx ON eventos_pago(org_id, pago_id, created_at);
ALTER TABLE eventos_pago DROP CONSTRAINT IF EXISTS eventos_pago_pago_id_fkey;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_pago_pago_org_fkey') THEN
    ALTER TABLE eventos_pago ADD CONSTRAINT eventos_pago_pago_org_fkey
      FOREIGN KEY (pago_id, org_id) REFERENCES pagos_online(id, org_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS credenciales_pago (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  proveedor TEXT NOT NULL CHECK (proveedor IN ('mercado_pago','mock')),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  user_id TEXT,
  scope TEXT,
  public_key TEXT,
  sandbox BOOLEAN NOT NULL DEFAULT true,
  activo BOOLEAN NOT NULL DEFAULT true,
  requiere_reconexion BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, proveedor)
);
ALTER TABLE credenciales_pago ALTER COLUMN access_token_encrypted DROP NOT NULL;
ALTER TABLE credenciales_pago ALTER COLUMN webhook_secret_encrypted DROP NOT NULL;
ALTER TABLE credenciales_pago ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT;
ALTER TABLE credenciales_pago ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE credenciales_pago ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE credenciales_pago ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE credenciales_pago ADD COLUMN IF NOT EXISTS requiere_reconexion BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS credenciales_pago_org_activo_idx ON credenciales_pago(org_id, activo);

CREATE TABLE IF NOT EXISTS reembolsos_pago (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  pago_id BIGINT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  referencia TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado')),
  idempotency_key TEXT NOT NULL,
  ultimo_error TEXT,
  reintentar_at TIMESTAMPTZ,
  intentos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key),
  FOREIGN KEY (pago_id, org_id) REFERENCES pagos_online(id, org_id) ON DELETE CASCADE
);
ALTER TABLE reembolsos_pago ADD COLUMN IF NOT EXISTS ultimo_error TEXT;
ALTER TABLE reembolsos_pago ADD COLUMN IF NOT EXISTS reintentar_at TIMESTAMPTZ;
ALTER TABLE reembolsos_pago ADD COLUMN IF NOT EXISTS intentos INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS reembolsos_pago_org_pago_created_idx ON reembolsos_pago(org_id, pago_id, created_at);
CREATE INDEX IF NOT EXISTS reembolsos_pago_org_estado_reintentar_idx ON reembolsos_pago(org_id, estado, reintentar_at);

ALTER TABLE pagos_online ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE credenciales_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE reembolsos_pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON pagos_online;
CREATE POLICY org_isolation ON pagos_online
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
DROP POLICY IF EXISTS org_isolation ON eventos_pago;
CREATE POLICY org_isolation ON eventos_pago
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
DROP POLICY IF EXISTS org_isolation ON credenciales_pago;
CREATE POLICY org_isolation ON credenciales_pago
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
DROP POLICY IF EXISTS org_isolation ON reembolsos_pago;
CREATE POLICY org_isolation ON reembolsos_pago
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
GRANT SELECT, INSERT, UPDATE ON pagos_online, eventos_pago, credenciales_pago, reembolsos_pago TO crm_app;
REVOKE DELETE ON pagos_online, eventos_pago, credenciales_pago, reembolsos_pago FROM crm_app;
GRANT USAGE, SELECT ON SEQUENCE pagos_online_id_seq, eventos_pago_id_seq, credenciales_pago_id_seq, reembolsos_pago_id_seq TO crm_app;
