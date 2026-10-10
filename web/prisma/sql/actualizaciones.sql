-- Actualizaciones idempotentes para bases nuevas y existentes.
-- Este archivo se ejecuta con el usuario dueño en cada deploy.

ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_nombre TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_logo TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_color_primario TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_color_acento TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_preset TEXT;

-- Motivo legible cuando Meta rechaza un mensaje (se muestra en el chat).
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS error_detalle TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puesto TEXT NOT NULL DEFAULT 'Agente';

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

UPDATE modulos_org
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{puestosPermitidos}',
  CASE
    WHEN clave = 'pacientes' THEN
      '["Administrador", "Doctor", "Coordinador clínico"]'::jsonb
    WHEN clave IN ('legal', 'asesorias_legales', 'finanzas_legales', 'operacion_legal') THEN
      '["Administrador", "Abogado", "Coordinador jurídico", "Pasante"]'::jsonb
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

-- multi-tenant.sql crea la organización plataforma con id explícito. Sin sincronizar
-- la secuencia, el primer tenant creado después puede intentar reutilizar ese id.
-- Nunca baja la secuencia: si se borró una org con id mayor, su id no se reutiliza.
SELECT setval(
  pg_get_serial_sequence('orgs', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM orgs), 0), (SELECT last_value FROM orgs_id_seq), 1),
  true
);

-- Lealtad (Aurum): el webhook de Aurum llega sin sesión; esta función solo enruta el
-- slug del negocio de Aurum a la empresa que lo conectó (como resolve_org_by_phone).
CREATE OR REPLACE FUNCTION resolve_org_by_aurum_slug(p_slug text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM modulos_org
    WHERE clave = 'lealtad' AND config->'aurum'->>'slug' = p_slug
    ORDER BY id LIMIT 1
$$;

-- /api/media verifica que los archivos antiguos (sin prefijo de empresa) pertenezcan a un
-- mensaje de la empresa que los pide; este índice evita recorrer toda la tabla.
CREATE INDEX IF NOT EXISTS mensajes_media_url_idx ON mensajes(media_url) WHERE media_url IS NOT NULL;

-- Búsqueda de contactos sin acentos («monica» encuentra «Mónica»). Extensión confiable
-- desde Postgres 13: la crea el dueño de la base en db-migrate.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Reservas en línea (motor de Cita en Click): servicios, horarios por especialista y
-- excepciones. Las horas se guardan como minutos desde la medianoche (9:30 = 570) en la
-- zona del negocio. La doble reserva se evita bloqueando al especialista (FOR UPDATE),
-- no con EXCLUDE: un EXCLUDE sobre citas ya existentes podría hacer fallar la migración.
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

-- La página pública de una cita (cancelar sin cuenta) llega sin sesión: esta función solo
-- enruta el token del enlace a la empresa dueña de la cita.
CREATE OR REPLACE FUNCTION resolve_org_by_cita_token(p_token text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM citas WHERE token_gestion = p_token LIMIT 1
$$;

-- Caja de mostrador: turnos, movimientos, pagos desglosados e idempotencia por
-- petición del cliente. Los índices parciales son la última barrera ante dos
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

-- A2 · Devoluciones, apartados y crédito a clientes.
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

-- Corrección A2 · las notas de crédito pueden pagar ventas de caja.
ALTER TABLE pagos_venta DROP CONSTRAINT IF EXISTS pagos_venta_metodo_check;
ALTER TABLE pagos_venta ADD CONSTRAINT pagos_venta_metodo_check
  CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'nota_credito'));

-- B · Cotizaciones.
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

-- D · Bots: firma HMAC hacia n8n, asesor fijo para handoff y bitácora de acciones del bot.
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
-- Bitácora de solo agregar: la app lee e inserta, nunca edita ni borra.
-- (Los DEFAULT PRIVILEGES de multi-tenant.sql dan UPDATE/DELETE a las tablas nuevas; se quitan aquí.)
GRANT SELECT, INSERT ON auditoria_bot TO crm_app;
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria_bot FROM crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- E · Permisos por bot.
ALTER TABLE bots ADD COLUMN IF NOT EXISTS permisos TEXT[];
-- Los bots que ya existen conservan lo que hacen hoy (acciones de las rutas vigentes).
-- Solo toca filas con permisos NULL: volver a correr el archivo no pisa lo que el admin edite.
UPDATE bots
   SET permisos = ARRAY['leer_perfil', 'enviar_mensaje', 'notas_internas', 'mover_embudo',
                        'crear_tarea', 'handoff', 'agendar_cita', 'cotizar']
 WHERE permisos IS NULL;
-- Los bots nuevos nacen con el conjunto mínimo.
ALTER TABLE bots ALTER COLUMN permisos SET DEFAULT ARRAY['leer_perfil', 'enviar_mensaje', 'notas_internas', 'handoff'];
ALTER TABLE bots ALTER COLUMN permisos SET NOT NULL;
