import { useEffect, useMemo, useRef } from "react";
import {
  generate12LeadSnapshot,
  getLeadIschaemiaMagnitude,
  type IschaemiaZone,
  type Lead12Name,
} from "@/lib/rhythmGenerators";

interface Lead12ECGProps {
  hr: number;
  ischaemiaZone: IschaemiaZone;
  color?: string;
  paused?: boolean;
}

const LEAD_GRID: Lead12Name[] = [
  "I", "aVR", "V1", "V4",
  "II", "aVL", "V2", "V5",
  "III", "aVF", "V3", "V6",
];

const ZONE_LABEL: Record<Exclude<IschaemiaZone, "none">, string> = {
  anterior: "ANTERIOR STEMI · LAD",
  inferior: "INFERIOR STEMI · RCA",
  lateral:  "LATERAL STEMI · LCx",
};

const TOTAL_DURATION = 15000;
const WINDOW_SECONDS  = 3.4;
const MIN_Y = -1.6;
const MAX_Y =  1.6;

export function Lead12ECG({ hr, ischaemiaZone, color = "#00ff41", paused = false }: Lead12ECGProps) {
  const leads = useMemo(() => generate12LeadSnapshot(hr, ischaemiaZone), [hr, ischaemiaZone]);
  const canvasRefs       = useRef<Partial<Record<Lead12Name, HTMLCanvasElement | null>>>({});
  const pausedRef        = useRef(paused);
  const frozenAtRef      = useRef<number | null>(null);
  const frozenRawTimeRef = useRef<number | null>(null);
  const mountTimeRef     = useRef<number | null>(null);
  // Refs so HR / ischaemia changes don't restart the sweep
  const leadsRef         = useRef(leads);
  const ischaemiaRef     = useRef(ischaemiaZone);
  const hrRef            = useRef(hr);
  const colorRef         = useRef(color);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { leadsRef.current = leads; }, [leads]);
  useEffect(() => { ischaemiaRef.current = ischaemiaZone; }, [ischaemiaZone]);
  useEffect(() => { hrRef.current = hr; }, [hr]);
  useEffect(() => { colorRef.current = color; }, [color]);

  useEffect(() => {
    mountTimeRef.current     = null;
    frozenAtRef.current      = null;
    frozenRawTimeRef.current = null;

    let animationFrameId: number;

    const resizeAll = () => {
      const dpr = window.devicePixelRatio || 1;
      for (const name of LEAD_GRID) {
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
      // --- Separate data-loop time from sweep time (same pattern as WaveformCanvas) ---
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
        elapsed  = time % TOTAL_DURATION;
        rawTime  = time;
      }

      const progress = elapsed / TOTAL_DURATION;

      // Absolute sweep phase — shared with WaveformCanvas so all waveform channels
      // have their write heads at the same x position on every frame.
      const sweepFraction     = (rawTime % windowMs) / windowMs;
      if (mountTimeRef.current === null) mountTimeRef.current = rawTime;
      const elapsedSinceMount = rawTime - mountTimeRef.current;
      const firstPassComplete = elapsedSinceMount >= windowMs;
      const unwrittenFraction = firstPassComplete ? 0 : Math.max(0, 1 - elapsedSinceMount / windowMs);

      for (const name of LEAD_GRID) {
        const canvas = canvasRefs.current[name];
        const data   = leadsRef.current[name];
        if (!canvas || !data || data.length === 0) continue;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        const width  = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const samplesOnScreen    = Math.floor(data.length * (WINDOW_SECONDS / (TOTAL_DURATION / 1000)));
        const currentSampleIndex = Math.floor(progress * data.length);
        const writeX  = Math.floor(sweepFraction * width);
        const eraserW = Math.max(8, Math.floor(width * 0.06));
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

            // Detect wrap-around: x jumps backward by more than half the canvas width.
            if (run.length > 0 && x < run[run.length - 1].x - width / 2) {
              runs.push(run); run = [];
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
          ctx.lineJoin    = 'round';
          ctx.lineCap     = 'round';

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
        drawSmooth(1.0,  1.1);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resizeAll);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      className="relative flex flex-col h-full w-full rounded overflow-hidden"
      style={{ border: "1px solid rgba(0,80,0,0.25)", background: "#050a05" }}
      data-testid="lead12-ecg"
    >
      <div className="flex items-center justify-between px-2 pt-1" style={{ flexShrink: 0 }}>
        <span
          className="font-mono font-bold tracking-widest"
          style={{ color, fontSize: "clamp(0.5rem, 0.9vw, 0.75rem)" }}
        >
          12-LEAD ECG
        </span>
        {ischaemiaZone !== "none" && (
          <span
            className="font-mono font-bold"
            style={{ color: "rgba(255,190,60,0.9)", fontSize: "clamp(0.4rem, 0.72vw, 0.6rem)", letterSpacing: "0.04em" }}
          >
            {ZONE_LABEL[ischaemiaZone]}
          </span>
        )}
      </div>
      <div
        className="grid flex-1 gap-px p-1"
        style={{ gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(3, 1fr)", minHeight: 0 }}
      >
        {LEAD_GRID.map((name) => (
          <div
            key={name}
            className="relative"
            style={{ border: "1px solid rgba(0,60,0,0.35)", background: "rgba(0,10,0,0.4)" }}
          >
            <span
              className="absolute top-0 left-0.5 z-10 font-mono font-bold"
              style={{ color, fontSize: 6, lineHeight: 1.2 }}
            >
              {name}
            </span>
            <canvas
              ref={(el) => { canvasRefs.current[name] = el; }}
              className="w-full h-full block"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
