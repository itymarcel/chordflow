// Minimal stub for Tone.js — only Magenta's audio-playback code uses Tone.
// We only use MusicRNN inference, so playback classes are never called.
class Noop {
  connect() { return this; }
  disconnect() { return this; }
  dispose() {}
  toDestination() { return this; }
  sync() { return this; }
  triggerAttack() {}
  triggerRelease() {}
  triggerAttackRelease() {}
  chain() { return this; }
}

const Transport = {
  bpm: { value: 120 },
  start() {},
  stop() {},
  pause() {},
  cancel() {},
  scheduleRepeat() { return 0; },
  schedule() { return 0; },
  clear() {},
};

module.exports = new Proxy({ Transport }, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === '__esModule') return false;
    if (key === Symbol.toStringTag) return undefined;
    return Noop;
  },
});
