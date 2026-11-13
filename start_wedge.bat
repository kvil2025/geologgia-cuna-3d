@echo off
title GeologgIA Cuña 3D — Servidor Local PWA
echo ===============================================================
echo   GEOLOGGIA CUÑA 3D — ESTABILIDAD DE CUÑAS Y TERRENO (PWA)
echo ===============================================================
echo Iniciando servidor en http://localhost:8098 ...
start "" "http://localhost:8098"
python -m http.server 8098
