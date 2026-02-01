/**
 * StatusBadge Component
 *
 * Displays RUNNING/STOPPED/ERROR status badge.
 */
import React from "lib/react";
import { styles } from "dashboard/styles";

export interface StatusBadgeProps {
  running: boolean;
  error?: boolean;
}

export function StatusBadge({ running, error }: StatusBadgeProps): React.ReactElement {
  if (error) {
    return (
      <span style={{ ...styles.badge, ...styles.badgeError }}>ERROR</span>
    );
  }
  return (
    <span
      style={{
        ...styles.badge,
        ...(running ? styles.badgeRunning : styles.badgeStopped),
      }}
    >
      {running ? "RUNNING" : "STOPPED"}
    </span>
  );
}
