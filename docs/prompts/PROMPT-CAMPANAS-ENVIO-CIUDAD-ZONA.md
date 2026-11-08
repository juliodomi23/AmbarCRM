# PROMPT — Campañas de envío: filtrar y aceptar también por ciudad / zona

Copia/rama `campanas-envio`, partiendo de `meta-tech-provider` en `a77e6ca` (haz `git pull`/fetch desde ahí si la copia está atrás). Mismas reglas: sin push, merge ni deploy; no tocar producción; no enviar nada real; provider simulado. Un solo commit, solo esto.

## Contexto
La revisión por área ya funciona (`RevisionListaCampana.tsx`, `aceptarListaCampana`, `seleccionarFilasCampana`). La ciudad hoy solo se lee si la columna se llama exactamente `ciudad` (`ciudadIndex` en `validarFilasCampana`) y se muestra en la lista, pero no se puede elegir ni filtrar. Se quiere poder aceptar la lista por **área y ciudad/zona** a la vez (p. ej. "Colegio privado" en "Tuxtla Gutiérrez").

## Qué hacer
1. **Columna de zona mapeable:** agregar `zona` al mapeo de columnas (opcional). Autoselección por sinónimos sin acentos/mayúsculas: `ciudad, municipio, zona, localidad, region, plaza`. Es una sola columna; si el archivo tiene varias, el usuario elige cuál en el paso de columnas. Reemplaza el `ciudadIndex` fijo por este mapeo.
2. **Normalización:** recortar y colapsar espacios; agrupar sin distinguir mayúsculas ni acentos (`Tuxtla Gutiérrez` = `tuxtla gutierrez`), mostrando la forma más frecuente. Vacío → "Sin zona". Reutiliza `limpiarTexto`/`claveTexto`.
3. **Revisión (paso "Revisar y aceptar"):**
   - Segunda tabla resumen **por ciudad/zona** igual a la de áreas (total, válidas, rechazadas), con casilla por zona. **Por defecto desmarcadas**, igual que las áreas.
   - Un número se selecciona solo si cumple **área marcada Y zona marcada** (intersección). Si el archivo no tiene columna de zona, ese bloque no aparece y todo funciona como hoy.
   - Mostrar una **matriz área × zona** compacta con los conteos de válidas, para ver cuántos números salen con la combinación elegida. El contador fijo "N seleccionados de M válidos" se recalcula con ambos filtros.
   - La lista de números ya muestra ciudad; agrega filtro rápido por zona junto al buscador.
4. **Servidor:** `seleccionarFilasCampana` recibe también `zonasSeleccionadas` (claves) y aplica la intersección; revalida todo igual que con áreas (tipos, límite 10,000, descarta rechazadas). Si hay columna de zona y llega vacío → 400 "Selecciona al menos una zona". Sin columna de zona, ignora el campo.
5. **Registro:** guardar en `lista_aceptada_por_area` (o un JSON hermano si es más limpio) también el desglose por zona de lo aceptado, y mostrarlo en el reporte de la campaña. Migración idempotente en `prisma/sql/actualizaciones.sql` solo si hace falta columna nueva.
6. **Crear campaña:** el filtro por giro/etiqueta ya existente se mantiene; agrega el filtro por zona al lado para hacer campañas distintas por ciudad sobre la misma lista aceptada (misma lógica que `filtrarFilasCampana`).
7. **Seleccionar todo con un clic (áreas y zonas):** en las dos tablas del paso "Revisar y aceptar", encabezado con casilla/botones **"Todas"** y **"Ninguna"** (la opción "Todas" marca solo las que tienen números válidos). Las casillas siguen desmarcadas por defecto; "Todas" es una acción explícita del usuario. Mostrar junto al botón cuántas áreas/zonas hay marcadas ("2 de 3 áreas · 1 de 5 zonas"). En el paso "Programar", mostrar un resumen de solo lectura de lo aceptado (áreas y zonas con sus conteos) y dejar claro que desde ahí solo se puede **acotar** la lista ya aceptada con los filtros de giro/zona/etiqueta, no ampliarla.
8. No toques el motor de envío, el cron ni el interruptor. La casilla de permiso sigue obligatoria. Mantén el estilo visual de pasos ya hecho.

## Pruebas (`web/scripts/check-campanas-envio.ts`)
- Archivo con 3 áreas × 3 ciudades (fixture generado, sin datos reales; incluir `Tuxtla Gutiérrez` y `tuxtla gutierrez`): se agrupan, conteos por zona y matriz correctos.
- Autoselección de columna por `ciudad`, `municipio` y `zona`.
- Marcar 1 área + 1 zona → solo se crean destinatarios de esa combinación; área sin zona marcada → 400; zona sin área → 400; sin columna de zona → funciona como hoy.
- Fila rechazada marcada por el cliente → el servidor la descarta; Graph con 0 llamadas en todo el flujo.
- Regresión previa completa; org 13 y módulo apagado siguen bloqueados.

## Entrega
`npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `git diff --check` limpios y regresión completa. Actualiza `MODULOS.md` y `docs/` solo en lo que cambió. Reporte breve: archivos tocados, decisiones donde el prompt no decía y hash del commit.
