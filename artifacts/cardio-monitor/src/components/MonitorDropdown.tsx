import { useEffect, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  danger?: boolean;
}

interface Props {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  color?: string;
  openUp?: boolean;   // open list upward instead of downward
}

export function MonitorDropdown({
  options,
  value,
  onChange,
  color = "#00ff41",
  openUp = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const current    = options.find(o => o.value === value);
  const isDanger   = current?.danger ?? false;
  const activeColor = isDanger ? "#ff5555" : color;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", fontFamily: "monospace" }}
    >
      {/* ── Trigger ── */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "5px 10px",
          borderRadius: 4,
          cursor: "pointer",
          fontFamily: "monospace",
          fontWeight: "bold",
          fontSize: "clamp(0.5rem, 0.85vw, 0.72rem)",
          letterSpacing: "0.06em",
          color: activeColor,
          background: open ? `${activeColor}14` : "rgba(0,0,0,0.22)",
          border: `1px solid ${open ? activeColor + "70" : activeColor + "30"}`,
          transition: "border-color 0.12s, background 0.12s",
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current?.label ?? value}
        </span>
        {/* chevron */}
        <svg
          width="9" height="9" viewBox="0 0 9 9" fill="none"
          style={{ flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }}
        >
          <path
            d="M1.5 3L4.5 6L7.5 3"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── Options list ── */}
      {open && (
        <div
          style={{
            position: "absolute",
            [openUp ? "bottom" : "top"]: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 200,
            background: "#0b1812",
            border: `1px solid ${color}30`,
            borderRadius: 4,
            overflow: "hidden",
            boxShadow: "0 6px 28px rgba(0,0,0,0.80)",
          }}
        >
          {options.map(opt => {
            const isActive = opt.value === value;
            const optColor = opt.danger ? "#ff5555" : color;
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "5px 10px",
                  fontFamily: "monospace",
                  fontWeight: isActive ? "bold" : "normal",
                  fontSize: "clamp(0.48rem, 0.82vw, 0.7rem)",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                  color: isActive
                    ? optColor
                    : opt.danger
                      ? "rgba(255,85,85,0.55)"
                      : `${color}60`,
                  background: isActive ? `${optColor}18` : "transparent",
                  borderLeft: `2px solid ${isActive ? optColor : "transparent"}`,
                  transition: "background 0.08s, color 0.08s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = `${optColor}10`;
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = optColor;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = isActive ? `${optColor}18` : "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = isActive
                    ? optColor
                    : opt.danger ? "rgba(255,85,85,0.55)" : `${color}60`;
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
