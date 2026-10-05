# AmbarCRM — Integración con n8n

Meta entrega los mensajes directamente al webhook firmado del CRM. n8n se usa únicamente para automatizaciones de negocio y bots configurados dentro de AmbarCRM.

```text
WhatsApp ↔ Meta Cloud API ↔ AmbarCRM
                              ↕
                             n8n
```

## Bot de n8n

1. Crea un webhook POST en n8n.
2. En AmbarCRM abre Configuración → Bots.
3. Registra la URL del webhook y genera el token del bot.
4. Asocia el bot al canal deseado.
5. Desde n8n responde usando la API propia descrita en `INTEGRACION-BOTS.md`.

## Seguridad

- Meta usa la firma `x-hub-signature-256`; no se debe omitir su validación.
- Cada bot usa su propio token y solo accede a la organización que lo creó.
- Guarda tokens en credenciales de n8n, nunca dentro de nodos exportados.
- El endpoint de Meta no pasa por n8n y debe conservar el body crudo para verificar la firma.
