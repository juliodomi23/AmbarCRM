-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('admin', 'agente');

-- CreateEnum
CREATE TYPE "tipo_etapa" AS ENUM ('normal', 'ganado', 'perdido');

-- CreateEnum
CREATE TYPE "estado_oport" AS ENUM ('abierto', 'ganado', 'perdido');

-- CreateEnum
CREATE TYPE "fuente_contacto" AS ENUM ('whatsapp', 'manual', 'meta_ads', 'web', 'otro');

-- CreateEnum
CREATE TYPE "estado_conv" AS ENUM ('abierta', 'pendiente', 'cerrada');

-- CreateEnum
CREATE TYPE "direccion_msg" AS ENUM ('entrante', 'saliente');

-- CreateEnum
CREATE TYPE "tipo_msg" AS ENUM ('texto', 'imagen', 'audio', 'video', 'documento', 'ubicacion', 'plantilla');

-- CreateEnum
CREATE TYPE "status_msg" AS ENUM ('pendiente', 'enviado', 'entregado', 'leido', 'fallido');

-- CreateEnum
CREATE TYPE "proveedor_canal" AS ENUM ('evolution', 'cloud_api');

-- CreateEnum
CREATE TYPE "estado_canal" AS ENUM ('conectado', 'desconectado');

-- CreateEnum
CREATE TYPE "tipo_evento" AS ENUM ('creada', 'etapa_cambio', 'ganada', 'perdida', 'nota', 'tarea', 'mensaje', 'asignacion');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "rol_usuario" NOT NULL DEFAULT 'agente',
    "avatar_url" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embudos" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "color" TEXT NOT NULL DEFAULT '#1E3A5F',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embudos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas" (
    "id" BIGSERIAL NOT NULL,
    "embudo_id" BIGINT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#94A3B8',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "tipo" "tipo_etapa" NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etapas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "empresa" TEXT,
    "avatar_url" TEXT,
    "fuente" "fuente_contacto" NOT NULL DEFAULT 'manual',
    "notas" TEXT,
    "responsable_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "es_personal" BOOLEAN NOT NULL DEFAULT false,
    "opt_out_difusion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiquetas" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#B45309',

    CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacto_etiquetas" (
    "contacto_id" BIGINT NOT NULL,
    "etiqueta_id" BIGINT NOT NULL,

    CONSTRAINT "contacto_etiquetas_pkey" PRIMARY KEY ("contacto_id","etiqueta_id")
);

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" BIGSERIAL NOT NULL,
    "contacto_id" BIGINT NOT NULL,
    "embudo_id" BIGINT NOT NULL,
    "etapa_id" BIGINT NOT NULL,
    "titulo" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "responsable_id" BIGINT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "estado" "estado_oport" NOT NULL DEFAULT 'abierto',
    "motivo_perdida" TEXT,
    "fecha_cierre_estimada" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canales_whatsapp" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "proveedor" "proveedor_canal" NOT NULL DEFAULT 'evolution',
    "telefono" TEXT,
    "instancia" TEXT,
    "estado" "estado_canal" NOT NULL DEFAULT 'desconectado',
    "config" JSONB NOT NULL DEFAULT '{}',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canales_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos" (
    "id" BIGSERIAL NOT NULL,
    "canal_id" BIGINT,
    "jid" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "no_leidos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_mensaje_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes_grupo" (
    "id" BIGSERIAL NOT NULL,
    "grupo_id" BIGINT NOT NULL,
    "direccion" "direccion_msg" NOT NULL,
    "tipo" "tipo_msg" NOT NULL DEFAULT 'texto',
    "contenido" TEXT,
    "media_url" TEXT,
    "media_mime" TEXT,
    "remitente" TEXT,
    "remitente_tel" TEXT,
    "status" "status_msg" NOT NULL DEFAULT 'enviado',
    "wa_message_id" TEXT,
    "enviado_por" BIGINT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bots" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "webhook_url" TEXT NOT NULL,
    "api_token" TEXT NOT NULL,
    "canal_id" BIGINT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversaciones" (
    "id" BIGSERIAL NOT NULL,
    "contacto_id" BIGINT NOT NULL,
    "canal_id" BIGINT,
    "estado" "estado_conv" NOT NULL DEFAULT 'abierta',
    "responsable_id" BIGINT,
    "no_leidos" INTEGER NOT NULL DEFAULT 0,
    "bot_activo" BOOLEAN NOT NULL DEFAULT true,
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "csat_score" INTEGER,
    "csat_enviado_at" TIMESTAMP(3),
    "aviso_fuera_at" TIMESTAMP(3),
    "ultimo_mensaje_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes" (
    "id" BIGSERIAL NOT NULL,
    "conversacion_id" BIGINT NOT NULL,
    "direccion" "direccion_msg" NOT NULL,
    "tipo" "tipo_msg" NOT NULL DEFAULT 'texto',
    "contenido" TEXT,
    "media_url" TEXT,
    "media_mime" TEXT,
    "interna" BOOLEAN NOT NULL DEFAULT false,
    "es_difusion" BOOLEAN NOT NULL DEFAULT false,
    "status" "status_msg" NOT NULL DEFAULT 'enviado',
    "wa_message_id" TEXT,
    "enviado_por" BIGINT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_mensaje" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "categoria" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plantillas_mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas" (
    "id" BIGSERIAL NOT NULL,
    "oportunidad_id" BIGINT NOT NULL,
    "usuario_id" BIGINT,
    "contenido" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tareas" (
    "id" BIGSERIAL NOT NULL,
    "oportunidad_id" BIGINT,
    "responsable_id" BIGINT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "vence_at" TIMESTAMP(3),
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "completada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tareas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes" (
    "id" BIGSERIAL NOT NULL,
    "auto_asignar" BOOLEAN NOT NULL DEFAULT false,
    "bienvenida_activa" BOOLEAN NOT NULL DEFAULT false,
    "bienvenida_texto" TEXT,
    "crear_lead_auto" BOOLEAN NOT NULL DEFAULT true,
    "csat_activo" BOOLEAN NOT NULL DEFAULT false,
    "csat_texto" TEXT,
    "horario_activo" BOOLEAN NOT NULL DEFAULT false,
    "horario_inicio" TEXT,
    "horario_fin" TEXT,
    "horario_dias" TEXT,
    "fuera_horario_texto" TEXT,
    "auto_resolver_activo" BOOLEAN NOT NULL DEFAULT false,
    "auto_resolver_horas" INTEGER NOT NULL DEFAULT 24,
    "nombre_negocio" TEXT,
    "ia_prompt_sistema" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajustes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos" (
    "id" BIGSERIAL NOT NULL,
    "oportunidad_id" BIGINT NOT NULL,
    "tipo" "tipo_evento" NOT NULL,
    "descripcion" TEXT,
    "usuario_id" BIGINT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "etapas_embudo_id_orden_idx" ON "etapas"("embudo_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "contactos_telefono_key" ON "contactos"("telefono");

-- CreateIndex
CREATE INDEX "contactos_responsable_id_idx" ON "contactos"("responsable_id");

-- CreateIndex
CREATE UNIQUE INDEX "etiquetas_nombre_key" ON "etiquetas"("nombre");

-- CreateIndex
CREATE INDEX "oportunidades_etapa_id_orden_idx" ON "oportunidades"("etapa_id", "orden");

-- CreateIndex
CREATE INDEX "oportunidades_embudo_id_idx" ON "oportunidades"("embudo_id");

-- CreateIndex
CREATE INDEX "oportunidades_contacto_id_idx" ON "oportunidades"("contacto_id");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_jid_key" ON "grupos"("jid");

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_grupo_wa_message_id_key" ON "mensajes_grupo"("wa_message_id");

-- CreateIndex
CREATE INDEX "mensajes_grupo_grupo_id_timestamp_idx" ON "mensajes_grupo"("grupo_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "bots_api_token_key" ON "bots"("api_token");

-- CreateIndex
CREATE INDEX "conversaciones_ultimo_mensaje_at_idx" ON "conversaciones"("ultimo_mensaje_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_contacto_id_canal_id_key" ON "conversaciones"("contacto_id", "canal_id");

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_wa_message_id_key" ON "mensajes"("wa_message_id");

-- CreateIndex
CREATE INDEX "mensajes_conversacion_id_timestamp_idx" ON "mensajes"("conversacion_id", "timestamp");

-- CreateIndex
CREATE INDEX "tareas_responsable_id_vence_at_idx" ON "tareas"("responsable_id", "vence_at");

-- CreateIndex
CREATE INDEX "eventos_oportunidad_id_created_at_idx" ON "eventos"("oportunidad_id", "created_at");

-- AddForeignKey
ALTER TABLE "etapas" ADD CONSTRAINT "etapas_embudo_id_fkey" FOREIGN KEY ("embudo_id") REFERENCES "embudos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto_etiquetas" ADD CONSTRAINT "contacto_etiquetas_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contactos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto_etiquetas" ADD CONSTRAINT "contacto_etiquetas_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contactos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_embudo_id_fkey" FOREIGN KEY ("embudo_id") REFERENCES "embudos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canales_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_grupo" ADD CONSTRAINT "mensajes_grupo_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canales_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contactos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canales_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas" ADD CONSTRAINT "notas_oportunidad_id_fkey" FOREIGN KEY ("oportunidad_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas" ADD CONSTRAINT "notas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_oportunidad_id_fkey" FOREIGN KEY ("oportunidad_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_oportunidad_id_fkey" FOREIGN KEY ("oportunidad_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

