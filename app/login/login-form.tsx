"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    searchParams.get("error") ? "Link inválido ou expirado. Solicite novo acesso." : "",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: String(form.get("full_name") ?? "").trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage("Conta criada. Confirme o e-mail para entrar.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-label="Acesso do professor">
        <div className="auth-brand">agenda<span>fácil</span></div>
        <p className="eyebrow">Área do professor</p>
        <h1>{mode === "login" ? "Entre na sua agenda" : "Crie seu espaço"}</h1>
        <p>Alunos, aulas e cobranças em um só lugar.</p>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label className="field">Seu nome<input name="full_name" autoComplete="name" required /></label>
          )}
          <label className="field">E-mail<input name="email" type="email" autoComplete="email" required /></label>
          <label className="field">Senha<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /></label>
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
          {mode === "login" ? "Criar conta de professor" : "Já tenho conta"}
        </button>
      </section>
    </main>
  );
}
