import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { CambiarPasswordForm } from "@/components/auth/CambiarPasswordForm";

export const dynamic = "force-dynamic";

export default async function CambiarPasswordPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.passwordCambiadaAt) redirect("/embudos");
  return <CambiarPasswordForm nombre={session.user.name ?? ""} />;
}
