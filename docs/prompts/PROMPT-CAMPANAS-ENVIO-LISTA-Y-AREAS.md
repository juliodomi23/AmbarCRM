# PROMPT — Campañas de envío: normalizar la base, revisar la lista por área y aceptarla (+ mejora visual)

Copia/rama `campanas-envio` (parte del último commit de `meta-tech-provider`, `683abf4`; si la copia está atrás, primero `git pull` desde ese commit). Mismas reglas: sin push, merge ni deploy; no tocar producción; no enviar nada real; provider simulado en pruebas. Un commit por bloque (A, B, C) o uno solo.

## Contexto
EXI probó con `prospectos_a3_chiapas_2026.xlsx` y se vio que:
- Las filas 1–4 son título/nota; los encabezados reales están en la fila 5. El importador toma la primera fila con contenido como encabezado y no autoselecciona nada.
- Hay teléfonos con extensión (`961 614 1943 ext. 102`) y filas sin teléfono.
- La columna de área se llama `Segmento` y la de persona `Contacto publicado`; hoy solo se autoseleccionan los nombres exactos.
- Se quiere **ver la lista exacta de números a los que se enviaría, por área, y aceptarla** antes de guardar nada. La casilla de permiso ("confirmo que conocen a EXI y aceptaron recibir mensajes") **se queda igual y obligatoria**; no la quites ni la suavices.

## A. Normalización al leer el archivo (cliente y servidor, misma lógica)
1. **Fila de encabezados automática:** dentro de las primeras 15 filas con contenido, elegir la primera que tenga ≥3 celdas con texto y alguna que coincida con teléfono/celular/whatsapp/phone/tel. Las filas anteriores se descartan. Si no se encuentra, dejar elegir al usuario "Los encabezados están en la fila N" (selector) y recalcular. Mostrar cuál se detectó.
2. **Sinónimos de columnas** (sin acentos, sin mayúsculas): teléfono ← `telefono, celular, whatsapp, phone, tel, movil`; nombre ← `nombre, name, contacto, contacto publicado`; empresa ← `empresa, company, negocio, razon social`; área/giro ← `giro, sector, segmento, area, rubro`. Cualquier otra columna queda disponible como variable (p. ej. `ciudad`).
3. **Teléfono:** antes de `telefonoMx`, quitar extensiones (`ext`, `ext.`, `x`, `extension` y lo que sigue); si la celda trae varios números (separados por `/`, `,`, `;` o ` y `) tomar el primero válido; ignorar espacios, guiones y paréntesis. **No cambies `lib/reservas/telefono.ts`**; haz un helper nuevo en `campanas-envio*` que llame a `telefonoMx`.
4. **Texto:** recortar espacios y colapsar espacios internos en nombre, empresa y área. El **área** se agrupa sin distinguir mayúsculas ni acentos (`Artes gráficas` = `artes graficas`), mostrando la forma más frecuente.
5. En la vista previa, mostrar columna "Teléfono normalizado" (`52…`) junto al original para que se vea qué se cambió.
6. El servidor revalida todo con la misma función (no confiar en el cliente).

## B. Lista final por área y aceptación
1. Después de la vista previa, nuevo paso **"Revisar y aceptar"**:
   - Tabla resumen **por área**: total de filas, válidas (se enviarían), rechazadas (con motivo), con baja/otra campaña reciente. Casilla por área para incluirla. **Por defecto todas desmarcadas** (hay que decidir).
   - Al marcar áreas, **lista de los números que se enviarían**: teléfono `52…`, nombre, empresa, área y ciudad si existe, con buscador y paginación. Casilla por fila para excluir números sueltos.
   - Contador fijo: "N números seleccionados de M válidos", y los rechazados descargables en CSV.
2. Botón **"Aceptar lista (N números)"**, desactivado con 0 seleccionados. Solo al aceptar se hace el upsert de contactos y se crean los destinatarios, **únicamente de lo seleccionado**. El servidor recibe las áreas/filas aceptadas y vuelve a validarlas; descarta cualquier fila rechazada aunque llegue marcada. Nada se envía.
3. Guardar en la campaña qué se aceptó (cuántos por área, quién y cuándo) y mostrarlo en el reporte.
4. Al crear la campaña, el filtro por giro/etiqueta que ya existe se mantiene: así se pueden hacer **campañas distintas por área** (plantilla y calendario propios) sobre la misma lista aceptada. No agregues otra forma de agrupar.
5. Respeta los topes ya existentes (≤10,000 filas, 5 MB, primera hoja) y todo el motor/cron/interruptor tal cual; **no toques el motor de envío**.

## C. Mejora visual de la pantalla de campañas
La pantalla funciona pero se ve cruda. Rediséñala dentro del estilo de la app (mira otras pantallas como `/difusion` o configuración y reutiliza sus componentes/clases; **sin dependencias nuevas**):
- Flujo en pasos visibles: 1 Subir archivo → 2 Revisar columnas → 3 Revisar y aceptar → 4 Programar → 5 Reporte. Indicar el paso actual y no mostrar los de después hasta que toquen.
- El interruptor de envíos (ACTIVOS/PAUSADOS) como barra superior clara, con color distinto en cada estado.
- Tablas legibles (encabezado fijo, filas con altura cómoda, estados con etiquetas de color, scroll interno, sin desbordar), tarjetas de conteos (válidos, duplicados, inválidos, ya existentes, bajas), estados vacíos con texto útil, mensajes de error/éxito junto a la acción.
- Responsive hasta móvil (sin scroll horizontal de página), teclado y `aria` correctos, contraste suficiente, tema claro/oscuro si la app lo tiene.
- Textos en español claro; recordar la frase de baja ("Responde BAJA…") en el paso de programar.

## Pruebas (`web/scripts/check-campanas-envio.ts`, mismo estilo; fixture generado en la prueba, sin datos reales)
- Excel con 4 filas de título/nota + encabezados en la fila 5 → detecta la fila 5 y autoselecciona teléfono, nombre, empresa y área.
- `961 614 1943 ext. 102` → válido (`529616141943`); celda con dos números → toma el primero válido; fila sin teléfono → rechazada con motivo.
- Áreas `Colegio privado` / `colegio privado` se agrupan; conteos por área correctos.
- Aceptar con 1 de 3 áreas marcadas → solo se crean destinatarios de esa área; con 0 → 400; fila rechazada marcada por el cliente → el servidor la descarta; excluir un número suelto → no se crea.
- Nada se envía en ningún paso (Graph simulado con 0 llamadas); la casilla de permiso sigue siendo obligatoria para lanzar.
- Regresión previa completa pasando; org 13 y módulo apagado siguen bloqueados.

## Entrega
`npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `git diff --check` limpios y regresión completa. Si hace falta migración (p. ej. guardar lo aceptado por área), idempotente en `prisma/sql/actualizaciones.sql`. Actualiza `MODULOS.md` y los docs de `docs/` solo en lo que cambió. Reporte breve con archivos tocados, decisiones donde el prompt no decía, capturas del antes/después de la pantalla si puedes, y hash del commit.
