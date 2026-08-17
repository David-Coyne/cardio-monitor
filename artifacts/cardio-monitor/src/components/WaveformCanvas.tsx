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
  const birthRawTimeRef  = useRef<number | null>(null);  // raw time on first frame
  // Keep data behind a ref so HR changes don't restart the sweep
  const dataRef          = useRef<number[]>(data);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset birth time whenever the effect re-runs (data change etc.)
    birthRawTimeRef.current  = null;
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

    const samplesOnScreen = Math.floor(dataRef.current.length * (windowSeconds / 15));
    const windowMs = windowSeconds * 1000;

    const render = (time: number) => {
      // --- Separate data-loop time (elapsed) from sweep time (rawTime) ---
      // elapsed:  used for the 15-second data buffer (loops every TOTAL_DURATION)
      // rawTime:  used for the sweep position (monotonically increasing, wraps every windowMs)
      //           Using raw rAF time prevents the jump-back glitch that happens when the
      //           15-second data loop resets while the sweep is mid-screen.
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

      // Record the very first frame's raw time so we know where the write head started.
      if (birthRawTimeRef.current === null) birthRawTimeRef.current = rawTime;
      const birthRawTime = birthRawTimeRef.current;

      const progress = elapsed / TOTAL_DURATION;

      const width  = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // === Sweeping write-head (left → right, wraps every windowSeconds) ===
      const sweepFraction = ((rawTime - birthRawTime) % windowMs) / windowMs;
      const writeX        = Math.floor(sweepFraction * width);
      const eraserW       = Math.max(20, Math.floor(width * 0.06));

      // --- First-pass gate ---
      // Until the write head has completed one full lap since birth, pixels ahead of
      // where the write head has reached are left blank (no prepopulation).
      const elapsedSinceBirth  = rawTime - birthRawTime;
      const firstPassComplete  = elapsedSinceBirth >= windowMs;
      const birthX             = Math.floor(((birthRawTime % windowMs) / windowMs) * width);
      // Fraction of the screen that remains unwritten on the first pass.
      const unwrittenFraction  = firstPassComplete ? 0 : Math.max(0, 1 - elapsedSinceBirth / windowMs);
      const unwrittenRegionSz  = Math.ceil(unwrittenFraction * width);

      // true → this pixel should not be drawn (eraser gap OR not yet reached on first pass)
      const shouldSkip = (x: number): boolean => {
        if (((x - writeX + width) % width) < eraserW) return true;
        if (!firstPassComplete && ((x - writeX + width) % width) < unwrittenRegionSz) return true;
        return false;
      };

      // suppress unused-var lint for birthX (used conceptually, not in formula)
      void birthX;

      const d = dataRef.current;
      const currentSampleIndex = Math.floor(progress * d.length);

      // Sample-by-sample rendering with quadratic bezier smoothing.
      // Avoids the staircase effect that occurs when samplesOnScreen < canvas width
      // (the old pixel loop assigned multiple pixels to the same sample → flat steps).
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

          const idx  = (currentSampleIndex - sOffset + d.length) % d.length;
          const norm = (d[idx] - minY) / (maxY - minY);
          const y    = height - norm * height * 0.85 - height * 0.075;
          run.push({ x, y });
        }
        if (run.length > 0) runs.push(run);

        ctx.save();
        ctx.strokeStyle = color;
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
  }, [color, gridColor, minY, maxY, windowSeconds]);

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
