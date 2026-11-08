# PROMPT — Ajustes finales a "Campañas de envío" (EXI)

Trabaja en la misma copia/rama `campanas-envio` (último commit `124b004`). Mismas reglas: sin push, merge ni deploy; no tocar producción; no enviar nada real. Solo estos dos cambios, un commit.

## A. Restaurar la restricción del módulo a EXI
En `web/src/lib/modulos-catalogo.ts` se quitó `soloOrgId: 12` de la entrada `campanas_envio`. Ese campo es lo que limita en el panel (`moduloVisibleEnOrg` y `TabClientes.tsx`) qué organización puede ver y encender el módulo. La decisión del dueño es que el módulo sea **solo para EXI**.

- Restaura `soloOrgId: 12` en esa entrada.
- Mantén sin el 12 fijo el cron y `ingest.ts` (ahí basta `moduloHabilitado`).
- Revisa cómo `moduloHabilitado` y `moduloVisibleEnOrg` usan `soloOrgId` y asegúrate de que las pruebas de "funciona en otra org" activen el módulo de una forma que siga siendo válida (por ejemplo directo en la BD de pruebas, o con una entrada de catálogo de prueba), sin volver a abrir el módulo a todas las orgs en el catálogo real.
- Agrega una prueba: con el catálogo real, el módulo **no** es visible ni activable para una org distinta de la 12 y sí para la 12.

## B. Reiniciar `fallos_consulta_meta` al reanudar
En `web/src/app/api/campanas-envio/[id]/route.ts`, acción `reanudar`: además de `estado: "programada"` y `motivoPausa: null`, poner `fallosConsultaMeta: 0`. Hoy, si la campaña se pausó por 5 fallos seguidos de Meta y se reanuda a mano, el siguiente fallo momentáneo la vuelve a pausar al instante.

- Haz lo mismo en cualquier otro punto donde una campaña vuelva de `pausada` a `programada` o `en_curso`.
- Prueba: campaña pausada con `fallosConsultaMeta = 5`, se reanuda, el contador queda en 0 y un solo fallo `no_disponible` posterior no la pausa.

## Entrega
`npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `git diff --check` limpios y la regresión completa pasando (incluidas las pruebas previas). Reporte final breve con los archivos tocados y el hash del commit.
