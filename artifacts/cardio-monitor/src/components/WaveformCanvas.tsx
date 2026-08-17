import { useEffect, useRef } from "react";

interface WaveformCanvasProps {
  data: number[];
  color: string;
  label: string;
  gridColor?: string;
  value: string;
  unit: string;
  minY?: number;
  maxY?: number;
  windowSeconds?: number;
  labelFontSize?: string;
  valueFontSize?: string;
  unitFontSize?: string;
  paused?: boolean;
}

// Real ECG paper speed: 25mm/s
// We show ~6 seconds of data at a time to match real monitor appearance
const TOTAL_DURATION = 15000; // 15-second loop in ms

export function WaveformCanvas({
  data,
  color,
  label,
  gridColor = "#001800",
  value,
  unit,
  minY = -1,
  maxY = 1,
  windowSeconds = 6,
  labelFontSize = "0.75rem",
  valueFontSize = "1.5rem",
  unitFontSize  = "0.75rem",
  paused = false,
}: WaveformCanvasProps) {
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const containerRef     = useRef<HTMLDivElement>(null);
  const pausedRef        = useRef(paused);
  const frozenAtRef      = useRef<number | null>(null);  // elapsed (data loop)
  const frozenRawTimeRef = useRef<number | null>(null);  // raw rAF time (sweep)
  const mountTimeRef     = useRef<number | null>(null);  // first-frame time (first-pass gate only)

  // Keep data/style behind refs so changes never restart the sweep loop.
  const dataRef  = useRef<number[]>(data);
  const colorRef = useRef(color);
  const minYRef  = useRef(minY);
  const maxYRef  = useRef(maxY);

  useEffect(() => { pausedRef.current = paused;  }, [paused]);
  useEffect(() => { dataRef.current   = data;    }, [data]);
  useEffect(() => { colorRef.current  = color;   }, [color]);
  useEffect(() => { minYRef.current   = minY;    }, [minY]);
  useEffect(() => { maxYRef.current   = maxY;    }, [maxY]);

  // Suppress unused-variable lint for gridColor (kept for API compat, no grid drawn)
  void gridColor;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset mount time and freeze state when the effect re-runs (windowSeconds change).
    mountTimeRef.current     = null;
    frozenAtRef.current      = null;
    frozenRawTimeRef.current = null;

    const resize = () => {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width  = Math.round(rect.width  * dpr);
        canvas.height = Math.round(rect.height * dpr);
      } else if (containerRef.current) {
        canvas.width  = containerRef.current.clientWidth  * dpr;
        canvas.height = containerRef.current.clientHeight * dpr;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let animationFrameId: number;

    const samplesOnScreen = Math.floor(data.length * (windowSeconds / 15));
    const windowMs = windowSeconds * 1000;

    const render = (time: number) => {
      // --- Separate data-loop time (elapsed) from sweep time (rawTime) ---
      // elapsed:  used for the 15-second data buffer (loops every TOTAL_DURATION)
      // rawTime:  used for the sweep position (monotonically increasing)
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

      const progress = elapsed / TOTAL_DURATION;

      const width  = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // === Sweeping write-head — absolute phase so all canvases share the same position ===
      // Using rawTime % windowMs (not relative to this canvas's birth time) means ECG,
      // ABP, and any other WaveformCanvas always have their write heads at the same x
      // coordinate on every frame, regardless of when they mounted.
      const sweepFraction = (rawTime % windowMs) / windowMs;
      const writeX        = Math.floor(sweepFraction * width);
      const eraserW       = 3;

      // --- First-pass gate (uses mount time, NOT sweep origin) ---
      // Tracks when this particular canvas first rendered so we can blank the
      // region ahead of the write head on the very first pass.
      if (mountTimeRef.current === null) mountTimeRef.current = rawTime;
      const elapsedSinceMount = rawTime - mountTimeRef.current;
      const firstPassComplete = elapsedSinceMount >= windowMs;
      const unwrittenFraction = firstPassComplete ? 0 : Math.max(0, 1 - elapsedSinceMount / windowMs);
      const unwrittenRegionSz = Math.ceil(unwrittenFraction * width);

      // true → this pixel should not be drawn (eraser gap OR not yet reached on first pass)
      const shouldSkip = (x: number): boolean => {
        if (((x - writeX + width) % width) < eraserW) return true;
        if (!firstPassComplete && ((x - writeX + width) % width) < unwrittenRegionSz) return true;
        return false;
      };

      const d = dataRef.current;
      const currentSampleIndex = Math.floor(progress * d.length);

      // Sample-by-sample rendering with quadratic bezier smoothing.
      const pixPerSample = width / samplesOnScreen;

      const drawSmooth = (alpha: number, lw: number) => {
        const runs: { x: number; y: number }[][] = [];
        let run:    { x: number; y: number }[]   = [];

        const cMin = minYRef.current;
        const cMax = maxYRef.current;

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

          const idx  = (currentSampleIndex - sOffset + d.length) % d.length;
          const norm = (d[idx] - cMin) / (cMax - cMin);
          const y    = height - norm * height * 0.85 - height * 0.075;
          run.push({ x, y });
        }
        if (run.length > 0) runs.push(run);

        ctx.save();
        ctx.strokeStyle = colorRef.current;
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

      drawSmooth(0.18, 5);
      drawSmooth(1.0,  1.8);

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [windowSeconds]); // color/minY/maxY/data changes are handled via refs — no sweep restart needed

  return (
    <div
      className="relative flex flex-col h-full rounded overflow-hidden"
      style={{ border: "1px solid rgba(0,80,0,0.25)" }}
      ref={containerRef}
      data-testid={`waveform-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <div
        className="absolute top-1.5 left-2 z-10 font-mono font-bold tracking-widest"
        style={{ color, fontSize: labelFontSize }}
      >
        {label}
      </div>
      <div
        className="absolute top-1 right-3 z-10 font-mono flex items-baseline gap-1"
        style={{ color }}
      >
        <span style={{ fontSize: valueFontSize, fontWeight: "bold", lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: unitFontSize, opacity: 0.8 }}>{unit}</span>
      </div>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
