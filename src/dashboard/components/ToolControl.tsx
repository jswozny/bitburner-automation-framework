/**
 * ToolControl Component
 *
 * Badge + play/stop button for controlling tools.
 * Uses NetscriptPort to send commands to main loop - port.write() has no
 * context validation, so it's safe to call from React event handlers.
 */
import React from "lib/react";
import { styles } from "dashboard/styles";
import { StatusBadge } from "dashboard/components/StatusBadge";
import { ToolName } from "dashboard/types";
import { writeCommand } from "dashboard/state-store";

export interface ToolControlProps {
  tool: ToolName;
  running: boolean;
  error?: boolean;
}

export function ToolControl({ tool, running, error }: ToolControlProps): React.ReactElement {
  const handleClick = () => {
    // Write command to port - no NS context needed, port.write() is just JS
    writeCommand(tool, running ? "stop" : "start");
  };

  const buttonStyle = running ? styles.buttonStop : styles.buttonPlay;

  return (
    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <StatusBadge running={running} error={error} />
      <button style={buttonStyle} onClick={handleClick}>
        {running ? "■" : "▶"}
      </button>
    </span>
  );
}
