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
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      if (containerRef.current) {
        canvas.width = containerRef.current.clientWidth;
        canvas.height = containerRef.current.clientHeight;
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

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // Glow effect: draw a slightly thicker, lower-opacity version first
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const sampleOffset = Math.floor((1 - x / width) * samplesOnScreen);
        let sampleIndex = (currentSampleIndex - sampleOffset + data.length) % data.length;
        const val = data[sampleIndex];
        const normalizedVal = (val - minY) / (maxY - minY);
        const y = height - normalizedVal * height * 0.85 - height * 0.075;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Main trace
      ctx.strokeStyle = color;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const sampleOffset = Math.floor((1 - x / width) * samplesOnScreen);
        let sampleIndex = (currentSampleIndex - sampleOffset + data.length) % data.length;
        const val = data[sampleIndex];
        const normalizedVal = (val - minY) / (maxY - minY);
        const y = height - normalizedVal * height * 0.85 - height * 0.075;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Dim trailing edge (sweep line effect — dark band at leading edge)
      const sweepWidth = Math.max(8, width * 0.02);
      const sweepX = (currentSampleIndex / data.length) * width;
      const gradient = ctx.createLinearGradient(sweepX, 0, sweepX + sweepWidth, 0);
      gradient.addColorStop(0, "rgba(10,14,20,0.95)");
      gradient.addColorStop(1, "rgba(10,14,20,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(sweepX, 0, sweepWidth, height);

      // Wrap-around: also dim at the right edge if sweep has wrapped
      if (sweepX + sweepWidth > width) {
        const wrapGrad = ctx.createLinearGradient(0, 0, sweepWidth - (width - sweepX), 0);
        wrapGrad.addColorStop(0, "rgba(10,14,20,0.95)");
        wrapGrad.addColorStop(1, "rgba(10,14,20,0)");
        ctx.fillStyle = wrapGrad;
        ctx.fillRect(0, 0, sweepWidth - (width - sweepX), height);
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
        className="absolute top-1.5 left-2 z-10 font-mono text-xs font-bold tracking-widest"
        style={{ color }}
      >
        {label}
      </div>
      <div
        className="absolute top-1 right-3 z-10 font-mono flex items-baseline gap-1"
        style={{ color }}
      >
        <span className="text-2xl font-bold leading-none">{value}</span>
        <span className="text-xs opacity-80">{unit}</span>
      </div>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
