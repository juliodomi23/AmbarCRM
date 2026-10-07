-- Actualizaciones idempotentes para bases nuevas y existentes.
-- Este archivo se ejecuta con el usuario dueño en cada deploy.

ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_nombre TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_logo TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_color_primario TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_color_acento TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_preset TEXT;

-- Motivo legible cuando Meta rechaza un mensaje (se muestra en el chat).
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS error_detalle TEXT;

-- Solo WhatsApp Cloud API oficial de Meta.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'proveedor_canal' AND e.enumlabel <> 'cloud_api'
  ) THEN
    UPDATE canales_whatsapp
    SET activo = false, estado = 'desconectado'
    WHERE proveedor::text <> 'cloud_api';

    ALTER TYPE proveedor_canal RENAME TO proveedor_canal_old;
    CREATE TYPE proveedor_canal AS ENUM ('cloud_api');
    ALTER TABLE canales_whatsapp ALTER COLUMN proveedor DROP DEFAULT;
    ALTER TABLE canales_whatsapp
      ALTER COLUMN proveedor TYPE proveedor_canal USING 'cloud_api'::proveedor_canal;
    ALTER TABLE canales_whatsapp ALTER COLUMN proveedor SET DEFAULT 'cloud_api';
    DROP TYPE proveedor_canal_old;
  END IF;
END $$;

-- Un phone_number_id de Meta solo puede estar activo en una organización.
CREATE UNIQUE INDEX IF NOT EXISTS canales_whatsapp_phone_number_id_activo_uq
  ON canales_whatsapp ((config->>'phoneNumberId'))
  WHERE activo AND config->>'phoneNumberId' IS NOT NULL;

CREATE OR REPLACE FUNCTION resolve_org_by_phone(p_phone text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM canales_whatsapp
    WHERE activo AND proveedor = 'cloud_api'
      AND (config->>'phoneNumberId' = p_phone OR instancia = p_phone)
    ORDER BY id DESC LIMIT 1
$$;

-- Módulos configurables, campos personalizados y citas. Idempotente para producción.
CREATE TABLE IF NOT EXISTS modulos_org (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  clave TEXT NOT NULL, activo BOOLEAN NOT NULL DEFAULT false, config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (org_id, clave)
);
CREATE INDEX IF NOT EXISTS modulos_org_org_idx ON modulos_org(org_id);

INSERT INTO modulos_org (org_id, clave, activo, config)
SELECT org_id, 'clientes', activo, config
FROM modulos_org
WHERE clave = 'pacientes'
ON CONFLICT (org_id, clave) DO UPDATE
SET activo = EXCLUDED.activo,
    config = EXCLUDED.config,
    updated_at = now();
DELETE FROM modulos_org WHERE clave = 'pacientes';

DO $$
BEGIN
  CREATE TYPE entidad_campo_personalizado AS ENUM ('contacto', 'oportunidad');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE tipo_campo_personalizado AS ENUM (
    'texto',
    'numero',
    'fecha',
    'opcion',
    'si_no'
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE estado_cita AS ENUM (
    'programada',
    'confirmada',
    'completada',
    'cancelada',
    'no_asistio'
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;
ALTER TYPE estado_cita ADD VALUE IF NOT EXISTS 'en_sala';
CREATE TABLE IF NOT EXISTS campos_personalizados (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  entidad entidad_campo_personalizado NOT NULL, clave TEXT NOT NULL, etiqueta TEXT NOT NULL,
  tipo tipo_campo_personalizado NOT NULL, opciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  obligatorio BOOLEAN NOT NULL DEFAULT false, orden INTEGER NOT NULL DEFAULT 0, activo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (org_id, entidad, clave)
);
CREATE INDEX IF NOT EXISTS campos_personalizados_org_entidad_orden_idx ON campos_personalizados(org_id, entidad, orden);
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS campos JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS campos JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS citas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  contacto_id BIGINT NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  conversacion_id BIGINT REFERENCES conversaciones(id) ON DELETE SET NULL,
  responsable_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  inicio TIMESTAMPTZ NOT NULL, fin TIMESTAMPTZ NOT NULL, titulo TEXT NOT NULL, notas TEXT,
  estado estado_cita NOT NULL DEFAULT 'programada', recordatorio_enviado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS citas_org_inicio_idx ON citas(org_id, inicio);

CREATE TABLE IF NOT EXISTS doctores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  nombre TEXT NOT NULL,
  especialidad TEXT,
  cedula TEXT,
  color TEXT NOT NULL DEFAULT '#0EA5E9',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, nombre)
);
CREATE INDEX IF NOT EXISTS doctores_org_activo_idx ON doctores(org_id, activo);

ALTER TABLE citas ADD COLUMN IF NOT EXISTS doctor_id BIGINT REFERENCES doctores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS citas_doctor_id_idx ON citas(doctor_id);

CREATE TABLE IF NOT EXISTS expedientes_paciente (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  contacto_id BIGINT NOT NULL UNIQUE REFERENCES contactos(id) ON DELETE CASCADE,
  fecha_nacimiento DATE,
  sexo TEXT,
  alergias TEXT,
  antecedentes TEXT,
  medicamentos TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expedientes_paciente_org_idx ON expedientes_paciente(org_id);

CREATE TABLE IF NOT EXISTS evoluciones_clinicas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  expediente_id BIGINT NOT NULL REFERENCES expedientes_paciente(id) ON DELETE CASCADE,
  cita_id BIGINT REFERENCES citas(id) ON DELETE SET NULL,
  doctor_id BIGINT REFERENCES doctores(id) ON DELETE SET NULL,
  registrado_por_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  contenido TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evoluciones_expediente_created_idx
  ON evoluciones_clinicas(expediente_id, created_at);
CREATE INDEX IF NOT EXISTS evoluciones_clinicas_org_idx ON evoluciones_clinicas(org_id);

DO $$
BEGIN
  CREATE TYPE estado_vehiculo AS ENUM (
    'disponible',
    'reservado',
    'vendido',
    'taller'
  );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

CREATE TABLE IF NOT EXISTS vehiculos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  numero_stock TEXT,
  vin TEXT,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  anio INTEGER NOT NULL,
  version TEXT,
  color TEXT,
  kilometraje INTEGER NOT NULL DEFAULT 0,
  precio NUMERIC(12, 2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  estado estado_vehiculo NOT NULL DEFAULT 'disponible',
  foto_url TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, numero_stock),
  UNIQUE (org_id, vin)
);
CREATE INDEX IF NOT EXISTS vehiculos_org_estado_idx ON vehiculos(org_id, estado);
CREATE INDEX IF NOT EXISTS vehiculos_org_marca_modelo_idx ON vehiculos(org_id, marca, modelo);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'modulos_org',
    'campos_personalizados',
    'citas',
    'doctores',
    'expedientes_paciente',
    'evoluciones_clinicas',
    'vehiculos'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      $policy$
        CREATE POLICY org_isolation ON %I
        USING (
          org_id = NULLIF(current_setting('app.current_org', true), '')::bigint
        )
        WITH CHECK (
          org_id = NULLIF(current_setting('app.current_org', true), '')::bigint
        )
      $policy$,
      t
    );
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  modulos_org,
  campos_personalizados,
  citas,
  doctores,
  expedientes_paciente,
  evoluciones_clinicas,
  vehiculos
TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;
