/**
 * FocusToggle Component
 *
 * Dropdown that controls which daemon (Work, Rep, Blade) holds the
 * player's focus. A second "Sleeve" dropdown appears when a sleeve
 * holder is set, allowing two daemons to run simultaneously.
 */
import React from "lib/react";
import { styles } from "views/dashboard/styles";
import { claimFocus, claimSleeveFocus, getStateSnapshot } from "views/dashboard/state-store";

const selectStyle: React.CSSProperties = {
  backgroundColor: "#1a1a1a",
  color: "#00ff00",
  border: "1px solid #333",
  padding: "3px 8px",
  fontSize: "12px",
  fontFamily: "inherit",
  borderRadius: "3px",
  cursor: "pointer",
};

const sleeveSelectStyle: React.CSSProperties = {
  ...selectStyle,
  color: "#44ccff",
};

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "4px 8px",
  marginBottom: "6px",
};

type FocusDaemon = "work" | "rep" | "blade" | "none";

export function FocusToggle(): React.ReactElement {
  // Read current focus holders from any available status.
  const snap = getStateSnapshot();
  const rawHolder =
    snap.workStatus?.focusHolder ??
    snap.repStatus?.focusHolder ??
    snap.bladeburnerStatus?.focusHolder ??
    "";
  const selectValue: FocusDaemon = rawHolder === "" ? "none" : rawHolder as FocusDaemon;

  const rawSleeveHolder =
    snap.workStatus?.sleeveHolder ??
    snap.repStatus?.sleeveHolder ??
    snap.bladeburnerStatus?.sleeveHolder ??
    "none";
  const sleeveValue: FocusDaemon = rawSleeveHolder === "" ? "none" : rawSleeveHolder as FocusDaemon;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as FocusDaemon;
    claimFocus(val);
  };

  const handleSleeveChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as FocusDaemon;
    claimSleeveFocus(val);
  };

  // Build sleeve options excluding whichever daemon holds primary focus
  const allDaemons: { value: FocusDaemon; label: string }[] = [
    { value: "work", label: "Work" },
    { value: "rep", label: "Rep" },
    { value: "blade", label: "Blade" },
  ];

  return (
    <div style={containerStyle}>
      <span style={{ ...styles.statLabel, fontSize: "11px" }}>Active:</span>
      <select value={selectValue} onChange={handleChange} style={selectStyle}>
        <option value="work">Work</option>
        <option value="rep">Rep</option>
        <option value="blade">Blade</option>
        <option value="none">None</option>
      </select>
      <span style={{ ...styles.statLabel, fontSize: "11px", color: "#44ccff" }}>Sleeve:</span>
      <select value={sleeveValue} onChange={handleSleeveChange} style={sleeveSelectStyle}>
        <option value="none">None</option>
        {allDaemons
          .filter(d => d.value !== selectValue)
          .map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
      </select>
    </div>
  );
}
