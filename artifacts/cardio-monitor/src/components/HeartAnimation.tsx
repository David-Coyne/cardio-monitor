import { useEffect } from "react";
import { motion, useMotionValue, useMotionTemplate } from "framer-motion";
import type { RhythmType } from "@/lib/rhythmGenerators";

interface HeartAnimationProps {
  heartRate: number;
  rhythmType: RhythmType;
}

// Piecewise linear interpolation between keyframes
function lerp(inp: number[], out: number[], v: number): number {
  const clamped = Math.max(inp[0], Math.min(inp[inp.length - 1], v));
  for (let i = 0; i < inp.length - 1; i++) {
    if (clamped <= inp[i + 1]) {
      const t = (clamped - inp[i]) / (inp[i + 1] - inp[i]);
      return out[i] + t * (out[i + 1] - out[i]);
    }
  }
  return out[out.length - 1];
}

// ── Normal sinus keyframes (shared by SR, ST, SB, AF ventricular, SVT) ───────
const laP = [0.00, 0.13, 0.20, 0.26, 0.36, 0.72, 1.00];
const laS = [1.00, 1.00, 0.82, 0.88, 1.00, 1.04, 1.00];
const raP = [0.00, 0.11, 0.18, 0.24, 0.34, 0.70, 1.00];
const raS = [1.00, 1.00, 0.83, 0.89, 1.00, 1.03, 1.00];
const vP  = [0.00, 0.13, 0.285, 0.38, 0.42, 0.50, 0.60, 0.78, 1.00];
const lvS = [1.00, 1.00, 1.00,  0.82, 0.78, 0.83, 0.90, 1.02, 1.00];
const rvS = [1.00, 1.00, 1.00,  0.85, 0.82, 0.87, 0.93, 1.01, 1.00];
const gSz = [3,    3,    3,    10,   20,   22,   12,   4,    3   ]; // glow size
const gAl = [0.22, 0.22, 0.22, 0.65, 1.0,  1.0,  0.45, 0.22, 0.22];

// ── VT keyframes (wide QRS: earlier onset, no atrial, longer systole) ─────────
const vtP  = [0.00, 0.10, 0.22, 0.35, 0.45, 0.60, 0.80, 1.00];
const vtLV = [1.00, 1.00, 0.82, 0.76, 0.80, 0.92, 1.01, 1.00];
const vtRV = [1.00, 1.00, 0.85, 0.80, 0.84, 0.93, 1.01, 1.00];
const vtGS = [3,    3,    8,   16,   14,    6,    3,    3   ];
const vtGA = [0.2,  0.2,  0.5,  0.85, 0.7,  0.3,  0.2,  0.2 ];

export function HeartAnimation({ heartRate, rhythmType }: HeartAnimationProps) {
  // ── All motion values (hooks must be unconditional) ───────────────────────
  const laScale   = useMotionValue(1);
  const raScale   = useMotionValue(1);
  const lvScale   = useMotionValue(1);
  const rvScale   = useMotionValue(1);
  const lvFill    = useMotionValue("#e74c3c");
  const glowSize  = useMotionValue(4);
  const glowAlpha = useMotionValue(0.25);

  const glowFilter = useMotionTemplate`drop-shadow(0 0 ${glowSize}px rgba(231,76,60,${glowAlpha}))`;

  // ── Single rAF loop — drives everything based on rhythm ──────────────────
  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const now = performance.now();

      if (rhythmType === "VF") {
        // Ventricular fibrillation: chaotic high-freq trembling, no pump
        const p1 = (now % 170) / 170;
        const p2 = (now % 130) / 130;
        const t  = 1 + 0.022 * Math.sin(2 * Math.PI * p1)
                     + 0.018 * Math.sin(2 * Math.PI * p2 + 0.7);
        laScale.set(t);
        raScale.set(1 / t);
        lvScale.set(0.95 + 0.018 * Math.sin(2 * Math.PI * p1 * 3));
        rvScale.set(0.95 + 0.016 * Math.sin(2 * Math.PI * p2 * 2.3 + 1.2));
        lvFill.set("#6B1111");            // dark desaturated — no oxygenation
        glowSize.set(5 + 2 * Math.sin(2 * Math.PI * p1));
        glowAlpha.set(0.20);

      } else {
        // Sync to the identical 15-second rolling buffer the ECG canvas reads.
        // ECG canvas position: ((now % 15000) / 15000) * 900 samples
        // Beat length in that sample space: 3600 / heartRate samples
        // → phase is fractional position within the current beat, 0–1.
        const bs     = 3600 / heartRate;
        const sample = ((now % 15000) / 15000) * 900;
        const phase  = (sample % bs) / bs;

        // ── Atria ───────────────────────────────────────────────────────────
        if (rhythmType === "AF") {
          // Atrial fibrillation: rapid low-amplitude flutter (~5.5 Hz)
          const ap = (now % 180) / 180;
          laScale.set(1 + 0.046 * Math.sin(2 * Math.PI * ap));
          raScale.set(1 + 0.040 * Math.sin(2 * Math.PI * ap + 0.5));
        } else if (rhythmType === "VT" || rhythmType === "SVT") {
          // AV dissociation (VT) or no visible atrial kick (SVT): atria static
          laScale.set(1.0);
          raScale.set(1.0);
        } else {
          // Sinus family: normal atrial contraction with P wave
          laScale.set(lerp(laP, laS, phase));
          raScale.set(lerp(raP, raS, phase));
        }

        // ── Ventricles ───────────────────────────────────────────────────────
        if (rhythmType === "VT") {
          lvScale.set(lerp(vtP, vtLV, phase));
          rvScale.set(lerp(vtP, vtRV, phase));
          glowSize.set(lerp(vtP, vtGS, phase));
          glowAlpha.set(lerp(vtP, vtGA, phase));
          lvFill.set(lerp(vtP, [0, 0, 0.3, 1, 0.7, 0, 0, 0], phase) > 0.5
            ? "#ff4a3a" : "#c0392b");
        } else {
          lvScale.set(lerp(vP, lvS, phase));
          rvScale.set(lerp(vP, rvS, phase));
          glowSize.set(lerp(vP, gSz, phase));
          glowAlpha.set(lerp(vP, gAl, phase));
          // LV brightens during ejection
          const ejecting = lerp(vP, [0,0,0,0.5,1,0.5,0,0,0], phase);
          lvFill.set(ejecting > 0.5 ? "#ff5535" : "#e74c3c");
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [heartRate, rhythmType, laScale, raScale, lvScale, rvScale, lvFill, glowSize, glowAlpha]);

  const isVF     = rhythmType === "VF";
  const isLethal = rhythmType === "VF" || rhythmType === "VT";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center" data-testid="heart-animation">
      <motion.svg
        width="152"
        height="170"
        viewBox="0 0 200 220"
        className="overflow-visible"
        style={{ filter: glowFilter }}
      >
        <defs>
          <radialGradient id="lv-grad" cx="38%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ff7f7f" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#c0392b" />
          </radialGradient>
          <radialGradient id="rv-grad" cx="60%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#b94040" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#7b241c" />
          </radialGradient>
          <radialGradient id="la-grad" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#e05050" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#a93226" />
          </radialGradient>
          <radialGradient id="ra-grad" cx="55%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#8b3030" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#641e16" />
          </radialGradient>
        </defs>

        {/* ── Great Vessels ───────────────────────────────────────────────── */}
        <path d="M 127,12 C 125,12 121,14 120,20 L 118,52 C 122,54 128,54 132,52 L 130,20 C 129,14 129,12 127,12 Z"
          fill={isVF ? "#3a1010" : "#5a1812"} stroke="#3b0e0a" strokeWidth="1" />
        <path d="M 124,142 L 122,160 C 121,166 123,170 126,170 C 129,170 131,166 130,160 L 128,142 Z"
          fill={isVF ? "#3a1010" : "#5a1812"} stroke="#3b0e0a" strokeWidth="1" />
        <path
          d="M 80,48 C 78,28 90,14 108,12 C 128,10 140,26 138,46 C 136,56 134,66 136,80 C 130,78 126,66 128,54 C 130,38 118,24 106,26 C 94,28 88,38 90,54 Z"
          fill={isVF ? "#5a1010" : "#c0392b"} stroke="#922b21" strokeWidth="1.2" />
        <path
          d="M 100,78 C 98,60 88,48 72,44 C 60,42 50,48 46,56 C 42,64 46,74 54,76 C 58,64 66,58 76,58 C 86,58 94,66 96,80 Z"
          fill={isVF ? "#3a1010" : "#7b241c"} stroke="#4a1511" strokeWidth="1.2" />
        {/* Pulmonary veins */}
        <path d="M 44,72 C 36,68 30,72 30,80 C 30,86 36,90 44,88" fill="none"
          stroke={isVF ? "#4a1010" : "#a93226"} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <path d="M 44,88 C 36,86 30,90 32,98 C 34,104 40,106 48,102" fill="none"
          stroke={isVF ? "#4a1010" : "#a93226"} strokeWidth="2" strokeLinecap="round" opacity="0.7" />

        {/* ── RV ──────────────────────────────────────────────────────────── */}
        <motion.g style={{ transformOrigin: "130px 148px", scale: rvScale }}>
          <path
            d="M 96,96 C 108,88 140,90 152,110 C 162,128 158,160 148,178 C 138,194 118,204 104,210 C 102,194 100,165 98,148 C 96,130 94,112 96,96 Z"
            fill={isVF ? "#3a1010" : "url(#rv-grad)"} stroke="#5a1812" strokeWidth="1.5" />
        </motion.g>

        {/* ── LV ──────────────────────────────────────────────────────────── */}
        <motion.g style={{ transformOrigin: "70px 152px", scale: lvScale }}>
          <motion.path
            d="M 52,96 C 36,110 28,140 32,168 C 36,190 58,210 96,214 C 100,198 100,168 96,148 C 94,134 90,112 82,100 C 74,90 60,88 52,96 Z"
            style={{ fill: lvFill }}
            stroke="#922b21"
            strokeWidth="1.5"
          />
        </motion.g>

        {/* Interventricular septum */}
        <path d="M 96,96 C 97,130 97,170 96,214"
          stroke="#3b0e0a" strokeWidth="2.5" fill="none" opacity="0.7" />

        {/* ── LA ──────────────────────────────────────────────────────────── */}
        <motion.g style={{ transformOrigin: "68px 72px", scale: laScale }}>
          <path
            d="M 44,62 C 44,44 56,38 70,38 C 84,38 96,48 96,64 C 96,80 84,94 70,96 C 56,96 44,84 44,70 C 44,66 44,64 44,62 Z"
            fill={isVF ? "#4a1010" : "url(#la-grad)"} stroke="#7b241c" strokeWidth="1.5" />
        </motion.g>

        {/* ── RA ──────────────────────────────────────────────────────────── */}
        <motion.g style={{ transformOrigin: "126px 72px", scale: raScale }}>
          <path
            d="M 96,64 C 96,44 108,36 124,36 C 140,36 156,48 156,68 C 156,84 144,96 128,98 C 112,98 96,88 96,74 C 96,70 96,66 96,64 Z"
            fill={isVF ? "#3a1010" : "url(#ra-grad)"} stroke="#4a1511" strokeWidth="1.5" />
        </motion.g>

        {/* Interatrial septum */}
        <path d="M 96,64 C 96,76 96,86 96,96"
          stroke="#3b0e0a" strokeWidth="2" fill="none" opacity="0.7" />

        {/* ── VF overlay ──────────────────────────────────────────────────── */}
        {isVF && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
            fontSize="11" fontFamily="monospace" fill="rgba(255,50,50,0.55)"
            fontWeight="bold" letterSpacing="2">
            FIBRILLATING
          </text>
        )}

        {/* ── Labels ──────────────────────────────────────────────────────── */}
        <g fontFamily="monospace" fill={isLethal ? "rgba(255,100,100,0.7)" : "rgba(255,255,255,0.85)"} fontSize="7.5">
          <text x="24" y="68">LA</text>
          <line x1="38" y1="66" x2="46" y2="68" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <text x="160" y="68">RA</text>
          <line x1="157" y1="66" x2="150" y2="68" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <text x="16" y="155">LV</text>
          <line x1="30" y1="153" x2="46" y2="150" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <text x="160" y="155">RV</text>
          <line x1="158" y1="153" x2="144" y2="150" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <text x="104" y="10">Ao</text>
          <line x1="106" y1="12" x2="108" y2="22" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <text x="30" y="40">PA</text>
          <line x1="38" y1="41" x2="52" y2="52" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
        </g>
      </motion.svg>

      <div
        className="text-[9px] font-mono mt-0.5 tracking-widest"
        style={{ color: isLethal ? "#ff5555" : "rgba(156,163,175,1)" }}
        data-testid="heart-rate-label"
      >
        {isVF ? "VF · NO PULSE" : `${heartRate} BPM · ${rhythmType}`}
      </div>
    </div>
  );
}
