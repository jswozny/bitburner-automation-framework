import { NS } from "@ns";
import { COLORS, discoverAllWithDepthAndPath, pathTo } from "/lib/utils";

export async function main(ns: NS): Promise<void> {
  const { red, reset } = COLORS;

  const host = ns.args[0] as string | undefined;
  const source = ns.args[1] as string | undefined;

  if (host === undefined || !ns.serverExists(host)) {
    ns.tprint(`${red}ERROR: Server ${host} does not exist.${reset}`);
    return;
  }

  const start = (source === undefined || !ns.serverExists(source)) ? "home" : source;

  const { parentByHost } = discoverAllWithDepthAndPath(ns, start, 100);
  const path = pathTo(parentByHost, host, true);

  ns.tprint(path);
}
