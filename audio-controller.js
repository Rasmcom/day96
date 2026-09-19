(function (root) {
  'use strict';
  class QuizAudio {
    constructor(element, originalUrl, onChange) {
      this.element = element; this.originalUrl = originalUrl; this.onChange = onChange;
      this.volume = .35; this.duck = 1; this.muted = false; this.desired = false;
      this.playing = false; this.pending = false; this.message = 'اضغط تشغيل لبدء الصوت.';
      this.request = 0; this.sourceVersion = 0; this.localUrl = null; this.cachedUrl = null;
      this.original = true; this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      this.bind(element); this.applyVolume();
    }
    get canSetVolume() { return Boolean(this.gain) || !this.isIOS; }
    get audible() { return this.playing && !this.muted && (!this.canSetVolume || this.volume > 0); }
    emit() { this.onChange?.(this); }
    bind(element) {
      const listen = (type, callback) => element.addEventListener(type, () => { if (element === this.element) callback(); });
      listen('playing', () => {
        if (!this.desired) { element.pause(); return; }
        clearTimeout(this.timeout); this.pending = false; this.playing = true;
        this.message = this.muted ? 'الصوت مكتوم.' : 'الصوت قيد التشغيل.'; this.emit();
      });
      listen('pause', () => {
        if (!element.paused) return;
        this.playing = false;
        if (!this.pending) { this.desired = false; this.request++; this.message = 'الصوت متوقف.'; }
        this.emit();
      });
      listen('waiting', () => { if (this.desired) { this.pending = true; this.playing = false; this.message = 'جارٍ تحميل الصوت…'; this.armTimeout(this.request); this.emit(); } });
      listen('error', () => { if (this.desired) this.fail(this.request); });
      listen('ended', () => this.stop());
    }
    contextForGesture() {
      const Context = root.AudioContext || root.webkitAudioContext;
      try {
        if (!this.context && Context) this.context = new Context();
        return this.context ? this.context.resume() : Promise.resolve();
      } catch { return Promise.resolve(); }
    }
    connectGain() {
      // Same-origin assets, local files and CORS-fetched blobs may enter Web Audio.
      // Routing an opaque external media URL here would produce silence.
      const sameOrigin = Boolean(root.location?.origin && this.element.src.startsWith(`${root.location.origin}/`));
      if (this.gain || !this.context || (!sameOrigin && !this.element.src.startsWith('blob:'))) return;
      this.source = this.context.createMediaElementSource(this.element);
      this.gain = this.context.createGain(); this.source.connect(this.gain); this.gain.connect(this.context.destination);
      this.applyVolume();
    }
    applyVolume() {
      const value = this.muted ? 0 : this.volume * this.duck;
      this.element.muted = this.muted || (this.canSetVolume && this.volume === 0);
      if (this.gain) { this.element.volume = 1; this.gain.gain.setValueAtTime(value, this.context.currentTime); }
      else this.element.volume = value;
    }
    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, value)); this.muted = this.volume === 0;
      this.applyVolume(); this.emit();
    }
    setDuck(value) { this.duck = value; this.applyVolume(); }
    armTimeout(request) { clearTimeout(this.timeout); this.timeout = setTimeout(() => this.fail(request), 12000); }
    fail(request) {
      if (request !== this.request) return;
      this.stop(); this.message = this.original ? 'تعذر تحميل الصوت. أعد المحاولة أو اختر ملف الصوت من جهازك.' : 'تعذر تشغيل الملف. جرّب ملف MP3 أو M4A آخر.'; this.emit();
    }
    play() {
      const request = ++this.request;
      this.desired = true; this.pending = true; this.message = 'جارٍ تشغيل الصوت…'; this.emit(); this.armTimeout(request);
      const resumed = this.contextForGesture();
      try {
        this.connectGain(); this.applyVolume();
        // Both calls happen inside the tap handler, preserving iOS user activation.
        const started = this.element.play();
        Promise.all([started, resumed]).then(() => {
          if (request !== this.request || !this.desired) return;
          if (this.gain && this.context.state !== 'running') { this.fail(request); return; }
          this.pending = false; this.playing = !this.element.paused;
          clearTimeout(this.timeout); this.message = this.muted ? 'الصوت مكتوم.' : 'الصوت قيد التشغيل.'; this.emit();
        }).catch(() => this.fail(request));
        if (this.original) this.prepareOriginal(request);
      } catch { this.fail(request); }
    }
    stop() {
      this.request++; this.desired = false; this.pending = false; this.playing = false;
      clearTimeout(this.timeout); this.element.pause(); this.message = 'الصوت متوقف.'; this.emit();
    }
    togglePlayback() { if (this.desired || this.playing) this.stop(); else this.play(); }
    toggleMute() {
      if (this.pending) { this.stop(); return; }
      if (!this.playing) { this.muted = false; if (this.volume === 0) this.volume = .35; this.play(); return; }
      this.muted = !this.muted; if (!this.muted && this.volume === 0) this.volume = .35;
      this.applyVolume(); this.message = this.muted ? 'الصوت مكتوم.' : 'الصوت قيد التشغيل.'; this.emit();
    }
    async prepareOriginal(request) {
      if (this.gain || !this.context || this.preparing || this.fetchFailed) return;
      const version = this.sourceVersion; this.preparing = true;
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        if (!this.cachedUrl) {
          const response = await fetch(this.originalUrl, { mode: 'cors', signal: controller.signal });
          if (!response.ok) throw new Error('Audio unavailable');
          const blob = await response.blob();
          if (!blob.size || blob.type.includes('text') || blob.type.includes('json')) throw new Error('Not audio');
          this.cachedUrl = URL.createObjectURL(blob);
        }
        if (version !== this.sourceVersion || request !== this.request || !this.desired) return;
        const position = this.element.currentTime;
        this.element.src = this.cachedUrl; this.connectGain();
        const element = this.element;
        element.addEventListener('loadedmetadata', () => {
          if (this.element === element && this.sourceVersion === version && Number.isFinite(position)) {
            try { element.currentTime = Math.min(position, Number.isFinite(element.duration) ? element.duration : position); } catch {}
          }
        }, { once: true });
        this.pending = true; this.playing = false; this.emit(); this.armTimeout(request);
        await element.play();
      } catch {
        // A denied CORS fetch must never break the normal external audio player.
        // On iOS that player still supports real mute/play/pause and device volume.
        this.fetchFailed = true;
        if (this.gain && request === this.request) this.fail(request);
      } finally { clearTimeout(timeout); this.preparing = false; this.emit(); }
    }
    setSource(file) {
      this.stop(); this.sourceVersion++;
      this.source?.disconnect(); this.gain?.disconnect(); this.source = null; this.gain = null;
      if (this.localUrl) URL.revokeObjectURL(this.localUrl);
      this.original = !file; this.localUrl = file ? URL.createObjectURL(file) : null;
      // MediaElementAudioSourceNode cannot be detached from its media element.
      const next = document.createElement('audio'); next.id = 'background-music'; next.loop = true; next.preload = 'none'; next.setAttribute('playsinline', '');
      next.src = this.localUrl || this.cachedUrl || this.originalUrl;
      this.element.replaceWith(next); this.element = next; this.bind(next);
      this.muted = false; this.play();
    }
  }
  root.QuizAudio = QuizAudio;
})(typeof window === 'undefined' ? globalThis : window);
