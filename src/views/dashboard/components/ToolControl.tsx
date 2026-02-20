/**
 * ToolControl Component
 *
 * Badge + play/stop button for controlling tools.
 * Uses NetscriptPort to send commands to main loop - port.write() has no
 * context validation, so it's safe to call from React event handlers.
 */
import React from "lib/react";
import { styles } from "views/dashboard/styles";
import { StatusBadge } from "views/dashboard/components/StatusBadge";
import { ToolName } from "views/dashboard/types";
import { writeCommand, openToolTail } from "views/dashboard/state-store";

export interface ToolControlProps {
  tool: ToolName;
  running: boolean;
  error?: boolean;
  pid?: number;
}

export function ToolControl({ tool, running, error, pid }: ToolControlProps): React.ReactElement {
  const handleClick = () => {
    // Write command to port - no NS context needed, port.write() is just JS
    writeCommand(tool, running ? "stop" : "start");
  };

  const handleBadgeClick = () => {
    if (running && pid && pid > 0) {
      openToolTail(tool);
    }
  };

  const buttonStyle = running ? styles.buttonStop : styles.buttonPlay;

  return (
    <span
      style={{ display: "flex", alignItems: "center", gap: "4px" }}
      onClick={(e) => e.stopPropagation()}
    >
      <StatusBadge
        running={running}
        error={error}
        onClick={handleBadgeClick}
        clickable={running && !!pid && pid > 0}
      />
      <button style={buttonStyle} onClick={handleClick}>
        {running ? "■" : "▶"}
      </button>
    </span>
  );
}
