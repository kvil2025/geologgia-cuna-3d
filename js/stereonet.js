/**
 * GeologgIA Cuña 3D — Proyección Estereográfica (Wulff / Schmidt) e Histograma Monte Carlo
 * Hemisferio Inferior · 100% Client-Side Canvas 2D
 */
(function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180.0;

  /**
   * Proyecta una línea con Plunge (0..90°) y Trend (0..360°) en el círculo unitario del hemisferio inferior
   * mode: 'wulff' (Equiangular) o 'schmidt' (Equiareal)
   */
  function projectLine(plungeDeg, trendDeg, mode) {
    const p = Math.max(0, Math.min(90, plungeDeg)) * DEG2RAD;
    const t = trendDeg * DEG2RAD;
    let r;
    if (mode === 'schmidt') {
      // Proyección Equiareal de Lambert-Schmidt: r = sqrt(2) * sin((90 - plunge)/2)
      r = Math.SQRT2 * Math.sin((Math.PI * 0.5 - p) * 0.5);
    } else {
      // Proyección Equiangular de Wulff: r = tan((90 - plunge)/2)
      r = Math.tan((Math.PI * 0.5 - p) * 0.5);
    }
    return {
      x: r * Math.sin(t),
      y: -r * Math.cos(t) // En Canvas Y crece hacia abajo, Norte está arriba (-Y)
    };
  }

  /**
   * Genera los puntos 2D del Gran Círculo de un plano con Dip y Dip Direction (°)
   */
  function greatCirclePoints(dipDeg, dipDirDeg, mode, steps = 72) {
    const dip = Math.max(0.1, Math.min(89.9, dipDeg)) * DEG2RAD;
    const strike = (dipDirDeg - 90.0) * DEG2RAD;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const alpha = (i / steps) * Math.PI; // 0 a 180° a lo largo del rumbo
      // Inclinación aparente (rake -> plunge/trend) sobre el plano
      const tanPlunge = Math.tan(dip) * Math.sin(alpha);
      const plunge = Math.atan(tanPlunge) / DEG2RAD;
      const trend = (strike + Math.atan2(Math.sin(alpha) * Math.cos(dip), Math.cos(alpha))) / DEG2RAD;
      pts.push(projectLine(plunge, (trend + 360) % 360, mode));
    }
    return pts;
  }

  function drawStereonet(canvasId, input, result, options) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const opts = options || {};
    const mode = opts.projection || 'wulff';
    const dark = opts.darkMode !== false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(280, rect.width || 360);
    const cssH = Math.max(280, rect.height || 360);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    // Fondo
    ctx.fillStyle = dark ? '#0b0f17' : '#f8fafc';
    ctx.fillRect(0, 0, cssW, cssH);

    const cx = cssW * 0.5;
    const cy = cssH * 0.5;
    const R = Math.min(cssW, cssH) * 0.41;

    // 1. Círculos de inmersión (Plunge 30°, 60°) y ejes N-S / E-W
    ctx.strokeStyle = dark ? 'rgba(148,163,184,0.16)' : 'rgba(71,85,105,0.18)';
    ctx.lineWidth = 1;
    [30, 60].forEach((pl) => {
      const p = projectLine(pl, 0, mode);
      const rPl = Math.abs(p.y) * R;
      ctx.beginPath();
      ctx.arc(cx, cy, rPl, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.stroke();

    // 2. Cono de Fricción Promedio (Sombreado interior)
    const avgPhi = 0.5 * ((input.joint1.phi || 35) + (input.joint2.phi || 35));
    const phiPt = projectLine(avgPhi, 0, mode);
    const rPhi = Math.abs(phiPt.y) * R;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.arc(cx, cy, rPhi, 0, Math.PI * 2, true);
    ctx.fillStyle = dark ? 'rgba(244,63,94,0.06)' : 'rgba(244,63,94,0.08)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(244,63,94,0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy, rPhi, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Función auxiliar para trazar un Gran Círculo
    function traceGreatCircle(dip, dipDir, color, width, dashed, label) {
      const pts = greatCirclePoints(dip, dipDir, mode, 72);
      ctx.save();
      if (dashed) ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 2.2;
      ctx.beginPath();
      pts.forEach((p, idx) => {
        const px = cx + p.x * R;
        const py = cy + p.y * R;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Etiqueta en el punto medio del arco
      if (label) {
        const mid = pts[Math.floor(pts.length * 0.5)];
        ctx.fillStyle = color;
        ctx.font = '600 11px Inter, sans-serif';
        ctx.fillText(label, cx + mid.x * R + 6, cy + mid.y * R - 5);
      }
      ctx.restore();
    }

    // 3. Grandes Círculos: Talud Superior, Cara del Talud, Junta 1 y Junta 2
    if (input.upperSlope && input.upperSlope.dip > 0.5) {
      traceGreatCircle(input.upperSlope.dip, input.upperSlope.dipDir, '#94a3b8', 1.5, true, 'Berma');
    }
    if (input.slope) {
      traceGreatCircle(input.slope.dip, input.slope.dipDir, '#00e5b4', 2.6, false, `Talud (${input.slope.dip}°/${input.slope.dipDir}°)`);
    }
    if (input.joint1) {
      traceGreatCircle(input.joint1.dip, input.joint1.dipDir, '#38bdf8', 2.4, false, `J1 (${input.joint1.dip}°/${input.joint1.dipDir}°)`);
    }
    if (input.joint2) {
      traceGreatCircle(input.joint2.dip, input.joint2.dipDir, '#f59e0b', 2.4, false, `J2 (${input.joint2.dip}°/${input.joint2.dipDir}°)`);
    }

    // 4. Polos adicionales del mapeo de terreno (si existen)
    if (Array.isArray(opts.fieldPlanes)) {
      opts.fieldPlanes.forEach((fp) => {
        // Polo de un plano con dip/dipDir tiene plunge = 90 - dip y trend = (dipDir + 180) % 360
        const polePlunge = Math.max(0, 90 - Number(fp.dip || 0));
        const poleTrend = (Number(fp.dipDir || 0) + 180) % 360;
        const pt = projectLine(polePlunge, poleTrend, mode);
        ctx.fillStyle = 'rgba(56,189,248,0.75)';
        ctx.beginPath();
        ctx.arc(cx + pt.x * R, cy + pt.y * R, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 5. Punto de la Línea de Intersección I_12 y Vector de Deslizamiento
    if (result && result.plunge !== undefined) {
      const iPt = projectLine(result.plunge, result.trend, mode);
      const ix = cx + iPt.x * R;
      const iy = cy + iPt.y * R;

      // Halo exterior
      const isCrit = result.valid && result.FS < 1.0;
      ctx.fillStyle = isCrit ? 'rgba(244,63,94,0.28)' : 'rgba(0,229,180,0.25)';
      ctx.beginPath();
      ctx.arc(ix, iy, 10, 0, Math.PI * 2);
      ctx.fill();

      // Punto central I_12
      ctx.fillStyle = isCrit ? '#f43f5e' : '#00e5b4';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(ix, iy, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText(`I₁₂ (${result.plunge.toFixed(1)}° / ${result.trend.toFixed(0)}°)`, ix + 9, iy + 4);
    }

    // 6. Círculo ecuatorial exterior y marcas cardinales (N, E, S, W)
    ctx.strokeStyle = dark ? '#38bdf8' : '#0d2560';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // Ticks cada 10°
    ctx.strokeStyle = dark ? 'rgba(148,163,184,0.45)' : 'rgba(71,85,105,0.45)';
    ctx.lineWidth = 1;
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = deg * DEG2RAD;
      const len = (deg % 30 === 0) ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(cx + R * Math.sin(rad), cy - R * Math.cos(rad));
      ctx.lineTo(cx + (R + len) * Math.sin(rad), cy - (R + len) * Math.cos(rad));
      ctx.stroke();
    }

    ctx.fillStyle = dark ? '#00e5b4' : '#0d2560';
    ctx.font = '800 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, cy - R - 16);
    ctx.fillStyle = dark ? '#94a3b8' : '#475569';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillText('S', cx, cy + R + 16);
    ctx.fillText('E', cx + R + 16, cy);
    ctx.fillText('W', cx - R - 16, cy);

    ctx.restore();
  }

  /**
   * Dibuja el Histograma de Factor de Seguridad de la Simulación Monte Carlo
   */
  function drawMonteCarloHistogram(canvasId, mcResult, darkMode = true) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !mcResult || !mcResult.valid) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(280, rect.width || 380);
    const cssH = Math.max(190, rect.height || 220);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = darkMode ? '#0b0f17' : '#f8fafc';
    ctx.fillRect(0, 0, cssW, cssH);

    const padL = 42;
    const padR = 18;
    const padT = 22;
    const padB = 32;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;

    const bins = mcResult.bins;
    const maxCount = Math.max(1, ...bins.map((b) => b.count));
    const xMin = bins[0].x0;
    const xMax = bins[bins.length - 1].x1;

    // Líneas horizontales de grilla
    ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = padT + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // Barras del histograma
    const barW = plotW / bins.length;
    bins.forEach((b, idx) => {
      const h = (b.count / maxCount) * plotH;
      const x = padL + idx * barW;
      const y = padT + plotH - h;
      const midFS = 0.5 * (b.x0 + b.x1);
      ctx.fillStyle = midFS < 1.0 ? 'rgba(244,63,94,0.82)' : 'rgba(0,229,180,0.78)';
      ctx.fillRect(x + 1, y, Math.max(2, barW - 2), h);
    });

    // Línea de Umbral Crítico FS = 1.0
    if (xMin <= 1.0 && xMax >= 1.0) {
      const xCrit = padL + ((1.0 - xMin) / Math.max(1e-5, xMax - xMin)) * plotW;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xCrit, padT);
      ctx.lineTo(xCrit, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = '#f43f5e';
      ctx.font = '700 10.5px "JetBrains Mono", monospace';
      ctx.fillText('FS = 1.0 (Falla)', xCrit + 5, padT + 11);
      ctx.restore();
    }

    // Etiquetas del eje X
    ctx.fillStyle = darkMode ? '#94a3b8' : '#475569';
    ctx.font = '600 10.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let k = 0; k <= 5; k++) {
      const val = xMin + ((xMax - xMin) * k) / 5;
      const x = padL + (plotW * k) / 5;
      ctx.fillText(val.toFixed(2), x, padT + plotH + 18);
    }

    ctx.restore();
  }

  global.WedgeCharts = {
    projectLine,
    greatCirclePoints,
    drawStereonet,
    drawMonteCarloHistogram
  };
})(typeof window !== 'undefined' ? window : globalThis);
