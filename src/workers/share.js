/**
 * Share Worker
 *
 * Shares computing power with factions. Written in plain JavaScript to
 * minimize RAM cost for fleet deployment.
 *
 * RAM: 4.00 GB (ns.share)
 *
 * Args: none
 */
/** @param {NS} ns */
export async function main(ns) {
  await ns.share();
}
