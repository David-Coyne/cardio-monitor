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
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    // Number of samples visible on screen at once (out of 900 total for 15s)
    // windowSeconds=6 means we show 6/15 = 40% of the buffer at a time
    // This gives real-time 25mm/s-like scroll speed
    const samplesOnScreen = Math.floor(data.length * (windowSeconds / 15));

    const render = (time: number) => {
      // Use global performance.now() time for sync across all canvases
      const elapsed = time % TOTAL_DURATION;
      const progress = elapsed / TOTAL_DURATION;

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);


      // === Draw waveform ===
      // Current head of the trace (rightmost visible sample)
      const currentSampleIndex = Math.floor(progress * data.length);

      // Sweep cursor is fixed at the horizontal centre of the canvas.
      // Left half:  newest data flows left from the cursor.
      // Right half: older data (previous pass) continues from where the left half began.
      // This eliminates the drifting gap and keeps the write-head always centred.
      const sweepX = Math.floor(width / 2);

      const sampleAt = (x: number) => {
        // Map each pixel to a buffer position using the centred-sweep formula.
        // Pixels just left of sweepX → offset 0 (newest).
        // Pixels just right of sweepX → offset ≈ samplesOnScreen (oldest).
        const offset = Math.floor(((sweepX - x + width) % width) / width * samplesOnScreen);
        const idx    = (currentSampleIndex - offset + data.length) % data.length;
        const val    = data[idx];
        const norm   = (val - minY) / (maxY - minY);
        return height - norm * height * 0.85 - height * 0.075;
      };

      const drawSegment = (x0: number, x1: number, alpha: number, lw: number) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha  = alpha;
        ctx.lineWidth    = lw;
        ctx.lineJoin     = "round";
        ctx.lineCap      = "round";
        // Left segment
        ctx.beginPath();
        for (let x = x0; x < sweepX; x++) {
          const y = sampleAt(x);
          if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // Right segment (separate path — no line crossing the gap)
        ctx.beginPath();
        for (let x = sweepX; x < x1; x++) {
          const y = sampleAt(x);
          if (x === sweepX) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      };

      // Glow pass
      drawSegment(0, width, 0.18, 5);
      // Main trace
      drawSegment(0, width, 1.0, 1.8);

      // Dark gap centred at sweepX — covers the age discontinuity between segments
      const gapHalf = Math.max(6, width * 0.014);
      const glL = ctx.createLinearGradient(sweepX - gapHalf * 2, 0, sweepX, 0);
      glL.addColorStop(0, "rgba(8,12,16,0)");
      glL.addColorStop(1, "rgba(8,12,16,0.97)");
      ctx.fillStyle = glL;
      ctx.fillRect(sweepX - gapHalf * 2, 0, gapHalf * 2, height);

      ctx.fillStyle = "rgba(8,12,16,1)";
      ctx.fillRect(sweepX, 0, 2, height);

      const glR = ctx.createLinearGradient(sweepX + 2, 0, sweepX + gapHalf * 2 + 2, 0);
      glR.addColorStop(0, "rgba(8,12,16,0.97)");
      glR.addColorStop(1, "rgba(8,12,16,0)");
      ctx.fillStyle = glR;
      ctx.fillRect(sweepX + 2, 0, gapHalf * 2, height);

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
