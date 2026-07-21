import { useEffect, useRef } from "react";

// ─── model-viewer web component wrapper ──────────────────────────────────────

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        "auto-rotate"?: boolean | string;
        "camera-controls"?: boolean | string;
        "shadow-intensity"?: string;
        exposure?: string;
        style?: React.CSSProperties;
      }, HTMLElement>;
    }
  }
}

function useModelViewerScript() {
  useEffect(() => {
    if (document.querySelector('script[data-model-viewer]')) return;
    const s = document.createElement("script");
    s.type = "module";
    s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    s.setAttribute("data-model-viewer", "1");
    document.head.appendChild(s);
  }, []);
}

// ─── Single panel ─────────────────────────────────────────────────────────────

function ModelPanel({
  url,
  label,
  source,
  size,
  onSelect,
}: {
  url: string;
  label: string;
  source: string;
  size: string;
  onSelect: () => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, gap: 8 }}>
      <div style={{
        flex: 1,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid rgba(0,255,136,0.25)",
        background: "#111",
        position: "relative",
        minHeight: 0,
      }}>
        {/* @ts-expect-error model-viewer web component */}
        <model-viewer
          src={url}
          alt={label}
          auto-rotate
          camera-controls
          shadow-intensity="1"
          exposure="0.8"
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            "--poster-color": "transparent",
          } as React.CSSProperties}
        />
        <div style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          color: "rgba(255,255,255,0.35)",
          fontFamily: "monospace",
          fontSize: 10,
          pointerEvents: "none",
        }}>
          drag to rotate · scroll to zoom
        </div>
      </div>

      <div>
        <div style={{ color: "#00ff88", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
          {label}
        </div>
        <div style={{ color: "rgba(255,255,255,0.45)", fontFamily: "monospace", fontSize: 10, marginTop: 2 }}>
          {source} · {size}
        </div>
      </div>

      <button
        onClick={onSelect}
        style={{
          background: "rgba(0,255,136,0.08)",
          border: "1px solid rgba(0,255,136,0.4)",
          color: "#00ff88",
          fontFamily: "monospace",
          fontSize: 12,
          fontWeight: 700,
          padding: "8px 0",
          cursor: "pointer",
          borderRadius: 6,
          letterSpacing: 1,
          width: "100%",
        }}
      >
        USE THIS MODEL
      </button>
    </div>
  );
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

interface HeartModelViewerProps {
  onClose: () => void;
  onSelect: (model: "realistic" | "arogya") => void;
}

export function HeartModelViewer({ onClose, onSelect }: HeartModelViewerProps) {
  useModelViewerScript();

  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(0,0,0,0.95)",
        display: "flex",
        flexDirection: "column",
        padding: 16,
        gap: 10,
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{
          color: "#00ff88",
          fontFamily: "monospace",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 2,
        }}>
          3D HEART MODEL BROWSER
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.3)",
            color: "#fff",
            fontFamily: "monospace",
            padding: "4px 12px",
            cursor: "pointer",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          ✕ CLOSE
        </button>
      </div>

      {/* Panels */}
      <div style={{ flex: 1, display: "flex", gap: 14, minHeight: 0 }}>
        <ModelPanel
          url="/models/realistic_human_heart.glb"
          label="Model A — Realistic Human Heart"
          source="SalarAlo/origo · GitHub"
          size="7.3 MB"
          onSelect={() => onSelect("realistic")}
        />
        <ModelPanel
          url="/models/arogya_heart.glb"
          label="Model B — Human Heart"
          source="nirman12/Arogya-Nidhi · GitHub"
          size="2.5 MB"
          onSelect={() => onSelect("arogya")}
        />
      </div>
    </div>
  );
}
