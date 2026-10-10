#!/usr/bin/env bash
#==============================================================================
#  Final Touch - vidéo verticale avant/après pour Reels, TikTok et Shorts.
#
#  Usage :  bash generer.sh "Artiste - Titre.mp3" [Style] [fr|en] [debut_en_s]
#           Style : Rap (défaut), Trap, RnB, Afro, Pop. Début : auto = le passage le plus fort.
#
#  Le traitement est fait par le vrai moteur (tf_render), l'avant et l'après sont
#  remis au même volume. Sortie : videos/sortie/<nom>-<Style>-<langue>.mp4 (1080 x 1920).
#  Le nom d'artiste vient du nom du fichier (« Artiste - Titre »).
#==============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Copies des outils du plug (hors de Documents, que macOS interdit aux tâches de fond).
RENDER="${TF_RENDER:-$HERE/outils/tf_render}"
SNAP="${TF_SNAPSHOT:-$HERE/outils/tf_snapshot}"
URL_SITE="${FT_URL:-finaltouchsound.fr}"

IN="${1:?Usage : generer.sh morceau [Style] [fr|en] [debut]}"
STYLE="${2:-Rap}"
LANGUE="${3:-fr}"
DEBUT="${4:-auto}"
[ -f "$IN" ] || { echo "Fichier introuvable : $IN"; exit 1; }
for b in "$RENDER" "$SNAP"; do [ -x "$b" ] || { echo "Outil manquant : $b (compiler le projet du plug)"; exit 1; }; done
CHROME="$(find "$HOME/Library/Caches/ms-playwright" -type f -perm +111 -path '*MacOS/*' \( -name 'Google Chrome for Testing' -o -name Chromium \) 2>/dev/null | head -1)"
[ -n "$CHROME" ] && [ -x "$CHROME" ] || CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome introuvable pour dessiner les cartes."; exit 1; }

NOM="$(basename "${IN%.*}" | sed -E 's/ *\[[^]]*\] *//g')"
ARTISTE=""
case "$NOM" in *" - "*) ARTISTE="${NOM%% - *}" ;; esac
TMP="$(mktemp -d)"
trap 'kill "${SRV:-0}" 2>/dev/null || true; rm -rf "$TMP"' EXIT
mkdir -p "$HERE/sortie"
OUT="$HERE/sortie/$NOM-$STYLE-$LANGUE.mp4"

#--------------------------------------------------------------- 1. extrait
if [ "$DEBUT" = "auto" ]; then
  # Fenêtre de 30 s la plus énergique (souvent le refrain).
  DEBUT="$(ffmpeg -v error -i "$IN" -ac 1 -ar 100 -f f32le - | python3 -c '
import sys, struct
d = sys.stdin.buffer.read(); n = len(d) // 4
x = struct.unpack("<%df" % n, d[:n * 4])
s = [sum(v * v for v in x[i:i + 100]) for i in range(0, n, 100)]
w = 30; best, at, cur = -1, 0, 0
for i, e in enumerate(s):
    cur += e
    if i >= w: cur -= s[i - w]
    if i >= w - 1 and cur > best: best, at = cur, i - w + 1
print(at)')"
fi
echo "Passage : ${DEBUT} s, style $STYLE"
ffmpeg -v error -y -ss "$DEBUT" -t 30 -i "$IN" -ar 44100 -ac 2 "$TMP/avant.wav"

#--------------------------------------------------------------- 2. traitement
"$RENDER" "$TMP/avant.wav" "$TMP/apres.wav" "$STYLE" > "$TMP/rendu.txt"
read -r LUFS_IN LUFS_OUT < <(sed -n 's/.*entree \(-*[0-9.]*\) LUFS | sortie \(-*[0-9.]*\) LUFS.*/\1 \2/p' "$TMP/rendu.txt")
echo "Entrée $LUFS_IN LUFS, sortie $LUFS_OUT LUFS"
# Même volume à l'écoute : on baisse le plus fort des deux.
GAIN_AV="$(python3 -c "d=$LUFS_OUT-($LUFS_IN); print(min(0.0,d))")"
GAIN_AP="$(python3 -c "d=$LUFS_OUT-($LUFS_IN); print(min(0.0,-d))")"
# Capture du plug une fois l analyse terminee (45 s de lecture a partir du tiers du morceau).
"$SNAP" "$IN" "$TMP/plug.png" 45 1 "$STYLE" >/dev/null

#--------------------------------------------------------------- 3. cartes
mkdir -p "$TMP/site" && cp -R "$HERE/modele/." "$TMP/site/" && cp "$TMP/plug.png" "$TMP/site/plug.png"
PORT=$((20000 + RANDOM % 20000))
( cd "$TMP/site" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 ) & SRV=$!
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/carte.html" && break; sleep 0.1; done
enc() { python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$1"; }
carte() {  # carte <sortie.png> <requête>
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1080,1920 \
    --virtual-time-budget=6000 --screenshot="$1" "http://127.0.0.1:$PORT/carte.html?$2" >/dev/null 2>&1
}
A="$(enc "$ARTISTE")"; S="$(enc "$STYLE")"; U="$(enc "$URL_SITE")"
carte "$TMP/c-avant.png" "type=avant&langue=$LANGUE&artiste=$A&style=$S&lufs=$LUFS_IN"
carte "$TMP/c-apres.png" "type=apres&langue=$LANGUE&artiste=$A&style=$S&lufs=$LUFS_OUT&plug=plug.png"
if [ "$LANGUE" = "en" ]; then ETAPES=("Listening" "Tonal balance" "Punch" "Loudness"); else ETAPES=("Écoute" "Équilibre tonal" "Punch" "Volume"); fi
for i in 1 2 3 4; do carte "$TMP/c-e$i.png" "type=etape&langue=$LANGUE&i=$i&n=4&texte=$(enc "${ETAPES[$((i-1))]}")"; done
carte "$TMP/c-fin.png" "type=fin&langue=$LANGUE&url=$U"
for f in avant apres e1 e2 e3 e4 fin; do [ -s "$TMP/c-$f.png" ] || { echo "Carte $f non rendue"; exit 1; }; done

#--------------------------------------------------------------- 4. montage
# Avant 7 s, étapes 4 x 0,35 s, après 7 s, fin 2 s (17,4 s). Le son suit sans coupure.
ffmpeg -v error -y \
  -loop 1 -framerate 30 -t 7    -i "$TMP/c-avant.png" \
  -loop 1 -framerate 30 -t 0.35 -i "$TMP/c-e1.png" \
  -loop 1 -framerate 30 -t 0.35 -i "$TMP/c-e2.png" \
  -loop 1 -framerate 30 -t 0.35 -i "$TMP/c-e3.png" \
  -loop 1 -framerate 30 -t 0.35 -i "$TMP/c-e4.png" \
  -loop 1 -framerate 30 -t 7    -i "$TMP/c-apres.png" \
  -loop 1 -framerate 30 -t 2    -i "$TMP/c-fin.png" \
  -i "$TMP/avant.wav" -i "$TMP/apres.wav" \
  -filter_complex "
    [7:a]volume=${GAIN_AV}dB,asplit=2[av1][av2];
    [8:a]volume=${GAIN_AP}dB,asplit=2[ap1][ap2];
    [av1]atrim=0:7,asetpts=PTS-STARTPTS,showwaves=s=920x260:mode=cline:rate=30:scale=sqrt,format=rgba,alphaextract,lut=y='if(gt(val\,8)\,255\,0)'[mA];color=c=0x141519:s=920x260:r=30:d=7,format=rgba[cA];[cA][mA]alphamerge[wA];
    [ap1]atrim=0:7,asetpts=PTS-STARTPTS,showwaves=s=920x260:mode=cline:rate=30:scale=sqrt,format=rgba,alphaextract,lut=y='if(gt(val\,8)\,255\,0)'[mB];color=c=0xE8501A:s=920x260:r=30:d=7,format=rgba[cB];[cB][mB]alphamerge[wB];
    [0:v]format=rgba[bA];[bA][wA]overlay=80:1330:shortest=1,format=yuv420p,setsar=1[vA];
    [5:v]format=rgba[bB];[bB][wB]overlay=80:1330:shortest=1,format=yuv420p,setsar=1[vB];
    [1:v]format=yuv420p,setsar=1[e1];[2:v]format=yuv420p,setsar=1[e2];[3:v]format=yuv420p,setsar=1[e3];[4:v]format=yuv420p,setsar=1[e4];
    [6:v]format=yuv420p,setsar=1[vF];
    [vA][e1][e2][e3][e4][vB][vF]concat=n=7:v=1:a=0[v];
    [av2]atrim=0:8.4,asetpts=PTS-STARTPTS,afade=t=out:st=8.15:d=0.25[aA];
    [ap2]atrim=0:9,asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=8.1:d=0.9[aB];
    [aA][aB]concat=n=2:v=0:a=1[a]" \
  -map "[v]" -map "[a]" -r 30 -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart "$OUT"

echo "Prêt : $OUT"
