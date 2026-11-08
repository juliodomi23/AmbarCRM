# PROMPT — Módulo "Campañas de envío" (Excel/CSV + calendario) para EXI Chiapas

Rama sugerida: `campanas-envio` desde `meta-tech-provider`. No hacer merge ni deploy; no tocar la BD de producción.

## Objetivo
EXI Chiapas (org 12, `exi-chiapas`) sube su base de clientes en Excel o CSV, ve una vista previa, elige una plantilla de Meta aprobada y programa **qué días, en qué horas y a qué ritmo** se envía, para proteger la calidad del número. Quien responde entra al bot que ya existe.

## Decisiones ya tomadas (no re-discutir)
- Módulo **solo para EXI**: nueva clave en `ModuloOrg` (sigue el patrón de `MODULOS.md`), **apagada por defecto**; solo se enciende para la org 12 desde el panel admin.
- Aceptar **.csv y .xlsx**, con **vista previa antes de importar**.
- Ritmo por defecto: **tope 50 mensajes por día, tandas de 5 cada 10 min**, días L–V, ventana 09:30–17:30, zona `America/Mexico_City`. Todo configurable por campaña, con esos valores como default. Un máximo duro de **150/día** que la UI no deja pasar (el límite real de Meta para un portafolio sin verificar es 250 contactos únicos/24 h; no acercarse).
- La base son clientes antiguos de EXI (con relación previa). Aun así, casilla obligatoria de confirmación antes de lanzar: "Confirmo que estos contactos conocen a EXI y aceptaron recibir mensajes".
- Solo **plantillas Meta con estado `APPROVED`**. Nunca texto libre a quien no ha escrito antes.
- **No cambiar** `/difusion` ni `api/difusion/route.ts` (sigue como está). Reutilizar sus piezas (`getProvider`, `enviarPlantilla`, `aplicarVariables`, `optOutDifusion`, `esDifusion`), no copiarlas.

## Lo que ya existe y debes revisar antes de escribir código
- `web/src/app/api/difusion/route.ts`: envío inmediato, bucle en memoria (se pierde si la app reinicia). **No repetir ese patrón.**
- `web/src/app/api/contactos/importar/route.ts` + `lib/csv.ts`: importación CSV con upsert por teléfono.
- `web/src/app/api/cron/enviar-programados/route.ts`: patrón de cron multi-tenant (`requireApiKey`, `dbRaw` para listar orgs, `runWithOrg`). n8n lo llama cada minuto.
- `lib/channel/cloudapi.ts`: `enviarPlantilla(telefono, plantilla, variables)` y `listarPlantillas()`.
- `web/prisma/schema.prisma`: todos los modelos usan `orgId` con default de RLS. Mira cómo `MODULOS.md` y los módulos recientes agregaron tablas + políticas RLS (`prisma/sql/multi-tenant.sql`) y haz lo mismo.
- El webhook de estados de Meta (entregado/leído/fallido): encuentra dónde se actualiza `Mensaje.status` y engancha ahí la actualización del destinatario.

## Fase 1 (esto es lo que se pide)

### 1. Datos (migración + RLS)
- `CampanaEnvio`: nombre, `canalId`, plantilla (`name`, `language`), mapeo de variables, estado (`borrador | programada | en_curso | pausada | completada | cancelada`), `motivoPausa`, `diasSemana` (0–6), `horaInicio`, `horaFin`, `zonaHoraria`, `tandaTamano` (5), `pausaTandaMin` (10), `topeDiario` (50), `fechaInicio`, `creadoPor`, `confirmoPermiso` (bool + fecha), timestamps.
- `CampanaDestinatario`: `campanaId`, `contactoId`, `telefono`, `variables` (json), estado (`pendiente | enviando | enviado | entregado | leido | respondio | fallido | omitido`), `motivo`, `waMessageId`, `enviadoAt`, `errorCodigo`. Índice `(campanaId, estado)` y `(waMessageId)`. Único `(campanaId, contactoId)`.
- Registrar el último envío por campaña (`ultimaTandaAt`) para respetar la pausa entre tandas.

### 2. Importación con vista previa
- Pantalla nueva (solo visible con el módulo encendido). Subir `.csv` o `.xlsx`.
- Leer el archivo **en el navegador** y mandar filas JSON al servidor; **el servidor revalida todo** (no confiar en el cliente). Para `.xlsx` usa una librería mantenida; ojo: `xlsx@0.18.5` de npm tiene vulnerabilidades conocidas, usa SheetJS 0.20.x desde su CDN oficial o `exceljs`, y justifica la elección en una línea.
- Límites: 5 MB, máx 10,000 filas, solo primera hoja.
- Paso de **mapeo de columnas**: teléfono (obligatorio), nombre, empresa, giro, y columnas extra disponibles como variables de plantilla.
- **Vista previa**: primeras 20 filas y conteos: válidos, duplicados en el archivo, teléfono inválido, ya existentes, con `optOutDifusion` (se excluyen), contactados por otra campaña en los últimos 30 días (se omiten). Descargar las filas rechazadas con su motivo.
- Normalizar teléfonos MX a formato WhatsApp (`52…`); misma lógica que ya usa el CRM para contactos (reutilizarla).
- Al confirmar: upsert de contactos por teléfono, etiqueta por giro, y creación de destinatarios. Nada se envía todavía.

### 3. Crear y programar la campaña
- Elegir canal (solo `cloud_api` conectado), plantilla `APPROVED` (usar `listarPlantillas`), mapear variables, elegir destinatarios (todos o por giro/etiqueta).
- Configurar calendario: días, ventana horaria, tamaño de tanda, pausa entre tandas, tope diario, fecha de inicio. Validar rangos (tanda 1–20, pausa ≥ 5 min, tope ≤ 150).
- **Resumen previo al lanzamiento**: total de destinatarios, días estimados para terminar con ese ritmo, y **costo estimado** = destinatarios × tarifa de marketing configurable por org (campo en Ajustes, default US$0.04 por mensaje entregado; es estimación, Meta cobra a EXI directamente). Mostrar la casilla de confirmación de permiso.
- Botones: lanzar, pausar, reanudar, cancelar.

### 4. Motor de envío (cron)
- Nuevo `POST /api/cron/campanas-envio` con `requireApiKey` (`WA_API_KEY`), mismo patrón que `enviar-programados`. n8n lo llamará cada minuto (documentar el workflow; **no crearlo ni activarlo**).
- Por cada org activa y campaña `en_curso`: si hoy es día permitido y la hora local (zona de la campaña) cae en la ventana, y pasó `pausaTandaMin` desde `ultimaTandaAt`, y no se alcanzó el `topeDiario` (contar envíos del día calendario **en la zona de la campaña**, sumando todas las campañas del canal), entonces tomar hasta `tandaTamano` destinatarios `pendiente` **con `FOR UPDATE SKIP LOCKED`** y marcarlos `enviando` en la misma transacción (dos ejecuciones simultáneas no deben duplicar).
- Enviar con pausa aleatoria de 1.2–3 s entre mensajes. Registrar `Mensaje` (`esDifusion: true`, tipo plantilla) y conversación igual que `/difusion`. Aplicar la etiqueta "Campaña: <nombre>" al contacto para que el bot y los asesores sepan de dónde viene.
- El estado vive en la BD: si la app reinicia, la siguiente ejecución retoma. Destinatarios que queden en `enviando` más de 10 min vuelven a `pendiente`.
- **Clasificación de errores de Meta:**
  - 131050 (el usuario pidió no recibir marketing): `omitido` + `optOutDifusion = true`, sin reintento.
  - 131049 (límite de marketing por usuario): `omitido`, un único reintento a las 24 h como mínimo.
  - 131026 (número no entregable) o número inválido: `fallido`, sin reintento.
  - 131042 (problema de pago en la cuenta de Meta), token inválido/expirado: **pausar toda la campaña** con `motivoPausa` legible ("Meta no pudo cobrar: revisa el método de pago de la cuenta de WhatsApp de EXI").
  - Si más del 30 % de los últimos 20 envíos fallan: pausar con motivo.
- Los estados entregado/leído llegan por el webhook existente: actualizar el destinatario por `waMessageId`.

### 5. Bajas
- Si un contacto con destinatario reciente responde un texto que coincide con `BAJA`, `STOP`, `NO GRACIAS`, `NO ME ESCRIBAN`, `CANCELAR` (sin distinguir mayúsculas ni acentos, mensaje corto): `optOutDifusion = true` y nota interna en la conversación. No enviar respuesta automática desde aquí; revisa en `ingest.ts` cómo evitar que el bot conteste en ese mismo mensaje y deja la decisión documentada.
- Recordar en la UI que la plantilla debe incluir "Responde BAJA para no recibir más mensajes".

### 6. Reporte
- Por campaña: pendientes, enviados, entregados, leídos, respondieron, fallidos, omitidos, bajas; progreso de hoy contra el tope; tabla de destinatarios con filtro por estado; exportar CSV.

## Fuera de alcance (Fase 2, no hacer ahora)
Arranque gradual automático del ritmo, pausa por cambio de calidad del número (`quality_rating` en rojo), reintentos escalonados, vínculo avanzado respuesta → bot con contexto de campaña, plantillas con botones/imágenes.

## No hacer
- No enviar mensajes reales en pruebas ni con ningún token real. Provider simulado.
- No activar el módulo en ninguna org salvo en la BD de pruebas.
- No agregar abstracciones ni configuración que no esté en este documento.
- No guardar secretos en archivos ni en el reporte.

## Pruebas y entrega
- BD PostgreSQL aislada y Graph simulado (como en las pruebas de Instagram/citas). Un script de regresión que cubra: parseo CSV y XLSX, validación y vista previa, respeto de días/ventana/zona horaria, tope diario entre campañas, tanda y pausa, no duplicar con dos ejecuciones simultáneas, reinicio a mitad de campaña, cada código de error de Meta, baja por respuesta, aislamiento entre orgs (RLS) y módulo apagado = 403/404.
- `tsc` y `lint` sin errores. No romper `/difusion`.
- Documentar en `MODULOS.md` y en `docs/` el workflow de n8n (cada minuto, `x-api-key`) y cómo encender el módulo para la org 12.
- Entrega: lista de archivos tocados, resultados de pruebas, decisiones que tomaste donde este prompt no decía, y qué quedó sin verificar contra Meta real.
