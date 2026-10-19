# Ensayo de entrega de Citas

Postgres 16 desechable `ambarcrm-citas-entrega-20261019`, puerto local 55450.
App local en 3118, RLS con `crm_app`, credenciales y datos sintéticos.
Proveedor de WhatsApp inyectado y proveedores externos bloqueados.

La base se crea con `schema.sql`, `multi-tenant.sql` y `actualizaciones.sql` tres veces.
Sin cambios nuevos de esquema ni regeneración necesaria de Prisma en esta revisión.
TypeScript, lint, Prisma validate y build Webpack/fuentes simuladas se registran en el arnés.

- [Resumen individual de la regresión](resumen-regresion.md).
- `resultados.json` y `ejecuciones.txt`: todos los intentos, incluidos los fallos anteriores.
- `visual.json`: clínica sintética del ensayo de confirmaciones y recordatorios.
- `fixtures-negocios.json`: escenarios de clínica pequeña/grande y salón de la regresión general.
- `limpieza.json`: retirada de app, contenedor y volumen de prueba.

El arnés `ejecutar.py` adapta el de autoservicio anterior. Requiere Docker y `TSX_BIN`
apuntando a una instalación local de tsx; no descarga paquetes ni modifica `.env`.
Modos: `sql`, `tsc`, `lint-cambios`, `validar`, `compilar`, `app`,
`una prisma/scripts/test-citas-entrega-e2e.ts`, `pruebas` y `detener`.
`resumir.py` exige que el último resultado de todos los casos sea 0.

La prueba nueva cubre enlaces estables/permisos, confirmación con horario original,
crons simultáneos sin conversación previa, registro en el canal correcto, variable del
enlace, próxima cita y zona correctas, contacto sin ficha y omisión si falta URL pública.
La regresión general excluye únicamente Aurum real, que requiere un servicio externo de pruebas.
El piloto con WhatsApp real y la compilación normal siguen pendientes de entrega.
