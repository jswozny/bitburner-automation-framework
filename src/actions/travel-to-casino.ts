/**
 * Travel to Aevum (casino city) if not already there.
 *
 * RAM: ~2.0 GB (singularity.travelToCity + getPlayer)
 */
import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
   if (!ns.getResetInfo().ownedSF.has(4)) {
  ns.print("Error: SF4.1 is required to travel to Aevum. You do not have SF4.1 unlocked.");
  return;
 }
  const city = "Aevum";
  const player = ns.getPlayer();
  if (player.city === city) {
    ns.tprint(`Already in ${city}`);
    ns.toast(`Already in ${city}`, "info", 2000);
    return;
  }

  const success = ns.singularity.travelToCity(city);
  if (success) {
    ns.tprint(`SUCCESS Traveled to ${city}`);
    ns.toast(`Traveled to ${city}`, "success", 2000);
  } else {
    ns.tprint(`ERROR Failed to travel to ${city} (need $200k)`);
    ns.toast(`Failed to travel to ${city}`, "error", 3000);
  }
}
