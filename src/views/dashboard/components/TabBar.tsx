/**
 * TabBar Component
 *
 * Tab navigation for the dashboard.
 */
import React from "lib/react";
import { styles } from "views/dashboard/styles";

export interface TabBarProps {
  activeTab: number;
  tabs: string[];
  onTabClick: (index: number) => void;
}

export function TabBar({ activeTab, tabs, onTabClick }: TabBarProps): React.ReactElement {
  return (
    <div style={styles.tabBar}>
      {tabs.map((tab, i) => (
        <div
          key={i}
          style={i === activeTab ? styles.tabActive : styles.tab}
          onClick={() => onTabClick(i)}
        >
          {tab}
        </div>
      ))}
    </div>
  );
}
