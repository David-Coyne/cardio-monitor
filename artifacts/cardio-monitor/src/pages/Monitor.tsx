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

function useMonitorLayout() {
  const calc = () => {
    if (typeof window === "undefined") return { scale: 1, isLandscape: false, heartW: 158, heartH: 178 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isLandscape = vw > vh * 1.2;
    if (isLandscape) {
      const leftW = vw * 0.34;
      const bodyH = vh - 52 - 50; // header + rhythm row
      const s = Math.min(leftW * 0.75 / 158, bodyH * 0.72 / 178);
      return { scale: 1, isLandscape: true, heartW: Math.round(158 * s), heartH: Math.round(178 * s) };
    }
    return { scale: Math.min(vw / DESIGN_W, vh / DESIGN_H), isLandscape: false, heartW: 158, heartH: 178 };
  };
  const [layout, setLayout] = useState(calc);
  useEffect(() => {
    const onResize = () => setLayout(calc);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return layout;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Monitor() {
  const { scale, isLandscape, heartW, heartH } = useMonitorLayout();
  const [rhythmType, setRhythmType] = useState<RhythmType>("SR");
  const [hr, setHr] = useState(72);
  const [hrDraft, setHrDraft] = useState<string | null>(null);

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

  const commitHrDraft = () => {
    if (hrDraft !== null) {
      const n = parseInt(hrDraft, 10);
      if (!isNaN(n)) setHr(clampHR(n, rhythmCfg.hrMin, rhythmCfg.hrMax));
      setHrDraft(null);
    }
  };

  const handleHrStep = (delta: number) => {
    unlockAudio();
    setHrDraft(null);
    if (!isVF) setHr(h => clampHR(h + delta, rhythmCfg.hrMin, rhythmCfg.hrMax));
  };

  // Display helpers
  const hrDisplay  = isVF ? "---" : rhythmType === "AF" ? `~${hr}` : String(hr);
  const bpDisplay  = isVF ? "40/25" : `${liveBP.sys}/${liveBP.dia}`;
  const mapDisplay = isVF ? "29" : String(liveBP.map);
  const coDisplay  = liveCO.toFixed(1);

  // ── Shared sub-elements ─────────────────────────────────────────────────────

  const rhythmButtons = RHYTHM_CONFIGS.map(cfg => {
    const active = rhythmType === cfg.type;
    const danger = cfg.isLethal;
    const col    = danger ? "#ff5555" : "#00ff41";
    return (
      <button
        key={cfg.type}
        data-testid={`button-rhythm-${cfg.type.toLowerCase()}`}
        onClick={() => handleRhythmChange(cfg.type)}
        style={{
          flex: 1,
          fontSize: "clamp(0.5rem, 1vw, 0.8rem)",
          fontWeight: "bold",
          padding: "3px 0",
          borderRadius: "3px",
          letterSpacing: "0.05em",
          cursor: "pointer",
          transition: "all 0.15s",
          color:      active ? (danger ? "#ff2020" : "#00ff41") : (danger ? "rgba(255,85,85,0.5)" : "rgba(0,255,65,0.45)"),
          background: active ? (danger ? "rgba(255,32,32,0.12)" : "rgba(0,255,65,0.10)") : "transparent",
          border:     `1px solid ${active ? col : "rgba(80,80,80,0.2)"}`,
          boxShadow:  active && danger ? "0 0 6px rgba(255,32,32,0.3)" : "none",
        }}
      >
        {cfg.label}
      </button>
    );
  });

  const soundBtn = (
    <button
      data-testid="button-sound-toggle"
      onClick={() => { unlockAudio(); toggleMute(); }}
      style={{
        width: "clamp(38px, 5vw, 58px)",
        flexShrink: 0,
        fontSize: "clamp(0.45rem, 0.85vw, 0.7rem)",
        fontWeight: "bold",
        borderRadius: "3px",
        padding: "2px 0",
        letterSpacing: "0.05em",
        cursor: "pointer",
        lineHeight: 1.2,
        color:      muted ? "rgba(100,100,100,0.6)" : "rgba(0,255,65,0.75)",
        background: muted ? "transparent"           : "rgba(0,255,65,0.06)",
        border:     `1px solid ${muted ? "rgba(60,60,60,0.4)" : "rgba(0,255,65,0.25)"}`,
      }}
    >
      <div>SOUND</div>
      <div>{muted ? "OFF" : "ON"}</div>
    </button>
  );

  const setHrBox = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "clamp(3px,0.5vh,6px) clamp(8px,1.2vw,14px)", border: "1px solid rgba(0,255,65,0.25)", background: "rgba(0,255,65,0.04)", borderRadius: "4px", flexShrink: 0 }}>
      <span style={{ fontSize: "clamp(0.45rem,0.75vw,0.7rem)", letterSpacing: "0.15em", color: "#6b7280" }}>SET HR</span>
      <div style={{ display: "flex", alignItems: "center", gap: "clamp(4px,0.6vw,8px)" }}>
        <button data-testid="button-hr-decrease" onClick={() => handleHrStep(-1)} disabled={isVF}
          style={{ width: "clamp(18px,2.2vw,30px)", height: "clamp(18px,2.2vw,30px)", borderRadius: 3, fontWeight: "bold", fontSize: "clamp(0.65rem,1.2vw,1.1rem)", color: "#00ff41", background: "rgba(0,255,65,0.1)", border: "1px solid rgba(0,255,65,0.3)", cursor: isVF ? "default" : "pointer" }}>−</button>
        <input
          data-testid="input-heart-rate"
          type="number" min={rhythmCfg.hrMin} max={rhythmCfg.hrMax}
          value={isVF ? "" : (hrDraft !== null ? hrDraft : hr)}
          placeholder={isVF ? "---" : ""}
          disabled={isVF}
          onChange={e => setHrDraft(e.target.value)}
          onFocus={() => { if (!isVF) setHrDraft(String(hr)); }}
          onBlur={commitHrDraft}
          onKeyDown={e => { if (e.key === "Enter") { commitHrDraft(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") { setHrDraft(null); (e.target as HTMLInputElement).blur(); } }}
          style={{ width: "clamp(36px,4vw,56px)", textAlign: "center", fontSize: "clamp(0.85rem,1.5vw,1.4rem)", fontWeight: "bold", background: "transparent", outline: "none", color: "#00ff41", MozAppearance: "textfield" } as React.CSSProperties}
        />
        <button data-testid="button-hr-increase" onClick={() => handleHrStep(+1)} disabled={isVF}
          style={{ width: "clamp(18px,2.2vw,30px)", height: "clamp(18px,2.2vw,30px)", borderRadius: 3, fontWeight: "bold", fontSize: "clamp(0.65rem,1.2vw,1.1rem)", color: "#00ff41", background: "rgba(0,255,65,0.1)", border: "1px solid rgba(0,255,65,0.3)", cursor: isVF ? "default" : "pointer" }}>+</button>
      </div>
      <span style={{ fontSize: "clamp(0.42rem,0.7vw,0.62rem)", color: "#00ff41", opacity: 0.6, whiteSpace: "nowrap" }}>
        {isVF ? "N/A" : `${rhythmCfg.hrMin}–${rhythmCfg.hrMax} bpm`}
      </span>
    </div>
  );

  // ── Landscape layout (16:9 and wider) ───────────────────────────────────────

  if (isLandscape) {
    const vitalCol = (label: string, value: string, sub: string, color: string, minW = "auto") => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1, minWidth: minW }}>
        <span style={{ fontSize: "clamp(0.45rem,0.85vw,0.75rem)", color: "#6b7280", letterSpacing: "0.15em" }}>{label}</span>
        <span style={{ fontSize: "clamp(0.9rem,2.2vw,2rem)", fontWeight: "bold", color, display: "block", textAlign: "right" }}>{value}</span>
        <span style={{ fontSize: "clamp(0.4rem,0.7vw,0.65rem)", color, opacity: 0.65 }}>{sub}</span>
      </div>
    );

    return (
      <div data-testid="monitor-root" style={{ width: "100vw", height: "100dvh", display: "flex", flexDirection: "column", background: "#080c10", color: "white", fontFamily: "monospace", userSelect: "none", overflow: "hidden" }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "clamp(4px,0.6vh,8px) clamp(12px,1.5vw,24px)", borderBottom: `1px solid ${isLethal ? "rgba(255,60,60,0.4)" : "#0d2a0d"}`, flexShrink: 0, gap: "clamp(8px,1.5vw,20px)" }}>
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontSize: "clamp(0.7rem,1.4vw,1.5rem)", fontWeight: "bold", letterSpacing: "0.12em", color: isLethal ? "#ff4040" : "#00ff41", wordBreak: "break-word" }}>
              {rhythmCfg.fullName.toUpperCase()}
            </div>
          </div>
          {setHrBox()}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "clamp(2px,0.3vh,4px)", flexShrink: 0 }}>
            <div style={{
              fontSize: "clamp(0.55rem,1vw,0.85rem)", fontWeight: "bold", letterSpacing: "0.15em", padding: "2px 8px", borderRadius: 3,
              color: "#ff4040", background: isLethal ? "rgba(255,64,64,0.12)" : "transparent",
              border: `1px solid ${isLethal ? "rgba(255,64,64,0.4)" : "transparent"}`,
              visibility: isLethal ? "visible" : "hidden",
              animation: isLethal ? "pulse 1s infinite" : "none",
            }} data-testid="alarm-indicator">⚠ ALARM</div>
            <div style={{ display: "flex", gap: "clamp(10px,1.8vw,28px)", alignItems: "flex-end" }}>
              {vitalCol("HR",  hrDisplay,  "bpm",    isVF ? "#555" : "#00ff41", "clamp(2.2rem,4.5vw,5rem)")}
              {vitalCol("ABP", bpDisplay, `(${mapDisplay})`, "#ffd700", "clamp(4rem,8vw,9rem)")}
              {vitalCol("CO",  coDisplay,  "L/min",  "#00e5ff", "clamp(2rem,4vw,4.5rem)")}
            </div>
          </div>
        </header>

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

          {/* Left: heart + controls */}
          <div style={{ width: "34%", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #0d2a0d" }}>
            <div data-testid="heart-panel" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${isLethal ? "rgba(255,60,60,0.15)" : "transparent"}` }}>
              <HeartAnimation heartRate={isVF ? 300 : hr} rhythmType={rhythmType} svgWidth={heartW} svgHeight={heartH} />
            </div>
            <div style={{ display: "flex", gap: 4, padding: "8px 10px", borderTop: "1px solid #0d2a0d", flexShrink: 0, alignItems: "center" }}>
              {rhythmButtons}
              <div style={{ width: 1, alignSelf: "stretch", background: "#1a3a1a", margin: "0 2px" }} />
              {soundBtn}
            </div>
          </div>

          {/* Right: waveforms */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: "4px 12px 10px", minWidth: 0 }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <WaveformCanvas data={ecgData} color={isLethal ? "#ff4040" : "#00ff41"} label="ECG II" value={hrDisplay} unit="bpm" minY={rhythmCfg.ecgMinY} maxY={rhythmCfg.ecgMaxY} windowSeconds={6} labelFontSize="clamp(0.6rem,0.85vw,0.9rem)" valueFontSize="clamp(0.9rem,2vw,1.8rem)" unitFontSize="clamp(0.45rem,0.7vw,0.7rem)" />
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <WaveformCanvas data={abpData} color="#ffd700" label="ABP" value={bpDisplay} unit={`(${mapDisplay})`} minY={rhythmCfg.abpMinY} maxY={rhythmCfg.abpMaxY} windowSeconds={6} labelFontSize="clamp(0.6rem,0.85vw,0.9rem)" valueFontSize="clamp(0.9rem,2vw,1.8rem)" unitFontSize="clamp(0.45rem,0.7vw,0.7rem)" />
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <WaveformCanvas data={artData} color="#00e5ff" label="ART" value={bpDisplay} unit={`(${mapDisplay})`} minY={rhythmCfg.abpMinY} maxY={rhythmCfg.abpMaxY} windowSeconds={6} labelFontSize="clamp(0.6rem,0.85vw,0.9rem)" valueFontSize="clamp(0.9rem,2vw,1.8rem)" unitFontSize="clamp(0.45rem,0.7vw,0.7rem)" />
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ── Portrait layout ──────────────────────────────────────────────────────────

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
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <div
            className="text-[10px] font-bold tracking-widest"
            style={{ color: isLethal ? "#ff4040" : "#00ff41", wordBreak: "break-word" }}
          >
            {rhythmCfg.fullName.toUpperCase()}
          </div>
        </div>

        {/* ── HR input ────────────────────────────────────────────────────── */}
        <div
          className="flex flex-col items-center px-2 py-0.5 rounded"
          style={{
            border: "1px solid rgba(0,255,65,0.25)",
            background: "rgba(0,255,65,0.04)",
            width: "5.75rem",
            flexShrink: 0,
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
                color: "#00ff41",
                background: "rgba(0,255,65,0.1)",
                border: "1px solid rgba(0,255,65,0.3)",
              }}
            >−</button>
            <input
              data-testid="input-heart-rate"
              type="number"
              min={rhythmCfg.hrMin}
              max={rhythmCfg.hrMax}
              value={isVF ? "" : (hrDraft !== null ? hrDraft : hr)}
              placeholder={isVF ? "---" : ""}
              disabled={isVF}
              onChange={e => setHrDraft(e.target.value)}
              onFocus={() => { if (!isVF) setHrDraft(String(hr)); }}
              onBlur={commitHrDraft}
              onKeyDown={e => {
                if (e.key === "Enter") { commitHrDraft(); (e.target as HTMLInputElement).blur(); }
                if (e.key === "Escape") { setHrDraft(null); (e.target as HTMLInputElement).blur(); }
              }}
              className="w-11 text-center text-[14px] font-bold bg-transparent outline-none"
              style={{
                color: "#00ff41",
                MozAppearance: "textfield",
              } as React.CSSProperties}
            />
            <button
              data-testid="button-hr-increase"
              onClick={() => handleHrStep(+1)}
              disabled={isVF}
              className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center"
              style={{
                color: "#00ff41",
                background: "rgba(0,255,65,0.1)",
                border: "1px solid rgba(0,255,65,0.3)",
              }}
            >+</button>
          </div>
          <span className="text-[7px] opacity-60 mt-0.5 whitespace-nowrap" style={{ color: "#00ff41" }}>
            {isVF ? "N/A" : `${rhythmCfg.hrMin}–${rhythmCfg.hrMax} bpm`}
          </span>
        </div>

        {/* ── Vital signs + alarm ─────────────────────────────────────────── */}
        <div className="flex flex-col items-end gap-0.5" style={{ flexShrink: 0 }}>
          <div
            className="text-[9px] font-bold tracking-widest animate-pulse px-1.5 py-0.5 rounded"
            style={{
              color: "#ff4040",
              background: isLethal ? "rgba(255,64,64,0.12)" : "transparent",
              border: `1px solid ${isLethal ? "rgba(255,64,64,0.4)" : "transparent"}`,
              visibility: isLethal ? "visible" : "hidden",
            }}
            data-testid="alarm-indicator"
          >
            ⚠ ALARM
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex flex-col items-end leading-none" style={{ minWidth: "2.75rem" }}>
              <span className="text-[8px] text-gray-500 tracking-widest">HR</span>
              <span
                className="text-base font-bold"
                style={{ color: isVF ? "#555" : "#00ff41", display: "block", textAlign: "right" }}
                data-testid="text-hr-value"
              >
                {hrDisplay}
              </span>
              <span className="text-[7px] opacity-60" style={{ color: isVF ? "#555" : "#00ff41" }}>bpm</span>
            </div>
            <div className="flex flex-col items-end leading-none" style={{ minWidth: "3.75rem" }}>
              <span className="text-[8px] text-gray-500 tracking-widest">ABP</span>
              <span className="text-base font-bold text-[#ffd700]" data-testid="text-abp-value">
                {bpDisplay}
              </span>
              <span className="text-[7px] text-[#ffd700] opacity-60">({mapDisplay})</span>
            </div>
            <div className="flex flex-col items-end leading-none" style={{ minWidth: "1.875rem" }}>
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
            width: 44,
            flexShrink: 0,
            lineHeight: 1.2,
            color:      muted ? "rgba(100,100,100,0.6)" : "rgba(0,255,65,0.75)",
            background: muted ? "transparent"           : "rgba(0,255,65,0.06)",
            border:     `1px solid ${muted ? "rgba(60,60,60,0.4)" : "rgba(0,255,65,0.25)"}`,
          }}
        >
          <div>SOUND</div>
          <div>{muted ? "OFF" : "ON"}</div>
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
