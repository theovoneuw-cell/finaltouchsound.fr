// Serveur local avec rechargement automatique (aperçu en direct).
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.argv[2] || 8795, ROOT = path.join(__dirname, 'public');
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript',
  '.wasm':'application/wasm', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
  '.woff2':'font/woff2', '.json':'application/json', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ico':'image/x-icon' };
const clients = new Set();
// Pendant un essai de la demo (morceau charge), on ne recharge pas : la page attend que l onglet soit cache.
const RELOAD = `<script>(()=>{let pend=false;const busy=()=>{const d=document.querySelector('.demo');return d&&d.dataset.state!=='empty'};const go=()=>{if(busy()){pend=true;return}location.reload()};document.addEventListener('visibilitychange',()=>{if(pend&&document.hidden)location.reload()});new EventSource('/__reload').onmessage=e=>{if(e.data==='css'){document.querySelectorAll('link[rel=stylesheet]').forEach(l=>{l.href=l.href.split('?')[0]+'?'+Date.now()})}else go()}})()</script>`;
let t; fs.watch(ROOT, { recursive: true }, (ev, f) => { clearTimeout(t); t = setTimeout(() => {
  const msg = f && f.endsWith('.css') ? 'css' : 'reload'; for (const c of clients) c.write(`data: ${msg}\n\n`); }, 80); });
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/__reload') { res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache' });
    res.write('\n'); clients.add(res); req.on('close', () => clients.delete(res)); return; }
  // Fausse boutique pour tester en local (?maquette ou ?maquette=fini dans l adresse de la page).
  if (url.startsWith('/__api/')) {
    const fini = url.includes('fini');
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method === 'GET') return send({ vendues: fini ? 100 : 63, max: 100, restant: fini ? 0 : 37 });
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      let b = {}; try { b = JSON.parse(body); } catch {}
      const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '');
      if (!ok) return send({ ok: false, erreur: 'email' });
      if (b.action === 'etudiant') return send({ ok: true, etat: /univ-|\.edu$|ac-/.test(b.email) ? 'code' : 'verification' });
      send({ ok: true });
    });
    return;
  }
  let p = path.join(ROOT, url); if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('404'); }
  const ext = path.extname(p); let body = fs.readFileSync(p);
  if (ext === '.html') body = body.toString().replace('</body>', RELOAD + '</body>');
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control':'no-store' }); res.end(body);
}).listen(PORT, '0.0.0.0', () => console.log('http://localhost:' + PORT));
