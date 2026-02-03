/**
 * Rep Tool Plugin
 *
 * Displays reputation progress with ETA, progress bar, and running totals.
 */
import React from "lib/react";
import { NS } from "@ns";
import { ToolPlugin, FormattedRepStatus, OverviewCardProps, DetailPanelProps, PluginContext } from "dashboard/types";
import { styles } from "dashboard/styles";
import { ToolControl } from "dashboard/components/ToolControl";
import { ProgressBar } from "dashboard/components/ProgressBar";
import { getRepStatus } from "auto/auto-rep";
import { findNextWorkableAugmentation, getNonWorkableFactionProgress, getFactionWorkStatus, getSequentialPurchaseAugs, getNeuroFluxInfo, calculateNeuroFluxPurchasePlan } from "lib/factions";
import { formatTime } from "lib/utils";
import { runScript, startFactionWork, installAugments, getPluginUIState, setPluginUIState } from "dashboard/state-store";

// === REP TRACKING STATE (module-level) ===

let lastRep = 0;
let lastRepTime = Date.now();
let repGainRate = 0;
let lastTargetFaction = "";

// === FACTION BACKDOOR SERVERS ===

const FACTION_BACKDOOR_SERVERS: Record<string, string> = {
  "CyberSec": "CSEC",
  "NiteSec": "avmnite-02h",
  "The Black Hand": "I.I.I.I",
  "BitRunners": "run4theh111z",
};

/**
 * Get list of faction servers that need backdoors installed
 */
function getPendingBackdoors(ns: NS): string[] {
  const pending: string[] = [];
  for (const [faction, server] of Object.entries(FACTION_BACKDOOR_SERVERS)) {
    try {
      const serverObj = ns.getServer(server);
      if (serverObj.hasAdminRights && !serverObj.backdoorInstalled) {
        pending.push(faction);
      }
    } catch {
      // Server might not exist or not be accessible
    }
  }
  return pending;
}

// === STATUS FORMATTING ===

function formatRepStatus(ns: NS, extra?: PluginContext): FormattedRepStatus | null {
  try {
    const player = ns.getPlayer();
    const raw = getRepStatus(ns, player);

    // Use workable faction target instead of any faction
    const target = findNextWorkableAugmentation(raw.factionData);

    // Get non-workable faction progress
    const nonWorkableProgress = getNonWorkableFactionProgress(raw.factionData);

    // Get NeuroFlux info early - we may need it as fallback
    const nfInfo = getNeuroFluxInfo(ns);

    // If no regular aug target, fall back to best NFG faction for favor grinding
    let targetFaction: string;
    let targetFactionData: { currentRep: number; favor: number } | null = null;

    if (target) {
      targetFaction = target.faction.name;
      targetFactionData = { currentRep: target.faction.currentRep, favor: target.faction.favor };
    } else if (nfInfo.bestFaction) {
      // Fall back to best NFG faction for favor/rep grinding
      targetFaction = nfInfo.bestFaction;
      const factionData = raw.factionData.find(f => f.name === nfInfo.bestFaction);
      targetFactionData = factionData ? { currentRep: factionData.currentRep, favor: factionData.favor } : null;
    } else {
      targetFaction = "None";
    }

    const repRequired = target?.aug?.repReq ?? 0;
    const currentRep = target?.faction?.currentRep ?? targetFactionData?.currentRep ?? 0;
    const repGap = Math.max(0, repRequired - currentRep);
    const repProgress = repRequired > 0 ? Math.min(1, currentRep / repRequired) : 0;

    const favorToUnlock = extra?.favorToUnlock ?? 150;
    const playerMoney = extra?.playerMoney ?? player.money;

    // Update rep gain rate tracking internally
    const now = Date.now();

    if (targetFaction !== "None") {
      if (lastRep > 0 && lastTargetFaction === targetFaction) {
        const timeDelta = (now - lastRepTime) / 1000;
        if (timeDelta > 0) {
          const repDelta = currentRep - lastRep;
          repGainRate = repGainRate * 0.7 + (repDelta / timeDelta) * 0.3;
        }
      }
      lastRep = currentRep;
      lastRepTime = now;
      lastTargetFaction = targetFaction;
    }

    // Calculate ETA
    let eta = "???";
    if (repGap > 0 && repGainRate > 0) {
      eta = formatTime(repGap / repGainRate);
    } else if (repGap <= 0) {
      eta = "Ready";
    }

    const nextAugCost = target?.aug?.basePrice ?? 0;

    // Get pending backdoors
    const pendingBackdoors = getPendingBackdoors(ns);

    // Check if there are unlocked augs to buy
    const hasUnlockedAugs = raw.purchasePlan.length > 0;

    // Get work status for target faction
    const workStatus = targetFaction !== "None"
      ? getFactionWorkStatus(ns, player, targetFaction)
      : { isWorkingForFaction: false, isOptimalWork: false, bestWorkType: "hacking" as const, currentWorkType: null, isWorkable: false };

    // Get sequential purchase augs (Shadows of Anarchy, etc.)
    const sequentialAugs = getSequentialPurchaseAugs(ns, raw.factionData, playerMoney);

    return {
      targetFaction,
      nextAugName: target?.aug?.name ?? null,
      repRequired,
      repRequiredFormatted: ns.formatNumber(repRequired),
      currentRep,
      currentRepFormatted: ns.formatNumber(currentRep),
      repGap,
      repGapFormatted: ns.formatNumber(repGap),
      repGapPositive: repGap > 0,
      repProgress,
      pendingAugs: raw.pendingAugs.length,
      installedAugs: raw.installedAugs.length,
      purchasePlan: raw.purchasePlan.map(item => ({
        name: item.name,
        faction: item.faction,
        baseCost: item.basePrice,
        adjustedCost: item.adjustedCost,
        costFormatted: ns.formatNumber(item.basePrice),
        adjustedCostFormatted: ns.formatNumber(item.adjustedCost),
      })),
      repGainRate,
      eta,
      nextAugCost,
      nextAugCostFormatted: ns.formatNumber(nextAugCost),
      canAffordNextAug: playerMoney >= nextAugCost,
      favor: targetFactionData?.favor ?? 0,
      favorToUnlock,
      pendingBackdoors,
      hasUnlockedAugs,
      nonWorkableFactions: nonWorkableProgress.map(item => ({
        factionName: item.faction.name,
        nextAugName: item.nextAug.name,
        progress: item.progress,
        currentRep: ns.formatNumber(item.faction.currentRep),
        requiredRep: ns.formatNumber(item.nextAug.repReq),
      })),
      // Sequential purchase augs
      sequentialAugs: sequentialAugs.map(item => ({
        faction: item.faction,
        augName: item.aug.name,
        cost: item.aug.basePrice,
        costFormatted: ns.formatNumber(item.aug.basePrice),
        canAfford: item.canAfford,
      })),
      // Work status
      isWorkingForFaction: workStatus.isWorkingForFaction,
      isOptimalWork: workStatus.isOptimalWork,
      bestWorkType: workStatus.bestWorkType,
      currentWorkType: workStatus.currentWorkType,
      isWorkable: workStatus.isWorkable,
      // NeuroFlux Governor info
      neuroFlux: (() => {
        const nfPlan = calculateNeuroFluxPurchasePlan(ns, playerMoney);
        const nfRepProgress = nfInfo.repRequired > 0 ? Math.min(1, nfInfo.bestFactionRep / nfInfo.repRequired) : 0;
        const nfRepGap = Math.max(0, nfInfo.repRequired - nfInfo.bestFactionRep);
        return {
          currentLevel: nfInfo.currentLevel,
          bestFaction: nfInfo.bestFaction,
          hasEnoughRep: nfInfo.hasEnoughRep,
          canPurchase: nfPlan.purchases > 0,
          // Rep progress toward next NFG
          currentRep: nfInfo.bestFactionRep,
          currentRepFormatted: ns.formatNumber(nfInfo.bestFactionRep),
          repRequired: nfInfo.repRequired,
          repRequiredFormatted: ns.formatNumber(nfInfo.repRequired),
          repProgress: nfRepProgress,
          repGap: nfRepGap,
          repGapFormatted: ns.formatNumber(nfRepGap),
          currentPrice: nfInfo.currentPrice,
          currentPriceFormatted: ns.formatNumber(nfInfo.currentPrice),
          purchasePlan: nfPlan.purchases > 0 ? {
            startLevel: nfPlan.startLevel,
            endLevel: nfPlan.endLevel,
            purchases: nfPlan.purchases,
            totalCost: nfPlan.totalCost,
            totalCostFormatted: ns.formatNumber(nfPlan.totalCost),
          } : null,
        };
      })(),
    };
  } catch {
    return null;
  }
}

// === COMPONENTS ===

function RepOverviewCard({ status, running, toolId, error, pid }: OverviewCardProps<FormattedRepStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>REP</span>
        <ToolControl tool={toolId} running={running} error={!!error} pid={pid} />
      </div>
      {error ? (
        <div style={{ color: "#ffaa00", fontSize: "11px" }}>{error}</div>
      ) : status ? (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Target</span>
            <span style={styles.statHighlight}>{status.targetFaction}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Pending Augs</span>
            <span style={styles.statValue}>{status.pendingAugs}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Unlocked</span>
            <span style={styles.statValue}>{status.purchasePlan.length}</span>
          </div>
        </>
      ) : (
        <div style={styles.dim}>Loading...</div>
      )}
    </div>
  );
}

function RepDetailPanel({ status, error, running, toolId, pid }: DetailPanelProps<FormattedRepStatus>): React.ReactElement {
  if (error) {
    return (
      <div style={styles.panel}>
        <ToolControl tool={toolId} running={running} error={true} pid={pid} />
        <div style={{ color: "#ffaa00", marginTop: "12px" }}>{error}</div>
        <div style={{ ...styles.dim, marginTop: "8px", fontSize: "11px" }}>
          Requires Singularity API (Source-File 4)
        </div>
      </div>
    );
  }

  if (!status) {
    return <div style={styles.panel}>Loading rep status...</div>;
  }

  // Calculate affordable count and total
  let runningTotal = 0;
  const purchaseWithTotals = status.purchasePlan.map(item => {
    runningTotal += item.adjustedCost;
    return { ...item, runningTotal };
  });
  const totalCost = runningTotal;

  const handleBuyAugs = () => {
    runScript("rep", "factions/rep-purchase.js", ["--confirm"]);
  };

  const handleBackdoors = () => {
    runScript("rep", "factions/faction-backdoors.js", []);
  };

  const handleStartWork = () => {
    if (status.targetFaction !== "None") {
      startFactionWork(status.targetFaction);
    }
  };

  // Show work button when: workable faction, not optimal work, and still need rep
  const showWorkButton = status.isWorkable && !status.isOptimalWork && status.repGapPositive;

  // Install augments confirmation state
  const confirmInstall = getPluginUIState<boolean>("rep", "confirmInstall", false);
  const handleInstallAugs = () => {
    if (confirmInstall) {
      installAugments();
      setPluginUIState("rep", "confirmInstall", false);
    } else {
      setPluginUIState("rep", "confirmInstall", true);
    }
  };
  const handleInstallBlur = () => {
    setPluginUIState("rep", "confirmInstall", false);
  };

  // NeuroFlux buy handler
  const handleBuyNFG = () => {
    runScript("rep", "factions/neuroflux-purchase.js", ["--confirm"]);
  };

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>Target: </span>
            <span style={styles.statHighlight}>{status.targetFaction}</span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Favor: </span>
            <span style={styles.statValue}>
              {status.favor.toFixed(0)}/{status.favorToUnlock.toFixed(0)}
            </span>
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
      </div>

      {/* Action Buttons */}
      {(status.hasUnlockedAugs || status.pendingBackdoors.length > 0 || showWorkButton) && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          {showWorkButton && (
            <button
              style={{
                ...styles.buttonPlay,
                marginLeft: 0,
                padding: "4px 12px",
                backgroundColor: "#005500",
                color: "#00ff00",
              }}
              onClick={handleStartWork}
              title={`Start ${status.bestWorkType} work for ${status.targetFaction} with focus`}
            >
              Work: {status.bestWorkType}
            </button>
          )}
          {status.hasUnlockedAugs && (
            <button
              style={{
                ...styles.buttonPlay,
                marginLeft: 0,
                padding: "4px 12px",
              }}
              onClick={handleBuyAugs}
            >
              Buy Augs ({status.purchasePlan.length})
            </button>
          )}
          {status.pendingBackdoors.length > 0 && (
            <button
              style={{
                ...styles.buttonPlay,
                marginLeft: 0,
                padding: "4px 12px",
                backgroundColor: "#004455",
                color: "#00ffff",
              }}
              onClick={handleBackdoors}
              title={status.pendingBackdoors.join(", ")}
            >
              Backdoors ({status.pendingBackdoors.length})
            </button>
          )}
          {status.pendingAugs > 0 && (
              <button
                  style={{
                    ...styles.buttonPlay,
                    backgroundColor: confirmInstall ? "#aa0000" : "#550055",
                    color: confirmInstall ? "#fff" : "#ff88ff",
                    padding: "4px 12px",
                  }}
                  onClick={handleInstallAugs}
                  onBlur={handleInstallBlur}
              >
                {confirmInstall ? "Confirm Install?" : `Install Augs (${status.pendingAugs})`}
              </button>
          )}
        </div>
      )}

      {/* Next Unlock Section */}
      {status.nextAugName && (
        <div style={styles.card}>
          <div style={{ color: "#00ffff", fontSize: "12px", marginBottom: "8px" }}>
            NEXT UNLOCK: <span style={{ color: "#ffff00" }}>{status.nextAugName}</span>
          </div>

          {/* Progress Bar */}
          <ProgressBar
            progress={status.repProgress}
            label={`${(status.repProgress * 100).toFixed(1)}%`}
            fillColor={status.repProgress >= 1 ? "#00aa00" : "#0088aa"}
          />

          {/* Rep Stats */}
          <div style={styles.stat}>
            <span style={styles.statLabel}>Rep Progress</span>
            <span style={styles.statValue}>
              {status.currentRepFormatted} / {status.repRequiredFormatted}
            </span>
          </div>
          {status.repGapPositive && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Need</span>
              <span style={{ color: "#ffaa00" }}>{status.repGapFormatted} more</span>
            </div>
          )}

          {/* ETA and Cost */}
          <div style={{ ...styles.stat, marginTop: "8px" }}>
            <span style={styles.statLabel}>ETA</span>
            <span style={styles.etaDisplay}>
              {status.eta}
              {status.repGainRate > 0 && (
                <span style={styles.dim}> @ {status.repGainRate.toFixed(1)}/s</span>
              )}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Cost</span>
            <span style={status.canAffordNextAug ? styles.statHighlight : { color: "#ff4444" }}>
              {status.canAffordNextAug ? "✓" : "✗"} ${status.nextAugCostFormatted}
            </span>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Pending Augs</span>
            <span style={styles.statHighlight}>{status.pendingAugs}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Installed Augs</span>
            <span style={styles.statValue}>{status.installedAugs}</span>
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Unlocked to Buy</span>
            <span style={styles.statHighlight}>{status.purchasePlan.length}</span>
          </div>
        </div>
      </div>

      {/* Non-workable Factions Hint Box */}
      {status.nonWorkableFactions.length > 0 && (
        <div style={{
          ...styles.card,
          backgroundColor: "rgba(128, 0, 128, 0.15)",
          borderLeft: "3px solid #aa00aa",
        }}>
          <div style={{ color: "#cc88cc", fontSize: "11px", marginBottom: "6px" }}>
            PASSIVE PROGRESS (infiltration/special)
          </div>
          {status.nonWorkableFactions.map((item, i) => (
            <div key={i} style={{ marginBottom: i < status.nonWorkableFactions.length - 1 ? "8px" : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span style={{ color: "#ffffff", fontSize: "11px" }}>{item.factionName}</span>
                <span style={{ color: "#888", fontSize: "10px" }}>
                  {item.currentRep} / {item.requiredRep}
                </span>
              </div>
              <div style={{
                height: "6px",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                borderRadius: "3px",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${item.progress * 100}%`,
                  backgroundColor: "#aa00aa",
                  borderRadius: "3px",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                <span style={{ color: "#888", fontSize: "10px" }}>
                  {item.nextAugName.substring(0, 32)}
                </span>
                <span style={{ color: "#cc88cc", fontSize: "10px" }}>
                  {(item.progress * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Purchase Order Table */}
      {status.purchasePlan.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            PURCHASE ORDER
            <span style={{ ...styles.dim, marginLeft: "8px", fontWeight: "normal" }}>
              {status.purchasePlan.length} unlocked | ${totalCost.toLocaleString()} total
            </span>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.tableHeader, width: "24px" }}>#</th>
                <th style={styles.tableHeader}>Augmentation</th>
                <th style={styles.tableHeader}>Faction</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Adjusted</th>
                <th style={{ ...styles.tableHeader, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseWithTotals.slice(0, 12).map((item, i) => {
                // We'd need player money passed in to calculate affordability
                // For now, show all with styling
                const rowStyle = i % 2 === 0 ? styles.tableRow : styles.tableRowAlt;

                return (
                  <tr key={i} style={rowStyle}>
                    <td style={{ ...styles.tableCell, color: "#888" }}>{i + 1}</td>
                    <td style={{ ...styles.tableCell, color: "#fff" }}>
                      {item.name.substring(0, 32)}
                    </td>
                    <td style={{ ...styles.tableCell, color: "#fff" }}>
                      {item.faction.substring(0, 16)}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right", color: "#00ff00" }}>
                      ${item.adjustedCostFormatted}
                    </td>
                    <td style={{ ...styles.tableCell, textAlign: "right", ...styles.runningTotal }}>
                      ${item.runningTotal.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {status.purchasePlan.length > 12 && (
                <tr style={styles.tableRowAlt}>
                  <td style={{ ...styles.tableCell, ...styles.dim }} colSpan={4}>
                    ... +{status.purchasePlan.length - 12} more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sequential Purchase Augs (Shadows of Anarchy, etc.) */}
      {status.sequentialAugs.length > 0 && (
        <div style={{
          ...styles.card,
          backgroundColor: "rgba(255, 170, 0, 0.1)",
          borderLeft: "3px solid #ffaa00",
          marginTop: "8px",
        }}>
          <div style={{ color: "#ffaa00", fontSize: "11px", marginBottom: "6px" }}>
            SEQUENTIAL ONLY (one at a time)
          </div>
          {status.sequentialAugs.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ color: "#fff", fontSize: "11px" }}>
                {item.augName.substring(0, 28)}
              </span>
              <span style={{ fontSize: "11px" }}>
                <span style={{ color: "#888" }}>{item.faction}</span>
                {" - "}
                <span style={{ color: item.canAfford ? "#00ff00" : "#ff4444" }}>
                  {item.canAfford ? "✓" : "✗"} ${item.costFormatted}
                </span>
              </span>
            </div>
          ))}
          <div style={{ color: "#888", fontSize: "10px", marginTop: "4px" }}>
            Rep requirement increases after each purchase
          </div>
        </div>
      )}

      {/* NeuroFlux Governor Section */}
      {status.neuroFlux && status.neuroFlux.bestFaction && (
        <div style={{
          ...styles.card,
          backgroundColor: "rgba(0, 150, 255, 0.1)",
          borderLeft: "3px solid #0088ff",
          marginTop: "8px",
        }}>
          <div style={{ color: "#0088ff", fontSize: "11px", marginBottom: "6px" }}>
            NEUROFLUX GOVERNOR
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Best Faction</span>
            <span style={styles.statValue}>{status.neuroFlux.bestFaction}</span>
          </div>

          {/* Rep progress when not enough rep */}
          {!status.neuroFlux.hasEnoughRep && (
            <>
              <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                <ProgressBar
                  progress={status.neuroFlux.repProgress}
                  label={`${(status.neuroFlux.repProgress * 100).toFixed(1)}%`}
                  fillColor="#0088ff"
                />
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Rep Progress</span>
                <span style={styles.statValue}>
                  {status.neuroFlux.currentRepFormatted} / {status.neuroFlux.repRequiredFormatted}
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Need</span>
                <span style={{ color: "#ffaa00" }}>{status.neuroFlux.repGapFormatted} more</span>
              </div>
              {status.repGainRate > 0 && (
                <div style={styles.stat}>
                  <span style={styles.statLabel}>ETA</span>
                  <span style={styles.etaDisplay}>
                    {formatTime(status.neuroFlux.repGap / status.repGainRate)}
                    <span style={styles.dim}> @ {status.repGainRate.toFixed(1)}/s</span>
                  </span>
                </div>
              )}
            </>
          )}

          {/* Purchase info when can buy */}
          {status.neuroFlux.purchasePlan && (
            <>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Can Buy</span>
                <span style={styles.statHighlight}>
                  {status.neuroFlux.purchasePlan.purchases} upgrade{status.neuroFlux.purchasePlan.purchases !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Total Cost</span>
                <span style={{ color: "#00ff00" }}>
                  ${status.neuroFlux.purchasePlan.totalCostFormatted}
                </span>
              </div>
              <button
                style={{
                  ...styles.buttonPlay,
                  marginTop: "8px",
                  marginLeft: 0,
                  padding: "4px 12px",
                  backgroundColor: "#003366",
                  color: "#00aaff",
                }}
                onClick={handleBuyNFG}
              >
                Buy NFG ({status.neuroFlux.purchasePlan.purchases})
              </button>
            </>
          )}

          {/* Show next NFG cost when has rep but can't afford */}
          {status.neuroFlux.hasEnoughRep && !status.neuroFlux.purchasePlan && (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Next Cost</span>
              <span style={{ color: "#ff4444" }}>${status.neuroFlux.currentPriceFormatted}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// === PLUGIN EXPORT ===

export const repPlugin: ToolPlugin<FormattedRepStatus> = {
  name: "REP",
  id: "rep",
  script: "/auto/auto-rep.js",
  getFormattedStatus: formatRepStatus,
  OverviewCard: RepOverviewCard,
  DetailPanel: RepDetailPanel,
};
