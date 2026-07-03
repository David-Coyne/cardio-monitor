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

// Standard clinical 12-lead printout layout: 3 rows × 4 columns.
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

// Matches the main ECG II strip's loop scheme in WaveformCanvas.
const TOTAL_DURATION = 15000; // ms — full buffer loop
const WINDOW_SECONDS  = 3.4;  // visible seconds per lead cell

const MIN_Y = -1.6;
const MAX_Y = 1.6;

export function Lead12ECG({ hr, ischaemiaZone, color = "#00ff41", paused = false }: Lead12ECGProps) {
  const leads = useMemo(() => generate12LeadSnapshot(hr, ischaemiaZone), [hr, ischaemiaZone]);
  const canvasRefs  = useRef<Partial<Record<Lead12Name, HTMLCanvasElement | null>>>({});
  const pausedRef   = useRef(paused);
  const frozenAtRef = useRef<number | null>(null);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
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

    const render = (time: number) => {
      let elapsed: number;
      if (pausedRef.current) {
        if (frozenAtRef.current === null) frozenAtRef.current = time % TOTAL_DURATION;
        elapsed = frozenAtRef.current;
      } else {
        frozenAtRef.current = null;
        elapsed = time % TOTAL_DURATION;
      }
      const progress = elapsed / TOTAL_DURATION;

      for (const name of LEAD_GRID) {
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
        const sweepX = Math.floor(width / 2);

        const sampleAt = (x: number) => {
          const offset = Math.floor(((sweepX - x + width) % width) / width * samplesOnScreen);
          const idx    = (currentSampleIndex - offset + data.length) % data.length;
          const val    = data[idx];
          const norm   = (val - MIN_Y) / (MAX_Y - MIN_Y);
          return height - norm * height * 0.8 - height * 0.1;
        };

        const magnitude   = getLeadIschaemiaMagnitude(ischaemiaZone, name);
        const strokeColor = magnitude > 0.05 ? "#ffb347" : magnitude < -0.05 ? "#ff5f5f" : color;

        const drawSegment = (x0: number, x1: number, alpha: number, lw: number) => {
          ctx.save();
          ctx.strokeStyle = strokeColor;
          ctx.globalAlpha = alpha;
          ctx.lineWidth   = lw;
          ctx.lineJoin    = "round";
          ctx.lineCap     = "round";
          ctx.beginPath();
          for (let x = x0; x < sweepX; x++) {
            const y = sampleAt(x);
            if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.beginPath();
          for (let x = sweepX; x < x1; x++) {
            const y = sampleAt(x);
            if (x === sweepX) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.restore();
        };

        drawSegment(0, width, 0.18, 3);
        drawSegment(0, width, 1.0, 1.1);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resizeAll);
      cancelAnimationFrame(animationFrameId);
    };
  }, [leads, ischaemiaZone, color]);

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
