/**
 * Work Tool Plugin
 *
 * Displays training status, focus selection, and skill progress.
 */
import React from "lib/react";
import { NS } from "@ns";
import {
  ToolPlugin,
  FormattedWorkStatus,
  OverviewCardProps,
  DetailPanelProps,
} from "views/dashboard/types";
import { styles } from "views/dashboard/styles";
import { ToolControl } from "views/dashboard/components/ToolControl";
import {
  getWorkStatus,
  getSkillDisplayName,
  WorkFocus,
  TRAVEL_COST,
} from "/controllers/work";
import { writeWorkFocusCommand, writeStartTrainingCommand } from "views/dashboard/state-store";

// === FOCUS OPTIONS ===

const FOCUS_OPTIONS: { value: WorkFocus; label: string; description: string }[] = [
  { value: "strength", label: "Strength", description: "Train strength at gym" },
  { value: "defense", label: "Defense", description: "Train defense at gym" },
  { value: "dexterity", label: "Dexterity", description: "Train dexterity at gym" },
  { value: "agility", label: "Agility", description: "Train agility at gym" },
  { value: "hacking", label: "Hacking", description: "Study algorithms at university" },
  { value: "charisma", label: "Charisma", description: "Study leadership at university" },
  { value: "balance-combat", label: "Balance Combat", description: "Rotate STR/DEF/DEX/AGI" },
  { value: "balance-all", label: "Balance All", description: "Rotate all 6 skills" },
  { value: "crime-money", label: "Crime (Money)", description: "Best crime for $/min" },
  { value: "crime-stats", label: "Crime (Stats)", description: "Best crime for combat exp" },
];

// === STATUS FORMATTING ===

function formatWorkStatus(ns: NS): FormattedWorkStatus | null {
  try {
    const status = getWorkStatus(ns);

    // Check if player is focused on current work
    const isFocused = ns.singularity.isFocused();

    // Calculate lowest combat stat for balance progress
    const combatStats = [
      status.skills.strength,
      status.skills.defense,
      status.skills.dexterity,
      status.skills.agility,
    ];
    const lowestCombat = Math.min(...combatStats);
    const highestCombat = Math.max(...combatStats);

    // Determine current activity display
    let activityDisplay = "Idle";
    let activityType: "gym" | "university" | "crime" | "idle" | "other" = "idle";
    const focusedSuffix = isFocused ? " (focused)" : "";

    if (status.currentWork) {
      if (status.currentWork.type === "class") {
        const stat = status.currentWork.stat ?? "";
        if (stat.toLowerCase().includes("gym")) {
          activityType = "gym";
          activityDisplay = `Gym: ${stat}`;
        } else {
          activityType = "university";
          activityDisplay = `University: ${stat}`;
        }
        if (status.currentWork.location) {
          activityDisplay += ` @ ${status.currentWork.location}`;
        }
        activityDisplay += focusedSuffix;
      } else if (status.currentWork.type === "crime") {
        activityType = "crime";
        activityDisplay = `Crime: ${status.currentWork.stat ?? "Unknown"}${focusedSuffix}`;
      } else {
        activityType = "other";
        activityDisplay = status.currentWork.type + focusedSuffix;
      }
    }

    return {
      currentFocus: status.currentFocus,
      focusLabel: FOCUS_OPTIONS.find((f) => f.value === status.currentFocus)?.label ?? status.currentFocus,
      playerCity: status.playerCity,
      playerMoney: status.playerMoney,
      playerMoneyFormatted: ns.formatNumber(status.playerMoney),
      isFocused,
      skills: {
        strength: status.skills.strength,
        defense: status.skills.defense,
        dexterity: status.skills.dexterity,
        agility: status.skills.agility,
        hacking: status.skills.hacking,
        charisma: status.skills.charisma,
        strengthFormatted: ns.formatNumber(status.skills.strength, 0),
        defenseFormatted: ns.formatNumber(status.skills.defense, 0),
        dexterityFormatted: ns.formatNumber(status.skills.dexterity, 0),
        agilityFormatted: ns.formatNumber(status.skills.agility, 0),
        hackingFormatted: ns.formatNumber(status.skills.hacking, 0),
        charismaFormatted: ns.formatNumber(status.skills.charisma, 0),
      },
      activityDisplay,
      activityType,
      isTraining: status.isTraining,
      recommendation: status.recommendedAction
        ? {
            type: status.recommendedAction.type,
            location: status.recommendedAction.location,
            city: status.recommendedAction.city,
            skill: status.recommendedAction.skill,
            skillDisplay: getSkillDisplayName(status.recommendedAction.skill),
            expMult: status.recommendedAction.expMult,
            expMultFormatted: status.recommendedAction.type === "crime"
              ? ns.formatNumber(status.recommendedAction.expMult)
              : `${status.recommendedAction.expMult}x`,
            needsTravel: status.recommendedAction.needsTravel,
            travelCost: status.recommendedAction.travelCost,
            travelCostFormatted: ns.formatNumber(TRAVEL_COST),
          }
        : null,
      canTravelToBest: status.canTravelToBest,
      skillTimeSpent: Object.entries(status.skillTimeSpent).map(([skill, time]) => ({
        skill,
        skillDisplay: getSkillDisplayName(skill),
        timeMs: time as number,
        timeFormatted: `${Math.floor((time as number) / 1000)}s`,
      })),
      lowestCombatStat: lowestCombat,
      highestCombatStat: highestCombat,
      combatBalance: highestCombat > 0 ? lowestCombat / highestCombat : 1,
      balanceRotation: status.balanceRotation
        ? {
            currentSkill: status.balanceRotation.currentSkill,
            currentSkillDisplay: getSkillDisplayName(status.balanceRotation.currentSkill),
            currentValue: status.balanceRotation.currentValue,
            currentValueFormatted: ns.formatNumber(status.balanceRotation.currentValue, 0),
            lowestSkill: status.balanceRotation.lowestSkill,
            lowestSkillDisplay: getSkillDisplayName(status.balanceRotation.lowestSkill),
            lowestValue: status.balanceRotation.lowestValue,
            lowestValueFormatted: ns.formatNumber(status.balanceRotation.lowestValue, 0),
            timeSinceSwitch: status.balanceRotation.timeSinceSwitch,
            timeUntilEligible: status.balanceRotation.timeUntilEligible,
            timeUntilEligibleFormatted: status.balanceRotation.timeUntilEligible > 0
              ? `${Math.ceil(status.balanceRotation.timeUntilEligible / 1000)}s`
              : "Ready",
            canSwitch: status.balanceRotation.canSwitch,
            isTrainingLowest: status.balanceRotation.isTrainingLowest,
            skillValues: status.balanceRotation.skillValues.map(sv => ({
              skill: sv.skill,
              display: getSkillDisplayName(sv.skill),
              value: sv.value,
              valueFormatted: ns.formatNumber(sv.value, 0),
            })),
          }
        : null,
      crimeInfo: status.currentCrime
        ? {
            name: status.currentCrime.crime,
            chance: status.currentCrime.chance,
            chanceFormatted: `${(status.currentCrime.chance * 100).toFixed(1)}%`,
            moneyPerMin: status.currentCrime.moneyPerMin,
            moneyPerMinFormatted: ns.formatNumber(status.currentCrime.moneyPerMin),
            combatExpPerMin:
              status.currentCrime.strExpPerMin +
              status.currentCrime.defExpPerMin +
              status.currentCrime.dexExpPerMin +
              status.currentCrime.agiExpPerMin,
          }
        : null,
      pendingCrimeSwitch: null,
    };
  } catch {
    return null;
  }
}

// === COMPONENTS ===

function WorkOverviewCard({
  status,
  running,
  toolId,
  error,
  pid,
}: OverviewCardProps<FormattedWorkStatus>): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        <span>WORK</span>
        <ToolControl tool={toolId} running={running} error={!!error} pid={pid} />
      </div>
      {error ? (
        <div style={{ color: "#ffaa00", fontSize: "11px" }}>{error}</div>
      ) : (
        <>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Focus</span>
            <span style={styles.statHighlight}>{status?.focusLabel ?? "—"}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Activity</span>
            <span
              style={{
                color: status
                  ? status.activityType === "gym"
                    ? "#ff8800"
                    : status.activityType === "university"
                      ? "#00aaff"
                      : status.activityType === "crime"
                        ? "#ff4444"
                        : "#888"
                  : "#888",
              }}
            >
              {status ? (status.isTraining ? "Training" : "Idle") : "—"}
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>City</span>
            <span style={styles.statValue}>{status?.playerCity ?? "—"}</span>
          </div>
        </>
      )}
    </div>
  );
}

function WorkDetailPanel({
  status,
  error,
  running,
  toolId,
  pid,
}: DetailPanelProps<FormattedWorkStatus>): React.ReactElement {
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

  const handleFocusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFocus = e.target.value as WorkFocus;
    writeWorkFocusCommand(newFocus);
  };

  const handleStartTraining = () => {
    writeStartTrainingCommand();
  };

  const isBalanceMode = status &&
    (status.currentFocus === "balance-combat" || status.currentFocus === "balance-all");

  return (
    <div style={styles.panel}>
      {/* Header Row */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span>
            <span style={styles.statLabel}>City: </span>
            <span style={styles.statValue}>{status?.playerCity ?? "—"}</span>
          </span>
          <span style={styles.dim}>|</span>
          <span>
            <span style={styles.statLabel}>Money: </span>
            <span style={styles.statHighlight}>${status?.playerMoneyFormatted ?? "—"}</span>
          </span>
        </div>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>

      {/* Focus Selection */}
      <div style={styles.card}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={styles.statLabel}>Focus:</span>
          <select
            value={status?.currentFocus ?? "strength"}
            onChange={handleFocusChange}
            style={{
              backgroundColor: "#1a1a1a",
              color: "#00ff00",
              border: "1px solid #333",
              padding: "4px 8px",
              fontSize: "12px",
              borderRadius: "3px",
              cursor: "pointer",
              flex: 1,
            }}
          >
            {FOCUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} - {opt.description}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Current Activity */}
      <div style={styles.card}>
        <div style={{ color: "#00ffff", fontSize: "12px", marginBottom: "6px" }}>
          CURRENT ACTIVITY
        </div>
        <div
          style={{
            fontSize: "14px",
            color: status
              ? status.activityType === "gym"
                ? "#ff8800"
                : status.activityType === "university"
                  ? "#00aaff"
                  : status.activityType === "crime"
                    ? "#ff4444"
                    : "#888"
              : "#888",
          }}
        >
          {status?.activityDisplay ?? "—"}
        </div>
      </div>

      {/* Skills Grid */}
      <div style={{ ...styles.card, marginBottom: "8px" }}>
        <div style={{ color: "#00ffff", fontSize: "12px", marginBottom: "8px" }}>SKILLS</div>
        <div style={styles.grid}>
          <div style={styles.stat}>
            <span style={{ color: "#ff8800" }}>STR</span>
            <span style={styles.statValue}>{status?.skills.strengthFormatted ?? "—"}</span>
          </div>
          <div style={styles.stat}>
            <span style={{ color: "#ff8800" }}>DEF</span>
            <span style={styles.statValue}>{status?.skills.defenseFormatted ?? "—"}</span>
          </div>
          <div style={styles.stat}>
            <span style={{ color: "#ff8800" }}>DEX</span>
            <span style={styles.statValue}>{status?.skills.dexterityFormatted ?? "—"}</span>
          </div>
          <div style={styles.stat}>
            <span style={{ color: "#ff8800" }}>AGI</span>
            <span style={styles.statValue}>{status?.skills.agilityFormatted ?? "—"}</span>
          </div>
          <div style={styles.stat}>
            <span style={{ color: "#00aaff" }}>HACK</span>
            <span style={styles.statValue}>{status?.skills.hackingFormatted ?? "—"}</span>
          </div>
          <div style={styles.stat}>
            <span style={{ color: "#aa00ff" }}>CHA</span>
            <span style={styles.statValue}>{status?.skills.charismaFormatted ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Recommendation */}
      {status?.recommendation && (
        <div
          style={{
            ...styles.card,
            backgroundColor:
              status.recommendation.type === "crime"
                ? "rgba(255, 68, 68, 0.1)"
                : status.recommendation.type === "gym"
                  ? "rgba(255, 136, 0, 0.1)"
                  : "rgba(0, 170, 255, 0.1)",
            borderLeft: `3px solid ${
              status.recommendation.type === "crime"
                ? "#ff4444"
                : status.recommendation.type === "gym"
                  ? "#ff8800"
                  : "#00aaff"
            }`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#00ffff", fontSize: "12px" }}>RECOMMENDED</div>
            {!status?.isTraining && (
              <button
                style={{
                  ...styles.buttonPlay,
                  marginLeft: 0,
                  padding: "4px 12px",
                }}
                onClick={handleStartTraining}
              >
                Start
              </button>
            )}
          </div>

          {status.recommendation.type === "crime" ? (
            <>
              <div style={{ fontSize: "14px", color: "#fff", marginTop: "6px" }}>
                {status.recommendation.location}
              </div>
              {status.crimeInfo && (
                <div style={{ marginTop: "6px" }}>
                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Success Rate</span>
                    <span
                      style={{
                        color: status.crimeInfo.chance >= 0.8 ? "#00ff00" : "#ffaa00",
                      }}
                    >
                      {status.crimeInfo.chanceFormatted}
                    </span>
                  </div>
                  <div style={styles.stat}>
                    <span style={styles.statLabel}>$/min</span>
                    <span style={styles.statHighlight}>
                      {status.crimeInfo.moneyPerMinFormatted}
                    </span>
                  </div>
                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Combat exp/min</span>
                    <span style={styles.statValue}>
                      {status.crimeInfo.combatExpPerMin.toFixed(1)}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: "14px", color: "#fff", marginTop: "6px" }}>
                {status.recommendation.location}
              </div>
              <div style={{ marginTop: "6px" }}>
                <div style={styles.stat}>
                  <span style={styles.statLabel}>Skill</span>
                  <span style={styles.statValue}>{status.recommendation.skillDisplay}</span>
                </div>
                <div style={styles.stat}>
                  <span style={styles.statLabel}>Exp Multiplier</span>
                  <span style={styles.statHighlight}>{status.recommendation.expMultFormatted}</span>
                </div>
                {status.recommendation.needsTravel && (
                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Travel to {status.recommendation.city}</span>
                    <span
                      style={{
                        color: status.canTravelToBest ? "#00ff00" : "#ff4444",
                      }}
                    >
                      {status.canTravelToBest ? "✓" : "✗"} $
                      {status.recommendation.travelCostFormatted}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Pending Crime Switch */}
      {status?.pendingCrimeSwitch && (
        <div
          style={{
            ...styles.card,
            backgroundColor: "rgba(255, 170, 0, 0.1)",
            borderLeft: "3px solid #ffaa00",
          }}
        >
          <div style={{ color: "#ffaa00", fontSize: "12px", marginBottom: "6px" }}>
            SWITCHING AFTER CURRENT ATTEMPT
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Current</span>
            <span style={{ color: "#ff4444" }}>
              {status.pendingCrimeSwitch.currentCrime} ({status.pendingCrimeSwitch.currentValueFormatted} {status.pendingCrimeSwitch.metric})
            </span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statLabel}>Best</span>
            <span style={{ color: "#00ff00" }}>
              {status.pendingCrimeSwitch.bestCrime} ({status.pendingCrimeSwitch.bestValueFormatted} {status.pendingCrimeSwitch.metric})
            </span>
          </div>
        </div>
      )}

      {/* Balance Mode Status */}
      {isBalanceMode && status?.balanceRotation && (
        <div style={styles.card}>
          <div style={{ color: "#00ffff", fontSize: "12px", marginBottom: "8px" }}>
            BALANCE ROTATION
          </div>

          {/* Current training status */}
          <div style={styles.stat}>
            <span style={styles.statLabel}>Training</span>
            <span style={styles.statHighlight}>
              {status.balanceRotation.currentSkillDisplay} ({status.balanceRotation.currentValueFormatted})
            </span>
          </div>

          {/* Switch status */}
          {status.balanceRotation.isTrainingLowest ? (
            <div style={styles.stat}>
              <span style={styles.statLabel}>Status</span>
              <span style={{ color: "#00ff00" }}>Training lowest skill</span>
            </div>
          ) : (
            <>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Lowest</span>
                <span style={{ color: "#ffaa00" }}>
                  {status.balanceRotation.lowestSkillDisplay} ({status.balanceRotation.lowestValueFormatted})
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Switch in</span>
                <span style={{ color: status.balanceRotation.canSwitch ? "#00ff00" : "#fff" }}>
                  {status.balanceRotation.timeUntilEligibleFormatted}
                  {status.balanceRotation.canSwitch && " (will switch)"}
                </span>
              </div>
            </>
          )}

          {/* All skills sorted by value */}
          <div style={{ marginTop: "8px", borderTop: "1px solid #333", paddingTop: "8px" }}>
            <div style={{ ...styles.dim, fontSize: "10px", marginBottom: "4px" }}>
              Skills (lowest → highest)
            </div>
            {status.balanceRotation.skillValues.map((sv, i) => (
              <div key={i} style={{
                ...styles.stat,
                color: sv.skill === status.balanceRotation?.currentSkill ? "#00ff00" :
                       sv.skill === status.balanceRotation?.lowestSkill ? "#ffaa00" : "#888",
              }}>
                <span>{sv.display}</span>
                <span>{sv.valueFormatted}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// === PLUGIN EXPORT ===

export const workPlugin: ToolPlugin<FormattedWorkStatus> = {
  name: "WORK",
  id: "work",
  script: "daemons/work.js",
  getFormattedStatus: formatWorkStatus,
  OverviewCard: WorkOverviewCard,
  DetailPanel: WorkDetailPanel,
};
