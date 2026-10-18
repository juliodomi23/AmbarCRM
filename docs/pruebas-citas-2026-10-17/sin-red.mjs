import net from 'node:net';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
const local = h => ['127.0.0.1','localhost','::1','[::1]'].includes(String(h));
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const [o] = net._normalizeArgs(args);
  if (!o.path && !local(o.host ?? 'localhost')) throw new Error('Red externa bloqueada en regresión local');
  return connect.apply(this, args);
};
const lookup = dns.lookup;
dns.lookup = function (hostname, ...args) {
  if (!local(hostname) && !net.isIP(hostname)) throw new Error('DNS externo bloqueado en regresión local');
  return lookup.call(this, hostname, ...args);
};
const promiseLookup = dns.promises.lookup;
dns.promises.lookup = function (hostname, ...args) {
  if (!local(hostname) && !net.isIP(hostname)) throw new Error('DNS externo bloqueado en regresión local');
  return promiseLookup.call(this, hostname, ...args);
};
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'object' && 'url' in input ? input.url : String(input));
  if (!local(url.hostname)) throw new Error('Fetch externo bloqueado en regresión local');
  return fetchOriginal(input, init);
};
syncBuiltinESMExports();
