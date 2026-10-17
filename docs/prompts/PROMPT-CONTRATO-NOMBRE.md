# Prompt para Codex — nombre opcional en los contratos (sin deploy)

> Copia desde "## Prompt" y pégalo en Codex. **Úsalo solo cuando termine y se integre
> `PROMPT-COBROS-CANCELAR-ELIMINAR.md`**: ambos tocan `NuevoCobro.tsx` y `FilaCobro.tsx`.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`). **No hagas push, deploy ni toques
ninguna BD de producción.** Parte de `modulos-fase-2` con la rama `cobros-cancelar-eliminar` ya
integrada; si no lo está, detente y repórtalo. Crea la rama `contrato-nombre`.

### Problema

Un cliente puede tener varios contratos del mismo tipo o de tipo `otro` (caso real: Villafuerte,
uno de $1,200 y otro de $800). El contrato solo se distingue por `tipo` y `notas`, así que en
listas, cobros y selectores se leen casi igual ("bot whatsapp" / "otro").

### Cambio

Añade a `contratos` un campo **`nombre`** opcional (texto corto, máximo 80 caracteres), p. ej.
"Asistente a clientes" o "Bot interno GestorLegal".

1. **BD (aditivo e idempotente):** `ALTER TABLE contratos ADD COLUMN IF NOT EXISTS nombre TEXT` con
   un `CHECK (nombre IS NULL OR char_length(nombre) BETWEEN 1 AND 80)` creado solo si no existe,
   en `web/prisma/sql/actualizaciones.sql`, y el campo en `schema.prisma`. Debe poder aplicarse dos
   veces sin error y no alterar filas existentes (quedan en NULL). Sin GRANT ni RLS nuevos: la tabla
   ya los tiene.
2. **Validación:** en `validarContrato` (`web/src/lib/contratos-cobros.ts`) recorta espacios,
   vacío → `null`, y más de 80 caracteres → error claro. Permite editarlo en `PATCH` y en el alta.
3. **Mostrarlo donde hoy aparece solo el tipo:** ficha del contrato (`FichaContrato.tsx`, título de
   `contratos/[id]/page.tsx`), lista de contratos, `FilaCobro.tsx` y el selector de
   `NuevoCobro.tsx`. Regla única, en una función pequeña reutilizable: si hay nombre, se muestra
   el nombre y el tipo como secundario; si no, solo el tipo como hoy. Nada de lógica duplicada en
   cada componente.
4. **Formulario de contrato:** campo "Nombre del servicio (opcional)", con ayuda breve
   ("Ej. Bot interno GestorLegal. Sirve para distinguir contratos del mismo cliente.").
5. **Búsqueda:** `GET /api/contratos?q=` también debe encontrar por `nombre`.
6. **Seed de Ámbar Rojo (`scripts/seed-ambar-rojo.mjs`):** pon `nombre` solo donde ya hay una
   descripción en las notas del contrato (Villafuerte: "Asistente a clientes" y "Bot interno /
   GestorLegal"). No inventes nombres para los demás. El seed no debe sobrescribir un `nombre` que
   alguien ya editó.

### Reglas

- No cambies montos, estados, cobros ni cálculos de MRR. Sin dependencias nuevas.
- Exportaciones (CSV de `/api/panel-ar/exportar`): añade la columna nombre solo si ya exportan el
  tipo; conserva la protección contra fórmulas.
- Español en todos los textos; sin comentarios obvios.

### Verificación

Desde `web/`, con una BD desechable (rol `crm_app` sin BYPASSRLS): `npx prisma validate`,
`npx tsc --noEmit`, `npm run lint`, `npx next build`, todos los `scripts/check-*.ts` (esperado
32/32) y la batería `prisma/scripts/test-*.ts` (único fallo permitido: `test-lealtad-aurum.ts`).
Aplica `actualizaciones.sql` dos veces. Añade al e2e de cobros: contratos con y sin nombre se
muestran bien, nombre de 81 caracteres se rechaza, y la búsqueda por nombre funciona. Capturas de
`/contratos`, ficha y "Nuevo cobro" a 375 y 1440 px. Salidas literales y capturas en
`docs/pruebas-contrato-nombre-<fecha>/`. Un fallo se reporta tal cual.

### Entrega

Primero cualquier fallo; luego hash del commit en `contrato-nombre` (un commit, sin merge ni push),
confirmación de que la migración es aditiva y la lista de lo que NO se tocó. Documenta el campo en
`MODULOS.md`.
