#!/usr/bin/env bash
# Crée un lanceur « DBML Studio » dans le menu des applications (icône incluse).
D="$(cd "$(dirname "$0")/.." && pwd)"
F="$D/dist/dbml-studio.html"; [ -f "$F" ] || F="$(ls "$D"/dbml-studio*.html | head -1)"
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/dbml-studio.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=DBML Studio
Exec=xdg-open "$F"
Icon=$D/assets/icon.png
Categories=Development;
EOF
echo "Lanceur créé."
