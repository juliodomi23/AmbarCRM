# Revisión de conexiones de Messenger e Instagram · 21-oct-2026

Revisión del código en `codex/fase-3-marketing-meta-ads`. No se accedió al panel de Meta, a una página ni a una cuenta de Instagram reales. Las pruebas históricas de integración usaron Graph simulado; no certifican permisos aprobados ni entrega real de mensajes.

## Resultado

| Flujo | Implementado | Límite antes de ofrecerlo a clientes |
|---|---|---|
| Messenger | Facebook Login con selección de página y conexión manual; webhooks firmados, envío, reconexión y desconexión. El intento de login está ligado a empresa, usuario y sesión, vence a los diez minutos y se consume una vez. | Confirmar en el panel `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, nivel de acceso y configuración de la app. Ejecutar el humo con una página de prueba. `HUMAN_AGENT` requiere aprobación propia. |
| Instagram | Facebook Login guiado con selección de página y detección de cuenta profesional vinculada; alternativa manual, recepción y envío de DM, firma por app y retiro del canal. | Confirmar permisos y acceso a mensajes para el flujo **con Facebook Login y token de página**. Probar webhook, respuesta, media y desconexión con una cuenta de prueba antes de clientes. |

**Decisión del 21-oct-2026:** el usuario mantendrá Messenger e Instagram como **«próximamente» en el selector de Configuración hasta tramitar los permisos**. Las rutas y servicios permanecen en el repositorio, pero esta revisión no habilita el alta desde el selector. Las tarjetas de canales que ya existan siguen visibles. El intento de habilitar el selector en el commit `c6e4069` se revirtió por esta decisión.

**Preparación posterior de App Review:** se añadió un flujo guiado de Facebook Login para Instagram, ligado a página y cuenta profesional; continúa inaccesible desde el selector «próximamente». El inicio temporal conserva la separación por organización, usuario, sesión y ahora también proveedor. `META_HUMAN_AGENT_APROBADO` bloquea por defecto la etiqueta ampliada. La suscripción de una página consulta canales activos de cualquier organización de la misma app: al conectar envía la unión de campos y al retirar uno omite el `DELETE` si queda otro. Este comportamiento se verifica con Graph simulado; Meta real y el panel siguen pendientes.

## Riesgos y comprobaciones pendientes

1. **Acceso real de Meta.** El repositorio no demuestra que la app tenga Advanced Access ni verificación empresarial. La [colección oficial de Meta para conversaciones](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a) distingue Messenger de Instagram Messaging y enumera `instagram_basic`, `instagram_manage_messages` y `pages_manage_metadata` para conversaciones de Instagram con página vinculada. El [paquete de App Review de Messenger](META-APP-REVIEW-MESSENGER.md) describe el alcance ya implementado. No mezclar esos permisos con `instagram_business_*`, que corresponden al flujo distinto de [Instagram Login](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login).
2. **Instagram solo probado con Graph simulado.** Confirmar que las rutas y eventos que usa esta implementación (`/me/messages`, `messages` en la suscripción de la página y `object:instagram`) corresponden al tipo de app y token reales. La colección oficial de Instagram Login documenta otro host y otra familia de permisos; no valida por sí sola el flujo actual con página. Ver [decisiones del canal](canales-decisiones.md#instagram-dm-manual--17-oct-2026).
3. **Página compartida.** La protección local evita retirar toda la app cuando queda otro canal y suma sus campos al suscribir. Falta comprobar con página/app de prueba real la semántica de Meta y las carreras entre conexiones simultáneas; no se debe probar con una página de cliente.
   El prompt asumía que `POST subscribed_fields` reemplaza siempre la lista. Como esa semántica no se confirmó en la documentación accesible, el código envía la unión de campos de forma conservadora y omite el `DELETE` mientras quede otro canal. La prueba local no se presenta como confirmación del comportamiento remoto.
4. **Capacidad Human Agent.** Desactivada por defecto en servidor e interfaz. Solo `META_HUMAN_AGENT_APROBADO=true` permite el intento entre 24 horas y siete días tras confirmar la capacidad en el panel. Los bots se limitan a 24 horas.

## Validación local de esta preparación

Prisma validate, TypeScript, ESLint, compilación de producción y `check-canales-ui.ts` pasaron. La actualización SQL se aplicó y se repitió sin error en PostgreSQL local desechable. Pasaron las pruebas con Graph simulado de conexión guiada Messenger/Instagram, rutas, ventanas, webhooks, desconexión y suscripción compartida entre organizaciones. También pasaron las pruebas HTTP de Facebook Login y canales contra una instancia local de Next. La conexión real con Meta, el video y el panel siguen pendientes. No se hicieron llamadas a Meta ni cambios de producción.
