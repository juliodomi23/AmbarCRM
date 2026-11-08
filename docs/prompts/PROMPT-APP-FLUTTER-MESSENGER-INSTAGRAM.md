# Prompt para Codex: manejar Messenger e Instagram en la app móvil (Flutter)

Trabaja en el proyecto Flutter de AmbarCRM (el de `PROMPT-APP-FLUTTER-ARQUITECTURA.md` y `PROMPT-APP-FLUTTER-BANDEJA-CHAT.md`; respeta su arquitectura, nombres en español, comentarios escasos, sin paquetes nuevos ni funciones no pedidas). Contrato del backend en `API-MOVIL.md`. No toques el backend `web/` salvo que algo de abajo sea imposible con la API actual: en ese caso para y dímelo. No hagas push ni publiques builds.

## Contexto

- El CRM web ya recibe y responde mensajes de **Messenger** e **Instagram** (canales con `canalProveedor` = `messenger` / `instagram`; WhatsApp = `cloud_api`). La web separa la bandeja por tipo con pestañas, chip de canal y contador de no leídos por tipo.
- `GET /api/movil/conversaciones` ya devuelve `canalId`, `canalNombre`, `canalProveedor`, `noLeidos`, `ultimoEntranteAt` y `canalActivo`. El envío usa `POST /api/mensajes/enviar` igual que WhatsApp.
- Reglas de Messenger/Instagram: solo se puede responder **dentro de 24 h** del último mensaje del cliente y **no hay plantillas** (las plantillas son solo de WhatsApp Cloud API). Fuera de la ventana el backend responde `400 {"ventanaCerrada":true}`. Los contactos pueden venir sin nombre (el título es un identificador numérico) y sin teléfono.

## Tarea

1. **Bandeja por tipo de canal**: arriba de la lista, tres pestañas/segmentos `WhatsApp · Messenger · Instagram` con icono. Muestra siempre WhatsApp; Messenger e Instagram solo si hay conversaciones de ese tipo (o canal). Filtrado en cliente por `canalProveedor` (`cloud_api` y los demás proveedores de WhatsApp = WhatsApp). Conserva filtros y búsqueda actuales.
2. **Contador de no leídos por pestaña**: suma de `noLeidos` por tipo (todas las conversaciones cargadas por la paginación, no solo la página visible), insignia redonda del color de marca, oculta en 0 y «99+» de tope.
3. **Fila de conversación**: avatar con la insignia pequeña del canal; chip con icono y nombre de la cuenta (`canalNombre` sin el prefijo «Messenger ·»/«Instagram ·»); si el nombre del contacto es solo dígitos, muestra el icono del canal en el avatar en vez de iniciales.
4. **Pantalla de chat**: encabezado con el chip del canal; para Messenger/Instagram, caja de redacción **sin** selector de plantillas, con aviso si `ultimoEntranteAt` tiene más de 24 h («Pasaron más de 24 h: ya no puedes responder por este canal») y el campo deshabilitado; si el backend devuelve `ventanaCerrada`, muestra ese mismo aviso en lugar de un error genérico. Adjuntos: solo los tipos que el backend acepta para ese canal; ante un 400/413 muestra el texto del error.
5. **Panel del contacto**: oculta citas/pacientes y datos de teléfono cuando no existan; muestra «ID de Messenger/Instagram» (`identificadorExterno` si la API lo da; si no, omítelo y avísame).
6. **Notificaciones push**: al tocar una notificación de un mensaje de Messenger/Instagram, abre el chat y selecciona la pestaña correcta.
7. Estados vacíos como en la web: «Esta empresa no tiene un canal de Messenger conectado.» (sin enlace de configuración, la conexión de canales es solo web). Letra mínima 12 sp, modo claro/oscuro, accesibilidad (`Semantics`) en pestañas e insignias.

## Entregables

- Commits en español por bloque (`feat(app): pestañas y contadores por canal`, `feat(app): chat de Messenger e Instagram con ventana de 24 h`).
- `flutter analyze` sin avisos nuevos y las pruebas existentes pasando; añade pruebas mínimas del filtrado por tipo, el conteo y la regla de 24 h.
- Resumen: archivos tocados, qué probaste (emulador/dispositivo) y qué no, y cualquier campo que falte en la API móvil.
