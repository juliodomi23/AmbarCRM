# Prompt para Codex — App Flutter: ajustes al chat (ventana por canal y "Abrir en mapas")

Repo: `D:\AmbarRojo\repos\ambarcrm-app`. Continúa en la rama **`feat/bandeja-chat`** (ya tiene 5 commits; no crees otra rama).
Sin push, merge ni PR. Responde y comenta en español.

## Antes de lanzarlo (Julio)

Abre Codex dentro de `D:\AmbarRojo\repos\ambarcrm-app` con la rama `feat/bandeja-chat` activa. Es una ronda corta: dos ajustes, un commit
cada uno.

## Prompt

Lee `AGENTS.md`, `docs/ARQUITECTURA.md` y `docs/API-MOVIL.md`. Mismas reglas de siempre: sin paquetes nuevos, sin tokens en logs,
`flutter analyze` sin observaciones y `flutter test` en verde después de **cada** ajuste. No marques como probado lo que no ejecutaste.

### Ajuste 1 · La ventana de mensajes depende del canal (`fix(chat)`)

Hoy la app bloquea el envío libre pasadas 24 h en **todos** los canales. La web no lo hace así (`ChatCliente.tsx`):

| `canalProveedor` | Regla en la web |
|---|---|
| `cloud_api` (WhatsApp) | Solo 24 h desde el último entrante no interno. Cerrada → solo plantillas aprobadas. **Esto no cambia.** |
| `messenger`, `instagram` | 24 h, **o hasta 7 días** si Human Agent está habilitado. Ese permiso es una variable del servidor que la app **no puede leer**. |
| cualquier otro | La web **nunca** bloquea por ventana. |

Cambia `core/utils/ventana.dart` y su uso en `ChatProvider` para que:

1. `ventana.dart` reciba el proveedor y devuelva un estado claro, por ejemplo `abierta`, `cerrada` o `humanAgent` (zona de 24 h a 7 días
   en Messenger/Instagram). Deja `horasVentana = 24` y agrega `diasHumanAgent = 7`, cada una con su comentario de origen
   (`web/src/lib/meta/ventana.ts` y `ChatCliente.tsx`).
2. **`cloud_api`:** igual que ahora (24 h; sin entrantes = cerrada).
3. **`messenger` / `instagram`:**
   - Menos de 24 h: abierta.
   - Entre 24 h y 7 días: **no bloquees**; permite escribir con un aviso discreto sobre la barra: "Pasaron más de 24 h. Si Meta no lo permite
     para este canal, el envío fallará." Si el servidor/Meta lo rechaza, muestra el texto legible del error y deja el mensaje `fallido`
     (no inventes que la ventana está cerrada para siempre).
   - Más de 7 días o sin entrantes: cerrada; solo notas internas. Sin botón de plantillas (no aplica).
4. **Otros proveedores o proveedor desconocido** (`canalProveedor` nulo): nunca bloquees por ventana en el cliente; confía en el servidor.
   Si responde `ventanaCerrada: true`, se respeta como hoy.
5. Un canal desconocido **no** debe dejar el chat bloqueado por defecto. Si no se pudo obtener `canalProveedor` (se saca de la lista
   paginada de la bandeja), trátalo como "desconocido" (punto 4), no como WhatsApp.

Pruebas nuevas en `ventana` y `ChatProvider`: cada fila de la tabla en los bordes (23:59 h, 24:00 h, 6 d 23 h, 7 d), sin entrantes,
notas internas que no cuentan, proveedor nulo, y que el aviso de Messenger/Instagram no bloquea el envío pero un 400 sí se muestra.

### Ajuste 2 · "Abrir en mapas" sin mandar la ubicación a un tercero fijo (`feat(chat)`)

Julio **autoriza** esta opción: en la tarjeta de ubicación, el botón "Abrir en mapas" usa el esquema **`geo:`** con `url_launcher`
(`LaunchMode.externalApplication`), de modo que **el sistema deja elegir la app de mapas** y la ubicación no va a ningún servicio fijo.

- Extrae latitud y longitud de `contenido` con tolerancia (por ejemplo `"19.43,-99.13"`, con o sin espacios, o con texto alrededor). Si
  no hay coordenadas válidas, **no muestres el botón**; deja solo la tarjeta con el texto.
- URI: `geo:<lat>,<lng>?q=<lat>,<lng>`. Sin URLs de Google Maps ni de ningún proveedor fijo.
- Si no hay app que abra `geo:` (típico en iOS, que no lo soporta), no falles: ofrece **"Copiar coordenadas"** y avisa con un mensaje
  breve en español.
- Android 11+: declara en `AndroidManifest.xml` el bloque `<queries>` con el intent de `geo:` para que `canLaunchUrl` funcione. Ese
  es el único cambio nativo permitido en esta ronda; indícalo en el reporte.
- Prueba la extracción de coordenadas (formatos válidos, inválidos, rangos fuera de ±90/±180) y que el botón no aparece sin coordenadas.

### Verificación y reporte

`flutter analyze`, `flutter test` (indica el número de pruebas, antes eran 43) y `flutter build apk --debug`. Repite los `grep` de
dependencias (`core/` sin `features/`, ninguna `ui` con `dio`, `bandeja/` y `chat/` sin importarse). Un solo reporte con: qué cambió por
ajuste, resultados, `git diff --stat` contra el último commit, el cambio nativo con su archivo y lo que **no** pudiste probar (abrir una
app de mapas real, un canal Messenger/Instagram real). No hagas push ni merge.
