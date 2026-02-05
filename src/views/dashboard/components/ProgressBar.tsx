/**
 * ProgressBar Component
 *
 * Visual progress bar with percentage display.
 */
import React from "lib/react";
import { styles } from "views/dashboard/styles";

export interface ProgressBarProps {
  /** Progress value between 0 and 1 */
  progress: number;
  /** Optional label to show inside the bar */
  label?: string;
  /** Color override for the fill */
  fillColor?: string;
}

export function ProgressBar({ progress, label, fillColor }: ProgressBarProps): React.ReactElement {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const percentage = (clampedProgress * 100).toFixed(1);

  const fillStyle: React.CSSProperties = {
    ...styles.progressFill,
    width: `${clampedProgress * 100}%`,
    ...(fillColor ? { backgroundColor: fillColor } : {}),
  };

  return (
    <div style={styles.repProgressWrapper}>
      <div style={styles.progressContainer}>
        <div style={fillStyle} />
      </div>
      <div style={{ textAlign: "center", fontSize: "11px", color: "#fff", marginTop: "2px" }}>
        {label ?? `${percentage}%`}
      </div>
    </div>
  );
}
