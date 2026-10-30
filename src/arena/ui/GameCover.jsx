import React from "react";
import { C } from "../arenaConstants.js";

/* ------------------------------------------------------------------ *
 *  GAME COVER ART
 *
 *  Each game gets its own illustrated cover, drawn as inline SVG. This
 *  is deliberate: the site is a static GitHub Pages build, so bundling
 *  five large cover photos would add hundreds of KB to a page the
 *  player sees before they have chosen anything. These scale to any
 *  card size, read correctly on a phone, and cost nothing to download.
 * ------------------------------------------------------------------ */

function Sky({ from, to }) {
  return (
    <>
      <defs>
        <linearGradient id={`sky-${from.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="200" height="120" fill={`url(#sky-${from.slice(1)})`} />
    </>
  );
}

function SafetyMissionArt() {
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" style={{ display: "block", width: "100%", height: "100%" }}>
      <Sky from="#1B3C57" to="#5E87A6" />
      {/* distant skyline */}
      <g opacity="0.35" fill="#0E2232">
        <rect x="6" y="52" width="22" height="46" />
        <rect x="32" y="60" width="16" height="38" />
        <rect x="160" y="56" width="20" height="42" />
        <rect x="182" y="64" width="14" height="34" />
      </g>
      {/* ground */}
      <rect x="0" y="95" width="200" height="25" fill="#8B7A5C" />
      <rect x="0" y="95" width="200" height="2" fill="#6F6049" />
      {/* building frame */}
      <g fill="#A8A69E">
        {[0, 1, 2, 3].map((f) => (
          <rect key={f} x="58" y={88 - f * 18} width="72" height="4" />
        ))}
        {[58, 82, 106, 126].map((x) => (
          <rect key={x} x={x} y="34" width="4" height="58" />
        ))}
      </g>
      {/* brick infill on lower floors */}
      <rect x="62" y="74" width="64" height="14" fill="#A8613F" opacity="0.85" />
      <rect x="62" y="56" width="40" height="14" fill="#A8613F" opacity="0.6" />
      {/* scaffold */}
      <g stroke="#C3C9CF" strokeWidth="1.4" opacity="0.95">
        {[40, 52].map((x) => <line key={x} x1={x} y1="38" x2={x} y2="95" />)}
        {[44, 56, 68, 80].map((y) => <line key={y} x1="40" y1={y} x2="52" y2={y} />)}
        <line x1="40" y1="95" x2="52" y2="80" />
      </g>
      {/* crane */}
      <g fill="#F2B417">
        <rect x="148" y="18" width="3.5" height="78" />
        <rect x="112" y="18" width="76" height="3" />
        <rect x="146" y="8" width="2" height="12" />
        <rect x="128" y="21" width="5" height="3" />
      </g>
      <line x1="130" y1="24" x2="130" y2="52" stroke="#3C4248" strokeWidth="1" />
      <rect x="126" y="52" width="9" height="6" fill="#CF3F2F" />
      {/* safety officer in the foreground */}
      <g transform="translate(26,62) scale(1.5)">
        <path d="M-4.5 -10 a4.5 4.5 0 0 1 9 0 Z" fill="#FFC629" />
        <rect x="-4.2" y="-10.4" width="8.4" height="1.6" fill="#FFC629" />
        <circle cx="0" cy="-6.5" r="3.4" fill="#D7A07A" />
        <rect x="-4.5" y="-3" width="9" height="11" rx="1.6" fill="#D6FF2E" />
        <rect x="-4.8" y="1" width="9.6" height="1.6" fill="#F3F1EA" />
        <rect x="-4.8" y="-1" width="9.6" height="1.6" fill="#F3F1EA" />
        <rect x="-3.4" y="8" width="2.6" height="10" fill="#3D4A5C" />
        <rect x="0.8" y="8" width="2.6" height="10" fill="#3D4A5C" />
        <rect x="4" y="-2" width="5" height="7" rx="1" fill="#F3F1EA" />
      </g>
      {/* hazard markers */}
      {[[96, 46], [70, 84], [160, 88]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="7" fill="none" stroke="#FF5A1F" strokeWidth="1.6" opacity="0.9" />
          <text x={cx} y={cy + 3.2} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#FF5A1F">!</text>
        </g>
      ))}
    </svg>
  );
}

function CraneMasterArt() {
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" style={{ display: "block", width: "100%", height: "100%" }}>
      <Sky from="#1F4A6B" to="#D9B877" />
      <circle cx="166" cy="30" r="13" fill="#FFE9A8" opacity="0.6" />
      <rect x="0" y="100" width="200" height="20" fill="#7E6F53" />
      {/* cab view framing */}
      <g fill="#F2B417">
        <rect x="18" y="26" width="6" height="76" />
        <rect x="8" y="22" width="180" height="5" />
        <rect x="0" y="22" width="22" height="5" />
        <rect x="20" y="10" width="3" height="14" />
      </g>
      {/* lattice on the jib */}
      <g stroke="#C78F10" strokeWidth="1">
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={i} x1={28 + i * 15} y1="27" x2={36 + i * 15} y2="36" />
        ))}
        <line x1="24" y1="36" x2="188" y2="36" />
      </g>
      {/* trolley + rope + hook with a load */}
      <rect x="116" y="26" width="13" height="7" fill="#5C646C" />
      <line x1="122" y1="33" x2="122" y2="66" stroke="#2A3038" strokeWidth="1.4" />
      <rect x="116" y="66" width="13" height="8" fill="#CF3F2F" />
      <g>
        <rect x="108" y="78" width="30" height="10" fill="#A8613F" />
        <rect x="108" y="86" width="30" height="4" fill="#8A6436" />
        <line x1="112" y1="74" x2="110" y2="78" stroke="#2A3038" strokeWidth="1" />
        <line x1="133" y1="74" x2="136" y2="78" stroke="#2A3038" strokeWidth="1" />
      </g>
      {/* landing zone target */}
      <ellipse cx="123" cy="104" rx="22" ry="6" fill="#33C481" opacity="0.3" />
      <ellipse cx="123" cy="104" rx="13" ry="3.6" fill="none" stroke="#33C481" strokeWidth="1.4" />
      {/* exclusion zone + worker */}
      <ellipse cx="54" cy="106" rx="20" ry="5.5" fill="#EA4F4F" opacity="0.26" />
      <g transform="translate(54,96) scale(1.1)">
        <path d="M-3.6 -8 a3.6 3.6 0 0 1 7.2 0 Z" fill="#FFC629" />
        <circle cx="0" cy="-5" r="2.7" fill="#D7A07A" />
        <rect x="-3.4" y="-2.2" width="6.8" height="8" fill="#D6FF2E" />
        <rect x="-2.4" y="5.8" width="1.8" height="6" fill="#2A3038" />
        <rect x="0.6" y="5.8" width="1.8" height="6" fill="#2A3038" />
      </g>
      {/* building to lift to */}
      <g fill="#9D9B94" opacity="0.9">
        <rect x="160" y="60" width="40" height="42" />
        {[66, 76, 86].map((y) => <rect key={y} x="160" y={y} width="40" height="2" fill="#7E7C77" />)}
      </g>
    </svg>
  );
}

function SafestTowerArt() {
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" style={{ display: "block", width: "100%", height: "100%" }}>
      <Sky from="#17353F" to="#7FA98F" />
      <rect x="0" y="98" width="200" height="22" fill="#7E7257" />
      {/* the frame being protected */}
      <g>
        {[0, 1, 2].map((f) => (
          <rect key={f} x="48" y={86 - f * 24} width="104" height="5" fill="#B4B2AB" />
        ))}
        {[48, 82, 116, 147].map((x) => (
          <rect key={x} x={x} y="38" width="5" height="53" fill="#A8A69E" />
        ))}
      </g>
      {/* guardrails being installed, green = compliant */}
      {[86, 62].map((y) => (
        <g key={y} stroke="#33C481" strokeWidth="1.8">
          <line x1="50" y1={y - 11} x2="150" y2={y - 11} />
          <line x1="50" y1={y - 5.5} x2="150" y2={y - 5.5} />
          {[52, 76, 100, 124, 148].map((x) => <line key={x} x1={x} y1={y} x2={x} y2={y - 12} />)}
        </g>
      ))}
      <rect x="50" y="84" width="100" height="2.6" fill="#B5854D" />
      {/* top floor still open, with a ghost placement outline */}
      <g stroke="#59B7FF" strokeWidth="1.6" strokeDasharray="4 3" opacity="0.95">
        <line x1="50" y1="27" x2="150" y2="27" />
        <line x1="50" y1="33" x2="150" y2="33" />
        {[52, 100, 148].map((x) => <line key={x} x1={x} y1="38" x2={x} y2="26" />)}
      </g>
      {/* safety net */}
      <path d="M152 70 L182 82 L182 88 L152 76 Z" fill="#2BBF6F" opacity="0.5" />
      <g stroke="#2BBF6F" strokeWidth="0.6" opacity="0.85">
        {[0, 1, 2, 3].map((i) => <line key={i} x1={154 + i * 8} y1={71 + i * 3} x2={154 + i * 8} y2={77 + i * 3} />)}
      </g>
      {/* component palette along the bottom */}
      <g>
        {[["#33C481", 12], ["#FFC629", 34], ["#FF5A1F", 56], ["#59B7FF", 78]].map(([color, x]) => (
          <g key={x}>
            <rect x={x} y="102" width="18" height="14" rx="3" fill="#242A31" stroke={color} strokeWidth="1.2" />
            <rect x={x + 4} y="107" width="10" height="4" rx="1" fill={color} />
          </g>
        ))}
      </g>
      {/* fire extinguisher + sign */}
      <g transform="translate(176,92)">
        <rect x="-2.5" y="-9" width="5" height="9" rx="1.4" fill="#EA4F4F" />
        <rect x="-1" y="-11" width="2" height="2" fill="#2A3038" />
      </g>
      <g transform="translate(30,88)">
        <rect x="-6" y="-9" width="12" height="9" rx="1" fill="#FFC629" />
        <text x="0" y="-2" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#161616">!</text>
        <rect x="-0.6" y="0" width="1.2" height="9" fill="#C3C9CF" />
      </g>
    </svg>
  );
}

function EscapeArt() {
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" style={{ display: "block", width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id="escGlow" cx="0.78" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#33C481" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#33C481" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="200" height="120" fill="#14181C" />
      {/* corridor perspective */}
      <polygon points="0,0 200,0 148,34 52,34" fill="#22282E" />
      <polygon points="0,120 200,120 148,86 52,86" fill="#2A3137" />
      <polygon points="0,0 52,34 52,86 0,120" fill="#1B2126" />
      <polygon points="200,0 148,34 148,86 200,120" fill="#1B2126" />
      <rect x="52" y="34" width="96" height="52" fill="#121619" />
      {/* exit door with glow */}
      <rect x="40" y="0" width="120" height="120" fill="url(#escGlow)" opacity="0.5" />
      <rect x="86" y="44" width="28" height="42" fill="#1D2A22" stroke="#33C481" strokeWidth="1.4" />
      <g fill="#33C481">
        <rect x="90" y="36" width="20" height="7" rx="1.4" />
      </g>
      <text x="100" y="41.6" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#0C1A12">EXIT</text>
      {/* running man pictogram */}
      <g transform="translate(100,66) scale(0.9)" fill="#33C481">
        <circle cx="0" cy="-9" r="2.6" />
        <path d="M-1 -6 L2 -1 L5 2 L3 4 L0 1 L-2 6 L-5 9 L-7 7 L-4 4 L-3 -2 Z" />
      </g>
      {/* electrical panel on the left wall */}
      <g>
        <rect x="16" y="44" width="20" height="30" fill="#39424A" stroke="#5C646C" strokeWidth="1" />
        <rect x="20" y="48" width="12" height="9" fill="#FFC629" />
        <text x="26" y="55" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#161616">⚡</text>
        <rect x="31" y="62" width="4" height="7" fill="#EA4F4F" />
      </g>
      {/* extinguishers on the right wall */}
      {[[170, 56], [180, 58]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          <rect x="-3" y="0" width="6" height="13" rx="1.6" fill="#EA4F4F" />
          <rect x="-1.2" y="-2.4" width="2.4" height="2.4" fill="#2A3038" />
          <rect x="-2" y="4" width="4" height="4" fill="#F3F1EA" />
        </g>
      ))}
      {/* countdown */}
      <g>
        <rect x="140" y="8" width="48" height="19" rx="4" fill="#0D1114" stroke="#EA4F4F" strokeWidth="1.2" />
        <text x="164" y="22" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#EA4F4F" fontFamily="monospace">02:14</text>
      </g>
      {/* hazard tape across a wrong door */}
      <g>
        <rect x="52" y="52" width="16" height="34" fill="#1A1F24" stroke="#3A444C" strokeWidth="1" />
        <rect x="48" y="60" width="24" height="5" fill="#FFC629" transform="rotate(-18 60 62)" />
      </g>
    </svg>
  );
}

function EmergencyArt() {
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" style={{ display: "block", width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="emSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2A1414" />
          <stop offset="60%" stopColor="#6E3320" />
          <stop offset="100%" stopColor="#C2562A" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="200" height="120" fill="url(#emSky)" />
      <rect x="0" y="98" width="200" height="22" fill="#4A3A2C" />
      {/* burning building */}
      <g>
        <rect x="112" y="34" width="62" height="64" fill="#2E3238" />
        {[42, 56, 70, 84].map((y) => (
          <g key={y}>
            {[118, 134, 150, 162].map((x) => (
              <rect key={x} x={x} y={y} width="10" height="8" fill={y < 60 ? "#FF8A2B" : "#1A1D21"} opacity={y < 60 ? 0.95 : 1} />
            ))}
          </g>
        ))}
      </g>
      {/* flames */}
      <g>
        <path d="M128 42 q4 -12 9 -4 q3 -9 7 2 q4 -6 4 6 q-10 6 -20 -4 Z" fill="#FFC629" opacity="0.95" />
        <path d="M152 40 q3 -9 7 -3 q3 -6 5 4 q-6 5 -12 -1 Z" fill="#FF5A1F" opacity="0.9" />
      </g>
      {/* smoke */}
      <g fill="#1A1A1A" opacity="0.4">
        <circle cx="134" cy="24" r="12" />
        <circle cx="150" cy="18" r="10" />
        <circle cx="120" cy="20" r="8" />
      </g>
      {/* muster point sign */}
      <g transform="translate(26,72)">
        <rect x="-13" y="-16" width="26" height="18" rx="2" fill="#13864A" />
        <circle cx="-5" cy="-8" r="2.6" fill="#F3F1EA" />
        <circle cx="1" cy="-8" r="2.6" fill="#F3F1EA" />
        <circle cx="7" cy="-8" r="2.6" fill="#F3F1EA" />
        <rect x="-1" y="-2" width="2" height="24" fill="#C3C9CF" />
      </g>
      {/* commander with radio */}
      <g transform="translate(64,76) scale(1.4)">
        <path d="M-4.4 -10 a4.4 4.4 0 0 1 8.8 0 Z" fill="#EA4F4F" />
        <circle cx="0" cy="-6.4" r="3.3" fill="#8D5F3F" />
        <rect x="-4.4" y="-3" width="8.8" height="10.6" rx="1.5" fill="#D6FF2E" />
        <rect x="-4.7" y="0.6" width="9.4" height="1.5" fill="#F3F1EA" />
        <rect x="-3.3" y="7.6" width="2.5" height="9" fill="#2A3038" />
        <rect x="0.8" y="7.6" width="2.5" height="9" fill="#2A3038" />
        <rect x="3.6" y="-5.6" width="2.4" height="4.4" rx="0.8" fill="#2A3038" />
      </g>
      {/* evacuating workers */}
      {[[96, 88], [106, 90]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x},${y}) scale(0.85)`}>
          <circle cx="0" cy="-7" r="2.4" fill="#D7A07A" />
          <path d="M-3.6 -9.4 a3.6 3.6 0 0 1 7.2 0 Z" fill="#FFC629" />
          <rect x="-3" y="-4.4" width="6" height="7.6" fill="#D6FF2E" />
          <path d="M-2.4 3.2 L-4.4 10" stroke="#2A3038" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M2 3.2 L4.4 10" stroke="#2A3038" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ))}
      {/* alarm beacon */}
      <g>
        <circle cx="178" cy="22" r="7" fill="#EA4F4F" opacity="0.35" />
        <circle cx="178" cy="22" r="3.4" fill="#EA4F4F" />
      </g>
    </svg>
  );
}

const ART = {
  "safety-mission": SafetyMissionArt,
  "crane-master": CraneMasterArt,
  "safest-tower": SafestTowerArt,
  "escape-challenge": EscapeArt,
  "emergency-commander": EmergencyArt,
};

export default function GameCover({ gameId, height = 148, dim = false }) {
  const Art = ART[gameId];
  return (
    <div
      style={{
        position: "relative",
        height,
        background: C.bg,
        overflow: "hidden",
        filter: dim ? "grayscale(1) brightness(0.55)" : "none",
      }}
    >
      {Art ? <Art /> : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to top, ${C.surface} 0%, ${C.surface}00 52%)`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
