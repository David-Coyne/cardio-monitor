import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useMotionTemplate,
} from "framer-motion";

interface HeartAnimationProps {
  heartRate: number;
}

export function HeartAnimation({ heartRate }: HeartAnimationProps) {
  // Beat duration in ms — recalculates whenever HR changes
  const beatDuration = 60000 / heartRate;

  // Single shared phase MotionValue (0 → 1 over one beat)
  // Driven by performance.now() so it is locked to the SAME clock
  // as WaveformCanvas, giving frame-perfect QRS ↔ heart sync.
  const phase = useMotionValue(0);

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      phase.set((performance.now() % beatDuration) / beatDuration);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [beatDuration, phase]);

  // ── Cardiac cycle keyframes ──────────────────────────────────────
  // QRS peak is at beatPhase ≈ 0.285 (see Monitor.tsx gaussian centre).
  // Electromechanical delay + isovolumetric contraction ≈ 120 ms.
  // At 72 bpm: 120 ms / 833 ms ≈ 0.14 → ventricular peak at ~0.42.
  //
  // Atrial systole (P wave onset ≈ 0.13, peak ≈ 0.20):
  const laPhase  = [0.00, 0.13, 0.20, 0.26, 0.36, 0.72, 1.00];
  const laScale  = [1.00, 1.00, 0.82, 0.88, 1.00, 1.04, 1.00];
  const raPhase  = [0.00, 0.11, 0.18, 0.24, 0.34, 0.70, 1.00];
  const raScale  = [1.00, 1.00, 0.83, 0.89, 1.00, 1.03, 1.00];
  //
  // Ventricular systole (QRS ≈ 0.285, peak contraction ≈ 0.42):
  const vPhase   = [0.00, 0.13, 0.285, 0.38, 0.42, 0.50, 0.60, 0.78, 1.00];
  const lvScale  = [1.00, 1.00, 1.00,  0.82, 0.78, 0.83, 0.90, 1.02, 1.00];
  const rvScale  = [1.00, 1.00, 1.00,  0.85, 0.82, 0.87, 0.93, 1.01, 1.00];
  const lvFills  = [
    "#e74c3c","#e74c3c","#e74c3c",
    "#ff5535","#ff2a2a","#ff5535",
    "#e74c3c","#e74c3c","#e74c3c",
  ];

  // Glow pulses strongly with ventricular systole
  const glowSizes = [3, 3, 3, 10, 20, 22, 12, 4, 3];
  const glowAlphs = [0.22, 0.22, 0.22, 0.65, 1.0, 1.0, 0.45, 0.22, 0.22];

  const scaleLA   = useTransform(phase, laPhase, laScale);
  const scaleRA   = useTransform(phase, raPhase, raScale);
  const scaleLV   = useTransform(phase, vPhase,  lvScale);
  const scaleRV   = useTransform(phase, vPhase,  rvScale);
  const fillLV    = useTransform(phase, vPhase,  lvFills);
  const glowSz    = useTransform(phase, vPhase,  glowSizes);
  const glowAl    = useTransform(phase, vPhase,  glowAlphs);
  const glowFilter = useMotionTemplate`drop-shadow(0 0 ${glowSz}px rgba(231,76,60,${glowAl}))`;

  return (
    <div className="flex flex-col items-center" data-testid="heart-animation">
      <motion.svg
        width="155"
        height="172"
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

        {/* ── Great Vessels ──────────────────────────────────────── */}

        {/* SVC — enters top of RA */}
        <path
          d="M 127,12 C 125,12 121,14 120,20 L 118,52 C 122,54 128,54 132,52 L 130,20 C 129,14 129,12 127,12 Z"
          fill="#5a1812"
          stroke="#3b0e0a"
          strokeWidth="1"
        />

        {/* IVC — exits bottom of RA */}
        <path
          d="M 124,142 L 122,160 C 121,166 123,170 126,170 C 129,170 131,166 130,160 L 128,142 Z"
          fill="#5a1812"
          stroke="#3b0e0a"
          strokeWidth="1"
        />

        {/* Aortic arch — exits LV apex region, sweeps right then up */}
        <path
          d="M 80,48 C 78,28 90,14 108,12 C 128,10 140,26 138,46
             C 136,56 134,66 136,80 C 130,78 126,66 128,54
             C 130,38 118,24 106,26 C 94,28 88,38 90,54 Z"
          fill="#c0392b"
          stroke="#922b21"
          strokeWidth="1.2"
        />

        {/* Pulmonary trunk — exits RV, sweeps left */}
        <path
          d="M 100,78 C 98,60 88,48 72,44 C 60,42 50,48 46,56
             C 42,64 46,74 54,76 C 58,64 66,58 76,58
             C 86,58 94,66 96,80 Z"
          fill="#7b241c"
          stroke="#4a1511"
          strokeWidth="1.2"
        />

        {/* Pulmonary veins (subtle, left side entering LA) */}
        <path
          d="M 44,72 C 36,68 30,72 30,80 C 30,86 36,90 44,88"
          fill="none"
          stroke="#a93226"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M 44,88 C 36,86 30,90 32,98 C 34,104 40,106 48,102"
          fill="none"
          stroke="#a93226"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* ── RV (Right Ventricle) — behind LV, contract together ── */}
        <motion.g
          style={{
            transformOrigin: "130px 148px",
            scale: scaleRV,
          }}
        >
          <path
            d="M 96,96 C 108,88 140,90 152,110
               C 162,128 158,160 148,178
               C 138,194 118,204 104,210
               C 102,194 100,165 98,148
               C 96,130 94,112 96,96 Z"
            fill="url(#rv-grad)"
            stroke="#5a1812"
            strokeWidth="1.5"
          />
        </motion.g>

        {/* ── LV (Left Ventricle) — dominant, pointed apex ──────── */}
        <motion.g
          style={{
            transformOrigin: "70px 152px",
            scale: scaleLV,
          }}
        >
          <motion.path
            d="M 52,96 C 36,110 28,140 32,168
               C 36,190 58,210 96,214
               C 100,198 100,168 96,148
               C 94,134 90,112 82,100
               C 74,90 60,88 52,96 Z"
            style={{ fill: fillLV }}
            stroke="#922b21"
            strokeWidth="1.5"
          />
        </motion.g>

        {/* Interventricular septum */}
        <path
          d="M 96,96 C 97,130 97,170 96,214"
          stroke="#3b0e0a"
          strokeWidth="2.5"
          fill="none"
          opacity="0.7"
        />

        {/* ── LA (Left Atrium) — upper left, oxygenated ────────── */}
        <motion.g
          style={{
            transformOrigin: "68px 72px",
            scale: scaleLA,
          }}
        >
          <path
            d="M 44,62 C 44,44 56,38 70,38
               C 84,38 96,48 96,64
               C 96,80 84,94 70,96
               C 56,96 44,84 44,70
               C 44,66 44,64 44,62 Z"
            fill="url(#la-grad)"
            stroke="#7b241c"
            strokeWidth="1.5"
          />
        </motion.g>

        {/* ── RA (Right Atrium) — upper right, deoxygenated ──────── */}
        <motion.g
          style={{
            transformOrigin: "126px 72px",
            scale: scaleRA,
          }}
        >
          <path
            d="M 96,64 C 96,44 108,36 124,36
               C 140,36 156,48 156,68
               C 156,84 144,96 128,98
               C 112,98 96,88 96,74
               C 96,70 96,66 96,64 Z"
            fill="url(#ra-grad)"
            stroke="#4a1511"
            strokeWidth="1.5"
          />
        </motion.g>

        {/* Interatrial septum */}
        <path
          d="M 96,64 C 96,76 96,86 96,96"
          stroke="#3b0e0a"
          strokeWidth="2"
          fill="none"
          opacity="0.7"
        />

        {/* ── Labels ──────────────────────────────────────────────── */}
        <g fontFamily="monospace" fill="rgba(255,255,255,0.85)" fontSize="7.5">
          {/* LA */}
          <text x="24" y="68">LA</text>
          <line x1="38" y1="66" x2="46" y2="68" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
          {/* RA */}
          <text x="160" y="68">RA</text>
          <line x1="157" y1="66" x2="150" y2="68" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
          {/* LV */}
          <text x="16" y="155">LV</text>
          <line x1="30" y1="153" x2="46" y2="150" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
          {/* RV */}
          <text x="160" y="155">RV</text>
          <line x1="158" y1="153" x2="144" y2="150" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
          {/* Ao */}
          <text x="104" y="10">Ao</text>
          <line x1="106" y1="12" x2="108" y2="22" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
          {/* PA */}
          <text x="30" y="40">PA</text>
          <line x1="38" y1="41" x2="52" y2="52" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
        </g>
      </motion.svg>

      <div
        className="text-[9px] font-mono text-gray-500 mt-1 tracking-widest"
        data-testid="heart-rate-label"
      >
        {heartRate} BPM · SINUS RHYTHM
      </div>
    </div>
  );
}
