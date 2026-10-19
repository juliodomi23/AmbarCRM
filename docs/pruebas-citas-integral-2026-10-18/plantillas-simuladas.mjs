import '../../web/prisma/scripts/meta-facebook-simulado.mjs';
import assert from 'node:assert/strict';

assert.equal(new URL(process.env.DATABASE_URL).port, '55450');
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'object' && 'url' in input ? input.url : String(input));
  if (url.hostname === 'graph.facebook.com' && url.pathname.endsWith('/message_templates')) {
    return Promise.resolve(Response.json({ data: [{
      name: 'recordatorio_local', language: 'es_MX', status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola {{1}}, tu cita {{2}} será {{3}} en {{4}}.' }],
    }] }));
  }
  return original(input, init);
};
