import { useRef, useEffect, useCallback } from "react";
import type { RhythmType } from "@/lib/rhythmGenerators";

// ── Props (same interface as Heart3D for easy swapping) ───────────────────────
interface Props {
  heartRate:   number;
  rhythmType:  RhythmType;
  svgWidth?:   number;
  svgHeight?:  number;
  paused?:     boolean;
}

// ── Beat strength helper (mirrors Heart3D logic) ──────────────────────────────
function getBeat(now: number, hr: number, rhythmType: RhythmType, paused: boolean): number {
  if (paused) return 0;
  const period = 60000 / Math.max(hr, 1);
  const phase  = (now % period) / period;
  if (rhythmType === "VF") {
    const fp = (now % 180) / 180;
    return Math.abs(Math.sin(fp * Math.PI)) * 0.45;
  }
  if (phase < 0.10) return phase / 0.10;
  if (phase < 0.38) return 1 - (phase - 0.10) / 0.28;
  return 0;
}

// ── Canvas drawing ────────────────────────────────────────────────────────────
function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rx = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + w - rx, y);
  ctx.arcTo(x + w, y, x + w, y + rx, rx);
  ctx.lineTo(x + w, y + h - rx);
  ctx.arcTo(x + w, y + h, x + w - rx, y + h, rx);
  ctx.lineTo(x + rx, y + h);
  ctx.arcTo(x, y + h, x, y + h - rx, rx);
  ctx.lineTo(x, y + rx);
  ctx.arcTo(x, y, x + rx, y, rx);
  ctx.closePath();
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, size: number,
) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.55;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // arrowhead
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * size * 2 - uy * size, y2 - uy * size * 2 + ux * size);
  ctx.lineTo(x2 - ux * size * 2 + uy * size, y2 - uy * size * 2 - ux * size);
  ctx.closePath();
  ctx.fill();
}

function drawSection(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  beat: number,
  rhythmType: RhythmType,
) {
  const isVF = rhythmType === "VF";
  const isVT = rhythmType === "VT";
  const s = beat; // 0=diastole, 1=systole

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#020c07");
  bg.addColorStop(1, "#030e09");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Layout: anatomy in frontal plane ─────────────────────────────────────
  // Convention: viewer's LEFT = anatomical RIGHT (RA/RV, deoxygenated)
  //             viewer's RIGHT = anatomical LEFT  (LA/LV, oxygenated)

  const gvY   = H * 0.04;   // great vessel tops
  const hTop  = H * 0.24;   // top of atria / pericardium
  const avY   = H * 0.50;   // AV valve plane
  const apexY = H * 0.92;   // LV apex

  // Septum (IVS + IAS) centred at:
  const sepCx = W * 0.50;
  const sepHW  = W * 0.026;  // half-width of septum

  // IVS bulges toward RV (LEFT) during systole
  const sepBulge = s * W * 0.018;

  // ── Blood colors ────────────────────────────────────────────────────────────
  const oxyR  = isVF ? "#3a1010" : isVT ? "#8c2016" : "#be2e24";
  const oxyR2 = isVF ? "#260a0a" : isVT ? "#5c1210" : "#861e18";
  const deoB  = isVF ? "#101030" : "#2c3ca8";
  const deoB2 = isVF ? "#080820" : "#1c2870";
  const wall  = isVF ? "#503020" : isVT ? "#6a3828" : "#8a4838";
  const wallD = isVF ? "#382010" : "#5e3020";
  const wallL = isVF ? "#643828" : "#a45644";
  const valve = "#c49440";

  // ── Key X positions ─────────────────────────────────────────────────────────
  // Right side (RA/RV): x: W*0.05 → sepCx
  // Left  side (LA/LV): x: sepCx  → W*0.95

  // ── OUTER PERICARDIAL SILHOUETTE ────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(W * 0.04, hTop);
  ctx.lineTo(W * 0.96, hTop);
  ctx.lineTo(W * 0.96, apexY - H * 0.10);
  ctx.bezierCurveTo(W * 0.96, apexY + H * 0.01, W * 0.65, apexY + H * 0.02, W * 0.50, apexY - H * 0.01);
  ctx.bezierCurveTo(W * 0.35, apexY + H * 0.02, W * 0.04, apexY + H * 0.01, W * 0.04, apexY - H * 0.10);
  ctx.closePath();
  const wallGrad = ctx.createLinearGradient(W * 0.04, hTop, W * 0.96, apexY);
  wallGrad.addColorStop(0.0, wallL);
  wallGrad.addColorStop(0.5, wall);
  wallGrad.addColorStop(1.0, wallD);
  ctx.fillStyle = wallGrad;
  ctx.fill();

  // Subtle outer glow
  ctx.strokeStyle = isLethalRhythm(rhythmType)
    ? "rgba(255,60,60,0.18)"
    : "rgba(100,200,100,0.08)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── RIGHT ATRIUM (RA) — left of septum, top ────────────────────────────────
  const raL  = W * 0.07 + s * W * 0.008;
  const raR  = sepCx - sepHW - sepBulge - s * W * 0.006;
  const raT  = hTop + H * 0.025;
  const raB  = avY - H * 0.01;
  const raH  = raB - raT;
  const raW  = raR - raL;
  if (raW > 2 && raH > 2) {
    rr(ctx, raL, raT, raW, raH, H * 0.03);
    const raGrad = ctx.createLinearGradient(raL, raT, raR, raB);
    raGrad.addColorStop(0, deoB);
    raGrad.addColorStop(1, deoB2);
    ctx.fillStyle = raGrad;
    ctx.fill();
  }

  // ── LEFT ATRIUM (LA) — right of septum, top ────────────────────────────────
  const laL  = sepCx + sepHW + s * W * 0.006;
  const laR  = W * 0.93 - s * W * 0.008;
  const laT  = hTop + H * 0.025;
  const laB  = avY - H * 0.01;
  const laH  = laB - laT;
  const laW  = laR - laL;
  if (laW > 2 && laH > 2) {
    rr(ctx, laL, laT, laW, laH, H * 0.03);
    const laGrad = ctx.createLinearGradient(laL, laT, laR, laB);
    laGrad.addColorStop(0, oxyR);
    laGrad.addColorStop(1, oxyR2);
    ctx.fillStyle = laGrad;
    ctx.fill();
  }

  // ── RIGHT VENTRICLE (RV) — left of septum, crescent-shaped ────────────────
  // RV contracts during systole (narrowing from right toward the septum)
  const rvL   = W * 0.05 + s * W * 0.015;
  const rvRat = sepCx - sepHW - sepBulge;   // right edge at septum
  const rvTop = avY + H * 0.008;
  const rvBot = apexY - H * 0.14 - s * H * 0.04;  // RV doesn't reach apex
  const rvMid = (rvL + rvRat) / 2;
  ctx.beginPath();
  ctx.moveTo(rvL, rvTop);
  ctx.lineTo(rvRat, rvTop);
  ctx.lineTo(rvRat, rvBot);
  ctx.bezierCurveTo(rvRat, rvBot + H * 0.04, rvMid + W * 0.04, rvBot + H * 0.06, rvMid, rvBot + H * 0.05);
  ctx.bezierCurveTo(rvMid - W * 0.04, rvBot + H * 0.06, rvL, rvBot + H * 0.04, rvL, rvBot);
  ctx.closePath();
  const rvGrad = ctx.createLinearGradient(rvL, rvTop, rvRat, rvBot);
  rvGrad.addColorStop(0, deoB);
  rvGrad.addColorStop(1, deoB2);
  ctx.fillStyle = rvGrad;
  ctx.fill();

  // ── LEFT VENTRICLE (LV) — right of septum, thick-walled oval ─────────────
  // LV is the main pump — thick wall, contracts strongly
  const lvWall = W * 0.07;  // wall thickness
  const lvL   = sepCx + sepHW + lvWall * 0.72 + s * W * 0.018; // cavity left (wall thickens)
  const lvR   = W * 0.94 - lvWall * 0.72 - s * W * 0.018;      // cavity right
  const lvTop = avY + H * 0.008;
  const lvApX = (lvL + lvR) / 2;
  const lvApY = apexY - H * 0.04 - s * H * 0.05; // apex moves up during systole
  ctx.beginPath();
  ctx.moveTo(lvL, lvTop);
  ctx.lineTo(lvR, lvTop);
  ctx.bezierCurveTo(lvR, lvTop + (lvApY - lvTop) * 0.5, lvApX + (lvR - lvL) * 0.22, lvApY, lvApX, lvApY);
  ctx.bezierCurveTo(lvApX - (lvR - lvL) * 0.22, lvApY, lvL, lvTop + (lvApY - lvTop) * 0.5, lvL, lvTop);
  ctx.closePath();
  const lvGrad = ctx.createLinearGradient(lvL, lvTop, lvR, lvApY);
  lvGrad.addColorStop(0, oxyR);
  lvGrad.addColorStop(1, oxyR2);
  ctx.fillStyle = lvGrad;
  ctx.fill();

  // ── SEPTUM (IVS above, IAS below AV) ──────────────────────────────────────
  const sepL = sepCx - sepHW - sepBulge;
  const sepR = sepCx + sepHW;
  if (sepR > sepL) {
    rr(ctx, sepL, hTop, sepR - sepL, apexY - hTop - H * 0.08, 0);
    const sepGrad = ctx.createLinearGradient(sepL, hTop, sepR, hTop);
    sepGrad.addColorStop(0, wallD);
    sepGrad.addColorStop(0.5, wall);
    sepGrad.addColorStop(1, wallD);
    ctx.fillStyle = sepGrad;
    ctx.fill();
  }

  // Thin line between IAS (atria) and IVS (ventricles) sections
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(sepL, avY);
  ctx.lineTo(sepR, avY);
  ctx.stroke();

  // ── AV VALVES ──────────────────────────────────────────────────────────────
  // Closed during systole (s→1), open during diastole (s→0)
  const valveOpen = 1 - s;  // 1=open, 0=closed
  ctx.lineWidth = H * 0.012;
  ctx.lineCap = "round";

  // TRICUSPID VALVE (RA→RV), left of septum
  const tvCx = (raL + raR) / 2;
  const tvY  = avY;
  ctx.strokeStyle = valve;
  // Left leaflet
  ctx.beginPath();
  ctx.moveTo(tvCx - W * 0.09, tvY);
  ctx.quadraticCurveTo(
    tvCx - W * 0.04, tvY + H * 0.045 * valveOpen,
    tvCx, tvY,
  );
  ctx.stroke();
  // Right leaflet
  ctx.beginPath();
  ctx.moveTo(tvCx + W * 0.09, tvY);
  ctx.quadraticCurveTo(
    tvCx + W * 0.04, tvY + H * 0.045 * valveOpen,
    tvCx, tvY,
  );
  ctx.stroke();
  // Septal leaflet
  ctx.beginPath();
  ctx.moveTo(tvCx - W * 0.02, tvY);
  ctx.quadraticCurveTo(
    tvCx, tvY + H * 0.038 * valveOpen,
    tvCx + W * 0.02, tvY,
  );
  ctx.stroke();

  // MITRAL VALVE (LA→LV), right of septum
  const mvCx = (laL + laR) / 2;
  const mvY  = avY;
  ctx.strokeStyle = valve;
  // Anterior leaflet (larger)
  ctx.beginPath();
  ctx.moveTo(mvCx - W * 0.10, mvY);
  ctx.quadraticCurveTo(
    mvCx - W * 0.03, mvY + H * 0.050 * valveOpen,
    mvCx, mvY,
  );
  ctx.stroke();
  // Posterior leaflet (smaller)
  ctx.beginPath();
  ctx.moveTo(mvCx + W * 0.10, mvY);
  ctx.quadraticCurveTo(
    mvCx + W * 0.03, mvY + H * 0.038 * valveOpen,
    mvCx, mvY,
  );
  ctx.stroke();

  // ── GREAT VESSELS ──────────────────────────────────────────────────────────
  const vesselR = H * 0.038;  // vessel tube radius (half-width)
  const aoX  = W * 0.66;     // aorta x (connected to LV outflow)
  const paX  = W * 0.34;     // pulmonary artery x (connected to RV outflow)
  const svcX = W * 0.22;     // SVC x (entering RA)

  // PULMONARY TRUNK (blue, deoxy)
  const ptGrad = ctx.createLinearGradient(paX - vesselR, 0, paX + vesselR, 0);
  ptGrad.addColorStop(0, deoB2);
  ptGrad.addColorStop(0.5, "#3d51cc");
  ptGrad.addColorStop(1, deoB2);
  ctx.fillStyle = ptGrad;
  rr(ctx, paX - vesselR, gvY, vesselR * 2, hTop - gvY + H * 0.01, vesselR);
  ctx.fill();
  // PA label
  ctx.fillStyle = isVF ? "#3a4888" : "#6088cc";
  ctx.font = `bold ${Math.max(7, H * 0.046)}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText("PA", paX, gvY + H * 0.03);

  // ASCENDING AORTA (red, oxy) + aortic arch hint
  const aoGrad = ctx.createLinearGradient(aoX - vesselR, 0, aoX + vesselR, 0);
  aoGrad.addColorStop(0, oxyR2);
  aoGrad.addColorStop(0.5, isVF ? "#6a2020" : "#d83030");
  aoGrad.addColorStop(1, oxyR2);
  ctx.fillStyle = aoGrad;
  rr(ctx, aoX - vesselR, gvY, vesselR * 2, hTop - gvY + H * 0.01, vesselR);
  ctx.fill();
  // Ao label
  ctx.fillStyle = isVF ? "#883838" : "#d84040";
  ctx.fillText("Ao", aoX, gvY + H * 0.03);

  // SVC (dark blue, deoxy, entering RA)
  const svcGrad = ctx.createLinearGradient(svcX - vesselR * 0.8, 0, svcX + vesselR * 0.8, 0);
  svcGrad.addColorStop(0, deoB2);
  svcGrad.addColorStop(0.5, deoB);
  svcGrad.addColorStop(1, deoB2);
  ctx.fillStyle = svcGrad;
  rr(ctx, svcX - vesselR * 0.8, gvY + H * 0.06, vesselR * 1.6, hTop - gvY - H * 0.04, vesselR * 0.8);
  ctx.fill();
  ctx.fillStyle = isVF ? "#2a2a60" : "#4050a0";
  ctx.font = `bold ${Math.max(6, H * 0.036)}px monospace`;
  ctx.fillText("SVC", svcX, gvY + H * 0.055);

  // ── SEMILUNAR VALVE OUTLINES ────────────────────────────────────────────────
  // Aortic valve (LV outflow) — opens during systole
  const aoValveY = hTop + H * 0.005;
  ctx.strokeStyle = valve;
  ctx.lineWidth = H * 0.010;
  const aoOpen = s;
  [-W * 0.025, 0, W * 0.025].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(aoX + dx, aoValveY);
    ctx.quadraticCurveTo(
      aoX + dx * 0.5 + W * 0.010 * (aoOpen - 0.5),
      aoValveY + H * 0.022 * (1 - aoOpen),
      aoX, aoValveY,
    );
    ctx.stroke();
  });

  // Pulmonary valve (RV outflow) — opens during systole
  ctx.strokeStyle = "#7090d0";
  [-W * 0.022, 0, W * 0.022].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(paX + dx, aoValveY);
    ctx.quadraticCurveTo(
      paX + dx * 0.5 + W * 0.008 * (aoOpen - 0.5),
      aoValveY + H * 0.022 * (1 - aoOpen),
      paX, aoValveY,
    );
    ctx.stroke();
  });

  // ── BLOOD FLOW ARROWS ──────────────────────────────────────────────────────
  const as = H * 0.012; // arrow size
  if (!isVF) {
    if (s > 0.3) {
      // Systole: LV → Ao, RV → PA
      const aAlpha = Math.min(1, (s - 0.3) / 0.4);
      arrow(ctx, aoX, hTop + H * 0.14, aoX, gvY + H * 0.06,
        `rgba(220,80,70,${(aAlpha * 0.9).toFixed(2)})`, as);
      arrow(ctx, paX, hTop + H * 0.14, paX, gvY + H * 0.06,
        `rgba(60,90,200,${(aAlpha * 0.9).toFixed(2)})`, as);
    } else {
      // Diastole: LA → LV, RA → RV
      const dAlpha = Math.min(1, (0.30 - s) / 0.30);
      const mvMidX = (laL + laR) / 2;
      const tvMidX = (raL + raR) / 2;
      arrow(ctx, mvMidX, avY - H * 0.06, mvMidX, avY + H * 0.10,
        `rgba(220,80,70,${(dAlpha * 0.85).toFixed(2)})`, as);
      arrow(ctx, tvMidX, avY - H * 0.06, tvMidX, avY + H * 0.10,
        `rgba(60,90,200,${(dAlpha * 0.85).toFixed(2)})`, as);
    }
  }

  // ── WALL THICKNESS HINT (LV outer wall visible on right side) ──────────────
  // The right outer boundary of the heart = LV outer wall
  ctx.strokeStyle = wallL;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.96, hTop);
  ctx.bezierCurveTo(W * 0.96, apexY - H * 0.10, W * 0.65, apexY + H * 0.01, W * 0.50, apexY - H * 0.01);
  ctx.stroke();

  // ── CHAMBER LABELS ─────────────────────────────────────────────────────────
  const lbl = (
    text: string,
    lx: number, ly: number,
    col: string,
    sz: number = Math.max(8, H * 0.054),
    sub?: string,
  ) => {
    ctx.fillStyle = col;
    ctx.font = `bold ${sz}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(text, lx, ly);
    if (sub) {
      ctx.font = `${Math.max(5, sz * 0.68)}px monospace`;
      ctx.fillStyle = col.replace(/[\d.]+\)$/, "0.72)");
      ctx.fillText(sub, lx, ly + sz * 0.9);
    }
  };

  const raLabelX = (raL + raR) / 2;
  const laLabelX = (laL + laR) / 2;
  const lvLabelX = (lvL + lvR) / 2;
  const rvLabelX = (W * 0.05 + sepCx) / 2;

  lbl("RA", raLabelX, (raT + raB) / 2 + H * 0.015, isVF ? "rgba(40,50,150,0.7)" : "rgba(80,110,230,0.85)");
  lbl("LA", laLabelX, (laT + laB) / 2 + H * 0.015, isVF ? "rgba(150,40,40,0.7)" : "rgba(230,90,80,0.85)");
  lbl("LV", lvLabelX, (avY + lvApY) * 0.5, isVF ? "rgba(150,40,40,0.7)" : "rgba(230,90,80,0.85)");
  lbl("RV", rvLabelX, (avY + rvBot) * 0.5 + H * 0.03, isVF ? "rgba(40,50,150,0.7)" : "rgba(80,110,230,0.85)");

  // Valve labels
  const vSz = Math.max(5, H * 0.036);
  ctx.fillStyle = `rgba(196,148,64,0.80)`;
  ctx.font = `bold ${vSz}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText("TV", (raL + raR) / 2, avY + H * 0.065);
  ctx.fillText("MV", (laL + laR) / 2, avY + H * 0.065);

  // IVS label
  ctx.fillStyle = "rgba(160,110,80,0.60)";
  ctx.font = `bold ${Math.max(5, H * 0.034)}px monospace`;
  ctx.save();
  ctx.translate(sepCx, (avY + apexY) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("IVS", 0, 0);
  ctx.restore();

  // ── RHYTHM STATE OVERLAY ───────────────────────────────────────────────────
  if (isVF) {
    ctx.fillStyle = "rgba(255,40,40,0.07)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,50,50,0.55)";
    ctx.font = `bold ${Math.max(7, H * 0.044)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("FIBRILLATING", W / 2, H * 0.12);
  }
}

function isLethalRhythm(r: RhythmType) {
  return r === "VF" || r === "VT";
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HeartCrossSection({
  heartRate,
  rhythmType,
  svgWidth,
  svgHeight,
  paused = false,
}: Props) {
  const w = svgWidth  ?? 158;
  const h = svgHeight ?? 178;

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const hrRef      = useRef(heartRate);
  const rhythmRef  = useRef(rhythmType);
  const pausedRef  = useRef(paused);
  const rafRef     = useRef<number | null>(null);

  useEffect(() => { hrRef.current     = heartRate;  }, [heartRate]);
  useEffect(() => { rhythmRef.current = rhythmType; }, [rhythmType]);
  useEffect(() => { pausedRef.current = paused;     }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const setSize = (pw: number, ph: number) => {
      const cw = Math.max(1, Math.round(pw * dpr));
      const ch = Math.max(1, Math.round(ph * dpr));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width  = cw;
        canvas.height = ch;
      }
    };
    setSize(w, h);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      setSize(w, h);
      const now  = performance.now();
      const beat = getBeat(now, hrRef.current, rhythmRef.current, pausedRef.current);
      ctx.save();
      ctx.scale(dpr, dpr);
      drawSection(ctx, w, h, beat, rhythmRef.current);
      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);

  const isLethal = isLethalRhythm(rhythmType);

  return (
    <div
      data-testid="heart-cross-section"
      className="flex flex-col items-center"
    >
      <div
        className="relative select-none"
        style={{ width: w, height: h, borderRadius: 4, overflow: "hidden" }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: w, height: h, display: "block" }}
        />
        {/* Title bar */}
        <div
          style={{
            position: "absolute",
            top: 3, left: 0, right: 0,
            textAlign: "center",
            fontSize: Math.max(6, h * 0.038),
            fontFamily: "monospace",
            fontWeight: "bold",
            letterSpacing: "0.12em",
            color: isLethal
              ? "rgba(255,100,100,0.72)"
              : "rgba(0,255,65,0.55)",
            pointerEvents: "none",
          }}
        >
          CROSS-SECTION
        </div>
      </div>
    </div>
  );
}
