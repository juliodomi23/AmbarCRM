# Fase 3 · Marketing y Meta Ads · validación local

Fecha: 21 de octubre de 2026. Las pruebas usaron la base desechable PostgreSQL 16 `127.0.0.1:55451/crm`, datos sintéticos y una app local en `127.0.0.1:3120`. El arnés `ejecutar.py` deja vacías las variables de archivos `.env*` antes de fijar sus propios valores de prueba, bloquea conexiones externas y simula las respuestas de Google Fonts para compilar. Ninguna prueba contactó a Meta ni usó producción.

## Backend y datos

- `schema.sql` y `multi-tenant.sql`: salida 0. `actualizaciones.sql` se aplicó tres veces con salida 0; después se reaplicó para verificar la revocación explícita de `DELETE` y `TRUNCATE` sobre `campanas_marketing`.
- Prisma generate y validate, TypeScript y los checks específicos `check-marketing.ts`, `check-meta-ads.ts`, `check-arquitectura-modulos.ts`, `check-proxy.ts`: salida 0.
- `test-marketing.ts`: salida 0. Comprobó persistencia, RLS, organización y módulo, monto decimal, aprobación exclusiva de admin, versión, archivo y paginación de 26 registros en 24 + 2.
- Control negativo de concurrencia: sin la comparación de versión **dos escrituras se aceptaron**; con ella **una se aceptó y una se rechazó con conflicto**.
- `test-aislamiento.ts`: salida 0 sobre **86 tablas**. Confirmó además que `crm_app` no puede borrar campañas, aunque otras tablas del CRM tengan permisos de eliminación.
- `test-marketing-e2e.ts`: salida 0 con NextAuth real para las dos rutas. Cubrió creación, lectura, edición, revisión, aprobación, reapertura y archivo, además de redirección sin sesión, usuario sin acceso, organización y tipo ajenos, módulo apagado, entradas inválidas y versión desactualizada. [Salida](test-marketing-e2e.txt).
- `npm run lint`, `npx prisma validate`, TypeScript y build de Next.js con fuentes simuladas: salida 0. [Build](build-local-fuentes-simuladas.txt).

El detalle de backend quedó en [backend-validacion.txt](backend-validacion.txt).

## Interfaz comprobada en navegador

- Sesión sintética real de administrador con módulos activos. Menú y acceso directo mostraron Marketing y Meta Ads.
- Marketing: estado vacío, captura guiada en tres pasos, guardado, resumen, envío a revisión y aprobación interna con versión y fecha visibles. [Estado vacío](marketing-vacio.jpg) · [Aprobación](marketing-aprobacion.jpg).
- Meta Ads: aviso visible de conexión pendiente. El presupuesto total en $0 se pudo guardar como borrador, pero **Enviar a revisión** quedó bloqueado con la causa visible; al corregirlo a $1,500, la propuesta quedó lista. [Estado inicial](meta-ads-vacio.jpg).
- En un viewport de **390 × 844**, el formulario, el detalle y la lista no desbordaron horizontalmente (`documentElement.scrollWidth` ≤ `innerWidth`). [Formulario móvil](meta-ads-movil-formulario.jpg) · [Detalle móvil](meta-ads-movil-detalle.jpg) · [Lista móvil](meta-ads-movil-listado.jpg).

## Límites de evidencia

- La compilación local usa fuentes simuladas debido a que la red externa está bloqueada; no equivale a compilar con descarga real de fuentes en un entorno de despliegue.
- La batería general tuvo **37 de 38 checks aprobados**. `check-recuperar-password.ts` requiere por diseño otra base desechable exclusiva, `127.0.0.1:55461/crm_recuperar`. No se ejecutó con esa base en esta sesión y el arnés lo rechazó al apuntarlo a `:55451`; no es un fallo funcional observado.
- No se verificaron permisos efectivos en el panel de Meta ni proveedores reales. [Permisos y App Review](../META-ADS-APP-REVIEW.md).

Los archivos de captura muestran únicamente la organización sintética de prueba. El fixture local está preparado en `web/scripts/seed-fase3-local.mjs` con guard para el puerto desechable y exige una contraseña de prueba en `FASE3_DEMO_PASSWORD`; no forma parte de una demo de producción.
