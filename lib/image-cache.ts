import type { SceneData } from "@/lib/universe";

const imageCache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

function needsCrossOrigin(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Return a fully decoded image if it was previously preloaded.
 */
export function getCachedImage(url: string): HTMLImageElement | null {
  const img = imageCache.get(url);
  if (img?.complete && img.naturalWidth > 0) return img;
  return null;
}

/**
 * Fetch and decode an image URL into a shared `HTMLImageElement`.
 * Concurrent requests for the same URL share one in-flight promise.
 */
export function preloadImage(url: string): Promise<HTMLImageElement> {
  const cached = getCachedImage(url);
  if (cached) return Promise.resolve(cached);

  const inflight = pending.get(url);
  if (inflight) return inflight;

  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (needsCrossOrigin(url)) img.crossOrigin = "anonymous";
    img.onload = () => {
      pending.delete(url);
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => {
      pending.delete(url);
      imageCache.delete(url);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });

  pending.set(url, p);
  return p;
}

/**
 * Preload a scene backdrop and optional annotated vision frame.
 */
export async function preloadSceneImages(
  scene: Pick<SceneData, "image" | "annotated">
): Promise<void> {
  await Promise.all([
    preloadImage(scene.image),
    scene.annotated ? preloadImage(scene.annotated) : Promise.resolve(null),
  ]);
}

/**
 * Fire-and-forget warm-up when scene data enters the in-memory cache.
 */
export function warmSceneImages(scene: Pick<SceneData, "image" | "annotated">): void {
  preloadSceneImages(scene).catch(() => {});
}
