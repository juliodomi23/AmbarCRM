# DEMO-FIEL · diseño de la demo pública fiel al CRM real

Rama: `demo-fiel` (desde `modulos-fase-2`). Código de la demo: `web/src/lib/demo/` (almacén, API simulada,
instalación) y `web/src/components/demo/` (pantallas que arman las props de los componentes reales).

## 1. Objetivo y reglas

`/demo` (sin login) debe renderizar **los mismos componentes que el CRM** —`AppShell`, `ChatCliente`,
`Board`, `ContactosCliente`, `TareasCliente`, `CitasCliente`, `CajaCliente`, `ProductosCliente`,
`CotizacionesCliente`, `ConfiguracionCliente`…— alimentados con datos ficticios en memoria.

Reglas que mandan sobre todo lo demás:

1. El CRM real no cambia de comportamiento. Si un componente real necesita algo, se agrega una prop
   **opcional** cuyo valor por defecto deja todo igual. Meta de este diseño: **cero props nuevas**
   (todo lo resuelve la capa de la demo desde fuera). Si en alguna fase hace falta una, se anota en la
   sección 9.
2. Desde `/demo` no sale **ninguna** petición al servidor (ni `/api`, ni RSC, ni imágenes optimizadas).
   Los `page.tsx` reales (server components que leen la BD) **no se usan**; la demo replica su mapeo de
   props con datos del almacén.
3. `/demo` sigue público (`proxy.ts` ya excluye `demo(?:/|$)`); no se toca la autenticación.
4. Datos 100 % ficticios.

## 2. Arquitectura

```
/demo  (app/demo/page.tsx · server, solo metadata)
 └─ DemoApp (client; instala la capa en useLayoutEffect y pinta el CRM solo tras montar → sin hidratación de fechas)
     ├─ AlmacenProvider        estado en memoria + versión (useSyncExternalStore)
     ├─ InstalarCapaDemo       instala (useLayoutEffect) y retira (cleanup) la capa de red simulada
     ├─ NavegacionDemo         contextos de next/navigation falsos + intercepción de clics en <a>
     ├─ BrandRuntime (real)    variables de marca sobre <html>, igual que el CRM
     ├─ BarraDemo              «datos ficticios», color, tema, giro, recorrido, restablecer
     └─ AppShell (real)        children = <Pantalla ruta/> según la ruta simulada
```

### 2.1 Capa de API simulada (`lib/demo/instalar.ts`)

Se instala **solo mientras `/demo` está montado** y se retira al desmontar (cleanup del efecto), de modo
que `/login` y el CRM real nunca ven un `fetch` alterado:

| Pieza | Qué hace |
|---|---|
| `window.fetch` | Se reemplaza por `fetchDemo`. Peticiones a **mismo origen** se resuelven con la tabla explícita de endpoints (§4). Las que llevan cabecera `RSC`/`Next-Router-Prefetch` o `?_rsc=` (prefetch de `<Link>`) responden `204` vacío sin salir. Cualquier otra mismo origen que no sea un asset estático ya servido → error. Peticiones a otro origen → se bloquean. |
| Endpoint no soportado | `Response` JSON `501 {"error":"En la demo esto no se guarda"}` + `toast("En la demo esto no se guarda","error")`. Nunca se hace `fetch` real. |
| `window.EventSource` | Se reemplaza por `EventSourceDemo`: dispara `open` y escucha un bus interno; cuando el almacén cambia (mensaje nuevo simulado, etc.) emite `message`. Nunca abre `/api/stream`. |
| `navigator.sendBeacon`, `XMLHttpRequest.open` | Se envuelven igual (bloquean mismo origen no soportado). |
| `Notification`, `navigator.serviceWorker.register` | `Notification` se reemplaza por un stub (`permission:"denied"`, así el chat no pide permiso) y `register` rechaza: `PushSetup` pedía `/sw.js` (una petición real que `fetch` no intercepta). |

El `SessionProvider` del layout raíz (`next-auth`) pide `/api/auth/session` al montar: ese endpoint está
en la lista y responde `{}` (sin sesión) desde la capa, así que **no se toca `Providers.tsx`**.
Instalar en `useLayoutEffect` garantiza que la capa exista antes de cualquier `useEffect` de los hijos.

### 2.2 Navegación sin servidor (`NavegacionDemo`)

Los componentes reales usan `<Link href="/chat">`, `usePathname`, `useSearchParams`, `useRouter` y
`window.location.search`. La demo no cambia ninguno:

* **Ruta simulada** = hash: `/demo#/chat`, `/demo#/embudos`. **Query real** en la URL: `/demo?tab=marca#/configuracion`
  (así `window.location.search` —que lee `ConfiguracionCliente`— coincide con `useSearchParams`).
* `PathnameContext` y `SearchParamsContext` (de `next/dist/shared/lib/hooks-client-context.shared-runtime`) se
  proveen con la ruta/query simuladas → `usePathname()` y `useSearchParams()` reales las leen.
* `AppRouterContext` (`next/dist/shared/lib/app-router-context.shared-runtime`) se provee con un router
  falso: `push/replace` cambian la ruta simulada, `back/forward` usan `history`, **`refresh()` incrementa
  la versión del almacén** (equivale al `router.refresh()` que en el CRM vuelve a pedir las props al
  servidor: aquí se vuelven a calcular desde el almacén), `prefetch()` no hace nada.
* `<Link>` de Next navega con el router global (no con el contexto), así que un listener de
  **captura en `document`** intercepta los clics en `<a href="/…">` internos (ni `/demo`, ni `download`,
  ni modificadores): `preventDefault + stopPropagation` y cambia la ruta simulada. Los `<a href="/api/…">`
  (descargas CSV) y enlaces públicos (`/tienda/…`, `/reservar/…`) se interceptan con el toast de demo.
* `Link` hace prefetch al ser visible; esas peticiones mueren en `fetchDemo` (204) → cero tráfico.

### 2.3 Almacén (`lib/demo/almacen.ts`)

Objeto mutable en memoria (no localStorage) con: usuarios, canales, etiquetas, contactos (+etiquetas,
campos), conversaciones y mensajes, embudos/etapas/oportunidades, tareas, plantillas, módulos activos y
su config, ajustes de marca, doctores y citas, productos y movimientos, cajas/turnos/ventas, cotizaciones,
pedidos en línea, bots, campos personalizados. Se construye con `semilla(giro)`; `restablecer()` lo
reconstruye. Cada mutación incrementa `version` y notifica a los suscriptores (las pantallas se
recalculan y el bus del `EventSourceDemo` emite). En `localStorage` solo se guardan, como hoy, los
ajustes de personalización (preset, nombre, giro, módulos apagados) bajo la clave `ambar-demo-personalizacion`.

### 2.4 Elección del giro

Selector en la `BarraDemo` (y en Configuración › Módulos del giro): **clínica, retail, legal, automotriz,
inmobiliaria, viajes, educación** (los mismos de `VERTICALES` en `demo-data.ts`, con las plantillas de
`web/scripts/lib/demo-perfiles.mjs` como referencia de embudo/etapas/etiquetas/contactos). Cada giro define:
preset de color sugerido, nombre de marca, módulos activos (de `MODULOS`, que sale del catálogo real),
embudo, contactos, conversaciones, productos/citas/cotizaciones cuando aplican. Cambiar de giro
reconstruye el almacén (y conserva tema/color elegidos por la persona).

## 3. Pantallas, componentes reales y props

La demo arma las props **igual que el `page.tsx` correspondiente** (mismo mapeo campo a campo) a partir
del almacén. `refresh()` ⇒ se recalculan.

| Ruta demo | Componente real | Props que arma la demo (como el page.tsx) |
|---|---|---|
| (marco) | `AppShell` | `usuario={nombre,rol:"admin"}`, `marca` (de `normalizarMarca`+almacén), `contadoresIniciales` (no leídos / tareas vencidas del almacén). `identidad` **no** se pasa (sin IndexedDB de caja). Lo demás que monta (`CommandPalette`, `Toaster`, `Confirmador`, `PedirDatos`, `PushSetup`) funciona contra la capa. |
| `/` Inicio | `EncabezadoPagina`, `KpiCard`, `PrimerosPasos`, `EmptyState` | `page.tsx` es server: se replica su JSX con métricas calculadas del almacén (misma estructura/clases). |
| `/chat` | `ChatCliente` (+ `PanelConversacion`, `EnviarPlantilla`) | `conversaciones: ConversacionItem[]`, `plantillas`, `embudos[{id,nombre,etapas}]`, `usuarios`, `etiquetas`, `canales`, `usuarioId` |
| `/embudos` | `Board`, `NuevaOportunidad` (+ barra de embudos del page) | `columnasIniciales: Columna[]`; `NuevaOportunidad{embudoId,abrirInicial,etapas}` |
| `/contactos` | `ContactosCliente` | `contactos, etiquetas, usuarios, camposPersonalizados, citasActivo, tipoFicha` |
| `/tareas` | `TareasCliente` | `tareas, usuarios` |
| `/citas` | `CitasCliente` | `contactos, usuarios, doctores` |
| `/caja` | `CajaCliente` | `cajas, productos, turnoInicial, turnosRecientes, descuentoMaximo, usuario, identidad, ventasSinRed:false` (ver riesgo R3) |
| `/productos` | `ProductosCliente` | `productos` |
| `/cotizaciones` | `CotizacionesCliente` | `cotizaciones, productos, config, esAdmin, abrirNueva, contactoInicial, oportunidadInicial, baseUrl` |
| `/pedidos-en-linea` | `EnlacePublico`, `GestionCatalogo`, `FormularioModulo`, `Badge`, `EmptyState` | el page es JSX inline → se replica con los mismos componentes |
| `/configuracion` | `ConfiguracionCliente` | `embudos, usuarios, puestosSugeridos, canales, plantillas, ajustes, bots, orgs:null, modulosPorOrg:null, modulos` |
| módulos de giro extra | `PacientesCliente`/`ClientesCliente`, etc. (según fase) | igual criterio |

`modulos` (catálogo `MODULOS`) hoy vive en `lib/modulos.ts`, que importa `db`/`pg` y **no se puede meter
en un bundle de cliente**. Para usar la fuente única del catálogo (sin copiarlo) se extrae la constante
`MODULOS` y las funciones puras (`moduloPorClave`, `puestosPermitidosModulo`, `puestoPuedeAcceder`,
`puestoPuedeAtenderConversaciones`, tipo `ClaveModulo`) a `lib/modulos-catalogo.ts` y `lib/modulos.ts` las
**re-exporta** (`export * from`). Es un movimiento de código sin cambio de comportamiento; los
`check-*.ts` que importan `@/lib/modulos` siguen usando la misma API. (Alternativa descartada: duplicar
el catálogo → se desincroniza.)

## 4. Endpoints simulados (lista explícita)

Obtenidos con `grep "fetch("` sobre los componentes de la tabla anterior. Todo lo que no esté aquí →
error + toast. Respuestas con la misma forma que las rutas reales.

**Marco (AppShell, CommandPalette, PushSetup, next-auth)**
`GET /api/modulos` · `PATCH /api/modulos` (activar/config) · `GET /api/shell` · `GET /api/buscar?q=` ·
`GET|POST /api/push/suscribir` (inerte) · `GET /api/auth/session` · `/api/auth/csrf` y `/api/auth/signout`
(«Cerrar sesión» responde `{url:"/login"}`: sale de la demo al acceso real).

**Chat**
`GET /api/conversaciones[?q=]` · `GET|PATCH|DELETE /api/conversaciones/:id` ·
`GET /api/conversaciones/:id/mensajes` · `POST /api/mensajes/enviar` (agrega mensaje saliente al almacén;
texto, nota interna, imagen/doc/audio como mensaje ficticio, plantilla) · `POST /api/mensajes/programados` ·
`DELETE /api/mensajes/programados/:id` · `POST /api/ia/sugerir` (respuesta ficticia fija) ·
`GET|POST /api/meta/templates` (plantillas del almacén) · `PATCH /api/contactos/:id` ·
`POST /api/oportunidades` · `PATCH /api/oportunidades/:id` · `POST /api/tareas`.

**Embudos**
`POST /api/oportunidades` · `POST /api/oportunidades/mover` · `DELETE /api/oportunidades/:id`.

**Contactos**
`POST /api/contactos` · `PATCH|DELETE /api/contactos/:id` · `POST|DELETE /api/contactos/:id/etiquetas` ·
`POST /api/contactos/importar` · `POST /api/pacientes` · `POST /api/clientes` ·
`GET /api/campos-personalizados?entidad=`.

**Tareas**
`POST /api/tareas` · `PATCH|DELETE /api/tareas/:id`.

**Módulos por giro (Fase 3)**
Citas: `GET|POST /api/citas` · `PATCH /api/citas/:id` · `POST /api/doctores` · `PATCH /api/doctores/:id`.
Caja: `/api/caja/cajas`, turnos (abrir/cerrar/corte), `/api/ventas` (POST), movimientos de caja, `GET /api/buscar`.
Productos: `POST|PATCH /api/productos[/:id]` · `POST /api/productos/:id/movimientos` · `PATCH /api/productos/lote` ·
`POST /api/productos/importar` · `PATCH|POST /api/pedidos-en-linea/productos`.
Cotizaciones: `POST /api/cotizaciones` · `POST /api/cotizaciones/:id/enviar` · `POST /api/cotizaciones/config`.
Pedidos: `PATCH /api/pedidos-en-linea/ajustes`.
Configuración: `PATCH /api/ajustes` (Marca) · `GET|PATCH /api/modulos` (Módulos) ·
`/api/embudos`, `/api/etapas`, `/api/usuarios`, `/api/plantillas`, `/api/bots`, `/api/canales` (lectura/escritura sobre el almacén
cuando la pestaña lo necesita; el resto de pestañas muestra lo mismo que el CRM con sus acciones externas
—Meta, QR de WhatsApp, Embedded Signup— respondiendo «En la demo esto no se guarda»).

Los handlers viven en `lib/demo/api/*.ts` (uno por área) y se registran en `lib/demo/api/index.ts` como
`[método, patrón, handler]`. Un chequeo (`scripts/check-demo.ts`) recorre los `fetch(` de los componentes
usados y falla si hay una URL que no esté ni soportada ni en la lista de «no soportado a propósito».

## 5. Tiempo real

`AppShell` y `ChatCliente` hacen `new EventSource("/api/stream")`. En la demo `window.EventSource` es
`EventSourceDemo` (§2.1): no abre conexión, dispara `open` (el chat muestra «en vivo») y emite `message`
cuando el almacén simula un evento (p. ej. tras enviar un mensaje llega, a los pocos segundos, una
respuesta ficticia del cliente). Se instala/retira junto con `fetch`, por eso no hay que tocar los componentes.

## 6. Conservar lo que ya existe en la demo actual

| Hoy (`DemoCRM.tsx`) | En la demo nueva |
|---|---|
| Barra «Entorno seguro · datos 100 % ficticios» | `BarraDemo` fija arriba. El `AppShell` real es `h-screen`: se le resta el alto de la barra con una regla CSS acotada a `[data-demo-raiz]` (sin tocar `AppShell`). En 375 px la barra se compacta a una línea con iconos. |
| Selector de color (presets) y tema | Misma `BarraDemo`: presets de `BRAND_PRESETS` actualizan el almacén (`ajustes.marca*`) → el `BrandRuntime` real repinta; el tema usa el `ThemeToggle` real (`ambar-theme`). |
| Recorrido guiado (`PASOS_RECORRIDO`) | `RecorridoDemo`: tarjeta flotante idéntica a la actual; cada paso navega a una ruta real (`/`, `/chat`, `/embudos`, `/contactos`, módulos, `/configuracion`). Pasos de secciones apagadas se omiten. |
| Configuración de marca y módulos | `ConfiguracionCliente` real; pestañas Marca (`PATCH /api/ajustes`) y Módulos (`GET|PATCH /api/modulos`) trabajan sobre el almacén; el menú del `AppShell` se actualiza porque vuelve a pedir `/api/modulos` (ver R6). |
| «Restablecer demo» | Botón en `BarraDemo` y en la pestaña Marca: `restablecer()` del almacén + limpia `localStorage` de personalización + vuelve a `/` + reinicia el recorrido. |
| Selector de giro (`VERTICALES`) | `BarraDemo` + persistencia en `localStorage`. `demo-data.ts` se amplía (frases/métricas/módulos por giro y pasos del recorrido); `DemoCRM.tsx` se borra en la Fase 4. |
| «Ir al acceso real» | Se conserva en `BarraDemo` (`prefetch={false}`). |

## 7. Verificación (cada fase)

* **Sin red desde /demo**: Playwright (instalado fuera de `package.json`, p. ej. en `/tmp`), app con
  `next build` + `next start`, 1280 y 375 px, claro y oscuro; se registran `page.on('request')` y
  `route('**/*')`: falla si hay cualquier petición que no sea el documento `/demo` y assets de
  `/_next/static`, fuentes y `data:`/`blob:`. Se recorren todas las pantallas y se ejecutan las acciones
  principales (enviar mensaje, mover tarjeta, crear/completar/borrar tarea, etc.).
* **Fidelidad**: con Postgres desechable (sin `ambarcrm-db` ni `web/.env`), sembrar con
  `web/scripts/seed-demo-*.mjs`, iniciar sesión y capturar la pantalla real; capturar la misma en `/demo`;
  comparar lado a lado y revisar a tamaño legible (diferencias solo en datos).
* **CRM real intacto**: `tsc --noEmit`, `npm run lint`, `next build`, todos los `web/scripts/check-*.ts`
  con `npx tsx` y los `prisma/scripts/test-*-e2e.ts` contra un Postgres desechable armado con
  `schema.sql` + `web/prisma/sql/multi-tenant.sql` + `actualizaciones.sql`.

## 8. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Prefetch de `<Link>` y `router.refresh()` generan peticiones RSC al servidor. | El router de contexto es falso (`refresh` local) y `fetchDemo` responde 204 a todo RSC/prefetch; Playwright lo comprueba. Si Next cambia el mecanismo, el test lo detecta. |
| R2 | Imports de cliente que arrastran servidor (`lib/modulos.ts` → `db`, libs con `@prisma/client`). | Solo se importan módulos puros; catálogo extraído a `modulos-catalogo.ts` (§3). `next build` + `tsc` lo validan. |
| R3 | `CajaCliente` usa IndexedDB/venta sin red (`identidad`, `caja-offline`) y llamadas propias a `/api/caja/*`. | `ventasSinRed:false`, `identidad` no se pasa si la prop lo permite; si es obligatoria se pasa una identidad ficticia y la sincronización no tiene endpoint (se corta). Se revisa en la Fase 3; si hace falta, prop opcional (§9). |
| R4 | `AppShell` es `h-screen` y la barra demo le quita alto; `fixed` de la navegación móvil. | Regla CSS acotada a `[data-demo-raiz]`; se verifica en 375 px. |
| R5 | Deriva: si un `page.tsx` real cambia su mapeo de props, la demo no se entera. | Cada pantalla de la demo documenta el `page.tsx` que replica; `check-demo.ts` valida endpoints; se añade a la lista de revisión de MODULOS.md. |
| R6 | `AppShell` solo lee `/api/modulos` al montar; apagar un módulo en Configuración no actualiza el menú sin recargar. | En el CRM real ocurre igual (hay que recargar). La demo conserva su comportamiento anterior (el menú cambia al instante) re-montando el `AppShell` con `key` al cambiar módulos/marca, sin tocar el componente. |
| R7 | Hidratación: `AppShell` usa `new Date()` y localStorage. | `DemoApp` muestra «Cargando demo…» en servidor y pinta el CRM tras montar. No se usa `ssr:false` porque el `SessionProvider` raíz pediría `/api/auth/session` antes de que la capa existiera. |
| R8 | Imágenes con `next/image` optimizado piden `/_next/image`. | En la demo solo se usan `data:` URIs / SVG o `unoptimized` (el logo del `AppShell` ya lo es). |
| R9 | Mutaciones de objetos del almacén compartidos entre props y estado interno de componentes (`Board` copia `columnasIniciales`). | Las pantallas entregan copias (`structuredClone`) y los handlers devuelven la forma que el componente espera tras `refresh`. |
| R10 | Cuota/tiempo: son muchas pantallas. | Fases ordenadas por valor; cada fase deja el build verde y se publica por separado. |

## 9. Props opcionales agregadas a componentes reales

Ninguna hasta la Fase 1 (la capa externa bastó). Sí hubo un movimiento de código sin cambio de comportamiento: `MODULOS` y las funciones puras de acceso pasaron a `lib/modulos-catalogo.ts` y `lib/modulos.ts` las re-exporta. Se listan aquí (con el motivo y por qué el CRM real no cambia) si alguna fase las
necesita.
