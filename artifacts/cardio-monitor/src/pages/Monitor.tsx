import { useMemo, useState, useEffect, useRef } from "react";
import { WaveformCanvas } from "@/components/WaveformCanvas";
import { HeartAnimation } from "@/components/HeartAnimation";
import {
  type RhythmType,
  RHYTHM_CONFIGS,
  generateWaveforms,
} from "@/lib/rhythmGenerators";
import { useHeartSound } from "@/hooks/useHeartSound";

// ── Helpers ───────────────────────────────────────────────────────────────────

const clampHR = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(v)));

const DESIGN_W = 390;
const DESIGN_H = 844;

function useMonitorScale() {
  const calc = () =>
    typeof window === "undefined"
      ? 1
      : Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const onResize = () => setScale(calc);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return scale;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Monitor() {
  const scale = useMonitorScale();
  const [rhythmType, setRhythmType] = useState<RhythmType>("SR");
  const [hr, setHr] = useState(72);

  const rhythmCfg = RHYTHM_CONFIGS.find(r => r.type === rhythmType)!;
  const isVF      = rhythmType === "VF";
  const isLethal  = rhythmCfg.isLethal;

  const { playS1, playS2, muted, toggleMute, unlockAudio } = useHeartSound();

  // Stable refs so the rAF loop always sees the latest sound functions + rhythm
  const playS1Ref    = useRef(playS1);
  const playS2Ref    = useRef(playS2);
  const rhythmRef    = useRef(rhythmType);
  useEffect(() => { playS1Ref.current    = playS1;    }, [playS1]);
  useEffect(() => { playS2Ref.current    = playS2;    }, [playS2]);
  useEffect(() => { rhythmRef.current    = rhythmType; }, [rhythmType]);

  // Regenerate waveform buffer when HR or rhythm changes
  const { ecgData, abpData, artData, coData, beatSamples, beatSysArr, beatDiaArr, beatCOArr } =
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

  // Single rAF loop — updates readouts once per beat + triggers sounds
  useEffect(() => {
    let rafId: number;
    let lastBeat = -1;
    let s2Played = false;

    const tick = () => {
      const now    = performance.now();
      const sample = ((now % 15000) / 15000) * 900;
      const bs     = beatSamplesRef.current;
      const b      = Math.min(Math.floor(sample / bs), beatSysRef.current.length - 1);
      const phase  = (sample - b * bs) / bs;         // 0–1 within current beat
      const rhythm = rhythmRef.current;

      // ── Beat-start: update vitals + play S1 ─────────────────────────────
      if (b !== lastBeat) {
        lastBeat = b;
        s2Played = false;
        const sys = Math.round(beatSysRef.current[b]);
        const dia = Math.round(beatDiaRef.current[b]);
        const map = Math.round(dia + (sys - dia) / 3);
        setLiveBP({ sys, dia, map });
        setLiveCO(parseFloat(beatCORef.current[b].toFixed(1)));
        // S1 on every organised beat (not VF — no organised beat)
        if (rhythm !== "VF") playS1Ref.current();
      }

      // ── Mid-beat: S2 at end of systole (~phase 0.38) ────────────────────
      if (rhythm !== "VF" && phase >= 0.38 && !s2Played) {
        s2Played = true;
        playS2Ref.current();
      }


      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ── Rhythm selection ────────────────────────────────────────────────────────

  const handleRhythmChange = (type: RhythmType) => {
    unlockAudio();
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

  const handleHrStep = (delta: number) => {
    unlockAudio();
    if (!isVF) setHr(h => clampHR(h + delta, rhythmCfg.hrMin, rhythmCfg.hrMax));
  };

  // Display helpers
  const hrDisplay  = isVF ? "---" : rhythmType === "AF" ? `~${hr}` : String(hr);
  const bpDisplay  = isVF ? "40/25" : `${liveBP.sys}/${liveBP.dia}`;
  const mapDisplay = isVF ? "29" : String(liveBP.map);
  const coDisplay  = liveCO.toFixed(1);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: "100vw", height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#080c10", overflow: "hidden" }}>
    <div
      className="flex flex-col bg-[#080c10] text-white font-mono select-none overflow-hidden"
      style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: "center center", flexShrink: 0 }}
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
              onClick={() => handleHrStep(-1)}
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
              onClick={() => handleHrStep(+1)}
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
          </div>
        </div>
      </header>

      {/* ── Rhythm selector + sound toggle ──────────────────────────────────── */}
      <div
        className="flex gap-1 px-2 py-1 items-center"
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

        {/* Thin divider */}
        <div style={{ width: 1, alignSelf: "stretch", background: "#1a3a1a", margin: "2px 1px" }} />

        {/* Sound on/off toggle */}
        <button
          data-testid="button-sound-toggle"
          onClick={() => { unlockAudio(); toggleMute(); }}
          title={muted ? "Sound off — click to enable" : "Sound on — click to mute"}
          className="text-[8px] font-bold rounded py-0.5 tracking-wider transition-all"
          style={{
            width: 34,
            flexShrink: 0,
            color:      muted ? "rgba(100,100,100,0.6)" : "rgba(0,255,65,0.75)",
            background: muted ? "transparent"           : "rgba(0,255,65,0.06)",
            border:     `1px solid ${muted ? "rgba(60,60,60,0.4)" : "rgba(0,255,65,0.25)"}`,
          }}
        >
          {muted ? "SND\nOFF" : "SND\nON"}
        </button>
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
            data={artData}
            color="#00e5ff"
            label="ART"
            value={bpDisplay}
            unit={`(${mapDisplay})`}
            minY={rhythmCfg.abpMinY}
            maxY={rhythmCfg.abpMaxY}
            windowSeconds={6}
          />
        </div>
      </div>
    </div>
    </div>
  );
}
