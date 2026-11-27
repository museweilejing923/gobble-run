// Sound effects, synthesized with the Web Audio API: no audio files to ship, nothing to
// load over the network. The context is created on the first user gesture (browsers block
// audio before one) and every effect is a short envelope over an oscillator.

export function createSound() {
  let context = null;
  let muted = false;

  function ensure() {
    if (context === null) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        context = new AudioContext();
      } catch {
        context = null;
      }
    }
    if (context !== null && context.state === 'suspended') context.resume();
    return context;
  }

  /** One blip: an oscillator sliding from `from` Hz to `to` Hz over `seconds`. */
  function blip(from, to, seconds, type, volume, delay) {
    const audio = ensure();
    if (audio === null || muted) return;
    const start = audio.currentTime + (delay || 0);
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  }

  /** A short burst of filtered noise, for thuds and landings. */
  function noise(seconds, volume, cutoff) {
    const audio = ensure();
    if (audio === null || muted) return;
    const start = audio.currentTime;
    const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start(start);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    jump() {
      blip(320, 640, 0.14, 'sine', 0.16);
    },
    corn() {
      blip(880, 1320, 0.09, 'triangle', 0.14);
      blip(1320, 1760, 0.08, 'triangle', 0.1, 0.06);
    },
    golden() {
      blip(660, 990, 0.1, 'triangle', 0.14);
      blip(990, 1320, 0.1, 'triangle', 0.12, 0.08);
      blip(1320, 1980, 0.14, 'triangle', 0.12, 0.16);
    },
    hit() {
      noise(0.22, 0.3, 420);
      blip(220, 70, 0.25, 'sawtooth', 0.16);
    },
    land() {
      noise(0.07, 0.1, 300);
    },
    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((note, i) => blip(note, note, 0.22, 'triangle', 0.16, i * 0.12));
    },
    over() {
      const notes = [392, 330, 262, 196];
      notes.forEach((note, i) => blip(note, note * 0.94, 0.24, 'sawtooth', 0.1, i * 0.16));
    },
  };
}
