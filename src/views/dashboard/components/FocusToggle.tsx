/**
 * FocusToggle Component
 *
 * Dropdown that controls which daemon (Work, Rep, Blade) holds the
 * player's focus. Shown in the Focus tab group header and in the
 * Overview grid above the Focus section cards.
 */
import React from "lib/react";
import { styles } from "views/dashboard/styles";
import { claimFocus, getStateSnapshot } from "views/dashboard/state-store";

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

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "4px 8px",
  marginBottom: "6px",
};

export function FocusToggle(): React.ReactElement {
  // Read current focus holder from any available status.
  // An unset holder (legacy default) and the explicit "none" sentinel both
  // surface in the dropdown as "None", but only "none" actually parks all
  // daemons — "" still lets whichever daemon starts first auto-claim.
  const snap = getStateSnapshot();
  const rawHolder =
    snap.workStatus?.focusHolder ??
    snap.repStatus?.focusHolder ??
    snap.bladeburnerStatus?.focusHolder ??
    "";
  const selectValue = rawHolder === "" ? "none" : rawHolder;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as "work" | "rep" | "blade" | "none";
    claimFocus(val);
  };

  return (
    <div style={containerStyle}>
      <span style={{ ...styles.statLabel, fontSize: "11px" }}>Active:</span>
      <select value={selectValue} onChange={handleChange} style={selectStyle}>
        <option value="work">Work</option>
        <option value="rep">Rep</option>
        <option value="blade">Blade</option>
        <option value="none">None</option>
      </select>
    </div>
  );
}
