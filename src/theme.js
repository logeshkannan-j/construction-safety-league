/* ------------------------------------------------------------------ *
 *  SHARED VISUAL LANGUAGE
 *
 *  These were defined inside App.jsx. They have been lifted out
 *  unchanged so the integrated session screens can use exactly the same
 *  palette and controls as the quiz, instead of a near-copy that would
 *  drift. App.jsx imports them from here, so nothing about the existing
 *  look changes.
 * ------------------------------------------------------------------ */

export const COLORS = {
  bg: "#14171A",
  surface: "#1C2126",
  surfaceRaised: "#242A31",
  line: "#333B43",
  yellow: "#FFC629",
  orange: "#FF5A1F",
  green: "#33C481",
  red: "#EA4F4F",
  ink: "#F3F1EA",
  muted: "#909AA3",
  purple: "#9B7CF2",
};

export const inputStyle = {
  width: "100%", padding: "12px 14px", marginBottom: 10, borderRadius: 8,
  border: `1px solid ${COLORS.line}`, background: COLORS.surfaceRaised, color: COLORS.ink,
  fontSize: 15, outline: "none", boxSizing: "border-box",
};

export function btnStyle(bg, fg = "#14171A") {
  return {
    width: "100%", padding: "13px 14px", borderRadius: 8, border: "none",
    background: bg, color: fg, fontWeight: 800, fontSize: 15, cursor: "pointer", marginTop: 4,
  };
}

export const linkBtnStyle = {
  background: "none", border: "none", color: COLORS.muted, fontSize: 13,
  cursor: "pointer", marginTop: 12, textDecoration: "underline",
};
