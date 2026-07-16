"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const authError = searchParams.get("error") === "auth";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(
    authError ? "Sign-in link expired or was invalid. Try again." : null
  );

  const redirectTo = () => {
    const origin = window.location.origin;
    const safeNext =
      next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
  };

  const signInWithGoogle = async () => {
    setError(null);
    setLoading("google");
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(null);
    }
  };

  const signInWithEmail = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    setLoading("email");
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo() },
    });
    if (otpError) {
      setError(otpError.message);
      setLoading(null);
      return;
    }
    setSent(true);
    setLoading(null);
  };

  return (
    <motion.div
      className="mx-auto w-full max-w-md"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
        <p className="mb-6 border-b border-ink/15 pb-3 text-xs font-bold uppercase tracking-widest text-primary">
          Sign in to play
        </p>

        <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-ink sm:text-6xl">
          Kahani
        </h1>
        <p className="mt-4 max-w-sm text-base font-medium leading-relaxed text-inksoft">
          Continue with Google or a magic link — no password needed.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-bold/30 bg-bold/5 px-4 py-3 text-sm font-medium text-bold"
          >
            {error}
          </p>
        ) : null}

        {sent ? (
          <div className="mt-10 rounded-2xl border border-ink/10 bg-surface px-5 py-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail size={20} strokeWidth={2} />
            </div>
            <h2 className="font-display text-xl font-bold text-ink">
              Check your email
            </h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-inksoft">
              We sent a sign-in link to{" "}
              <span className="font-semibold text-ink">{email.trim()}</span>.
              Open it on this device to continue.
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="mt-5 text-sm font-bold text-primary transition hover:brightness-110"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="mt-10 flex flex-col gap-4">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-ink/15 bg-surface px-5 py-3 text-sm font-bold text-ink shadow-soft transition enabled:hover:border-ink/30 enabled:active:scale-[0.98] disabled:opacity-50"
            >
              <GoogleMark />
              {loading === "google" ? "Redirecting…" : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-ink/10" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-inksoft">
                or email
              </span>
              <div className="h-px flex-1 bg-ink/10" />
            </div>

            <form onSubmit={signInWithEmail} className="card rounded-2xl p-2">
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl bg-transparent px-3 py-2.5 text-[15px] font-medium text-ink outline-none placeholder:text-inksoft/50"
              />
              <div className="flex justify-end px-1 pb-1 pt-1">
                <button
                  type="submit"
                  disabled={!email.trim() || loading !== null}
                  className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-soft transition enabled:hover:brightness-105 enabled:active:scale-95 disabled:opacity-40"
                >
                  {loading === "email" ? "Sending…" : "Send magic link"}
                  <ArrowRight size={15} />
                </button>
              </div>
            </form>
          </div>
        )}
    </motion.div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.5-5.1 3.5-3.1 0-5.6-2.5-5.6-5.6S8.9 6.1 12 6.1c1.8 0 2.9.7 3.6 1.4l2.4-2.4C16.6 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12S6.9 21.3 12 21.3c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.8H12z"
      />
    </svg>
  );
}
