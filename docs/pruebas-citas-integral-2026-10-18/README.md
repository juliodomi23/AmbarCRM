# Evidencia de revisión integral de Citas

- PostgreSQL 16 desechable: `ambarcrm-citas-integral-20261018`, exclusivamente
  `127.0.0.1:55450`. Datos sintéticos, RLS con `crm_app`.
- Esquema desde `schema.sql`, `multi-tenant.sql` y `actualizaciones.sql` repetido.
- App compilada en `127.0.0.1:3118`. Se bloquea la red externa con el arnés anterior.
- `plantillas-simuladas.mjs` amplía únicamente el simulador de pruebas para listar una
  plantilla sintética. No envía mensajes ni cambia plantillas reales.
- `fuentes.cjs` usa el mecanismo de fuentes simuladas de Next, con Arial local, solo
  para esta compilación de prueba. El producto conserva sus Google Fonts reales.

`ejecutar.py` reutiliza el arnés anterior. Modos: `sql`, `base`, `focal`, `compilar`
(Webpack sin descargar fuentes), `app`, `pruebas`, `lint-final` y `detener`.
`una <archivo>` ejecuta un script, y `ocupar <minutos>` prepara el conflicto visual.
Definir `TSX_BIN` con la ruta de una instalación local existente de `tsx`.

Los archivos `resultados-*.json` y `ejecuciones.txt` conservan resultados reales,
incluidos los fallos iniciales del entorno y las interrupciones. Un código distinto
de cero no se considera aprobado porque otro comando del arnés haya terminado bien.
`visual.json` contiene exclusivamente las credenciales sintéticas de un fixture que
se destruye junto con la base al finalizar.

Las capturas están en `../capturas/citas-integral-2026-10-18/`.
