/**
 * Port Communication Helpers
 *
 * Read/write/peek helpers for status ports and the action queue.
 * Uses the port assignments from types/ports.ts.
 *
 * Import with: import { publishStatus, peekStatus, queueAction } from "/lib/ports";
 */
import { NS } from "@ns";
import { QUEUE_PORT, QueueEntry } from "/types/ports";

/**
 * Publish a status object to a port (clear + write).
 * Each port holds exactly one current JSON value.
 * Injects `_publishedAt` timestamp for staleness detection.
 */
export function publishStatus<T>(ns: NS, port: number, data: T): void {
  const handle = ns.getPortHandle(port);
  handle.clear();
  handle.write(JSON.stringify({ ...data, _publishedAt: Date.now() }));
}

/**
 * Peek at a status port and parse the JSON value.
 * Returns null if the port is empty, contains invalid data,
 * or if maxAgeMs is provided and the data is older than that threshold.
 * Non-destructive (does not consume the value).
 */
export function peekStatus<T>(ns: NS, port: number, maxAgeMs?: number): T | null {
  const handle = ns.getPortHandle(port);
  if (handle.empty()) return null;

  const raw = handle.peek();
  if (raw === "NULL PORT DATA") return null;

  try {
    const parsed = JSON.parse(raw as string);

    if (maxAgeMs !== undefined && typeof parsed._publishedAt === "number") {
      if (Date.now() - parsed._publishedAt > maxAgeMs) return null;
    }

    return parsed as T;
  } catch {
    return null;
  }
}

/**
 * Enqueue an action for the queue runner.
 * Writes a QueueEntry to the queue port (appends, does not clear).
 */
export function queueAction(ns: NS, entry: QueueEntry): void {
  const handle = ns.getPortHandle(QUEUE_PORT);
  handle.write(JSON.stringify(entry));
}

/**
 * Read the next queue entry (destructive read).
 * Returns null if the queue is empty.
 */
export function dequeueAction(ns: NS): QueueEntry | null {
  const handle = ns.getPortHandle(QUEUE_PORT);
  if (handle.empty()) return null;

  const raw = handle.read();
  if (raw === "NULL PORT DATA") return null;

  try {
    return JSON.parse(raw as string) as QueueEntry;
  } catch {
    return null;
  }
}

/**
 * Peek at all queue entries without consuming them.
 */
export function peekQueue(ns: NS): QueueEntry[] {
  const handle = ns.getPortHandle(QUEUE_PORT);
  if (handle.empty()) return [];

  // Peek returns only the first value; to see all we drain and re-add
  const entries: QueueEntry[] = [];
  const raw: (string | number)[] = [];

  while (!handle.empty()) {
    const data = handle.read();
    if (data === "NULL PORT DATA") break;
    raw.push(data);
    try {
      entries.push(JSON.parse(data as string) as QueueEntry);
    } catch {
      // Skip invalid entries
    }
  }

  // Put them back
  for (const item of raw) {
    handle.write(item);
  }

  return entries;
}
