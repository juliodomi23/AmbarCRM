# Prompt para OpenCode — módulos Despacho contable y Contenido

> **Contexto:** reunión del 8-nov-2026 con un contador que tiene un despacho. Quiere seguimiento de
> actividades casi en tiempo real con porcentajes de avance por nivel (gerente general, personal a
> cargo, cliente). Las actividades fijas de cada cliente **aún no las entrega**, así que todo debe
> ser configurable desde pantalla, nada escrito a fuego. El segundo módulo es para el área de
> marketing de Ámbar Rojo: copys, revisiones y calendario semanal de lo publicado / por publicar.
> Copia desde "## Prompt" y pégalo en OpenCode.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM/web`, Next.js + Prisma + Postgres con RLS).
Vas a crear **dos módulos nuevos e independientes**: `despacho` (seguimiento de actividades de un
despacho contable) y `contenido` (copys, revisión y calendario de publicaciones). Responde y comenta
en español.

### 0. Rama y reglas

- Antes de empezar corre `git status` y `git log -5`. Hay un archivo sin seguimiento
  (`docs/VARIABLES-CORREO-CRMLITE.md`): **no lo toques ni lo incluyas en commits**. Crea la rama
  `modulos-despacho-contenido` desde la rama base actual. Commits `feat(despacho): …` /
  `feat(contenido): …`, pequeños y por fase.
- **Lee primero, en este orden** (son el patrón a copiar, no lo reinventes):
  `MODULOS.md`, `MULTI-TENANT.md`, `docs/TALLER-MECANICO.md`, `web/src/lib/modulos-catalogo.ts`,
  `web/src/lib/puestos.ts`, `web/prisma/sql/actualizaciones.sql` (bloque de `taller_*`),
  `web/src/lib/con-modulo.ts`, `web/src/lib/retail-db.ts` (`transaccionTenant`),
  `web/src/app/api/taller/ordenes/route.ts` y `[id]/route.ts`,
  `web/src/app/(app)/taller/page.tsx`, `web/src/components/taller/*` (estructura, navegación,
  `TallerVisuales.tsx`), `web/DESIGN.md`, `web/scripts/check-taller.ts`,
  `web/scripts/seed-demo-taller.mjs`, `web/scripts/check-arquitectura-modulos.ts` y
  `web/scripts/check-permisos-modulos.ts`.
- **Reglas del repo (obligatorias):** tablas con `org_id` DEFAULT
  `NULLIF(current_setting('app.current_org', true), '')::bigint`, RLS con política `org_isolation`,
  GRANT a `crm_app`, índices por org y llaves foráneas compuestas `(id, org_id)` como en `taller_*`;
  todo en `web/prisma/sql/actualizaciones.sql`, **idempotente** (`IF NOT EXISTS`), y reflejado en
  `schema.prisma`. APIs con `conModulo("clave", …)`; páginas con `moduloActivo(...)` + `redirect("/")`.
  Escrituras en `transaccionTenant()`. Control optimista con columna `version` (rechazar edición
  sobre datos desactualizados, 409). Validar y acotar todo input en el servidor.
  **Sin dependencias nuevas.** Sin push, sin deploy, sin tocar producción ni servidores.
- Los módulos nacen **apagados** por organización (no usar `soloOrgId`). Se activan en
  Configuración → Clientes Ámbar CRM.
- `scripts/check-arquitectura-modulos.ts` cuenta rutas con `conModulo(` (hoy 102/110). Cuando
  agregues rutas, **actualiza esos números y sus mensajes** con el conteo real; no borres la aserción.
- No dupliques lo que ya existe: el módulo `marketing` actual (campañas con objetivo/presupuesto) y
  el modelo `Tarea` (tareas de oportunidades del CRM) **no se modifican**. `contenido` puede
  referenciar una campaña de `marketing` de forma opcional.

---

## PARTE A — Módulo `despacho` (`/despacho`)

### A1. Idea del negocio (léela bien)

Un despacho contable tiene **clientes**. Cada cliente tiene **procesos fijos** que se repiten cada
periodo (ej. declaración mensual, nómina, contabilidad electrónica; el contador entregará la lista
real después) y **procesos extraordinarios** puntuales (ej. alta de un trámite, aclaración con el
SAT). Cada proceso se compone de **actividades**, y cada actividad tiene un responsable y una fecha
límite. El avance se mide en **porcentaje de actividades completadas** y se muestra en tres niveles:

1. **Dirección / gerencia general:** % global del despacho, % de cada persona del equipo y % de
   cada cliente. Ve todo.
2. **Personal a cargo:** su propio % y el de los clientes que le tocan. Solo trabaja sus actividades.
3. **Cliente:** % del cliente en el periodo, con sus procesos fijos y extraordinarios.

"Casi en tiempo real": el tablero debe refrescarse solo (ver A6) y cada cambio de estado debe
reflejarse en los porcentajes sin recargar manualmente.

### A2. Modelo de datos

Reutiliza `contactos` como el cliente del despacho (igual que Taller reutiliza el contacto: conserva
teléfono, chats e historial). Tablas nuevas (prefijo `despacho_`):

- `despacho_clientes`: `contacto_id` (único por org), `rfc` opcional, `responsable_id` (usuario
  principal), `activo`, `notas`, `version`. Ficha extensión del contacto, no lo duplica.
- `despacho_procesos`: **plantilla** de proceso fijo. `nombre`, `periodicidad`
  (`semanal|mensual|bimestral|trimestral|anual`), `activo`.
- `despacho_proceso_actividades`: actividades de la plantilla. `proceso_id`, `nombre`, `orden`,
  `dia_limite` (día del periodo en que vence; ej. 17 para mensual), `activo`.
- `despacho_cliente_procesos`: asigna una plantilla a un cliente. `cliente_id`, `proceso_id`,
  `responsable_id` (opcional, hereda del cliente), `activo`. Único `(cliente, proceso)`.
- `despacho_actividades`: **instancias** del trabajo real. `cliente_id`, `cliente_proceso_id`
  (nullable → si es null es extraordinaria), `plantilla_actividad_id` (nullable), `tipo`
  (`fijo|extraordinario`), `titulo`, `periodo` (date, primer día del periodo), `responsable_id`,
  `fecha_limite`, `estado` (`pendiente|en_proceso|en_revision|completada|bloqueada`),
  `completada_at`, `notas`, `version`. Índice único parcial `(cliente_id, plantilla_actividad_id,
  periodo)` donde `plantilla_actividad_id` no es null → la generación es idempotente.
- `despacho_actividad_cambios`: historial (estado anterior/nuevo, usuario, fecha, nota), como
  `taller_orden_cambios`.

Solo claves foráneas que comprueben el mismo tenant `(id, org_id)`.

### A3. Reglas de negocio (funciones puras con su check)

En `web/src/lib/despacho.ts` (sin db, importable desde cliente), con `web/scripts/check-despacho.ts`:

- `porcentajeAvance(actividades)` → `completadas / total` redondeado a entero; **sin actividades
  devuelve `null`** (se muestra "—", nunca 0 % ni 100 %). `bloqueada` cuenta en el total, no como
  completada. Las actividades canceladas/archivadas no existen en v1 (no agregar estado de más).
- `estaAtrasada(actividad, ahora)`: no completada y `fecha_limite` pasada (zona
  `America/Mexico_City`, UTC-6 todo el año, igual que el filtro de periodo de Taller).
- `agruparAvance(actividades, clave)` para sacar el % por persona, por cliente y global con la misma
  función; **una sola fuente de verdad del cálculo**, no lo repitas en componentes.
- `periodoDe(fecha, periodicidad)` y `fechaLimiteDe(periodo, diaLimite)` (si el día no existe en el
  mes, usar el último día; ej. 31 en febrero).
- Transiciones: cualquiera → cualquiera es válido salvo que `completada` exige que la actividad no
  esté `bloqueada` sin pasar antes por otro estado. Mantén la regla mínima y documentada. Al pasar a
  `completada` se guarda `completada_at`; si se reabre se limpia.
- El check cubre: 0 actividades, todas completadas, bloqueadas, día 31 en febrero, atraso en el
  borde de medianoche UTC-6, y que persona + cliente + global suman coherente sobre un mismo juego
  de datos.

### A4. Puestos y permisos

Agrega los puestos **Director general**, **Gerente general** y **Contador** al catálogo
(`puestos.ts` y `puestosPorDefecto` del módulo: `Administrador`, `Director general`,
`Gerente general`, `Contador`). Reglas, aplicadas **en el servidor** (no solo ocultando botones):

- `Administrador`, `Director general` y `Gerente general` ven todo y pueden crear/editar clientes,
  plantillas, reasignar actividades y generar el periodo.
- `Contador` (personal a cargo) solo ve y cambia el estado de **sus** actividades (las que tiene como
  `responsable_id`) y ve el % de los clientes donde tiene actividades. No reasigna ni edita plantillas.
- Verifica con `check-permisos-modulos.ts` / un test e2e que un Contador recibe 403 al reasignar o
  al tocar actividades ajenas.

### A5. Pantallas (la parte visual: que se vea bien y sea útil de un vistazo)

Usa el mismo lenguaje visual de Taller y `DESIGN.md` (tokens, claro/oscuro). Navegación interna tipo
`TallerNavegacion`: **Resumen · Tablero · Clientes · Mi trabajo · Configuración**.

1. **Resumen (`/despacho`)** — la pantalla que impresiona al director:
   - Anillo/gauge grande con el **% global del periodo** y selector de periodo (mes actual por
     defecto, flechas ‹ ›).
   - Tarjetas de KPI: actividades totales, completadas, **atrasadas** (rojo), por vencer en 3 días.
   - **Barras por persona** (nombre, % y "x de y"), ordenadas por % o por atrasadas.
   - **Lista de clientes** con barra de progreso y semáforo (verde ≥ 80 %, ámbar 40–79 %, rojo < 40 %
     o con atrasadas); clic abre la ficha del cliente.
   - Si el usuario es Contador, esta misma pantalla solo muestra su propio avance y sus clientes.
   - Colores nunca como único indicador: acompaña con texto/ícono (accesibilidad).
2. **Tablero (`/despacho/tablero`)** — columnas por estado (`pendiente → en_proceso → en_revision →
   completada`, `bloqueada` aparte). Tarjeta: cliente, actividad, responsable (avatar con
   `AvatarNombre`), fecha límite con indicador de atraso, etiqueta fijo/extraordinario. Filtros por
   persona, cliente, tipo y periodo. Revisa `components/kanban` y reutilízalo si encaja; si no, mover
   con botones de estado en la tarjeta (sin librería de drag & drop nueva). En móvil, columnas
   apiladas/colapsables, sin desbordar a 375 px.
3. **Cliente (`/despacho/clientes/[id]`)** — encabezado con % del cliente en el periodo; sección
   **Procesos fijos** (cada proceso como bloque con su checklist de actividades y su propio %) y
   sección **Extraordinarios** con botón "Agregar actividad". Historial de cambios al final.
4. **Clientes (`/despacho/clientes`)** — tabla con búsqueda: cliente, responsable, % del periodo,
   atrasadas. Alta de cliente desde un contacto existente o contacto nuevo.
5. **Mi trabajo (`/despacho/mi-trabajo`)** — mis actividades agrupadas: Atrasadas / Hoy / Esta semana
   / Después, con cambio de estado de un toque.
6. **Configuración (`/despacho/configuracion`, solo dirección/gerencia/admin)** — CRUD de plantillas de
   proceso y sus actividades (nombre, orden, día límite), asignar procesos a clientes y botón
   **"Generar periodo"**: crea las instancias del periodo para todos los clientes activos según sus
   procesos. Es idempotente (usa el índice único), muestra cuántas creó y cuántas ya existían, y
   nunca borra ni modifica actividades existentes.

Estados vacíos útiles (`EmptyState`) que expliquen el siguiente paso ("Aún no hay procesos: crea el
primero en Configuración"). Confirmaciones con `Confirmador`, nunca `confirm()` nativo. Skeletons
con `Esqueletos` / `loading.tsx`.

### A6. Tiempo casi real

Sin websockets nuevos: revisa si `api/stream` ya sirve para esto; si no, **polling cada 30 s** con
`router.refresh()` solo cuando la pestaña está visible (`document.visibilityState`), y refresco
inmediato tras cada acción propia. Evita el error de hidratación de fechas que ya tuvo Taller
(render de fechas dependiente de zona horaria): formatea con la zona `America/Mexico_City` explícita.

### A7. Datos de demostración

`web/scripts/seed-demo-despacho.mjs`, idempotente, con la guarda `ALLOW_DEMO_SEED=1` y `ORG_SLUG`
como `seed-demo-taller.mjs`. Org `demo-despacho` con: 1 Director general, 1 Gerente general, 3
Contadores, 8 clientes (nombres ficticios), 4 plantillas (mensual, bimestral, anual, semanal) con
3–5 actividades cada una y un periodo ya generado con avances variados (un cliente al 100 %, uno al
0 %, uno con atrasadas y una actividad bloqueada) + 3 extraordinarias. **Datos 100 % ficticios**:
ningún RFC, nombre o cifra real del cliente.

---

## PARTE B — Módulo `contenido` (`/contenido`)

Para el área de marketing de Ámbar Rojo: escribir copys, revisarlos y ver qué se publicó y qué se
publicará cada semana. **No publica en redes** (la integración con Meta ya está en otro frente);
solo organiza el trabajo. Rótulo del módulo: "Contenido y copys".

### B1. Modelo de datos

- `contenido_piezas`: `titulo`, `canal` (`facebook|instagram|tiktok|whatsapp|linkedin|otro`),
  `formato` (`post|reel|carrusel|historia|video|articulo|otro`), `copy` (texto largo, máx. 5000),
  `notas_diseno` opcional, `enlace_material` opcional (URL a Drive/Canva; validar `https`),
  `estado`, `redactor_id`, `revisor_id` (nullable), `fecha_publicacion` (timestamptz nullable),
  `publicada_at`, `contacto_id` opcional (si la pieza es para un cliente), `campana_id` opcional →
  `campanas_marketing` con FK compuesta al mismo tenant, `version`.
- `contenido_comentarios`: `pieza_id`, `usuario_id`, `texto`, `tipo` (`comentario|cambios|aprobacion`),
  fecha. Es el hilo de revisión.
- `contenido_cambios`: historial de estado (igual que Taller).

Estados y flujo: `idea → redaccion → revision → cambios → aprobado → programado → publicado`.
`cambios` regresa a `revision` cuando el redactor reenvía. Reglas (funciones puras en
`web/src/lib/contenido.ts` con `check-contenido.ts`):

- Pasar a `aprobado` lo hace un **revisor distinto del redactor** o un administrador; el comentario
  de tipo `aprobacion` queda registrado.
- Editar el `copy` de una pieza `aprobado` o `programado` la regresa a `revision` (como Taller
  vuelve a diagnóstico al cambiar conceptos) y avisa en pantalla por qué.
- `programado` exige `fecha_publicacion`. `publicado` guarda `publicada_at`.
- `semanaDe(fecha)` (lunes a domingo, `America/Mexico_City`) y `piezasDeLaSemana()`, con su check
  (borde domingo→lunes, cambio de año).

Puestos del módulo: `Administrador`, `Mercadotecnia`, `Dirección comercial` (ya existen en
`puestos.ts`). Redactor edita sus piezas; revisar/aprobar requiere ser revisor asignado, Dirección
comercial o Administrador.

### B2. Pantallas

Navegación interna: **Semana · Tablero · Por revisar · Piezas**.

1. **Semana (`/contenido`)** — vista principal. Cuadrícula lunes a domingo (en móvil, lista por día)
   con las piezas en su día de publicación: tarjeta con canal (ícono + color), formato, título,
   estado (chip) y redactor. Distingue claramente **Publicado** (atenuado con ✓) de **Programado** y
   de **Por publicar sin aprobar** (alerta). Cabecera con flechas ‹ semana ›, botón "Hoy" y un
   resumen: "5 publicadas · 3 programadas · 2 sin aprobar". Clic abre la pieza en un panel lateral
   (drawer) sin salir de la vista. Botón "Nueva pieza" con la fecha del día pre-seleccionada.
2. **Tablero (`/contenido/tablero`)** — columnas por estado con filtros por redactor, canal y
   campaña. Mover estado con botones en la tarjeta.
3. **Por revisar (`/contenido/revision`)** — cola del revisor: piezas en `revision`, la más
   próxima a su fecha primero. Detalle con el copy a la izquierda y el hilo de comentarios a la
   derecha; botones **Pedir cambios** (exige comentario) y **Aprobar**. Contador visible en el menú
   (badge) con las piezas pendientes de mi revisión.
4. **Piezas (`/contenido/piezas`)** — tabla con búsqueda y filtros; edición completa de la pieza:
   copy con contador de caracteres según el canal (aviso, no bloqueo), vista previa del texto tal
   como se verá, botón **Copiar copy** al portapapeles, y enlace al material.

Estados vacíos, confirmaciones con `Confirmador`, skeletons y 375/1440 px sin desbordamiento, igual
que la Parte A.

### B3. Datos de demostración

`web/scripts/seed-demo-contenido.mjs` (misma guarda y `ORG_SLUG`): una semana completa con 10 piezas
en estados variados (2 publicadas, 3 programadas, 2 en revisión, 1 con cambios pedidos y su hilo,
1 idea, 1 sin fecha), canales mixtos, textos ficticios.

---

## PARTE C — Registro, pruebas y entrega

### C1. Registro de los módulos

- `modulos-catalogo.ts`: dos entradas nuevas, `despacho` (área "Despacho contable", icono SVG
  propio de estilo consistente) y `contenido` (área "Marketing y crecimiento"). Ruta, descripción y
  `puestosPorDefecto` como arriba. Confirma que AppShell y Ctrl+K los toman solos del catálogo.
- `puestos.ts`: `despacho: ["Director general", "Gerente general", "Contador"]`, y los puestos de
  `contenido` ya existen.
- Si el menú lateral se queda largo con las subpáginas, usa el patrón de navegación interna del
  módulo (como Taller), no más entradas en el menú principal.

### C2. Pruebas (todas deben pasar; lo que falle se reporta primero)

1. `check-despacho.ts` y `check-contenido.ts` (funciones puras, ver A3 y B1).
2. `prisma/scripts/test-aislamiento.ts`: agregar todas las tablas nuevas; ninguna org ve filas de otra.
3. Un test e2e por módulo (patrón de `test-taller-*`): despacho → generar periodo dos veces (la
   segunda crea 0) → Contador no puede tocar actividad ajena (403) → % cambia al completar → reabrir
   limpia `completada_at`; contenido → redactor no puede aprobar su propia pieza → pedir cambios
   exige comentario → editar copy aprobado la regresa a revisión → programar sin fecha da 400.
4. `check-arquitectura-modulos.ts` con los conteos reales, `check-permisos-modulos.ts` y el resto de
   los `check-*.ts`; la batería `test-*.ts` (único fallo aceptado de antemano:
   `test-lealtad-aurum.ts`), `tsc`, lint y `next build`. La migración SQL se aplica **dos veces**
   sobre una BD desechable sin error.
5. Capturas en `docs/capturas-despacho/` y `docs/capturas-contenido/`: cada pantalla principal en
   375 y 1440 px, claro y oscuro. Revísalas tú mismo: sin desbordes, sin texto cortado, contraste
   legible, estados vacíos y con datos.

### C3. Documentación

Secciones nuevas en `MODULOS.md` y `docs/DESPACHO.md` / `docs/CONTENIDO.md` al estilo de
`docs/TALLER-MECANICO.md`: estados, reglas, tablas, permisos por puesto y límites. Deja explícito
en `DESPACHO.md` que **las plantillas reales de procesos y actividades están pendientes de que el
contador las entregue** y que el seed es solo demostración.

### C4. Fuera de alcance (no lo hagas)

Notificaciones por WhatsApp o correo, cálculo de impuestos, integración con el SAT/CFDI, subir
archivos de clientes, cobros/honorarios del despacho, publicación real en redes, métricas de redes,
permisos finos por cliente más allá de "responsable", reportes PDF, app móvil. Si crees que alguno
hace falta, anótalo al final del reporte como sugerencia, no lo implementes.

### Entregable

Reporte con: lista de archivos tocados, salidas **literales** de las pruebas (lo que falle, primero),
rutas de las capturas, qué decisiones tomaste donde el prompt no era explícito, y la lista de
preguntas abiertas para el contador (qué procesos fijos reales tiene, si el % debe ponderar
actividades por esfuerzo, quién puede ver a quién). **Sin** push, deploy ni conexión a producción.
