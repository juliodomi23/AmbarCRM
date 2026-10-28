-- Actualizaciones idempotentes para bases nuevas y existentes.
-- Este archivo se ejecuta con el usuario dueÃ±o en cada deploy.

ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_nombre TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_logo TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_color_primario TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_color_acento TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_preset TEXT;

-- Motivo legible cuando Meta rechaza un mensaje (se muestra en el chat).
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS error_detalle TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puesto TEXT NOT NULL DEFAULT 'Agente';

-- Retirar proveedores antiguos sin alterar los canales actuales.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'proveedor_canal' AND e.enumlabel NOT IN ('cloud_api', 'messenger', 'api', 'instagram')
  ) THEN
    UPDATE canales_whatsapp
    SET activo = false, estado = 'desconectado'
    WHERE proveedor::text NOT IN ('cloud_api', 'messenger', 'api', 'instagram');

    ALTER TYPE proveedor_canal RENAME TO proveedor_canal_old;
    CREATE TYPE proveedor_canal AS ENUM ('cloud_api', 'messenger', 'api', 'instagram');
    ALTER TABLE canales_whatsapp ALTER COLUMN proveedor DROP DEFAULT;
    ALTER TABLE canales_whatsapp
      ALTER COLUMN proveedor TYPE proveedor_canal USING
        (CASE WHEN proveedor::text IN ('cloud_api', 'messenger', 'api', 'instagram') THEN proveedor::text ELSE 'cloud_api' END)::proveedor_canal;
    ALTER TABLE canales_whatsapp ALTER COLUMN proveedor SET DEFAULT 'cloud_api';
    DROP TYPE proveedor_canal_old;
  END IF;
END $$;

ALTER TYPE proveedor_canal ADD VALUE IF NOT EXISTS 'messenger';
ALTER TYPE proveedor_canal ADD VALUE IF NOT EXISTS 'api';
ALTER TYPE proveedor_canal ADD VALUE IF NOT EXISTS 'instagram';

ALTER TABLE contactos ADD COLUMN IF NOT EXISTS canal_id BIGINT REFERENCES canales_whatsapp(id) ON DELETE SET NULL;
ALTER TABLE contactos ADD COLUMN IF NOT EXISTS identificador_externo TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'contactos'::regclass AND conname = 'contactos_canal_id_fkey') THEN
    ALTER TABLE contactos ADD CONSTRAINT contactos_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES canales_whatsapp(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS contactos_canal_identificador_uq
  ON contactos(canal_id, identificador_externo) WHERE identificador_externo IS NOT NULL;

ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS canal_id BIGINT REFERENCES canales_whatsapp(id) ON DELETE SET NULL;
UPDATE mensajes m SET canal_id = c.canal_id FROM conversaciones c
  WHERE c.id = m.conversacion_id AND m.canal_id IS DISTINCT FROM c.canal_id;
ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_wa_message_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS mensajes_canal_id_wa_message_id_key ON mensajes(canal_id, wa_message_id);

CREATE OR REPLACE FUNCTION mensaje_fijar_canal() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT canal_id INTO NEW.canal_id FROM conversaciones WHERE id = NEW.conversacion_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mensaje_fijar_canal ON mensajes;
CREATE TRIGGER trg_mensaje_fijar_canal BEFORE INSERT OR UPDATE OF conversacion_id, canal_id
  ON mensajes FOR EACH ROW EXECUTE FUNCTION mensaje_fijar_canal();

ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS ultimo_entrante_at TIMESTAMPTZ;
UPDATE conversaciones c SET ultimo_entrante_at = m.ultimo
  FROM (SELECT conversacion_id, max(timestamp) AS ultimo FROM mensajes WHERE direccion = 'entrante' AND NOT interna GROUP BY conversacion_id) m
  WHERE c.id = m.conversacion_id AND (c.ultimo_entrante_at IS NULL OR c.ultimo_entrante_at < m.ultimo);

CREATE UNIQUE INDEX IF NOT EXISTS canales_messenger_page_activa_uq
  ON canales_whatsapp ((config->>'pageId')) WHERE activo AND proveedor = 'messenger' AND config->>'pageId' IS NOT NULL;

CREATE OR REPLACE FUNCTION resolve_org_by_page(p_page text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM canales_whatsapp WHERE activo AND proveedor::text = 'messenger' AND config->>'pageId' = p_page
    ORDER BY id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION resolve_org_by_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_org_by_page(text) TO crm_app;

-- Un phone_number_id de Meta solo puede estar activo en una organizaciÃ³n.
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

-- MÃ³dulos configurables, campos personalizados y citas. Idempotente para producciÃ³n.
CREATE TABLE IF NOT EXISTS modulos_org (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  clave TEXT NOT NULL, activo BOOLEAN NOT NULL DEFAULT false, config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (org_id, clave)
);
CREATE INDEX IF NOT EXISTS modulos_org_org_idx ON modulos_org(org_id);

UPDATE modulos_org
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{puestosPermitidos}',
  CASE
    WHEN clave IN ('contratos', 'cobros', 'panel_ar') THEN
      '["Administrador"]'::jsonb
    WHEN clave = 'pacientes' THEN
      '["Administrador", "Doctor", "Coordinador clÃ­nico"]'::jsonb
    WHEN clave IN ('legal', 'asesorias_legales', 'finanzas_legales', 'operacion_legal') THEN
      '["Administrador", "Abogado", "Coordinador jurÃ­dico", "Pasante"]'::jsonb
    ELSE '[]'::jsonb
  END,
  true
)
WHERE NOT (COALESCE(config, '{}'::jsonb) ? 'puestosPermitidos');

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

CREATE TABLE IF NOT EXISTS propiedades (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  clave TEXT,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  operacion TEXT NOT NULL,
  direccion TEXT,
  colonia TEXT,
  ciudad TEXT NOT NULL,
  recamaras INTEGER NOT NULL DEFAULT 0,
  banos NUMERIC(4, 1) NOT NULL DEFAULT 0,
  superficie NUMERIC(10, 2) NOT NULL DEFAULT 0,
  precio NUMERIC(14, 2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  estado TEXT NOT NULL DEFAULT 'disponible',
  foto_url TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, clave)
);
CREATE INDEX IF NOT EXISTS propiedades_org_estado_idx ON propiedades(org_id, estado);
CREATE INDEX IF NOT EXISTS propiedades_org_ciudad_tipo_idx
  ON propiedades(org_id, ciudad, tipo);

CREATE TABLE IF NOT EXISTS productos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  sku TEXT,
  codigo_barras TEXT,
  nombre TEXT NOT NULL,
  categoria TEXT,
  descripcion TEXT,
  precio NUMERIC(12, 2) NOT NULL DEFAULT 0,
  costo NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock NUMERIC(12, 3) NOT NULL DEFAULT 0,
  stock_minimo NUMERIC(12, 3) NOT NULL DEFAULT 0,
  unidad TEXT NOT NULL DEFAULT 'pieza',
  vende_por_peso BOOLEAN NOT NULL DEFAULT false,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  foto_url TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, sku),
  UNIQUE (org_id, codigo_barras),
  CHECK (stock >= 0),
  CHECK (stock_minimo >= 0),
  CHECK (precio >= 0),
  CHECK (costo >= 0)
);
CREATE INDEX IF NOT EXISTS productos_org_activo_nombre_idx
  ON productos(org_id, activo, nombre);
CREATE INDEX IF NOT EXISTS productos_org_categoria_idx
  ON productos(org_id, categoria);

CREATE TABLE IF NOT EXISTS ventas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  folio TEXT NOT NULL,
  contacto_id BIGINT REFERENCES contactos(id) ON DELETE SET NULL,
  creado_por_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  canal TEXT NOT NULL DEFAULT 'mostrador',
  metodo_pago TEXT,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  descuento NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  notas TEXT,
  stock_aplicado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, folio),
  CHECK (subtotal >= 0),
  CHECK (descuento >= 0),
  CHECK (total >= 0)
);
CREATE INDEX IF NOT EXISTS ventas_org_estado_created_idx
  ON ventas(org_id, estado, created_at);
CREATE INDEX IF NOT EXISTS ventas_contacto_id_idx ON ventas(contacto_id);

CREATE TABLE IF NOT EXISTS venta_partidas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  venta_id BIGINT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12, 3) NOT NULL,
  precio_unitario NUMERIC(12, 2) NOT NULL,
  total NUMERIC(12, 2) NOT NULL,
  CHECK (cantidad > 0),
  CHECK (precio_unitario >= 0),
  CHECK (total >= 0)
);
CREATE INDEX IF NOT EXISTS venta_partidas_venta_id_idx ON venta_partidas(venta_id);
CREATE INDEX IF NOT EXISTS venta_partidas_producto_id_idx ON venta_partidas(producto_id);
CREATE INDEX IF NOT EXISTS venta_partidas_org_idx ON venta_partidas(org_id);

CREATE TABLE IF NOT EXISTS proveedores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  nombre TEXT NOT NULL,
  contacto_nombre TEXT,
  telefono TEXT,
  email TEXT,
  rfc TEXT,
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, nombre)
);
CREATE INDEX IF NOT EXISTS proveedores_org_activo_idx
  ON proveedores(org_id, activo);

CREATE TABLE IF NOT EXISTS compras (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  folio TEXT NOT NULL,
  proveedor_id BIGINT NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  creado_por_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'ordenada',
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  notas TEXT,
  stock_aplicado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, folio),
  CHECK (total >= 0)
);
CREATE INDEX IF NOT EXISTS compras_org_estado_created_idx
  ON compras(org_id, estado, created_at);
CREATE INDEX IF NOT EXISTS compras_proveedor_id_idx ON compras(proveedor_id);

CREATE TABLE IF NOT EXISTS compra_partidas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  compra_id BIGINT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12, 3) NOT NULL,
  costo_unitario NUMERIC(12, 2) NOT NULL,
  total NUMERIC(12, 2) NOT NULL,
  CHECK (cantidad > 0),
  CHECK (costo_unitario >= 0),
  CHECK (total >= 0)
);
CREATE INDEX IF NOT EXISTS compra_partidas_compra_id_idx ON compra_partidas(compra_id);
CREATE INDEX IF NOT EXISTS compra_partidas_producto_id_idx ON compra_partidas(producto_id);
CREATE INDEX IF NOT EXISTS compra_partidas_org_idx ON compra_partidas(org_id);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  venta_id BIGINT REFERENCES ventas(id) ON DELETE SET NULL,
  compra_id BIGINT REFERENCES compras(id) ON DELETE SET NULL,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  cantidad NUMERIC(12, 3) NOT NULL,
  existencia_antes NUMERIC(12, 3) NOT NULL,
  existencia_despues NUMERIC(12, 3) NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cantidad <> 0),
  CHECK (existencia_antes >= 0),
  CHECK (existencia_despues >= 0)
);
ALTER TABLE movimientos_inventario
  ADD COLUMN IF NOT EXISTS compra_id BIGINT REFERENCES compras(id) ON DELETE SET NULL;

-- Cantidades de retail: piezas enteras o hasta tres decimales para venta por peso.
-- El bloque comprueba el tipo para poder aplicar este archivo repetidamente tanto en
-- instalaciones nuevas como sobre las columnas INTEGER ya existentes.
DO $$
DECLARE
  columna RECORD;
BEGIN
  FOR columna IN
    SELECT * FROM (VALUES
      ('productos', 'stock'),
      ('productos', 'stock_minimo'),
      ('venta_partidas', 'cantidad'),
      ('compra_partidas', 'cantidad'),
      ('movimientos_inventario', 'cantidad'),
      ('movimientos_inventario', 'existencia_antes'),
      ('movimientos_inventario', 'existencia_despues')
    ) AS columnas(tabla, nombre)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = columna.tabla
        AND column_name = columna.nombre
        AND (
          data_type <> 'numeric'
          OR numeric_precision IS DISTINCT FROM 12
          OR numeric_scale IS DISTINCT FROM 3
        )
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE numeric(12,3) USING %I::numeric',
        columna.tabla,
        columna.nombre,
        columna.nombre
      );
    END IF;
  END LOOP;
END $$;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad TEXT NOT NULL DEFAULT 'pieza';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS vende_por_peso BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS movimientos_producto_created_idx
  ON movimientos_inventario(producto_id, created_at);
CREATE INDEX IF NOT EXISTS movimientos_venta_id_idx
  ON movimientos_inventario(venta_id);
CREATE INDEX IF NOT EXISTS movimientos_compra_id_idx
  ON movimientos_inventario(compra_id);
CREATE INDEX IF NOT EXISTS movimientos_inventario_org_idx
  ON movimientos_inventario(org_id);

CREATE TABLE IF NOT EXISTS sucursales_legales (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  nombre TEXT NOT NULL,
  direccion TEXT,
  telefono TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, nombre)
);
CREATE INDEX IF NOT EXISTS sucursales_legales_org_activa_idx
  ON sucursales_legales(org_id, activa);

CREATE TABLE IF NOT EXISTS expedientes_legales (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  numero_interno TEXT,
  numero_judicial TEXT,
  contacto_id BIGINT REFERENCES contactos(id) ON DELETE SET NULL,
  responsable_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  sucursal_id BIGINT REFERENCES sucursales_legales(id) ON DELETE SET NULL,
  rol_cliente TEXT,
  materia TEXT,
  tipo_juicio TEXT,
  juzgado TEXT,
  etapa_procesal TEXT,
  estado TEXT NOT NULL DEFAULT 'activo',
  cuantia NUMERIC(14, 2),
  resumen TEXT,
  fecha_inicio DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expedientes_legales_org_estado_updated_idx
  ON expedientes_legales(org_id, estado, updated_at);
CREATE INDEX IF NOT EXISTS expedientes_legales_contacto_id_idx
  ON expedientes_legales(contacto_id);
CREATE INDEX IF NOT EXISTS expedientes_legales_responsable_id_idx
  ON expedientes_legales(responsable_id);
CREATE INDEX IF NOT EXISTS expedientes_legales_sucursal_id_idx
  ON expedientes_legales(sucursal_id);

CREATE TABLE IF NOT EXISTS registros_expediente_legal (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  expediente_id BIGINT NOT NULL REFERENCES expedientes_legales(id) ON DELETE CASCADE,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  estado TEXT,
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  monto NUMERIC(14, 2),
  archivo_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registros_expediente_fecha_idx
  ON registros_expediente_legal(expediente_id, fecha_inicio);
CREATE INDEX IF NOT EXISTS registros_expediente_legal_org_tipo_idx
  ON registros_expediente_legal(org_id, tipo);

CREATE TABLE IF NOT EXISTS asesorias_legales (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  contacto_id BIGINT REFERENCES contactos(id) ON DELETE SET NULL,
  expediente_id BIGINT REFERENCES expedientes_legales(id) ON DELETE SET NULL,
  sucursal_id BIGINT REFERENCES sucursales_legales(id) ON DELETE SET NULL,
  abogado_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha DATE,
  tema TEXT,
  resumen TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  monto NUMERIC(14, 2),
  seguimiento TEXT,
  origen TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asesorias_legales_org_estado_fecha_idx
  ON asesorias_legales(org_id, estado, fecha);
CREATE INDEX IF NOT EXISTS asesorias_legales_contacto_id_idx
  ON asesorias_legales(contacto_id);
CREATE INDEX IF NOT EXISTS asesorias_legales_expediente_id_idx
  ON asesorias_legales(expediente_id);

CREATE TABLE IF NOT EXISTS movimientos_legales (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  expediente_id BIGINT REFERENCES expedientes_legales(id) ON DELETE SET NULL,
  contacto_id BIGINT REFERENCES contactos(id) ON DELETE SET NULL,
  sucursal_id BIGINT REFERENCES sucursales_legales(id) ON DELETE SET NULL,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  concepto TEXT NOT NULL,
  monto NUMERIC(14, 2) NOT NULL DEFAULT 0,
  estado TEXT,
  fecha DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movimientos_legales_org_tipo_fecha_idx
  ON movimientos_legales(org_id, tipo, fecha);
CREATE INDEX IF NOT EXISTS movimientos_legales_expediente_id_idx
  ON movimientos_legales(expediente_id);

CREATE TABLE IF NOT EXISTS registros_operacion_legal (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  sucursal_id BIGINT REFERENCES sucursales_legales(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  fecha TIMESTAMPTZ,
  estado TEXT,
  descripcion TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registros_operacion_org_tipo_fecha_idx
  ON registros_operacion_legal(org_id, tipo, fecha);
CREATE INDEX IF NOT EXISTS registros_operacion_usuario_id_idx
  ON registros_operacion_legal(usuario_id);

CREATE TABLE IF NOT EXISTS tours (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  clave TEXT,
  nombre TEXT NOT NULL,
  destino TEXT NOT NULL,
  pais TEXT,
  tipo TEXT NOT NULL DEFAULT 'tour',
  duracion_dias INTEGER NOT NULL DEFAULT 1,
  fecha_salida TIMESTAMPTZ,
  fecha_regreso TIMESTAMPTZ,
  capacidad INTEGER NOT NULL DEFAULT 1,
  precio NUMERIC(14, 2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  punto_encuentro TEXT,
  incluye TEXT,
  no_incluye TEXT,
  estado TEXT NOT NULL DEFAULT 'publicado',
  imagen_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, clave)
);
CREATE INDEX IF NOT EXISTS tours_org_estado_salida_idx
  ON tours(org_id, estado, fecha_salida);

CREATE TABLE IF NOT EXISTS itinerarios_tour (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  tour_id BIGINT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  dia INTEGER NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  titulo TEXT NOT NULL,
  descripcion TEXT
);
CREATE INDEX IF NOT EXISTS itinerarios_tour_dia_idx
  ON itinerarios_tour(tour_id, dia, orden);
CREATE INDEX IF NOT EXISTS itinerarios_tour_org_idx
  ON itinerarios_tour(org_id);

CREATE TABLE IF NOT EXISTS reservas_tour (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  codigo TEXT NOT NULL,
  tour_id BIGINT NOT NULL REFERENCES tours(id),
  contacto_id BIGINT NOT NULL REFERENCES contactos(id),
  viajeros INTEGER NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'solicitada',
  total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  saldo NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fecha_salida TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, codigo)
);
CREATE INDEX IF NOT EXISTS reservas_tour_org_estado_salida_idx
  ON reservas_tour(org_id, estado, fecha_salida);
CREATE INDEX IF NOT EXISTS reservas_tour_tour_idx ON reservas_tour(tour_id);
CREATE INDEX IF NOT EXISTS reservas_tour_contacto_idx ON reservas_tour(contacto_id);

CREATE TABLE IF NOT EXISTS pagos_tour (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  reserva_id BIGINT NOT NULL REFERENCES reservas_tour(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  monto NUMERIC(14, 2) NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  metodo TEXT,
  referencia TEXT,
  estado TEXT NOT NULL DEFAULT 'aplicado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pagos_tour_org_fecha_idx ON pagos_tour(org_id, fecha);
CREATE INDEX IF NOT EXISTS pagos_tour_reserva_idx ON pagos_tour(reserva_id);

CREATE TABLE IF NOT EXISTS alumnos_academia (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  contacto_id BIGINT NOT NULL UNIQUE REFERENCES contactos(id) ON DELETE CASCADE,
  matricula TEXT,
  fecha_nacimiento DATE,
  tutor_nombre TEXT,
  tutor_telefono TEXT,
  nivel TEXT,
  estado TEXT NOT NULL DEFAULT 'activo',
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, matricula)
);
CREATE INDEX IF NOT EXISTS alumnos_academia_org_estado_idx
  ON alumnos_academia(org_id, estado);

CREATE TABLE IF NOT EXISTS cursos_academia (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  clave TEXT,
  nombre TEXT NOT NULL,
  categoria TEXT,
  modalidad TEXT NOT NULL DEFAULT 'presencial',
  profesor TEXT,
  horario TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  capacidad INTEGER NOT NULL DEFAULT 1,
  mensualidad NUMERIC(14, 2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'abierto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, clave)
);
CREATE INDEX IF NOT EXISTS cursos_academia_org_estado_idx
  ON cursos_academia(org_id, estado);

CREATE TABLE IF NOT EXISTS inscripciones_academia (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  alumno_id BIGINT NOT NULL REFERENCES alumnos_academia(id) ON DELETE CASCADE,
  curso_id BIGINT NOT NULL REFERENCES cursos_academia(id),
  fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_baja DATE,
  estado TEXT NOT NULL DEFAULT 'activa',
  descuento NUMERIC(5, 2) NOT NULL DEFAULT 0,
  avance INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alumno_id, curso_id)
);
CREATE INDEX IF NOT EXISTS inscripciones_academia_org_estado_idx
  ON inscripciones_academia(org_id, estado);
CREATE INDEX IF NOT EXISTS inscripciones_academia_curso_idx
  ON inscripciones_academia(curso_id);

CREATE TABLE IF NOT EXISTS colegiaturas_academia (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  alumno_id BIGINT NOT NULL REFERENCES alumnos_academia(id) ON DELETE CASCADE,
  inscripcion_id BIGINT REFERENCES inscripciones_academia(id) ON DELETE SET NULL,
  concepto TEXT NOT NULL,
  periodo TEXT,
  monto NUMERIC(14, 2) NOT NULL,
  vencimiento DATE NOT NULL,
  pagado_en TIMESTAMPTZ,
  metodo TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS colegiaturas_org_estado_vencimiento_idx
  ON colegiaturas_academia(org_id, estado, vencimiento);
CREATE INDEX IF NOT EXISTS colegiaturas_alumno_idx
  ON colegiaturas_academia(alumno_id);

CREATE TABLE IF NOT EXISTS asistencias_academia (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL
    DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint
    REFERENCES orgs(id),
  alumno_id BIGINT NOT NULL REFERENCES alumnos_academia(id) ON DELETE CASCADE,
  curso_id BIGINT NOT NULL REFERENCES cursos_academia(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'presente',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alumno_id, curso_id, fecha)
);
CREATE INDEX IF NOT EXISTS asistencias_org_fecha_estado_idx
  ON asistencias_academia(org_id, fecha, estado);
CREATE INDEX IF NOT EXISTS asistencias_curso_idx
  ON asistencias_academia(curso_id);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'modulos_org',
    'campos_personalizados',
    'citas',
    'doctores',
    'expedientes_paciente',
    'evoluciones_clinicas',
    'vehiculos',
    'propiedades',
    'productos',
    'ventas',
    'venta_partidas',
    'proveedores',
    'compras',
    'compra_partidas',
    'movimientos_inventario',
    'sucursales_legales',
    'expedientes_legales',
    'registros_expediente_legal',
    'asesorias_legales',
    'movimientos_legales',
    'registros_operacion_legal',
    'tours',
    'itinerarios_tour',
    'reservas_tour',
    'pagos_tour',
    'alumnos_academia',
    'cursos_academia',
    'inscripciones_academia',
    'colegiaturas_academia',
    'asistencias_academia'
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
  vehiculos,
  propiedades,
  productos,
  ventas,
  venta_partidas,
  proveedores,
  compras,
  compra_partidas,
  movimientos_inventario,
  sucursales_legales,
  expedientes_legales,
  registros_expediente_legal,
  asesorias_legales,
  movimientos_legales,
  registros_operacion_legal,
  tours,
  itinerarios_tour,
  reservas_tour,
  pagos_tour,
  alumnos_academia,
  cursos_academia,
  inscripciones_academia,
  colegiaturas_academia,
  asistencias_academia
TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- multi-tenant.sql crea la organizaciÃ³n plataforma con id explÃ­cito. Sin sincronizar
-- la secuencia, el primer tenant creado despuÃ©s puede intentar reutilizar ese id.
-- Nunca baja la secuencia: si se borrÃ³ una org con id mayor, su id no se reutiliza.
SELECT setval(
  pg_get_serial_sequence('orgs', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM orgs), 0), (SELECT last_value FROM orgs_id_seq), 1),
  true
);

-- Lealtad (Aurum): el webhook de Aurum llega sin sesiÃ³n; esta funciÃ³n solo enruta el
-- slug del negocio de Aurum a la empresa que lo conectÃ³ (como resolve_org_by_phone).
CREATE OR REPLACE FUNCTION resolve_org_by_aurum_slug(p_slug text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM modulos_org
    WHERE clave = 'lealtad' AND config->'aurum'->>'slug' = p_slug
    ORDER BY id LIMIT 1
$$;

-- /api/media verifica que los archivos antiguos (sin prefijo de empresa) pertenezcan a un
-- mensaje de la empresa que los pide; este Ã­ndice evita recorrer toda la tabla.
CREATE INDEX IF NOT EXISTS mensajes_media_url_idx ON mensajes(media_url) WHERE media_url IS NOT NULL;

-- BÃºsqueda de contactos sin acentos (Â«monicaÂ» encuentra Â«MÃ³nicaÂ»). ExtensiÃ³n confiable
-- desde Postgres 13: la crea el dueÃ±o de la base en db-migrate.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Reservas en lÃ­nea (motor de Cita en Click): servicios, horarios por especialista y
-- excepciones. Las horas se guardan como minutos desde la medianoche (9:30 = 570) en la
-- zona del negocio. La doble reserva se evita bloqueando al especialista (FOR UPDATE),
-- no con EXCLUDE: un EXCLUDE sobre citas ya existentes podrÃ­a hacer fallar la migraciÃ³n.
CREATE TABLE IF NOT EXISTS servicios_reserva (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  duracion_min INT NOT NULL CHECK (duracion_min > 0),
  buffer_min INT NOT NULL DEFAULT 0 CHECK (buffer_min >= 0),
  precio NUMERIC(12,2) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, nombre)
);
CREATE TABLE IF NOT EXISTS servicio_reserva_doctores (
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  servicio_id BIGINT NOT NULL REFERENCES servicios_reserva(id) ON DELETE CASCADE,
  doctor_id BIGINT NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
  PRIMARY KEY (servicio_id, doctor_id)
);
CREATE TABLE IF NOT EXISTS horarios_doctor (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  doctor_id BIGINT NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  inicio_min INT NOT NULL,
  fin_min INT NOT NULL,
  CHECK (inicio_min >= 0 AND inicio_min < fin_min AND fin_min <= 1440)
);
CREATE INDEX IF NOT EXISTS horarios_doctor_idx ON horarios_doctor(doctor_id, dia_semana);
CREATE TABLE IF NOT EXISTS excepciones_horario (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  doctor_id BIGINT NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  inicio_min INT,
  fin_min INT,
  motivo TEXT,
  CHECK ((inicio_min IS NULL AND fin_min IS NULL) OR (inicio_min >= 0 AND inicio_min < fin_min AND fin_min <= 1440))
);
CREATE INDEX IF NOT EXISTS excepciones_horario_idx ON excepciones_horario(doctor_id, fecha);

ALTER TABLE citas ADD COLUMN IF NOT EXISTS servicio_id BIGINT REFERENCES servicios_reserva(id) ON DELETE SET NULL;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS token_gestion TEXT;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'interna';
CREATE UNIQUE INDEX IF NOT EXISTS citas_token_gestion_uq ON citas(token_gestion) WHERE token_gestion IS NOT NULL;
CREATE INDEX IF NOT EXISTS citas_doctor_inicio_idx ON citas(doctor_id, inicio);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['servicios_reserva', 'servicio_reserva_doctores', 'horarios_doctor', 'excepciones_horario'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      $policy$
        CREATE POLICY org_isolation ON %I
        USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
        WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
      $policy$,
      t
    );
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON servicios_reserva, servicio_reserva_doctores, horarios_doctor, excepciones_horario TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- La pÃ¡gina pÃºblica de una cita (cancelar sin cuenta) llega sin sesiÃ³n: esta funciÃ³n solo
-- enruta el token del enlace a la empresa dueÃ±a de la cita.
CREATE OR REPLACE FUNCTION resolve_org_by_cita_token(p_token text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM citas WHERE token_gestion = p_token LIMIT 1
$$;

-- Caja de mostrador: turnos, movimientos, pagos desglosados e idempotencia por
-- peticiÃ³n del cliente. Los Ã­ndices parciales son la Ãºltima barrera ante dos
-- aperturas concurrentes del mismo usuario o de la misma caja.
CREATE TABLE IF NOT EXISTS cajas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  nombre TEXT NOT NULL,
  sucursal TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, nombre)
);
CREATE INDEX IF NOT EXISTS cajas_org_activa_idx ON cajas(org_id, activa);

CREATE TABLE IF NOT EXISTS turnos_caja (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  caja_id BIGINT NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  fondo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fondo_inicial >= 0),
  abierto_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_at TIMESTAMPTZ,
  efectivo_contado NUMERIC(12,2),
  efectivo_esperado NUMERIC(12,2),
  diferencia NUMERIC(12,2),
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS turnos_caja_org_estado_idx ON turnos_caja(org_id, estado);
CREATE INDEX IF NOT EXISTS turnos_caja_caja_estado_idx ON turnos_caja(caja_id, estado);
CREATE INDEX IF NOT EXISTS turnos_caja_usuario_estado_idx ON turnos_caja(usuario_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS turnos_caja_usuario_abierto_uq
  ON turnos_caja(usuario_id) WHERE estado = 'abierto';
CREATE UNIQUE INDEX IF NOT EXISTS turnos_caja_caja_abierta_uq
  ON turnos_caja(caja_id) WHERE estado = 'abierto';

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  turno_id BIGINT NOT NULL REFERENCES turnos_caja(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  motivo TEXT NOT NULL,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movimientos_caja_turno_created_idx ON movimientos_caja(turno_id, created_at);
CREATE INDEX IF NOT EXISTS movimientos_caja_org_idx ON movimientos_caja(org_id);

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS turno_id BIGINT REFERENCES turnos_caja(id) ON DELETE SET NULL;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS caja_id BIGINT REFERENCES cajas(id) ON DELETE SET NULL;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS uuid_cliente TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cambio NUMERIC(12,2) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS ventas_org_uuid_cliente_uq
  ON ventas(org_id, uuid_cliente) WHERE uuid_cliente IS NOT NULL;
CREATE INDEX IF NOT EXISTS ventas_turno_id_idx ON ventas(turno_id);
CREATE INDEX IF NOT EXISTS ventas_caja_id_idx ON ventas(caja_id);

ALTER TABLE venta_partidas ADD COLUMN IF NOT EXISTS descuento NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS pagos_venta (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  venta_id BIGINT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia')),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venta_id, metodo)
);
CREATE INDEX IF NOT EXISTS pagos_venta_org_idx ON pagos_venta(org_id);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['cajas', 'turnos_caja', 'movimientos_caja', 'pagos_venta'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)',
      t
    );
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON cajas, turnos_caja, movimientos_caja, pagos_venta TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- A2 Â· Devoluciones, apartados y crÃ©dito a clientes.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS es_credito BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS devoluciones_venta (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  venta_original_id BIGINT NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  venta_cambio_id BIGINT REFERENCES ventas(id) ON DELETE SET NULL,
  turno_id BIGINT REFERENCES turnos_caja(id) ON DELETE SET NULL,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo_reembolso TEXT NOT NULL CHECK (tipo_reembolso IN ('efectivo', 'nota_credito')),
  total NUMERIC(12,2) NOT NULL CHECK (total > 0),
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devoluciones_venta_original_idx ON devoluciones_venta(venta_original_id, created_at);
CREATE INDEX IF NOT EXISTS devoluciones_venta_org_idx ON devoluciones_venta(org_id);

CREATE TABLE IF NOT EXISTS devolucion_partidas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  devolucion_id BIGINT NOT NULL REFERENCES devoluciones_venta(id) ON DELETE CASCADE,
  venta_partida_id BIGINT NOT NULL REFERENCES venta_partidas(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  UNIQUE (devolucion_id, venta_partida_id)
);
CREATE INDEX IF NOT EXISTS devolucion_partidas_venta_idx ON devolucion_partidas(venta_partida_id);
CREATE INDEX IF NOT EXISTS devolucion_partidas_org_idx ON devolucion_partidas(org_id);

CREATE TABLE IF NOT EXISTS apartados (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  venta_id BIGINT NOT NULL UNIQUE REFERENCES ventas(id) ON DELETE RESTRICT,
  contacto_id BIGINT NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'liquidado', 'cancelado', 'vencido')),
  anticipo NUMERIC(12,2) NOT NULL CHECK (anticipo > 0),
  saldo NUMERIC(12,2) NOT NULL CHECK (saldo >= 0),
  vence_at TIMESTAMPTZ NOT NULL,
  liquidado_at TIMESTAMPTZ,
  cancelado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apartados_org_estado_vence_idx ON apartados(org_id, estado, vence_at);
CREATE INDEX IF NOT EXISTS apartados_contacto_idx ON apartados(contacto_id);

CREATE TABLE IF NOT EXISTS abonos_apartado (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  apartado_id BIGINT NOT NULL REFERENCES apartados(id) ON DELETE CASCADE,
  turno_id BIGINT REFERENCES turnos_caja(id) ON DELETE SET NULL,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia')),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS abonos_apartado_idx ON abonos_apartado(apartado_id, created_at);
CREATE INDEX IF NOT EXISTS abonos_apartado_org_idx ON abonos_apartado(org_id);

CREATE TABLE IF NOT EXISTS cuentas_cliente (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  contacto_id BIGINT NOT NULL UNIQUE REFERENCES contactos(id) ON DELETE RESTRICT,
  limite_credito NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),
  saldo NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cuentas_cliente_org_idx ON cuentas_cliente(org_id);

CREATE TABLE IF NOT EXISTS movimientos_cuenta_cliente (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  cuenta_id BIGINT NOT NULL REFERENCES cuentas_cliente(id) ON DELETE CASCADE,
  venta_id BIGINT REFERENCES ventas(id) ON DELETE SET NULL,
  turno_id BIGINT REFERENCES turnos_caja(id) ON DELETE SET NULL,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('cargo', 'abono')),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  saldo_antes NUMERIC(12,2) NOT NULL CHECK (saldo_antes >= 0),
  saldo_despues NUMERIC(12,2) NOT NULL CHECK (saldo_despues >= 0),
  referencia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movimientos_cuenta_cliente_idx ON movimientos_cuenta_cliente(cuenta_id, created_at);
CREATE INDEX IF NOT EXISTS movimientos_cuenta_org_idx ON movimientos_cuenta_cliente(org_id);

CREATE TABLE IF NOT EXISTS notas_credito_cliente (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  contacto_id BIGINT NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  devolucion_id BIGINT UNIQUE REFERENCES devoluciones_venta(id) ON DELETE RESTRICT,
  apartado_id BIGINT REFERENCES apartados(id) ON DELETE RESTRICT,
  monto_original NUMERIC(12,2) NOT NULL CHECK (monto_original > 0),
  saldo NUMERIC(12,2) NOT NULL CHECK (saldo >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((devolucion_id IS NOT NULL) <> (apartado_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS notas_credito_contacto_idx ON notas_credito_cliente(contacto_id, created_at);
CREATE INDEX IF NOT EXISTS notas_credito_org_idx ON notas_credito_cliente(org_id);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'devoluciones_venta', 'devolucion_partidas', 'apartados', 'abonos_apartado',
    'cuentas_cliente', 'movimientos_cuenta_cliente', 'notas_credito_cliente'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)',
      t
    );
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON devoluciones_venta, devolucion_partidas, apartados,
  abonos_apartado, cuentas_cliente, movimientos_cuenta_cliente, notas_credito_cliente TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- CorrecciÃ³n A2 Â· las notas de crÃ©dito pueden pagar ventas de caja.
ALTER TABLE pagos_venta DROP CONSTRAINT IF EXISTS pagos_venta_metodo_check;
ALTER TABLE pagos_venta ADD CONSTRAINT pagos_venta_metodo_check
  CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'nota_credito', 'mercado_pago', 'stripe', 'mock'));

-- B Â· Cotizaciones.
CREATE TABLE IF NOT EXISTS cotizaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  folio TEXT NOT NULL,
  contacto_id BIGINT NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  oportunidad_id BIGINT REFERENCES oportunidades(id) ON DELETE SET NULL,
  venta_id BIGINT UNIQUE REFERENCES ventas(id) ON DELETE SET NULL,
  creado_por_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida')),
  vigencia DATE NOT NULL,
  notas TEXT,
  condiciones TEXT,
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  descuento NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  impuestos NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (impuestos >= 0),
  total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  iva_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 16 CHECK (iva_porcentaje >= 0 AND iva_porcentaje <= 100),
  precios_con_iva BOOLEAN NOT NULL DEFAULT false,
  token_publico TEXT NOT NULL UNIQUE CHECK (token_publico ~ '^[0-9a-f]{32}$'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  convertir_venta BOOLEAN NOT NULL DEFAULT false,
  respondido_por TEXT,
  respondido_at TIMESTAMPTZ,
  respondido_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, folio)
);
CREATE INDEX IF NOT EXISTS cotizaciones_org_estado_created_idx ON cotizaciones(org_id, estado, created_at);
CREATE INDEX IF NOT EXISTS cotizaciones_contacto_idx ON cotizaciones(contacto_id);
CREATE INDEX IF NOT EXISTS cotizaciones_oportunidad_idx ON cotizaciones(oportunidad_id);

CREATE TABLE IF NOT EXISTS cotizacion_partidas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  cotizacion_id BIGINT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  producto_id BIGINT REFERENCES productos(id) ON DELETE SET NULL,
  concepto TEXT NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  precio NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  descuento NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  total NUMERIC(12,2) NOT NULL CHECK (total >= 0)
);
CREATE INDEX IF NOT EXISTS cotizacion_partidas_cotizacion_idx ON cotizacion_partidas(cotizacion_id);
CREATE INDEX IF NOT EXISTS cotizacion_partidas_producto_idx ON cotizacion_partidas(producto_id);
CREATE INDEX IF NOT EXISTS cotizacion_partidas_org_idx ON cotizacion_partidas(org_id);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['cotizaciones', 'cotizacion_partidas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)',
      t
    );
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON cotizaciones, cotizacion_partidas TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

CREATE OR REPLACE FUNCTION resolve_org_by_cotizacion_token(p_token text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM cotizaciones WHERE token_publico = p_token LIMIT 1
  $$;
REVOKE ALL ON FUNCTION resolve_org_by_cotizacion_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_org_by_cotizacion_token(text) TO crm_app;

-- C Â· Pedidos en lÃ­nea y catÃ¡logo pÃºblico.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS visible_en_linea BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS agotado_manual BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS etiquetas_en_linea TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS token_seguimiento TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tipo_entrega TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS direccion_entrega TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS horario_deseado TIMESTAMPTZ;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS costo_envio NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS pedido_ip TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ventas_token_seguimiento_key ON ventas(token_seguimiento);
CREATE INDEX IF NOT EXISTS ventas_pedidos_telefono_idx ON ventas(org_id, canal, created_at, contacto_id);
CREATE INDEX IF NOT EXISTS ventas_pedidos_ip_idx ON ventas(org_id, canal, created_at, pedido_ip);

CREATE TABLE IF NOT EXISTS reservas_pedido (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  venta_id BIGINT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venta_id, producto_id)
);
CREATE INDEX IF NOT EXISTS reservas_pedido_producto_idx ON reservas_pedido(org_id, producto_id, activa);
CREATE INDEX IF NOT EXISTS reservas_pedido_venta_idx ON reservas_pedido(venta_id, activa);
ALTER TABLE reservas_pedido ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON reservas_pedido;
CREATE POLICY org_isolation ON reservas_pedido
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
GRANT SELECT, INSERT, UPDATE, DELETE ON reservas_pedido TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

CREATE OR REPLACE FUNCTION resolve_org_by_pedido_token(p_token text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM ventas
    WHERE token_seguimiento = p_token AND canal = 'tienda_en_linea'
    LIMIT 1
  $$;
REVOKE ALL ON FUNCTION resolve_org_by_pedido_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_org_by_pedido_token(text) TO crm_app;

-- A3a Â· Motor Ãºnico de precios, listas, volumen y promociones.
CREATE TABLE IF NOT EXISTS listas_precios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'cliente' CHECK (tipo IN ('publico', 'cliente', 'mayoreo')),
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, nombre)
);
CREATE INDEX IF NOT EXISTS listas_precios_org_tipo_idx ON listas_precios(org_id, tipo, activa);

ALTER TABLE contactos ADD COLUMN IF NOT EXISTS lista_precio_id BIGINT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contactos_lista_precio_id_fkey') THEN
    ALTER TABLE contactos ADD CONSTRAINT contactos_lista_precio_id_fkey
      FOREIGN KEY (lista_precio_id) REFERENCES listas_precios(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS contactos_lista_precio_idx ON contactos(lista_precio_id);

CREATE TABLE IF NOT EXISTS precios_volumen (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  desde NUMERIC(12,3) NOT NULL CHECK (desde > 0),
  precio NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (producto_id, desde)
);
CREATE INDEX IF NOT EXISTS precios_volumen_org_producto_idx ON precios_volumen(org_id, producto_id, desde);

CREATE TABLE IF NOT EXISTS lista_precio_productos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  lista_id BIGINT NOT NULL REFERENCES listas_precios(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  precio NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  UNIQUE (lista_id, producto_id)
);
CREATE INDEX IF NOT EXISTS lista_precio_productos_org_producto_idx ON lista_precio_productos(org_id, producto_id);

CREATE TABLE IF NOT EXISTS promociones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('porcentaje', 'monto', 'nxm', 'precio_especial')),
  producto_id BIGINT REFERENCES productos(id) ON DELETE CASCADE,
  categoria TEXT,
  valor NUMERIC(12,2) CHECK (valor >= 0),
  cantidad_compra INTEGER CHECK (cantidad_compra > 1),
  cantidad_paga INTEGER CHECK (cantidad_paga > 0),
  inicia DATE NOT NULL,
  termina DATE NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (producto_id IS NOT NULL OR categoria IS NOT NULL),
  CHECK (termina >= inicia),
  CHECK (
    (tipo = 'nxm' AND cantidad_compra IS NOT NULL AND cantidad_paga IS NOT NULL AND cantidad_paga < cantidad_compra)
    OR (tipo <> 'nxm' AND valor IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS promociones_org_vigencia_idx ON promociones(org_id, activa, inicia, termina);
CREATE INDEX IF NOT EXISTS promociones_producto_idx ON promociones(producto_id);
CREATE INDEX IF NOT EXISTS promociones_org_categoria_idx ON promociones(org_id, categoria);

ALTER TABLE venta_partidas ADD COLUMN IF NOT EXISTS descuento_promocion NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE venta_partidas ADD COLUMN IF NOT EXISTS promocion_descripcion TEXT;
ALTER TABLE cotizacion_partidas ADD COLUMN IF NOT EXISTS descuento_promocion NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cotizacion_partidas ADD COLUMN IF NOT EXISTS promocion_descripcion TEXT;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['listas_precios', 'precios_volumen', 'lista_precio_productos', 'promociones'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)',
      t
    );
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON listas_precios, precios_volumen, lista_precio_productos, promociones TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- A3b Â· Variantes como productos independientes.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS grupo_id BIGINT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS atributos JSONB NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_grupo_id_fkey') THEN
    ALTER TABLE productos ADD CONSTRAINT productos_grupo_id_fkey
      FOREIGN KEY (grupo_id) REFERENCES productos(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS productos_grupo_id_idx ON productos(grupo_id);

-- A4 Â· Costo histÃ³rico al aplicar inventario.
ALTER TABLE venta_partidas ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(12,2);

-- Bot API Â· firma HMAC hacia n8n, asesor fijo para handoff y bitÃ¡cora de acciones del bot.
ALTER TABLE bots ADD COLUMN IF NOT EXISTS signing_secret TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS asesor_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS auditoria_bot (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  bot_id BIGINT REFERENCES bots(id) ON DELETE SET NULL,
  conversacion_id BIGINT REFERENCES conversaciones(id) ON DELETE SET NULL,
  accion TEXT NOT NULL,
  entidad TEXT,
  entidad_id BIGINT,
  antes JSONB,
  despues JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auditoria_bot_org_fecha_idx ON auditoria_bot(org_id, created_at);
CREATE INDEX IF NOT EXISTS auditoria_bot_conversacion_idx ON auditoria_bot(conversacion_id);
ALTER TABLE auditoria_bot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON auditoria_bot;
CREATE POLICY org_isolation ON auditoria_bot
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
-- BitÃ¡cora de solo agregar: la app lee e inserta, nunca edita ni borra.
-- (Los DEFAULT PRIVILEGES de multi-tenant.sql dan UPDATE/DELETE a las tablas nuevas; se quitan aquÃ­.)
GRANT SELECT, INSERT ON auditoria_bot TO crm_app;
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria_bot FROM crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- Bot API Â· permisos por bot.
ALTER TABLE bots ADD COLUMN IF NOT EXISTS permisos TEXT[];
-- Los bots que ya existen conservan solo lo que sus rutas de producciÃ³n les permitÃ­an: leer la
-- conversaciÃ³n, responder, dejar notas, mover la etapa y handoff/etiquetas. Tareas, citas y
-- cotizaciones no existÃ­an en producciÃ³n y se activan despuÃ©s, por cliente.
-- Solo toca filas con permisos NULL: volver a correr el archivo no pisa lo que el admin edite.
UPDATE bots
   SET permisos = ARRAY['leer_perfil', 'enviar_mensaje', 'notas_internas', 'mover_embudo', 'handoff']
 WHERE permisos IS NULL;
-- Los bots nuevos nacen con el conjunto mÃ­nimo.
ALTER TABLE bots ALTER COLUMN permisos SET DEFAULT ARRAY['leer_perfil', 'enviar_mensaje', 'notas_internas', 'handoff'];
ALTER TABLE bots ALTER COLUMN permisos SET NOT NULL;

-- D Â· ReseÃ±as de Google.
-- resenas: calificaciÃ³n que deja el cliente en /opinion antes de saltar a Google (no se filtra por estrella).
-- solicitudes_resena: una fila por intento de pedir reseÃ±a; sirve de bitÃ¡cora y de candado de "una cada N dÃ­as".
CREATE TABLE IF NOT EXISTS resenas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  calificacion SMALLINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  origen TEXT NOT NULL DEFAULT 'directo' CHECK (origen ~ '^[a-z0-9_-]{1,40}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resenas_org_created_idx ON resenas(org_id, created_at);

CREATE TABLE IF NOT EXISTS solicitudes_resena (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  contacto_id BIGINT NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  cita_id BIGINT REFERENCES citas(id) ON DELETE SET NULL,
  venta_id BIGINT REFERENCES ventas(id) ON DELETE SET NULL,
  evento TEXT NOT NULL CHECK (evento IN ('cita', 'venta')),
  estado TEXT NOT NULL CHECK (estado IN ('reservada', 'enviada', 'fallida', 'omitida')),
  detalle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS solicitudes_resena_contacto_idx ON solicitudes_resena(org_id, contacto_id, created_at);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['resenas', 'solicitudes_resena'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)',
      t
    );
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON resenas, solicitudes_resena TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- A5 Â· Ventas sin internet (opcional por empresa: caja.config.ventasSinRed).
-- sin_red: la venta llegÃ³ por la cola local. vendida_at: instante real (reloj de la caja); created_at = vendida_at.
-- revision_motivos: precio_distinto | tardia | inventario_negativo. turno_original_id: turno de origen cuando
-- la venta entrÃ³ al turno abierto actual porque el original ya estaba cerrado antes de la venta.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS sin_red BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS vendida_at TIMESTAMPTZ;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS subida_at TIMESTAMPTZ;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS turno_original_id BIGINT REFERENCES turnos_caja(id) ON DELETE SET NULL;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS revision_motivos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS diferencia_precio NUMERIC(12,2);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS catalogo_version TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS revision_resuelta_at TIMESTAMPTZ;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS revision_resuelta_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ventas_revision_idx ON ventas(org_id, created_at)
  WHERE sin_red AND revision_resuelta_at IS NULL AND cardinality(revision_motivos) > 0;
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS sin_red BOOLEAN NOT NULL DEFAULT false;

-- Ventas sin internet que el servidor rechazÃ³ (4xx definitivo): la caja las marca con error y aquÃ­ queda el
-- registro completo para que el Encargado decida. UNIQUE por uuid: reenviar no duplica el rechazo.
CREATE TABLE IF NOT EXISTS cola_caja_rechazos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  uuid_cliente TEXT NOT NULL,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  turno_id BIGINT REFERENCES turnos_caja(id) ON DELETE SET NULL,
  codigo TEXT,
  motivo TEXT NOT NULL,
  payload JSONB NOT NULL,
  vendida_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelta_at TIMESTAMPTZ,
  resuelta_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE (org_id, uuid_cliente)
);
CREATE INDEX IF NOT EXISTS cola_caja_rechazos_pendientes_idx ON cola_caja_rechazos(org_id, created_at) WHERE resuelta_at IS NULL;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['cola_caja_rechazos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)',
      t
    );
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON cola_caja_rechazos TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- A5 Â· Las ventas sin internet (cola local) pueden dejar la existencia en negativo a propÃ³sito;
-- queda marcada (ventas.revision_motivos, movimientos_inventario.sin_red) y se corrige con una
-- entrada de inventario. Por eso estas tres columnas ya no exigen >= 0. stock_minimo sÃ­.
-- (Las ventas de caja normal y los pedidos en lÃ­nea siguen rechazando la sobreventa en cÃ³digo.)
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_stock_check;
ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS movimientos_inventario_existencia_antes_check,
  DROP CONSTRAINT IF EXISTS movimientos_inventario_existencia_despues_check;

-- Etiquetas unificadas en el contacto: el chat ya lee y escribe contacto_etiquetas (las mismas de
-- Contactos, DifusiÃ³n y el bot). Las que estaban solo en conversaciones.etiquetas pasan al contacto.
INSERT INTO contacto_etiquetas (org_id, contacto_id, etiqueta_id)
SELECT DISTINCT c.org_id, c.contacto_id, e.id
  FROM conversaciones c
 CROSS JOIN LATERAL unnest(c.etiquetas) AS t(nombre)
  JOIN etiquetas e ON e.org_id = c.org_id AND e.nombre = t.nombre
ON CONFLICT DO NOTHING;

-- Ãmbar Rojo Â· contratos y cobros. NULL representa un dato pendiente de confirmar.
CREATE TABLE IF NOT EXISTS contratos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  contacto_id BIGINT NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  oportunidad_id BIGINT REFERENCES oportunidades(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('bot_whatsapp','bot_facebook','agente_odoo','web','seo','panel','otro')),
  estado TEXT CHECK (estado IN ('en_desarrollo','en_pruebas','produccion','pausado','baja','incobrable')),
  monto_cierre NUMERIC(12,2) CHECK (monto_cierre >= 0),
  anticipo_pct NUMERIC(5,2) DEFAULT 50 CHECK (anticipo_pct BETWEEN 0 AND 100),
  mensualidad NUMERIC(12,2) CHECK (mensualidad >= 0),
  dia_cobro INTEGER CHECK (dia_cobro BETWEEN 1 AND 28),
  inicio_mensualidad DATE, fecha_baja DATE, notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contratos_org_estado_idx ON contratos(org_id, estado);
CREATE INDEX IF NOT EXISTS contratos_contacto_idx ON contratos(contacto_id);
CREATE TABLE IF NOT EXISTS cobros (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  contrato_id BIGINT NOT NULL REFERENCES contratos(id) ON DELETE RESTRICT,
  concepto TEXT NOT NULL CHECK (concepto IN ('anticipo','balance','mensualidad','extra')),
  periodo DATE, monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0), vence DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado','vencido','incobrable','cancelado')),
  pagado_en TIMESTAMPTZ,
  metodo TEXT CHECK (metodo IN ('transferencia','tarjeta','efectivo','mercado_pago')),
  referencia TEXT, nota TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((concepto = 'mensualidad' AND periodo IS NOT NULL AND EXTRACT(DAY FROM periodo) = 1)
    OR (concepto <> 'mensualidad' AND periodo IS NULL)),
  UNIQUE (contrato_id, concepto, periodo)
);
-- Un UNIQUE normal permite varios NULL: los cargos de cierre necesitan este Ã­ndice parcial.
CREATE UNIQUE INDEX IF NOT EXISTS cobros_cierre_unico ON cobros(contrato_id, concepto)
  WHERE concepto IN ('anticipo','balance');
CREATE INDEX IF NOT EXISTS cobros_org_estado_vence_idx ON cobros(org_id, estado, vence);
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['contratos', 'cobros'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format('CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON contratos, cobros TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- Abonos en el mismo cargo: conservar el monto original, el saldo y cada recibo.
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS pagos JSONB NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='cobros'::regclass AND conname='cobros_abonos_validos') THEN
    ALTER TABLE cobros ADD CONSTRAINT cobros_abonos_validos CHECK
      (monto_pagado BETWEEN 0 AND monto AND jsonb_typeof(pagos)='array');
  END IF;
END $$;

-- Infraestructura de la plataforma: sin credenciales del VPS ni tokens en claro.
CREATE TABLE IF NOT EXISTS servidores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  nombre TEXT NOT NULL, proveedor TEXT NOT NULL, ip TEXT NOT NULL, propietario TEXT NOT NULL,
  lo_pagamos BOOLEAN NOT NULL DEFAULT true,
  costo_anual_mxn NUMERIC(12,2) CHECK (costo_anual_mxn >= 0), vence DATE,
  activo BOOLEAN NOT NULL DEFAULT true, ram_total_mb INTEGER CHECK (ram_total_mb >= 0),
  notas TEXT, cargas_libres TEXT,
  heartbeat_token_hash TEXT NOT NULL UNIQUE CHECK (heartbeat_token_hash ~ '^[a-f0-9]{64}$'),
  ultimo_reporte TIMESTAMPTZ,
  UNIQUE (org_id, nombre), UNIQUE (id, org_id)
);
CREATE TABLE IF NOT EXISTS heartbeats_servidor (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  servidor_id BIGINT NOT NULL, fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  ram_pct DOUBLE PRECISION NOT NULL CHECK (ram_pct BETWEEN 0 AND 100),
  cpu_pct DOUBLE PRECISION NOT NULL CHECK (cpu_pct BETWEEN 0 AND 100),
  disco_pct DOUBLE PRECISION NOT NULL CHECK (disco_pct BETWEEN 0 AND 100),
  ram_total_mb INTEGER NOT NULL CHECK (ram_total_mb >= 0),
  uptime_horas DOUBLE PRECISION NOT NULL CHECK (uptime_horas >= 0 AND uptime_horas < 'Infinity'::float8),
  FOREIGN KEY (servidor_id, org_id) REFERENCES servidores(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS heartbeats_servidor_org_fecha_idx ON heartbeats_servidor(org_id, servidor_id, fecha);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS servidor_id BIGINT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='contratos'::regclass AND conname='contratos_servidor_org_fk') THEN
    ALTER TABLE contratos ADD CONSTRAINT contratos_servidor_org_fk FOREIGN KEY (servidor_id, org_id) REFERENCES servidores(id, org_id) ON DELETE RESTRICT;
  END IF;
END $$;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['servidores','heartbeats_servidor'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format('CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON servidores, heartbeats_servidor TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- Resuelve Ãºnicamente la identidad; la lectura/escritura posterior sigue bajo RLS.
CREATE OR REPLACE FUNCTION resolve_servidor_by_heartbeat_hash(token_hash TEXT)
RETURNS TABLE(org_id BIGINT, servidor_id BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT s.org_id, s.id FROM public.servidores s JOIN public.orgs o ON o.id=s.org_id
  WHERE s.heartbeat_token_hash=token_hash AND s.activo AND o.activo AND s.org_id=1
$$;
REVOKE ALL ON FUNCTION resolve_servidor_by_heartbeat_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_servidor_by_heartbeat_hash(TEXT) TO crm_app;

CREATE TABLE IF NOT EXISTS messenger_login (
  id TEXT PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  user_id BIGINT NOT NULL, session_hash TEXT NOT NULL, state_hash TEXT NOT NULL,
  canal_id BIGINT, paginas_encrypted TEXT, vence_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE messenger_login ADD COLUMN IF NOT EXISTS proveedor TEXT NOT NULL DEFAULT 'messenger';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'messenger_login'::regclass AND conname = 'messenger_login_proveedor_check') THEN
    ALTER TABLE messenger_login ADD CONSTRAINT messenger_login_proveedor_check CHECK (proveedor IN ('messenger', 'instagram'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS messenger_login_org_vence_idx ON messenger_login(org_id, vence_at);
ALTER TABLE messenger_login ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON messenger_login;
CREATE POLICY org_isolation ON messenger_login
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
GRANT SELECT, INSERT, UPDATE, DELETE ON messenger_login TO crm_app;

CREATE TABLE IF NOT EXISTS webhook_saliente (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  url TEXT NOT NULL, secreto TEXT NOT NULL, eventos TEXT[] NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true, creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_estado TEXT, ultimo_error TEXT, fallos_seguidos INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS webhook_saliente_org_idx ON webhook_saliente(org_id);
ALTER TABLE webhook_saliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON webhook_saliente;
CREATE POLICY org_isolation ON webhook_saliente
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_saliente TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

CREATE TABLE IF NOT EXISTS regla_automatizacion (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  nombre TEXT NOT NULL, evento TEXT NOT NULL,
  condiciones JSONB NOT NULL DEFAULT '[]'::jsonb, acciones JSONB NOT NULL DEFAULT '[]'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT true, creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS regla_automatizacion_org_evento_idx ON regla_automatizacion(org_id, evento);
CREATE TABLE IF NOT EXISTS ejecucion_regla (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  regla_id BIGINT NOT NULL, conversacion_id BIGINT NOT NULL,
  resultado TEXT NOT NULL, detalle TEXT NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ejecucion_regla_org_conv_fecha_idx ON ejecucion_regla(org_id, conversacion_id, creado_en);
CREATE INDEX IF NOT EXISTS ejecucion_regla_org_regla_fecha_idx ON ejecucion_regla(org_id, regla_id, creado_en);
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['regla_automatizacion', 'ejecucion_regla'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format('CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON regla_automatizacion, ejecucion_regla TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

CREATE UNIQUE INDEX IF NOT EXISTS canales_instagram_cuenta_activa_uq
  ON canales_whatsapp ((config->>'instagramId'))
  WHERE activo AND proveedor = 'instagram' AND config->>'instagramId' IS NOT NULL;

CREATE OR REPLACE FUNCTION resolve_org_by_instagram(p_cuenta text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM canales_whatsapp
    WHERE activo AND proveedor::text = 'instagram' AND config->>'instagramId' = p_cuenta
    ORDER BY id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION resolve_org_by_instagram(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_org_by_instagram(text) TO crm_app;

-- Devuelve solo proveedores, sin exponer empresas ni credenciales entre tenants.
CREATE OR REPLACE FUNCTION meta_page_other_channels(p_page text, p_app text, p_global_app text, p_exclude bigint)
  RETURNS text[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
    SELECT COALESCE(array_agg(DISTINCT proveedor::text), ARRAY[]::text[])
    FROM canales_whatsapp
    WHERE activo AND proveedor::text IN ('messenger', 'instagram')
      AND config->>'pageId' = p_page
      AND COALESCE(config->>'login', '') <> 'instagram'
      AND (p_exclude IS NULL OR id <> p_exclude)
      AND (p_app = '' OR COALESCE(config->>'appId', p_global_app) IN (p_app, ''))
$$;
REVOKE ALL ON FUNCTION meta_page_other_channels(text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION meta_page_other_channels(text, text, text, bigint) TO crm_app;
-- Reintentos acotados de recordatorios; heredan RLS y GRANT de citas.
ALTER TABLE citas ADD COLUMN IF NOT EXISTS recordatorio_intentos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS recordatorio_intentado_at TIMESTAMPTZ;

-- La restricciÃ³n permanece aunque se elimine el especialista: nunca abre toda la agenda.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS agenda_solo_propia BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS agenda_doctor_id BIGINT REFERENCES doctores(id) ON DELETE SET NULL;

-- RecuperaciÃ³n de contraseÃ±a: el token original nunca se persiste.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_cambiada_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_id_org_id_key ON usuarios(id, org_id);

CREATE TABLE IF NOT EXISTS restablecimientos_password (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  usuario_id BIGINT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  vence_at TIMESTAMPTZ NOT NULL,
  usado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (usuario_id, org_id) REFERENCES usuarios(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS restablecimientos_password_usuario_id_idx ON restablecimientos_password(usuario_id);
ALTER TABLE restablecimientos_password ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON restablecimientos_password;
CREATE POLICY org_isolation ON restablecimientos_password
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
GRANT SELECT, INSERT, UPDATE, DELETE ON restablecimientos_password TO crm_app;
GRANT USAGE, SELECT ON SEQUENCE restablecimientos_password_id_seq TO crm_app;

CREATE OR REPLACE FUNCTION resolve_org_by_password_hash(p_hash text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT r.org_id FROM restablecimientos_password r
    JOIN orgs o ON o.id = r.org_id AND o.activo
    WHERE r.token_hash = p_hash AND r.usado_at IS NULL AND r.vence_at > now()
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_org_by_password_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_org_by_password_hash(text) TO crm_app;

-- Fase 3: planificaciÃ³n interna. La aprobaciÃ³n no publica ni envÃ­a anuncios.
CREATE TABLE IF NOT EXISTS campanas_marketing (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('marketing', 'meta_ads')),
  nombre TEXT NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
  objetivo TEXT NOT NULL CHECK (objetivo IN ('mensajes', 'clientes_potenciales', 'ventas', 'reconocimiento')),
  canal TEXT NOT NULL,
  audiencia TEXT NOT NULL DEFAULT '' CHECK (length(audiencia) <= 2000),
  contenido TEXT NOT NULL DEFAULT '' CHECK (length(contenido) <= 10000),
  fecha_inicio DATE, fecha_fin DATE,
  presupuesto NUMERIC(12,2) CHECK (presupuesto >= 0),
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'en_revision', 'aprobada', 'archivada')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  aprobada_por_id BIGINT, aprobada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((tipo = 'meta_ads' AND canal = 'facebook_instagram') OR (tipo = 'marketing' AND canal IN ('whatsapp', 'instagram', 'facebook', 'otro'))),
  CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CHECK ((aprobada_por_id IS NULL) = (aprobada_at IS NULL)),
  CHECK (estado <> 'aprobada' OR aprobada_por_id IS NOT NULL),
  FOREIGN KEY (aprobada_por_id, org_id) REFERENCES usuarios(id, org_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS campanas_marketing_org_tipo_estado_idx ON campanas_marketing(org_id, tipo, estado);
CREATE INDEX IF NOT EXISTS campanas_marketing_org_tipo_updated_idx ON campanas_marketing(org_id, tipo, updated_at);
ALTER TABLE campanas_marketing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON campanas_marketing;
CREATE POLICY org_isolation ON campanas_marketing
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
GRANT SELECT, INSERT, UPDATE ON campanas_marketing TO crm_app;
REVOKE DELETE, TRUNCATE ON campanas_marketing FROM crm_app;
GRANT USAGE, SELECT ON SEQUENCE campanas_marketing_id_seq TO crm_app;
-- CampaÃ±as de envÃ­o para EXI. La bandera del mÃ³dulo se activa por separado desde el panel.
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS tarifa_marketing_usd NUMERIC(8,4) NOT NULL DEFAULT 0.04;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS campanas_envio_activas BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS campanas_envio_cambiado_por BIGINT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS campanas_envio_cambiado_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS campanas_envio (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  nombre TEXT NOT NULL,
  canal_id BIGINT NOT NULL REFERENCES canales_whatsapp(id) ON DELETE RESTRICT,
  plantilla_nombre TEXT NOT NULL,
  plantilla_idioma TEXT NOT NULL,
  plantilla_estado TEXT,
  plantilla_consultada_at TIMESTAMPTZ,
  mapeo_variables JSONB NOT NULL DEFAULT '[]',
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','programada','en_curso','pausada','completada','cancelada')),
  fallos_consulta_meta INTEGER NOT NULL DEFAULT 0,
  motivo_pausa TEXT,
  dias_semana INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  hora_inicio TEXT NOT NULL DEFAULT '09:30',
  hora_fin TEXT NOT NULL DEFAULT '17:30',
  zona_horaria TEXT NOT NULL DEFAULT 'America/Mexico_City',
  tanda_tamano INTEGER NOT NULL DEFAULT 5 CHECK (tanda_tamano BETWEEN 1 AND 20),
  pausa_tanda_min INTEGER NOT NULL DEFAULT 10 CHECK (pausa_tanda_min >= 5),
  tope_diario INTEGER NOT NULL DEFAULT 50 CHECK (tope_diario BETWEEN 1 AND 150),
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_tanda_at TIMESTAMPTZ,
  creado_por BIGINT,
  confirmo_permiso BOOLEAN NOT NULL DEFAULT false,
  permiso_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE campanas_envio ADD COLUMN IF NOT EXISTS fallos_consulta_meta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campanas_envio ADD COLUMN IF NOT EXISTS plantilla_estado TEXT;
ALTER TABLE campanas_envio ADD COLUMN IF NOT EXISTS plantilla_consultada_at TIMESTAMPTZ;
ALTER TABLE campanas_envio ADD COLUMN IF NOT EXISTS lista_aceptada_por_area JSONB;
ALTER TABLE campanas_envio ADD COLUMN IF NOT EXISTS lista_aceptada_por BIGINT;
ALTER TABLE campanas_envio ADD COLUMN IF NOT EXISTS lista_aceptada_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS campanas_envio_org_estado_idx ON campanas_envio(org_id, estado);
CREATE INDEX IF NOT EXISTS campanas_envio_canal_estado_idx ON campanas_envio(canal_id, estado);

CREATE TABLE IF NOT EXISTS campanas_destinatarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  campana_id BIGINT NOT NULL REFERENCES campanas_envio(id) ON DELETE CASCADE,
  contacto_id BIGINT NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  telefono TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviando','enviado','entregado','leido','respondio','fallido','omitido')),
  motivo TEXT,
  wa_message_id TEXT,
  enviado_at TIMESTAMPTZ,
  error_codigo INTEGER,
  reintentos INTEGER NOT NULL DEFAULT 0,
  reintentar_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campana_id, contacto_id)
);
CREATE INDEX IF NOT EXISTS campanas_destinatarios_campana_estado_idx ON campanas_destinatarios(campana_id, estado);
CREATE INDEX IF NOT EXISTS campanas_destinatarios_wa_idx ON campanas_destinatarios(wa_message_id);
CREATE INDEX IF NOT EXISTS campanas_destinatarios_org_enviado_idx ON campanas_destinatarios(org_id, enviado_at);

ALTER TABLE campanas_envio ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanas_destinatarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON campanas_envio;
CREATE POLICY org_isolation ON campanas_envio
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
DROP POLICY IF EXISTS org_isolation ON campanas_destinatarios;
CREATE POLICY org_isolation ON campanas_destinatarios
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
GRANT SELECT, INSERT, UPDATE, DELETE ON campanas_envio, campanas_destinatarios TO crm_app;
GRANT USAGE, SELECT ON SEQUENCE campanas_envio_id_seq, campanas_destinatarios_id_seq TO crm_app;

-- Lectura cronolÃ³gica de conversaciones y mensajes para la API del bot.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversaciones' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE conversaciones ADD COLUMN updated_at TIMESTAMPTZ;
    UPDATE conversaciones SET updated_at = COALESCE(ultimo_mensaje_at, created_at);
    ALTER TABLE conversaciones ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE conversaciones ALTER COLUMN updated_at SET NOT NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS conversaciones_org_updated_at_id_idx ON conversaciones(org_id, updated_at, id);
CREATE INDEX IF NOT EXISTS conversaciones_org_estado_updated_at_id_idx ON conversaciones(org_id, estado, updated_at, id);
CREATE INDEX IF NOT EXISTS conversaciones_org_created_at_id_idx ON conversaciones(org_id, created_at, id);
CREATE INDEX IF NOT EXISTS mensajes_conversacion_id_created_at_id_idx ON mensajes(conversacion_id, created_at, id);

CREATE TABLE IF NOT EXISTS dispositivos_push (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_fcm TEXT NOT NULL UNIQUE,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('ios', 'android')),
  ultima_vez TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispositivos_push_org_idx ON dispositivos_push(org_id);
CREATE INDEX IF NOT EXISTS dispositivos_push_usuario_idx ON dispositivos_push(usuario_id);
ALTER TABLE dispositivos_push ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON dispositivos_push;
CREATE POLICY org_isolation ON dispositivos_push
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint);
GRANT SELECT, INSERT, UPDATE, DELETE ON dispositivos_push TO crm_app;
GRANT USAGE, SELECT ON SEQUENCE dispositivos_push_id_seq TO crm_app;

CREATE OR REPLACE FUNCTION registrar_dispositivo_push(p_usuario_id BIGINT, p_token_fcm TEXT, p_plataforma TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tenant BIGINT := NULLIF(current_setting('app.current_org', true), '')::bigint;
BEGIN
  IF tenant IS NULL OR p_plataforma NOT IN ('ios', 'android')
    OR NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_usuario_id AND org_id = tenant AND activo) THEN
    RAISE EXCEPTION 'registro de dispositivo no autorizado';
  END IF;
  INSERT INTO dispositivos_push (org_id, usuario_id, token_fcm, plataforma)
  VALUES (tenant, p_usuario_id, p_token_fcm, p_plataforma)
  ON CONFLICT (token_fcm) DO UPDATE SET org_id = EXCLUDED.org_id,
    usuario_id = EXCLUDED.usuario_id, plataforma = EXCLUDED.plataforma, ultima_vez = now();
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION registrar_dispositivo_push(BIGINT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_dispositivo_push(BIGINT, TEXT, TEXT) TO crm_app;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Pagos en lÃ­nea (Fase P0-1). Nacen multi-tenant; este bloque es idempotente.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE pagos_venta DROP CONSTRAINT IF EXISTS pagos_venta_metodo_check;
ALTER TABLE pagos_venta ADD CONSTRAINT pagos_venta_metodo_check
  CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'nota_credito', 'mercado_pago', 'stripe', 'mock'));

CREATE TABLE IF NOT EXISTS pagos_online (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  origen_tipo TEXT NOT NULL CHECK (origen_tipo IN ('venta','cita','cotizacion','pedido')),
  origen_id BIGINT NOT NULL,
  proveedor TEXT NOT NULL CHECK (proveedor IN ('mercado_pago','stripe','mock')),
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
ALTER TABLE pagos_online DROP CONSTRAINT IF EXISTS pagos_online_proveedor_check;
ALTER TABLE pagos_online ADD CONSTRAINT pagos_online_proveedor_check CHECK (proveedor IN ('mercado_pago','stripe','mock'));

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
ALTER TABLE credenciales_pago ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE credenciales_pago ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE credenciales_pago DROP CONSTRAINT IF EXISTS credenciales_pago_proveedor_check;
ALTER TABLE credenciales_pago ADD CONSTRAINT credenciales_pago_proveedor_check CHECK (proveedor IN ('mercado_pago','stripe','mock'));
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

-- ============================================================================
-- CFDI 4.0 (Fase 2A). Nace multi-tenant; este bloque es idempotente.
-- No guarda CSD, llaves privadas ni credenciales del PAC.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS contactos_id_org_uq ON contactos(id, org_id);
CREATE UNIQUE INDEX IF NOT EXISTS ventas_id_org_uq ON ventas(id, org_id);

CREATE TABLE IF NOT EXISTS datos_fiscales (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  contacto_id BIGINT NOT NULL,
  rfc TEXT NOT NULL,
  razon_social TEXT NOT NULL,
  regimen_fiscal TEXT NOT NULL,
  codigo_postal TEXT NOT NULL,
  uso_cfdi TEXT NOT NULL DEFAULT 'G03',
  correo TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, contacto_id),
  UNIQUE (id, org_id)
);
ALTER TABLE datos_fiscales DROP CONSTRAINT IF EXISTS datos_fiscales_contacto_id_fkey;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'datos_fiscales_contacto_org_fkey') THEN
    ALTER TABLE datos_fiscales ADD CONSTRAINT datos_fiscales_contacto_org_fkey
      FOREIGN KEY (contacto_id, org_id) REFERENCES contactos(id, org_id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS datos_fiscales_org_rfc_idx ON datos_fiscales(org_id, rfc);

CREATE TABLE IF NOT EXISTS datos_emisor (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  rfc TEXT NOT NULL,
  razon_social TEXT NOT NULL,
  regimen_fiscal TEXT NOT NULL,
  codigo_postal TEXT NOT NULL,
  serie TEXT NOT NULL DEFAULT 'A',
  folio_siguiente INTEGER NOT NULL DEFAULT 1,
  ambiente TEXT NOT NULL DEFAULT 'sandbox',
  proveedor TEXT NOT NULL DEFAULT 'mock' CHECK (proveedor IN ('mock','facturama','sw_sapien')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id),
  UNIQUE (id, org_id)
);
CREATE INDEX IF NOT EXISTS datos_emisor_org_idx ON datos_emisor(org_id);

CREATE TABLE IF NOT EXISTS facturas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  venta_id BIGINT,
  pago_id BIGINT,
  contacto_id BIGINT,
  proveedor TEXT NOT NULL DEFAULT 'mock' CHECK (proveedor IN ('mock','facturama','sw_sapien')),
  serie TEXT,
  folio TEXT,
  uuid TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','timbrando','timbrada','cancelada','error')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos NUMERIC(12,2) NOT NULL DEFAULT 0,
  retenciones NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'MXN',
  forma_pago TEXT NOT NULL DEFAULT '99',
  metodo_pago TEXT NOT NULL DEFAULT 'PUE',
  uso_cfdi TEXT NOT NULL DEFAULT 'G03',
  xml_url TEXT,
  pdf_url TEXT,
  xml TEXT,
  pdf BYTEA,
  error TEXT,
  idempotency_key TEXT NOT NULL,
  timbrando_at TIMESTAMPTZ,
  timbrada_at TIMESTAMPTZ,
  cancelada_at TIMESTAMPTZ,
  receptor_rfc TEXT,
  receptor_razon_social TEXT,
  receptor_regimen_fiscal TEXT,
  receptor_codigo_postal TEXT,
  receptor_uso_cfdi TEXT,
  receptor_correo TEXT,
  emisor_rfc TEXT,
  emisor_razon_social TEXT,
  emisor_regimen_fiscal TEXT,
  emisor_codigo_postal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key),
  UNIQUE (org_id, uuid),
  UNIQUE (id, org_id)
);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS xml TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS pdf BYTEA;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS timbrando_at TIMESTAMPTZ;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS receptor_rfc TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS receptor_razon_social TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS receptor_regimen_fiscal TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS receptor_codigo_postal TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS receptor_uso_cfdi TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS receptor_correo TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS emisor_rfc TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS emisor_razon_social TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS emisor_regimen_fiscal TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS emisor_codigo_postal TEXT;
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_estado_check;
ALTER TABLE facturas ADD CONSTRAINT facturas_estado_check
  CHECK (estado IN ('borrador','timbrando','timbrada','cancelada','error'));
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_venta_id_fkey;
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_pago_id_fkey;
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_contacto_id_fkey;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facturas_venta_org_fkey') THEN
    ALTER TABLE facturas ADD CONSTRAINT facturas_venta_org_fkey
      FOREIGN KEY (venta_id, org_id) REFERENCES ventas(id, org_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facturas_pago_org_fkey') THEN
    ALTER TABLE facturas ADD CONSTRAINT facturas_pago_org_fkey
      FOREIGN KEY (pago_id, org_id) REFERENCES pagos_online(id, org_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facturas_contacto_org_fkey') THEN
    ALTER TABLE facturas ADD CONSTRAINT facturas_contacto_org_fkey
      FOREIGN KEY (contacto_id, org_id) REFERENCES contactos(id, org_id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS facturas_org_estado_created_idx ON facturas(org_id, estado, created_at);
CREATE INDEX IF NOT EXISTS facturas_org_venta_idx ON facturas(org_id, venta_id);
CREATE INDEX IF NOT EXISTS facturas_org_pago_idx ON facturas(org_id, pago_id);
CREATE INDEX IF NOT EXISTS facturas_org_contacto_idx ON facturas(org_id, contacto_id);
CREATE UNIQUE INDEX IF NOT EXISTS facturas_un_timbrada_venta_idx
  ON facturas(org_id, venta_id) WHERE estado = 'timbrada' AND venta_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS facturas_un_timbrada_pago_idx
  ON facturas(org_id, pago_id) WHERE estado = 'timbrada' AND pago_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS facturas_org_serie_folio_uq
  ON facturas(org_id, serie, folio)
  WHERE estado IN ('timbrada','cancelada') AND serie IS NOT NULL AND folio IS NOT NULL;

UPDATE facturas f
SET receptor_rfc = df.rfc,
    receptor_razon_social = df.razon_social,
    receptor_regimen_fiscal = df.regimen_fiscal,
    receptor_codigo_postal = df.codigo_postal,
    receptor_uso_cfdi = f.uso_cfdi,
    receptor_correo = df.correo
FROM datos_fiscales df
WHERE f.org_id = df.org_id
  AND f.contacto_id = df.contacto_id
  AND f.estado IN ('timbrada','cancelada')
  AND f.receptor_rfc IS NULL;

UPDATE facturas f
SET emisor_rfc = de.rfc,
    emisor_razon_social = de.razon_social,
    emisor_regimen_fiscal = de.regimen_fiscal,
    emisor_codigo_postal = de.codigo_postal
FROM datos_emisor de
WHERE f.org_id = de.org_id
  AND f.estado IN ('timbrada','cancelada')
  AND f.emisor_rfc IS NULL;

CREATE TABLE IF NOT EXISTS conceptos_factura (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  factura_id BIGINT NOT NULL,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  valor_unitario NUMERIC(12,2) NOT NULL CHECK (valor_unitario >= 0),
  importe NUMERIC(12,2) NOT NULL CHECK (importe >= 0),
  iva NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (iva >= 0),
  retenciones NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (retenciones >= 0),
  iva_tasa NUMERIC(7,6) NOT NULL DEFAULT 0.160000,
  retencion_tasa NUMERIC(7,6) NOT NULL DEFAULT 0.000000,
  clave_prod_serv TEXT,
  clave_unidad TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, org_id)
);
ALTER TABLE conceptos_factura ADD COLUMN IF NOT EXISTS iva_tasa NUMERIC(7,6) NOT NULL DEFAULT 0.160000;
ALTER TABLE conceptos_factura ADD COLUMN IF NOT EXISTS iva_exento BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conceptos_factura ADD COLUMN IF NOT EXISTS retencion_tasa NUMERIC(7,6) NOT NULL DEFAULT 0.000000;
UPDATE conceptos_factura
SET iva_tasa = CASE WHEN iva > 0 THEN 0.160000 ELSE 0 END
WHERE iva_tasa IN (0, 0.160000);
UPDATE conceptos_factura
SET retencion_tasa = 0
WHERE retenciones = 0;
ALTER TABLE conceptos_factura DROP CONSTRAINT IF EXISTS conceptos_factura_factura_id_fkey;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conceptos_factura_factura_org_fkey') THEN
    ALTER TABLE conceptos_factura ADD CONSTRAINT conceptos_factura_factura_org_fkey
      FOREIGN KEY (factura_id, org_id) REFERENCES facturas(id, org_id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS conceptos_factura_org_factura_idx ON conceptos_factura(org_id, factura_id);

CREATE TABLE IF NOT EXISTS eventos_factura (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  factura_id BIGINT NOT NULL,
  evento_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  procesado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, evento_id)
);
ALTER TABLE eventos_factura DROP CONSTRAINT IF EXISTS eventos_factura_factura_id_fkey;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_factura_factura_org_fkey') THEN
    ALTER TABLE eventos_factura ADD CONSTRAINT eventos_factura_factura_org_fkey
      FOREIGN KEY (factura_id, org_id) REFERENCES facturas(id, org_id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS eventos_factura_org_factura_created_idx ON eventos_factura(org_id, factura_id, created_at);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['datos_fiscales','datos_emisor','facturas','conceptos_factura','eventos_factura'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY org_isolation ON %I
      USING      (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
      WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
    $p$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON datos_fiscales, datos_emisor, facturas, conceptos_factura, eventos_factura TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

DROP INDEX IF EXISTS facturas_un_activa_venta_idx;
DROP INDEX IF EXISTS facturas_un_activa_pago_idx;
CREATE UNIQUE INDEX IF NOT EXISTS facturas_un_activa_venta_idx
  ON facturas(org_id, venta_id) WHERE estado IN ('borrador','timbrando','timbrada') AND venta_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS facturas_un_activa_pago_idx
  ON facturas(org_id, pago_id) WHERE estado IN ('borrador','timbrando','timbrada') AND pago_id IS NOT NULL;

-- Google Calendar bidireccional (Fase 3). Idempotente y aislado por organización.
CREATE UNIQUE INDEX IF NOT EXISTS citas_id_org_uq ON citas(id, org_id);
CREATE TABLE IF NOT EXISTS calendarios_conectados (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  proveedor TEXT NOT NULL DEFAULT 'google' CHECK (proveedor IN ('google','mock')),
  usuario_crm_id BIGINT,
  cuenta_google TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expira_at TIMESTAMPTZ,
  sync_token TEXT,
  sincronizado_at TIMESTAMPTZ,
  sincronizando_at TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','requiere_reconectar','revocada')),
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  ultimo_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, calendar_id), UNIQUE(id, org_id)
);
ALTER TABLE calendarios_conectados ADD COLUMN IF NOT EXISTS usuario_crm_id BIGINT;
-- Las conexiones previas pertenecían a la organización; asignarlas al admin conserva
-- sus tokens y mapeos y permite que la organización las administre desde su cuenta.
UPDATE calendarios_conectados c SET usuario_crm_id = (
  SELECT u.id FROM usuarios u WHERE u.org_id = c.org_id AND u.rol = 'admin' ORDER BY u.id LIMIT 1
) WHERE c.usuario_crm_id IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM calendarios_conectados WHERE usuario_crm_id IS NULL) THEN
    RAISE EXCEPTION 'No se puede migrar Calendar: hay conexiones sin usuario admin en su organización';
  END IF;
END $$;
ALTER TABLE calendarios_conectados ALTER COLUMN usuario_crm_id SET NOT NULL;
ALTER TABLE calendarios_conectados DROP CONSTRAINT IF EXISTS calendarios_conectados_org_id_calendar_id_key;
DROP INDEX IF EXISTS calendarios_conectados_org_calendar_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS calendarios_conectados_org_usuario_uq ON calendarios_conectados(org_id, usuario_crm_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendarios_conectados_usuario_org_fkey') THEN
    ALTER TABLE calendarios_conectados ADD CONSTRAINT calendarios_conectados_usuario_org_fkey
      FOREIGN KEY(usuario_crm_id, org_id) REFERENCES usuarios(id, org_id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS calendarios_conectados_org_estado_idx ON calendarios_conectados(org_id, estado);
CREATE TABLE IF NOT EXISTS eventos_calendario (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id) ON DELETE CASCADE,
  cita_id BIGINT,
  calendario_id BIGINT NOT NULL,
  evento_externo TEXT NOT NULL,
  etag TEXT,
  estado TEXT NOT NULL DEFAULT 'creado' CHECK (estado IN ('creado','actualizado','cancelado','eliminado','desvinculado','conflicto','pendiente','error')),
  ultimo_sync TIMESTAMPTZ,
  detalle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, calendario_id, evento_externo),
  FOREIGN KEY(cita_id, org_id) REFERENCES citas(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY(calendario_id, org_id) REFERENCES calendarios_conectados(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eventos_calendario_org_cita_idx ON eventos_calendario(org_id, cita_id);
CREATE INDEX IF NOT EXISTS eventos_calendario_org_estado_updated_idx ON eventos_calendario(org_id, estado, updated_at);
ALTER TABLE eventos_calendario DROP CONSTRAINT IF EXISTS eventos_calendario_estado_check;
ALTER TABLE eventos_calendario ADD CONSTRAINT eventos_calendario_estado_check
  CHECK (estado IN ('creado','actualizado','cancelado','eliminado','desvinculado','conflicto','pendiente','error'));
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['calendarios_conectados','eventos_calendario'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format('CREATE POLICY org_isolation ON %I USING (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint) WITH CHECK (org_id = NULLIF(current_setting(''app.current_org'', true), '''')::bigint)', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON calendarios_conectados,eventos_calendario TO crm_app;
GRANT USAGE, SELECT ON SEQUENCE calendarios_conectados_id_seq,eventos_calendario_id_seq TO crm_app;
-- IVA por producto: defaults conservan precios actuales (16% incluido).
ALTER TABLE productos ADD COLUMN IF NOT EXISTS iva_tasa NUMERIC(7,6) DEFAULT 0.16;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS iva_exento BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_incluye_iva BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS iva_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS iva_envio NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE venta_partidas ADD COLUMN IF NOT EXISTS iva_tasa NUMERIC(7,6);
ALTER TABLE venta_partidas ADD COLUMN IF NOT EXISTS iva_exento BOOLEAN;
ALTER TABLE venta_partidas ADD COLUMN IF NOT EXISTS iva_importe NUMERIC(12,2);
ALTER TABLE venta_partidas ADD COLUMN IF NOT EXISTS base_importe NUMERIC(12,2);
ALTER TABLE cotizacion_partidas ADD COLUMN IF NOT EXISTS iva_tasa NUMERIC(7,6);
ALTER TABLE cotizacion_partidas ADD COLUMN IF NOT EXISTS iva_exento BOOLEAN;
ALTER TABLE cotizacion_partidas ADD COLUMN IF NOT EXISTS base_importe NUMERIC(12,2);
ALTER TABLE cotizacion_partidas ADD COLUMN IF NOT EXISTS iva_importe NUMERIC(12,2);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_iva_tasa_check') THEN
    ALTER TABLE productos ADD CONSTRAINT productos_iva_tasa_check CHECK (iva_tasa IS NULL OR iva_tasa IN (0, 0.08, 0.16));
  END IF;
END $$;
UPDATE productos SET iva_tasa = 0.16 WHERE iva_tasa IS NULL;
ALTER TABLE productos ALTER COLUMN iva_tasa SET DEFAULT 0.16;
ALTER TABLE productos ALTER COLUMN iva_tasa SET NOT NULL;

-- Resolver solo el org_id de una cuenta Stripe Connect para enrutar el webhook global.
CREATE OR REPLACE FUNCTION resolve_org_by_stripe_account(p_account text)
RETURNS TABLE(org_id BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.org_id
  FROM public.credenciales_pago c
  JOIN public.orgs o ON o.id = c.org_id AND o.activo = true
  WHERE c.proveedor = 'stripe' AND c.user_id = p_account AND c.activo = true
  LIMIT 2
$$;
REVOKE ALL ON FUNCTION resolve_org_by_stripe_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_org_by_stripe_account(text) TO crm_app;
