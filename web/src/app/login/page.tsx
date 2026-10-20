import { LoginForm } from "@/components/auth/LoginForm";
import { correoConfigurado } from "@/lib/correo";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm recuperarHabilitado={correoConfigurado()} />;
}
