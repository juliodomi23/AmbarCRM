# Prompt para Codex — pulido visual de Servidores y alertas (sin deploy)

> Copia desde "## Prompt" y pégalo en Codex.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`). El módulo Servidores ya está en
producción (`modulos-fase-2`, `ff52a18`) y funciona. Esta tarea es **solo pulido visual y de
legibilidad** de `/servidores` y de las alertas en `/panel-ar`. **No cambies lógica, esquema,
umbrales, API ni permisos. No hagas push, deploy ni toques ninguna BD de producción.**

Crea la rama `modulos-ar-servidores-pulido` desde `modulos-fase-2`. Archivos principales:
`web/src/components/ar/TarjetaServidor.tsx`, `FormularioServidor.tsx`, `AlertasAR.tsx` y
`web/src/app/(app)/servidores/page.tsx`. Reutiliza los tokens y componentes de UI que ya existen en
el proyecto; no añadas dependencias ni librerías de gráficas.

### Problemas observados (capturas en `docs/capturas/servidores-2026-10-14/`)

1. **Ruido de "por confirmar".** Cada tarjeta repite "Costo por confirmar", "RAM total por
   confirmar", "Vencimiento por confirmar" y un bloque largo de notas con ⚠️ y rutas de docs
   internos. Debe quedar limpio: si falta un dato, un solo indicador discreto (p. ej. un chip
   "Datos por confirmar" que despliega el detalle), no texto repetido en todas las tarjetas.
   Las notas largas (`notas`) van colapsadas, no a la vista.
2. **Redundancia.** "RAM 91 %" aparece como titular y de nuevo como barra. Un solo lugar.
3. **Mini historial 24 h.** Tres líneas casi planas, sin ejes ni valores y con la leyenda en texto
   aparte. Hazlo legible: escala 0–100 %, etiquetas de inicio/fin, y la leyenda con color al lado de
   cada serie. Si hay pocos puntos o la línea es plana, que se entienda (no un gráfico vacío).
4. **Cargas.** Algunos clientes salen en rojo (parecen error) y otros en negro, sin criterio. Usa un
   estilo uniforme; el ⚠️ "sin contrato en CRM" como chip o ícono con tooltip, no emoji en el texto.
   "(baja)" como etiqueta, no entre paréntesis.
5. **Acciones.** "Editar" y "Regenerar token" tienen el mismo peso. Regenerar invalida el token del
   VPS: debe ser secundaria/destructiva y pedir confirmación con el nombre del servidor.
6. **Jerarquía.** Mejor orden dentro de la tarjeta: estado + nombre, métricas, vencimiento, cargas,
   acciones. El texto de umbrales ("Amarillo desde 80 %…") pasa a un tooltip o nota pequeña.
7. **Encabezado.** En `/servidores` aparece el botón global "Nueva oportunidad" junto a
   "Nuevo servidor"; revisa si es del layout y no lo cambies, pero asegúrate de que no compitan
   visualmente.
8. **Móvil (375 px).** Misma información, sin scroll horizontal; botones con área táctil cómoda y
   la barra inferior sin tapar el contenido.
9. **Alertas en `/panel-ar`.** Rojas primero y diferenciables sin depender solo del color
   (ícono/etiqueta); cada alerta enlaza a `/servidores`.

### Reglas

- Cero cambios en `servidores.ts`, `servidores-db.ts`, rutas `/api`, SQL, seed y permisos.
- El token solo se muestra al crear/regenerar, como hoy. No lo persistas en el cliente.
- Accesibilidad básica: contraste suficiente, foco visible, estados no solo por color.
- Español en todos los textos. Sin comentarios obvios en el código.

### Verificación

Desde `web/`: `npx tsc --noEmit`, `npm run lint`, `npx next build` (todos EXIT 0), todos los
`scripts/check-*.ts` (esperado 32/32) y `prisma/scripts/test-servidores-e2e.ts` con una BD
desechable. Toma capturas a 375 y 1440 px de `/servidores` (con datos de prueba en verde, amarillo,
rojo y gris), del formulario y de `/panel-ar` con alertas, y guárdalas en
`docs/capturas/servidores-pulido-<fecha>/` junto con las salidas literales. Verifica que el ancho
del documento coincide con el viewport. Los datos de las capturas son fixtures locales: indícalo.

### Entrega

Primero cualquier fallo o desviación; luego un resumen corto con el hash del commit, antes/después
de cada punto 1–9 y qué no se tocó. Un commit en la rama nueva, sin merge ni push.
