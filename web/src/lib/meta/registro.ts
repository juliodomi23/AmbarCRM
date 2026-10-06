import { randomInt } from "node:crypto";
import { META_GRAPH_URL } from "@/lib/meta/config";
import { encryptMetaToken } from "@/lib/meta/credentials";

/**
 * Activa un número en Cloud API. Embedded Signup deja los números nuevos verificados
 * pero sin registrar: sin este paso no reciben ni envían mensajes.
 * El PIN queda como verificación en dos pasos del número; se guarda cifrado.
 */
export async function registrarNumero(
  phoneNumberId: string,
  token: string
): Promise<{ pinEncrypted?: string; error?: string }> {
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const response = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: data?.error?.error_user_msg || data?.error?.message || `Meta HTTP ${response.status}` };
  }
  return { pinEncrypted: encryptMetaToken(pin) };
}
