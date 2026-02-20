import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const player = ns.getPlayer();
  const karma = player.karma;
  const kills = player.numPeopleKilled;

  ns.tprint(`Karma: ${karma.toLocaleString()}`);
  ns.tprint(`Kills: ${kills.toLocaleString()}`);
}
