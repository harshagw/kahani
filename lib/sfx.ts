/**
 * UI/game sound effects (issue #21), backed by real soundcn sound assets
 * (https://soundcn.xyz) installed via the shadcn CLI, the same way every
 * other file in `components/ui/` was added to this project.
 *
 * Components opt in by name; the shared `Button` plays "click" by default
 * and accepts a `sound` prop for anything else (or "none" to stay silent).
 */

import { playSound } from "@/lib/sound-engine";
import type { SoundAsset } from "@/lib/sound-types";
import { click001Sound } from "@/lib/click-001";
import { clickSoftSound } from "@/lib/click-soft";
import { close001Sound } from "@/lib/close-001";
import { coinCollectSound } from "@/lib/coin-collect";
import { errorBuzzSound } from "@/lib/error-buzz";
import { notificationPopSound } from "@/lib/notification-pop";
import { successChimeSound } from "@/lib/success-chime";
import { switchOffSound } from "@/lib/switch-off";
import { switchOnSound } from "@/lib/switch-on";

/** Names of the available sound effects. */
export type SfxName =
  | "click"
  | "tap"
  | "toggleOn"
  | "toggleOff"
  | "open"
  | "close"
  | "pickup"
  | "success"
  | "error";

/** Effect name -> soundcn asset it plays. */
const SFX_LIBRARY: Record<SfxName, SoundAsset> = {
  click: click001Sound,
  tap: clickSoftSound,
  toggleOn: switchOnSound,
  toggleOff: switchOffSound,
  open: notificationPopSound,
  close: close001Sound,
  pickup: coinCollectSound,
  success: successChimeSound,
  error: errorBuzzSound,
};

/** Level for all effects relative to the source clip; they sit under voice and music. */
const VOLUME = 0.35;

/**
 * Play a named effect. Safe anywhere: no-ops during SSR. Effects triggered
 * from real input handlers satisfy browser autoplay rules, since the
 * gesture itself creates/resumes the underlying AudioContext.
 */
export function playSfx(name: SfxName): void {
  if (typeof window === "undefined") return;
  void playSound(SFX_LIBRARY[name].dataUri, { volume: VOLUME });
}
