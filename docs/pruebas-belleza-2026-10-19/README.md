# Ensayo de belleza y reserva por etapas

Postgres 16 desechable `ambarcrm-belleza-20261019` en 127.0.0.1:55450.
App en 127.0.0.1:3118, datos sintéticos y RLS con `crm_app`.
No se utilizan producción ni destinatarios reales. Los proveedores externos se
bloquean con el arnés de la revisión anterior.

`ejecutar.py` adapta el arnés de Citas. Indicar `TSX_BIN` con una instalación local
de tsx; no descarga paquetes ni modifica `.env`. Preparación desde `schema.sql`,
`multi-tenant.sql` y `actualizaciones.sql` tres veces. No hay cambios nuevos de esquema.

- `resultados.json` y `ejecuciones.txt`: intentos y códigos reales, incluidos fallos.
- `resumen-regresion.md`: último resultado por caso; `resumir.py` comprueba que todos
  los scripts/checks y la preparación necesaria tengan salida 0.
- `visual.json`: salón de prueba, cuenta sintética, zona y fichas para el ensayo visual.
- `fixtures-negocios.json`: escenarios de la regresión general.
- `limpieza.json`: comprobación del retiro de app, contenedor y volumen de este ensayo.

La compilación utiliza Webpack y fuentes simuladas locales. El intento inicial
encontró EPERM al crear un archivo generado; se conserva en el registro. Aurum real
se excluye porque requiere un servicio externo de pruebas.

La regresión nueva `test-belleza-e2e.ts` cubre ficha, duplicados concurrentes,
referencias/aislamiento, servicios de uñas/pestañas/spa, descansos y márgenes.
La verificación de navegador comprueba la interfaz compilada; el piloto con el
negocio y sus integraciones reales se realiza según [la guía](../piloto-belleza.md).
