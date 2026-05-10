import { useMemo, useState, useEffect, useRef } from "react";
import { WaveformCanvas } from "@/components/WaveformCanvas";
import { HeartAnimation } from "@/components/HeartAnimation";
import {
  type RhythmType,
  RHYTHM_CONFIGS,
  generateWaveforms,
} from "@/lib/rhythmGenerators";

// ── Helpers ───────────────────────────────────────────────────────────────────

const clampHR = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(v)));

// ── Component ─────────────────────────────────────────────────────────────────

export default function Monitor() {
  const [rhythmType, setRhythmType] = useState<RhythmType>("SR");
  const [hr, setHr] = useState(72);

  const rhythmCfg = RHYTHM_CONFIGS.find(r => r.type === rhythmType)!;
  const isVF      = rhythmType === "VF";
  const isLethal  = rhythmCfg.isLethal;

  // Regenerate waveform buffer when HR or rhythm changes
  const { ecgData, abpData, coData, beatSamples, beatSysArr, beatDiaArr, beatCOArr } =
    useMemo(() => generateWaveforms(hr, rhythmType), [hr, rhythmType]);

  // Live readout state — updated once per beat
  const [liveBP, setLiveBP] = useState({
    sys: rhythmCfg.defaultSys, dia: rhythmCfg.defaultDia,
    map: Math.round(rhythmCfg.defaultDia + (rhythmCfg.defaultSys - rhythmCfg.defaultDia) / 3),
  });
  const [liveCO, setLiveCO] = useState(rhythmCfg.defaultCO);

  // Stable refs so the rAF closure always reads the latest data
  const beatSamplesRef = useRef(beatSamples);
  const beatSysRef     = useRef(beatSysArr);
  const beatDiaRef     = useRef(beatDiaArr);
  const beatCORef      = useRef(beatCOArr);

  useEffect(() => {
    beatSamplesRef.current = beatSamples;
    beatSysRef.current     = beatSysArr;
    beatDiaRef.current     = beatDiaArr;
    beatCORef.current      = beatCOArr;
  }, [beatSamples, beatSysArr, beatDiaArr, beatCOArr]);

  // Single rAF loop — updates readouts once per beat
  useEffect(() => {
    let rafId: number;
    let lastBeat = -1;
    const tick = () => {
      const sample  = ((performance.now() % 15000) / 15000) * 900;
      const b       = Math.min(
        Math.floor(sample / beatSamplesRef.current),
        beatSysRef.current.length - 1,
      );
      if (b !== lastBeat) {
        lastBeat = b;
        const sys = Math.round(beatSysRef.current[b]);
        const dia = Math.round(beatDiaRef.current[b]);
        const map = Math.round(dia + (sys - dia) / 3);
        setLiveBP({ sys, dia, map });
        setLiveCO(parseFloat(beatCORef.current[b].toFixed(1)));
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ── Rhythm selection ────────────────────────────────────────────────────────

  const handleRhythmChange = (type: RhythmType) => {
    const cfg = RHYTHM_CONFIGS.find(r => r.type === type)!;
    setRhythmType(type);
    setHr(cfg.defaultHR);
    setLiveBP({
      sys: cfg.defaultSys, dia: cfg.defaultDia,
      map: Math.round(cfg.defaultDia + (cfg.defaultSys - cfg.defaultDia) / 3),
    });
    setLiveCO(cfg.defaultCO);
  };

  const handleHrChange = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) setHr(clampHR(n, rhythmCfg.hrMin, rhythmCfg.hrMax));
  };

  // Display helpers
  const hrDisplay  = isVF ? "---" : rhythmType === "AF" ? `~${hr}` : String(hr);
  const bpDisplay  = isVF ? "40/25" : `${liveBP.sys}/${liveBP.dia}`;
  const mapDisplay = isVF ? "29" : String(liveBP.map);
  const coDisplay  = liveCO.toFixed(1);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col bg-[#080c10] text-white font-mono select-none overflow-hidden"
      style={{ height: "100dvh", maxHeight: "100dvh" }}
      data-testid="monitor-root"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-3 py-1"
        style={{
          borderBottom: `1px solid ${isLethal ? "rgba(255,60,60,0.4)" : "#0d2a0d"}`,
          flexShrink: 0,
        }}
      >
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-gray-300">
            CLINICAL MONITOR
          </div>
          <div className="text-[8px] text-gray-600 tracking-widest">
            ICU BED 04 · ADULT
          </div>
          <div
            className="text-[8px] font-bold tracking-widest mt-0.5"
            style={{ color: isLethal ? "#ff4040" : "#00ff41" }}
          >
            {rhythmCfg.fullName.toUpperCase()}
          </div>
        </div>

        {/* ── HR input ────────────────────────────────────────────────────── */}
        <div
          className="flex flex-col items-center px-2 py-0.5 rounded"
          style={{
            border: `1px solid ${isVF ? "rgba(80,80,80,0.3)" : "rgba(0,255,65,0.25)"}`,
            background: isVF ? "rgba(30,30,30,0.3)" : "rgba(0,255,65,0.04)",
          }}
        >
          <span className="text-[7px] tracking-widest text-gray-500">SET HR</span>
          <div className="flex items-center gap-1">
            <button
              data-testid="button-hr-decrease"
              onClick={() => !isVF && setHr(h => clampHR(h - 1, rhythmCfg.hrMin, rhythmCfg.hrMax))}
              disabled={isVF}
              className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center"
              style={{
                color: isVF ? "#444" : "#00ff41",
                background: isVF ? "transparent" : "rgba(0,255,65,0.1)",
                border: `1px solid ${isVF ? "#333" : "rgba(0,255,65,0.3)"}`,
              }}
            >−</button>
            <input
              data-testid="input-heart-rate"
              type="number"
              min={rhythmCfg.hrMin}
              max={rhythmCfg.hrMax}
              value={isVF ? "" : hr}
              placeholder={isVF ? "---" : ""}
              disabled={isVF}
              onChange={e => handleHrChange(e.target.value)}
              className="w-11 text-center text-[14px] font-bold bg-transparent outline-none"
              style={{
                color: isVF ? "#555" : "#00ff41",
                MozAppearance: "textfield",
              } as React.CSSProperties}
            />
            <button
              data-testid="button-hr-increase"
              onClick={() => !isVF && setHr(h => clampHR(h + 1, rhythmCfg.hrMin, rhythmCfg.hrMax))}
              disabled={isVF}
              className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center"
              style={{
                color: isVF ? "#444" : "#00ff41",
                background: isVF ? "transparent" : "rgba(0,255,65,0.1)",
                border: `1px solid ${isVF ? "#333" : "rgba(0,255,65,0.3)"}`,
              }}
            >+</button>
          </div>
          <span className="text-[7px] opacity-60 mt-0.5" style={{ color: isVF ? "#555" : "#00ff41" }}>
            {isVF ? "N/A" : `${rhythmCfg.hrMin}–${rhythmCfg.hrMax} bpm`}
          </span>
        </div>

        {/* ── Vital signs + alarm ─────────────────────────────────────────── */}
        <div className="flex flex-col items-end gap-0.5">
          {isLethal && (
            <div
              className="text-[9px] font-bold tracking-widest animate-pulse px-1.5 py-0.5 rounded"
              style={{
                color: "#ff4040",
                background: "rgba(255,64,64,0.12)",
                border: "1px solid rgba(255,64,64,0.4)",
              }}
              data-testid="alarm-indicator"
            >
              ⚠ ALARM
            </div>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex flex-col items-end leading-none">
              <span className="text-[8px] text-gray-500 tracking-widest">HR</span>
              <span
                className="text-base font-bold"
                style={{ color: isVF ? "#555" : "#00ff41" }}
                data-testid="text-hr-value"
              >
                {hrDisplay}
              </span>
              <span className="text-[7px] opacity-60" style={{ color: isVF ? "#555" : "#00ff41" }}>bpm</span>
            </div>
            <div className="flex flex-col items-end leading-none">
              <span className="text-[8px] text-gray-500 tracking-widest">ABP</span>
              <span className="text-base font-bold text-[#ffd700]" data-testid="text-abp-value">
                {bpDisplay}
              </span>
              <span className="text-[7px] text-[#ffd700] opacity-60">({mapDisplay})</span>
            </div>
            <div className="flex flex-col items-end leading-none">
              <span className="text-[8px] text-gray-500 tracking-widest">CO</span>
              <span className="text-base font-bold text-[#00e5ff]" data-testid="text-co-value">
                {coDisplay}
              </span>
              <span className="text-[7px] text-[#00e5ff] opacity-60">L/min</span>
            </div>
            <div className="flex flex-col items-end leading-none">
              <span className="text-[8px] text-gray-500 tracking-widest">SpO₂</span>
              <span className="text-base font-bold" style={{ color: isVF ? "#555" : "white" }}>
                {isVF ? "--" : "98"}
              </span>
              <span className="text-[7px] text-gray-400 opacity-60">%</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Rhythm selector ─────────────────────────────────────────────────── */}
      <div
        className="flex gap-1 px-2 py-1"
        style={{ borderBottom: "1px solid #0d2a0d", flexShrink: 0 }}
      >
        {RHYTHM_CONFIGS.map(cfg => {
          const active  = rhythmType === cfg.type;
          const danger  = cfg.isLethal;
          const col     = danger ? "#ff5555" : "#00ff41";
          return (
            <button
              key={cfg.type}
              data-testid={`button-rhythm-${cfg.type.toLowerCase()}`}
              onClick={() => handleRhythmChange(cfg.type)}
              className="flex-1 text-[9px] font-bold py-0.5 rounded tracking-wider transition-all"
              style={{
                color:      active ? (danger ? "#ff2020" : "#00ff41") : (danger ? "rgba(255,85,85,0.5)" : "rgba(0,255,65,0.45)"),
                background: active ? (danger ? "rgba(255,32,32,0.12)" : "rgba(0,255,65,0.10)") : "transparent",
                border:     `1px solid ${active ? col : "rgba(80,80,80,0.2)"}`,
                boxShadow:  active && danger ? "0 0 6px rgba(255,32,32,0.3)" : "none",
              }}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* ── Heart + Educational labels ───────────────────────────────────────── */}
      <div
        className="flex items-center justify-center gap-3 px-3 pt-0.5 pb-0"
        style={{ flexShrink: 0 }}
      >
        <div
          className="flex items-center justify-center rounded"
          style={{ border: `1px solid ${isLethal ? "rgba(255,60,60,0.2)" : "#0d2a0d"}` }}
          data-testid="heart-panel"
        >
          <HeartAnimation heartRate={isVF ? 300 : hr} rhythmType={rhythmType} />
        </div>

        <div className="flex-1 text-[8px] leading-relaxed text-gray-400" data-testid="edu-labels">
          <div className="mb-1">
            <span className="text-[#00ff41] font-bold tracking-wider text-[8.5px]">ECG</span>
            <ul className="mt-0.5 ml-2 space-y-0">
              {rhythmType === "AF"  && <li className="text-amber-400">No P waves · Irregular RR</li>}
              {rhythmType === "SVT" && <li className="text-amber-400">Retrograde P · Narrow QRS</li>}
              {rhythmType === "VT"  && <li className="text-red-400">Wide QRS · AV dissociation</li>}
              {rhythmType === "VF"  && <li className="text-red-400">Chaotic · No organised QRS</li>}
              {(rhythmType === "SR" || rhythmType === "ST" || rhythmType === "SB") && (
                <>
                  <li><span className="text-gray-500">P wave</span> — Atrial depolarization</li>
                  <li><span className="text-gray-500">QRS</span> — Ventricular depolarization</li>
                  <li><span className="text-gray-500">T wave</span> — Ventricular repolarization</li>
                </>
              )}
            </ul>
          </div>
          <div className="mb-1">
            <span className="text-[#ffd700] font-bold tracking-wider text-[8.5px]">ABP</span>
            <ul className="mt-0.5 ml-2 space-y-0">
              {rhythmType === "VF" && <li className="text-red-400">Agonal trace · No perfusion</li>}
              {rhythmType === "VT" && <li className="text-red-400">Reduced SBP · Haemodynamic compromise</li>}
              {rhythmType === "AF" && <li className="text-amber-400">Variable pulse pressure</li>}
              {(rhythmType !== "VF" && rhythmType !== "VT" && rhythmType !== "AF") && (
                <>
                  <li><span className="text-gray-500">Upstroke</span> — Systole</li>
                  <li><span className="text-gray-500">Dicrotic notch</span> — Aortic valve closure</li>
                </>
              )}
            </ul>
          </div>
          <div>
            <span className="text-[#00e5ff] font-bold tracking-wider text-[8.5px]">CO</span>
            <ul className="mt-0.5 ml-2 space-y-0">
              {rhythmType === "VF" && <li className="text-red-400">No cardiac output</li>}
              {rhythmType === "VT" && <li className="text-red-400">Severely reduced CO</li>}
              {rhythmType === "AF" && <li className="text-amber-400">Reduced · Loss of atrial kick</li>}
              {(rhythmType !== "VF" && rhythmType !== "VT" && rhythmType !== "AF") && (
                <li><span className="text-gray-500">Stroke vol</span> — ~70 mL/beat</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Waveform panels ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 gap-1 px-2 pb-2 pt-1 min-h-0">
        <div className="flex-1 min-h-0">
          <WaveformCanvas
            data={ecgData}
            color={isLethal ? "#ff4040" : "#00ff41"}
            label="ECG II"
            value={hrDisplay}
            unit="bpm"
            minY={rhythmCfg.ecgMinY}
            maxY={rhythmCfg.ecgMaxY}
            windowSeconds={6}
          />
        </div>
        <div className="flex-1 min-h-0">
          <WaveformCanvas
            data={abpData}
            color="#ffd700"
            label="ABP"
            value={bpDisplay}
            unit={`(${mapDisplay})`}
            minY={rhythmCfg.abpMinY}
            maxY={rhythmCfg.abpMaxY}
            windowSeconds={6}
          />
        </div>
        <div className="flex-1 min-h-0">
          <WaveformCanvas
            data={coData}
            color="#00e5ff"
            label="CO"
            value={coDisplay}
            unit="L/min"
            minY={rhythmCfg.coMinY}
            maxY={rhythmCfg.coMaxY}
            windowSeconds={6}
          />
        </div>
      </div>
    </div>
  );
}
