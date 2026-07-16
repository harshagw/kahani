"use client";

import { Card } from "@/components/ui/card";

export type MinimapCell = {
  x: number;
  y: number;
  hasRoom?: boolean;
};

export type MinimapProps = {
  known: MinimapCell[];
  walked: string[];
  currentCoord: { x: number; y: number } | null;
  player: { x: number; y: number } | null;
  inside: boolean;
};

const PANEL = 140;
const INSET = 10;
const GRID_PAD = 1;

function cellKey(x: number, y: number) {
  return `${x},${y}`;
}

/** Build a minimap cell from a street scene (for World to seed/update known tiles). */
export function streetCellFromScene(s: {
  kind: string;
  coord?: { x: number; y: number };
  hotspots: { kind: string; clueIndex?: number }[];
}): MinimapCell | null {
  if (s.kind !== "street" || !s.coord) return null;
  const hasRoom = s.hotspots.some(
    (h) => h.kind === "building" && typeof h.clueIndex === "number"
  );
  return { x: s.coord.x, y: s.coord.y, hasRoom };
}

/** Merge one street cell into the known list (dedupes by coord). */
export function mergeKnownCell(cells: MinimapCell[], incoming: MinimapCell): MinimapCell[] {
  const key = cellKey(incoming.x, incoming.y);
  const idx = cells.findIndex((c) => cellKey(c.x, c.y) === key);
  if (idx === -1) return [...cells, incoming];
  const existing = cells[idx];
  if (existing.hasRoom || !incoming.hasRoom) return cells;
  const next = [...cells];
  next[idx] = { ...existing, hasRoom: true };
  return next;
}

/** Collect unique street cells from a list of scenes. */
export function streetsFromScenes(
  scenes: {
    kind: string;
    coord?: { x: number; y: number };
    hotspots: { kind: string; clueIndex?: number }[];
  }[]
): MinimapCell[] {
  let cells: MinimapCell[] = [];
  for (const s of scenes) {
    const cell = streetCellFromScene(s);
    if (cell) cells = mergeKnownCell(cells, cell);
  }
  return cells;
}

export function Minimap({
  known,
  walked,
  currentCoord,
  player,
  inside,
}: MinimapProps) {
  const walkedSet = new Set(walked);
  const cells = known.length > 0 ? known : [{ x: 0, y: 0 }];

  const minX = Math.min(...cells.map((c) => c.x)) - GRID_PAD;
  const maxX = Math.max(...cells.map((c) => c.x)) + GRID_PAD;
  const minY = Math.min(...cells.map((c) => c.y)) - GRID_PAD;
  const maxY = Math.max(...cells.map((c) => c.y)) + GRID_PAD;
  const gridW = maxX - minX + 1;
  const gridH = maxY - minY + 1;

  const inner = PANEL - INSET * 2;
  const cellSize = Math.min(inner / gridW, inner / gridH);
  const mapW = cellSize * gridW;
  const mapH = cellSize * gridH;
  const offsetX = INSET + (inner - mapW) / 2;
  const offsetY = INSET + (inner - mapH) / 2;

  const toPx = (gx: number, gy: number) => ({
    x: offsetX + (gx - minX) * cellSize,
    y: offsetY + (gy - minY) * cellSize,
  });

  let playerRect: { x: number; y: number; w: number; h: number } | null = null;
  if (currentCoord && player) {
    const base = toPx(currentCoord.x, currentCoord.y);
    const margin = cellSize * 0.12;
    const innerSize = cellSize - margin * 2;
    // Interior coords are % of the room frame, not the street — pin to cell center.
    const px = inside ? 50 : player.x;
    const py = inside ? 50 : player.y;
    playerRect = {
      x: base.x + margin + (px / 100) * innerSize,
      y: base.y + margin + (py / 100) * innerSize,
      w: Math.max(4, cellSize * 0.22),
      h: Math.max(4, cellSize * 0.22),
    };
  }

  return (
    <Card
      className="pointer-events-none p-0"
      style={{ width: PANEL, height: PANEL }}
      aria-label="World map"
    >
      <svg
        width={PANEL}
        height={PANEL}
        viewBox={`0 0 ${PANEL} ${PANEL}`}
        className="block"
      >
        {cells.map((cell) => {
          const key = cellKey(cell.x, cell.y);
          const { x, y } = toPx(cell.x, cell.y);
          const isWalked = walkedSet.has(key);
          const isCurrent =
            currentCoord?.x === cell.x && currentCoord?.y === cell.y;
          const gap = Math.max(1, cellSize * 0.08);

          return (
            <g key={key}>
              <rect
                x={x + gap / 2}
                y={y + gap / 2}
                width={cellSize - gap}
                height={cellSize - gap}
                rx={2}
                fill={
                  isCurrent
                    ? "rgba(200, 85, 46, 0.35)"
                    : isWalked
                      ? "rgba(42, 32, 26, 0.18)"
                      : "rgba(42, 32, 26, 0.08)"
                }
                stroke={
                  isCurrent
                    ? "rgba(200, 85, 46, 0.7)"
                    : isWalked
                      ? "rgba(42, 32, 26, 0.25)"
                      : "rgba(42, 32, 26, 0.12)"
                }
                strokeWidth={isCurrent ? 1.5 : 1}
              />
              {cell.hasRoom && (
                <circle
                  cx={x + cellSize - gap - 3}
                  cy={y + gap + 3}
                  r={2}
                  fill="rgba(200, 85, 46, 0.65)"
                />
              )}
            </g>
          );
        })}

        {playerRect && (
          <rect
            x={playerRect.x - playerRect.w / 2}
            y={playerRect.y - playerRect.h / 2}
            width={playerRect.w}
            height={playerRect.h}
            rx={1}
            fill={inside ? "transparent" : "var(--color-primary, #c8552e)"}
            stroke="var(--color-primary, #c8552e)"
            strokeWidth={inside ? 1.5 : 0}
          />
        )}
      </svg>
    </Card>
  );
}
