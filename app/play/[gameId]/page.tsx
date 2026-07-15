import { World } from "@/components/World";

type PageProps = {
  params: Promise<{ gameId: string }>;
};

/** Load a saved game from Storage and enter play mode. */
export default async function PlayGamePage({ params }: PageProps) {
  const { gameId } = await params;
  return <World mode="load" gameId={gameId} />;
}
