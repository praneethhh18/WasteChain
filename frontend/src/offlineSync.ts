/* Tiny offline-queue sync.
 * When the kabadiwala logs a batch while offline, the payload is dropped into
 * localStorage. On the next 'online' event (or app boot), we drain the queue
 * and POST each payload — preserving the original captured_at so the audit
 * trail reflects when the work actually happened, not when sync ran.
 */
import { api, BatchCreate } from "./api";

const KEY = "wc.offline_queue";

export function queuedCount(): number {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]").length; } catch { return 0; }
}

export async function drainQueue(): Promise<{ synced: number; failed: number }> {
  let synced = 0, failed = 0;
  try {
    const q: BatchCreate[] = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!q.length) return { synced, failed };
    const remaining: BatchCreate[] = [];
    for (const item of q) {
      try {
        await api.createBatch({ ...item, source_channel: "offline-sync" });
        synced++;
      } catch {
        remaining.push(item); failed++;
      }
    }
    localStorage.setItem(KEY, JSON.stringify(remaining));
    window.dispatchEvent(new CustomEvent("wc.offline.synced", { detail: { synced, failed } }));
  } catch { /* ignore */ }
  return { synced, failed };
}

export function installOfflineSync() {
  window.addEventListener("online", () => { drainQueue(); });
  // also try on boot — survives full page reload while offline
  if (navigator.onLine) drainQueue();
}
