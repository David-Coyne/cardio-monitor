import { useMemo } from "react";
import { WaveformCanvas } from "@/components/WaveformCanvas";
import { HeartAnimation } from "@/components/HeartAnimation";

const gaussian = (x: number, center: number, width: number, height: number) =>
  height * Math.exp(-Math.pow(x - center, 2) / (2 * Math.pow(width, 2)));

const SAMPLES = 900;  // 15s × 60fps
const BEATS = 18;     // 72 bpm
const SPB = SAMPLES / BEATS; // samples per beat

export default function Monitor() {
  const { ecgData, abpData, coData } = useMemo(() => {
    const ecg = new Float32Array(SAMPLES);
    const abp = new Float32Array(SAMPLES);
    const co  = new Float32Array(SAMPLES);

    for (let i = 0; i < SAMPLES; i++) {
      const bp = (i % SPB) / SPB; // beat progress 0→1

      // --- ECG (normalised −0.3 → 1.0) ---
      let e = 0;
      // isoelectric baseline
      e += gaussian(bp, 0.13, 0.018, 0.18);   // P wave
      e += gaussian(bp, 0.265, 0.006, -0.18); // Q dip
      e += gaussian(bp, 0.285, 0.009, 1.15);  // R spike
      e += gaussian(bp, 0.305, 0.007, -0.32); // S dip
      e += gaussian(bp, 0.52,  0.045, 0.28);  // T wave
      // U wave (small)
      e += gaussian(bp, 0.68,  0.022, 0.04);
      ecg[i] = e;

      // --- Arterial BP (mmHg, 80→120) ---
      let a = 78;
      // systolic upstroke immediately after QRS
      a += gaussian(bp, 0.38, 0.048, 42);
      // dicrotic notch (aortic valve closure)
      a -= gaussian(bp, 0.54, 0.014, 8);
      // diastolic run-off
      a += gaussian(bp, 0.62, 0.07,  12);
      abp[i] = a;

      // --- Cardiac output pulse (Gaussian per beat) ---
      co[i] = gaussian(bp, 0.44, 0.075, 5.2);
    }

    return { ecgData: Array.from(ecg), abpData: Array.from(abp), coData: Array.from(co) };
  }, []);

  return (
    <div
      className="flex flex-col bg-[#080c10] text-white font-mono select-none overflow-hidden"
      style={{ height: "100dvh", maxHeight: "100dvh" }}
      data-testid="monitor-root"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: "#0d2a0d", flexShrink: 0 }}
      >
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-gray-300">
            CLINICAL MONITOR
          </div>
          <div className="text-[9px] text-gray-600 tracking-widest">ICU BED 04 · ADULT</div>
        </div>

        {/* Compact vitals strip */}
        <div className="flex gap-4 items-end">
          <div className="flex flex-col items-end leading-none">
            <span className="text-[9px] text-gray-500 tracking-widest">HR</span>
            <span className="text-lg font-bold text-[#00ff41]">72</span>
            <span className="text-[8px] text-[#00ff41] opacity-70">bpm</span>
          </div>
          <div className="flex flex-col items-end leading-none">
            <span className="text-[9px] text-gray-500 tracking-widest">ABP</span>
            <span className="text-lg font-bold text-[#ffd700]">120/80</span>
            <span className="text-[8px] text-[#ffd700] opacity-70">mmHg (93)</span>
          </div>
          <div className="flex flex-col items-end leading-none">
            <span className="text-[9px] text-gray-500 tracking-widest">CO</span>
            <span className="text-lg font-bold text-[#00e5ff]">5.0</span>
            <span className="text-[8px] text-[#00e5ff] opacity-70">L/min</span>
          </div>
          <div className="flex flex-col items-end leading-none">
            <span className="text-[9px] text-gray-500 tracking-widest">SpO₂</span>
            <span className="text-lg font-bold text-white">98</span>
            <span className="text-[8px] text-gray-400 opacity-70">%</span>
          </div>
          <div className="flex flex-col items-end leading-none">
            <span className="text-[9px] text-gray-500 tracking-widest">RR</span>
            <span className="text-lg font-bold text-gray-300">14</span>
            <span className="text-[8px] text-gray-500 opacity-70">/min</span>
          </div>
        </div>
      </header>

      {/* ── Heart + Labels row ──────────────────────────────────── */}
      <div
        className="flex items-center justify-center gap-4 px-3 py-1"
        style={{ flexShrink: 0 }}
      >
        {/* Heart */}
        <div
          className="flex items-center justify-center rounded"
          style={{ border: "1px solid #0d2a0d" }}
          data-testid="heart-panel"
        >
          <HeartAnimation />
        </div>

        {/* Educational labels */}
        <div className="flex-1 text-[9px] leading-relaxed text-gray-400" data-testid="edu-labels">
          <div className="mb-1.5">
            <span className="text-[#00ff41] font-bold tracking-wider">ECG</span>
            <ul className="mt-0.5 space-y-0.5 ml-2">
              <li><span className="text-gray-500">P wave</span> — Atrial depolarization</li>
              <li><span className="text-gray-500">QRS</span> — Ventricular depolarization</li>
              <li><span className="text-gray-500">T wave</span> — Ventricular repolarization</li>
              <li><span className="text-gray-500">U wave</span> — Purkinje repolarization</li>
            </ul>
          </div>
          <div className="mb-1.5">
            <span className="text-[#ffd700] font-bold tracking-wider">ABP</span>
            <ul className="mt-0.5 space-y-0.5 ml-2">
              <li><span className="text-gray-500">Upstroke</span> — Ventricular systole</li>
              <li><span className="text-gray-500">Dicrotic notch</span> — Aortic valve closure</li>
              <li><span className="text-gray-500">Runoff</span> — Diastolic decay</li>
            </ul>
          </div>
          <div>
            <span className="text-[#00e5ff] font-bold tracking-wider">CO</span>
            <ul className="mt-0.5 space-y-0.5 ml-2">
              <li><span className="text-gray-500">Stroke vol</span> — ~70 mL per beat</li>
              <li><span className="text-gray-500">CI</span> — 2.8 L/min/m²</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Waveform panels ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 gap-1.5 px-2 pb-2 min-h-0">
        <div className="flex-1 min-h-0">
          <WaveformCanvas
            data={ecgData}
            color="#00ff41"
            label="ECG II"
            value="72"
            unit="bpm"
            minY={-0.45}
            maxY={1.35}
            windowSeconds={6}
          />
        </div>
        <div className="flex-1 min-h-0">
          <WaveformCanvas
            data={abpData}
            color="#ffd700"
            label="ABP"
            value="120/80"
            unit="(93)"
            minY={55}
            maxY={145}
            windowSeconds={6}
          />
        </div>
        <div className="flex-1 min-h-0">
          <WaveformCanvas
            data={coData}
            color="#00e5ff"
            label="CO"
            value="5.0"
            unit="L/min"
            minY={-0.4}
            maxY={6}
            windowSeconds={6}
          />
        </div>
      </div>
    </div>
  );
}
