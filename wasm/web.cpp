// Pont WebAssembly : le moteur Final Touch (Source/dsp, sans JUCE) dans le navigateur.
// Meme deroule que tools/render.cpp : « Listen » sur l extrait, calage du volume, rendu.
// Le morceau reste sur l ordinateur du visiteur : tout se passe dans un Web Worker.
#include "dsp/Chain.h"
#include <emscripten/emscripten.h>
#include <cstdlib>

// Avancement vers le worker : phase (0 analyse, 1 calage, 2 rendu) et fraction 0..1.
EM_JS (void, tf_progress, (int phase, float frac), { if (Module.onProgress) Module.onProgress (phase, frac); });

extern "C"
{
EMSCRIPTEN_KEEPALIVE float* tf_alloc (int n) { return (float*) std::malloc ((size_t) n * sizeof (float)); }
EMSCRIPTEN_KEEPALIVE void   tf_free (void* p) { std::free (p); }

// Traite L/R en place. out[] recoit :
//  0 LUFS entree, 1 LUFS sortie, 2 true peak sortie, 3 mise a niveau, 4 poussee,
//  5 latence (echantillons), 6 diagnostics (bits), 7..15 correction EQ (9 bandes d octave, 50 Hz a 12,8 kHz),
//  16 plafond du style, 17..22 coupe moyenne de Proprete (6 bandes), 23 reduction moyenne du limiteur.
EMSCRIPTEN_KEEPALIVE int tf_process (float* inL, float* inR, int len, double fs, int style, float* out)
{
    if (len <= 0) return 1;
    const int block = 512;
    const auto& s = tf::styleInfo (style);
    tf::ChainParams p;
    p.style = style; p.proprete = s.proprete; p.couleur = s.couleur; p.punch = s.punch;
    p.air = s.air; p.volume = s.volume; p.voix = s.voix;

    tf::Chain chain;
    chain.prepare (fs, block);
    chain.setParams (p);
    chain.reset();

    std::vector<float> L (block), R (block), outL ((size_t) len), outR ((size_t) len);
    double bandSum[tf::DynamicCleaner::kBands] {}, limSum = 0.0; int blocks = 0;

    const auto runPass = [&] (bool write, int phase)
    {
        chain.reset();
        const int lat = chain.latency();
        const int total = len + lat;
        for (int pos = 0; pos < total; pos += block)
        {
            const int n = std::min (block, total - pos);
            for (int i = 0; i < n; ++i)
            {
                const int k = pos + i;
                L[(size_t) i] = k < len ? inL[k] : 0.0f;
                R[(size_t) i] = k < len ? inR[k] : 0.0f;
            }
            chain.process (L.data(), R.data(), n);
            if (write)
            {
                if (pos < len)
                {
                    const auto gm = chain.getMeters();
                    for (int b = 0; b < tf::DynamicCleaner::kBands; ++b) bandSum[b] += chain.cleanerBandCut (b);
                    limSum += gm.grLimit; ++blocks;
                }
                for (int i = 0; i < n; ++i)
                {
                    const int k = pos + i - lat;
                    if (k >= 0 && k < len) { outL[(size_t) k] = L[(size_t) i]; outR[(size_t) k] = R[(size_t) i]; }
                }
            }
            if ((pos / block) % 64 == 0) tf_progress (phase, (float) pos / (float) total);
        }
    };

    // 1. « Listen » sur tout l extrait (boucle si l extrait est court).
    chain.setAnalyseSeconds (std::max (12.0, len / fs * 0.9));
    chain.toggleLearning();
    for (int loop = 0; loop < 3 && chain.getMeters().learnPhase == tf::Chain::Analyse; ++loop)
        for (int pos = 0; pos < len && chain.getMeters().learnPhase == tf::Chain::Analyse; pos += block)
        {
            const int n = std::min (block, len - pos);
            std::copy (inL + pos, inL + pos + n, L.begin());
            std::copy (inR + pos, inR + pos + n, R.begin());
            chain.process (L.data(), R.data(), n);
            if ((pos / block) % 64 == 0) tf_progress (0, (float) pos / (float) len);
        }
    if (chain.getMeters().learnPhase == tf::Chain::Calibrate)
        chain.toggleLearning();

    // 2. Calage du volume sur l integre reel (3 passes au plus dans le navigateur).
    for (int it = 0; it < 3; ++it)
    {
        runPass (false, 1);
        auto l = chain.getLearned();
        const float err = s.volume - chain.getMeters().integrated;
        if (std::abs (err) < 0.15f) break;
        l.driveDb += err;
        chain.setLearned (l);
    }

    // 3. Rendu.
    runPass (true, 2);
    tf_progress (2, 1.0f);

    const auto m = chain.getMeters();
    const auto l = chain.getLearned();
    out[0] = m.inputIntegrated; out[1] = m.integrated; out[2] = m.truePeakMax;
    out[3] = l.trimDb; out[4] = l.driveDb; out[5] = (float) chain.latency();
    out[6] = (float) m.diagnostics;
    for (int b = 0; b < 9; ++b) out[7 + b] = m.eqGains[(size_t) b];
    out[16] = s.volume;
    for (int b = 0; b < tf::DynamicCleaner::kBands; ++b) out[17 + b] = (float) (bandSum[b] / std::max (1, blocks));
    out[23] = (float) (limSum / std::max (1, blocks));

    std::copy (outL.begin(), outL.end(), inL);
    std::copy (outR.begin(), outR.end(), inR);
    return 0;
}
}
