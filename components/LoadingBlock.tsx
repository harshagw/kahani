"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

/** Maps World boot status strings to stepped progress values. */
export const BOOT_PROGRESS: Record<string, number> = {
  "Loading your world…": 20,
  "Writing your game's bible…": 45,
  "Painting the first screen… then teaching the engine to see it…": 70,
};

/**
 * Status text + neobrutalism progress bar for wait states.
 * Pass `value` for determinate progress; omit for indeterminate animation.
 */
export function LoadingBlock({
  label,
  detail,
  value,
  className,
}: {
  label: string;
  detail?: string;
  value?: number;
  className?: string;
}) {
  const [animated, setAnimated] = useState(15);

  useEffect(() => {
    if (value !== undefined) return;

    let current = 15;
    const id = window.setInterval(() => {
      current = Math.min(current + 2, 85);
      setAnimated(current);
    }, 400);

    return () => window.clearInterval(id);
  }, [value]);

  const progress = value ?? animated;

  return (
    <div className={className}>
      {label ? (
        <p className="text-sm font-semibold text-foreground">{label}</p>
      ) : null}
      <Progress value={progress} className={label ? "mt-3" : undefined} />
      {detail ? (
        <p className="mt-2 text-xs font-medium leading-relaxed text-inksoft">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
