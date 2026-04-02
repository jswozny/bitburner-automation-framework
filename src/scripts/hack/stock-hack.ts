/**
 * Stock Hack Worker — hacks a server with {stock: true} to push stock prices down.
 * Deployed to fleet servers by hack daemon in "stocks" strategy mode.
 *
 * Usage: run scripts/hack/stock-hack.js <target> [--threads 1]
 */
import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const target = ns.args[0] as string;
  if (!target) return;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await ns.hack(target, { stock: true });
  }
}
