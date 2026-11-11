@echo off
title GeologgIA Cuña 3D — Servidor Local PWA
echo ===============================================================
echo   GEOLOGGIA Cuña3D 3D — ESTABILIDAD DE CUNAS Y TERRENO (PWA)
echo ===============================================================
echo Iniciando servidor en http://localhost:8095 ...
start "" "http://localhost:8095"
python -m http.server 8095
