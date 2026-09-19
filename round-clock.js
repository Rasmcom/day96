(function (root) {
  'use strict';
  // One deadline, shared by the question and its five-second answer reveal.
  // Tokens invalidate callbacks already queued when a round is ended or restarted.
  function createClock({ now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
    let handle, token = 0, deadline = 0, remaining = 0, active = false, paused = false, tick, elapsed;
    function left() { return active && !paused ? Math.max(0, deadline - now()) : remaining; }
    function stop() { cancel(handle); token++; active = false; paused = false; remaining = 0; }
    function pulse(version) {
      if (version !== token || !active || paused) return;
      remaining = left();
      tick?.(remaining);
      if (version !== token || !active || paused) return;
      if (remaining <= 0) { const done = elapsed; stop(); done?.(); return; }
      handle = schedule(() => pulse(version), Math.min(100, remaining));
    }
    return {
      start(ms, onTick, onElapsed) {
        stop(); remaining = Math.max(0, ms); deadline = now() + remaining;
        tick = onTick; elapsed = onElapsed; active = true; pulse(token);
      },
      stop,
      pause() { if (!active || paused) return; remaining = left(); paused = true; cancel(handle); token++; },
      resume() { if (!active || !paused) return; paused = false; deadline = now() + remaining; pulse(++token); },
      get remaining() { return left(); },
      get active() { return active; },
      get paused() { return paused; }
    };
  }
  root.QuizClock = { create: createClock };
})(typeof window === 'undefined' ? globalThis : window);
