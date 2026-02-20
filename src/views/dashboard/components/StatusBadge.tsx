/**
 * StatusBadge Component
 *
 * Displays RUNNING/STOPPED/ERROR status badge.
 * When clickable and running, clicking opens the tail window.
 */
import React from "lib/react";
import { styles } from "views/dashboard/styles";

export interface StatusBadgeProps {
  running: boolean;
  error?: boolean;
  completed?: boolean;
  onClick?: () => void;
  clickable?: boolean;
}

export function StatusBadge({ running, error, completed, onClick, clickable }: StatusBadgeProps): React.ReactElement {
  const isClickable = clickable && running && onClick;

  const clickableStyle: React.CSSProperties = isClickable
    ? { cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }
    : {};

  if (error) {
    return (
      <span style={{ ...styles.badge, ...styles.badgeError }}>ERROR</span>
    );
  }

  if (completed && !running) {
    return (
      <span style={{ ...styles.badge, ...styles.badgeCompleted }}>COMPLETED</span>
    );
  }

  return (
    <span
      style={{
        ...styles.badge,
        ...(running ? styles.badgeRunning : styles.badgeStopped),
        ...clickableStyle,
      }}
      onClick={isClickable ? onClick : undefined}
      title={isClickable ? "Click to open tail" : undefined}
    >
      {running ? "RUNNING" : "STOPPED"}
    </span>
  );
}
