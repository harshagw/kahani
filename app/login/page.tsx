import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6">
          <p className="text-sm font-medium text-inksoft">Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
