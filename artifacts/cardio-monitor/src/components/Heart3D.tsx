/**
 * Heart3D — anatomical 3-D heart renderer.
 *
 * Primary path: WebGL1 fragment-shader raymarching with PBR lighting,
 *               subsurface scattering, soft shadows and AO.
 * Fallback path: Canvas 2-D layered-gradient renderer that simulates 3-D
 *               lighting when WebGL is unavailable (sandboxed iframes, etc.).
 *
 * X-axis drag rotates the heart; beat/rhythm drive the animation.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { RhythmType } from "@/lib/rhythmGenerators";

interface Heart3DProps {
  heartRate: number;
  rhythmType: RhythmType;
  svgWidth?: number;
  svgHeight?: number;
  paused?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat helper
// ─────────────────────────────────────────────────────────────────────────────

function beatEnvelope(phase: number): number {
  if (phase < 0.27) return 0;
  if (phase < 0.37) return (phase - 0.27) / 0.10;
  if (phase < 0.60) return 1.0 - (phase - 0.37) / 0.23;
  return 0;
}

function getBeatStrength(now: number, heartRate: number, rhythmType: RhythmType): number {
  if (rhythmType === "VF") {
    return 0.07 + 0.11 * Math.abs(Math.sin(now * 0.011)) + 0.07 * Math.abs(Math.sin(now * 0.0082 + 1.3));
  }
  const beatMs = 60000 / heartRate;
  let phase: number;
  if (rhythmType === "AF") {
    const n   = Math.floor(now / beatMs);
    const irr = 0.18 * Math.sin(n * 1.6180339);
    phase = (now % (beatMs * (1 + irr))) / (beatMs * (1 + irr));
  } else {
    phase = (now % beatMs) / beatMs;
  }
  let str = beatEnvelope(phase);
  if (rhythmType === "PVC" && Math.floor(now / beatMs) % 2 === 1) str *= 0.22;
  return str;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGL shaders
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// GLSL ES 1.00: no return/break inside loops — use bool-guard pattern.
const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_beat;
uniform float u_xRot;
uniform float u_time;
uniform int   u_rhythm;

mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c);
}
float smin(float a, float b, float k) {
  float h = max(k - abs(a-b), 0.0) / k;
  return min(a,b) - h*h*k*0.25;
}
float sdEll(vec3 p, vec3 r) {
  float k0 = length(p/r), k1 = length(p/(r*r));
  return k0*(k0-1.0)/k1;
}
float h3(vec3 p) {
  p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p,p.yxz+33.33);
  return fract((p.x+p.y)*p.z);
}
float n3(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float hSDF(vec3 p, float b) {
  float ex = b*0.044;
  float lv = sdEll(p-vec3(-0.08,-0.10, 0.02),vec3(0.430+ex,  0.610+ex,  0.405+ex));
  float rv = sdEll(p-vec3( 0.26,-0.04, 0.08),vec3(0.245+ex*0.7,0.448+ex*0.7,0.272+ex*0.7));
  float la = sdEll(p-vec3(-0.22, 0.45,-0.12),vec3(0.232+ex*0.4,0.202+ex*0.4,0.252+ex*0.4));
  float ra = sdEll(p-vec3( 0.26, 0.43,-0.07),vec3(0.212+ex*0.3,0.198+ex*0.3,0.218+ex*0.3));
  float d  = smin(lv,rv,0.22); d=smin(d,la,0.16); d=smin(d,ra,0.14);
  return d + n3(p*5.5)*0.008 + n3(p*13.0)*0.004;
}
vec3 nrm(vec3 p, float b) {
  float e=0.0009;
  return normalize(vec3(hSDF(p+vec3(e,0,0),b)-hSDF(p-vec3(e,0,0),b),
                        hSDF(p+vec3(0,e,0),b)-hSDF(p-vec3(0,e,0),b),
                        hSDF(p+vec3(0,0,e),b)-hSDF(p-vec3(0,0,e),b)));
}
float ao(vec3 p, vec3 n, float b) {
  float a=0.0, s=1.0;
  for(int i=1;i<=5;i++){float h=0.01+0.14*float(i)/5.0; a+=max(0.0,h-hSDF(p+h*n,b))*s; s*=0.88;}
  return clamp(1.0-2.8*a,0.0,1.0);
}
float shd(vec3 ro, vec3 rd, float b) {
  float res=1.0,t=0.025; bool done=false;
  for(int i=0;i<14;i++){if(!done){float h=hSDF(ro+rd*t,b); if(h<0.001){res=0.0;done=true;}else{res=min(res,7.0*h/t);t+=clamp(h,0.012,0.18);if(t>2.6)done=true;}}}
  return clamp(res,0.0,1.0);
}
void main() {
  vec2 uv = (gl_FragCoord.xy/u_res)*2.0-1.0; uv.x *= u_res.x/u_res.y;
  mat3 R=rotX(u_xRot), iR=rotX(-u_xRot);
  vec3 ro_w=vec3(0.0,0.04,2.85), rd_w=normalize(vec3(uv,-1.76));
  vec3 ro=iR*ro_w, rd=iR*rd_w;
  float t=0.22; bool hit=false;
  for(int i=0;i<92;i++){if(!hit){float d=hSDF(ro+rd*t,u_beat);if(d<0.0007){hit=true;}else{if(t<5.8)t+=d;else t=5.8;}}}
  if(!hit){float v=1.0-dot(uv*0.32,uv*0.32);gl_FragColor=vec4(vec3(0.016,0.032,0.016)*max(v,0.0),1.0);return;}
  vec3 pos=ro+rd*t, N=nrm(pos,u_beat), Nw=R*N, Vw=-rd_w;
  float occ=ao(pos,N,u_beat);
  vec3 skin; if(u_rhythm==1)skin=vec3(0.28,0.04,0.05); else if(u_rhythm==2)skin=vec3(0.58,0.05,0.04); else skin=vec3(0.70,0.082,0.052);
  float thick=0.0; vec3 pi=pos; for(int j=0;j<8;j++){pi-=N*0.062;thick+=max(0.0,-hSDF(pi,u_beat));}
  float sss=clamp(thick/0.42,0.0,1.0);
  vec3 L1=normalize(vec3(1.5,2.2,2.4)),L2=normalize(vec3(-2.0,0.5,1.0)),L3=normalize(vec3(0.2,-1.5,-1.6));
  vec3 L1l=iR*L1;
  float d1=max(dot(Nw,L1),0.0),d2=max(dot(Nw,L2),0.0),d3=max(dot(Nw,L3),0.0);
  vec3 H1=normalize(L1+Vw),H2=normalize(L2+Vw);
  float sp1=pow(max(dot(Nw,H1),0.0),56.0),sp2=pow(max(dot(Nw,H2),0.0),24.0);
  float sh=shd(pos+N*0.013,L1l,u_beat);
  float fr=pow(1.0-max(dot(Nw,Vw),0.0),3.5);
  float ss=pow(max(dot(rd_w,L1),0.0),5.0);
  vec3 col=skin*(d1*sh*1.5*vec3(1.0,0.91,0.88)+d2*0.30*vec3(0.4,0.54,0.76)+d3*0.22*vec3(0.76,0.20,0.14)+vec3(0.10,0.018,0.016)*occ);
  col+=sp1*sh*vec3(1.0,0.93,0.90)*0.72+sp2*vec3(0.7,0.82,1.0)*0.14;
  col+=skin*sss*ss*vec3(1.0,0.28,0.14)*0.68+skin*sss*d2*vec3(0.8,0.22,0.12)*0.28;
  col+=fr*vec3(0.72,0.12,0.08)*0.28; col*=0.54+0.46*occ;
  col+=u_beat*fr*vec3(1.0,0.28,0.14)*0.42+u_beat*skin*d1*sh*vec3(1.0,0.4,0.28)*0.26;
  col=col/(col+1.0); col=pow(max(col,vec3(0.0)),vec3(1.0/2.2));
  gl_FragColor=vec4(col,1.0);
}`;

// ─────────────────────────────────────────────────────────────────────────────
// WebGL initialisation helper
// ─────────────────────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Heart3D shader:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas 2-D fallback — layered-gradient 3-D illusion
// ─────────────────────────────────────────────────────────────────────────────

/** Build the anatomical heart clipping path (relative coords, centered at origin). */
function heartPath(ctx: CanvasRenderingContext2D, rw: number, rh: number) {
  ctx.beginPath();
  // Start at top notch
  ctx.moveTo(0, -rh * 0.52);
  // Right atrium bump
  ctx.bezierCurveTo( rw*0.38, -rh*0.78,  rw*0.90, -rh*0.44,  rw*0.88, -rh*0.06);
  // Right body → apex
  ctx.bezierCurveTo( rw*0.92,  rh*0.20,  rw*0.65,  rh*0.52,  0,        rh*0.82);
  // Left body ← apex
  ctx.bezierCurveTo(-rw*0.65,  rh*0.52, -rw*0.92,  rh*0.20, -rw*0.88, -rh*0.06);
  // Left atrium bump
  ctx.bezierCurveTo(-rw*0.90, -rh*0.44, -rw*0.36, -rh*0.78,  0,       -rh*0.52);
  ctx.closePath();
}

function draw2D(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number,
  beat: number,
  xRot: number,
  rhythmType: RhythmType,
) {
  ctx.clearRect(0, 0, cw, ch);

  const cx = cw * 0.50;
  const cy = ch * 0.49;
  const rw = cw * 0.41;
  const rh = ch * 0.44;

  // Beat scale
  const bs = 1 + beat * 0.038;
  // X-axis rotation → foreshorten vertically
  const cosX = Math.max(0.15, Math.cos(xRot));

  // Color theme
  const isVF = rhythmType === "VF";
  const isVT = rhythmType === "VT";

  let c0: string, c1: string, c2: string;
  if (isVF)      { c0 = "#380808"; c1 = "#220404"; c2 = "#100202"; }
  else if (isVT) { c0 = "#8c0b0b"; c1 = "#6a0808"; c2 = "#3c0404"; }
  else           { c0 = "#c01212"; c1 = "#941010"; c2 = "#600a0a"; }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(bs, bs * (0.68 + 0.32 * cosX));

  // ── Layer 1: base fill (deep radial gradient) ─────────────────────────────
  const g1 = ctx.createRadialGradient(-rw*0.18, -rh*0.12, rh*0.08, -rw*0.18, -rh*0.12, rh*1.15);
  g1.addColorStop(0.0, c0);
  g1.addColorStop(0.55, c1);
  g1.addColorStop(1.0,  c2);
  heartPath(ctx, rw, rh);
  ctx.fillStyle = g1;
  ctx.fill();

  // ── Layer 2: key light (upper-right, warm) ────────────────────────────────
  const g2 = ctx.createRadialGradient(rw*0.28, -rh*0.55, 0, rw*0.28, -rh*0.55, rh*1.0);
  g2.addColorStop(0.00, "rgba(255,155,130,0.40)");
  g2.addColorStop(0.40, "rgba(200, 80, 70,0.14)");
  g2.addColorStop(1.00, "rgba(0,0,0,0)");
  heartPath(ctx, rw, rh);
  ctx.fillStyle = g2;
  ctx.fill();

  // ── Layer 3: fill light (left, cool) ─────────────────────────────────────
  const g3 = ctx.createRadialGradient(-rw*0.60, rh*0.05, 0, -rw*0.60, rh*0.05, rh*0.75);
  g3.addColorStop(0.00, "rgba(90,130,200,0.12)");
  g3.addColorStop(1.00, "rgba(0,0,0,0)");
  heartPath(ctx, rw, rh);
  ctx.fillStyle = g3;
  ctx.fill();

  // ── Layer 4: shadow (lower-left) ─────────────────────────────────────────
  const g4 = ctx.createRadialGradient(-rw*0.30, rh*0.48, rh*0.05, -rw*0.30, rh*0.48, rh*0.80);
  g4.addColorStop(0.00, "rgba(0,0,0,0.50)");
  g4.addColorStop(1.00, "rgba(0,0,0,0)");
  heartPath(ctx, rw, rh);
  ctx.fillStyle = g4;
  ctx.fill();

  // ── Layer 5: specular highlight (wet glistening surface) ─────────────────
  const g5 = ctx.createRadialGradient(rw*0.16, -rh*0.58, 0, rw*0.16, -rh*0.58, rh*0.18);
  g5.addColorStop(0.00, "rgba(255,220,200,0.58)");
  g5.addColorStop(0.50, "rgba(255,190,170,0.20)");
  g5.addColorStop(1.00, "rgba(255,190,170,0)");
  heartPath(ctx, rw, rh);
  ctx.fillStyle = g5;
  ctx.fill();

  // ── Layer 6: second smaller specular on the LA bump ──────────────────────
  const g6 = ctx.createRadialGradient(-rw*0.22, -rh*0.62, 0, -rw*0.22, -rh*0.62, rh*0.12);
  g6.addColorStop(0.00, "rgba(255,200,180,0.35)");
  g6.addColorStop(1.00, "rgba(255,200,180,0)");
  heartPath(ctx, rw, rh);
  ctx.fillStyle = g6;
  ctx.fill();

  // ── Layer 7: rim / subsurface scatter at edges ────────────────────────────
  const g7 = ctx.createRadialGradient(0, 0, rh*0.62, 0, 0, rh*1.05);
  g7.addColorStop(0.00, "rgba(0,0,0,0)");
  g7.addColorStop(0.72, "rgba(0,0,0,0)");
  g7.addColorStop(1.00, "rgba(160,24,12,0.32)");
  heartPath(ctx, rw, rh);
  ctx.fillStyle = g7;
  ctx.fill();

  // ── Layer 8: AV groove (dark crease between atria and ventricles) ─────────
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -rh*0.08, rw*0.82, rh*0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.restore();

  // ── Layer 9: interventricular groove (LV/RV boundary) ────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-rw*0.10, -rh*0.40);
  ctx.bezierCurveTo(-rw*0.06, 0, -rw*0.04, rh*0.28, -rw*0.01, rh*0.72);
  ctx.lineWidth = rw * 0.045;
  ctx.strokeStyle = "rgba(30,0,0,0.50)";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // ── Layer 10: beat pulse glow ─────────────────────────────────────────────
  if (beat > 0.08) {
    const g10 = ctx.createRadialGradient(0, 0, 0, 0, 0, rh * 1.05);
    g10.addColorStop(0.0,  `rgba(180,40,20,${(beat * 0.16).toFixed(3)})`);
    g10.addColorStop(1.0,  "rgba(0,0,0,0)");
    heartPath(ctx, rw, rh);
    ctx.fillStyle = g10;
    ctx.fill();
  }

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function Heart3D({
  heartRate,
  rhythmType,
  svgWidth,
  svgHeight,
  paused = false,
}: Heart3DProps) {
  const w = svgWidth  ?? 158;
  const h = svgHeight ?? 178;

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const xRotRef     = useRef(0.0);
  const dragRef     = useRef<{ y: number } | null>(null);
  const [xRotDeg, setXRotDeg] = useState(0); // slider state in degrees
  const pausedRef   = useRef(paused);
  const hrRef       = useRef(heartRate);
  const rhythmRef   = useRef(rhythmType);
  const wRef        = useRef(w);
  const hRef        = useRef(h);
  const rafRef      = useRef<number | null>(null);

  useEffect(() => { pausedRef.current = paused;     }, [paused]);
  useEffect(() => { hrRef.current     = heartRate;  }, [heartRate]);
  useEffect(() => { rhythmRef.current = rhythmType; }, [rhythmType]);
  useEffect(() => { wRef.current      = w;          }, [w]);
  useEffect(() => { hRef.current      = h;          }, [h]);

  // ── Renderer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;

    // Set pixel dimensions BEFORE getContext so WebGL doesn't see a 0×0 canvas.
    canvas.width  = Math.max(1, Math.round(wRef.current * dpr));
    canvas.height = Math.max(1, Math.round(hRef.current * dpr));

    // ── Try WebGL path ─────────────────────────────────────────────────────
    const gl = (
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    ) as WebGLRenderingContext | null;

    if (gl) {
      // ── Compile program ─────────────────────────────────────────────────
      const vert = compileShader(gl, gl.VERTEX_SHADER,   VERT);
      const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
      if (!vert || !frag) return;
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vert);
      gl.attachShader(prog, frag);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("Heart3D link:", gl.getProgramInfoLog(prog));
        return;
      }
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      gl.useProgram(prog);
      const aPos    = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      const uBeat   = gl.getUniformLocation(prog, "u_beat")!;
      const uXRot   = gl.getUniformLocation(prog, "u_xRot")!;
      const uTime   = gl.getUniformLocation(prog, "u_time")!;
      const uRhythm = gl.getUniformLocation(prog, "u_rhythm")!;
      const uRes    = gl.getUniformLocation(prog, "u_res")!;

      const setSize = (pw: number, ph: number) => {
        const cw = Math.max(1, Math.round(pw * dpr));
        const ch = Math.max(1, Math.round(ph * dpr));
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width  = cw; canvas.height = ch;
          gl.viewport(0, 0, cw, ch);
          gl.uniform2f(uRes, cw, ch);
        }
      };
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);

      const render = () => {
        setSize(wRef.current, hRef.current);
        const now    = performance.now();
        const beat   = pausedRef.current ? 0 : getBeatStrength(now, hrRef.current, rhythmRef.current);
        const rhythm = rhythmRef.current === "VF" ? 1 : rhythmRef.current === "VT" ? 2 : 0;
        gl.uniform1f(uBeat, beat);
        gl.uniform1f(uXRot, xRotRef.current);
        gl.uniform1f(uTime, now / 1000);
        gl.uniform1i(uRhythm, rhythm);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);

      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        gl.deleteProgram(prog); gl.deleteBuffer(buf);
      };
    }

    // ── Canvas 2-D fallback path ───────────────────────────────────────────
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;

    const setSize2 = (pw: number, ph: number) => {
      const cw = Math.max(1, Math.round(pw * dpr));
      const ch = Math.max(1, Math.round(ph * dpr));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width  = cw;
        canvas.height = ch;
      }
    };

    const render2 = () => {
      setSize2(wRef.current, hRef.current);
      const now  = performance.now();
      const beat = pausedRef.current ? 0 : getBeatStrength(now, hrRef.current, rhythmRef.current);
      draw2D(ctx2, canvas.width / dpr, canvas.height / dpr, beat, xRotRef.current, rhythmRef.current);
      rafRef.current = requestAnimationFrame(render2);
    };
    rafRef.current = requestAnimationFrame(render2);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pointer drag (x-axis rotation) ───────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.y;
    xRotRef.current = Math.max(-Math.PI * 0.52, Math.min(Math.PI * 0.52, xRotRef.current + dy * 0.013));
    dragRef.current.y = e.clientY;
    setXRotDeg(Math.round(xRotRef.current * 180 / Math.PI));
  }, []);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const isVF     = rhythmType === "VF";
  const isLethal = rhythmType === "VF" || rhythmType === "VT";
  const lblColor = isLethal ? "rgba(255,110,110,0.85)" : "rgba(210,230,210,0.88)";
  const coro     = "rgba(220,100,80,0.78)";

  return (
    <div className="flex flex-col items-center" data-testid="heart-animation">
      <div
        className="relative select-none"
        style={{ width: w, height: h, borderRadius: 4, overflow: "hidden" }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: w, height: h, display: "block", cursor: "grab", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />

        {/* VF overlay only */}
        {isVF && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <span style={{ fontSize: 9, letterSpacing: 2, fontFamily: "monospace", fontWeight: "bold", color: "rgba(255,50,50,0.62)" }}>
              FIBRILLATING
            </span>
          </div>
        )}

      </div>

      {/* X-axis rotation slider */}
      <div style={{ width: w, marginTop: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 6 }}>
          <span style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(100,160,100,0.6)", whiteSpace: "nowrap" }}>X</span>
          <input
            type="range"
            min={-90}
            max={90}
            step={1}
            value={xRotDeg}
            onChange={e => {
              const deg = Number(e.target.value);
              setXRotDeg(deg);
              xRotRef.current = deg * Math.PI / 180;
            }}
            style={{
              flex: 1,
              appearance: "none",
              WebkitAppearance: "none",
              height: 3,
              borderRadius: 2,
              background: `linear-gradient(to right, rgba(0,200,100,0.7) ${((xRotDeg + 90) / 180) * 100}%, rgba(40,60,40,0.6) ${((xRotDeg + 90) / 180) * 100}%)`,
              outline: "none",
              cursor: "pointer",
            }}
          />
          <span style={{ fontSize: 7, fontFamily: "monospace", color: "rgba(100,160,100,0.6)", minWidth: 22, textAlign: "right" }}>
            {xRotDeg > 0 ? `+${xRotDeg}°` : `${xRotDeg}°`}
          </span>
        </div>
      </div>

    </div>
  );
}
