import { NS } from "@ns";
import {discoverAllWithDepthAndPath, pathTo, pathToArray} from "/lib/utils";

export async function main(ns: NS): Promise<void> {
    const BACKDOOR = [
        "CSEC",
        "avmnite-02h",
        "I.I.I.I",
        "run4theh111z",
    ];
    const start = "home";

    for (const host of BACKDOOR) {
        const server = ns.getServer(host);
        if(!server.hasAdminRights) {
            ns.tprint(`You do not have root access to ${host}`)
            continue;
        }
        if(ns.getServer(host).backdoorInstalled) continue;

        const { parentByHost } = discoverAllWithDepthAndPath(ns, start, 100);
        const path = pathToArray(parentByHost, host).slice(1);
        for (const host of path) {
            ns.singularity.connect(host);
            await ns.singularity.installBackdoor();
        }
        ns.singularity.connect("home");
    }
}
