import { useEffect, useMemo, useRef, useState } from "react";
import { MonitorDropdown } from "./MonitorDropdown";
import {
  generate12LeadSnapshot,
  getLeadIschaemiaMagnitude,
  type IschaemiaZone,
  type Lead12Name,
} from "@/lib/rhythmGenerators";

interface Lead3ECGProps {
  hr: number;
  ischaemiaZone: IschaemiaZone;
  color?: string;
  paused?: boolean;
}

// ── Preset lead groups ────────────────────────────────────────────────────────
const PRESETS: { short: string; leads: Lead12Name[] }[] = [
  { short: "I",     leads: ["I"]                  },
  { short: "II",    leads: ["II"]                 },
  { short: "III",   leads: ["III"]                },
  { short: "aVx",   leads: ["aVR", "aVL", "aVF"] },
  { short: "V1–3",  leads: ["V1",  "V2",  "V3"]  },
  { short: "V4–6",  leads: ["V4",  "V5",  "V6"]  },
  { short: "INF",   leads: ["II",  "III", "aVF"] },
  { short: "LAT",   leads: ["I",   "aVL", "V5"]  },
];

const ZONE_LABEL: Record<Exclude<IschaemiaZone, "none">, string> = {
  anterior: "ANT · LAD",
  inferior: "INF · RCA",
  lateral:  "LAT · LCx",
};

const TOTAL_DURATION = 15000;
const WINDOW_SECONDS  = 5.0;
const MIN_Y = -1.6;
const MAX_Y =  1.6;

export function Lead3ECG({
  hr,
  ischaemiaZone,
  color = "#00ff41",
  paused = false,
}: Lead3ECGProps) {
  const leads = useMemo(
    () => generate12LeadSnapshot(hr, ischaemiaZone),
    [hr, ischaemiaZone],
  );

  const [presetIdx, setPresetIdx] = useState(0);
  const activeLeads = PRESETS[presetIdx].leads;

  const canvasRefs       = useRef<Partial<Record<Lead12Name, HTMLCanvasElement | null>>>({});
  const pausedRef        = useRef(paused);
  const frozenAtRef      = useRef<number | null>(null);
  const frozenRawTimeRef = useRef<number | null>(null);
  const birthRawTimeRef  = useRef<number | null>(null);
  // Live-update refs — changes here never restart the sweep
  const leadsRef         = useRef(leads);
  const ischaemiaRef     = useRef(ischaemiaZone);
  const hrRef            = useRef(hr);
  const colorRef         = useRef(color);
  const activeLeadsRef   = useRef(activeLeads);

  useEffect(() => { pausedRef.current       = paused;           }, [paused]);
  useEffect(() => { leadsRef.current        = leads;            }, [leads]);
  useEffect(() => { ischaemiaRef.current    = ischaemiaZone;   }, [ischaemiaZone]);
  useEffect(() => { hrRef.current           = hr;              }, [hr]);
  useEffect(() => { colorRef.current        = color;           }, [color]);
  useEffect(() => { activeLeadsRef.current  = activeLeads;     }, [activeLeads]);

  // When preset changes, wait one rAF for React to mount the new canvases, then size them
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      for (const name of activeLeadsRef.current) {
        const canvas = canvasRefs.current[name];
        if (!canvas) continue;
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvas.width  = Math.round(rect.width  * dpr);
          canvas.height = Math.round(rect.height * dpr);
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [presetIdx]);

  // ── Single long-lived animation loop ─────────────────────────────────────────
  useEffect(() => {
    birthRawTimeRef.current  = null;
    frozenAtRef.current      = null;
    frozenRawTimeRef.current = null;

    let animationFrameId: number;

    const resizeAll = () => {
      const dpr = window.devicePixelRatio || 1;
      for (const name of activeLeadsRef.current) {
        const canvas = canvasRefs.current[name];
        if (!canvas) continue;
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvas.width  = Math.round(rect.width  * dpr);
          canvas.height = Math.round(rect.height * dpr);
        }
      }
    };
    resizeAll();
    window.addEventListener("resize", resizeAll);

    const windowMs = WINDOW_SECONDS * 1000;

    const render = (time: number) => {
      let elapsed: number;
      let rawTime: number;

      if (pausedRef.current) {
        if (frozenAtRef.current === null) {
          frozenAtRef.current      = time % TOTAL_DURATION;
          frozenRawTimeRef.current = time;
        }
        elapsed = frozenAtRef.current;
        rawTime = frozenRawTimeRef.current!;
      } else {
        frozenAtRef.current      = null;
        frozenRawTimeRef.current = null;
        elapsed = time % TOTAL_DURATION;
        rawTime = time;
      }

      if (birthRawTimeRef.current === null) birthRawTimeRef.current = rawTime;
      const birthRawTime = birthRawTimeRef.current;
      const progress     = elapsed / TOTAL_DURATION;

      const sweepFraction     = ((rawTime - birthRawTime) % windowMs) / windowMs;
      const elapsedSinceBirth = rawTime - birthRawTime;
      const firstPassComplete = elapsedSinceBirth >= windowMs;
      const unwrittenFraction = firstPassComplete ? 0 : Math.max(0, 1 - elapsedSinceBirth / windowMs);

      for (const name of activeLeadsRef.current) {
        const canvas = canvasRefs.current[name];
        const data   = leadsRef.current[name];
        if (!canvas || !data || data.length === 0 || canvas.width === 0) continue;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        const width  = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const samplesOnScreen    = Math.floor(data.length * (WINDOW_SECONDS / (TOTAL_DURATION / 1000)));
        const currentSampleIndex = Math.floor(progress * data.length);
        const writeX  = Math.floor(sweepFraction * width);
        const eraserW = Math.max(8, Math.floor(width * 0.04));
        const unwrittenRegionSz = Math.ceil(unwrittenFraction * width);

        const shouldSkip = (x: number): boolean => {
          if (((x - writeX + width) % width) < eraserW) return true;
          if (!firstPassComplete && ((x - writeX + width) % width) < unwrittenRegionSz) return true;
          return false;
        };

        const magnitude    = getLeadIschaemiaMagnitude(ischaemiaRef.current, name);
        const hasIschaemia = Math.abs(magnitude) > 0.05;
        const strokeColor  = hasIschaemia
          ? (magnitude > 0.05 ? "#ffb347" : "#ff5f5f")
          : colorRef.current;

        const pixPerSample = width / samplesOnScreen;

        const drawSmooth = (alpha: number, lw: number) => {
          const runs: { x: number; y: number }[][] = [];
          let run:    { x: number; y: number }[]   = [];

          for (let s = 0; s < samplesOnScreen; s++) {
            const sOffset = samplesOnScreen - 1 - s;
            const x       = ((writeX - sOffset * pixPerSample) % width + width) % width;
            const xInt    = Math.min(Math.round(x), width - 1);

            if (shouldSkip(xInt)) {
              if (run.length > 0) { runs.push(run); run = []; }
              continue;
            }

            const idx  = (currentSampleIndex - sOffset + data.length) % data.length;
            const norm = (data[idx] - MIN_Y) / (MAX_Y - MIN_Y);
            const y    = height - norm * height * 0.8 - height * 0.1;
            run.push({ x, y });
          }
          if (run.length > 0) runs.push(run);

          ctx.save();
          ctx.strokeStyle = strokeColor;
          ctx.globalAlpha = alpha;
          ctx.lineWidth   = lw;
          ctx.lineJoin    = "round";
          ctx.lineCap     = "round";

          for (const pts of runs) {
            if (pts.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length - 1; i++) {
              const midX = (pts[i].x + pts[i + 1].x) / 2;
              const midY = (pts[i].y + pts[i + 1].y) / 2;
              ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
            }
            ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            ctx.stroke();
          }
          ctx.restore();
        };

        drawSmooth(0.18, 3);
        drawSmooth(1.0,  1.4);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resizeAll);
      cancelAnimationFrame(animationFrameId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative flex flex-col h-full w-full rounded overflow-hidden"
      style={{ border: "1px solid rgba(0,80,0,0.25)", background: "#050a05" }}
      data-testid="lead3-ecg"
    >
      {/* Header: title · segmented toggle · ischaemia badge */}
      <div
        className="flex items-center gap-2 px-2 pt-1 pb-0.5"
        style={{ flexShrink: 0 }}
      >
        <span
          className="font-mono font-bold tracking-widest"
          style={{ color, fontSize: "clamp(0.46rem, 0.82vw, 0.7rem)", flexShrink: 0 }}
        >
          3-LEAD
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <MonitorDropdown
            options={PRESETS.map((p, i) => ({ value: String(i), label: p.short }))}
            value={String(presetIdx)}
            onChange={v => setPresetIdx(Number(v))}
            color={color}
          />
        </div>

        {ischaemiaZone !== "none" && (
          <span
            className="font-mono font-bold"
            style={{
              color: "rgba(255,190,60,0.9)",
              fontSize: "clamp(0.37rem, 0.62vw, 0.54rem)",
              letterSpacing: "0.04em",
              flexShrink: 0,
            }}
          >
            {ZONE_LABEL[ischaemiaZone]}
          </span>
        )}
      </div>

      {/* 1 column × N rows — 1 row for single-lead presets, 3 for groups */}
      <div
        className="grid flex-1 gap-px p-1"
        style={{
          gridTemplateColumns: "1fr",
          gridTemplateRows: `repeat(${activeLeads.length}, 1fr)`,
          minHeight: 0,
        }}
      >
        {activeLeads.map((name) => {
          const mag      = getLeadIschaemiaMagnitude(ischaemiaZone, name);
          const hasIsc   = Math.abs(mag) > 0.05;
          const labelCol = hasIsc ? (mag > 0.05 ? "#ffb347" : "#ff5f5f") : color;
          return (
            <div
              key={name}
              className="relative"
              style={{
                border: `1px solid ${hasIsc ? (mag > 0.05 ? "rgba(255,179,71,0.35)" : "rgba(255,95,95,0.35)") : "rgba(0,60,0,0.35)"}`,
                background: "rgba(0,10,0,0.4)",
              }}
            >
              <span
                className="absolute top-0.5 left-1 z-10 font-mono font-bold"
                style={{ color: labelCol, fontSize: "clamp(0.52rem, 0.88vw, 0.78rem)", lineHeight: 1.2 }}
              >
                {name}
              </span>
              <canvas
                ref={(el) => { canvasRefs.current[name] = el; }}
                className="w-full h-full block"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
