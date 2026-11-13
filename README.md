# GeologgIA Cuña 3D — Estabilidad de Cuñas en Taludes & Mapeo de Terreno (PWA)

Aplicación web progresiva (**PWA 100% Client-Side & Offline-First**) para el análisis tridimensional de estabilidad de cuñas en taludes rocosos mediante equilibrio límite vectorial, proyección estereográfica, simulación probabilística de Monte Carlo y diseño de soporte en terreno.

## Características Principales

1. **Motor Analítico 3D Certificado (`js/wedge-engine.js`)**:
   - Paridad exacta al cuarto decimal (`|ΔFS| < 0.0001`) frente a los **12 casos oficiales del *Literatura Geotécnica Internacional (Hoek & Bray, Kovári & Fritz, Priest)***.
   - Geometría tetraédrica exacta con berma superior inclinada y grieta de tracción opcional.
   - Detección automática del mecanismo cinemático: deslizamiento por ambas juntas ($J_1 \cap J_2$), pérdida de contacto y deslizamiento por un único plano ($J_1$ o $J_2$), o caída libre.
   - Criterios de resistencia al corte **Mohr-Coulomb** ($c, \phi, i_{wav}$) y **Barton-Bandis** ($JRC, JCS, \phi_r$).
   - Subpresión de agua en fisuras, agua empalsada en el pie del talud (*Ponded Water*), sismo pseudoestático ($\eta = a/g$) y cargas externas puntuales.
2. **Visor CAD 3D Interactivo (`js/viewer3d.js`)**:
   - Modo Perspectiva 3D y **Modo Cuádruple Vista CAD (Planta / Frente / Perfil / Perspectiva)** estilo Cuña 3D.
   - Animación y control deslizante para extraer la cuña del macizo rocoso a lo largo de la dirección de deslizamiento.
   - Visualización de vectores 3D de fuerzas ($\mathbf{W}, \mathbf{S}, \mathbf{N}_1, \mathbf{N}_2, \mathbf{E}$) y pernos de anclaje.
3. **Módulo de Terreno & Diseño de Soporte**:
   - Captura de familias estructurales en terreno con soporte para sensor de orientación/brújula móvil (`DeviceOrientationEvent`).
   - **Combination Analyzer**: evalúa todos los pares $\binom{N}{2}$ de discontinuidades mapeadas para identificar las cuñas críticas del banco.
   - **Optimizador de Soporte**: calcula fuerza total requerida (MN / toneladas), número de pernos, malla sistemática $S \times S$ y espesor equivalente de shotcrete para un $FS$ de diseño objetivo.
4. **Proyección Estereográfica & Monte Carlo (`js/stereonet.js`)**:
   - Falsilla del hemisferio inferior Equiangular (Wulff) y Equiareal (Schmidt) en vivo.
   - Simulación de Monte Carlo (2,000 iteraciones) con cálculo de Probabilidad de Falla ($P_f$) e Índice de Confiabilidad ($\beta$).

## Ejecución Local Rápida

Haz doble clic en `start_wedge.bat` o ejecuta:

```bash
python -m http.server 8098
```

Y abre `http://localhost:8098` en cualquier navegador de escritorio o móvil.
