/**
 * HeartGLB — renders realistic_human_heart.glb using vanilla Three.js.
 *
 * Pre-creates the WebGL 2 context and passes it to THREE.WebGLRenderer to avoid
 * the "BindToCurrentSequence" error in sandboxed environments.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RhythmType, IschaemiaZone } from "@/lib/rhythmGenerators";


interface HeartGLBProps {
  heartRate:      number;
  rhythmType:     RhythmType;
  svgWidth?:      number;
  svgHeight?:     number;
  paused?:        boolean;
  crossSection?:  boolean;
  ischaemiaZone?: IschaemiaZone;
  resetRef?:      React.MutableRefObject<(() => void) | null>;
}

function beatEnvelope(phase: number): number {
  if (phase < 0.27) return 0;
  if (phase < 0.37) return (phase - 0.27) / 0.10;
  if (phase < 0.60) return 1.0 - (phase - 0.37) / 0.23;
  return 0;
}

// Data-buffer constants — must match rhythmGenerators.ts / WaveformCanvas.tsx
const LOOP_MS  = 15000; // ms per data loop
const SAMPLES  = 900;   // samples per loop

function getBeatStrength(now: number, heartRate: number, rhythmType: RhythmType): number {
  if (rhythmType === "VF") {
    // VF: fibrillatory quiver — keep as absolute-clock noise (no beat phase)
    return 0.07 + 0.11 * Math.abs(Math.sin(now * 0.011)) + 0.07 * Math.abs(Math.sin(now * 0.0082 + 1.3));
  }
  if (rhythmType === "PEA") return 0;

  // Derive beat phase from the same 15-second data-buffer time base used by the
  // canvas renderers.  This keeps the heart animation sample-locked with the ECG
  // and ABP sweeps regardless of HR or how long the page has been running.
  const bs     = SAMPLES / heartRate * 60; // samples per beat = 3600 / HR
  const sample = (now % LOOP_MS) / LOOP_MS * SAMPLES;

  let phase: number;
  if (rhythmType === "AF") {
    const beatIdx = Math.floor(sample / bs);
    const irr     = 0.18 * Math.sin(beatIdx * 1.6180339);
    const bsIrr   = bs * (1 + irr);
    phase = (sample % bsIrr) / bsIrr;
  } else {
    phase = (sample % bs) / bs;
  }

  let str = beatEnvelope(phase);
  if (rhythmType === "PVC" && Math.floor(sample / bs) % 2 === 1) str *= 0.22;
  return str;
}

export function HeartGLB({
  heartRate,
  rhythmType,
  svgWidth,
  svgHeight,
  paused = false,
  crossSection = false,
  ischaemiaZone: _ischaemiaZone,
  resetRef,
}: HeartGLBProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ heartRate, rhythmType, paused, crossSection });
  propsRef.current = { heartRate, rhythmType, paused, crossSection };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth  || svgWidth  || 320;
    const H = container.clientHeight || svgHeight || 400;
    const dpr = window.devicePixelRatio || 1;

    // ── Canvas + pre-created WebGL 1 context (same pattern as Heart3D) ────────
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;

    if (!gl) {
      canvas.remove();
      const msg = document.createElement('div');
      msg.textContent = 'WebGL 2 unavailable';
      msg.style.cssText = 'color:#555;font-size:10px;padding:12px;font-family:monospace';
      container.appendChild(msg);
      return;
    }

    // ── Three.js renderer re-using our pre-created WebGL 2 context ────────────
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl,
        antialias: false,
        alpha: true,
      });
    } catch {
      canvas.remove();
      const msg = document.createElement('div');
      msg.textContent = '3D unavailable';
      msg.style.cssText = 'color:#555;font-size:10px;padding:12px;font-family:monospace';
      container.appendChild(msg);
      return;
    }
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false); // false = don't override canvas style
    renderer.shadowMap.enabled = false; // keep it lean
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.localClippingEnabled = true;

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d1e30');

    // ── Camera ────────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.001, 100);
    camera.position.set(0, 0, 4);

    // ── Lights ────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const key = new THREE.DirectionalLight(0xffe5c8, 2.0);
    key.position.set(1.5, 2.5, 2);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xc0d0ff, 0.5);
    fill.position.set(-2, 0.5, 1);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xff2020, 0.4);
    rim.position.set(0, -2, -1.5);
    scene.add(rim);

    // ── OrbitControls ─────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.5;
    controls.maxDistance = 12;
    controls.autoRotate = false;

    // ── Clipping plane (cross-section) ────────────────────────────────────────
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    let currentClip: THREE.Plane[] = [];

    // ── Model root ────────────────────────────────────────────────────────────
    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    let modelMeshes: THREE.Mesh[] = [];
    let defaultCamPos = new THREE.Vector3(0, 0, 4);
    const defaultTarget = new THREE.Vector3(0, 0, 0);
    let lastBeat = 0;

    // ── Suppress Three.js internal resource loading errors ────────────────────
    const prevOnError = THREE.DefaultLoadingManager.onError;
    THREE.DefaultLoadingManager.onError = (url) => {
      console.warn('HeartGLB: resource load error (suppressed):', url);
    };

    // ── Load GLB ─────────────────────────────────────────────────────────────
    const loader = new GLTFLoader();
    loader.load('/models/realistic_human_heart.glb', (gltf) => {
      const model = gltf.scene;


      // Normalise: centre + scale to ~1.8 unit diameter
      const box    = new THREE.Box3().setFromObject(model);
      const size   = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const s      = 2.34 / maxDim;
      model.scale.setScalar(s);
      model.position.sub(centre.multiplyScalar(s));

      model.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        modelMeshes.push(obj);
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.roughness = Math.min((mat.roughness ?? 0.7), 0.8);
          mat.metalness = Math.min((mat.metalness ?? 0.0), 0.1);
          mat.clippingPlanes = currentClip;
          mat.needsUpdate = true;
        }
      });

      modelRoot.add(model);

      // Set camera distance from bounding sphere
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const dist   = (sphere.radius * s * 1.85) / Math.tan(THREE.MathUtils.degToRad(22.5));
      camera.position.set(0, 0.1, dist);
      defaultCamPos = camera.position.clone();
      controls.update();
    }, undefined, (err) => {
      console.warn('HeartGLB: failed to load GLB', err);
    });

    // ── Reset callback ────────────────────────────────────────────────────────
    if (resetRef) {
      resetRef.current = () => {
        camera.position.copy(defaultCamPos);
        controls.target.copy(defaultTarget);
        controls.update();
      };
    }

    // ── Resize observer ───────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    // ── Render loop ───────────────────────────────────────────────────────────
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      try {
        const { heartRate: hr, rhythmType: rt, paused: isPaused, crossSection: cs } = propsRef.current;

        // Update clipping if changed
        const wantClip = cs ? [clipPlane] : [];
        if (wantClip.length !== currentClip.length) {
          currentClip = wantClip;
          modelMeshes.forEach(m => {
            (m.material as THREE.MeshStandardMaterial).clippingPlanes = currentClip;
            (m.material as THREE.MeshStandardMaterial).needsUpdate = true;
          });
        }

        if (!isPaused) {
          const now  = performance.now();
          const beat = getBeatStrength(now, hr, rt);

          const sc = 1.0 + 0.045 * beat;
          modelRoot.scale.setScalar(sc);

          if (modelMeshes.length > 0) {
            if (beat > 0.55 && lastBeat <= 0.55) {
              modelMeshes.forEach(m => {
                const mat = m.material as THREE.MeshStandardMaterial;
                if (mat?.emissive) mat.emissive.setHex(0x2a0000);
              });
            } else if (beat < 0.08 && lastBeat >= 0.08) {
              modelMeshes.forEach(m => {
                const mat = m.material as THREE.MeshStandardMaterial;
                if (mat?.emissive) mat.emissive.setHex(0x000000);
              });
            }
          }
          lastBeat = beat;
        }

        controls.update();
        renderer.render(scene, camera);
      } catch (e) {
        console.warn('HeartGLB render error:', e);
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (resetRef) resetRef.current = null;
      THREE.DefaultLoadingManager.onError = prevOnError;
      try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ok */ }
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: 'transparent', overflow: 'hidden' }}
    />
  );
}
