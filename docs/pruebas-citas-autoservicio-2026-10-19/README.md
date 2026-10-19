# Pruebas de autoservicio y acceso a agendas

19 de octubre de 2026. Entorno desechable:

- Contenedor `ambarcrm-citas-autoservicio-20261019`, Postgres 16, puerto local 55450.
- App compilada en `http://127.0.0.1:3118`; rol de aplicación `crm_app` con RLS.
- Todas las cuentas, contactos y citas son sintéticos. Proveedores externos bloqueados.
- Esquema creado con `schema.sql`, `multi-tenant.sql` y `actualizaciones.sql` tres veces.

[Resultado individual y últimas salidas](resumen-regresion.md).
`resultados.json` y `ejecuciones.txt` conservan todos los intentos, incluidos los fallidos.
`visual.json` contiene los identificadores de la clínica ficticia del ensayo HTTP.
`fixtures-negocios.json` conserva los escenarios de clínica pequeña/grande y salón de la regresión.
`limpieza.json` registra la retirada del entorno al terminar.

## Reproducir

Requiere Docker y una instalación local de tsx indicada en `TSX_BIN`; el arnés no descarga paquetes.
Crea un contenedor nuevo con ese nombre/puerto y credenciales sintéticas del arnés.
Ejecuta `python docs/pruebas-citas-autoservicio-2026-10-19/ejecutar.py` con estos modos:

1. `sql`: esquema y actualización repetida; configura solo la base desechable.
2. `generar`, `validar`, `tsc`, `lint-cambios`: Prisma y comprobaciones estáticas.
3. `compilar`: detiene la app de prueba y compila con Webpack/fuentes simuladas.
4. `app`: inicia la app local, sin proveedores externos.
5. `una prisma/scripts/test-citas-autoservicio-e2e.ts`: ensayo específico con sesiones reales.
6. `pruebas`: todos los `test-*.ts` salvo Aurum real y todos los `check-*.ts`.
7. `detener`: apaga exclusivamente el proceso Next del puerto 3118.

`python docs/pruebas-citas-autoservicio-2026-10-19/resumir.py` exige salida 0 en todos
los casos antes de generar el resumen. Elimina únicamente tu contenedor y volumen desechables.
El arnés reemplaza variables locales de conexión y no escribe los archivos `.env`.
No ejecutar contra producción. La compilación con fuentes reales se verifica en el despliegue.
