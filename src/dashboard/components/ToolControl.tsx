/**
 * ToolControl Component
 *
 * Badge + play/stop button for controlling tools.
 */
import React from "lib/react";
import { styles } from "dashboard/styles";
import { StatusBadge } from "dashboard/components/StatusBadge";
import { ToolName } from "dashboard/types";
import { queueCommand } from "dashboard/state";

export interface ToolControlProps {
  tool: ToolName;
  running: boolean;
  error?: boolean;
}

export function ToolControl({ tool, running, error }: ToolControlProps): React.ReactElement {
  const [, forceUpdate] = React.useState(0);

  const handleClick = () => {
    queueCommand(tool, running ? "stop" : "start");
    forceUpdate(n => n + 1);
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
