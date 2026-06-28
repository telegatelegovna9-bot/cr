let sharedAudioContext: AudioContext | null = null;

export function diffNewScreenerMatches(previous: string[], next: string[]): string[] {
  const previousSet = new Set(previous);
  return next.filter(key => !previousSet.has(key));
}

export function playScreenerBeep(): void {
  if (typeof window === 'undefined') return;

  const AudioContextCtor =
    window.AudioContext ||
    // @ts-expect-error webkit fallback
    window.webkitAudioContext;

  if (!AudioContextCtor) return;

  const ctx = sharedAudioContext ?? new AudioContextCtor();
  sharedAudioContext = ctx;

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.value = 880;
  gain.gain.value = 0.0001;

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.035, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc.start(now);
  osc.stop(now + 0.18);
}
