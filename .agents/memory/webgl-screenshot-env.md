---
name: WebGL in Replit screenshot tool vs real browser
description: Replit's screenshot tool (headless Chrome) has no GPU — WebGL 2 fails, WebGL 1 works only via existing contexts. The user's actual browser preview supports WebGL 2 normally.
---

# WebGL environment behaviour in cardio-monitor

## The rule
The Replit `screenshot` tool uses headless Chrome with VENDOR=0xffff (no GPU).
- `canvas.getContext('webgl2')` → **null** (unavailable)
- `canvas.getContext('webgl')` → works ONLY if a context already exists; creating a fresh one fails with "BindToCurrentSequence failed"
- Three.js r163+ requires WebGL 2 — so `new THREE.WebGLRenderer()` fails in the screenshot tool

The **user's actual browser preview** has normal GPU access and WebGL 2 works fine.

**Why:** Headless Chrome in a sandbox container has no GPU process.

**How to apply:**
- A "WebGL 2 unavailable" fallback message in the screenshot is expected and acceptable.
- Do not downgrade Three.js to fix screenshot output — it works for real users.
- Console errors after restart are the ground truth: no errors = working for real users.
- Heart3D's raw WebGL 1 shader canvas works in screenshots because it calls `canvas.getContext('webgl')` on a canvas element that is already in the DOM tree (the existing context slot); Three.js fails because it tries to create a brand new context.
