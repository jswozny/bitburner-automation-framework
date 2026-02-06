import { COLORS, discoverAllWithDepthAndPath, pathToArray } from '/lib/utils.js';

/** @param {NS} ns */
export async function main(ns) {
    ns.ui.openTail();

    const BACKDOOR = [
        "CSEC",
        "avmnite-02h",
        "I.I.I.I",
        "run4theh111z",
    ];

    for (const host of BACKDOOR) {
        const server = ns.getServer(host);
        if (server.backdoorInstalled) { continue; }

        const start = "home";

        const { parentByHost } = discoverAllWithDepthAndPath(ns, start, 100);
        const path = pathToArray(parentByHost, host, true);

        const rooted = server.hasAdminRights ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.red}`;

        ns.tprint(`${rooted} ${COLORS.cyan}${host}${COLORS.reset}`)
        ns.print(`${rooted} ${COLORS.cyan}${host}${COLORS.reset}`)
        ns.tprint(path.map(x => `connect ${x}`).join("; ") + "; backdoor");
        ns.print(path.map(x => `connect ${x}`).join("; ") + "; backdoor");
    }
}
