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
}

export function WaveformCanvas({
  data,
  color,
  label,
  gridColor = "#003300",
  value,
  unit,
  minY = -1,
  maxY = 1,
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
    let startTime = performance.now();
    const DURATION = 15000; // 15 seconds loop

    const render = (time: number) => {
      const elapsed = time; // Use global time for perfect sync across canvases
      const progress = (elapsed % DURATION) / DURATION;
      
      const width = canvas.width;
      const height = canvas.height;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gridSpacing = 20;
      for (let x = 0; x <= width; x += gridSpacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += gridSpacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Draw waveform
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();

      const dataLength = data.length;
      
      // Calculate how many samples map to the width
      // The progress indicates where we are in the 15s buffer.
      // We want to scroll from right to left. So new data enters at width, old data exits at 0.
      const currentSampleIndex = Math.floor(progress * dataLength);
      
      for (let x = 0; x < width; x++) {
        // x/width goes from 0 to 1
        // We want x=width to map to currentSampleIndex
        // x=0 to map to currentSampleIndex - dataLength * (width / totalWidthFor15s)
        // Since we are showing a fixed window, let's assume the canvas shows exactly 5 seconds out of the 15?
        // Wait, the prompt says "loop seamlessly on a 15-second cycle... wrap around".
        // Let's assume the canvas displays the full 15 seconds.
        const sampleOffset = Math.floor((1 - (x / width)) * dataLength);
        let sampleIndex = (currentSampleIndex - sampleOffset) % dataLength;
        if (sampleIndex < 0) sampleIndex += dataLength;
        
        const val = data[sampleIndex];
        const normalizedVal = (val - minY) / (maxY - minY);
        // Invert Y so positive is up
        const y = height - (normalizedVal * height);
        
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [data, color, gridColor, minY, maxY]);

  return (
    <div className="relative flex flex-col h-full border border-green-900/30 rounded overflow-hidden" ref={containerRef}>
      <div className="absolute top-2 left-2 z-10 font-mono text-sm font-bold" style={{ color }}>
        {label}
      </div>
      <div className="absolute top-2 right-4 z-10 font-mono flex items-baseline gap-1" style={{ color }}>
        <span className="text-3xl font-bold">{value}</span>
        <span className="text-sm">{unit}</span>
      </div>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
