# Variables nuevas de `crmlite` — correo (recuperar contraseña)

Producción: EasyPanel → proyecto `ambarrojo` → compose `crmlite` → **Environment**
(`http://31.220.49.58:3000/projects/ambarrojo/compose/crmlite/environment`).

Estado de Resend (20-oct-2026): dominio `mail.ambarrojostudios.cloud` **verificado** (DNS en
Cloudflare). Plan gratis: 3,000 correos/mes y 100/día.

> Estas variables solo sirven **después** de fusionar `codex/recuperar-password` en
> `meta-tech-provider` y hacer Deploy. Antes de eso el código viejo las ignora.

## 1. Pega este bloque en Environment

Una variable por línea, `NOMBRE=valor`, sin comillas ni espacios alrededor del `=`.
EasyPanel regenera su `.env` en cada Deploy, así que se guardan aquí y **no** en el VPS.

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=PEGA_AQUI_TU_API_KEY
SMTP_FROM=AmbarCRM <no-reply@mail.ambarrojostudios.cloud>
```

### Dónde va la API key

Reemplaza **solo** `PEGA_AQUI_TU_API_KEY` (la línea `SMTP_PASSWORD`) por la clave que copiaste de
Resend; empieza con `re_`. Sin comillas, sin espacios y sin saltos de línea.

- No la pegues en el chat, en este archivo ni en GitHub. Este documento queda con el marcador.
- Resend la muestra una sola vez; si la pierdes, crea otra en Resend → API keys y borra la anterior.
- Si algún día se expone (chat, captura, commit), bórrala en Resend y crea otra.

## 2. Qué significa cada una

| Variable | Valor | Nota |
|---|---|---|
| `SMTP_HOST` | `smtp.resend.com` | Servidor SMTP de Resend |
| `SMTP_PORT` | `465` | Conexión cifrada directa |
| `SMTP_SECURE` | `true` | Debe ser exactamente `true` o `false`; cualquier otro valor apaga el correo **sin avisar** y el enlace "¿Olvidaste tu contraseña?" desaparece del login |
| `SMTP_USER` | `resend` | Siempre es la palabra `resend` |
| `SMTP_PASSWORD` | tu API key | El único secreto del bloque |
| `SMTP_FROM` | `AmbarCRM <no-reply@mail.ambarrojostudios.cloud>` | El dominio del correo debe ser el verificado en Resend |

Si prefieres el puerto 587: `SMTP_PORT=587` y `SMTP_SECURE=false` (el código exige STARTTLS).

## 3. Pendientes de entornos anteriores (opcionales)

No bloquean nada hoy. Siguen sin definir en `crmlite`:

| Variable | Para qué | Qué pasa sin ella |
|---|---|---|
| `IP_HEADER` | Qué cabecera trae la IP real del cliente (`x-real-ip` por defecto; `cf-connecting-ip` solo si el dominio pasa por el proxy naranja de Cloudflare) | Usa `x-real-ip`; los límites de intentos pueden agrupar IPs si el proxy no la envía |
| `MESSENGER_VERIFY_TOKEN` | Verificación del webhook de Messenger | Messenger está oculto ("próximamente"), no se usa |

## 4. Orden de despliegue

1. Fusionar `codex/recuperar-password` en `meta-tech-provider` y subirla a GitHub.
2. Pegar el bloque de arriba en Environment y **Guardar**.
3. **Deploy.** El servicio `db-migrate` crea la tabla de restablecimientos y la columna
   `password_cambiada_at` (idempotente; revisa que salga con exit 0).
4. Entrar a `/login`: debe aparecer "¿Olvidaste tu contraseña?".

Aunque hagas el Deploy sin estas variables, la función queda dormida y todo lo demás funciona.

## 5. Prueba de humo

1. `/login` → "¿Olvidaste tu contraseña?" → organización `sembid` y el correo del usuario.
2. El mensaje es el mismo exista o no la cuenta. El correo debe llegar en menos de un minuto
   a la **bandeja principal** (revisa también spam la primera vez) y el enlace vence a los 60 minutos.
3. Abre el enlace, pon una contraseña nueva y entra. Llega un segundo correo de aviso.
4. El mismo enlace por segunda vez debe decir que ya no es válido.
5. Resend → **Logs** muestra cada envío con su estado.

## 6. Si algo falla

| Síntoma | Causa probable |
|---|---|
| No aparece "¿Olvidaste tu contraseña?" | Falta alguna variable, `SMTP_SECURE` mal escrito, o no se hizo Deploy |
| Dice "te enviaremos un correo" pero no llega | Revisa Resend → Logs; clave mal pegada (espacio al final), `SMTP_FROM` con otro dominio, o llegó a spam |
| Resend responde 401 | La API key está mal o fue borrada |
| Resend rechaza el remitente | `SMTP_FROM` no usa `@mail.ambarrojostudios.cloud` |
| Se acaban los envíos | Plan gratis: 100 al día y 3,000 al mes |

En los logs de la app (`ambarrojo_crmlite-app-1`) solo aparece "No se pudo enviar el correo" o
"SMTP sin configurar"; el detalle del error está en Resend → Logs. Nunca se imprime el enlace ni el token.

## 7. Dejar el seguimiento de clics apagado

En Resend → Domains → `mail.ambarrojostudios.cloud` → Configuration, **no actives** "tracking
metrics": reescribiría el enlace de restablecer contraseña y lo dejaría pasar por un tercero.
