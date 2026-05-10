import { useMemo, useState } from "react";
import { WaveformCanvas } from "@/components/WaveformCanvas";
import { HeartAnimation } from "@/components/HeartAnimation";

const gaussian = (x: number, center: number, width: number, height: number) =>
  height * Math.exp(-Math.pow(x - center, 2) / (2 * Math.pow(width, 2)));

const SAMPLES = 900; // fixed buffer size (15 s at 60 fps)

function generateWaveforms(hr: number) {
  // How many samples fill one beat at this HR, within the 15-s buffer
  const beatSamples = (900 / 15) * (60 / hr); // = 3600 / hr

  const ecg = new Float32Array(SAMPLES);
  const abp = new Float32Array(SAMPLES);
  const co  = new Float32Array(SAMPLES);

  for (let i = 0; i < SAMPLES; i++) {
    const bp = (i % beatSamples) / beatSamples; // 0 → 1 within one beat

    // ── ECG ──────────────────────────────────────────────────────
    // P wave (atrial depolarisation)
    let e = gaussian(bp, 0.13,  0.018, 0.18);
    // QRS complex: Q dip, R spike, S dip
    e    += gaussian(bp, 0.265, 0.006, -0.18);
    e    += gaussian(bp, 0.285, 0.009,  1.15); // ← R peak at 28.5 % of beat
    e    += gaussian(bp, 0.305, 0.007, -0.32);
    // T wave (ventricular repolarisation)
    e    += gaussian(bp, 0.52,  0.045,  0.28);
    // U wave
    e    += gaussian(bp, 0.68,  0.022,  0.04);
    ecg[i] = e;

    // ── Arterial BP (mmHg) ───────────────────────────────────────
    let a = 78;
    a += gaussian(bp, 0.38,  0.048, 42);   // systolic upstroke
    a -= gaussian(bp, 0.54,  0.014,  8);   // dicrotic notch
    a += gaussian(bp, 0.62,  0.07,  12);   // diastolic run-off
    abp[i] = a;

    // ── Cardiac output pulse ─────────────────────────────────────
    co[i] = gaussian(bp, 0.44, 0.075, 5.2);
  }

  return { ecgData: Array.from(ecg), abpData: Array.from(abp), coData: Array.from(co) };
}

// Clamp HR to physiological range
const clampHR = (v: number) => Math.max(30, Math.min(200, Math.round(v)));

export default function Monitor() {
  const [hr, setHr] = useState(72);

  // Regenerate waveform buffer whenever HR changes
  const { ecgData, abpData, coData } = useMemo(() => generateWaveforms(hr), [hr]);

  // Derived display values
  const mapBP = Math.round(80 + (120 - 80) / 3); // fixed MAP for display
  const co    = 5.0;

  const handleHrInput = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) setHr(clampHR(n));
  };

  return (
    <div
      className="flex flex-col bg-[#080c10] text-white font-mono select-none overflow-hidden"
      style={{ height: "100dvh", maxHeight: "100dvh" }}
      data-testid="monitor-root"
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: "#0d2a0d", flexShrink: 0 }}
      >
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-gray-300">CLINICAL MONITOR</div>
          <div className="text-[8px] text-gray-600 tracking-widest">ICU BED 04 · ADULT · SINUS RHYTHM</div>
        </div>

        {/* ── HR input control ──────────────────────────────────── */}
        <div
          className="flex flex-col items-center px-2 py-1 rounded"
          style={{ border: "1px solid rgba(0,255,65,0.25)", background: "rgba(0,255,65,0.04)" }}
        >
          <span className="text-[7px] tracking-widest text-gray-500 mb-0.5">SET HR</span>
          <div className="flex items-center gap-1">
            <button
              data-testid="button-hr-decrease"
              onClick={() => setHr(h => clampHR(h - 1))}
              onMouseDown={e => e.preventDefault()}
              className="w-5 h-5 rounded text-[10px] font-bold text-[#00ff41] flex items-center justify-center"
              style={{ background: "rgba(0,255,65,0.1)", border: "1px solid rgba(0,255,65,0.3)" }}
            >
              −
            </button>
            <input
              data-testid="input-heart-rate"
              type="number"
              min={30}
              max={200}
              value={hr}
              onChange={e => handleHrInput(e.target.value)}
              className="w-11 text-center text-[15px] font-bold bg-transparent outline-none text-[#00ff41]"
              style={{ MozAppearance: "textfield" } as React.CSSProperties}
            />
            <button
              data-testid="button-hr-increase"
              onClick={() => setHr(h => clampHR(h + 1))}
              onMouseDown={e => e.preventDefault()}
              className="w-5 h-5 rounded text-[10px] font-bold text-[#00ff41] flex items-center justify-center"
              style={{ background: "rgba(0,255,65,0.1)", border: "1px solid rgba(0,255,65,0.3)" }}
            >
              +
            </button>
          </div>
          <span className="text-[7px] text-[#00ff41] opacity-60 mt-0.5">bpm (30–200)</span>
        </div>

        {/* ── Vital signs strip ─────────────────────────────────── */}
        <div className="flex gap-3 items-end">
          <div className="flex flex-col items-end leading-none">
            <span className="text-[8px] text-gray-500 tracking-widest">HR</span>
            <span className="text-base font-bold text-[#00ff41]">{hr}</span>
            <span className="text-[7px] text-[#00ff41] opacity-60">bpm</span>
          </div>
          <div className="flex flex-col items-end leading-none">
            <span className="text-[8px] text-gray-500 tracking-widest">ABP</span>
            <span className="text-base font-bold text-[#ffd700]">120/80</span>
            <span className="text-[7px] text-[#ffd700] opacity-60">({mapBP})</span>
          </div>
          <div className="flex flex-col items-end leading-none">
            <span className="text-[8px] text-gray-500 tracking-widest">CO</span>
            <span className="text-base font-bold text-[#00e5ff]">{co.toFixed(1)}</span>
            <span className="text-[7px] text-[#00e5ff] opacity-60">L/min</span>
          </div>
          <div className="flex flex-col items-end leading-none">
            <span className="text-[8px] text-gray-500 tracking-widest">SpO₂</span>
            <span className="text-base font-bold text-white">98</span>
            <span className="text-[7px] text-gray-400 opacity-60">%</span>
          </div>
          <div className="flex flex-col items-end leading-none">
            <span className="text-[8px] text-gray-500 tracking-widest">RR</span>
            <span className="text-base font-bold text-gray-300">14</span>
            <span className="text-[7px] text-gray-500 opacity-60">/min</span>
          </div>
        </div>
      </header>

      {/* ── Heart + Educational labels ───────────────────────────── */}
      <div
        className="flex items-center justify-center gap-3 px-3 pt-1 pb-0.5"
        style={{ flexShrink: 0 }}
      >
        <div
          className="flex items-center justify-center rounded px-1"
          style={{ border: "1px solid #0d2a0d" }}
          data-testid="heart-panel"
        >
          <HeartAnimation heartRate={hr} />
        </div>

        <div className="flex-1 text-[8.5px] leading-relaxed text-gray-400" data-testid="edu-labels">
          <div className="mb-1">
            <span className="text-[#00ff41] font-bold tracking-wider text-[9px]">ECG</span>
            <ul className="mt-0.5 space-y-0 ml-2">
              <li><span className="text-gray-500">P wave</span> — Atrial depolarization</li>
              <li><span className="text-gray-500">QRS</span> — Ventricular depolarization</li>
              <li><span className="text-gray-500">T wave</span> — Ventricular repolarization</li>
              <li><span className="text-gray-500">U wave</span> — Purkinje repolarization</li>
            </ul>
          </div>
          <div className="mb-1">
            <span className="text-[#ffd700] font-bold tracking-wider text-[9px]">ABP</span>
            <ul className="mt-0.5 space-y-0 ml-2">
              <li><span className="text-gray-500">Upstroke</span> — Ventricular systole</li>
              <li><span className="text-gray-500">Dicrotic notch</span> — Aortic valve closure</li>
              <li><span className="text-gray-500">Runoff</span> — Diastolic decay</li>
            </ul>
          </div>
          <div>
            <span className="text-[#00e5ff] font-bold tracking-wider text-[9px]">CO</span>
            <ul className="mt-0.5 space-y-0 ml-2">
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
            value={String(hr)}
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
