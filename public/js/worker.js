// Web Worker : charge le moteur Final Touch (WebAssembly) et traite un extrait.
let engine = null;

async function getEngine() {
  if (engine) return engine;
  importScripts('../engine/tf.js');
  engine = await TFEngine({
    locateFile: p => '../engine/' + p,
    onProgress: (phase, frac) => postMessage({ type: 'progress', phase, frac }),
  });
  return engine;
}

onmessage = async e => {
  const { L, R, fs, style, id } = e.data;
  try {
    const m = await getEngine();
    const n = L.length;
    const pL = m._tf_alloc(n), pR = m._tf_alloc(n), pO = m._tf_alloc(32);
    m.HEAPF32.set(L, pL >> 2);
    m.HEAPF32.set(R, pR >> 2);
    const t0 = performance.now();
    const rc = m._tf_process(pL, pR, n, fs, style, pO);
    const ms = performance.now() - t0;
    if (rc !== 0) throw new Error('tf_process ' + rc);
    const outL = m.HEAPF32.slice(pL >> 2, (pL >> 2) + n);
    const outR = m.HEAPF32.slice(pR >> 2, (pR >> 2) + n);
    const s = Array.from(m.HEAPF32.subarray(pO >> 2, (pO >> 2) + 24));
    m._tf_free(pL); m._tf_free(pR); m._tf_free(pO);
    postMessage({ type: 'done', id, L: outL, R: outR, ms, stats: {
      inLufs: s[0], outLufs: s[1], truePeak: s[2], trim: s[3], drive: s[4], latency: s[5],
      diag: s[6] >>> 0, eq: s.slice(7, 16), ceiling: s[16], clean: s.slice(17, 23), limiter: s[23],
    } }, [outL.buffer, outR.buffer]);
  } catch (err) {
    postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
