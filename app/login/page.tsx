import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { LoginShowcase } from "@/components/LoginShowcase";
import { LoadingBlock } from "@/components/LoadingBlock";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col-reverse lg:flex-row">
      <div className="flex flex-1 flex-col justify-center px-6 py-10 lg:basis-[42%] lg:px-10 lg:py-14 xl:px-14">
        <Suspense fallback={<LoadingBlock label="Loading…" />}>
          <LoginForm />
        </Suspense>
      </div>

      <LoginShowcase className="h-[38vh] shrink-0 lg:min-h-dvh lg:basis-[58%] lg:shrink" />
    </div>
  );
}
