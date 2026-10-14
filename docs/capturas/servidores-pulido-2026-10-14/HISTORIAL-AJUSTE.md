# Ajuste del margen del historial · 14 de octubre de 2026

Discrepancia de publicación: `git ls-remote origin refs/heads/modulos-fase-2` devuelve `ff52a18ecffa47fb15d90d8f754fc087b37544f9`, mientras que la condición recibida exige `be43875`. Se conserva la salida literal en [historial-remoto-inicial.txt](historial-remoto-inicial.txt). El push depende de esa comprobación exacta; no se sustituye por una comprobación de ancestros.

El cambio de aplicación es una sola línea en `HistorialServidor.tsx`: `viewBox="0 0 360 132"` → `viewBox="-16 0 376 132"`. Añade 16 unidades de margen por la izquierda sin alterar coordenadas, series, porcentajes, textos ni otros componentes. La etiqueta `100 %` ocupa aproximadamente desde x=-3.2 hasta x=32, por lo que antes excedía el límite x=0 y ahora queda completa dentro del SVG.

## Verificación

Las salidas de esta ejecución llevan el prefijo `historial-`; se conservan las salidas y capturas de la tarea anterior.

| Prueba desde web/ | Salida literal |
|---|---|
| `npx tsc --noEmit` | [historial-tipos.txt](historial-tipos.txt) |
| `npm run lint` | [historial-lint.txt](historial-lint.txt) |
| `npx next build` | [historial-build.txt](historial-build.txt) |
| Todos los `scripts/check-*.ts` | [historial-checks-resumen.txt](historial-checks-resumen.txt) y salida individual `historial-check-*.txt` |
| `prisma/scripts/test-servidores-e2e.ts` | [historial-test-servidores-e2e.txt](historial-test-servidores-e2e.txt) |
| Capturas y límites de las etiquetas | [historial-capturas.txt](historial-capturas.txt), [historial-visual.json](historial-visual.json) |

[Captura 375 px](servidores-historial-375.png) y [captura 1440 px](servidores-historial-1440.png). Se inspeccionan visualmente y se comprueba con `getBBox()` que `0 %`, `50 %` y `100 %` quedan dentro del viewBox en las tres gráficas. El historial de la primera tarjeta queda completo dentro del viewport. Se verifica también que el ancho del documento coincide con el viewport y que main no desborda.

Los datos son **fixtures locales ficticios**, exclusivamente en `127.0.0.1:55454/crm_pulido`; no representan producción. Contenedor nuevo `ambarcrm-servidores-pulido-20261014` en Docker Desktop local, datos tmpfs, rol `crm_app` sin superusuario ni bypass de RLS. [Identidad](historial-contenedor.txt), [preparación](historial-preparacion.txt), [Docker local](historial-docker.txt). Se reutilizan sin modificar los SQL de inicialización y el fixture AR existente, ejecutados solo en ese contenedor. No se modifica `.env`.

Reproducción: `verificar-historial.ps1 -Tipo preparar`, después `-Tipo estaticos`; servir el build en otra terminal con `-Tipo app`, y ejecutar `-Tipo e2e` y `-Tipo capturas`. El script carga `entorno-local.ps1`. `PLAYWRIGHT_MODULE` apunta al runtime externo ya instalado; no se añaden dependencias al proyecto.

Sin cambios en lógica, API, SQL, Prisma, seeds, permisos, umbrales, dependencias ni estilos de otros componentes. Sin deploy ni acceso a BD de producción. Los `PROMPT-*.md` sin seguimiento quedan fuera del commit.

Resultado final: tipos, lint, build, E2E y capturas con EXIT 0; 32/32 checks, cero fallos. Se inspeccionaron ambas capturas con las tres etiquetas completas. El resumen literal está en historial-verificacion-resumen.txt.

App local detenida y BD desechable eliminada; salida en historial-limpieza.txt.
