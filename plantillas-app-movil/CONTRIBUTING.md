# Cómo contribuir

## Flujo

1. Toma una tarjeta de Trello y muévela a **En curso**.
2. Crea tu rama desde `develop`: `git switch develop && git pull && git switch -c feat/chat-notas-de-voz`
3. Trabaja en commits chicos (ver abajo).
4. `flutter analyze` y `flutter test` en verde, y pruébalo en un celular real.
5. Abre el PR hacia `develop` con la plantilla completa. Tarjeta a **En revisión**.
6. Julio revisa. Responde los comentarios en 24 h. **Julio hace el merge**, nadie hace merge de su propio PR.

## Ramas

`<tipo>/<area>-<cosa>` en minúsculas con guiones. Ejemplos: `feat/bandeja-filtros`, `fix/login-token-expirado`,
`docs/api-movil`. Una rama = una tarea. Rama vieja y ya mergeada, se borra.

## Commits: Conventional Commits

Formato: `tipo(alcance): descripción`

- **tipo** en inglés (estándar), **descripción en español**, en minúsculas, en presente, sin punto final, ≤ 72 caracteres.
- **alcance** opcional, el área tocada: `login`, `bandeja`, `chat`, `contactos`, `kanban`, `tareas`, `ajustes`,
  `push`, `api`, `tema`, `deps`.

| Tipo | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva para el usuario |
| `fix` | Corrección de un bug |
| `refactor` | Cambia el código sin cambiar el comportamiento |
| `perf` | Mejora de rendimiento |
| `style` | Formato, espacios (no lógica ni UI) |
| `test` | Agregar o corregir pruebas |
| `docs` | Solo documentación |
| `build` | Dependencias, Gradle, Xcode, `pubspec.yaml` |
| `ci` | Automatizaciones y pipelines |
| `chore` | Mantenimiento que no encaja arriba |
| `revert` | Deshace un commit anterior |

Ejemplos buenos:

```
feat(chat): enviar notas de voz
fix(login): renovar el token antes de que expire
refactor(bandeja): separar el filtro en su propio widget
build(deps): agregar record para grabar audio
feat(push)!: cambiar el payload de las notificaciones
```

Ejemplos malos: `cambios`, `arreglé cosas`, `Update chat.dart`, `feat: Chat.` , `WIP`.

- Un commit = un cambio lógico. No mezcles "arreglar bug" con "agregar pantalla".
- Cambio que rompe compatibilidad: agrega `!` después del tipo y explica en el cuerpo del commit.
- Cuerpo opcional (línea en blanco, luego el **por qué**). Referencia la tarjeta si aplica: `Trello: B3`.
- Al final del commit, si lo escribió una IA con tu supervisión: `Co-Authored-By: <herramienta>`.

### Validación automática

Activa el hook una sola vez después de clonar; rechaza commits con formato incorrecto:

```
git config core.hooksPath .githooks
```

## Pull Requests

- Título con el mismo formato que un commit: `feat(chat): enviar notas de voz`.
- Máximo ~400 líneas y una sola cosa. Si es más grande, se parte.
- Completa la plantilla: qué hace, cómo se probó, captura o video si hay pantalla.
- No mezcles reformateo masivo con cambios de lógica.
- Se hace **squash merge**: el título del PR queda como el commit en `develop`, por eso debe estar bien escrito.

## Qué revisa Julio

Que funcione en celular real · que respete `API-MOVIL.md` · tres estados (cargando/error/vacío) ·
ventana de 24 h · nada de secretos · código chico y claro · que quien lo subió lo entienda.

## Prohibido

Push a `main`/`develop`, `--force`, `--no-verify`, secretos en el repo, probar contra producción, paquetes nuevos sin avisar.
