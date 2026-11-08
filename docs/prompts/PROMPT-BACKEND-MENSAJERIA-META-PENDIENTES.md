# Prompt para Codex: pendientes del backend de Messenger/Instagram (DESPUÉS de la revisión de Meta)

**No ejecutar antes de grabar los videos del App Review ni mientras Meta esté revisando la app**: cambia el comportamiento de envío ya aprobado en pruebas. Hazlo cuando Julio lo indique.

Trabaja en `web/` de AmbarCRM (rama `meta-tech-provider`). Lee `web/AGENTS.md`: este Next.js tiene cambios incompatibles, revisa `node_modules/next/dist/docs/` antes de tocar rutas. Mismo estilo del código, comentarios escasos, sin dependencias nuevas ni funciones no pedidas. No hagas push ni despliegues.

## Contexto (hallado al revisar el trabajo de la app Flutter)

- `src/app/api/mensajes/enviar/route.ts` guarda el adjunto con `guardarMediaBase64` y manda una **URL pública** solo cuando `conv.canal.proveedor === "messenger"` (líneas ~137 y ~146). Para **Instagram** sigue mandando el `data:` URL y `meta-mensajeria.ts` (`enviarMedia`, ~línea 196) lo rechaza con «Instagram requiere una URL pública https para el adjunto». Falla también en la web, no solo en móvil.
- Contrato móvil (`API-MOVIL.md`) desactualizado: `/api/mensajes/enviar` devuelve **502** `{ ok:false, error, mensaje }` cuando falla Meta (incluida la ventana cerrada de Messenger/Instagram), no `400 {"ventanaCerrada":true}` (ese 400 es solo de WhatsApp Cloud API). Además la regla de ventana de Messenger permite hasta 7 días al asesor con `HUMAN_AGENT` solo si `META_HUMAN_AGENT_APROBADO=true` (hoy `false`); Instagram con Instagram Login nunca usa `HUMAN_AGENT`.
- La API móvil no expone el identificador externo del contacto (PSID / IGSID).

## Tarea

1. **Adjuntos de Instagram**: usa la misma ruta que Messenger (URL pública) para `instagram`, tanto en audio como en media, sin cambiar WhatsApp. Verifica en `enviarMedia` los tipos y límites de tamaño que acepta Instagram (imagen, audio, video; documentos no) y devuelve un error claro en español si el tipo no se admite. Revisa que `destinoPublico` acepte la URL pública del propio CRM.
2. **Ventana cerrada con código propio**: para Messenger/Instagram, devuelve `400 { error, ventanaCerrada: true }` **antes** de llamar a Meta cuando `tipoEnvioMeta` no da tipo de envío (igual que hoy para `cloud_api`), en lugar de un 502. Conserva los textos actuales.
3. **Contrato móvil**: expón `identificadorExterno` y `canalProveedor` donde falte en `GET /api/movil/conversaciones` y en el detalle de conversación; actualiza `API-MOVIL.md` con el nuevo 400, el 502 restante (fallo del proveedor) y el flag `humanAgentHabilitado` si ya lo expone alguna ruta (si no, añádelo a la respuesta de sesión móvil).
4. **Pruebas**: ampliar las comprobaciones existentes de Messenger/Instagram (sin base en el puerto 55450 si se puede evitar): adjunto de Instagram con URL pública, ventana cerrada → 400, contrato móvil.

## Entregables

- Commits en español por bloque (`fix(instagram): adjuntos con URL pública`, `fix(mensajeria): ventana cerrada devuelve 400`, `docs(movil): contrato de Messenger e Instagram`).
- `npx tsc --noEmit` sin errores nuevos (hay previos ajenos de IVA/CFDI), ESLint limpio y las pruebas pasando.
- Resumen: archivos tocados, qué probaste y qué solo se prueba en producción (el envío real a Meta).
