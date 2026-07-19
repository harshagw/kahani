import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder layout while the home gallery loads — create, your worlds, and community grid. */
export function HomePageSkeleton() {
  return (
    <>
      <section className="mb-14">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-inksoft">
          Create
        </p>
        <Card className="gap-0 py-5">
          <CardContent className="px-4">
            <Skeleton className="h-[4.5rem] w-full" />
          </CardContent>
          <CardFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-36" />
          </CardFooter>
        </Card>
      </section>

      <section className="mb-14">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-inksoft">
          Your worlds
        </p>
        <ul>
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="flex w-full items-center gap-4 border-t-2 border-border py-4"
            >
              <Skeleton className="h-14 w-20 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-48 max-w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" />
              <Skeleton className="h-8 w-8 shrink-0" />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-inksoft">
          Community worlds
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-4/3 w-full" />
          ))}
        </div>
      </section>
    </>
  );
}
