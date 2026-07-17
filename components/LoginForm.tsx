"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/BrandLogo";
import { createClient } from "@/lib/supabase/client";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Google OAuth + magic-link email sign-in. */
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
      <div className="flex items-center gap-2 text-center">
        <BrandLogo size={72} className="h-16 w-16" />
        <h1 className="font-display text-6xl font-extrabold leading-[0.95] tracking-tight text-foreground sm:text-7xl">
          Kahani
        </h1>
      </div>
      <p className="mt-3 text-lg font-semibold text-foreground">
        An AI story you play.
      </p>
      <p className="mt-4 max-w-sm text-base font-medium leading-relaxed text-inksoft">
        A fast, image-first game set in India — every scene generated as you
        play. Sign in to get started.
      </p>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {sent ? (
        <Card className="mt-10 gap-0 py-5">
          <CardContent className="px-5">
            <div className="mb-3 flex size-10 items-center justify-center rounded-base border-2 border-border bg-main/10 text-main">
              <Mail size={20} strokeWidth={2} />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground">
              Check your email
            </h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-inksoft">
              We sent a sign-in link to{" "}
              <span className="font-semibold text-foreground">
                {email.trim()}
              </span>
              . Open it on this device to continue.
            </p>
            <Button
              type="button"
              variant="noShadow"
              className="mt-5 h-auto bg-transparent p-0 text-sm font-bold text-main hover:translate-x-0 hover:translate-y-0 hover:shadow-shadow"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-10 flex flex-col gap-4">
          <Button
            type="button"
            variant="neutral"
            className="w-full"
            onClick={signInWithGoogle}
            disabled={loading !== null}
          >
            <GoogleMark />
            {loading === "google" ? "Redirecting…" : "Continue with Google"}
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-0.5 flex-1 bg-border" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-inksoft">
              or email
            </span>
            <div className="h-0.5 flex-1 bg-border" />
          </div>

          <Card className="gap-0 py-2">
            <CardContent className="px-2">
              <form onSubmit={signInWithEmail} className="flex flex-col gap-2">
                <Label htmlFor="email" className="sr-only">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="border-0 shadow-none"
                />
                <div className="flex justify-end px-1 pb-1">
                  <Button
                    type="submit"
                    disabled={!email.trim() || loading !== null}
                  >
                    {loading === "email" ? "Sending…" : "Send magic link"}
                    <ArrowRight size={15} />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </motion.div>
  );
}

/** Official multicolor Google "G" mark for OAuth buttons. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
