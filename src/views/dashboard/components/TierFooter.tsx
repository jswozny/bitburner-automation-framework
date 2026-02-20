/**
 * TierFooter Component
 *
 * Small muted footer showing daemon tier info. Used by tiered daemons
 * (Rep, Faction, Gang) to display tier status without cluttering the header.
 */
import React from "lib/react";

export interface TierFooterProps {
  tier: number;
  tierName: string;
  currentRamUsage?: number;
  nextTierRam?: number | null;
  canUpgrade?: boolean;
}

export function TierFooter({ tier, tierName, currentRamUsage, nextTierRam, canUpgrade }: TierFooterProps): React.ReactElement {
  const parts: string[] = [`Tier ${tier}: ${tierName}`];
  if (currentRamUsage !== undefined) parts.push(`${currentRamUsage}GB`);
  if (nextTierRam) parts.push(`Next: ${nextTierRam}GB`);

  return (
    <div style={{
      borderTop: "1px solid #222",
      marginTop: "8px",
      paddingTop: "4px",
      fontSize: "10px",
      color: "#555",
      display: "flex",
      justifyContent: "space-between",
    }}>
      <span>{parts.join(" | ")}</span>
      {canUpgrade && <span style={{ color: "#ffaa00" }}>upgrade available</span>}
    </div>
  );
}
