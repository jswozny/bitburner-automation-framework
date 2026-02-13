/** @param {NS} ns */
export async function main(ns) {
  const installed = ns.singularity.getOwnedAugmentations(false);
  const all = ns.singularity.getOwnedAugmentations(true);
  const pending = all.filter(a => !installed.includes(a));

  ns.tprint(`\n=== Installed Augmentations (${installed.length}) ===`);
  for (const aug of installed.sort()) {
    const stats = ns.singularity.getAugmentationStats(aug);
    const bonuses = formatStats(stats);
    ns.tprint(`  ${aug}${bonuses ? ` — ${bonuses}` : ""}`);
  }

  if (pending.length > 0) {
    ns.tprint(`\n=== Pending Install (${pending.length}) ===`);
    for (const aug of pending.sort()) {
      const stats = ns.singularity.getAugmentationStats(aug);
      const bonuses = formatStats(stats);
      ns.tprint(`  ${aug}${bonuses ? ` — ${bonuses}` : ""}`);
    }
  }

  ns.tprint(`\nTotal: ${installed.length} installed, ${pending.length} pending`);
}

function formatStats(stats) {
  return Object.entries(stats)
    .filter(([, v]) => v !== 1)
    .map(([k, v]) => {
      const name = k.replace(/_/g, " ");
      const pct = ((v - 1) * 100).toFixed(0);
      return `${name} ${v > 1 ? "+" : ""}${pct}%`;
    })
    .join(", ");
}
