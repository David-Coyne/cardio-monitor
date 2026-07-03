import { useMemo } from "react";
import { generate12LeadSnapshot, type IschaemiaZone } from "@/lib/rhythmGenerators";

interface Lead12ECGProps {
  hr: number;
  ischaemiaZone: IschaemiaZone;
  color?: string;
}

// Standard clinical 12-lead printout layout: 3 rows × 4 columns.
const LEAD_GRID: string[] = [
  "I", "aVR", "V1", "V4",
  "II", "aVL", "V2", "V5",
  "III", "aVF", "V3", "V6",
];

const ZONE_LABEL: Record<Exclude<IschaemiaZone, "none">, string> = {
  anterior: "ANTERIOR STEMI · LAD",
  inferior: "INFERIOR STEMI · RCA",
  lateral:  "LATERAL STEMI · LCx",
};

export function Lead12ECG({ hr, ischaemiaZone, color = "#00ff41" }: Lead12ECGProps) {
  const leads = useMemo(() => generate12LeadSnapshot(hr, ischaemiaZone), [hr, ischaemiaZone]);

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
          <LeadCell key={name} name={name} data={leads[name as keyof typeof leads]} color={color} />
        ))}
      </div>
    </div>
  );
}

function LeadCell({ name, data, color }: { name: string; data: number[]; color: string }) {
  const w = 100, h = 40;
  const min = -2.0, max = 2.0;
  const points = useMemo(() => {
    return data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - ((v - min) / (max - min)) * h;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [data]);

  return (
    <div
      className="relative"
      style={{ border: "1px solid rgba(0,60,0,0.35)", background: "rgba(0,10,0,0.4)" }}
    >
      <span
        className="absolute top-0 left-0.5 z-10 font-mono font-bold"
        style={{ color, fontSize: 6, lineHeight: 1.2 }}
      >
        {name}
      </span>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full block">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
