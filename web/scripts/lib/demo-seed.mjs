import { randomBytes } from "node:crypto";

export function credencialesDemo(emailPredeterminado) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Los seeds de demo están bloqueados en producción");
  }
  if (process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Define ALLOW_DEMO_SEED=1 para autorizar datos de demostración");
  }
  const [email = emailPredeterminado, argumentoPassword] = process.argv.slice(2);
  const password = argumentoPassword || `${randomBytes(12).toString("base64url")}A1!`;
  return { email, password, passwordGenerada: !argumentoPassword };
}

export function imprimirCredencialesDemo({
  nombre,
  slug,
  email,
  password,
  passwordGenerada,
}) {
  console.log(`Demo ${nombre} lista: /login?org=${slug}`);
  console.log(`Correo: ${email}`);
  console.log(`Contraseña${passwordGenerada ? " aleatoria" : ""}: ${password}`);
}
