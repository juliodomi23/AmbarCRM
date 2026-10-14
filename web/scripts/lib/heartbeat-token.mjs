import { createHash, randomBytes } from "node:crypto";

export function hashHeartbeat(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function nuevoTokenHeartbeat() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashHeartbeat(token) };
}
