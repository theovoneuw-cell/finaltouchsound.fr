import { T } from './i18n.js';
import { loadLettrage, renderAll } from './lettrage.js';
import { initDemo } from './demo.js';
import { initVente, appliquerVente } from './vente.js';

const cfg = window.FT_CONFIG || {};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Langue
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
let lang = store.get('ft-lang') || ((navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en');
export const t = k => (T[lang] && T[lang][k]) ?? T.fr[k] ?? k;
export const getLang = () => lang;

function applyLang() {
  document.documentElement.lang = lang;
  document.title = t('meta.title2');
  $('meta[name="description"]').setAttribute('content', t('meta.desc'));
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-lt-key]').forEach(el => { el.setAttribute('data-lt', t(el.dataset.ltKey)); });
  $$('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $$('[data-price-old]').forEach(el => { el.textContent = lang === 'fr' ? '29,95 €' : '€29.95'; });
  $$('[data-price-now]').forEach(el => { el.textContent = lang === 'fr' ? '14,95 €' : '€14.95'; });
  $$('.lt-price').forEach(el => {
    el.setAttribute('data-lt', el.closest('.offer-stu') ? '10' : (lang === 'fr' ? '14,95' : '14.95'));
  });
  $$('.fact-n').forEach(el => {
    if (el.dataset.lt.includes('0,1') || el.dataset.lt.includes('0.1')) el.setAttribute('data-lt', lang === 'fr' ? '−0,1' : '−0.1');
  });
  $$('.c-n').forEach(el => {
    el.setAttribute('data-lt', lang === 'fr' ? el.dataset.lt.replace('.', ',') : el.dataset.lt.replace(',', '.'));
  });
  $$('.plat dd').forEach(el => {
    el.textContent = lang === 'fr' ? el.textContent.replace('.', ',') : el.textContent.replace(',', '.');
  });
  fillMonitor();
  selectKnob(currentKnob, false);
  wireManual();
  appliquerVente(t, getLang);
  renderAll();
  document.dispatchEvent(new CustomEvent('ft-lang', { detail: lang }));
}

$$('[data-lang]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.lang === lang) return;
  lang = b.dataset.lang; store.set('ft-lang', lang); applyLang();
}));

// Mode d emploi : lien selon la langue
function wireManual() {
  const el = $('[data-manual]');
  const manual = cfg.manual && cfg.manual[lang];
  if (el) { el.hidden = !manual; if (manual) el.href = manual; }
}

// Apparitions au defilement
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-in');
    io.unobserve(e.target);
  });
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });

function arm() {
  if (reduce) { $$('.reveal, .lt[data-lt-key], .knobs').forEach(el => el.classList.add('is-in')); return; }
  $$('.lt[data-lt-key]').forEach(el => { el.classList.add('is-armed'); io.observe(el); });
  $$('.reveal').forEach(el => io.observe(el));
  io.observe($('.knobs'));
}

// Barre d achat sur mobile : visible une fois l accroche passee, cachee sur la section prix
const sticky = $('.sticky-buy');
let pastHero = false, onPrice = false;
const syncSticky = () => sticky.classList.toggle('is-on', pastHero && !onPrice);
new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; syncSticky(); }).observe($('.hero'));
new IntersectionObserver(([e]) => { onPrice = e.isIntersecting; syncSticky(); }, { threshold: 0.05 }).observe($('#prix'));

// Barre de navigation : filet une fois la page defilee
const nav = $('.nav');
new IntersectionObserver(([e]) => nav.classList.toggle('is-stuck', !e.isIntersecting), { rootMargin: '-1px 0px 0px 0px' })
  .observe($('.hero'));

// Reglages
const KNOBS = ['clean', 'color', 'punch', 'vocal', 'air', 'loud'];
let currentKnob = 'clean';
function selectKnob(k, animate = true) {
  currentKnob = k;
  $$('.knob-b').forEach((b, i) => { b.style.setProperty('--n', i); b.setAttribute('aria-selected', String(b.dataset.k === k)); });
  const b = $(`.knob-b[data-k="${k}"]`);
  const d = $('.knob-detail');
  d.style.setProperty('--kd', getComputedStyle(b).getPropertyValue('--c'));
  const name = $('.kd-name', d);
  name.setAttribute('data-lt', t('k.' + k));
  $('.kd-desc', d).textContent = t(`k.${k}.d`);
  $('.kd-ref', d).textContent = t(`k.${k}.r`);
  renderAll(d);
  if (animate && !reduce) {
    d.classList.remove('swap'); void d.offsetWidth; d.classList.add('swap');
    name.classList.remove('is-in'); name.classList.add('is-armed');
    requestAnimationFrame(() => requestAnimationFrame(() => name.classList.add('is-in')));
  } else name.classList.add('is-in');
}
$$('.knob-b').forEach(b => b.addEventListener('click', () => selectKnob(b.dataset.k)));
$('.knobs').addEventListener('keydown', e => {
  const i = KNOBS.indexOf(currentKnob);
  const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
  if (n === null) return;
  const k = KNOBS[(n + KNOBS.length) % KNOBS.length];
  selectKnob(k); $(`.knob-b[data-k="${k}"]`).focus();
});

// Cellules animees : elles ne tournent que lorsqu elles sont visibles
function fillMonitor() {
  const ul = $('.mon-list');
  ul.innerHTML = t('tools.mon.list').split(',').map((s, i) => `<li${i === 0 ? ' class="on"' : ''}>${s}</li>`).join('');
}
function loopWhenVisible(el, fn, ms) {
  let id = null;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !id && !reduce) id = setInterval(fn, ms);
    if (!e.isIntersecting && id) { clearInterval(id); id = null; }
  }).observe(el);
}
// Avant / Apres
const ab = $('.ab-demo');
function placeAb() {
  const on = $('.on', ab);
  ab.style.setProperty('--x', on.offsetLeft + 'px');
  ab.style.setProperty('--w', on.offsetWidth + 'px');
}
loopWhenVisible(ab, () => { $$('span', ab).forEach(s => s.classList.toggle('on')); placeAb(); }, 1800);
// Ecoute sur
let mon = 0;
loopWhenVisible($('.mon-list'), () => {
  const li = $$('.mon-list li');
  li[mon % li.length].classList.remove('on');
  mon = (mon + 1) % li.length;
  li[mon].classList.add('on');
}, 1400);

// « Entendre le retire » : un signal discret, ce que la Proprete enleve
const rem = $('.rem-wave');
let remRaf = null, remT = 0;
function drawRem() {
  const dpr = devicePixelRatio || 1, w = rem.clientWidth, h = rem.clientHeight;
  if (rem.width !== w * dpr) { rem.width = w * dpr; rem.height = h * dpr; }
  const c = rem.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const col = getComputedStyle(document.documentElement).getPropertyValue('--k-clean').trim();
  c.fillStyle = col;
  const bars = Math.floor(w / 4);
  for (let i = 0; i < bars; i++) {
    const x = i / bars;
    const env = Math.pow(Math.abs(Math.sin(x * 6 + remT * 0.7) * Math.sin(x * 15 - remT * 1.1)), 1.4);
    const a = 2 + env * h * 0.42 * (0.6 + 0.4 * Math.sin(i * 12.9898 + remT * 3));
    c.globalAlpha = 0.35 + env * 0.65;
    c.fillRect(i * 4, h / 2 - a / 2, 2, a);
  }
  remT += 0.016;
  if (!reduce) remRaf = requestAnimationFrame(drawRem);
}
new IntersectionObserver(([e]) => {
  if (e.isIntersecting && !remRaf) drawRem();
  if (!e.isIntersecting && remRaf) { cancelAnimationFrame(remRaf); remRaf = null; }
}).observe(rem);

// Redimensionnement : le lettrage se recoupe a la nouvelle largeur
let lastW = innerWidth, rz;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; renderAll(); placeAb(); } }, 120);
});

await loadLettrage();
applyLang();
// Le prechargeur se leve une fois la page prete ; les animations d entree partent juste apres.
if (window.FT_READY) window.FT_READY();
await (window.FT_PRELOADER || Promise.resolve());
document.documentElement.classList.add('ready');
arm();
placeAb();
initDemo({ t, getLang });
initVente(t, getLang).then(() => renderAll());
