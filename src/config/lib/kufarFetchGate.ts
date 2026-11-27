/**
 * Single process-wide gate for every upstream request to kufar.by.
 *
 * Kufar rate-limits per IP: the parser fans out over all tracked links
 * (pLimit(10)), each link then fetches item details, and every request went out
 * immediately. The result was a wall of 429s and links silently skipped for the
 * whole cycle. One shared gate with a floor gap fixes it for both controllers.
 */
const MIN_GAP_MS = Number(process.env.KUFAR_MIN_INTERVAL_MS ?? 1500);

let tail: Promise<void> = Promise.resolve();
let lastAt = 0;

export function kufarFetchSlot(): Promise<void> {
  tail = tail.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
  });
  return tail;
}
