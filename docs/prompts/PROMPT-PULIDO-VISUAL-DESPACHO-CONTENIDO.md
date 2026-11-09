# Prompt para OpenCode — pulido visual de Despacho y Contenido (demo REFMEX)

> Revisión hecha el 9-nov-2026 sobre la demo viva (`/login?org=refmex`) a 1568 px de ancho.
> Solo toca UI/UX y presentación; **no cambies reglas de negocio, API, esquema ni permisos**.
> Copia desde "## Prompt".

## Prompt

Trabajas en AmbarCRM (`web/`), rama `modulos-despacho-contenido`. Lee `web/DESIGN.md`, los
componentes de `components/despacho/*` y `components/contenido/*`, y `components/taller/TallerVisuales.tsx`
(es el nivel visual de referencia). Mantén tokens, claro/oscuro y 375/1440 px sin desbordes.
Sin dependencias nuevas. Sin push ni deploy. Commits `style(despacho): …` / `style(contenido): …`.

### Despacho

1. **Resumen sin protagonista.** El 19 % global es solo un KPI más. Conviértelo en el héroe: anillo
   (SVG simple, sin librería) grande a la izquierda con el % global y "x de y actividades", y a su
   lado los otros tres KPI (clientes, atrasadas, por vencer en 3 días). Agrega selector de periodo
   con flechas ‹ noviembre 2026 ›.
2. **Color con lógica única.** Hoy "Avance por cliente" es todo rojo (incluso 29 %) y "Carga por
   responsable" todo azul. Usa una sola regla en `despacho.ts` (verde ≥ 80, ámbar 40–79, rojo < 40
   **o** con atrasadas) para clientes y personas, siempre con texto además del color. Si el mes va
   a medias, considera comparar contra el avance esperado a la fecha en vez de pintar todo rojo.
3. **Atrasadas.** Fechas ISO (`2026-11-05`) → "5 nov" con "hace 4 días" en rojo. Agrega columna del
   responsable (avatar) y chip de estado legible (más grande, contraste AA). Máximo 5 filas con
   "Ver todas".
4. **Tablero no es tablero.** Hoy es una cuadrícula de tarjetas gigantes con las tres botones de
   estado repetidos en cada una, mezcla actividades completadas de octubre y el filtro de periodo
   es un `input month` nativo vacío. Rehazlo como columnas reales: Pendiente · En proceso · En
   revisión · Completada, con bloqueada marcada en la tarjeta. Periodo = mes actual por defecto
   (completadas del mes). Tarjeta compacta: cliente, actividad, avatar del responsable, fecha
   límite ("vence 8 nov", rojo si atrasada). Cambio de estado con un menú en la tarjeta (no tres
   botones fijos). En móvil: columnas colapsables apiladas. Fechas siempre con día y mes
   ("2 oct"), nunca "Límite 02-oct" ambiguo.
5. **Clientes.** Tarjetas pobres: agrega barra de avance del mes, responsable (avatar) y atrasadas;
   quita el nombre repetido (nombre y razón social iguales) y haz clicable toda la tarjeta en vez
   de "Abrir ficha". Ordenar por atrasadas/avance.
6. **Ritmo y márgenes.** Alinea el contenido a un contenedor consistente (mismo ancho máximo y
   padding que Taller), un mismo espacio vertical entre bloques (8/16/24), y revisa que título,
   pestañas y filtros compartan el mismo borde izquierdo.

### Contenido

1. **Semana.** Hoy son 3 columnas y los días de la semana se parten en dos filas. Usa 7 columnas
   en escritorio ancho (≥ 1280 px) con scroll interno controlado, o una fila por día en pantallas
   medianas; en móvil lista por día. Encabezado "Lunes 9" (hoy "Lunes 11–09"), el día actual
   resaltado, días vacíos con estado vacío discreto ("Sin publicaciones" + botón "+").
2. **Horas incorrectas (posible bug).** Las piezas muestran "9 nov 2026, 3:00 a.m.", "2:00 a.m.",
   "4:00 a.m." Parece desfase de zona horaria (UTC vs America/Mexico_City) o seed con horas raras.
   Investiga: si es de presentación, corrige con `timeZone: "America/Mexico_City"` explícito; si es
   del seed, usa horas de publicación realistas (9:00, 13:00, 18:00). Informa qué era.
3. **Tarjeta.** Distingue canal con icono y color de marca discreto (no solo texto "Instagram ·
   Carrusel"), hora en negrita, estado como chip con icono. Separa visualmente Publicado
   (atenuado con ✓), Programado, Por revisar y Cambios solicitados. Texto mínimo 12 px y contraste
   AA en los grises secundarios (hoy ~11 px y claros).
4. **Resumen de la semana.** "Semana · 12 pieza(s) · 3 por revisar" está perdido a la derecha en
   texto diminuto. Pásalo a chips arriba: "5 publicadas · 3 programadas · 3 por revisar".
5. **Filtros.** `input date` nativo para la semana → flechas ‹ 9–15 nov › y botón "Hoy". Un solo
   botón "Nueva pieza"; evita duplicarlo con el de "Nueva oportunidad" global (el módulo no debe
   verse como parte de oportunidades: si el botón global es de AppShell, déjalo, pero que el
   primario de la página destaque).
6. **Revisión.** Al abrir la pieza, copy a la izquierda y comentarios a la derecha (ya definido);
   en la lista agrega el tiempo que lleva esperando revisión y ordena por fecha de publicación.

### Transversal

- Estados vacíos con ilustración sencilla/ícono y acción siguiente; skeletons que respeten el
  layout final.
- Foco visible, `aria-label` en iconos, navegación por teclado en el menú de estado y las
  tarjetas.
- Los chips de estado usan fondo + texto + icono, nunca solo color.
- Revisa a 375, 768 y 1440 px, claro y oscuro. Genera capturas nuevas en
  `docs/capturas-despacho/` y `docs/capturas-contenido/` (sobrescribe las anteriores) y revísalas
  tú mismo.

### Entregable

Lista de cambios por pantalla, qué era el desfase de horas, capturas nuevas, y salida de `tsc`,
lint y los `check-*` de ambos módulos. Si algo exige cambiar datos o lógica, **no lo hagas**:
anótalo como sugerencia.
