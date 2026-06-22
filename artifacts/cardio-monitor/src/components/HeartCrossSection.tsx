import { useRef, useEffect } from "react";
import type { RhythmType } from "@/lib/rhythmGenerators";

// ── Props (mirrors Heart3D) ───────────────────────────────────────────────────
interface Props {
  heartRate:  number;
  rhythmType: RhythmType;
  svgWidth?:  number;
  svgHeight?: number;
  paused?:    boolean;
}

// ── Beat helper (same logic as Heart3D) ──────────────────────────────────────
function getBeat(now: number, hr: number, rt: RhythmType, paused: boolean): number {
  if (paused) return 0;
  const period = 60000 / Math.max(hr, 1);
  const phase  = (now % period) / period;
  if (rt === "VF") {
    return Math.abs(Math.sin((now % 180) / 180 * Math.PI)) * 0.42;
  }
  if (phase < 0.10) return phase / 0.10;
  if (phase < 0.38) return 1 - (phase - 0.10) / 0.28;
  return 0;
}

// ── Rounded-rect helper ───────────────────────────────────────────────────────
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rx = Math.min(Math.abs(r), Math.abs(w) / 2, Math.abs(h) / 2);
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + w - rx, y);
  ctx.arcTo(x + w, y,     x + w, y + rx,  rx);
  ctx.lineTo(x + w, y + h - rx);
  ctx.arcTo(x + w, y + h, x + w - rx, y + h, rx);
  ctx.lineTo(x + rx, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - rx, rx);
  ctx.lineTo(x,     y + rx);
  ctx.arcTo(x,     y,     x + rx, y,     rx);
  ctx.closePath();
}

// ── Arrow helper ─────────────────────────────────────────────────────────────
function arw(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, lw: number, hs: number,
) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * hs - uy * hs * 0.55, y2 - uy * hs + ux * hs * 0.55);
  ctx.lineTo(x2 - ux * hs + uy * hs * 0.55, y2 - uy * hs - ux * hs * 0.55);
  ctx.closePath(); ctx.fill();
}

// ── Main draw ─────────────────────────────────────────────────────────────────
function draw(ctx: CanvasRenderingContext2D, W: number, H: number, beat: number, rt: RhythmType) {
  const isVF = rt === "VF";
  const isVT = rt === "VT";
  const s    = beat;  // 0=diastole → 1=systole

  // Clear
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#021005"); bg.addColorStop(1, "#020c04");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // ── Colours ──────────────────────────────────────────────────────────────
  const oR  = isVF ? "#5c1414" : isVT ? "#922018" : "#c42b22";
  const oR2 = isVF ? "#3a0c0c" : isVT ? "#661612" : "#8a1e18";
  const dB  = isVF ? "#121440" : "#2a3ab0";
  const dB2 = isVF ? "#0a0c2c" : "#1a2478";
  const wall = isVF ? "#503828" : isVT ? "#6a3c2a" : "#8c4838";
  const wallD = isVF ? "#3a2818" : "#5e3020";
  const wallL = isVF ? "#6a4030" : "#a85844";
  const valC  = "#c49440";

  // ── Layout (all in CSS pixels, DPR-scaled by caller) ─────────────────────
  // Leave ~4px margin all sides; great vessels use top 12% of H
  const mx  = W * 0.03;                // left/right margin
  const gvH = H * 0.10;               // great-vessel stub height
  const hTop = H * 0.14;              // top of pericardial silhouette
  const avY  = H * 0.50;             // AV valve plane
  const apY  = H * 0.94;             // LV apex Y

  // Septum
  const sepCx = W * 0.49;
  const sepHW  = W * 0.024;
  const bulge  = s * W * 0.016;       // IVS bulges into RV during systole

  // Atria boundaries (squeeze inward during systole)
  const raL = mx        + s * W * 0.008;
  const raR = sepCx - sepHW - bulge - s * W * 0.005;
  const laL = sepCx + sepHW             + s * W * 0.005;
  const laR = W - mx    - s * W * 0.008;

  // RV (crescent, doesn't reach apex)
  const rvL = mx        + s * W * 0.012;
  const rvR = sepCx - sepHW - bulge;
  const rvBotY = H * 0.77 - s * H * 0.04;

  // LV cavity (thick wall, tapers to apex)
  const lvWall = W * 0.065;
  const lvL = sepCx + sepHW + lvWall * 0.68 + s * W * 0.018;
  const lvR = W - mx - lvWall * 0.68        - s * W * 0.018;
  const lvApY = apY - H * 0.04 - s * H * 0.04;
  const lvApX = (lvL + lvR) / 2;

  // ── 1. Outer pericardial body (myocardium silhouette) ────────────────────
  ctx.beginPath();
  ctx.moveTo(mx, hTop);
  ctx.lineTo(W - mx, hTop);
  ctx.lineTo(W - mx, apY - H * 0.10);
  ctx.bezierCurveTo(W - mx, apY + H * 0.005, W * 0.65, apY + H * 0.012, W * 0.5, apY - H * 0.01);
  ctx.bezierCurveTo(W * 0.35, apY + H * 0.012, mx, apY + H * 0.005, mx, apY - H * 0.10);
  ctx.closePath();
  const wallGrd = ctx.createLinearGradient(mx, hTop, W - mx, apY);
  wallGrd.addColorStop(0, wallL); wallGrd.addColorStop(0.55, wall); wallGrd.addColorStop(1, wallD);
  ctx.fillStyle = wallGrd; ctx.fill();
  ctx.strokeStyle = isVF ? "rgba(255,50,50,0.15)" : "rgba(80,200,80,0.07)";
  ctx.lineWidth = 1.2; ctx.stroke();

  // ── 2. Right Atrium ───────────────────────────────────────────────────────
  const raT = hTop + H * 0.022, raB = avY - H * 0.008;
  if (raR > raL + 2) {
    rrect(ctx, raL, raT, raR - raL, raB - raT, H * 0.028);
    const g = ctx.createLinearGradient(raL, raT, raR, raB);
    g.addColorStop(0, dB); g.addColorStop(1, dB2);
    ctx.fillStyle = g; ctx.fill();
  }

  // ── 3. Left Atrium ────────────────────────────────────────────────────────
  const laT = hTop + H * 0.022, laB = avY - H * 0.008;
  if (laR > laL + 2) {
    rrect(ctx, laL, laT, laR - laL, laB - laT, H * 0.028);
    const g = ctx.createLinearGradient(laL, laT, laR, laB);
    g.addColorStop(0, oR); g.addColorStop(1, oR2);
    ctx.fillStyle = g; ctx.fill();
  }

  // ── 4. Right Ventricle ────────────────────────────────────────────────────
  if (rvR > rvL + 2) {
    const rvT = avY + H * 0.006;
    const mid = (rvL + rvR) / 2;
    ctx.beginPath();
    ctx.moveTo(rvL, rvT); ctx.lineTo(rvR, rvT);
    ctx.lineTo(rvR, rvBotY);
    ctx.bezierCurveTo(rvR, rvBotY + H * 0.04, mid + W * 0.035, rvBotY + H * 0.06, mid, rvBotY + H * 0.055);
    ctx.bezierCurveTo(mid - W * 0.035, rvBotY + H * 0.06, rvL, rvBotY + H * 0.04, rvL, rvBotY);
    ctx.closePath();
    const g = ctx.createLinearGradient(rvL, rvT, rvR, rvBotY);
    g.addColorStop(0, dB); g.addColorStop(1, dB2);
    ctx.fillStyle = g; ctx.fill();
  }

  // ── 5. Left Ventricle ────────────────────────────────────────────────────
  if (lvR > lvL + 2) {
    const lvT = avY + H * 0.006;
    ctx.beginPath();
    ctx.moveTo(lvL, lvT); ctx.lineTo(lvR, lvT);
    ctx.bezierCurveTo(lvR, lvT + (lvApY - lvT) * 0.52, lvApX + (lvR - lvL) * 0.20, lvApY, lvApX, lvApY);
    ctx.bezierCurveTo(lvApX - (lvR - lvL) * 0.20, lvApY, lvL, lvT + (lvApY - lvT) * 0.52, lvL, lvT);
    ctx.closePath();
    const g = ctx.createLinearGradient(lvL, lvT, lvR, lvApY);
    g.addColorStop(0, oR); g.addColorStop(1, oR2);
    ctx.fillStyle = g; ctx.fill();
  }

  // ── 6. Septum (IVS + IAS) ────────────────────────────────────────────────
  const sepL = sepCx - sepHW - bulge, sepR = sepCx + sepHW;
  if (sepR > sepL) {
    ctx.fillRect(sepL, hTop + 1, sepR - sepL, apY - hTop - H * 0.10);
    const g = ctx.createLinearGradient(sepL, 0, sepR, 0);
    g.addColorStop(0, wallD); g.addColorStop(0.5, wall); g.addColorStop(1, wallD);
    ctx.fillStyle = g;
    ctx.fillRect(sepL, hTop + 1, sepR - sepL, apY - hTop - H * 0.10);
  }

  // ── 7. AV Valves ─────────────────────────────────────────────────────────
  const vo = 1 - s;           // valve open amount
  const vlw = Math.max(1.2, H * 0.010);
  ctx.lineWidth = vlw; ctx.lineCap = "round"; ctx.strokeStyle = valC;

  // Tricuspid (RA→RV)
  const tvCx = (raL + raR) / 2;
  const tvSpread = (raR - raL) * 0.42;
  [[tvCx - tvSpread, tvCx - tvSpread * 0.28],
   [tvCx + tvSpread * 0.28, tvCx + tvSpread]].forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(a, avY);
    ctx.quadraticCurveTo((a + b) / 2, avY + H * 0.042 * vo, b, avY);
    ctx.stroke();
  });
  // Center leaflet
  ctx.beginPath();
  ctx.moveTo(tvCx - W * 0.018, avY);
  ctx.quadraticCurveTo(tvCx, avY + H * 0.035 * vo, tvCx + W * 0.018, avY);
  ctx.stroke();

  // Mitral (LA→LV)
  const mvCx = (laL + laR) / 2;
  const mvSpread = (laR - laL) * 0.44;
  [[mvCx - mvSpread, mvCx - mvSpread * 0.18],
   [mvCx + mvSpread * 0.18, mvCx + mvSpread]].forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(a, avY);
    ctx.quadraticCurveTo((a + b) / 2, avY + H * 0.046 * vo, b, avY);
    ctx.stroke();
  });

  // ── 8. Great Vessels ─────────────────────────────────────────────────────
  const vr  = W * 0.038;     // vessel half-width
  const aoX = W * 0.67, paX = W * 0.33, svcX = W * 0.20;
  const vTop = H * 0.01, vBot = hTop + H * 0.005;

  // PA (blue)
  const paGrd = ctx.createLinearGradient(paX - vr, 0, paX + vr, 0);
  paGrd.addColorStop(0, dB2); paGrd.addColorStop(0.5, isVF ? "#3040a0" : "#3d54d0"); paGrd.addColorStop(1, dB2);
  ctx.fillStyle = paGrd; rrect(ctx, paX - vr, vTop + H * 0.005, vr * 2, vBot - vTop - H * 0.005, vr); ctx.fill();

  // Ao (red)
  const aoGrd = ctx.createLinearGradient(aoX - vr, 0, aoX + vr, 0);
  aoGrd.addColorStop(0, oR2); aoGrd.addColorStop(0.5, isVF ? "#7a2020" : "#d43030"); aoGrd.addColorStop(1, oR2);
  ctx.fillStyle = aoGrd; rrect(ctx, aoX - vr, vTop + H * 0.005, vr * 2, vBot - vTop - H * 0.005, vr); ctx.fill();

  // SVC (dark blue, thinner)
  const svcGrd = ctx.createLinearGradient(svcX - vr * 0.75, 0, svcX + vr * 0.75, 0);
  svcGrd.addColorStop(0, dB2); svcGrd.addColorStop(0.5, dB); svcGrd.addColorStop(1, dB2);
  ctx.fillStyle = svcGrd; rrect(ctx, svcX - vr * 0.75, vTop + H * 0.04, vr * 1.5, vBot - vTop - H * 0.04, vr * 0.75); ctx.fill();

  // ── 9. Semilunar valves (at vessel roots) ────────────────────────────────
  const svY = hTop + H * 0.003;
  const cusps = (cx: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, H * 0.008);
    for (let i = -1; i <= 1; i++) {
      const dx = i * vr * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + dx, svY);
      ctx.quadraticCurveTo(cx + dx * 0.4 + vr * 0.12 * (s - 0.5), svY + H * 0.020 * (1 - s), cx, svY);
      ctx.stroke();
    }
  };
  cusps(aoX, valC);
  cusps(paX, isVF ? "#3a4888" : "#6090d8");

  // ── 10. Vessel labels ────────────────────────────────────────────────────
  const fsv = Math.max(5.5, W * 0.055);
  ctx.font = `bold ${fsv}px monospace`; ctx.textAlign = "center";
  ctx.fillStyle = isVF ? "#334488" : "#5080cc"; ctx.fillText("PA", paX, vTop + H * 0.038);
  ctx.fillStyle = isVF ? "#882828" : "#cc4040"; ctx.fillText("Ao", aoX, vTop + H * 0.038);
  ctx.fillStyle = isVF ? "#223366" : "#3a5088"; ctx.fillText("SVC", svcX, vTop + H * 0.035);

  // ── 11. Flow arrows ───────────────────────────────────────────────────────
  if (!isVF) {
    const as = Math.max(3.5, H * 0.028), alw = Math.max(0.8, H * 0.006);
    if (s > 0.28) {
      const a = Math.min(1, (s - 0.28) / 0.42);
      arw(ctx, aoX, hTop + H * 0.16, aoX, hTop + H * 0.04, `rgba(210,70,60,${(a * 0.85).toFixed(2)})`, alw, as);
      arw(ctx, paX, hTop + H * 0.16, paX, hTop + H * 0.04, `rgba(50,80,200,${(a * 0.85).toFixed(2)})`, alw, as);
    } else {
      const a = Math.min(1, (0.28 - s) / 0.28);
      arw(ctx, (raL + raR) / 2, avY - H * 0.07, (raL + raR) / 2, avY + H * 0.09, `rgba(50,80,200,${(a * 0.8).toFixed(2)})`, alw, as);
      arw(ctx, (laL + laR) / 2, avY - H * 0.07, (laL + laR) / 2, avY + H * 0.09, `rgba(210,70,60,${(a * 0.8).toFixed(2)})`, alw, as);
    }
  }

  // ── 12. Chamber labels ────────────────────────────────────────────────────
  const fsc = Math.max(7, W * 0.066);
  const fss = Math.max(5, fsc * 0.62);
  ctx.font = `bold ${fsc}px monospace`;

  const lbl = (txt: string, x: number, y: number, col: string) => {
    ctx.fillStyle = col; ctx.textAlign = "center";
    ctx.fillText(txt, x, y);
  };

  const dCol = isVF ? "rgba(55,70,180,0.72)" : "rgba(80,115,235,0.88)";
  const oCol = isVF ? "rgba(180,50,50,0.72)"  : "rgba(235,88,75,0.88)";

  lbl("RA", (raL + raR) / 2, (raT + raB) / 2 + fsc * 0.35, dCol);
  lbl("LA", (laL + laR) / 2, (laT + laB) / 2 + fsc * 0.35, oCol);
  lbl("LV", (lvL + lvR) / 2, (avY + H * 0.006 + lvApY) * 0.5 + fsc * 0.2, oCol);

  // RV label — in the crescent cavity
  const rvMidX = (rvL + rvR) / 2;
  const rvMidY = (avY + H * 0.006 + rvBotY) * 0.5 + fsc * 0.2;
  lbl("RV", rvMidX, rvMidY, dCol);

  // Valve labels (smaller)
  ctx.font = `bold ${fss}px monospace`;
  ctx.fillStyle = `rgba(196,148,64,0.78)`;
  lbl("TV", (raL + raR) / 2, avY + H * 0.072, "rgba(196,148,64,0.78)");
  lbl("MV", (laL + laR) / 2, avY + H * 0.072, "rgba(196,148,64,0.78)");

  // IVS label (vertical, tiny)
  ctx.save();
  ctx.translate(sepCx + (bulge * 0.5), (avY + H * 0.006 + H * 0.80) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `bold ${Math.max(4.5, W * 0.040)}px monospace`;
  ctx.fillStyle = "rgba(160,110,80,0.52)";
  ctx.textAlign = "center";
  ctx.fillText("IVS", 0, 0);
  ctx.restore();

  // ── 13. VF overlay ────────────────────────────────────────────────────────
  if (isVF) {
    ctx.fillStyle = "rgba(200,30,30,0.065)";
    ctx.fillRect(0, 0, W, H);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HeartCrossSection({ heartRate, rhythmType, svgWidth, svgHeight, paused = false }: Props) {
  const w = svgWidth  ?? 158;
  const h = svgHeight ?? 178;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hrRef     = useRef(heartRate);
  const rtRef     = useRef(rhythmType);
  const pausedRef = useRef(paused);
  const rafRef    = useRef<number | null>(null);

  useEffect(() => { hrRef.current     = heartRate;  }, [heartRate]);
  useEffect(() => { rtRef.current     = rhythmType; }, [rhythmType]);
  useEffect(() => { pausedRef.current = paused;     }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const sync = () => {
      const cw = Math.max(1, Math.round(w * dpr));
      const ch = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    };
    sync();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tick = () => {
      sync();
      const beat = getBeat(performance.now(), hrRef.current, rtRef.current, pausedRef.current);
      ctx.save(); ctx.scale(dpr, dpr);
      draw(ctx, w, h, beat, rtRef.current);
      ctx.restore();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);

  const isLethal = rhythmType === "VF" || rhythmType === "VT";

  return (
    <div className="flex flex-col items-center" data-testid="heart-cross-section">
      {/* Canvas — same size/structure as Heart3D inner panel */}
      <div
        className="relative select-none"
        style={{ width: w, height: h, borderRadius: 4, overflow: "hidden" }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: w, height: h, display: "block" }}
        />
        {/* VF overlay text — same as Heart3D */}
        {isLethal && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <span style={{ fontSize: 9, letterSpacing: 2, fontFamily: "monospace", fontWeight: "bold", color: "rgba(255,50,50,0.62)" }}>
              {rhythmType === "VF" ? "FIBRILLATING" : "V-TACH"}
            </span>
          </div>
        )}
      </div>

      {/* Legend strip — matches ~height of rotation sliders in Heart3D */}
      <div
        style={{
          width: w,
          marginTop: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 7, fontFamily: "monospace", color: "rgba(80,115,235,0.75)" }}>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 1, background: "#2a3ab0", flexShrink: 0 }} />
          Deoxygenated
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 7, fontFamily: "monospace", color: "rgba(220,80,65,0.75)" }}>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 1, background: "#c42b22", flexShrink: 0 }} />
          Oxygenated
        </span>
      </div>
    </div>
  );
}
