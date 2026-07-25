import { useEffect, useMemo, useRef } from "react";
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
  beatPalette?: readonly string[] | null;
  beatSamples?: number;
}

const LEAD_3: Lead12Name[] = ["I", "II", "III"];

const ZONE_LABEL: Record<Exclude<IschaemiaZone, "none">, string> = {
  anterior: "ANTERIOR STEMI · LAD",
  inferior: "INFERIOR STEMI · RCA",
  lateral:  "LATERAL STEMI · LCx",
};

const TOTAL_DURATION = 15000;
const WINDOW_SECONDS  = 5.0;   // wider per-lead window vs. 12-lead (3.4 s)
const MIN_Y = -1.6;
const MAX_Y =  1.6;

export function Lead3ECG({
  hr,
  ischaemiaZone,
  color = "#00ff41",
  paused = false,
  beatPalette,
  beatSamples: beatSamplesProp,
}: Lead3ECGProps) {
  const leads = useMemo(
    () => generate12LeadSnapshot(hr, ischaemiaZone),
    [hr, ischaemiaZone],
  );

  const canvasRefs       = useRef<Partial<Record<Lead12Name, HTMLCanvasElement | null>>>({});
  const pausedRef        = useRef(paused);
  const frozenAtRef      = useRef<number | null>(null);
  const frozenRawTimeRef = useRef<number | null>(null);
  const birthRawTimeRef  = useRef<number | null>(null);
  const beatPaletteRef   = useRef<readonly string[] | null>(beatPalette ?? null);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { beatPaletteRef.current = beatPalette ?? null; }, [beatPalette]);

  useEffect(() => {
    birthRawTimeRef.current  = null;
    frozenAtRef.current      = null;
    frozenRawTimeRef.current = null;

    let animationFrameId: number;

    const resizeAll = () => {
      const dpr = window.devicePixelRatio || 1;
      for (const name of LEAD_3) {
        const canvas = canvasRefs.current[name];
        if (!canvas) continue;
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvas.width  = Math.round(rect.width * dpr);
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

      const progress = elapsed / TOTAL_DURATION;

      const sweepFraction     = ((rawTime - birthRawTime) % windowMs) / windowMs;
      const elapsedSinceBirth = rawTime - birthRawTime;
      const firstPassComplete = elapsedSinceBirth >= windowMs;
      const unwrittenFraction = firstPassComplete ? 0 : Math.max(0, 1 - elapsedSinceBirth / windowMs);

      for (const name of LEAD_3) {
        const canvas = canvasRefs.current[name];
        const data   = leads[name];
        if (!canvas || !data || data.length === 0) continue;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        const width  = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const samplesOnScreen    = Math.floor(data.length * (WINDOW_SECONDS / (TOTAL_DURATION / 1000)));
        const currentSampleIndex = Math.floor(progress * data.length);
        const beatSamples        = beatSamplesProp ?? Math.round(data.length / Math.max(1, Math.round(hr * (TOTAL_DURATION / 1000) / 60)));

        const writeX  = Math.floor(sweepFraction * width);
        const eraserW = Math.max(8, Math.floor(width * 0.04));
        const unwrittenRegionSz = Math.ceil(unwrittenFraction * width);

        const shouldSkip = (x: number): boolean => {
          if (((x - writeX + width) % width) < eraserW) return true;
          if (!firstPassComplete && ((x - writeX + width) % width) < unwrittenRegionSz) return true;
          return false;
        };

        const sampleAt = (x: number): number => {
          const offset = Math.floor(((writeX - x + width) % width) / width * samplesOnScreen);
          const idx    = (currentSampleIndex - offset + data.length) % data.length;
          const val    = data[idx];
          const norm   = (val - MIN_Y) / (MAX_Y - MIN_Y);
          return height - norm * height * 0.8 - height * 0.1;
        };

        const magnitude    = getLeadIschaemiaMagnitude(ischaemiaZone, name);
        const hasIschaemia = Math.abs(magnitude) > 0.05;
        const strokeColor  = hasIschaemia
          ? (magnitude > 0.05 ? "#ffb347" : "#ff5f5f")
          : color;

        const pal = beatPaletteRef.current;

        if (pal && pal.length > 0 && !hasIschaemia) {
          // Per-beat colouring
          const drawBeatColoured = (alpha: number, lw: number) => {
            let segStart  = -1;
            let segColour = "";

            const flush = (xEnd: number) => {
              if (segStart < 0 || xEnd <= segStart) return;
              ctx.save();
              ctx.strokeStyle = segColour;
              ctx.globalAlpha = alpha;
              ctx.lineWidth   = lw;
              ctx.lineJoin    = "round";
              ctx.lineCap     = "round";
              ctx.beginPath();
              for (let x = segStart; x < xEnd; x++) {
                const y = sampleAt(x);
                if (x === segStart) ctx.moveTo(x, y); else ctx.lineTo(x, y);
              }
              ctx.stroke();
              ctx.restore();
              segStart  = -1;
              segColour = "";
            };

            for (let x = 0; x < width; x++) {
              if (shouldSkip(x)) { flush(x); continue; }
              const offset = Math.floor(((writeX - x + width) % width) / width * samplesOnScreen);
              const sIdx   = (currentSampleIndex - offset + data.length) % data.length;
              const beatN  = Math.floor(sIdx / beatSamples);
              const col    = pal[((beatN % pal.length) + pal.length) % pal.length];
              if (col !== segColour || segStart < 0) { flush(x); segStart = x; segColour = col; }
            }
            flush(width);
          };

          drawBeatColoured(0.18, 3);
          drawBeatColoured(1.0,  1.4);

        } else {
          // Single-colour draw
          const drawSingleColour = (alpha: number, lw: number) => {
            ctx.save();
            ctx.strokeStyle = strokeColor;
            ctx.globalAlpha = alpha;
            ctx.lineWidth   = lw;
            ctx.lineJoin    = "round";
            ctx.lineCap     = "round";
            let segStart = -1;

            const flush = (xEnd: number) => {
              if (segStart < 0 || xEnd <= segStart) return;
              ctx.beginPath();
              for (let x = segStart; x < xEnd; x++) {
                const y = sampleAt(x);
                if (x === segStart) ctx.moveTo(x, y); else ctx.lineTo(x, y);
              }
              ctx.stroke();
              segStart = -1;
            };

            for (let x = 0; x < width; x++) {
              if (shouldSkip(x)) { flush(x); continue; }
              if (segStart < 0) segStart = x;
            }
            flush(width);
            ctx.restore();
          };

          drawSingleColour(0.18, 3);
          drawSingleColour(1.0,  1.4);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resizeAll);
      cancelAnimationFrame(animationFrameId);
    };
  }, [leads, ischaemiaZone, color, hr]);

  return (
    <div
      className="relative flex flex-col h-full w-full rounded overflow-hidden"
      style={{ border: "1px solid rgba(0,80,0,0.25)", background: "#050a05" }}
      data-testid="lead3-ecg"
    >
      <div className="flex items-center justify-between px-2 pt-1" style={{ flexShrink: 0 }}>
        <span
          className="font-mono font-bold tracking-widest"
          style={{ color, fontSize: "clamp(0.5rem, 0.9vw, 0.75rem)" }}
        >
          3-LEAD ECG
        </span>
        {ischaemiaZone !== "none" && (
          <span
            className="font-mono font-bold"
            style={{
              color: "rgba(255,190,60,0.9)",
              fontSize: "clamp(0.4rem, 0.72vw, 0.6rem)",
              letterSpacing: "0.04em",
            }}
          >
            {ZONE_LABEL[ischaemiaZone]}
          </span>
        )}
      </div>

      {/* 1 column × 3 rows — each lead gets 1/3 of the height */}
      <div
        className="grid flex-1 gap-px p-1"
        style={{
          gridTemplateColumns: "1fr",
          gridTemplateRows: "repeat(3, 1fr)",
          minHeight: 0,
        }}
      >
        {LEAD_3.map((name) => {
          const mag    = getLeadIschaemiaMagnitude(ischaemiaZone, name);
          const hasIsc = Math.abs(mag) > 0.05;
          const labelColor = hasIsc
            ? (mag > 0.05 ? "#ffb347" : "#ff5f5f")
            : color;
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
                style={{ color: labelColor, fontSize: "clamp(0.55rem, 0.9vw, 0.8rem)", lineHeight: 1.2 }}
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
