import type { EdgeOpenness } from "./universe";

/** Cardinal exit from an overworld screen. */
export type Direction = "n" | "e" | "s" | "w";

const DIR_OPPOSITE: Record<Direction, Direction> = {
  n: "s",
  e: "w",
  s: "n",
  w: "e",
};

const ALL_DIRECTIONS: Direction[] = ["n", "e", "s", "w"];

const COORD_DELTA: Record<Direction, { dx: number; dy: number }> = {
  n: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 },
  s: { dx: 0, dy: 1 },
  w: { dx: -1, dy: 0 },
};

/**
 * Ensure a street screen never traps the player with zero exits or only one
 * (typically just the way back). The vision pass often seals three sides;
 * without this, a screen entered from the east can end up with only west open.
 */
export function normalizeScreenEdges(
  edges: EdgeOpenness,
  arriveFrom: Direction | null,
  /** Loaded saves: `"x,y"` keys of existing street tiles — prefer opening toward empty ones. */
  knownStreetCoords?: Set<string>,
  coord?: { x: number; y: number }
): EdgeOpenness {
  const next: EdgeOpenness = { ...edges };

  if (arriveFrom) {
    next[DIR_OPPOSITE[arriveFrom]] = true;
  }

  const openDirs = () => ALL_DIRECTIONS.filter((d) => next[d]);
  if (openDirs().length >= 2) return next;

  if (openDirs().length === 0) {
    next.e = true;
    return next;
  }

  // Exactly one open edge — need at least one more to explore onward.
  if (arriveFrom && !next[arriveFrom]) {
    next[arriveFrom] = true;
    return next;
  }

  if (coord && knownStreetCoords) {
    for (const d of ALL_DIRECTIONS) {
      if (next[d]) continue;
      const { dx, dy } = COORD_DELTA[d];
      if (!knownStreetCoords.has(`${coord.x + dx},${coord.y + dy}`)) {
        next[d] = true;
        return next;
      }
    }
  }

  const extra = ALL_DIRECTIONS.find((d) => !next[d]);
  if (extra) next[extra] = true;
  return next;
}

/** Build `"x,y"` keys for every saved street tile. */
export function streetCoordKeys(
  scenes: { kind: string; coord?: { x: number; y: number } }[]
): Set<string> {
  const keys = new Set<string>();
  for (const s of scenes) {
    if (s.kind === "street" && s.coord) {
      keys.add(`${s.coord.x},${s.coord.y}`);
    }
  }
  return keys;
}

/** Repair persisted scenes that were saved with only one open edge. */
export function repairLoadedStreetEdges(
  scene: { kind: string; coord?: { x: number; y: number }; edges?: EdgeOpenness },
  knownStreetCoords: Set<string>
): EdgeOpenness | undefined {
  if (scene.kind !== "street" || !scene.coord || !scene.edges) return scene.edges;
  return normalizeScreenEdges(scene.edges, null, knownStreetCoords, scene.coord);
}
