// ── Types ─────────────────────────────────────────────────────────────────────

export type RhythmType = 'SR' | 'ST' | 'SB' | 'AF' | 'SVT' | 'VT' | 'VF';

export interface WaveformData {
  ecgData:    number[];
  abpData:    number[];
  artData:    number[];       // Radial arterial line (Philips-style morphology)
  coData:     number[];
  beatSamples: number;        // mean samples per beat (for rAF cursor)
  beatSysArr: number[];       // ABSOLUTE systolic mmHg per beat
  beatDiaArr: number[];       // ABSOLUTE diastolic mmHg per beat
  beatCOArr:  number[];       // L/min per beat
}

export interface RhythmConfig {
  type:       RhythmType;
  label:      string;
  fullName:   string;
  defaultHR:  number;
  hrMin:      number;
  hrMax:      number;
  isLethal:   boolean;
  defaultSys: number;
  defaultDia: number;
  defaultCO:  number;
  // Canvas scale helpers
  ecgMinY:    number;
  ecgMaxY:    number;
  abpMinY:    number;
  abpMaxY:    number;
  coMinY:     number;
  coMaxY:     number;
}

export const RHYTHM_CONFIGS: RhythmConfig[] = [
  { type: 'SR',  label: 'SR',  fullName: 'Sinus Rhythm',               defaultHR: 72,  hrMin: 60,  hrMax: 100, isLethal: false, defaultSys: 120, defaultDia: 80, defaultCO: 5.2, ecgMinY: -0.45, ecgMaxY: 1.35, abpMinY: 55,  abpMaxY: 145, coMinY: -0.4, coMaxY: 6   },
  { type: 'ST',  label: 'ST',  fullName: 'Sinus Tachycardia',          defaultHR: 115, hrMin: 101, hrMax: 180, isLethal: false, defaultSys: 110, defaultDia: 72, defaultCO: 4.8, ecgMinY: -0.45, ecgMaxY: 1.35, abpMinY: 50,  abpMaxY: 135, coMinY: -0.4, coMaxY: 6   },
  { type: 'SB',  label: 'SB',  fullName: 'Sinus Bradycardia',          defaultHR: 48,  hrMin: 30,  hrMax: 59,  isLethal: false, defaultSys: 125, defaultDia: 82, defaultCO: 4.8, ecgMinY: -0.45, ecgMaxY: 1.35, abpMinY: 55,  abpMaxY: 150, coMinY: -0.4, coMaxY: 6   },
  { type: 'AF',  label: 'AF',  fullName: 'Atrial Fibrillation',        defaultHR: 120, hrMin: 60,  hrMax: 180, isLethal: false, defaultSys: 115, defaultDia: 75, defaultCO: 4.0, ecgMinY: -0.45, ecgMaxY: 1.35, abpMinY: 45,  abpMaxY: 140, coMinY: -0.4, coMaxY: 6   },
  { type: 'SVT', label: 'SVT', fullName: 'Supraventricular Tachycardia',                        defaultHR: 180, hrMin: 150, hrMax: 240, isLethal: false, defaultSys: 100, defaultDia: 70, defaultCO: 4.0, ecgMinY: -0.45, ecgMaxY: 1.35, abpMinY: 40,  abpMaxY: 130, coMinY: -0.4, coMaxY: 6   },
  { type: 'VT',  label: 'VT',  fullName: 'Ventricular Tachycardia',    defaultHR: 150, hrMin: 120, hrMax: 200, isLethal: true,  defaultSys: 90,  defaultDia: 60, defaultCO: 3.0, ecgMinY: -0.6,  ecgMaxY: 1.6,  abpMinY: 30,  abpMaxY: 120, coMinY: -0.4, coMaxY: 5   },
  { type: 'VF',  label: 'VF',  fullName: 'Ventricular Fibrillation',   defaultHR: 300, hrMin: 300, hrMax: 300, isLethal: true,  defaultSys: 40,  defaultDia: 25, defaultCO: 0.1, ecgMinY: -2.0,  ecgMaxY: 2.0,  abpMinY: 0,   abpMaxY: 80,  coMinY: -0.1, coMaxY: 0.5 },
];

// ── Shared helpers ─────────────────────────────────────────────────────────────

const SAMPLES      = 900;
const RESP_CYCLES  = 14 * 15 / 60; // 3.5 respiratory cycles per 15 s

const gaussian = (x: number, c: number, w: number, h: number) =>
  h * Math.exp(-((x - c) ** 2) / (2 * w ** 2));

// Deterministic pseudo-random in [0, 1)
const pr = (seed: number) =>
  Math.abs(Math.sin(seed * 127.1 + 311.7) * 43758.545 % 1);

// ── Philips IntelliVue–style radial arterial line sample ─────────────────────
// Characteristics: razor-sharp upstroke, narrow peak, pronounced dicrotic
// notch (~28% of pulse pressure), small dicrotic wave, smooth diastolic runoff.
// Peripheral amplification: sys +6%, dia −3 mmHg relative to central ABP.
function artSample(bp: number, sys: number, dia: number): number {
  const artSys = sys * 1.06;                  // peripheral pulse amplification
  const artDia = dia - 3;
  const pp     = artSys - artDia;

  let v = artDia;

  // Very narrow systolic peak — almost vertical upstroke on Philips display
  v += gaussian(bp, 0.362, 0.016, pp);

  // Anachrotic shoulder (subtle inflection on upstroke, common on radial traces)
  v += gaussian(bp, 0.330, 0.010, pp * 0.08);

  // Pronounced dicrotic notch — sharp V dip, ~28% of pulse pressure
  v -= gaussian(bp, 0.508, 0.009, pp * 0.28);

  // Dicrotic (secondary) wave — small rebound hump after the notch
  v += gaussian(bp, 0.565, 0.028, pp * 0.072);

  return v;
}

// VT variant: broad, weak peripheral pulse with blunted notch
function artSampleVT(bp: number, sys: number, dia: number): number {
  const pp = sys - dia;
  let v = dia;
  v += gaussian(bp, 0.400, 0.030, pp * 0.88);  // broader, reduced peak
  v -= gaussian(bp, 0.560, 0.013, pp * 0.15);   // notch less defined
  v += gaussian(bp, 0.620, 0.035, pp * 0.04);
  return v;
}

// ── Sinus family (SR, ST, SB) ─────────────────────────────────────────────────

function generateSinus(
  hr: number,
  baseSys: number,
  baseDia: number,
  baseCO: number,
): WaveformData {
  const bs        = 3600 / hr;
  const totalBeats = Math.ceil(SAMPLES / bs) + 2;

  const beatAmp = new Float32Array(totalBeats);
  const beatSys = new Float32Array(totalBeats);
  const beatDia = new Float32Array(totalBeats);
  const beatCO  = new Float32Array(totalBeats);

  for (let b = 0; b < totalBeats; b++) {
    const rp     = (b / (SAMPLES / bs)) * RESP_CYCLES * 2 * Math.PI;
    const respS  = Math.sin(rp);
    const jitter = pr(b) * 2 - 1;

    beatAmp[b] = 1 + 0.07 * respS + 0.015 * jitter;
    beatSys[b] = baseSys + 7 * respS + 2 * (pr(b + 500) * 2 - 1);
    beatDia[b] = baseDia + 3 * Math.cos(rp) + 1 * (pr(b + 1000) * 2 - 1);
    beatCO[b]  = baseCO  + 0.35 * respS + 0.1 * jitter;
  }

  const ecg = new Float32Array(SAMPLES);
  const abp = new Float32Array(SAMPLES);
  const art = new Float32Array(SAMPLES);
  const co  = new Float32Array(SAMPLES);

  for (let i = 0; i < SAMPLES; i++) {
    const bi  = Math.min(Math.floor(i / bs), totalBeats - 1);
    const bp  = (i - bi * bs) / bs;
    const rp  = (i / SAMPLES) * RESP_CYCLES * 2 * Math.PI;
    const amp = beatAmp[bi];

    const wander   = 0.055 * Math.sin(rp) + 0.018 * Math.sin(rp * 0.7 + 1.1);
    const artifact = 0.010 * Math.sin(60 * 2 * Math.PI * (i / 60));

    let e = wander + artifact;
    e += gaussian(bp, 0.13,  0.018, 0.18 * amp);
    e += gaussian(bp, 0.265, 0.006, -0.18 * amp);
    e += gaussian(bp, 0.285, 0.009,  1.15 * amp);
    e += gaussian(bp, 0.305, 0.007, -0.32 * amp);
    e += gaussian(bp, 0.52,  0.045,  0.28 * amp);
    e += gaussian(bp, 0.68,  0.022,  0.04);
    ecg[i] = e;

    const sys = beatSys[bi];
    const dia = beatDia[bi];
    let a = dia;
    a += gaussian(bp, 0.38,  0.048, sys - dia - 5);
    a -= gaussian(bp, 0.54,  0.014, 8);
    a += gaussian(bp, 0.62,  0.07,  (sys - dia) * 0.18);
    abp[i] = a;

    art[i] = artSample(bp, sys, dia);

    co[i] = gaussian(bp, 0.44, 0.075, beatCO[bi]);
  }

  return {
    ecgData: Array.from(ecg), abpData: Array.from(abp), artData: Array.from(art), coData: Array.from(co),
    beatSamples: bs,
    beatSysArr: Array.from(beatSys),
    beatDiaArr: Array.from(beatDia),
    beatCOArr:  Array.from(beatCO),
  };
}

// ── Atrial Fibrillation ───────────────────────────────────────────────────────

function generateAF(hr: number): WaveformData {
  const meanBS = 3600 / hr;

  // Pre-generate irregular beat start positions
  const beatStarts: number[] = [];
  const beatLens:   number[] = [];
  let cursor = 0;
  let b = 0;

  while (cursor < SAMPLES + meanBS * 4) {
    // Irregularly irregular: RR varies 55–145 % of mean (classic AF)
    const rrFactor = 0.55 + pr(b * 7 + 13) * 0.90;
    const rr       = Math.round(meanBS * rrFactor);
    beatStarts.push(cursor);
    beatLens.push(rr);
    cursor += rr;
    b++;
  }

  const nBeats   = beatStarts.length;
  const beatSys  = new Float32Array(nBeats);
  const beatDia  = new Float32Array(nBeats);
  const beatCO   = new Float32Array(nBeats);

  for (let bi = 0; bi < nBeats; bi++) {
    // Shorter preceding RR → less ventricular filling → lower BP & CO
    const rrRatio  = beatLens[bi] / meanBS;
    const starling = (rrRatio - 1) * 10;   // Starling effect ±10 mmHg
    beatSys[bi]    = 115 + starling + 4 * (pr(bi + 200) * 2 - 1);
    beatDia[bi]    = 75  + starling * 0.4 + 2 * (pr(bi + 300) * 2 - 1);
    beatCO[bi]     = 4.0 + rrRatio * 0.4  + 0.15 * (pr(bi + 400) * 2 - 1);
  }

  // Map each sample → beat index (O(n))
  const sampleBI  = new Int32Array(SAMPLES);
  const sampleBP  = new Float32Array(SAMPLES);
  let cur = 0;
  for (let i = 0; i < SAMPLES; i++) {
    while (cur < nBeats - 2 && i >= beatStarts[cur + 1]) cur++;
    sampleBI[i] = cur;
    sampleBP[i] = (i - beatStarts[cur]) / beatLens[cur];
  }

  // Fibrillatory baseline (f-waves): mix of 4, 5.5, 7 Hz sinusoids
  // 60 samples/s → period = 60/freq samples
  const fWave = (i: number) =>
    0.08 * Math.sin(2 * Math.PI * i / 15.0)     // 4 Hz
    + 0.065 * Math.sin(2 * Math.PI * i / 10.9 + 1.3) // 5.5 Hz
    + 0.05  * Math.sin(2 * Math.PI * i / 8.57 + 2.1)  // 7 Hz
    + 0.04  * Math.sin(2 * Math.PI * i / 12.0 + 0.7);  // 5 Hz

  const ecg = new Float32Array(SAMPLES);
  const abp = new Float32Array(SAMPLES);
  const art = new Float32Array(SAMPLES);
  const co  = new Float32Array(SAMPLES);

  for (let i = 0; i < SAMPLES; i++) {
    const bi  = sampleBI[i];
    const bp  = sampleBP[i];
    const rrR = beatLens[bi] / meanBS;
    const amp = Math.min(1.15, 0.85 + rrR * 0.25);   // Ashman phenomenon

    let e = fWave(i);
    e += gaussian(bp, 0.26,  0.005, -0.12 * amp);
    e += gaussian(bp, 0.275, 0.009,  0.95 * amp);
    e += gaussian(bp, 0.292, 0.006, -0.22 * amp);
    e += gaussian(bp, 0.50,  0.042,  0.20 * amp);
    ecg[i] = e;

    const sys = beatSys[bi];
    const dia = beatDia[bi];
    let a = dia;
    a += gaussian(bp, 0.38, 0.050, sys - dia - 5);
    a -= gaussian(bp, 0.54, 0.014, 8);
    a += gaussian(bp, 0.62, 0.07,  (sys - dia) * 0.18);
    abp[i] = a;

    art[i] = artSample(bp, sys, dia);

    co[i] = gaussian(bp, 0.44, 0.075, beatCO[bi]);
  }

  return {
    ecgData: Array.from(ecg), abpData: Array.from(abp), artData: Array.from(art), coData: Array.from(co),
    beatSamples: meanBS,
    beatSysArr: Array.from(beatSys),
    beatDiaArr: Array.from(beatDia),
    beatCOArr:  Array.from(beatCO),
  };
}

// ── SVT ───────────────────────────────────────────────────────────────────────

function generateSVT(hr: number): WaveformData {
  const bs         = 3600 / hr;
  const totalBeats = Math.ceil(SAMPLES / bs) + 2;
  const beatSys    = new Float32Array(totalBeats).fill(100).map((v, b) => v + 3 * (pr(b + 7) * 2 - 1));
  const beatDia    = new Float32Array(totalBeats).fill(70).map((v, b)  => v + 2 * (pr(b + 17) * 2 - 1));
  const beatCO     = new Float32Array(totalBeats).fill(4.0).map((v, b) => v + 0.1 * (pr(b + 37) * 2 - 1));

  const ecg = new Float32Array(SAMPLES);
  const abp = new Float32Array(SAMPLES);
  const art = new Float32Array(SAMPLES);
  const co  = new Float32Array(SAMPLES);

  for (let i = 0; i < SAMPLES; i++) {
    const bi = Math.min(Math.floor(i / bs), totalBeats - 1);
    const bp = (i - bi * bs) / bs;

    // No P before QRS; retrograde P (negative) visible just after QRS
    let e = 0;
    e += gaussian(bp, 0.265, 0.006, -0.14);
    e += gaussian(bp, 0.280, 0.009,  1.05);
    e += gaussian(bp, 0.300, 0.006, -0.28);
    // Retrograde P (inverted, 60-80 ms after R)
    e += gaussian(bp, 0.38,  0.018, -0.12);
    e += gaussian(bp, 0.50,  0.040,  0.18);
    ecg[i] = e;

    const sys = beatSys[bi];
    const dia = beatDia[bi];
    let a = dia;
    a += gaussian(bp, 0.38, 0.048, sys - dia - 5);
    a -= gaussian(bp, 0.54, 0.014, 6);
    a += gaussian(bp, 0.62, 0.07,  (sys - dia) * 0.15);
    abp[i] = a;

    art[i] = artSample(bp, sys, dia);

    co[i] = gaussian(bp, 0.44, 0.075, beatCO[bi]);
  }

  return {
    ecgData: Array.from(ecg), abpData: Array.from(abp), artData: Array.from(art), coData: Array.from(co),
    beatSamples: bs,
    beatSysArr: Array.from(beatSys),
    beatDiaArr: Array.from(beatDia),
    beatCOArr:  Array.from(beatCO),
  };
}

// ── Ventricular Tachycardia ───────────────────────────────────────────────────

function generateVT(hr: number): WaveformData {
  const bs         = 3600 / hr;
  const totalBeats = Math.ceil(SAMPLES / bs) + 2;
  const beatSys    = new Float32Array(totalBeats).fill(90).map((v, b)  => v + 5 * (pr(b + 11) * 2 - 1));
  const beatDia    = new Float32Array(totalBeats).fill(60).map((v, b)  => v + 3 * (pr(b + 22) * 2 - 1));
  const beatCO     = new Float32Array(totalBeats).fill(3.0).map((v, b) => v + 0.2 * (pr(b + 33) * 2 - 1));

  const ecg = new Float32Array(SAMPLES);
  const abp = new Float32Array(SAMPLES);
  const art = new Float32Array(SAMPLES);
  const co  = new Float32Array(SAMPLES);

  for (let i = 0; i < SAMPLES; i++) {
    const bi = Math.min(Math.floor(i / bs), totalBeats - 1);
    const bp = (i - bi * bs) / bs;

    // Wide QRS: broad monophasic positive (LBBB-like morphology)
    // No P waves, discordant (negative) T wave
    let e = 0;
    e += gaussian(bp, 0.22,  0.055,  1.10);   // broad R wave (wide QRS)
    e += gaussian(bp, 0.34,  0.030,  0.35);   // slurred late activation
    e += gaussian(bp, 0.60,  0.060, -0.42);   // discordant T (negative)
    ecg[i] = e;

    const sys = beatSys[bi];
    const dia = beatDia[bi];
    let a = dia;
    a += gaussian(bp, 0.40, 0.050, sys - dia - 5);
    a -= gaussian(bp, 0.56, 0.014, 5);
    a += gaussian(bp, 0.65, 0.07,  (sys - dia) * 0.14);
    abp[i] = a;

    art[i] = artSampleVT(bp, sys, dia);

    co[i] = gaussian(bp, 0.46, 0.080, beatCO[bi]);
  }

  return {
    ecgData: Array.from(ecg), abpData: Array.from(abp), artData: Array.from(art), coData: Array.from(co),
    beatSamples: bs,
    beatSysArr: Array.from(beatSys),
    beatDiaArr: Array.from(beatDia),
    beatCOArr:  Array.from(beatCO),
  };
}

// ── Ventricular Fibrillation ───────────────────────────────────────────────────

function generateVF(): WaveformData {
  const ecg = new Float32Array(SAMPLES);
  const abp = new Float32Array(SAMPLES);
  const art = new Float32Array(SAMPLES);
  const co  = new Float32Array(SAMPLES);

  // Coarse VF: overlapping sinusoids at 3-8 Hz + pseudo-noise
  // 60 samples/s → period (samples) = 60/freq
  for (let i = 0; i < SAMPLES; i++) {
    let v = 0;
    v += 0.55 * Math.sin(2 * Math.PI * i / 20.0 + 0.30);   // 3 Hz
    v += 0.48 * Math.sin(2 * Math.PI * i / 12.0 + 1.70);   // 5 Hz
    v += 0.38 * Math.sin(2 * Math.PI * i / 8.57 + 0.90);   // 7 Hz
    v += 0.32 * Math.sin(2 * Math.PI * i / 14.3 + 2.30);   // 4.2 Hz
    v += 0.22 * Math.sin(2 * Math.PI * i / 10.0 + 1.10);   // 6 Hz
    v += 0.18 * (pr(i + 77) * 2 - 1);                       // high-freq noise
    ecg[i] = v;

    // Agonal arterial trace — near-flatline with tiny oscillation
    abp[i] = 35 + 6 * Math.sin(2 * Math.PI * i / 90 + 0.5)
                + 3 * (pr(i + 444) * 2 - 1);

    // ART in VF: agonal flatline, essentially no pulsatile waveform
    art[i] = 28 + 4 * Math.sin(2 * Math.PI * i / 95 + 1.2)
                + 2 * (pr(i + 888) * 2 - 1);

    // Essentially zero CO
    co[i] = 0.05 + 0.04 * Math.sin(2 * Math.PI * i / 30);
  }

  return {
    ecgData: Array.from(ecg), abpData: Array.from(abp), artData: Array.from(art), coData: Array.from(co),
    beatSamples: 12,
    beatSysArr: [40],
    beatDiaArr: [25],
    beatCOArr:  [0.1],
  };
}

// ── Public dispatcher ─────────────────────────────────────────────────────────

export function generateWaveforms(hr: number, rhythm: RhythmType): WaveformData {
  switch (rhythm) {
    case 'SR':  return generateSinus(hr, 120, 80, 5.2);
    case 'ST':  return generateSinus(hr, 110, 72, 4.8);
    case 'SB':  return generateSinus(hr, 125, 82, 4.8);
    case 'AF':  return generateAF(hr);
    case 'SVT': return generateSVT(hr);
    case 'VT':  return generateVT(hr);
    case 'VF':  return generateVF();
  }
}
