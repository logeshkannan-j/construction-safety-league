import React, { useEffect, useRef, useState } from "react";
import { Target, CheckCircle2, XCircle } from "lucide-react";
import { COLORS, btnStyle } from "./theme.js";

/* ------------------------------------------------------------------ *
 *  PICTURE ROUNDS — "Spot the Hazard"
 *
 *  The host adds these from the admin panel: a site picture with
 *  numbered hazards, which participants match to their names. Shared by
 *  the admin's builder (HazardImage) and the participant's session
 *  (HazardQuestion, HazardReveal); the marking is scoreHazard in
 *  session.js.
 * ------------------------------------------------------------------ */

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The scene (inline SVG or an uploaded photo), with optional markers;
 *  reports a tap as 0-100 percentages across and down. */
export function HazardImage({ question, markers = [], onTap, aspectRatio = "4 / 3", maxWidth = 480 }) {
  const ref = useRef(null);
  function handleClick(e) {
    if (!onTap || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onTap(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  }
  return (
    <div
      ref={ref}
      onClick={handleClick}
      style={{
        position: "relative", width: "100%", maxWidth, aspectRatio, margin: "0 auto",
        borderRadius: 10, overflow: "hidden", background: "#0000", cursor: onTap ? "crosshair" : "default",
        border: `1px solid ${COLORS.line}`,
      }}
    >
      {question.imageType === "raster" && question.imageData && (
        <img src={question.imageData} alt="Site scene" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
      )}
      {question.imageType !== "raster" && question.imageSvg && (
        <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: question.imageSvg }} />
      )}
      {markers.map((m) => (
        <div key={m.key || m.id} style={{
          position: "absolute", left: `${m.xPct}%`, top: `${m.yPct}%`, transform: "translate(-50%, -50%)",
          width: m.size || 26, height: m.size || 26, borderRadius: "50%",
          background: m.color, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.4)", pointerEvents: "none", fontSize: 12, fontWeight: 800, color: "#14171A",
        }}>
          {m.label}
        </div>
      ))}
    </div>
  );
}

const numbered = (question) => question.hazards.map((hazard, index) => ({
  key: hazard.id, xPct: hazard.xPct, yPct: hazard.yPct, color: COLORS.yellow, size: 28, label: String(index + 1),
}));

/**
 * One picture round: tap a numbered box, then the name that goes in it
 * (or drag the name onto the box), then confirm. When the time runs out,
 * whatever has been matched so far is handed in.
 */
export function HazardQuestion({ question, remainingSeconds, totalSeconds, onSubmit }) {
  const [matches, setMatches] = useState({});
  const [dragged, setDragged] = useState(null);
  const [selected, setSelected] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [names] = useState(() => shuffled(question.hazards));
  const handedIn = useRef(false);
  const out = remainingSeconds <= 0;

  const handIn = (m) => {
    if (handedIn.current) return;
    handedIn.current = true;
    onSubmit(m);
  };

  // Out of time: what is matched so far still counts.
  useEffect(() => {
    if (out) handIn(matches);
  }, [out]); // eslint-disable-line react-hooks/exhaustive-deps

  function place(slot, hazardId) {
    if (out || handedIn.current) return;
    const next = { ...matches };
    Object.keys(next).forEach((k) => { if (next[k] === hazardId) delete next[k]; });
    next[slot] = hazardId;
    setMatches(next);
    setConfirming(false);
    const empty = question.hazards.findIndex((_, i) => !next[i]);
    setSelected(empty === -1 ? null : empty);
  }

  const complete = Object.keys(matches).length === question.hazards.length;
  return (
    <div className="csl-hazard-question" style={{ width: "100%", paddingBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: COLORS.orange }}>
          <Target size={14} /> FIND THE HAZARDS!
        </span>
        <span style={{ fontWeight: 900, fontSize: 15, color: remainingSeconds <= 10 ? COLORS.red : COLORS.yellow }}>
          {Math.max(0, remainingSeconds)}s
        </span>
      </div>
      <div style={{ height: 4, background: COLORS.surface, borderRadius: 2, marginBottom: 12, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, (remainingSeconds / Math.max(1, totalSeconds)) * 100))}%`, height: "100%", background: COLORS.orange }} />
      </div>
      <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 10 }}>
        Tap a numbered box, then the hazard that goes in it. Confirm when every box is filled.
      </p>
      <HazardImage question={question} markers={numbered(question)} aspectRatio="4 / 3" maxWidth={560} />
      <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
        {question.hazards.map((hazard, index) => (
          <div
            key={hazard.id}
            role="button"
            onClick={() => { if (!out) setSelected(index); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragged) place(index, dragged); setDragged(null); }}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, minHeight: 42,
              border: `1px dashed ${selected === index ? COLORS.yellow : COLORS.line}`,
              background: selected === index ? `${COLORS.yellow}22` : COLORS.surfaceRaised, color: COLORS.ink,
              cursor: out ? "default" : "pointer",
            }}
          >
            <b style={{ color: COLORS.yellow, minWidth: 22 }}>{index + 1}.</b>
            <span>{matches[index] ? question.hazards.find((h) => h.id === matches[index])?.name : "Tap, then pick a hazard"}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {names.map((hazard) => (
          <div
            key={hazard.id}
            role="button"
            draggable={!out}
            onDragStart={() => setDragged(hazard.id)}
            onClick={() => { if (selected !== null) place(selected, hazard.id); }}
            style={{
              padding: "11px 12px", borderRadius: 8, border: `1px solid ${COLORS.green}88`, background: `${COLORS.green}18`,
              color: COLORS.ink, cursor: out ? "default" : "pointer",
              opacity: Object.values(matches).includes(hazard.id) ? 0.5 : 1,
            }}
          >
            {hazard.name}
          </div>
        ))}
      </div>
      {confirming && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: `${COLORS.yellow}22`, color: COLORS.ink, fontSize: 13 }}>
          Hand these in? They cannot be changed afterwards.
        </div>
      )}
      <button
        disabled={out || !complete}
        style={btnStyle(confirming ? COLORS.green : COLORS.orange)}
        onClick={() => (confirming ? handIn(matches) : setConfirming(true))}
      >
        {confirming ? "CONFIRM MATCHES" : "CHECK MATCHES"}
      </button>
    </div>
  );
}

/** After a picture round: what was right, what each number really was. */
export function HazardReveal({ question, result, onNext, nextLabel = "NEXT" }) {
  const picked = result?.matches || {};
  return (
    <div style={{ width: "100%" }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: COLORS.muted }}>SPOT THE HAZARD</div>
        <div style={{ fontSize: 24, fontWeight: 900, margin: "4px 0", color: result?.correct ? COLORS.green : COLORS.yellow }}>
          {result?.correctCount ?? 0} of {result?.total ?? question.hazards.length} matched
        </div>
        <div style={{ fontSize: 15, color: COLORS.ink }}>+{result?.points ?? 0} points</div>
      </div>
      <HazardImage question={question} markers={numbered(question)} aspectRatio="4 / 3" maxWidth={560} />
      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        {question.hazards.map((hazard, index) => {
          const right = picked[index] === hazard.id;
          return (
            <div key={hazard.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: COLORS.surfaceRaised }}>
              {right ? <CheckCircle2 size={17} color={COLORS.green} style={{ flexShrink: 0, marginTop: 1 }} /> : <XCircle size={17} color={COLORS.red} style={{ flexShrink: 0, marginTop: 1 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{index + 1}. {hazard.name}</div>
                {hazard.description && <div style={{ fontSize: 12, color: COLORS.muted }}>{hazard.description}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {question.explanation && <p style={{ fontSize: 13, color: COLORS.muted, marginTop: 10 }}>{question.explanation}</p>}
      <button style={btnStyle(COLORS.yellow)} onClick={onNext}>{nextLabel}</button>
    </div>
  );
}
