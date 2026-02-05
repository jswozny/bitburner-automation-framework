import { COLORS, discoverAllWithDepthAndPath, pathToArray } from '/lib/utils.js';

/** @param {NS} ns */
export async function main(ns) {
    const BACKDOOR = [
        "CSEC",
        "avmnite-02h",
        "I.I.I.I",
        "run4theh111z",
    ];

    for (const host of BACKDOOR) {
        const start = "home";

        const { parentByHost } = discoverAllWithDepthAndPath(ns, start, 100);
        const path = pathToArray(parentByHost, host, true);

        ns.tprint(`${COLORS.cyan}${host}${COLORS.reset}`)
        ns.tprint(path.map(x => `connect ${x}`).join("; ") + "; backdoorAbs");
    }
}