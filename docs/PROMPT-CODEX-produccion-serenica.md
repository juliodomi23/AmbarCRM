# Prompt para Codex: dejar AmbarCRM listo para producción (migración de Serénica)

Pegar tal cual en Codex, con el directorio de trabajo en `docs/08-productos-internos/AmbarCRM`.

---

Trabaja en `web/` (Next.js + Prisma + Postgres con RLS multi-tenant). Idioma del código, mensajes y docs: español. Crea la rama `release-serenica` a partir de la rama donde ya están juntos los módulos y el odontograma (revisa con `git branch -a` / `git log`; si `odontograma` y `modulos-fase-2` no están integradas, dime cuál es el orden y no mezcles nada sin avisar).

## Objetivo
Cuando Ricardo Azcorra (Serénica Health Center, clínica dental) diga que sí, migrar su operación de Chatwoot a AmbarCRM en horas. Tú NO despliegas ni tocas producción: dejas código, scripts y un runbook para que Julio ejecute cada paso.

## Reglas duras
- No ejecutes nada contra producción, ni contra bases reales, ni contra WhatsApp/Meta reales. Pruebas solo en una base desechable.
- No `prisma db push`. Cambios aditivos e idempotentes (la app anterior debe seguir funcionando con el esquema nuevo).
- No agregues dependencias. Sin abstracciones que no se pidan. Reutiliza helpers.
- No toques ClinicalGestor, workflows de n8n ni datos reales de pacientes. Seeds y tests con datos ficticios.
- Nada de tokens ni secretos escritos en archivos del repo: salen por variable de entorno o se imprimen una sola vez en consola.

## Qué entregar

### 1. Auditoría de despliegue (solo lectura + reporte)
Sigue `docs/despliegue-bot.md` de principio a fin como si fueras a desplegar y reporta: pasos que faltan, que están desordenados o que no se pueden ejecutar tal cual. Revisa el orden de `multi-tenant.sql` → `actualizaciones.sql`, el `GRANT`/RLS de todas las tablas nuevas (incluida `odontograma_zonas`) y las variables de entorno requeridas. Corrige la doc donde esté mal.

### 2. Script de alta `scripts/alta-serenica.ts` (+ `npm run alta:serenica`)
Idempotente (correrlo dos veces no duplica nada). Debe aceptar `--dry-run` que solo imprime qué haría. Contra la base que indique `DATABASE_URL`; si el nombre de la base incluye `prod`, exigir además `--confirmo-produccion`. Crea:
- Organización "Serénica Health Center" (giro clínica).
- Módulos activos: `pacientes`, `citas`, `reservas_en_linea`.
- Usuarios: Dr. Ricardo Azcorra (admin), Recepción Serénica, Dra. Paloma (ortodoncia). Contraseñas aleatorias impresas una sola vez; correos desde variables de entorno, no inventados.
- Doctores: Dr. Ricardo Azcorra (general) y Dra. Paloma (ortodoncia), con horarios L–V 10–18 (Paloma 11–18) y sábado 10–13 (Paloma 11–13).
- Servicios de reserva: Valoración inicial ($700), Limpieza, Ortodoncia, Implantes, Extracciones, 60 min.
- Embudo y etiquetas: `bot_off`, `escalado_humano`, `citado`, `recordatorio_enviado`, `cita_confirmada`, `comprobante_transferencia`. Los nombres deben quedar EXACTOS: el agente de n8n los lee.
- Bot con permisos `leer_perfil`, `enviar_mensaje`, `notas_internas`, `handoff`, `gestionar_contactos` (+ etiquetas/tareas si la API ya los soporta). Imprime una sola vez el token y el secreto de firma `X-AmbarCRM-Signature`.
Usa los helpers de alta de organización y de bots que ya existan; no dupliques su lógica.

### 2b. Huecos de la API del bot (bloqueos conocidos)
Revisa `docs/api-bot.md` y el código y responde, ANTES de implementar nada:
1. ¿Existe ruta para que el bot envíe una **plantilla** genérica aprobada en Meta (no solo la de cotizaciones)? Los recordatorios de citas dependen de eso.
2. ¿Existe ruta para insertar **historial** de mensajes antiguos o importar contactos con etiquetas desde Chatwoot?
3. ¿Cubre el CRM los comentarios de Facebook/Messenger que hoy atiende `Serénica - Bot Comentarios Facebook`?
Si falta (1), implementa la ruta mínima siguiendo el patrón de las rutas del bot y sus permisos. Si falta (2), propón el diseño en el runbook pero NO lo implementes. (3) solo reporte.

### 3. Verificación previa al corte
`scripts/verificar-serenica.ts` (+ `npm run verificar:serenica`), solo lectura: comprueba que existen la organización, módulos, usuarios, doctores, etiquetas exactas, bot con permisos y que RLS aísla entre organizaciones. Sale con código distinto de 0 si algo falta.

### 4. Runbook `docs/RUNBOOK-corte-serenica.md`
Pasos numerados, cada uno con: quién (Julio / Codex / Ricardo), comando exacto, resultado esperado y cómo revertir. Incluye: respaldo de la base antes de tocarla, orden de SQL, alta, verificación, prueba con número de prueba, corte del webhook del número, y reversión (reactivar workflows de Chatwoot y regresar el webhook; no borrar nada de Chatwoot 30 días). Marca claramente los pasos que no puede hacer nadie más que Julio (Meta, DNS, n8n, token de Chatwoot).

## Antes de terminar, corre y pega la salida
`npx tsc --noEmit`, `npm run lint`, `npm run check:odontograma` (base desechable), los `check:*` de citas/pacientes/demo, y `npm run alta:serenica -- --dry-run`. Si algo falla por causa ajena a tu cambio (por ejemplo `scripts/check-demo.ts` sobre endpoints de pagos/datos fiscales), dilo y no lo arregles.

## Entrega
Archivos tocados, resultado de la auditoría (punto 1), respuestas a 2b, comandos con su salida y una sección "No verificado" con todo lo que no pudiste probar (WhatsApp, Meta, producción, base real). Sin commit; yo reviso el diff.
