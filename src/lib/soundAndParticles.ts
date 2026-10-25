// Deterministic particle geometry precomputed at module scope — NEVER call Math.random() during render.
export interface ParticleVector {
  id: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
  delay: number;
}

const PARTICLE_COLORS = ['#10B981', '#4F46E5', '#06B6D4', '#F59E0B', '#8B5CF6', '#34D399'];

export const DETERMINISTIC_PARTICLES: readonly ParticleVector[] = Array.from(
  { length: 12 },
  (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    const radius = index % 2 === 0 ? 34 : 22;
    return {
      id: index,
      dx: Math.round(Math.cos(angle) * radius),
      dy: Math.round(Math.sin(angle) * radius),
      size: index % 3 === 0 ? 6 : 4,
      color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
      delay: (index % 4) * 0.02,
    };
  }
);

export function playCompletionChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Two-tone warm ascending fifth (C5 -> G5)
    const freqs = [523.25, 783.99];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.085);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.085);
      gain.gain.exponentialRampToValueAtTime(0.09, now + idx * 0.085 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.085 + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.085);
      osc.stop(now + idx * 0.085 + 0.3);
    });
  } catch {
    // WebAudio blocked or unsupported — fail silently
  }
}

export function playTimerCompleteChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const freqs = [587.33, 739.99, 880.0];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.11 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.4);
    });
  } catch {
    // Ignore audio context failures
  }
}
