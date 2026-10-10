// Lettrage Final Touch : les memes glyphes que le plug (assets/lettrage.json).
// Chaque lettre est un <g class="lt-ch"> pour pouvoir l animer seule.

let data = null;
export async function loadLettrage() {
  if (!data) data = await (await fetch('assets/lettrage.json')).json();
  return data;
}

let uid = 0;
const glyph = ch => data.glyphs[ch] || data.glyphs[ch.toLowerCase()] || data.glyphs[' '];

function advance(text) {
  const chars = [...text];
  let x = 0;
  chars.forEach((ch, k) => {
    const nx = chars[k + 1];
    x += glyph(ch).w + data.spacing + ((nx && data.kern[ch + nx]) || 0);
  });
  return Math.max(0, x - data.spacing);
}

// Une ligne en SVG, unites de glyphe (capitale = 100).
function lineSvg(text, accentOnI) {
  const id = 'lt' + (uid++);
  let x = 0, defs = '', body = '', n = 0;
  const chars = [...text];
  chars.forEach((ch, k) => {
    const g = glyph(ch);
    let parts = '';
    g.p.forEach(p => {
      if (p.k === 's') {
        const cid = `${id}-${n++}`;
        defs += `<clipPath id="${cid}"><rect x="-40" y="${p.t}" width="${g.w + 80}" height="${p.b - p.t}"/></clipPath>`;
        parts += `<path clip-path="url(#${cid})" d="${p.d}" fill="none" stroke="currentColor" stroke-width="${data.stroke}" stroke-linejoin="miter" stroke-miterlimit="4"/>`;
      } else if (p.k === 'f') {
        parts += `<path d="${p.d}" fill="currentColor"/>`;
      } else {
        parts += `<path d="${p.d}" class="lt-accent" fill="var(--accent)" stroke="var(--paper)" stroke-width="4"/>`;
      }
    });
    if (ch !== ' ') body += `<g class="lt-ch" style="--i:${k}"><g transform="translate(${x} 0)">${parts}</g></g>`;
    const nx = chars[k + 1];
    x += g.w + data.spacing + ((nx && data.kern[ch + nx]) || 0);
  });
  return { defs, body, width: Math.max(0, x - data.spacing) };
}

// Rend `text` dans `el` en coupant aux espaces selon la largeur disponible.
// La taille vient du CSS : --cap (hauteur de capitale en px).
export function renderLettrage(el, text) {
  if (!data) return;
  const cap = parseFloat(getComputedStyle(el).getPropertyValue('--cap')) || 64;
  const scale = cap / 100;
  const host = el.closest('[data-lt]');
  const max = host && host.hasAttribute('data-nowrap') ? Infinity : el.clientWidth / scale;
  // « | » force un retour a la ligne ; sinon on coupe aux espaces.
  const lines = [];
  for (const para of text.split('|')) {
    let cur = '';
    for (const w of para.trim().split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && advance(t) > max) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
  }
  const lead = parseFloat(getComputedStyle(el).getPropertyValue('--lead')) || 1.32;
  el.innerHTML = lines.map(l => {
    const s = lineSvg(l);
    // Marge haute pour les accents (au-dessus de la capitale), basse pour les jambages.
    const top = -30, h = 100 * lead;
    return `<svg class="lt-line" aria-hidden="true" viewBox="-8 ${top} ${s.width + 16} ${h}" width="${(s.width + 16) * scale}" height="${h * scale}"><defs>${s.defs}</defs>${s.body}</svg>`;
  }).join('');
  el.dataset.rendered = text;
}

// Tous les [data-lt] de la page : le texte lisible reste dans un span masque pour les lecteurs d ecran.
export function renderAll(root = document) {
  root.querySelectorAll('[data-lt]').forEach(el => {
    const text = el.getAttribute('data-lt');
    let box = el.querySelector('.lt-box');
    if (!box) {
      el.innerHTML = `<span class="sr-only"></span><span class="lt-box"></span>`;
      box = el.querySelector('.lt-box');
    }
    el.querySelector('.sr-only').textContent = text.replace(/\s*\|\s*/g, ' ');
    renderLettrage(box, text);
  });
}
