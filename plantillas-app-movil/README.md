# Kit para el repo `ambarcrm-app`

Archivos listos para copiar a la raíz del repo de la app Flutter al crearlo.

| Archivo | Para qué |
|---|---|
| `AGENTS.md` | Instrucciones para IA (Codex y otros). **Fuente única.** |
| `CLAUDE.md` | Solo importa `AGENTS.md` para Claude Code. No se edita. |
| `CONTRIBUTING.md` | Ramas, Conventional Commits, PR y revisión. |
| `.github/pull_request_template.md` | Plantilla de PR con checklist. |
| `.githooks/commit-msg` | Rechaza commits que no sigan Conventional Commits. |

## Pasos al crear el repo

1. Copia todo a la raíz de `ambarcrm-app`, incluidas las carpetas con punto.
2. Copia también `PLAN-APP-MOVIL.md`, `PLAN-EQUIPO-APP-MOVIL.md` y `API-MOVIL.md` (cuando exista) a `docs/`
   y corrige las rutas que citan `AGENTS.md`.
3. `.gitignore`: asegúrate de incluir `google-services.json`, `GoogleService-Info.plist`, `*.jks`, `key.properties`, `.env`.
4. En GitHub: proteger `main` y `develop`, exigir PR y permitir **solo squash merge**.
5. Cada persona, una sola vez tras clonar: `git config core.hooksPath .githooks`
6. En Mac/Linux: `chmod +x .githooks/commit-msg` (en Windows con Git Bash funciona tal cual).
