import { useEffect, useRef } from "react";
import { motion, useMotionValue, useMotionTemplate } from "framer-motion";
import type { RhythmType } from "@/lib/rhythmGenerators";

interface HeartAnimationProps {
  heartRate: number;
  rhythmType: RhythmType;
  svgWidth?: number;
  svgHeight?: number;
  paused?: boolean;
}

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

const lvOut   = [1.00, 1.000, 0.820, 0.760, 0.820, 0.940, 1.020, 1.00];
const rvOut   = [1.00, 1.000, 0.850, 0.810, 0.850, 0.950, 1.010, 1.00];
const gSzOut  = [3,    8,     22,    22,    14,    6,     3,     3   ];
const gAlOut  = [0.22, 0.55,  1.00,  0.95,  0.55,  0.24,  0.22,  0.22];
const vtLvOut = [1.00, 0.860, 0.780, 0.760, 0.820, 0.930, 1.010, 1.00];
const vtRvOut = [1.00, 0.890, 0.820, 0.800, 0.840, 0.940, 1.010, 1.00];
const vtGSOut = [3,    12,    22,    22,    14,    6,     3,     3   ];
const vtGAOut = [0.2,  0.65,  1.0,   0.95,  0.55,  0.24,  0.2,   0.2 ];
// PVC: weak ineffective ventricular contraction — scale barely changes (no effective ejection)
const pvcLvOut = [1.00, 1.000, 0.928, 0.912, 0.928, 0.972, 1.008, 1.00];
const pvcRvOut = [1.00, 1.000, 0.946, 0.932, 0.946, 0.978, 1.004, 1.00];
const pvcGSOut = [3,    5,     11,    10,    8,     4,     3,     3   ];
const pvcGAOut = [0.18, 0.30,  0.52,  0.48,  0.30,  0.18,  0.18,  0.18];
const laOut   = [1.00, 1.00, 0.840, 0.870, 1.000, 1.030, 1.00];
const raOut   = [1.00, 1.00, 0.850, 0.875, 1.000, 1.025, 1.00];

function buildKeyframes(hr: number) {
  const bd    = 60000 / hr;
  const vSys  = Math.min(380 / bd, 0.72);
  const aSys  = Math.min(110 / bd, 0.13);
  const q = 0.255, r = 0.285;
  const vP  = [0, q, r, r+vSys*0.25, r+vSys*0.55, r+vSys*0.85, Math.min(r+vSys,0.98), 1.0];
  const vtQ = 0.220, vtSys = Math.min(400/bd, 0.75);
  const vtP = [0, vtQ, r, r+vtSys*0.25, r+vtSys*0.55, r+vtSys*0.85, Math.min(r+vtSys,0.98), 1.0];
  // PVC: onset earlier (0.18), slightly wider systole (beat is 0.72× normal so relative fraction grows)
  const pvcQ   = 0.18;
  const pvcSys = Math.min(420 / (bd * 0.72), 0.82); // systole as fraction of PVC coupling interval
  // Map into HeartAnimation's normalized phase (which spans the full sinus cycle, not just PVC coupling)
  // The PVC beat in the waveform spans 0.72×sinus-cycle; in HeartAnimation's phase that's 0→0.72
  const pvcR = pvcQ + 0.05;
  const pvcEnd = Math.min(pvcR + pvcSys * 0.72, 0.94); // scale systole into 0→0.72 phase window
  const pvcP = [0, pvcQ, pvcR, pvcR+(pvcEnd-pvcR)*0.25, pvcR+(pvcEnd-pvcR)*0.55, pvcR+(pvcEnd-pvcR)*0.85, pvcEnd, 1.0];
  const pa  = 0.120;
  const laP = [0, pa, pa+aSys*0.4, pa+aSys*0.7, pa+aSys, 0.72, 1.0];
  const raP = [0, pa-0.01, (pa-0.01)+aSys*0.4, (pa-0.01)+aSys*0.7, (pa-0.01)+aSys, 0.70, 1.0];
  return { vP, vtP, pvcP, laP, raP };
}

export function HeartAnimation({ heartRate, rhythmType, svgWidth, svgHeight, paused = false }: HeartAnimationProps) {
  const laScale    = useMotionValue(1);
  const raScale    = useMotionValue(1);
  const lvScale    = useMotionValue(1);
  const rvScale    = useMotionValue(1);
  const lvFill     = useMotionValue("#d63027");
  const glowSize   = useMotionValue(4);
  const glowAlpha  = useMotionValue(0.25);
  const coroAlpha  = useMotionValue(0.75);
  const coroWidth  = useMotionValue(1.9);
  const coroOffset = useMotionValue(0);

  const glowFilter = useMotionTemplate`drop-shadow(0 0 ${glowSize}px rgba(220,60,40,${glowAlpha}))`;

  useEffect(() => {
    const { vP, vtP, pvcP, laP, raP } = buildKeyframes(heartRate);
    const ejVOut  = [0, 0, 0.5, 1, 0.5, 0, 0, 0];
    const ejVtOut = [0, 0, 0.5, 1, 0.5, 0, 0, 0];
    let rafId: number;

    const tick = () => {
      if (paused) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();

      if (rhythmType === "VF") {
        const p1 = (now % 170) / 170;
        const p2 = (now % 130) / 130;
        const t  = 1 + 0.022*Math.sin(2*Math.PI*p1) + 0.018*Math.sin(2*Math.PI*p2+0.7);
        laScale.set(t);
        raScale.set(1/t);
        lvScale.set(0.95 + 0.018*Math.sin(2*Math.PI*p1*3));
        rvScale.set(0.95 + 0.016*Math.sin(2*Math.PI*p2*2.3+1.2));
        lvFill.set("#5a1010");
        glowSize.set(5 + 2*Math.sin(2*Math.PI*p1));
        glowAlpha.set(0.20);
        coroAlpha.set(0.18 + 0.08*Math.sin(2*Math.PI*p2));
        coroWidth.set(0.9);
        coroOffset.set(-(now/120) % 24);
      } else {
        const bs     = 3600 / heartRate;
        const sample = ((now % 15000) / 15000) * 900;
        const b_ha   = Math.floor(sample / bs);       // HeartAnimation beat index
        const phase  = (sample % bs) / bs;

        if (rhythmType === "PVC") {
          // Bigeminy: even beats = normal sinus, odd beats = PVC (premature, ineffective)
          const isPVCBeat = b_ha % 2 === 1;
          if (isPVCBeat) {
            // PVC beat: NO atrial contraction (no P wave), WEAK ventricular contraction
            laScale.set(1.0);
            raScale.set(1.0);
            lvScale.set(lerp(pvcP, pvcLvOut, phase));
            rvScale.set(lerp(pvcP, pvcRvOut, phase));
            glowSize.set(lerp(pvcP, pvcGSOut, phase));
            glowAlpha.set(lerp(pvcP, pvcGAOut, phase));
            lvFill.set("#c0392b");            // stays dark — ineffective ejection
            coroAlpha.set(0.20);             // very poor coronary perfusion
            coroWidth.set(0.7);
          } else {
            // Normal sinus beat in bigeminy
            laScale.set(lerp(laP, laOut, phase));
            raScale.set(lerp(raP, raOut, phase));
            lvScale.set(lerp(vP, lvOut, phase));
            rvScale.set(lerp(vP, rvOut, phase));
            glowSize.set(lerp(vP, gSzOut, phase));
            glowAlpha.set(lerp(vP, gAlOut, phase));
            lvFill.set(lerp(vP, ejVOut, phase) > 0.5 ? "#ff5535" : "#d63027");
            const r_n = 0.285, bd_n = 60000 / heartRate, vSys_n = Math.min(380/bd_n, 0.72);
            const inSystole = phase > r_n && phase < r_n + vSys_n * 0.85;
            coroAlpha.set(inSystole ? 0.30 : 0.82);
            coroWidth.set(inSystole ? 1.1 : 2.3);
          }
          coroOffset.set(-(now / 28) % 24);
        } else {
          if (rhythmType === "AF") {
            const ap = (now % 180) / 180;
            laScale.set(1 + 0.046*Math.sin(2*Math.PI*ap));
            raScale.set(1 + 0.040*Math.sin(2*Math.PI*ap+0.5));
          } else if (rhythmType === "VT" || rhythmType === "SVT") {
            laScale.set(1.0); raScale.set(1.0);
          } else {
            laScale.set(lerp(laP, laOut, phase));
            raScale.set(lerp(raP, raOut, phase));
          }

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
            lvFill.set(lerp(vP, ejVOut, phase) > 0.5 ? "#ff5535" : "#d63027");
          }

          // Coronary perfusion peaks in DIASTOLE (myocardium relaxes → intramural vessels open)
          const r    = 0.285;
          const bd   = 60000 / heartRate;
          const vSys = Math.min(380/bd, 0.72);
          const inSystole = phase > r && phase < r + vSys * 0.85;
          coroAlpha.set(inSystole ? 0.30 : 0.82);
          coroWidth.set(inSystole ? 1.1 : 2.3);
          coroOffset.set(-(now / 28) % 24);
        }
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [heartRate, rhythmType, paused, laScale, raScale, lvScale, rvScale, lvFill, glowSize, glowAlpha, coroAlpha, coroWidth, coroOffset]);

  const isVF     = rhythmType === "VF";
  const isLethal = rhythmType === "VF" || rhythmType === "VT";

  return (
    <div className="flex flex-col items-center" data-testid="heart-animation">
      <motion.svg
        width={svgWidth ?? 158}
        height={svgHeight ?? 178}
        viewBox="0 0 210 230"
        className="overflow-visible"
        style={{ filter: glowFilter }}
      >
        <defs>
          {/* ── LV gradient: bright highlight upper-left, deep crimson lower-right ── */}
          <radialGradient id="lv-grad" cx="30%" cy="26%" r="72%" fx="25%" fy="22%">
            <stop offset="0%"   stopColor="#ff8060" stopOpacity="1" />
            <stop offset="28%"  stopColor="#d63027" />
            <stop offset="60%"  stopColor="#9b1f16" />
            <stop offset="100%" stopColor="#5e0e06" />
          </radialGradient>
          {/* ── RV gradient ── */}
          <radialGradient id="rv-grad" cx="60%" cy="28%" r="68%">
            <stop offset="0%"   stopColor="#b84040" stopOpacity="0.9" />
            <stop offset="45%"  stopColor="#7b2020" />
            <stop offset="100%" stopColor="#4a1010" />
          </radialGradient>
          {/* ── LA gradient ── */}
          <radialGradient id="la-grad" cx="36%" cy="32%" r="65%">
            <stop offset="0%"   stopColor="#e06055" stopOpacity="0.95" />
            <stop offset="55%"  stopColor="#a82820" />
            <stop offset="100%" stopColor="#6a1410" />
          </radialGradient>
          {/* ── RA gradient ── */}
          <radialGradient id="ra-grad" cx="52%" cy="32%" r="62%">
            <stop offset="0%"   stopColor="#903535" stopOpacity="0.85" />
            <stop offset="50%"  stopColor="#5e1e1e" />
            <stop offset="100%" stopColor="#380c0c" />
          </radialGradient>
          {/* ── Specular sheen on LV ── */}
          <radialGradient id="lv-sheen" cx="28%" cy="22%" r="38%">
            <stop offset="0%"   stopColor="rgba(255,210,190,0.28)" />
            <stop offset="100%" stopColor="rgba(255,150,120,0)" />
          </radialGradient>
          {/* ── Aorta gradient ── */}
          <linearGradient id="ao-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#7a2020" />
            <stop offset="40%"  stopColor="#c03030" />
            <stop offset="100%" stopColor="#5a1818" />
          </linearGradient>
          {/* ── PA gradient ── */}
          <linearGradient id="pa-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#3a2060" />
            <stop offset="50%"  stopColor="#5a3090" />
            <stop offset="100%" stopColor="#3a2060" />
          </linearGradient>
          {/* ── Coronary artery gradient (lumen highlight) ── */}
          <linearGradient id="coro-lumen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#ff5533" />
            <stop offset="50%"  stopColor="#cc1100" />
            <stop offset="100%" stopColor="#ff5533" />
          </linearGradient>
          {/* ── Drop shadow filter for vessels ── */}
          <filter id="vessel-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.5" dy="1" stdDeviation="0.8" floodColor="#1a0000" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* ══ DEPTH SHADOW ══════════════════════════════════════════════════════ */}
        <ellipse cx="102" cy="172" rx="78" ry="58"
          fill="rgba(0,0,0,0.40)" transform="translate(5,10) skewX(-3)" />

        {/* ══ GREAT VESSELS — drawn first (behind atria/ventricles) ════════════ */}

        {/* Superior Vena Cava (SVC) — enters RA top-right */}
        <rect x="152" y="14" width="12" height="36" rx="6"
          fill={isVF ? "#2a1010" : "#4a1818"} stroke="#300a0a" strokeWidth="0.8" />
        <rect x="153" y="14" width="5" height="36" rx="3"
          fill={isVF ? "#3a1818" : "#6a2828"} opacity="0.5" />

        {/* Inferior Vena Cava (IVC) */}
        <path d="M 150,152 C 152,162 154,170 156,174"
          stroke={isVF ? "#2a1010" : "#4a1818"} strokeWidth="8" strokeLinecap="round" fill="none" />

        {/* Pulmonary trunk — arises from RV, sweeps left */}
        <path d="M 84,52 C 82,40 78,30 72,22 C 68,16 62,14 56,14 L 50,14 C 44,14 40,18 40,24 L 40,36 C 40,40 42,42 46,42 L 52,42 C 58,42 62,38 62,32 C 68,36 72,44 74,54 Z"
          fill={isVF ? "#1a0a28" : "url(#pa-grad)"} stroke="#2a1548" strokeWidth="1" />
        {/* PA highlight */}
        <path d="M 85,52 C 84,42 82,34 78,26 C 76,22 73,18 70,16"
          stroke="rgba(120,80,180,0.3)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

        {/* Left pulmonary artery branch */}
        <path d="M 44,24 C 34,22 28,26 26,34"
          stroke={isVF ? "#1a0a28" : "#3a1a68"} strokeWidth="6" strokeLinecap="round" fill="none" />
        {/* Right pulmonary artery branch */}
        <path d="M 44,30 C 56,28 72,30 86,36"
          stroke={isVF ? "#1a0a28" : "#3a1a68"} strokeWidth="5" strokeLinecap="round" fill="none" />

        {/* Pulmonary veins entering LA */}
        <path d="M 36,68 C 28,64 22,68 22,78 C 22,86 28,90 36,88"
          fill="none" stroke={isVF ? "#3a1010" : "#a03030"} strokeWidth="6" strokeLinecap="round" />
        <path d="M 36,88 C 28,86 22,92 24,102 C 26,110 34,112 42,108"
          fill="none" stroke={isVF ? "#3a1010" : "#a03030"} strokeWidth="5" strokeLinecap="round" />
        {/* PV highlights */}
        <path d="M 36,68 C 29,65 24,69 24,78" fill="none"
          stroke="rgba(220,80,80,0.25)" strokeWidth="2" strokeLinecap="round" />

        {/* Ascending Aorta */}
        <path d="M 128,16 C 126,12 122,10 118,10 C 114,10 110,12 108,16 L 106,54 C 110,56 116,58 122,56 Z"
          fill={isVF ? "#3a1010" : "url(#ao-grad)"} stroke="#5a1410" strokeWidth="1.2" />
        {/* Aortic arch begins */}
        <path d="M 108,30 C 100,26 92,22 82,20 C 74,18 66,18 60,22"
          stroke={isVF ? "#3a1010" : "#8a2020"} strokeWidth="9" strokeLinecap="round" fill="none" />
        <path d="M 108,30 C 100,26 92,22 82,20 C 74,18 66,18 60,22"
          stroke={isVF ? "#4a1818" : "#c04040"} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5" />
        {/* Aorta highlight */}
        <path d="M 116,16 C 115,12 113,10 110,10"
          stroke="rgba(255,150,130,0.3)" strokeWidth="2" strokeLinecap="round" fill="none" />

        {/* Brachiocephalic / arch vessels */}
        <path d="M 96,22 C 96,14 98,8 100,6" stroke={isVF ? "#3a1010" : "#7a2020"} strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M 88,20 C 86,12 86,6 86,2"  stroke={isVF ? "#3a1010" : "#7a2020"} strokeWidth="4" fill="none" strokeLinecap="round" />

        {/* Descending aorta */}
        <path d="M 124,148 C 126,166 126,178 124,186"
          stroke={isVF ? "#3a1010" : "#7a2020"} strokeWidth="9" strokeLinecap="round" fill="none" />
        <path d="M 124,148 C 126,166 126,178 124,186"
          stroke={isVF ? "#4a1818" : "#aa3030"} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.4" />

        {/* Coronary sinus ridge (AV groove posterior) */}
        <path d="M 98,100 C 116,102 138,106 154,116"
          stroke={isVF ? "#2a1010" : "#6a2020"} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.5" />

        {/* ══ RA ════════════════════════════════════════════════════════════════ */}
        <motion.g style={{ transformOrigin: "138px 74px", scale: raScale }}>
          <path
            d="M 100,64 C 100,44 114,34 134,34 C 154,34 170,48 170,70 C 170,90 156,104 136,106 C 116,106 100,94 100,78 Z"
            fill={isVF ? "#2a0e0e" : "url(#ra-grad)"}
            stroke="#3a0e0e" strokeWidth="1.8"
          />
          {/* RA inner shading */}
          <path d="M 100,64 C 100,50 110,40 128,38 C 114,40 104,52 104,68 C 104,84 116,96 132,98 C 116,96 100,84 100,78 Z"
            fill="rgba(0,0,0,0.18)" />
          {/* Crista terminalis */}
          <path d="M 148,40 C 152,50 154,64 152,78" stroke="rgba(100,30,30,0.4)" strokeWidth="2" fill="none" strokeLinecap="round" />
        </motion.g>

        {/* SVC–RA junction ring */}
        <ellipse cx="158" cy="50" rx="8" ry="5"
          fill={isVF ? "#2a1010" : "#4a1818"} stroke="#300a0a" strokeWidth="0.8" />

        {/* ══ LA ════════════════════════════════════════════════════════════════ */}
        <motion.g style={{ transformOrigin: "70px 72px", scale: laScale }}>
          <path
            d="M 42,64 C 42,44 56,36 72,36 C 88,36 100,48 100,64 C 100,82 86,96 70,96 C 54,96 42,84 42,70 Z"
            fill={isVF ? "#3a1010" : "url(#la-grad)"}
            stroke="#6a2020" strokeWidth="1.8"
          />
          {/* LA inner shadow */}
          <path d="M 42,64 C 42,50 52,40 66,38 C 52,42 46,54 46,68 C 46,82 56,94 70,96 C 54,96 42,84 42,70 Z"
            fill="rgba(0,0,0,0.20)" />
          {/* Fossa ovalis hint (visible from LA side) */}
          <ellipse cx="96" cy="70" rx="4" ry="6" fill="rgba(0,0,0,0.15)" />
        </motion.g>

        {/* Interatrial septum ridge */}
        <path d="M 100,46 C 100,58 100,74 100,98"
          stroke="#2a0808" strokeWidth="3" fill="none" opacity="0.65" />

        {/* ══ RV ════════════════════════════════════════════════════════════════ */}
        <motion.g style={{ transformOrigin: "138px 156px", scale: rvScale }}>
          <path
            d="M 96,100 C 112,88 150,90 168,114 C 182,132 180,168 170,192 C 158,212 136,224 116,228 C 108,212 102,188 100,166 C 98,146 96,124 96,100 Z"
            fill={isVF ? "#2a0c0c" : "url(#rv-grad)"}
            stroke="#4a1414" strokeWidth="1.8"
          />
          {/* RV trabecular texture */}
          <path d="M 162,118 C 158,138 150,158 140,174" stroke="rgba(30,5,5,0.30)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 155,126 C 150,150 140,170 128,188" stroke="rgba(30,5,5,0.22)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {/* RV moderator band (trabecula septomarginalis) */}
          <path d="M 100,148 C 116,144 134,146 148,154"
            stroke="rgba(80,20,20,0.45)" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* RVOT (outflow tract toward PA) */}
          <path d="M 100,100 C 92,92 84,80 84,68"
            stroke={isVF ? "#2a1828" : "#5a2878"} strokeWidth="8" strokeLinecap="round" fill="none" />
        </motion.g>

        {/* ══ LV ════════════════════════════════════════════════════════════════ */}
        <motion.g style={{ transformOrigin: "68px 160px", scale: lvScale }}>
          <motion.path
            d="M 48,100 C 28,118 20,152 26,182 C 32,208 60,228 100,228 C 102,208 100,184 98,164 C 96,144 90,120 80,106 C 70,94 56,92 48,100 Z"
            style={{ fill: isVF ? "#3a0e0e" : lvFill }}
            stroke={isLethal ? "#7a1010" : "#8b2018"} strokeWidth="2"
          />
          {/* LV inner shadow (depth) */}
          <path d="M 48,100 C 30,116 22,148 28,178 C 22,148 24,116 44,100 Z"
            fill="rgba(0,0,0,0.22)" />
          {/* LV apex trabeculation */}
          <path d="M 62,186 C 72,202 84,214 98,222" stroke="rgba(20,4,4,0.25)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 52,170 C 60,192 74,212 96,224" stroke="rgba(20,4,4,0.18)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {/* LV papillary muscle bulge */}
          <ellipse cx="54" cy="162" rx="10" ry="14" fill="rgba(0,0,0,0.16)" />
          <ellipse cx="74" cy="172" rx="8"  ry="11" fill="rgba(0,0,0,0.14)" />
        </motion.g>

        {/* ══ LV SPECULAR SHEEN (3-D surface highlight) ═════════════════════════ */}
        <path
          d="M 48,100 C 30,116 22,150 26,178 C 40,136 56,108 80,106 Z"
          fill="url(#lv-sheen)"
        />

        {/* Interventricular septum */}
        <path d="M 96,100 C 97,142 98,188 100,228"
          stroke="#1a0404" strokeWidth="3" fill="none" opacity="0.7" />

        {/* ══ EPICARDIAL FAT PADS (AV & IV grooves) ════════════════════════════ */}
        {/* Right AV groove fat */}
        <path d="M 100,100 C 120,96 148,104 162,118"
          stroke="rgba(210,175,60,0.22)" strokeWidth="10" fill="none" strokeLinecap="round" />
        {/* Left AV groove fat */}
        <path d="M 44,96 C 60,88 80,92 100,100"
          stroke="rgba(210,175,60,0.18)" strokeWidth="8" fill="none" strokeLinecap="round" />
        {/* Anterior IV groove fat */}
        <path d="M 96,100 C 97,140 98,185 100,228"
          stroke="rgba(200,168,55,0.14)" strokeWidth="7" fill="none" strokeLinecap="round" />

        {/* ══ CORONARY ARTERIES ═════════════════════════════════════════════════ */}

        {/* ── RCA (Right Coronary Artery) ───────────────────────────────────── */}
        {/* Vessel wall */}
        <path
          d="M 132,62 C 144,58 160,68 168,84 C 174,100 172,126 162,148 C 152,168 136,178 122,184"
          fill="none" stroke="#5a1008" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
          filter="url(#vessel-shadow)"
        />
        {/* Lumen with animated flow */}
        <motion.path
          d="M 132,62 C 144,58 160,68 168,84 C 174,100 172,126 162,148 C 152,168 136,178 122,184"
          fill="none" strokeLinecap="round" strokeLinejoin="round"
          stroke={isVF ? "#5a1010" : "#dd2800"}
          strokeDasharray="6 5"
          style={{ strokeWidth: coroWidth, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />
        {/* RCA lumen highlight (center bright line) */}
        <motion.path
          d="M 132,62 C 144,58 160,68 168,84 C 174,100 172,126 162,148 C 152,168 136,178 122,184"
          fill="none" strokeLinecap="round"
          stroke="#ff7755"
          strokeDasharray="3 8"
          style={{ strokeWidth: 0.8, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* Acute Marginal branch of RCA */}
        <path d="M 166,120 C 162,134 156,148 148,160"
          fill="none" stroke="#4a0c08" strokeWidth="3" strokeLinecap="round" />
        <motion.path
          d="M 166,120 C 162,134 156,148 148,160"
          fill="none" strokeLinecap="round"
          stroke={isVF ? "#4a1010" : "#cc2600"}
          strokeDasharray="5 5"
          style={{ strokeWidth: 0.9, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* Posterior Descending Artery (PDA from RCA) */}
        <path d="M 122,184 C 116,198 110,210 108,224"
          fill="none" stroke="#4a0c08" strokeWidth="3" strokeLinecap="round" />
        <motion.path
          d="M 122,184 C 116,198 110,210 108,224"
          fill="none" strokeLinecap="round"
          stroke={isVF ? "#4a1010" : "#cc2600"}
          strokeDasharray="5 5"
          style={{ strokeWidth: 0.9, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* ── Left Main CA → LAD + LCX ─────────────────────────────────────── */}
        {/* LMCA — short stub from left aortic sinus */}
        <path d="M 110,64 C 106,60 102,60 98,64"
          fill="none" stroke="#5a1008" strokeWidth="4" strokeLinecap="round" />
        <motion.path
          d="M 110,64 C 106,60 102,60 98,64"
          fill="none" strokeLinecap="round"
          stroke={isVF ? "#5a1010" : "#dd2800"}
          strokeDasharray="4 4"
          style={{ strokeWidth: coroWidth, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* LAD (Left Anterior Descending) — down anterior IVG */}
        <path d="M 98,64 C 97,86 96,116 97,148 C 98,178 102,202 108,222"
          fill="none" stroke="#5a1008" strokeWidth="4.2" strokeLinecap="round" />
        <motion.path
          d="M 98,64 C 97,86 96,116 97,148 C 98,178 102,202 108,222"
          fill="none" strokeLinecap="round"
          stroke={isVF ? "#5a1010" : "#dd2800"}
          strokeDasharray="6 5"
          style={{ strokeWidth: coroWidth, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />
        <motion.path
          d="M 98,64 C 97,86 96,116 97,148 C 98,178 102,202 108,222"
          fill="none" strokeLinecap="round"
          stroke="#ff7755"
          strokeDasharray="3 8"
          style={{ strokeWidth: 0.8, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* First Diagonal branch (D1) off LAD */}
        <path d="M 97,98 C 86,106 72,116 60,130"
          fill="none" stroke="#480c08" strokeWidth="3.2" strokeLinecap="round" />
        <motion.path
          d="M 97,98 C 86,106 72,116 60,130"
          fill="none" strokeLinecap="round"
          stroke={isVF ? "#4a1010" : "#cc2600"}
          strokeDasharray="5 5"
          style={{ strokeWidth: 0.9, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* Second Diagonal branch (D2) */}
        <path d="M 97,126 C 86,132 72,140 62,150"
          fill="none" stroke="#400c08" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
        <motion.path
          d="M 97,126 C 86,132 72,140 62,150"
          fill="none" strokeLinecap="round"
          stroke={isVF ? "#3a1010" : "#bb2200"}
          strokeDasharray="4 6"
          style={{ strokeWidth: 0.7, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* LCX (Left Circumflex) — in left AV groove */}
        <path d="M 98,64 C 84,58 68,64 54,78 C 40,92 36,114 38,136"
          fill="none" stroke="#4a1008" strokeWidth="3.6" strokeLinecap="round" />
        <motion.path
          d="M 98,64 C 84,58 68,64 54,78 C 40,92 36,114 38,136"
          fill="none" strokeLinecap="round"
          stroke={isVF ? "#4a1010" : "#cc2600"}
          strokeDasharray="5 5"
          style={{ strokeWidth: 1.0, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* Obtuse Marginal branch (OM1) off LCX */}
        <path d="M 44,112 C 38,124 34,140 32,156"
          fill="none" stroke="#3c0c08" strokeWidth="2.6" strokeLinecap="round" opacity="0.85" />
        <motion.path
          d="M 44,112 C 38,124 34,140 32,156"
          fill="none" strokeLinecap="round"
          stroke={isVF ? "#3a1010" : "#bb2200"}
          strokeDasharray="4 6"
          style={{ strokeWidth: 0.7, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* Sinoatrial nodal artery (off RCA, to SA node) */}
        <path d="M 134,64 C 144,58 154,50 158,42"
          fill="none" stroke="#3c0c08" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <motion.path
          d="M 134,64 C 144,58 154,50 158,42"
          fill="none" strokeLinecap="round"
          stroke={isVF ? "#3a1010" : "#aa2200"}
          strokeDasharray="3 6"
          style={{ strokeWidth: 0.6, opacity: coroAlpha, strokeDashoffset: coroOffset }}
        />

        {/* ══ VF OVERLAY ════════════════════════════════════════════════════════ */}
        {isVF && (
          <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
            fontSize="11" fontFamily="monospace" fill="rgba(255,50,50,0.55)"
            fontWeight="bold" letterSpacing="2">
            FIBRILLATING
          </text>
        )}

        {/* ══ LABELS ════════════════════════════════════════════════════════════ */}
        <g fontFamily="monospace"
          fill={isLethal ? "rgba(255,100,100,0.75)" : "rgba(220,230,220,0.88)"}
          fontSize="7.5">
          {/* LA */}
          <text x="12" y="66">LA</text>
          <line x1="27" y1="64" x2="44" y2="68" stroke="rgba(200,200,200,0.3)" strokeWidth="0.8" />
          {/* RA */}
          <text x="172" y="66">RA</text>
          <line x1="171" y1="64" x2="163" y2="68" stroke="rgba(200,200,200,0.3)" strokeWidth="0.8" />
          {/* LV */}
          <text x="8" y="158">LV</text>
          <line x1="23" y1="156" x2="40" y2="154" stroke="rgba(200,200,200,0.3)" strokeWidth="0.8" />
          {/* RV */}
          <text x="172" y="158">RV</text>
          <line x1="171" y1="156" x2="160" y2="152" stroke="rgba(200,200,200,0.3)" strokeWidth="0.8" />
          {/* Ao */}
          <text x="108" y="9">Ao</text>
          <line x1="112" y1="11" x2="114" y2="22" stroke="rgba(200,200,200,0.3)" strokeWidth="0.8" />
          {/* PA */}
          <text x="25" y="38">PA</text>
          <line x1="34" y1="39" x2="46" y2="46" stroke="rgba(200,200,200,0.3)" strokeWidth="0.8" />
          {/* Coronary labels */}
          <text x="171" y="92" fontSize="6.5" fill="rgba(220,100,80,0.75)">RCA</text>
          <text x="100" y="194" fontSize="6.5" fill="rgba(220,100,80,0.75)">LAD</text>
          <text x="10" y="118" fontSize="6.5" fill="rgba(220,100,80,0.75)">LCX</text>
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
