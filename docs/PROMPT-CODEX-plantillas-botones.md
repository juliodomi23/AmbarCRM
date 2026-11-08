# Prompt para Codex: plantillas con encabezado y botones en la API del bot

Pegar tal cual en Codex, con el directorio de trabajo en `docs/08-productos-internos/AmbarCRM`.

---

Trabaja en `web/` (Next.js + Prisma). Rama actual: `release-serenica` (no crees otra). Idioma: español.

## Objetivo
La ruta `POST /api/v1/accounts/:accountId/conversations/:conversationId/messages/template` (`src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/messages/template/route.ts`) hoy solo acepta `variables` de texto del cuerpo. Los recordatorios de citas de Serénica usan plantillas de WhatsApp con **variables en el encabezado** y **botones** (respuesta rápida "Confirmar"/"Cancelar" y, si aplica, botón con URL dinámica). Amplía la ruta y el proveedor para soportarlos, sin romper el contrato actual.

## Contrato
- Compatible hacia atrás: el body actual `{ name, language, variables: string[] }` sigue funcionando igual.
- Campos nuevos, opcionales:
  - `header`: `{ type: "text", variables: string[] }` (encabezado de texto con variables). Imagen/documento/video de encabezado: soportar `{ type: "image"|"document"|"video", link: "https://…" }` con URL HTTPS pública.
  - `buttons`: lista de `{ index: number, type: "quick_reply", payload: string }` o `{ index: number, type: "url", text: string }` (parámetro de la URL dinámica). `index` es la posición del botón en la plantilla (0–9).
- Valida contra la plantilla aprobada que devuelve `consultarPlantillas()`: el tipo de encabezado y los botones enviados deben existir en `plantilla.components`, y el número de variables debe coincidir con los `{{n}}` de cada componente. Si no coincide: `400` con mensaje en español y `motivo` (por ejemplo `variables_no_coinciden`, `boton_no_existe`). Longitudes máximas razonables (variables ≤ 2000 caracteres como hoy; `payload` ≤ 256).
- Sigue exigiendo `enviar_mensaje`, plantilla `APPROVED`, canal `cloud_api`. No cambies las respuestas de error existentes.

## Qué tocar
1. El proveedor Cloud (`getProvider(...).enviarPlantilla` en `src/lib/channel*`): construir el payload de Meta con `components` de tipo `header`, `body` y `button` (con `sub_type` y `index`) a partir de los parámetros nuevos. Revisa cómo arma hoy el `body` y reutilízalo.
2. La ruta: parsear y validar los campos nuevos, pasarlos al proveedor, y guardar en `mensaje.contenido` algo como `[Plantilla nombre · idioma]` igual que hoy (sin guardar payloads sensibles).
3. `docs/api-bot.md`: documenta los campos nuevos con un ejemplo de recordatorio (encabezado de texto + 2 botones de respuesta rápida).
4. Un check `scripts/check-plantillas-botones.ts` + `check:plantillas-botones` en `package.json`, estilo de los otros `check:*`: prueba la construcción del payload y la validación (caso válido, variables que no coinciden, botón inexistente, compatibilidad con el body antiguo). Sin llamadas reales a Meta: mockea el proveedor o prueba la función pura que construye el payload.

## Reglas
- Cambio aditivo y mínimo. Sin dependencias nuevas, sin abstracciones que no hagan falta.
- No ejecutes nada contra Meta/WhatsApp reales ni producción. No toques n8n, ClinicalGestor ni datos reales.
- No hagas commit.

## Antes de terminar, corre y pega la salida
`npx tsc --noEmit`, `npm run lint`, `npm run check:plantillas-botones`. Si algo falla por causas ajenas (por ejemplo `scripts/check-demo.ts` sobre pagos/datos fiscales) dilo y no lo arregles.

## Entrega
Archivos tocados, comandos con su salida y una sección "No verificado" (en particular: envío real a Meta, plantillas con botones reales).
