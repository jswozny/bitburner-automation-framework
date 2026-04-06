/**
 * Corporation Tool Plugin
 *
 * OverviewCard shows corp name, phase, profit, and next step.
 * DetailPanel is a single scrollable panel with sections:
 * Roadmap, Status, Financials, Divisions, Products, Unlocks, Upgrades,
 * Investment, Recommendations, Settings, TierFooter.
 */
import React from "lib/react";
import {
  ToolPlugin,
  OverviewCardProps,
  DetailPanelProps,
} from "views/dashboard/types";
import {
  CorpStatus,
  CorpDivisionStatus,
  CorpProductStatus,
  CorpRecommendation,
  CorpPhase,
} from "/types/ports";
import { styles } from "views/dashboard/styles";
import { ToolControl } from "views/dashboard/components/ToolControl";
import { TierFooter } from "views/dashboard/components/TierFooter";
import {
  acceptCorpRecommendation,
  dismissCorpRecommendation,
  toggleCorpAutoProducts,
  toggleCorpAutoTea,
  setCorpDividendRate,
  toggleCorpEnabled,
  isCorpEnabled,
} from "views/dashboard/state-store";

export type FormattedCorpStatus = CorpStatus;

// === PHASE ROADMAP ===

const PHASE_ORDER: { phase: CorpPhase; label: string }[] = [
  { phase: "not-created", label: "Create" },
  { phase: "setup", label: "Setup" },
  { phase: "agriculture", label: "Agriculture" },
  { phase: "investment-1", label: "Invest 1" },
  { phase: "investment-2", label: "Invest 2" },
  { phase: "tobacco-setup", label: "Tobacco" },
  { phase: "product-dev", label: "Products" },
  { phase: "investment-3", label: "Invest 3" },
  { phase: "public", label: "Public" },
  { phase: "profit", label: "Profit" },
];

function PhaseRoadmap({ currentPhase }: { currentPhase: CorpPhase }): React.ReactElement {
  const currentIdx = PHASE_ORDER.findIndex(p => p.phase === currentPhase);

  return (
    <div style={{ ...styles.section, marginTop: "8px" }}>
      <div style={styles.sectionTitle}>ROADMAP</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px", alignItems: "center" }}>
        {PHASE_ORDER.map((entry, i) => {
          let icon: string;
          let color: string;
          if (i < currentIdx) {
            icon = "\u2713"; // checkmark
            color = "#00cc44";
          } else if (i === currentIdx) {
            icon = "\u25CF"; // filled circle
            color = "#00ccff";
          } else {
            icon = "\u25CB"; // empty circle
            color = "#555";
          }

          return (
            <React.Fragment key={entry.phase}>
              {i > 0 && <span style={{ color: "#333", fontSize: "10px" }}>{"\u2192"}</span>}
              <span style={{
                fontSize: "11px",
                color,
                fontWeight: i === currentIdx ? "bold" : "normal",
                whiteSpace: "nowrap",
              }}>
                {icon} {entry.label}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// === STATUS CARD ===

function StatusCard({ status }: { status: CorpStatus }): React.ReactElement {
  const hasManualAction = status.manualAction != null;
  const isLosing = status.hasCorp && status.profit < 0 && !status.savingFor;
  const borderColor = hasManualAction ? "#ffaa00" : isLosing ? "#ff4444" : "#00cc44";

  return (
    <div style={{
      ...styles.section,
      border: `1px solid ${borderColor}`,
      borderRadius: "4px",
      padding: "8px 10px",
      background: "#1a1a1a",
    }}>
      <div style={styles.sectionTitle}>STATUS</div>
      <div style={{ fontSize: "12px", color: "#ddd", marginBottom: status.savingFor || hasManualAction ? "6px" : "0" }}>
        {status.nextStep}
      </div>
      {status.nextStepDetail && (
        <div style={{ fontSize: "11px", color: "#888", marginBottom: status.savingFor || hasManualAction ? "6px" : "0" }}>
          {status.nextStepDetail}
        </div>
      )}
      {status.savingFor && (
        <div style={{ marginTop: "4px" }}>
          <div style={{ height: "8px", background: "#222", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{
              width: `${Math.min(100, status.savingForProgress * 100)}%`,
              height: "100%",
              background: borderColor,
              borderRadius: "2px",
              transition: "width 0.3s ease",
            }} />
          </div>
          <div style={{ fontSize: "10px", color: "#888", marginTop: "2px", textAlign: "right" }}>
            {(status.savingForProgress * 100).toFixed(0)}%
          </div>
        </div>
      )}
      {hasManualAction && (
        <div style={{ fontSize: "11px", color: "#ffaa00", marginTop: "4px" }}>
          {"\u26A0"} {status.manualAction}
        </div>
      )}
    </div>
  );
}

// === RECOMMENDATION CARD ===

function RecommendationCard({ rec }: { rec: CorpRecommendation }): React.ReactElement {
  const borderColor = rec.priority === "high" ? "#ff4444" : rec.priority === "medium" ? "#ffaa00" : "#666";
  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: "4px",
      padding: "8px 10px",
      marginBottom: "6px",
      background: "#1a1a1a",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <span style={{ fontWeight: "bold", color: borderColor, fontSize: "12px" }}>{rec.title}</span>
        <span style={{ fontSize: "10px", color: "#888" }}>{rec.priority}</span>
      </div>
      <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "6px" }}>{rec.description}</div>
      {rec.estimatedValue > 0 && (
        <div style={{ fontSize: "11px", color: "#00ff00", marginBottom: "6px" }}>
          Value: {rec.estimatedValueFormatted}
        </div>
      )}
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          style={{
            backgroundColor: "#1a2a1a",
            color: "#00ff00",
            border: "1px solid #00ff00",
            borderRadius: "3px",
            padding: "2px 10px",
            fontSize: "11px",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
          onClick={() => acceptCorpRecommendation(rec.id)}
        >
          Accept
        </button>
        <button
          style={{
            backgroundColor: "#1a1a1a",
            color: "#888",
            border: "1px solid #444",
            borderRadius: "3px",
            padding: "2px 10px",
            fontSize: "11px",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
          onClick={() => dismissCorpRecommendation(rec.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// === TOGGLE BUTTON ===

function ToggleButton({ on, onToggle }: { on: boolean; onToggle: (v: boolean) => void }): React.ReactElement {
  return (
    <button
      style={{
        backgroundColor: "#1a1a1a",
        color: on ? "#00ff00" : "#ff8800",
        border: `1px solid ${on ? "#00ff00" : "#ff8800"}`,
        borderRadius: "3px",
        padding: "1px 6px",
        fontSize: "10px",
        fontFamily: "inherit",
        cursor: "pointer",
      }}
      onClick={() => onToggle(!on)}
    >
      {on ? "ON" : "OFF"}
    </button>
  );
}

// === OVERVIEW CARD ===

function CorpOverviewCard({
  status,
  running,
  toolId,
  pid,
}: OverviewCardProps<FormattedCorpStatus>): React.ReactElement {
  const enabled = isCorpEnabled();

  return (
    <div style={styles.cardOverview}>
      <div style={styles.cardTitle}>
        <span>CORP</span>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>
      {status ? (
        status.hasCorp ? (
          <>
            <div style={styles.stat}>
              <span style={styles.statLabel}>{status.corpName}</span>
              <span style={{ color: "#00ccff", fontSize: "11px" }}>{status.phaseLabel}</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statLabel}>Profit</span>
              <span style={{ color: status.profit >= 0 ? "#00ff00" : "#ff4444" }}>
                {status.profitFormatted}/s
              </span>
            </div>
            {status.recommendations.length > 0 && (
              <div style={styles.stat}>
                <span style={styles.statLabel}>Actions</span>
                <span style={{ color: "#ffaa00" }}>{status.recommendations.length} pending</span>
              </div>
            )}
          </>
        ) : (
          <div style={styles.stat}>
            <span style={styles.statLabel}>Status</span>
            <span style={styles.dim}>No Corporation</span>
          </div>
        )
      ) : (
        <div style={styles.stat}>
          <span style={styles.statLabel}>Status</span>
          <span style={!enabled ? { color: "#ff4444" } : styles.dim}>
            {!enabled ? "Disabled" : running ? "Starting..." : "Stopped"}
          </span>
        </div>
      )}
    </div>
  );
}

// === DETAIL PANEL ===

function CorpDetailPanel({
  status,
  running,
  toolId,
  pid,
}: DetailPanelProps<FormattedCorpStatus>): React.ReactElement {
  const enabled = isCorpEnabled();

  if (!status) {
    return (
      <div style={styles.panel}>
        <div style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.statLabel}>Corporation</span>
            {!enabled && (
              <>
                <span style={styles.dim}>|</span>
                <span style={{ color: "#ff4444", fontSize: "11px" }}>Disabled</span>
              </>
            )}
          </div>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>
        {!enabled ? (
          <div style={{ marginTop: "12px" }}>
            <div style={{ color: "#888", marginBottom: "8px" }}>
              Corp daemon is disabled. It will not run on augment install and does not claim budget space.
            </div>
            <button
              style={{
                backgroundColor: "#1a2a1a",
                color: "#00ff00",
                border: "1px solid #00ff00",
                borderRadius: "3px",
                padding: "4px 16px",
                fontSize: "12px",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
              onClick={() => toggleCorpEnabled(true)}
            >
              Enable Corp
            </button>
          </div>
        ) : (
          <div style={{ marginTop: "12px", color: "#ffaa00" }}>
            {running ? "Waiting for first update..." : "Corp daemon not running."}
          </div>
        )}
      </div>
    );
  }

  if (!status.hasCorp) {
    return (
      <div style={styles.panel}>
        <div style={styles.row}>
          <div style={styles.rowLeft}>
            <span style={styles.statLabel}>Corporation</span>
            <span style={styles.dim}>|</span>
            <span style={styles.dim}>No Corporation</span>
          </div>
          <ToolControl tool={toolId} running={running} pid={pid} />
        </div>

        <StatusCard status={status} />

        {status.recommendations.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>RECOMMENDATIONS</div>
            {status.recommendations.map(rec => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        )}

        <div style={styles.section}>
          <button
            style={{
              backgroundColor: "#2a1a1a",
              color: "#ff4444",
              border: "1px solid #ff4444",
              borderRadius: "3px",
              padding: "3px 12px",
              fontSize: "11px",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
            onClick={() => toggleCorpEnabled(false)}
          >
            Disable Corp
          </button>
          <span style={{ fontSize: "10px", color: "#666", marginLeft: "8px" }}>
            Stops daemon and frees budget allocation
          </span>
        </div>

        <TierFooter tier={status.tier} tierName={status.tierName} />
      </div>
    );
  }

  const allProducts: (CorpProductStatus & { division: string })[] = [];
  for (const div of status.divisions) {
    for (const prod of div.products) {
      allProducts.push({ ...prod, division: div.name });
    }
  }

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.row}>
        <div style={styles.rowLeft}>
          <span style={styles.statLabel}>{status.corpName}</span>
          <span style={styles.dim}>|</span>
          <span style={{ color: "#00ccff" }}>{status.phaseLabel}</span>
          <span style={styles.dim}>|</span>
          <span style={{ color: status.profit >= 0 ? "#00ff00" : "#ff4444" }}>
            {status.profitFormatted}/s
          </span>
        </div>
        <ToolControl tool={toolId} running={running} pid={pid} />
      </div>

      {/* Roadmap */}
      <PhaseRoadmap currentPhase={status.phase} />

      {/* Status */}
      <StatusCard status={status} />

      {/* Financials */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>FINANCIALS</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
          <span style={{ fontSize: "12px" }}>
            <span style={styles.dim}>Funds: </span>
            <span style={styles.statValue}>{status.fundsFormatted}</span>
          </span>
          <span style={{ fontSize: "12px" }}>
            <span style={styles.dim}>Revenue: </span>
            <span style={{ color: "#00ff00" }}>{status.revenueFormatted}/s</span>
          </span>
          <span style={{ fontSize: "12px" }}>
            <span style={styles.dim}>Expenses: </span>
            <span style={{ color: "#ff8800" }}>{status.expensesFormatted}/s</span>
          </span>
          <span style={{ fontSize: "12px" }}>
            <span style={styles.dim}>Profit: </span>
            <span style={{ color: status.profit >= 0 ? "#00ff00" : "#ff4444" }}>
              {status.profitFormatted}/s
            </span>
          </span>
          {status.budgetBalance >= 0 && (
            <span style={{ fontSize: "12px" }}>
              <span style={styles.dim}>Budget: </span>
              <span style={{ color: "#00ff00" }}>{status.budgetBalanceFormatted}</span>
            </span>
          )}
        </div>
      </div>

      {/* Divisions */}
      {status.divisions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>DIVISIONS</div>
          {status.divisions.map((div: CorpDivisionStatus) => (
            <div key={div.name} style={{
              border: "1px solid #333",
              borderRadius: "4px",
              padding: "8px",
              marginBottom: "6px",
              background: "#141414",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: "#00ccff", fontWeight: "bold", fontSize: "12px" }}>{div.name}</span>
                <span style={styles.dim}>{div.type}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "4px" }}>
                <span style={{ fontSize: "11px" }}>
                  <span style={styles.dim}>Rev: </span>
                  <span style={{ color: "#00ff00" }}>{div.revenueFormatted}</span>
                </span>
                <span style={{ fontSize: "11px" }}>
                  <span style={styles.dim}>Profit: </span>
                  <span style={{ color: div.profit >= 0 ? "#00ff00" : "#ff4444" }}>{div.profitFormatted}</span>
                </span>
                <span style={{ fontSize: "11px" }}>
                  <span style={styles.dim}>Cities: </span>
                  <span style={styles.statValue}>{div.cities.length}/6</span>
                </span>
                <span style={{ fontSize: "11px" }}>
                  <span style={styles.dim}>Research: </span>
                  <span style={styles.statValue}>{div.researchFormatted}</span>
                </span>
              </div>

              {/* Warehouse bars */}
              {div.warehouses.length > 0 && (
                <div style={{ marginTop: "4px" }}>
                  {div.warehouses.map(wh => (
                    <div key={wh.city} style={{ display: "flex", alignItems: "center", marginBottom: "2px", gap: "6px" }}>
                      <span style={{ width: "70px", fontSize: "10px", color: "#aaa" }}>{wh.city}</span>
                      <div style={{ flex: 1, height: "6px", background: "#222", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{
                          width: `${Math.min(100, wh.usedPercent)}%`,
                          height: "100%",
                          background: wh.usedPercent > 90 ? "#ff4444" : wh.usedPercent > 70 ? "#ffaa00" : "#00cc44",
                          borderRadius: "2px",
                        }} />
                      </div>
                      <span style={{ width: "35px", fontSize: "10px", color: "#888", textAlign: "right" }}>
                        {wh.usedPercent.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Products */}
      {allProducts.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>PRODUCTS</div>
          {allProducts.map(prod => (
            <div key={`${prod.division}-${prod.name}`} style={{
              border: "1px solid #333",
              borderRadius: "4px",
              padding: "8px",
              marginBottom: "6px",
              background: "#141414",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: prod.progress >= 100 ? "#00ff00" : "#ffaa00", fontSize: "12px" }}>{prod.name}</span>
                <span style={styles.dim}>{prod.division}</span>
              </div>
              {prod.progress < 100 ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                    <span style={{ fontSize: "11px", color: "#ffaa00" }}>Developing</span>
                    <span style={{ fontSize: "11px", color: "#ffaa00" }}>{prod.progress.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: "6px", background: "#222", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{
                      width: `${prod.progress}%`,
                      height: "100%",
                      background: "#ffaa00",
                      borderRadius: "2px",
                    }} />
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "11px" }}>
                  <span><span style={styles.dim}>Rating: </span><span style={{ color: "#00ff00" }}>{prod.rating.toFixed(1)}</span></span>
                  <span><span style={styles.dim}>Eff: </span><span style={styles.statValue}>{prod.effectiveRating.toFixed(1)}</span></span>
                  <span><span style={styles.dim}>Demand: </span><span style={styles.dim}>{prod.demand.toFixed(1)}</span></span>
                  <span><span style={styles.dim}>Prod: </span><span style={styles.statValue}>{prod.produced.toFixed(1)}</span></span>
                  <span><span style={styles.dim}>Sold: </span><span style={styles.statValue}>{prod.sold.toFixed(1)}</span></span>
                  {prod.stored > 0 && (
                    <span><span style={styles.dim}>Stored: </span><span style={{ color: "#ffaa00" }}>{prod.stored.toFixed(1)}</span></span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Unlocks */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>UNLOCKS</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {status.unlocks.map(u => (
            <span key={u.name} style={{ fontSize: "11px" }}>
              <span style={{ color: u.unlocked ? "#00ff00" : "#ff4444" }}>
                {u.unlocked ? "\u2713" : "\u2717"}
              </span>
              {" "}
              <span style={{ color: u.unlocked ? "#aaa" : "#666" }}>{u.name}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Upgrades */}
      {status.upgrades.some(u => u.level > 0 || u.cost < status.funds * 2) && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>UPGRADES</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {status.upgrades.filter(u => u.level > 0 || u.cost < status.funds * 2).map(u => (
              <span key={u.name} style={{ fontSize: "11px" }}>
                <span style={styles.dim}>{u.name}</span>
                {" "}
                <span style={styles.statValue}>Lv{u.level}</span>
                {" "}
                <span style={{ color: "#555" }}>({u.costFormatted})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Investment */}
      {(status.investmentRound > 0 || status.currentOffer > 0) && !status.isPublic && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>INVESTMENT</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "12px" }}>
            <span>
              <span style={styles.dim}>Round: </span>
              <span style={styles.statValue}>{status.investmentRound}</span>
            </span>
            {status.currentOffer > 0 && (
              <span>
                <span style={styles.dim}>Offer: </span>
                <span style={{ color: "#00ff00" }}>{status.currentOfferFormatted}</span>
              </span>
            )}
            {status.investmentShares > 0 && (
              <span>
                <span style={styles.dim}>Shares: </span>
                <span style={styles.statValue}>{status.investmentShares.toLocaleString()}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Public state */}
      {status.isPublic && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>PUBLIC</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "12px" }}>
            <span>
              <span style={styles.dim}>Share Price: </span>
              <span style={styles.statValue}>{status.sharePriceFormatted}</span>
            </span>
            <span>
              <span style={styles.dim}>Issued: </span>
              <span style={styles.statValue}>{status.issuedShares.toLocaleString()}</span>
            </span>
            <span>
              <span style={styles.dim}>Dividends: </span>
              <span style={styles.statValue}>{(status.dividendRate * 100).toFixed(1)}%</span>
            </span>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {status.recommendations.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>RECOMMENDATIONS</div>
          {status.recommendations.map(rec => (
            <RecommendationCard key={rec.id} rec={rec} />
          ))}
        </div>
      )}

      {/* Settings */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>SETTINGS</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
          <span style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={styles.dim}>Auto-Products:</span>
            <ToggleButton on={status.autoProducts} onToggle={toggleCorpAutoProducts} />
          </span>
          <span style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={styles.dim}>Auto-Tea:</span>
            <ToggleButton on={status.autoTea} onToggle={toggleCorpAutoTea} />
          </span>
        </div>
        {status.isPublic && (
          <div style={{ display: "flex", gap: "4px", marginTop: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#888", marginRight: "4px" }}>Dividends:</span>
            {[0, 0.05, 0.1, 0.25, 0.5].map(rate => (
              <button
                key={rate}
                style={{
                  backgroundColor: Math.abs(status.dividendRate - rate) < 0.001 ? "#222" : "#1a1a1a",
                  color: Math.abs(status.dividendRate - rate) < 0.001 ? "#00ccff" : "#888",
                  border: `1px solid ${Math.abs(status.dividendRate - rate) < 0.001 ? "#00ccff" : "#333"}`,
                  borderRadius: "3px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
                onClick={() => setCorpDividendRate(rate)}
              >
                {(rate * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: "8px" }}>
          <button
            style={{
              backgroundColor: "#2a1a1a",
              color: "#ff4444",
              border: "1px solid #ff4444",
              borderRadius: "3px",
              padding: "3px 12px",
              fontSize: "11px",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
            onClick={() => toggleCorpEnabled(false)}
          >
            Disable Corp
          </button>
          <span style={{ fontSize: "10px", color: "#666", marginLeft: "8px" }}>
            Stops daemon and frees budget allocation
          </span>
        </div>
      </div>

      {/* TierFooter */}
      <TierFooter tier={status.tier} tierName={status.tierName} />
    </div>
  );
}

// === PLUGIN EXPORT ===

function noopStatus(): null {
  return null;
}

export const corpPlugin: ToolPlugin<FormattedCorpStatus> = {
  name: "CORP",
  id: "corp",
  script: "daemons/corp.js",
  getFormattedStatus: noopStatus,
  OverviewCard: CorpOverviewCard,
  DetailPanel: CorpDetailPanel,
};
