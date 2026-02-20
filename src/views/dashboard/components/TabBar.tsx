/**
 * GroupedTabBar Component
 *
 * Two-tier tab navigation: group tabs on top, sub-tabs below.
 */
import React from "lib/react";
import { styles } from "views/dashboard/styles";

export interface TabGroup {
  label: string;
  subLabels: string[];
}

export type ToolStatus = "running" | "stopped" | "completed";

export interface GroupedTabBarProps {
  groups: TabGroup[];
  activeGroup: number; // -1 = Overview
  activeSub: number;
  onOverviewClick: () => void;
  onGroupClick: (groupIndex: number) => void;
  onSubClick: (subIndex: number) => void;
  statuses?: ToolStatus[][];
}

export function GroupedTabBar({
  groups,
  activeGroup,
  activeSub,
  onOverviewClick,
  onGroupClick,
  onSubClick,
  statuses,
}: GroupedTabBarProps): React.ReactElement {
  return (
    <div>
      <div style={styles.tabBar}>
        <div
          style={activeGroup === -1 ? styles.tabActive : styles.tab}
          onClick={onOverviewClick}
        >
          Overview
        </div>
        {groups.map((g, i) => (
          <div
            key={i}
            style={{
              ...(i === activeGroup ? styles.tabActive : styles.tab),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "3px",
            }}
            onClick={() => onGroupClick(i)}
          >
            <span>{g.label}</span>
            {statuses && statuses[i] && (
              <span style={{ display: "flex", gap: "3px" }}>
                {statuses[i].map((status, j) => {
                  const color = status === "running" ? "#00ff00"
                    : status === "completed" ? "#4488ff"
                    : "#ff4444";
                  return (
                    <span
                      key={j}
                      style={{
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        backgroundColor: color,
                        display: "inline-block",
                      }}
                    />
                  );
                })}
              </span>
            )}
          </div>
        ))}
      </div>
      {activeGroup >= 0 && (
        <div style={styles.subTabBar}>
          {groups[activeGroup].subLabels.map((label, i) => (
            <div
              key={i}
              style={i === activeSub ? styles.subTabActive : styles.subTab}
              onClick={() => onSubClick(i)}
            >
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
