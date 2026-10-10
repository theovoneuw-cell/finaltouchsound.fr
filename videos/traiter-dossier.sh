#!/usr/bin/env bash
#==============================================================================
#  Dossier à vidéos : chaque son déposé dans « À traiter » donne deux vidéos
#  (FR et EN) dans « Prêtes », puis le son part dans « Traités ».
#  Uniquement tes propres sons ou des sons libres de droits : jamais ceux de clients.
#  Style dans le nom du fichier entre crochets, ex. « Ma prod [Trap].wav » (Rap par défaut).
#  Lancé automatiquement par launchd (fr.finaltouchsound.videos) à chaque dépôt.
#==============================================================================
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$HOME/Final Touch - Vidéos"   # raccourci sur le Bureau
A="$BASE/À traiter"; P="$BASE/Prêtes"; T="$BASE/Traités"
mkdir -p "$A" "$P" "$T"

sleep 3   # laisse la copie du fichier se terminer
shopt -s nullglob nocaseglob
for f in "$A"/*.{wav,mp3,aif,aiff,flac,m4a}; do
  nom="$(basename "$f")"
  style="Rap"
  [[ "$nom" =~ \[(Rap|Trap|RnB|Afro|Pop)\] ]] && style="${BASH_REMATCH[1]}"
  for langue in fr en; do
    if bash "$HERE/generer.sh" "$f" "$style" "$langue" >> "$BASE/journal.txt" 2>&1; then
      base="$(basename "${f%.*}" | sed -E 's/ *\[[^]]*\] *//g')"
      mv "$HERE/sortie/$base-$style-$langue.mp4" "$P/" 2>/dev/null
    else
      echo "$(date) : échec sur $nom ($langue)" >> "$BASE/journal.txt"
    fi
  done
  mv "$f" "$T/"
  osascript -e "display notification \"Vidéos prêtes : $nom\" with title \"Final Touch\"" >/dev/null 2>&1 || true
done
