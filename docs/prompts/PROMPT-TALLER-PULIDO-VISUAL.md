# PROMPT — Pulido visual del módulo Taller mecánico (demo del martes)

Rama `taller-mecanico` (último commit `8022299`). Trabaja en `web/`. Lee `web/AGENTS.md` (este Next.js tiene cambios incompatibles: revisa `node_modules/next/dist/docs/` antes de tocar rutas o componentes) y `web/DESIGN.md` (tokens, `.surface`, `.surface-lift`, `.tnum`, `font-display`, sombras, `.stagger`, `.animate-fade-up`, `prefers-reduced-motion`). Reglas: sin push, merge ni deploy; no tocar producción; **solo estilo y estructura visual**, cero cambios de lógica, APIs, esquema ni textos funcionales. Un commit por pantalla.

## Contexto
Julio enseñará este módulo a un prospecto (dueño de un taller mecánico) el martes 3-nov. Funciona, pero se ve básico: tablas y formularios planos. Debe verse como un producto terminado, al nivel visual del resto del CRM (Chat, Embudo, Citas), pensado para un taller: mostrador, tablet y celular.

Archivos: `src/components/taller/` (`TallerVehiculos`, `TallerVehiculoDetalle`, `TallerOrdenes`, `TallerOrdenDetalle`, `TallerRefacciones`, `TallerRecordatorios`, `TallerAprobacionPublica`, `LinkModuloTaller`) y las páginas en `src/app/(app)/taller/` y `src/app/taller-aprobacion/`.

## Reglas visuales (obligatorias)
- Solo tokens del sistema (`bg-primary/10`, `text-muted`, `border-border`, `shadow-soft`…). **Nada de hexadecimales ni familias fijas de Tailwind** (`bg-red-500`…). Debe seguir la marca por organización (presets) en claro y oscuro.
- Títulos con `font-display`; cantidades, folios, placas, km y dinero con `.tnum`. Filas y botones táctiles de mínimo 40 px; letra mínima 12 px.
- El color acompaña texto o icono, nunca comunica solo. Contraste AA.
- Entradas con `.stagger` / `.animate-fade-up` solo donde ayuden; respetar `prefers-reduced-motion`.
- Iconos SVG en línea, mismo estilo que el resto (trazo, tamaño). Sin librerías nuevas ni emojis.
- Sin desbordes horizontales a 375 px.

## Qué mejorar, por pantalla

1. **Encabezado de módulo común**: título con `font-display`, subtítulo breve, acciones a la derecha, y pestañas de navegación del módulo (Vehículos · Órdenes · Refacciones · Recordatorios) con estado activo claro, accesibles (`role="tablist"`/`aria-current`). Hoy `LinkModuloTaller` es un enlace suelto.

2. **Órdenes (`/taller/ordenes`)**: tablero tipo Kanban por estado (Recibido → Diagnóstico → Esperando aprobación → En reparación → Listo → Entregado) con columna coloreada por estado, contador y tarjetas compactas: folio `#`, placa en insignia tipo placa, marca/modelo, falla en una línea, mecánico (avatar con iniciales), fecha promesa con aviso si vence hoy o está vencida, y total. En móvil, columnas desplazables con snap. Estado vacío por columna con texto amable. Mantén la vista de lista si ya existe, como alternativa conmutable.

3. **Detalle de orden (`/taller/ordenes/[id]`)**: es la pantalla más importante de la demo.
   - Cabecera con folio, estado como insignia grande y **línea de progreso** de los 6 estados (paso actual resaltado, pasos hechos con check).
   - Dos columnas en escritorio: izquierda = vehículo y cliente (tarjeta con placa estilizada, marca/modelo/año, km, teléfono), falla reportada, diagnóstico, historial como línea de tiempo vertical con actor (equipo/cliente) y hora; derecha = **resumen de cobro** pegajoso (subtotal mano de obra, refacciones, total, pagado, **saldo** destacado en color de advertencia o éxito) y botón de acción principal según el estado siguiente.
   - Tabla de conceptos limpia: tipo con icono (llave = mano de obra, engrane = refacción), descripción, cantidad y precio alineados con `.tnum`, total por fila.
   - Pagos como lista con método (icono) y fecha; formulario de pago en tarjeta aparte.
   - Fotos en rejilla con miniaturas, etiqueta de tipo (ingreso/daño/evidencia) y zona de carga clara con arrastrar y soltar visible.
   - Banner contextual cuando espera al cliente («Esperando aprobación del cliente» con el enlace copiable y botón «Copiar enlace»).

4. **Vehículos (`/taller`)**: tarjetas en rejilla en vez de tabla densa: placa estilizada, marca/modelo/año, propietario, km con `.tnum`, y chip del último estado de servicio u «Sin servicios». Buscador grande arriba con icono y filtro rápido por cliente. Ficha del vehículo (`/taller/vehiculos/[id]`): cabecera con datos clave, historial de órdenes como línea de tiempo y recordatorios próximos en tarjeta.

5. **Refacciones**: tabla ordenada con barra de existencia (verde / ámbar bajo el mínimo / roja en cero) y etiqueta «Existencia baja» con texto; buscador; precio y costo con `.tnum`; indicador de margen.

6. **Recordatorios**: tres grupos con encabezado y contador («Vencidos», «Próximos 30 días», «Más adelante»), tarjeta por recordatorio con vehículo, tipo, fecha o km, y acción «Avisar al cliente» (hoy manual; no cambies el comportamiento).

7. **Aprobación pública (`/taller-aprobacion/[token]`)**: es lo que ve el cliente final en su celular. Diseño móvil primero, limpio y de confianza: logo/nombre del taller (marca de la organización), tarjeta con el vehículo (placa, modelo), lista de conceptos con precios, **total grande**, y dos botones anchos «Aprobar» (primario) y «Rechazar» (secundario) de al menos 48 px. Estados finales (ya respondida, no disponible, aprobada, rechazada) con icono y mensaje centrado, no texto plano. Sin menú ni elementos del CRM.

8. **Estados de carga y vacíos** en todas las pantallas: `.skeleton` (nunca `0` como sustituto de un dato pendiente) y estados vacíos con icono y una acción («Registra el primer vehículo»).

## Verificación
- `npx tsc --noEmit`, `npm run lint`, `git diff --check` limpios y `npm run check:taller` pasando (si cambias texto visible, ajusta solo esas aserciones). Instrucciones de la base de prueba en `docs/TALLER-MECANICO.md`.
- Revisa con datos reales de la demo: carga `node scripts/seed-demo-taller.mjs` en una base local y mira cada pantalla en claro/oscuro, 375 px, 768 px y escritorio. Captura una imagen por pantalla y guárdalas en `docs/capturas-taller/`.
- No toques `seed-demo-taller.mjs` salvo que un dato impida mostrar un estado (avísalo).

## Entrega
Commits en español por pantalla (`style(taller): detalle de orden con progreso y resumen de cobro`…). Reporte breve: archivos tocados, qué verificaste visualmente y qué no, y hash de cada commit.
