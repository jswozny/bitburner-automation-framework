/**
 * Stock Grow Worker — grows a server with {stock: true} to push stock prices up.
 * Deployed to fleet servers by hack daemon in "stocks" strategy mode.
 *
 * Usage: run scripts/hack/stock-grow.js <target> [--threads 1]
 */
import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const target = ns.args[0] as string;
  if (!target) return;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await ns.grow(target, { stock: true });
  }
}
