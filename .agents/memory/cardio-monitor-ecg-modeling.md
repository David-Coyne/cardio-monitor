---
name: Cardio monitor ECG modeling approach
description: How ECG/12-lead waveforms are synthesized in artifacts/cardio-monitor, and the convention for adding ischaemia or lead-specific effects.
---

The cardio-monitor artifact's ECG traces (Lead II strip and the 12-lead grid) are built from hand-tuned gaussian pulses (P/QRS/T) layered together in `rhythmGenerators.ts`, not a physiological signal simulation.

**Why:** Real cardiac electrophysiology (vector-based 12-lead derivation, rhythm-specific conduction timing) is out of scope for an educational visualization tool. The gaussian-template approach is simple to reason about, easy to scale per-lead, and good enough to teach recognizable patterns (STEMI territories, arrhythmia shapes).

**How to apply:**
- Per-lead amplitude/polarity is a static scale factor vs. the Lead II reference (`LEAD12_QRS_SCALE`), not a true vector projection. New leads or views should follow this same "scale + add a bump" pattern rather than introducing real vector math.
- Ischaemic ST/T changes are additive gaussian bumps whose sign/magnitude encode elevation (positive) vs. reciprocal depression (negative) per lead/territory (`ISCHAEMIA_LEAD_FACTOR`, `leadIschaemiaBump`). Keep new territory or lead additions consistent with this signed-magnitude convention.
- The 12-lead view is an intentionally static "snapshot" (not synced to the live scrolling monitor rhythm/arrhythmia state) — this mirrors how real 12-leads are captured as a point-in-time printout, and avoids re-deriving irregular-rhythm timing (AF/PVC) across 12 traces.
