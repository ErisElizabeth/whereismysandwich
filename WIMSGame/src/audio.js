export class GameAudio {
  constructor() { this.enabled = false; this.ctx = null; }
  unlock() {
    try {
      this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume().catch(() => {});
    } catch { this.enabled = false; }
  }
  play(kind) {
    if (!this.enabled || !this.ctx) return;
    const notes = {
      start: [440, 554, 659], hit: [150, 95], wrong: [300, 220],
      win: [523, 659, 784, 1047], lose: [330, 262, 196], check: [720],
    }[kind] || [440];
    notes.forEach((freq, i) => {
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const at = this.ctx.currentTime + i * 0.11;
      oscillator.type = kind === 'hit' ? 'sawtooth' : 'triangle';
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.065, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.15);
      oscillator.connect(gain).connect(this.ctx.destination);
      oscillator.start(at); oscillator.stop(at + 0.16);
    });
  }
}
