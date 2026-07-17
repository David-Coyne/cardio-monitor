import { useEffect, useRef } from "react";

interface WaveformCanvasProps {
  data: number[];
  color: string;
  beatColor?: string | null;
  beatPalette?: readonly string[] | null;
  beatSamples?: number;
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
  beatColor,
  beatPalette,
  beatSamples,
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
  const activeColorRef   = useRef<string>(beatColor ?? color);
  const beatPaletteRef   = useRef<readonly string[] | null>(beatPalette ?? null);
  const beatSamplesRef   = useRef<number>(beatSamples ?? 0);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { activeColorRef.current = beatColor ?? color; }, [beatColor, color]);
  useEffect(() => { beatPaletteRef.current = beatPalette ?? null; }, [beatPalette]);
  useEffect(() => { beatSamplesRef.current = beatSamples ?? 0; }, [beatSamples]);

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

    const samplesOnScreen = Math.floor(data.length * (windowSeconds / 15));
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
      const sweepFraction = (rawTime % windowMs) / windowMs;
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

      const currentSampleIndex = Math.floor(progress * data.length);

      // Maps each canvas x-pixel back to its data-buffer sample position.
      const sampleAt = (x: number): number => {
        const offset = Math.floor(((writeX - x + width) % width) / width * samplesOnScreen);
        const idx    = (currentSampleIndex - offset + data.length) % data.length;
        const val    = data[idx];
        const norm   = (val - minY) / (maxY - minY);
        return height - norm * height * 0.85 - height * 0.075;
      };

      const pal = beatPaletteRef.current;
      const bs  = beatSamplesRef.current;

      if (pal && pal.length > 0 && bs > 0) {
        // === Per-beat colouring ===
        const drawBeatColoured = (alpha: number, lw: number) => {
          let segStart  = -1;
          let segColour = '';

          const flush = (xEnd: number) => {
            if (segStart < 0 || xEnd <= segStart) return;
            ctx.save();
            ctx.strokeStyle = segColour;
            ctx.globalAlpha = alpha;
            ctx.lineWidth   = lw;
            ctx.lineJoin    = 'round';
            ctx.lineCap     = 'round';
            ctx.beginPath();
            for (let x = segStart; x < xEnd; x++) {
              const y = sampleAt(x);
              if (x === segStart) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
            segStart  = -1;
            segColour = '';
          };

          for (let x = 0; x < width; x++) {
            if (shouldSkip(x)) { flush(x); continue; }
            const offset = Math.floor(((writeX - x + width) % width) / width * samplesOnScreen);
            const sIdx   = (currentSampleIndex - offset + data.length) % data.length;
            const beatN  = Math.floor(sIdx / bs);
            const col    = pal[((beatN % pal.length) + pal.length) % pal.length];
            if (col !== segColour || segStart < 0) { flush(x); segStart = x; segColour = col; }
          }
          flush(width);
        };

        drawBeatColoured(0.18, 5);   // glow first
        drawBeatColoured(1.0,  1.8); // main on top

      } else {
        // === Single-colour draw ===
        const drawSingleColour = (alpha: number, lw: number) => {
          ctx.save();
          ctx.strokeStyle = activeColorRef.current;
          ctx.globalAlpha = alpha;
          ctx.lineWidth   = lw;
          ctx.lineJoin    = 'round';
          ctx.lineCap     = 'round';
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

        drawSingleColour(0.18, 5);
        drawSingleColour(1.0,  1.8);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [data, color, gridColor, minY, maxY, windowSeconds]);

  return (
    <div
      className="relative flex flex-col h-full rounded overflow-hidden"
      style={{ border: "1px solid rgba(0,80,0,0.25)" }}
      ref={containerRef}
      data-testid={`waveform-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <div
        className="absolute top-1.5 left-2 z-10 font-mono font-bold tracking-widest"
        style={{ color: beatColor ?? color, fontSize: labelFontSize, transition: "color 0.3s" }}
      >
        {label}
      </div>
      <div
        className="absolute top-1 right-3 z-10 font-mono flex items-baseline gap-1"
        style={{ color: beatColor ?? color, transition: "color 0.3s" }}
      >
        <span style={{ fontSize: valueFontSize, fontWeight: "bold", lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: unitFontSize, opacity: 0.8 }}>{unit}</span>
      </div>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
