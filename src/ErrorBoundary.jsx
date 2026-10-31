import React from "react";

/* ------------------------------------------------------------------ *
 *  WHAT BROKE, ON SCREEN
 *
 *  React unmounts the entire tree when a render throws. With no
 *  boundary that produces a completely black page with nothing on it —
 *  which has happened three times on this project, and each time the
 *  only way to find the cause was to reproduce it off-device, because
 *  the screen itself said nothing.
 *
 *  This catches the throw and PRINTS it: the message, the component
 *  that threw, and a copy button. A blank page becomes a bug report
 *  somebody can read down a phone line.
 * ------------------------------------------------------------------ */

const C = {
  bg: "#14171A", surface: "#1C2126", line: "#333B43",
  ink: "#F3F1EA", muted: "#909AA3", red: "#EA4F4F", yellow: "#FFC629",
};

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Still log it, so the console has the full stack.
    console.error("[csl] render failed", error, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const where = (info?.componentStack || "").trim().split("\n").slice(0, 6).join("\n");
    const report = `${error.name}: ${error.message}\n\n${where}`;

    return (
      <div style={{
        minHeight: "100vh", background: C.bg, color: C.ink, padding: "32px 20px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, background: C.red,
            color: "#fff", padding: "5px 12px", borderRadius: 4,
            fontWeight: 800, fontSize: 11, letterSpacing: 1, marginBottom: 16,
          }}>
            SOMETHING BROKE
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 10px" }}>
            This screen failed to load
          </h1>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, margin: "0 0 18px" }}>
            Your score and your answers are safe — they are stored against your game code, not in
            this page. Reload to carry on. If it keeps happening, send whoever is running the event
            the text below.
          </p>

          <pre style={{
            background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10,
            padding: "14px 16px", fontSize: 12.5, lineHeight: 1.6, color: C.yellow,
            whiteSpace: "pre-wrap", wordBreak: "break-word", overflowX: "auto", margin: 0,
          }}>{report}</pre>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: C.yellow, color: "#1A1200", border: "none", borderRadius: 9,
                padding: "11px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer",
              }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => {
                try { navigator.clipboard?.writeText(report); } catch { /* no clipboard */ }
              }}
              style={{
                background: C.surface, color: C.ink, border: `1px solid ${C.line}`,
                borderRadius: 9, padding: "11px 18px", fontWeight: 700, fontSize: 14,
                cursor: "pointer",
              }}
            >
              Copy the error
            </button>
          </div>
        </div>
      </div>
    );
  }
}
