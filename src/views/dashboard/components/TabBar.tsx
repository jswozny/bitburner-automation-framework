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

export interface GroupedTabBarProps {
  groups: TabGroup[];
  activeGroup: number; // -1 = Overview
  activeSub: number;
  onOverviewClick: () => void;
  onGroupClick: (groupIndex: number) => void;
  onSubClick: (subIndex: number) => void;
}

export function GroupedTabBar({
  groups,
  activeGroup,
  activeSub,
  onOverviewClick,
  onGroupClick,
  onSubClick,
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
            style={i === activeGroup ? styles.tabActive : styles.tab}
            onClick={() => onGroupClick(i)}
          >
            {g.label}
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
