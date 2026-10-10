// Essai en ligne : le visiteur depose son morceau, le moteur du plug traite 30 s dans le navigateur.
import { renderAll } from './lettrage.js';

const EXCERPT = 30;          // secondes traitees
const MIN_LEN = 10;
const DIAG = ['capped', 'clip', 'mono', 'dc', 'quiet', 'hot', 'sub', 'mud', 'recessed', 'harsh', 'bright', 'dark'];
const DIAG_BIT = { clip: 0, mono: 1, dc: 2, quiet: 3, hot: 4, sub: 5, mud: 6, recessed: 7, harsh: 8, bright: 9, dark: 10, capped: 11 };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initDemo({ t, getLang }) {
  const $ = s => document.querySelector(s);
  const demo = $('.demo');
  const fileIn = $('#file'), drop = $('.drop'), dropName = $('.drop-name');
  const wave = $('.wave'), win = $('.win'), hint = $('.wave-hint'), waveBox = $('.wave-box');
  const err = $('.demo-err');
  const stepEl = $('.step-title'), bar = $('.busy-bar');
  const playBtn = $('.btn-play'), rerun = $('.btn-rerun');

  let ctx = null, buffer = null, peaks = null;
  let start = 0, len = EXCERPT, style = 0;
  let worker = null, jobId = 0, busy = false;
  let result = null, resultKey = '';
  const cache = new Map();

  // ---------- etat ----------
  const setState = s => { demo.dataset.state = s; };
  const showErr = key => { err.textContent = key ? t(key) : ''; err.hidden = !key; };

  // ---------- fichier ----------
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f); });
  fileIn.addEventListener('change', () => { const f = fileIn.files[0]; if (f) load(f); });

  async function load(file) {
    showErr(null);
    stop();
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    dropName.hidden = false; dropName.textContent = file.name;
    setState('busy'); setStep(-1, t('try.decoding')); setProgress(0);
    try {
      const data = await file.arrayBuffer();
      buffer = await new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
    } catch {
      buffer = null; setState('empty'); showErr('try.err.read'); return;
    }
    if (buffer.duration < MIN_LEN) { buffer = null; setState('empty'); showErr('try.err.short'); return; }
    cache.clear();
    len = Math.min(EXCERPT, buffer.duration);
    start = loudestStart(buffer, len);
    peaks = null;
    drawWave(); placeWin();
    win.hidden = false; hint.hidden = buffer.duration <= len + 0.5;
    run();
  }

  // Le passage le plus fort (fenetre glissante sur l energie par seconde) : souvent le refrain.
  function loudestStart(buf, L) {
    const sr = buf.sampleRate, ch = buf.getChannelData(0), secs = Math.floor(buf.duration);
    const e = new Float64Array(secs);
    for (let s = 0; s < secs; s++) {
      let sum = 0; const o = s * sr;
      for (let i = 0; i < sr; i += 4) { const v = ch[o + i] || 0; sum += v * v; }
      e[s] = sum;
    }
    const w = Math.floor(L);
    let best = 0, cur = 0, bestAt = 0;
    for (let s = 0; s < secs; s++) {
      cur += e[s]; if (s >= w) cur -= e[s - w];
      if (s >= w - 1 && cur > best) { best = cur; bestAt = s - w + 1; }
    }
    return Math.min(bestAt, Math.max(0, buf.duration - L));
  }

  // ---------- forme d onde ----------
  function drawWave() {
    if (!buffer) return;
    const dpr = devicePixelRatio || 1, w = wave.clientWidth, h = wave.clientHeight;
    wave.width = w * dpr; wave.height = h * dpr;
    const c = wave.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!peaks || peaks.length !== w) {
      peaks = new Float32Array(w);
      const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
      const step = L.length / w;
      for (let x = 0; x < w; x++) {
        let m = 0; const a = Math.floor(x * step), b = Math.floor((x + 1) * step);
        for (let i = a; i < b; i += 8) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (v > m) m = v; }
        peaks[x] = m;
      }
    }
    const css = getComputedStyle(document.documentElement);
    c.clearRect(0, 0, w, h);
    const x0 = start / buffer.duration * w, x1 = (start + len) / buffer.duration * w;
    for (let x = 0; x < w; x += 2) {
      const a = Math.max(1, peaks[x] * (h - 16));
      c.fillStyle = x >= x0 && x <= x1 ? css.getPropertyValue('--ink').trim() : css.getPropertyValue('--line-2').trim();
      c.fillRect(x, (h - a) / 2, 1.2, a);
    }
  }
  function placeWin() {
    const w = waveBox.clientWidth;
    win.style.left = (start / buffer.duration * w) + 'px';
    win.style.width = Math.max(24, len / buffer.duration * w) + 'px';
  }
  addEventListener('resize', () => { if (buffer) { peaks = null; drawWave(); placeWin(); } });
  document.addEventListener('ft-lang', () => {
    if (demo.dataset.state === 'done' && result) showResult(result, false);
  });

  // Glisser le cadre
  let drag = null;
  win.addEventListener('pointerdown', e => {
    if (busy) return;
    win.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, s: start };
  });
  win.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / waveBox.clientWidth * buffer.duration;
    start = Math.max(0, Math.min(buffer.duration - len, drag.s + dx));
    placeWin(); drawWave();
  });
  win.addEventListener('pointerup', () => {
    if (!drag) return;
    const moved = Math.abs(drag.s - start) > 0.25; drag = null;
    if (moved) { stop(); rerun.hidden = false; rerun.textContent = t('try.run'); }
  });
  // Clic sur la forme d onde : on centre le cadre la
  waveBox.addEventListener('click', e => {
    if (!buffer || busy || e.target === win || win.contains(e.target)) return;
    const r = waveBox.getBoundingClientRect();
    const at = (e.clientX - r.left) / r.width * buffer.duration;
    start = Math.max(0, Math.min(buffer.duration - len, at - len / 2));
    placeWin(); drawWave(); stop(); rerun.hidden = false; rerun.textContent = t('try.run');
  });
  rerun.addEventListener('click', () => run());

  // ---------- style ----------
  document.querySelectorAll('#styles button').forEach(b => b.addEventListener('click', () => {
    if (busy) return;
    style = +b.dataset.style;
    document.querySelectorAll('#styles button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    if (buffer) run();
  }));

  // ---------- traitement ----------
  function excerpt() {
    const sr = buffer.sampleRate, a = Math.floor(start * sr), n = Math.floor(len * sr);
    const L = buffer.getChannelData(0).slice(a, a + n);
    const R = (buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)).slice(a, a + n);
    return { L, R, sr };
  }

  function run() {
    if (!buffer) return;
    const key = `${style}|${start.toFixed(2)}`;
    rerun.hidden = true;
    if (cache.has(key)) { result = cache.get(key); resultKey = key; setState('done'); showResult(result, true); return; }
    const { L, R, sr } = excerpt();
    const before = { L: L.slice(), R: R.slice() };
    busy = true; setState('busy'); showErr(null); setProgress(0); lastStep = -2; setStep(0);
    toggleStyles(true);
    try { worker = worker || new Worker('js/worker.js'); }
    catch { busy = false; setState('empty'); showErr('try.err.engine'); toggleStyles(false); return; }
    const id = ++jobId;
    worker.onmessage = e => {
      const m = e.data;
      if (m.id !== undefined && m.id !== id) return;
      if (m.type === 'progress') {
        const p = m.phase === 0 ? m.frac * 0.3 : m.phase === 1 ? 0.3 + m.frac * 0.45 : 0.75 + m.frac * 0.25;
        setProgress(p);
        return;
      }
      busy = false; toggleStyles(false);
      if (m.type === 'error') { setState(result ? 'done' : 'empty'); showErr('try.err.engine'); console.error(m.message); return; }
      setProgress(1);
      const r = { before, after: { L: m.L, R: m.R }, sr, stats: m.stats, ms: m.ms };
      cache.set(key, r); result = r; resultKey = key;
      // On laisse le dernier titre d etape a l ecran un instant avant le panneau.
      setTimeout(() => { setState('done'); showResult(r, true); }, reduce ? 0 : 450);
    };
    worker.onerror = () => { busy = false; toggleStyles(false); setState(result ? 'done' : 'empty'); showErr('try.err.engine'); };
    worker.postMessage({ L, R, fs: sr, style, id }, [L.buffer, R.buffer]);
  }
  function toggleStyles(dis) { document.querySelectorAll('#styles button').forEach(b => { b.disabled = dis; }); }

  // ---------- etapes animees (titres lettre par lettre, comme le plug) ----------
  let lastStep = -2, variant = 0;
  function setProgress(p) {
    bar.style.setProperty('--prog', p.toFixed(3));
    const step = Math.min(7, Math.floor(p * 8));
    if (busy && step !== lastStep) setStep(step);
  }
  function setStep(i, text) {
    lastStep = i;
    const label = text || t('step.' + i);
    stepEl.setAttribute('data-lt', label);
    renderAll(stepEl.parentElement);
    if (reduce) return;
    const v = variant++ % 3;
    const chars = stepEl.querySelectorAll('.lt-ch');
    chars.forEach((g, k) => {
      const d = 1;
      const from = v === 0 ? `translateX(${d * 50}px) rotateX(${d * 50}deg)`
        : v === 1 ? `translate(${d * 50}px, ${d * 50}px) scale(.75)`
        : `translate(${d * 90}px, ${-d * 20}px) rotate(${d * 50}deg) scale(.75)`;
      g.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }],
        { duration: 550, delay: k * 24, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' });
    });
  }

  // ---------- resultat ----------
  function fmt(v, d = 1) {
    const s = (v < 0 ? '−' : v > 0 && d === 1 ? '' : '') + Math.abs(v).toFixed(d);
    return getLang() === 'fr' ? s.replace('.', ',') : s;
  }
  function showResult(r, animate) {
    const s = r.stats;
    document.getElementById('in-lufs').textContent = fmt(s.inLufs);
    document.getElementById('tp').textContent = fmt(s.truePeak);
    document.getElementById('ceil').textContent = fmt(s.ceiling);
    const lufsEl = document.getElementById('out-lufs');
    // Le chiffre defile de l entree a la sortie, comme dans le plug.
    if (animate && !reduce) {
      const t0 = performance.now(), D = 900;
      const tick = now => {
        const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
        lufsEl.setAttribute('data-lt', fmt(s.inLufs + (s.outLufs - s.inLufs) * e));
        renderAll(lufsEl.parentElement);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else { lufsEl.setAttribute('data-lt', fmt(s.outLufs)); renderAll(lufsEl.parentElement); }
    drawEq(s.eq, animate);
    const ul = document.getElementById('diag-list');
    const found = DIAG.filter(k => s.diag & (1 << DIAG_BIT[k]));
    ul.innerHTML = (found.length ? found.map(k => t('diag.' + k)) : [t('try.healthy')]).map(x => `<li>${x}</li>`).join('');
    rerun.hidden = true;
    prepareAudio(r);
  }

  // Courbe de correction : 9 bandes d octave (50 Hz a 12,8 kHz), axe 20 Hz a 20 kHz, +/-6 dB.
  let eqAnim = null;
  function drawEq(gains, animate) {
    const cv = document.querySelector('.eq');
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim(), line = css.getPropertyValue('--line').trim(),
      muted = css.getPropertyValue('--muted').trim(), acc = css.getPropertyValue('--accent').trim();
    const padB = 22, padR = 30, plotW = w - padR, plotH = h - padB, R = 6;
    const fx = f => Math.log(f / 20) / Math.log(1000) * plotW;
    const fy = db => plotH / 2 - db / R * (plotH / 2 - 6);
    const centers = gains.map((_, i) => 50 * Math.pow(2, i));
    const gAt = f => {
      // interpolation douce en log-frequence, retour a 0 aux extremites
      const o = Math.log2(f / 50);
      if (o <= 0) return gains[0] * Math.max(0, 1 + o / 1.3);
      if (o >= 8) return gains[8] * Math.max(0, 1 - (o - 8) / 0.7);
      const i = Math.floor(o), k = o - i, sm = k * k * (3 - 2 * k);
      return gains[i] + (gains[i + 1] - gains[i]) * sm;
    };
    const pts = [];
    for (let x = 0; x <= plotW; x += 2) pts.push([x, fy(gAt(20 * Math.pow(1000, x / plotW)))]);
    cancelAnimationFrame(eqAnim);
    const t0 = performance.now(), D = animate && !reduce ? 1000 : 0;
    const frame = now => {
      const k = D ? Math.min(1, (now - t0) / D) : 1, e = 1 - Math.pow(1 - k, 3);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      c.font = '11px "Geist Mono", monospace'; c.fillStyle = muted; c.textBaseline = 'middle';
      c.strokeStyle = line; c.lineWidth = 1;
      [-6, -3, 0, 3, 6].forEach(db => {
        const y = Math.round(fy(db)) + .5;
        c.beginPath(); c.moveTo(0, y); c.lineTo(plotW, y); c.stroke();
        c.fillText((db > 0 ? '+' : db < 0 ? '−' : '') + Math.abs(db), plotW + 6, y);
      });
      c.textBaseline = 'alphabetic';
      [[20, '20'], [100, '100'], [1000, '1k'], [10000, ''], [20000, '20k']].forEach(([f, l]) => {
        const x = Math.round(fx(f)) + .5;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, plotH); c.stroke();
        c.textAlign = f === 20 ? 'left' : f === 20000 ? 'right' : 'center';
        if (l) c.fillText(l, x, h - 4);
      });
      c.textAlign = 'left';
      const n = Math.max(2, Math.floor(pts.length * e));
      // remplissage leger puis trait
      c.beginPath(); c.moveTo(pts[0][0], fy(0));
      for (let i = 0; i < n; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.lineTo(pts[n - 1][0], fy(0)); c.closePath();
      c.fillStyle = acc; c.globalAlpha = .12; c.fill(); c.globalAlpha = 1;
      c.beginPath();
      for (let i = 0; i < n; i++) i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]);
      c.strokeStyle = ink; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
      centers.forEach((f, i) => {
        const x = fx(f); if (x > pts[n - 1][0]) return;
        c.beginPath(); c.arc(x, fy(gains[i]), 3, 0, Math.PI * 2); c.fillStyle = ink; c.fill();
      });
      if (k < 1) eqAnim = requestAnimationFrame(frame);
    };
    eqAnim = requestAnimationFrame(frame);
  }

  // ---------- lecture Avant / Apres a volume egal ----------
  let src = null, gB = null, gA = null, bufB = null, bufA = null, playing = false, t0 = 0, offset = 0, ab = 'after', raf = null;
  function prepareAudio(r) {
    stop();
    const mk = d => { const b = ctx.createBuffer(2, d.L.length, r.sr); b.copyToChannel(d.L, 0); b.copyToChannel(d.R, 1); return b; };
    bufB = mk(r.before); bufA = mk(r.after);
    offset = 0;
  }
  // Volume egal : on baisse le plus fort des deux, jamais de gain (sinon l original peut saturer).
  function gains() {
    const s = result.stats, d = s.outLufs - s.inLufs;
    return { before: Math.min(1, Math.pow(10, d / 20)), after: Math.min(1, Math.pow(10, -d / 20)) };
  }
  async function play() {
    if (!bufA || playing) return;
    playing = true;
    try { await ctx.resume(); } catch {}
    gB = ctx.createGain(); gA = ctx.createGain();
    const now = ctx.currentTime, g = gains();
    gB.gain.setValueAtTime(ab === 'before' ? g.before : 0, now);
    gA.gain.setValueAtTime(ab === 'after' ? g.after : 0, now);
    gB.connect(ctx.destination); gA.connect(ctx.destination);
    const sB = ctx.createBufferSource(), sA = ctx.createBufferSource();
    sB.buffer = bufB; sA.buffer = bufA; sB.loop = sA.loop = true;
    sB.connect(gB); sA.connect(gA);
    sB.start(now, offset); sA.start(now, offset);
    src = [sB, sA]; t0 = now - offset;
    playBtn.classList.add('is-playing'); playBtn.setAttribute('aria-label', t('try.pause'));
    const dur = bufA.duration;
    const loop = () => {
      const p = ((ctx.currentTime - t0) % dur) / dur;
      win.querySelector('.win-play').style.setProperty('--p', (p * win.clientWidth) + 'px');
      raf = requestAnimationFrame(loop);
    };
    loop();
  }
  function stop() {
    if (src) { src.forEach(s => { try { s.stop(); } catch {} }); src = null; }
    if (playing && ctx) offset = (ctx.currentTime - t0) % (bufA ? bufA.duration : 1);
    playing = false; cancelAnimationFrame(raf);
    playBtn.classList.remove('is-playing'); playBtn.setAttribute('aria-label', t('try.play'));
  }
  playBtn.addEventListener('click', () => (playing ? stop() : play()));
  document.querySelectorAll('.seg-ab button').forEach(b => b.addEventListener('click', () => {
    ab = b.dataset.ab;
    document.querySelectorAll('.seg-ab button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    // Choisir Avant ou Apres lance la lecture si elle est arretee.
    if (!playing || !gA) { play(); return; }
    const now = ctx.currentTime, g = gains();
    gB.gain.setTargetAtTime(ab === 'before' ? g.before : 0, now, 0.01);
    gA.gain.setTargetAtTime(ab === 'after' ? g.after : 0, now, 0.01);
  }));
  // Barre d espace : lecture / pause quand la demo est a l ecran avec un resultat
  addEventListener('keydown', e => {
    if (e.code !== 'Space' || demo.dataset.state !== 'done') return;
    if (/INPUT|TEXTAREA|BUTTON|SUMMARY/.test(document.activeElement.tagName)) return;
    const r = demo.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    e.preventDefault(); playing ? stop() : play();
  });
}
