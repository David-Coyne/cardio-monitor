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

// Scale/glow OUTPUT values — never change with heart rate
// Ventricular outputs (8 keypoints: diastole → QRS-start → R-peak → maxCon → midRlx → nearBase → base → end)
const lvOut = [1.00, 1.000, 0.820, 0.760, 0.820, 0.940, 1.020, 1.00];
const rvOut = [1.00, 1.000, 0.850, 0.810, 0.850, 0.950, 1.010, 1.00];
const gSzOut= [3,    8,     22,    22,    14,    6,     3,     3   ];
const gAlOut= [0.22, 0.55,  1.00,  0.95,  0.55,  0.24,  0.22,  0.22];
// VT outputs (wide QRS — starts earlier at p2)
const vtLvOut=[1.00, 0.860, 0.780, 0.760, 0.820, 0.930, 1.010, 1.00];
const vtRvOut=[1.00, 0.890, 0.820, 0.800, 0.840, 0.940, 1.010, 1.00];
const vtGSOut=[3,    12,    22,    22,    14,    6,     3,     3   ];
const vtGAOut=[0.2,  0.65,  1.0,   0.95,  0.55,  0.24,  0.2,   0.2 ];

// Atrial outputs (contract with P wave)
const laOut = [1.00, 1.00, 0.840, 0.870, 1.000, 1.030, 1.00];
const raOut = [1.00, 1.00, 0.850, 0.875, 1.000, 1.025, 1.00];

// Build phase-position arrays for a given heart rate.
// Systole duration is fixed at ~380 ms so contraction speed stays realistic
// at any HR; only the diastolic pause changes.
function buildKeyframes(hr: number) {
  const bd       = 60000 / hr;                       // ms per beat
  const vSys     = Math.min(380 / bd, 0.72);         // ventricular systole fraction
  const aSys     = Math.min(110 / bd, 0.13);         // atrial systole fraction
  const q = 0.255, r = 0.285;

  // Ventricular: [diastole, QRSstart, Rpeak, maxCon, midRlx, nearBase, base, end]
  const vP = [
    0,
    q,
    r,
    r + vSys * 0.25,
    r + vSys * 0.55,
    r + vSys * 0.85,
    Math.min(r + vSys, 0.98),
    1.0,
  ];

  // VT starts contracting earlier (wide QRS begins at 0.22)
  const vtQ = 0.220;
  const vtSys = Math.min(400 / bd, 0.75);
  const vtP = [
    0,
    vtQ,
    r,
    r + vtSys * 0.25,
    r + vtSys * 0.55,
    r + vtSys * 0.85,
    Math.min(r + vtSys, 0.98),
    1.0,
  ];

  // Atrial: [0, P-start, P-peak, maxCon, relaxed, passive-fill, end]
  const pa = 0.120;
  const laP = [0, pa, pa + aSys * 0.4, pa + aSys * 0.7, pa + aSys, 0.72, 1.0];
  const raP = [0, pa - 0.010, (pa-0.01) + aSys*0.4, (pa-0.01)+aSys*0.7, (pa-0.01)+aSys, 0.70, 1.0];

  return { vP, vtP, laP, raP };
}

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
    // Build keyframe PHASE arrays once per heart-rate change.
    // Output value arrays (lvOut, gSzOut, …) are constant — only the timing changes.
    const { vP, vtP, laP, raP } = buildKeyframes(heartRate);

    // Ejection-fraction helper (1 inside systole peak, 0 elsewhere) — same length as vP
    const ejVOut = [0, 0, 0.5, 1, 0.5, 0, 0, 0];
    const ejVtOut= [0, 0, 0.5, 1, 0.5, 0, 0, 0];

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
        lvFill.set("#6B1111");
        glowSize.set(5 + 2 * Math.sin(2 * Math.PI * p1));
        glowAlpha.set(0.20);

      } else {
        // Sync to the identical 15-second rolling buffer the ECG canvas reads.
        const bs     = 3600 / heartRate;
        const sample = ((now % 15000) / 15000) * 900;
        const phase  = (sample % bs) / bs;

        // ── Atria ───────────────────────────────────────────────────────────
        if (rhythmType === "AF") {
          const ap = (now % 180) / 180;
          laScale.set(1 + 0.046 * Math.sin(2 * Math.PI * ap));
          raScale.set(1 + 0.040 * Math.sin(2 * Math.PI * ap + 0.5));
        } else if (rhythmType === "VT" || rhythmType === "SVT") {
          laScale.set(1.0);
          raScale.set(1.0);
        } else {
          laScale.set(lerp(laP, laOut, phase));
          raScale.set(lerp(raP, raOut, phase));
        }

        // ── Ventricles (fixed-duration systole via HR-scaled phase arrays) ──
        if (rhythmType === "VT") {
          lvScale.set(lerp(vtP, vtLvOut, phase));
          rvScale.set(lerp(vtP, vtRvOut, phase));
          glowSize.set(lerp(vtP, vtGSOut, phase));
          glowAlpha.set(lerp(vtP, vtGAOut, phase));
          lvFill.set(lerp(vtP, ejVtOut, phase) > 0.5 ? "#ff4a3a" : "#c0392b");
        } else {
          lvScale.set(lerp(vP, lvOut, phase));
          rvScale.set(lerp(vP, rvOut, phase));
          glowSize.set(lerp(vP, gSzOut, phase));
          glowAlpha.set(lerp(vP, gAlOut, phase));
          lvFill.set(lerp(vP, ejVOut, phase) > 0.5 ? "#ff5535" : "#e74c3c");
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
