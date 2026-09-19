(() => {
  'use strict';
  const canvas = document.getElementById('effects-canvas');
  const context = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#d4ea65', '#f0cc68', '#fffdf6', '#7dd3bf', '#a68ccc', '#d78164'];
  let frame = 0, particles = [], lastTime = 0, width = 0, height = 0, started = 0;
  function size() {
    width = innerWidth; height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function clean() { cancelAnimationFrame(frame); frame = 0; particles = []; context?.clearRect(0, 0, width, height); }
  function add(x, y, angle, speed, color, shape = 'ribbon') {
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, life: 0, ttl: 2.3 + Math.random() * 1.4, w: 4 + Math.random() * 7, h: 8 + Math.random() * 12, angle: Math.random() * Math.PI, spin: (Math.random() - .5) * 14, shape });
  }
  function tick(time) {
    const delta = Math.min((time - lastTime) / 1000 || .016, .032); lastTime = time;
    context.clearRect(0, 0, width, height);
    particles = particles.filter(p => p.life < p.ttl && p.y < height + 70);
    for (const p of particles) {
      p.life += delta; p.vy += 340 * delta; p.vx *= Math.pow(.991, delta * 60); p.x += p.vx * delta; p.y += p.vy * delta; p.angle += p.spin * delta;
      context.save(); context.globalAlpha = Math.min(1, (p.ttl - p.life) * 1.6); context.translate(p.x, p.y); context.rotate(p.angle); context.fillStyle = p.color;
      if (p.shape === 'spark') { context.beginPath(); context.ellipse(0, 0, p.w * .35, p.h * .4, 0, 0, Math.PI * 2); context.fill(); }
      else { context.scale(Math.cos(p.life * 8) * .45 + .6, 1); context.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      context.restore();
    }
    if (particles.length && time - started < 6500) frame = requestAnimationFrame(tick); else clean();
  }
  function burst(type = 'correct', accent = colors[0]) {
    if (!context || reduce.matches || document.hidden || document.body.classList.contains('motion-paused')) return;
    clean(); size();
    const n = innerWidth < 700 ? 48 : 86;
    for (let i = 0; i < n; i++) {
      const color = i % 3 === 0 ? accent : colors[i % colors.length];
      add(-12, height * .72, -Math.PI * (.1 + Math.random() * .36), 410 + Math.random() * 390, color);
      add(width + 12, height * .72, -Math.PI * (.55 + Math.random() * .35), 410 + Math.random() * 390, color);
    }
    if (type !== 'entry') for (let i = 0; i < n; i++) add(width * .5, height * .35, Math.random() * Math.PI * 2, 70 + Math.random() * 260, colors[i % colors.length], 'spark');
    if (type === 'win') for (let i = 0; i < n; i++) add(Math.random() * width, -25, Math.PI / 2, 80 + Math.random() * 150, colors[i % colors.length]);
    started = lastTime = performance.now(); frame = requestAnimationFrame(tick);
  }
  addEventListener('resize', () => { if (frame) size(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clean(); });
  reduce.addEventListener?.('change', () => { if (reduce.matches) clean(); });
  window.ArenaEffects = { burst, clear: clean };
})();
