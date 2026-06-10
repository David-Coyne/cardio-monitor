import { useRef, useState, useCallback } from "react";

// ── Audio synthesis ───────────────────────────────────────────────────────────

function synthS1(ctx: AudioContext, at: number, vol = 0.9) {
  const t = at;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g2   = ctx.createGain();
  const mix  = ctx.createGain();
  const lpf  = ctx.createBiquadFilter();
  const env  = ctx.createGain();

  osc1.type = "sine";
  osc1.frequency.setValueAtTime(55, t);
  osc1.frequency.exponentialRampToValueAtTime(25, t + 0.15);

  osc2.type = "sine";
  osc2.frequency.setValueAtTime(82, t);
  osc2.frequency.exponentialRampToValueAtTime(38, t + 0.12);

  g2.gain.value = 0.45;

  lpf.type = "lowpass";
  lpf.frequency.value = 160;
  lpf.Q.value = 0.9;

  env.gain.setValueAtTime(0,         t);
  env.gain.linearRampToValueAtTime(vol * 0.7, t + 0.011);
  env.gain.setValueAtTime(vol * 0.7, t + 0.022);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);

  osc1.connect(mix);
  osc2.connect(g2);
  g2.connect(mix);
  mix.connect(lpf);
  lpf.connect(env);
  env.connect(ctx.destination);

  osc1.start(t); osc1.stop(t + 0.22);
  osc2.start(t); osc2.stop(t + 0.22);
}

function synthS2(ctx: AudioContext, at: number, vol = 0.55) {
  const t = at;

  const osc = ctx.createOscillator();
  const lpf = ctx.createBiquadFilter();
  const env = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(68, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.09);

  lpf.type = "lowpass";
  lpf.frequency.value = 200;
  lpf.Q.value = 1.0;

  env.gain.setValueAtTime(0,     t);
  env.gain.linearRampToValueAtTime(vol,    t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

  osc.connect(lpf);
  lpf.connect(env);
  env.connect(ctx.destination);

  osc.start(t); osc.stop(t + 0.15);
}

function synthAlarm(ctx: AudioContext, at: number, vol = 0.12, isVF = true) {
  const t = at;
  const tones = isVF ? [880, 1100] : [660];

  tones.forEach((freq, i) => {
    const delay = i * 0.10;
    const osc   = ctx.createOscillator();
    const env   = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = freq;

    env.gain.setValueAtTime(0,   t + delay);
    env.gain.linearRampToValueAtTime(vol, t + delay + 0.005);
    env.gain.setValueAtTime(vol, t + delay + 0.065);
    env.gain.linearRampToValueAtTime(0,   t + delay + 0.085);

    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.12);
  });
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useHeartSound() {
  const ctxRef      = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);
  const mutedRef    = useRef(true);
  const [muted, setMuted] = useState(true);

  const unlockAudio = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    unlockedRef.current = true;
  }, []);

  // Async-safe player: resumes the context if needed, then schedules the note
  // slightly in the future so the scheduler has a buffer even on slow resume.
  const safe = useCallback((fn: (ctx: AudioContext, at: number) => void) => {
    if (mutedRef.current || !unlockedRef.current || !ctxRef.current) return;
    const ctx = ctxRef.current;
    if (ctx.state === "closed") return;

    const play = () => {
      const at = ctx.currentTime + 0.015; // small look-ahead
      try { fn(ctx, at); } catch { /* ignore */ }
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  }, []);

  const playS1    = useCallback(() => safe((ctx, at) => synthS1(ctx, at)),           [safe]);
  const playS2    = useCallback(() => safe((ctx, at) => synthS2(ctx, at)),           [safe]);
  const playAlarm = useCallback((isVF: boolean) =>
    safe((ctx, at) => synthAlarm(ctx, at, 0.12, isVF)),                              [safe]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  }, []);

  return { playS1, playS2, playAlarm, muted, toggleMute, unlockAudio };
}
