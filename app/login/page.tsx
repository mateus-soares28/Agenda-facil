import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-page">Carregando…</main>}>
      <LoginForm />
    </Suspense>
  );
}
