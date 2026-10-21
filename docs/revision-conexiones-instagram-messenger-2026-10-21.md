# Revisión de conexiones de Messenger e Instagram · 21-oct-2026

Revisión del código en `codex/fase-3-marketing-meta-ads`. No se accedió al panel de Meta, a una página ni a una cuenta de Instagram reales. Las pruebas históricas de integración usaron Graph simulado; no certifican permisos aprobados ni entrega real de mensajes.

## Resultado

| Flujo | Implementado | Límite antes de ofrecerlo a clientes |
|---|---|---|
| Messenger | Facebook Login con selección de página y conexión manual; webhooks firmados, envío, reconexión y desconexión. El intento de login está ligado a empresa, usuario y sesión, vence a los diez minutos y se consume una vez. | Confirmar en el panel `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, nivel de acceso y configuración de la app. Ejecutar el humo con una página de prueba. `HUMAN_AGENT` requiere aprobación propia. |
| Instagram | Alta manual de cuenta profesional vinculada a una página, con ID de cuenta, Page ID, token, App ID y App Secret; recepción y envío de DM, firma por app y retiro del canal. | Confirmar permisos y acceso a mensajes para el flujo **con Facebook Login y token de página**. Probar webhook, respuesta, media y desconexión con una cuenta de prueba antes de clientes. No hay login guiado para Instagram. |

La interfaz impedía crear ambos canales porque el selector los mantenía deshabilitados como «próximamente», aunque las rutas `POST /api/canales` ya aceptaban los dos proveedores. Se habilitaron las opciones, se muestran solo las conexiones del tipo elegido y el formulario manual de Messenger queda oculto mientras se usa Facebook Login. Instagram muestra que la configuración es manual y necesita una comprobación real previa. Estos cambios no modifican OAuth, tokens, webhooks ni permisos.

## Riesgos y comprobaciones pendientes

1. **Acceso real de Meta.** El repositorio no demuestra que la app tenga Advanced Access ni verificación empresarial. La [colección oficial de Meta para conversaciones](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a) distingue Messenger de Instagram Messaging y enumera `instagram_basic`, `instagram_manage_messages` y `pages_manage_metadata` para conversaciones de Instagram con página vinculada. El [paquete de App Review de Messenger](META-APP-REVIEW-MESSENGER.md) describe el alcance ya implementado. No mezclar esos permisos con `instagram_business_*`, que corresponden al flujo distinto de [Instagram Login](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login).
2. **Instagram solo probado con Graph simulado.** Confirmar que las rutas y eventos que usa esta implementación (`/me/messages`, `messages` en la suscripción de la página y `object:instagram`) corresponden al tipo de app y token reales. La colección oficial de Instagram Login documenta otro host y otra familia de permisos; no valida por sí sola el flujo actual con página. Ver [decisiones del canal](canales-decisiones.md#instagram-dm-manual--17-oct-2026).
3. **Página compartida.** Si Messenger e Instagram usan la misma página y app, hay que comprobar que suscribir o retirar un canal no afecte al otro. El código llama `DELETE /{pageId}/subscribed_apps` al desconectar; no se debe probar esto con una página de cliente.
4. **Capacidad Human Agent.** El código permite que un asesor intente la etiqueta entre 24 horas y siete días. Sin habilitación en la app, Meta puede rechazar el envío. Los bots se limitan a 24 horas.

## Validación local de esta revisión

TypeScript y ESLint de los archivos editados: correctos. `check-canales-ui.ts` se amplió para detectar opciones deshabilitadas y comprobar el formulario manual. Su ejecución quedó pendiente porque el paquete `tsx` no está instalado en esta sesión y `npx` no pudo consultar el registro por falta de red. No se hicieron llamadas a Meta ni cambios de producción.
