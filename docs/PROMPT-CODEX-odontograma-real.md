# Prompt para Codex: odontograma real en AmbarCRM

Pegar tal cual en Codex, con el directorio de trabajo en `docs/08-productos-internos/AmbarCRM`.

---

Trabaja en `web/` (Next.js + Prisma + Postgres con RLS multi-tenant). Crea una rama nueva `odontograma` desde la rama actual. Idioma del código, mensajes y docs: español, igual que el resto del repo.

## Objetivo
Persistir de verdad el **odontograma** del expediente de pacientes (módulo `pacientes`). Hoy solo existe en la demo pública: el componente ya está hecho y la demo ya lo usa con una API simulada. Falta el backend real y conectarlo a la página real del paciente.

## Ya hecho (no lo rehagas)
- `web/src/components/contactos/Odontograma.tsx`: UI. Hace `PUT /api/contactos/:id/odontograma` con `{ diente, zona, estado }`. Tipos exportados: `Diente`, `ZonaDiente`, `EstadoDiente`.
- `ExpedienteCliente.tsx` acepta la prop opcional `odontograma?: Diente[]` y solo la muestra si `modo === "pacientes"` y no es `soloBasico`.
- Demo: `src/lib/demo/api/modulos-giro.ts` (ruta simulada) y `src/components/demo/pantallas/Fichas.tsx`. No los modifiques salvo que cambie el contrato.
- Referencia de origen, solo lectura: `D:\AmbarRojo\ClinicalGestor\ClinicalGestorWL\backend\routers\odontogram.py`. No toques ese repo.

## Contrato (debe quedar idéntico al de la demo)
- Diente: `{ numero: number, zonas: Partial<Record<ZonaDiente, EstadoDiente>> }`.
- Numeración FDI adulta válida: 11–18, 21–28, 31–38, 41–48.
- Zonas: `vestibular | lingual | mesial | distal | oclusal`.
- Estados: `sano | caries | restaurado | extraido | corona | endodoncia`.
- `PUT /api/contactos/:id/odontograma` body `{ diente, zona, estado }`. Responde `{ ok: true }`. Marcar `sano` borra el registro de esa zona.

## Qué construir
1. **Modelo y SQL.** Tabla `odontograma_zonas` (una fila por zona): `id`, `org_id` (mismo `DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint` que `expedientes_paciente`), `expediente_id` → `expedientes_paciente(id) ON DELETE CASCADE`, `diente SMALLINT`, `zona TEXT`, `estado TEXT`, `actualizado_por_id` → `usuarios(id) ON DELETE SET NULL`, `updated_at`. `UNIQUE (expediente_id, diente, zona)`. `CHECK` para diente FDI, zona y estado. Índice por `org_id`.
   - Añade el modelo a `prisma/schema.prisma` (patrón de `ExpedientePaciente` y `EvolucionClinica`).
   - Añade el SQL **idempotente** a `prisma/sql/actualizaciones.sql`, junto a las tablas del expediente, y la tabla a **todas** las listas de RLS, políticas y GRANT a `crm_app` donde ya están `expedientes_paciente` y `evoluciones_clinicas`. Revisa que el orden y los `REVOKE` del archivo sigan correctos.
   - **No uses `prisma db push`.** No ejecutes nada contra producción. Prueba el SQL en una base desechable, dos veces seguidas (idempotencia).
2. **Ruta** `src/app/api/contactos/[id]/odontograma/route.ts` con `PUT` (y `GET` si hace falta para la página). Copia el patrón de `src/app/api/contactos/[id]/expediente/route.ts`: `requireSesion`, módulo `pacientes` activo (si no, responde como la ruta del expediente), `aBigInt`, `conErrores`. Valida diente/zona/estado con las listas de arriba; `400` con mensaje en español si algo es inválido. Haz upsert del expediente si no existe. Upsert de la zona; si el estado es `sano`, bórrala. Guarda `actualizado_por_id`.
   - **Permisos:** debe exigir lo mismo que escribir en el expediente clínico. Revisa cómo `pacientes/[id]/page.tsx` decide `soloBasico` y aplica la misma restricción también en la ruta: un puesto sin acceso clínico no puede leer ni escribir el odontograma.
3. **Página real** `src/app/(app)/pacientes/[id]/page.tsx`: carga las zonas del paciente, agrúpalas por diente en `Diente[]` y pásalas como `odontograma` a `ExpedienteCliente` (solo si no es `soloBasico`). No cambies el comportamiento para `clientes`.
4. **Script de verificación** `scripts/check-odontograma.ts` y `check:odontograma` en `package.json`, siguiendo el estilo de los otros `check:*`: validaciones (diente/zona/estado inválidos), borrado con `sano`, idempotencia del PUT repetido y **aislamiento entre empresas** (otra org no ve ni modifica el odontograma). Debe correr contra una base desechable, nunca contra producción.
5. **Docs:** añade una sección corta en `docs/despliegue-bot.md` o el documento de despliegue que corresponda (qué SQL correr y en qué orden), y la tabla en `modelo-datos.md`.

## Reglas
- Cambio aditivo: la app anterior debe seguir funcionando con el esquema nuevo.
- Sin abstracciones ni funciones extra que no se pidan. Reutiliza helpers existentes.
- No agregues dependencias nuevas.
- No toques `ClinicalGestor`, workflows de n8n ni datos de clientes reales.
- No guardes datos de pacientes reales en seeds ni tests: usa datos ficticios.

## Antes de terminar, corre y pega la salida
`npx tsc --noEmit`, `npm run lint` (si existe), `npm run check:odontograma` y los `check:*` que toquen citas/pacientes/demo. Si algo falla por causas ajenas a tu cambio (por ejemplo `scripts/check-demo.ts` sobre endpoints de pagos), dilo explícitamente y no lo arregles.

## Entrega
Lista de archivos tocados, el SQL final, comandos ejecutados con su salida, y una sección "No verificado" con todo lo que no pudiste probar (por ejemplo, con WhatsApp o Meta reales, o contra una base de producción).
