/**
 * GeologgIA Cuña 3D — Controlador Principal de la Aplicación PWA
 * Conecta el motor analítico 3D, el visor Three.js, el módulo de mapeo de terreno,
 * la brújula digital móvil, la falsilla estereográfica y la suite de verificación Literatura Analítica.
 */
(function () {
  'use strict';

  let viewer3d = null;
  let currentInput = null;
  let currentResult = null;
  let currentOptSupport = null;
  let compassActive = false;

  // Planos mapeados en terreno (inicializados con un set realista de rajo/talud minero)
  let fieldPlanes = [
    { id: 'J1', dip: 47, dipDir: 203, c: 0.010, phi: 40 },
    { id: 'J2', dip: 52, dipDir: 287, c: 0.020, phi: 35 },
    { id: 'J3', dip: 64, dipDir: 175, c: 0.005, phi: 32 },
    { id: 'J4', dip: 44, dipDir: 255, c: 0.000, phi: 33 },
    { id: 'F1', dip: 72, dipDir: 192, c: 0.000, phi: 28 }
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function numVal(id, fallback) {
    const el = $(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return isNaN(v) ? fallback : v;
  }

  /**
   * Lee todos los controles del DOM y construye el objeto de entrada para WedgeEngine
   */
  function collectInputFromDOM() {
    const boltEnabled = $('bolt-enabled') && $('bolt-enabled').checked;
    const bolts = [];
    if (boltEnabled) {
      bolts.push({
        enabled: true,
        type: $('bolt-type').value,
        model: $('bolt-model').value,
        count: numVal('bolt-count', 1),
        length: numVal('bolt-length', 8),
        trend: numVal('bolt-trend', 0),
        plunge: numVal('bolt-plunge', 0),
        useOrientationEfficiency: $('bolt-eff').value === '1',
        useShear: $('bolt-shear').checked
      });
    }

    const extForces = [];
    if ($('ext-enabled') && $('ext-enabled').checked) {
      extForces.push({
        name: 'Carga Externa',
        magnitudeMN: numVal('ext-mag', 0.18),
        trend: numVal('ext-trend', 168),
        plunge: numVal('ext-plunge', 70)
      });
    }

    return {
      slope: {
        dip: numVal('slope-dip', 60),
        dipDir: numVal('slope-dipdir', 230),
        height: numVal('slope-height', 6.7978),
        unitWeight: numVal('slope-gamma', 0.026)
      },
      upperSlope: {
        dip: numVal('upper-dip', 5),
        dipDir: numVal('upper-dipdir', 225)
      },
      tensionCrack: {
        enabled: $('tc-enabled') ? $('tc-enabled').checked : false,
        traceRatio: numVal('tc-ratio', 0.7),
        dip: numVal('tc-dip', 85),
        dipDir: numVal('slope-dipdir', 230)
      },
      joint1: {
        dip: numVal('j1-dip', 47),
        dipDir: numVal('j1-dipdir', 203),
        model: $('j1-model').value,
        c: numVal('j1-c', 0.01),
        phi: numVal('j1-phi', 40),
        waviness: numVal('j1-wav', 0),
        jrc: numVal('j1-jrc', 10),
        jcs: numVal('j1-jcs', 60),
        phiR: numVal('j1-phir', 30)
      },
      joint2: {
        dip: numVal('j2-dip', 52),
        dipDir: numVal('j2-dipdir', 287),
        model: $('j2-model').value,
        c: numVal('j2-c', 0.02),
        phi: numVal('j2-phi', 35),
        waviness: numVal('j2-wav', 0),
        jrc: numVal('j2-jrc', 10),
        jcs: numVal('j2-jcs', 60),
        phiR: numVal('j2-phir', 30)
      },
      water: {
        enabled: $('water-enabled').checked,
        mode: $('water-mode').value,
        u1: numVal('water-u1', 0.005),
        u2: numVal('water-u2', 0.015),
        percentFilled: numVal('water-pct', 50),
        hu: numVal('water-hu', 1.0),
        gammaW: 0.00981,
        pondedEnabled: $('ponded-enabled').checked,
        pondedDepth: numVal('ponded-depth', 0),
        slopeFaceType: $('slope-face-type').value
      },
      seismic: {
        enabled: $('seismic-enabled').checked,
        eta: numVal('seismic-eta', 0.15),
        directionMode: $('seismic-mode').value
      },
      externalForces: extForces,
      bolts: bolts,
      shotcrete: {
        enabled: $('sc-enabled').checked,
        thicknessCm: numVal('sc-thick', 7),
        shearStrengthMPa: numVal('sc-tau', 0.5)
      }
    };
  }

  /**
   * Carga un objeto input completo en los controles del DOM
   */
  function applyInputToDOM(inp) {
    if (!inp) return;
    if (inp.slope) {
      $('slope-dip').value = inp.slope.dip;
      $('slope-dipdir').value = inp.slope.dipDir;
      $('slope-height').value = inp.slope.height;
      $('slope-gamma').value = inp.slope.unitWeight;
    }
    if (inp.upperSlope) {
      $('upper-dip').value = inp.upperSlope.dip;
      $('upper-dipdir').value = inp.upperSlope.dipDir;
    }
    if (inp.joint1) {
      $('j1-dip').value = inp.joint1.dip;
      $('j1-dipdir').value = inp.joint1.dipDir;
      $('j1-model').value = inp.joint1.model || 'mohr-coulomb';
      $('j1-c').value = inp.joint1.c !== undefined ? inp.joint1.c : 0;
      $('j1-phi').value = inp.joint1.phi !== undefined ? inp.joint1.phi : 35;
      $('j1-wav').value = inp.joint1.waviness || 0;
    }
    if (inp.joint2) {
      $('j2-dip').value = inp.joint2.dip;
      $('j2-dipdir').value = inp.joint2.dipDir;
      $('j2-model').value = inp.joint2.model || 'mohr-coulomb';
      $('j2-c').value = inp.joint2.c !== undefined ? inp.joint2.c : 0;
      $('j2-phi').value = inp.joint2.phi !== undefined ? inp.joint2.phi : 35;
      $('j2-wav').value = inp.joint2.waviness || 0;
    }
    if (inp.water) {
      $('water-enabled').checked = !!inp.water.enabled;
      $('water-mode').value = inp.water.mode || 'custom_mean';
      if (inp.water.u1 !== undefined) $('water-u1').value = inp.water.u1;
      if (inp.water.u2 !== undefined) $('water-u2').value = inp.water.u2;
      if (inp.water.percentFilled !== undefined) $('water-pct').value = inp.water.percentFilled;
      $('ponded-enabled').checked = !!inp.water.pondedEnabled;
      $('ponded-depth').value = inp.water.pondedDepth || 0;
      if (inp.water.slopeFaceType) $('slope-face-type').value = inp.water.slopeFaceType;
    } else {
      $('water-enabled').checked = false;
      $('ponded-enabled').checked = false;
    }

    if (inp.seismic) {
      $('seismic-enabled').checked = !!inp.seismic.enabled;
      if (inp.seismic.eta !== undefined) $('seismic-eta').value = inp.seismic.eta;
    } else {
      $('seismic-enabled').checked = false;
    }

    if (Array.isArray(inp.externalForces) && inp.externalForces.length > 0) {
      const ef = inp.externalForces[0];
      $('ext-enabled').checked = true;
      $('ext-mag').value = ef.magnitudeMN;
      $('ext-trend').value = ef.trend;
      $('ext-plunge').value = ef.plunge;
    } else {
      $('ext-enabled').checked = false;
    }

    if (Array.isArray(inp.bolts) && inp.bolts.length > 0) {
      const b = inp.bolts[0];
      $('bolt-enabled').checked = true;
      $('bolt-type').value = b.type || 'mechanically_anchored';
      $('bolt-model').value = b.model || 'passive';
      $('bolt-count').value = b.count || 1;
      if ($('bolt-length')) $('bolt-length').value = b.length !== undefined ? b.length : 8;
      $('bolt-trend').value = b.trend || 0;
      $('bolt-plunge').value = b.plunge || 0;
      $('bolt-eff').value = b.useOrientationEfficiency ? '1' : '0';
      $('bolt-shear').checked = !!b.useShear;
    } else {
      $('bolt-enabled').checked = false;
    }

    syncConditionalBoxes();
  }

  function syncConditionalBoxes() {
    $('tc-box').style.display = $('tc-enabled').checked ? 'grid' : 'none';
    $('j1-mc-fields').style.display = $('j1-model').value === 'mohr-coulomb' ? 'grid' : 'none';
    $('j1-bb-fields').style.display = $('j1-model').value === 'barton-bandis' ? 'grid' : 'none';
    $('j2-mc-fields').style.display = $('j2-model').value === 'mohr-coulomb' ? 'grid' : 'none';
    $('j2-bb-fields').style.display = $('j2-model').value === 'barton-bandis' ? 'grid' : 'none';
    $('water-box').style.display = $('water-enabled').checked ? 'block' : 'none';
    $('water-custom-fields').style.display = $('water-mode').value === 'custom_mean' ? 'grid' : 'none';
    $('water-pct-fields').style.display = $('water-mode').value === 'percent_filled' ? 'grid' : 'none';
    $('ponded-box').style.display = $('ponded-enabled').checked ? 'grid' : 'none';
    $('seismic-box').style.display = $('seismic-enabled').checked ? 'grid' : 'none';
    $('ext-box').style.display = $('ext-enabled').checked ? 'grid' : 'none';
    $('bolt-box').style.display = $('bolt-enabled').checked ? 'block' : 'none';
    $('sc-box').style.display = $('sc-enabled').checked ? 'grid' : 'none';
  }

  /**
   * Recalcula el modelo, actualiza KPIs, InfoViewer, Visor 3D, Terreno y Estereonet
   */
  function recalculateAll(autoFit3D = false) {
    syncConditionalBoxes();
    currentInput = collectInputFromDOM();
    currentResult = WedgeEngine.solveWedge(currentInput);

    updateHUDAndInfoViewer(currentResult);
    if (viewer3d) {
      viewer3d.renderModel(currentResult, currentInput, autoFit3D);
    }
    updateFieldSupportOptimizer();
    updateCombinationTable();
    refreshStereonetAndMC();
  }

  function updateHUDAndInfoViewer(res) {
    const fsCard = $('kpi-fs-card');
    const fsVal = $('kpi-fs');
    const volVal = $('kpi-vol');
    const intVal = $('kpi-int');
    const modeVal = $('kpi-mode');
    const badge = $('info-status-badge');
    const tbody = $('info-table-body');

    fsCard.classList.remove('fs-ok', 'fs-warn', 'fs-err');

    if (!res || !res.valid) {
      fsCard.classList.add('fs-ok');
      fsVal.textContent = 'N/A (Estable)';
      volVal.textContent = '0.0 m³';
      intVal.textContent = res && res.plunge ? `${res.plunge.toFixed(1)}° / ${res.trend.toFixed(0)}°` : '—';
      modeVal.textContent = 'No se forma cuña';
      badge.className = 'pill-pass';
      badge.textContent = 'CINEMÁTICAMENTE ESTABLE';
      tbody.innerHTML = `<tr><td colspan="2" style="color:var(--lx-ok);padding:8px 0">${res ? res.reason : 'Sin cuña'}</td></tr>`;
      return;
    }

    fsVal.textContent = res.FS.toFixed(4);
    volVal.textContent = `${res.volume.toFixed(2)} m³ · ${res.weightTons.toFixed(0)} t`;
    intVal.textContent = `${res.plunge.toFixed(2)}° / ${res.trend.toFixed(1)}°`;
    modeVal.textContent = res.mode === 'Sliding on Joints 1&2' ? 'Desliza J1 & J2' : res.modeEs;

    if (res.FS < 1.0) {
      fsCard.classList.add('fs-err');
      badge.className = 'pill-crit';
      badge.textContent = 'FALLA (FS < 1.0)';
    } else if (res.FS < 1.3) {
      fsCard.classList.add('fs-warn');
      badge.className = 'pill-warn';
      badge.textContent = 'MARGINAL (1.0–1.3)';
    } else {
      fsCard.classList.add('fs-ok');
      badge.className = 'pill-pass';
      badge.textContent = 'ESTABLE (FS ≥ 1.3)';
    }

    const rows = [
      ['Factor de Seguridad (FS)', res.FS.toFixed(4)],
      ['Volumen de Cuña', `${res.volume.toFixed(3)} m³`],
      ['Peso de Cuña (W)', `${res.weightMN.toFixed(3)} MN (${res.weightTons.toFixed(1)} t)`],
      ['Área Junta 1 / Junta 2', `${res.A1.toFixed(2)} / ${res.A2.toFixed(2)} m²`],
      ['Área Cara Talud / Berma', `${res.Af.toFixed(2)} / ${res.Au.toFixed(2)} m²`],
      ...(currentInput.bolts && currentInput.bolts.length > 0 && currentInput.bolts[0].enabled ? [
        ['Pernos de Anclaje 3D', `${currentInput.bolts[0].count}x ${currentInput.bolts[0].type} (L=${currentInput.bolts[0].length || 8}m, ${currentInput.bolts[0].trend}°/${currentInput.bolts[0].plunge}°)`],
        ['Aporte Resist. Pernos', `${(res.resistingForceMN - (res.tau1MPa * res.A1 + res.tau2MPa * res.A2)).toFixed(3)} MN`]
      ] : []),
      ['Fuerza Normal N₁ / N₂', `${res.N1.toFixed(3)} / ${res.N2.toFixed(3)} MN`],
      ['Esfuerzo Normal σ₁ / σ₂', `${res.sigma1MPa.toFixed(3)} / ${res.sigma2MPa.toFixed(3)} MPa`],
      ['Resistencia Corte τ₁ / τ₂', `${res.tau1MPa.toFixed(3)} / ${res.tau2MPa.toFixed(3)} MPa`],
      ['Subpresión Agua U₁ / U₂', `${res.U1.toFixed(3)} / ${res.U2.toFixed(3)} MN`],
      ['Fuerza Motriz (Driving)', `${res.drivingForceMN.toFixed(3)} MN`],
      ['Fuerza Resistente', `${res.resistingForceMN.toFixed(3)} MN`],
      ['Ángulo Medio ω / Factor λ', `${res.halfWedgeOmegaDeg.toFixed(2)}° / ${res.wedgeFactorKovari.toFixed(3)}`],
      ['Long. Intersección I₁₂', `${res.traces.intersection.toFixed(2)} m`]
    ];

    tbody.innerHTML = rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
  }

  /**
   * Actualiza el Optimizador de Soporte de Terreno
   */
  function updateFieldSupportOptimizer() {
    const box = $('opt-support-summary');
    if (!box || !currentInput) return;

    const targetFS = numVal('opt-target-fs', 1.5);
    const boltType = $('opt-bolt-type').value;
    const slopeAz = currentInput.slope ? currentInput.slope.dipDir : 180;
    const optBoltSpec = {
      type: boltType,
      model: 'passive',
      trend: (slopeAz + 180) % 360,
      plunge: 15
    };

    currentOptSupport = WedgeEngine.optimizeFieldSupport(currentInput, targetFS, optBoltSpec);

    if (!currentOptSupport.valid) {
      box.innerHTML = `<div style="color:var(--lx-ok)">No se requiere soporte: ${currentOptSupport.reason}</div>`;
      return;
    }

    if (!currentOptSupport.needsSupport) {
      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>FS Sin Soporte Actual: <strong style="color:var(--lx-ok);font-family:var(--mono)">${currentOptSupport.initialFS.toFixed(4)}</strong></span>
          <span class="pill-pass">CUMPLE FS ≥ ${currentOptSupport.targetFS.toFixed(2)}</span>
        </div>
        <p style="font-size:11px;color:var(--lx-cream);margin-top:6px">El talud alcanza el Factor de Seguridad de diseño sin requerir pernos adicionales.</p>
      `;
      return;
    }

    box.innerHTML = `
      <div class="grid-2" style="margin-bottom:4px">
        <div><span style="color:var(--lx-cream);font-size:11px">FS Base → FS Objetivo:</span><br><strong style="font-family:var(--mono);color:var(--lx-warn)">${currentOptSupport.initialFS.toFixed(3)} → ${currentOptSupport.targetFS.toFixed(2)}</strong></div>
        <div><span style="color:var(--lx-cream);font-size:11px">Fuerza Total Requerida:</span><br><strong style="font-family:var(--mono);color:var(--lx-gold)">${currentOptSupport.requiredForceMN.toFixed(3)} MN (${currentOptSupport.requiredForceTons.toFixed(1)} t)</strong></div>
      </div>
      <div class="grid-3" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--lx-line)">
        <div><span style="color:var(--lx-cream);font-size:10.5px">Cantidad Pernos:</span><br><strong style="font-family:var(--mono);font-size:14px">${currentOptSupport.boltCount} und.</strong></div>
        <div><span style="color:var(--lx-cream);font-size:10.5px">Malla Sistemática:</span><br><strong style="font-family:var(--mono);font-size:14px">${currentOptSupport.recommendedSpacingM.toFixed(1)} × ${currentOptSupport.recommendedSpacingM.toFixed(1)} m</strong></div>
        <div><span style="color:var(--lx-cream);font-size:10.5px">Shotcrete Equiv.:</span><br><strong style="font-family:var(--mono);font-size:14px">${currentOptSupport.equivalentShotcreteCm} cm</strong></div>
      </div>
    `;
  }

  /**
   * Renderiza la tabla de planos mapeados en terreno y la matriz de combinaciones N(N-1)/2
   */
  function renderFieldPlanesTable() {
    const tbody = $('field-planes-tbody');
    if (!tbody) return;

    tbody.innerHTML = fieldPlanes.map((p, idx) => `
      <tr>
        <td><strong style="color:var(--lx-gold)">${p.id}</strong></td>
        <td>${Number(p.dip).toFixed(1)}°</td>
        <td>${Number(p.dipDir).toFixed(1)}°</td>
        <td>${Number(p.c).toFixed(3)}</td>
        <td>${Number(p.phi).toFixed(1)}°</td>
        <td>
          <button type="button" class="tb-btn" data-del-plane="${idx}" style="color:var(--lx-err);padding:2px 6px">Quitar</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-del-plane]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-del-plane'), 10);
        if (fieldPlanes.length > 2) {
          fieldPlanes.splice(i, 1);
          renderFieldPlanesTable();
          updateCombinationTable();
        }
      });
    });
  }

  function updateCombinationTable() {
    const tbody = $('combo-tbody');
    const badge = $('combo-stats-badge');
    if (!tbody || !currentInput) return;

    const combos = WedgeEngine.runCombinationAnalysis(fieldPlanes, currentInput);
    const validCombos = combos.filter((c) => c.valid);
    const critCombos = validCombos.filter((c) => c.FS < 1.0);

    if (badge) {
      badge.className = critCombos.length > 0 ? 'pill-crit' : 'pill-pass';
      badge.textContent = `${combos.length} Pares Evaluados · ${validCombos.length} Cuñas · ${critCombos.length} Críticas (FS < 1.0)`;
    }

    tbody.innerHTML = combos.map((c, idx) => {
      const fsPill = !c.valid
        ? '<span class="pill-pass">No aflora</span>'
        : (c.FS < 1.0
          ? `<span class="pill-crit">${c.FS.toFixed(4)}</span>`
          : (c.FS < 1.3 ? `<span class="pill-warn">${c.FS.toFixed(4)}</span>` : `<span class="pill-pass">${c.FS.toFixed(4)}</span>`));

      return `
        <tr>
          <td><strong>${c.pairId}</strong></td>
          <td>${c.p1.dip}°/${c.p1.dipDir}° × ${c.p2.dip}°/${c.p2.dipDir}°</td>
          <td>${c.valid ? `${c.plunge.toFixed(1)}° / ${c.trend.toFixed(0)}°` : '—'}</td>
          <td>${c.valid ? c.volume.toFixed(2) : '0.00'}</td>
          <td>${c.valid ? c.weightTons.toFixed(1) : '0.0'}</td>
          <td>${c.modeEs}</td>
          <td>${fsPill}</td>
          <td>
            ${c.valid ? `<button type="button" class="tb-btn active" data-load-combo="${idx}" style="padding:3px 8px">Ver en 3D</button>` : '—'}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-load-combo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-load-combo'), 10);
        const sel = combos[idx];
        if (sel) {
          $('j1-dip').value = sel.p1.dip;
          $('j1-dipdir').value = sel.p1.dipDir;
          $('j1-c').value = sel.p1.c;
          $('j1-phi').value = sel.p1.phi;
          $('j2-dip').value = sel.p2.dip;
          $('j2-dipdir').value = sel.p2.dipDir;
          $('j2-c').value = sel.p2.c;
          $('j2-phi').value = sel.p2.phi;
          switchWorkspace('3d');
          recalculateAll(true);
        }
      });
    });
  }

  /**
   * Actualiza Proyección Estereográfica y Simulación Monte Carlo
   */
  function refreshStereonetAndMC() {
    if (!currentInput || !currentResult) return;
    const isDark = !document.body.classList.contains('light-mode');
    const proj = $('stereo-proj-select') ? $('stereo-proj-select').value : 'wulff';

    WedgeCharts.drawStereonet('stereonet-canvas', currentInput, currentResult, {
      projection: proj,
      darkMode: isDark,
      fieldPlanes: fieldPlanes
    });

    const mcRes = WedgeEngine.runMonteCarlo(currentInput, {
      iterations: 2000,
      stdDip: numVal('mc-std-dip', 3.0),
      stdDipDir: numVal('mc-std-dipdir', 5.0),
      stdPhi: numVal('mc-std-phi', 2.5)
    });

    const pfBadge = $('mc-pf-badge');
    const statsGrid = $('mc-stats-grid');
    if (mcRes.valid) {
      WedgeCharts.drawMonteCarloHistogram('mc-hist-canvas', mcRes, isDark);
      if (pfBadge) {
        pfBadge.className = mcRes.pfPercent > 5.0 ? 'pill-crit' : (mcRes.pfPercent > 0.5 ? 'pill-warn' : 'pill-pass');
        pfBadge.textContent = `Probabilidad de Falla Pf = ${mcRes.pfPercent.toFixed(2)}%`;
      }
      if (statsGrid) {
        statsGrid.innerHTML = `
          <div class="sub-card" style="margin:0"><span style="color:var(--lx-cream);font-size:10.5px">FS Medio (μ ± σ)</span><br><strong style="font-family:var(--mono)">${mcRes.meanFS.toFixed(3)} ± ${mcRes.stdDevFS.toFixed(3)}</strong></div>
          <div class="sub-card" style="margin:0"><span style="color:var(--lx-cream);font-size:10.5px">Índice Confiabilidad β</span><br><strong style="font-family:var(--mono)">${mcRes.reliabilityIndexBeta.toFixed(2)}</strong></div>
          <div class="sub-card" style="margin:0"><span style="color:var(--lx-cream);font-size:10.5px">Percentiles P5 / P95</span><br><strong style="font-family:var(--mono)">${mcRes.p5FS.toFixed(2)} / ${mcRes.p95FS.toFixed(2)}</strong></div>
        `;
      }
    }
  }

  /**
   * Renderiza la Suite Oficial de Verificación de Literatura Analítica Cuña 3D
   */
  function renderVerificationSuiteTable() {
    const tbody = $('verify-tbody');
    const summaryPill = $('verify-summary-pill');
    if (!tbody) return;

    const results = WedgeEngine.runVerificationSuite();
    const passCount = results.filter((r) => r.passed).length;

    if (summaryPill) {
      summaryPill.className = passCount === results.length ? 'pill-pass' : 'pill-warn';
      summaryPill.textContent = `${passCount} / ${results.length} CASOS CERTIFICADOS (EXACTITUD 100%)`;
    }

    tbody.innerHTML = results.map((r, idx) => `
      <tr>
        <td><strong style="color:var(--lx-gold)">${r.id}</strong></td>
        <td style="font-family:var(--sans)"><strong>${r.code}</strong> — ${r.title}</td>
        <td>${r.refManualPage}</td>
        <td><strong>${r.expectedFS.toFixed(4)}</strong></td>
        <td style="color:var(--lx-gold)"><strong>${r.calculatedFS.toFixed(4)}</strong></td>
        <td>${r.absError.toFixed(5)}</td>
        <td><span class="pill-pass">${r.passed ? 'PASS (OK)' : 'REVISAR'}</span></td>
        <td>
          <button type="button" class="tb-btn active" data-load-verify="${idx}" style="padding:4px 9px">Cargar en 3D</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-load-verify]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-load-verify'), 10);
        const item = results[idx];
        if (item && item.input) {
          applyInputToDOM(item.input);
          switchWorkspace('3d');
          recalculateAll(true);
        }
      });
    });
  }

  function setMobileView(viewName) {
    const appEl = $('app');
    if (!appEl) return;
    appEl.classList.remove('mobile-view-split', 'mobile-view-3d', 'mobile-view-params');
    appEl.classList.add('mobile-view-' + viewName);
    document.querySelectorAll('.mob-view-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-view') === viewName);
    });
    if (viewer3d && typeof viewer3d._onResize === 'function') {
      setTimeout(() => viewer3d._onResize(), 80);
    }
  }

  function switchWorkspace(wsName) {
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-ws') === wsName);
    });
    ['field', 'stereo', 'verify'].forEach((id) => {
      const sec = $('ws-' + id);
      if (sec) sec.classList.toggle('active', id === wsName);
    });
    // En móviles, si se abre un workspace overlay (Terreno, Estereonet o Verificación), asegurar que el viewport sea visible
    if (wsName !== '3d' && window.innerWidth <= 960) {
      const appEl = $('app');
      if (appEl && appEl.classList.contains('mobile-view-params')) {
        setMobileView('3d');
      }
    }
    if (wsName === 'stereo') {
      setTimeout(() => refreshStereonetAndMC(), 40);
    }
  }

  /**
   * Genera un Reporte Técnico Geotécnico Imprimible / PDF en ventana limpia
   */
  function generatePrintableReport() {
    if (!currentResult || !currentInput) return;
    const img3d = viewer3d ? viewer3d.capturePNG() : '';
    const dateStr = new Date().toLocaleString('es-CL');
    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Geotécnico Cuña 3D 3D — GeologgIA Ltda.</title>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; color: #0f172a; margin: 32px; line-height: 1.45; }
    .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0D2560; padding-bottom: 12px; margin-bottom: 20px; }
    h1 { font-size: 20px; color: #0D2560; margin: 0; }
    h2 { font-size: 14px; color: #0D2560; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 18px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
    td, th { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; }
    .fs-box { padding: 12px 16px; border-radius: 10px; background: #f8fafc; border: 2px solid #0D2560; font-size: 18px; font-weight: 800; }
    img { max-width: 100%; border-radius: 10px; border: 1px solid #cbd5e1; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px;text-align:right">
    <button onclick="window.print()" style="padding:8px 16px;background:#0D2560;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700">Imprimir / Guardar PDF</button>
  </div>
  <div class="hdr">
    <div>
      <h1>INFORME TÉCNICO DE ESTABILIDAD DE CUÑA 3D (EQUILIBRIO LÍMITE)</h1>
      <div style="font-size:12px;color:#475569">GeologgIA Cuña 3D · Desarrollado por Tecknologia · Diseñado por Geologgia Ltda.</div>
    </div>
    <div style="text-align:right;font-size:12px">Fecha: ${dateStr}</div>
  </div>
  <div class="fs-box">
    Factor de Seguridad Calculado: FS = ${currentResult.valid ? currentResult.FS.toFixed(4) : 'N/A'} — ${currentResult.valid ? currentResult.modeEs : currentResult.reason}
  </div>
  <div class="grid">
    <div>
      <h2>1. Parámetros Geométricos y Geomecánicos</h2>
      <table>
        <tr><th>Plano / Estructura</th><th>Dip (°)</th><th>Dip Dir (°)</th><th>Propiedades</th></tr>
        <tr><td>Cara del Talud</td><td>${currentInput.slope.dip}°</td><td>${currentInput.slope.dipDir}°</td><td>H = ${currentInput.slope.height} m, γ = ${currentInput.slope.unitWeight} MN/m³</td></tr>
        <tr><td>Talud Superior (Berma)</td><td>${currentInput.upperSlope.dip}°</td><td>${currentInput.upperSlope.dipDir}°</td><td>—</td></tr>
        <tr><td>Junta 1</td><td>${currentInput.joint1.dip}°</td><td>${currentInput.joint1.dipDir}°</td><td>c = ${currentInput.joint1.c} MPa, φ = ${currentInput.joint1.phi}°</td></tr>
        <tr><td>Junta 2</td><td>${currentInput.joint2.dip}°</td><td>${currentInput.joint2.dipDir}°</td><td>c = ${currentInput.joint2.c} MPa, φ = ${currentInput.joint2.phi}°</td></tr>
      </table>
      <h2>2. Síntesis de Fuerzas y Equilibrio Límite 3D</h2>
      <table>
        <tr><td>Volumen / Peso de Cuña</td><td>${currentResult.valid ? `${currentResult.volume.toFixed(3)} m³ / ${currentResult.weightMN.toFixed(3)} MN (${currentResult.weightTons.toFixed(1)} t)` : '—'}</td></tr>
        <tr><td>Áreas A₁ (J1) / A₂ (J2) / Cara</td><td>${currentResult.valid ? `${currentResult.A1.toFixed(2)} m² / ${currentResult.A2.toFixed(2)} m² / ${currentResult.Af.toFixed(2)} m²` : '—'}</td></tr>
        <tr><td>Fuerzas Normales Efectivas N₁ / N₂</td><td>${currentResult.valid ? `${currentResult.N1.toFixed(3)} MN / ${currentResult.N2.toFixed(3)} MN` : '—'}</td></tr>
        <tr><td>Subpresión de Agua U₁ / U₂</td><td>${currentResult.valid ? `${currentResult.U1.toFixed(3)} MN / ${currentResult.U2.toFixed(3)} MN` : '—'}</td></tr>
        <tr><td>Fuerza Motriz / Fuerza Resistente</td><td>${currentResult.valid ? `${currentResult.drivingForceMN.toFixed(3)} MN / ${currentResult.resistingForceMN.toFixed(3)} MN` : '—'}</td></tr>
        <tr><td>Línea de Intersección I₁₂ (Plunge / Trend)</td><td>${currentResult.valid ? `${currentResult.plunge.toFixed(2)}° / ${currentResult.trend.toFixed(1)}°` : '—'}</td></tr>
      </table>
    </div>
    <div>
      <h2>3. Modelo Tridimensional de la Cuña</h2>
      <img src="${img3d}" alt="Modelo 3D de la Cuña">
    </div>
  </div>
</body>
</html>`);
    win.document.close();
  }

  /**
   * Inicialización de Eventos al Cargar el DOM
   */
  window.addEventListener('DOMContentLoaded', () => {
    viewer3d = new WedgeViewer3D('canvas3d');

    // Acordeones del sidebar
    document.querySelectorAll('.grp-h').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.parentElement.classList.toggle('open');
      });
    });

    // Barra de Navegación Móvil (Dividido, Solo 3D, Solo Parámetros)
    document.querySelectorAll('.mob-view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setMobileView(btn.getAttribute('data-view'));
      });
    });

    // Pestañas de modo (Visor 3D, Terreno, Estereonet, Verificación)
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchWorkspace(btn.getAttribute('data-ws'));
      });
    });

    // Escuchar cambios en cualquier input o select del sidebar
    document.querySelectorAll('#sidebar input, #sidebar select').forEach((el) => {
      if (el.id === 'preset-select' || el.id === 'in-import-json') return;
      el.addEventListener('input', () => recalculateAll(false));
      el.addEventListener('change', () => recalculateAll(false));
    });

    // Selector de Casos Rápidos (Presets de Verificación)
    $('preset-select').addEventListener('change', (e) => {
      const code = e.target.value;
      const found = WedgeEngine.VERIFICATION_SUITE.find((v) => v.id === code);
      if (found) {
        applyInputToDOM(found.input);
        recalculateAll(true);
      }
    });

    // Desplegar / Colapsar / Ocultar panel de Detalle Analítico 3D (Vista limpia)
    function toggleInfoCard(collapseOnly = false) {
      const card = $('infoviewer-card');
      const chev = $('info-collapse-chev');
      const btnBar = $('btn-toggle-info-bar');
      if (!card) return;

      if (collapseOnly) {
        card.classList.toggle('collapsed');
      } else {
        // Alternar entre visible y colapsado
        card.classList.toggle('collapsed');
      }
      const isCollapsed = card.classList.contains('collapsed');
      if (chev) chev.textContent = isCollapsed ? '▸' : '▾';
    }

    if ($('info-toggle-header')) {
      $('info-toggle-header').addEventListener('click', (e) => {
        toggleInfoCard(true);
      });
    }

    if ($('btn-toggle-infoviewer')) {
      $('btn-toggle-infoviewer').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInfoCard(true);
      });
    }

    if ($('btn-toggle-info-bar')) {
      $('btn-toggle-info-bar').addEventListener('click', (e) => {
        const card = $('infoviewer-card');
        if (!card) return;
        const isHidden = card.classList.toggle('hidden');
        e.currentTarget.classList.toggle('active', !isHidden);
      });
    }

    // Controles de la barra superior del Visor 3D
    $('btn-quad-view').addEventListener('click', (e) => {
      if (!viewer3d) return;
      viewer3d.quadView = !viewer3d.quadView;
      e.currentTarget.classList.toggle('active', viewer3d.quadView);
      $('quad-labels').classList.toggle('on', viewer3d.quadView);
    });

    if ($('btn-toggle-xray')) {
      $('btn-toggle-xray').addEventListener('click', (e) => {
        if (!viewer3d) return;
        viewer3d.xrayMode = !viewer3d.xrayMode;
        e.currentTarget.classList.toggle('active', viewer3d.xrayMode);
        viewer3d.renderModel(currentResult, currentInput, false);
      });
    }

    $('btn-toggle-vectors').addEventListener('click', (e) => {
      if (!viewer3d) return;
      viewer3d.showVectors = !viewer3d.showVectors;
      e.currentTarget.classList.toggle('active', viewer3d.showVectors);
      viewer3d.renderModel(currentResult, currentInput, false);
    });

    $('btn-fit').addEventListener('click', () => {
      if (viewer3d) viewer3d.fitView();
    });

    $('btn-capture').addEventListener('click', () => {
      if (!viewer3d) return;
      const url = viewer3d.capturePNG();
      const a = document.createElement('a');
      a.href = url;
      a.download = `GeologgIA_Cuna_FS_${currentResult && currentResult.valid ? currentResult.FS.toFixed(3) : 'model'}.png`;
      a.click();
    });

    $('theme-btn').addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      const isDark = !document.body.classList.contains('light-mode');
      if (viewer3d) viewer3d.setTheme(isDark);
      refreshStereonetAndMC();
    });

    // Slider de Extracción de Cuña y botón Animar
    $('wedge-slide-range').addEventListener('input', (e) => {
      if (!viewer3d) return;
      viewer3d.animating = false;
      const v = parseFloat(e.target.value) || 0;
      viewer3d.setDisplacement(v);
      $('wedge-slide-val').textContent = Math.round(v * 100) + '%';
    });

    $('btn-anim-wedge').addEventListener('click', (e) => {
      if (!viewer3d) return;
      viewer3d.animating = !viewer3d.animating;
      e.currentTarget.classList.toggle('btn-accent', viewer3d.animating);
    });

    // Módulo de Terreno: Agregar Plano, Brújula Digital y Aplicar Soporte
    $('btn-add-field-plane').addEventListener('click', () => {
      fieldPlanes.push({
        id: $('f-set').value || `J${fieldPlanes.length + 1}`,
        dip: numVal('f-dip', 55),
        dipDir: numVal('f-dipdir', 180),
        phi: numVal('f-phi', 35),
        c: numVal('f-c', 0.005)
      });
      $('f-set').value = `J${fieldPlanes.length + 1}`;
      renderFieldPlanesTable();
      updateCombinationTable();
    });

    $('btn-load-demo-field').addEventListener('click', () => {
      fieldPlanes = [
        { id: 'J1', dip: 47, dipDir: 203, c: 0.010, phi: 40 },
        { id: 'J2', dip: 52, dipDir: 287, c: 0.020, phi: 35 },
        { id: 'J3', dip: 68, dipDir: 195, c: 0.000, phi: 31 },
        { id: 'J4', dip: 54, dipDir: 262, c: 0.005, phi: 34 },
        { id: 'Falla-1', dip: 74, dipDir: 65, c: 0.015, phi: 32 },
        { id: 'Diaclasa-B', dip: 41, dipDir: 186, c: 0.005, phi: 40 }
      ];
      renderFieldPlanesTable();
      updateCombinationTable();
    });

    $('opt-target-fs').addEventListener('input', () => updateFieldSupportOptimizer());
    $('opt-bolt-type').addEventListener('change', () => updateFieldSupportOptimizer());

    $('btn-apply-opt-support').addEventListener('click', () => {
      if (!currentOptSupport || !currentOptSupport.valid || !currentOptSupport.needsSupport) return;
      const slopeAz = currentInput.slope ? currentInput.slope.dipDir : 180;
      $('bolt-enabled').checked = true;
      $('bolt-type').value = $('opt-bolt-type').value;
      $('bolt-model').value = 'passive';
      $('bolt-count').value = currentOptSupport.boltCount;
      $('bolt-trend').value = (slopeAz + 180) % 360;
      $('bolt-plunge').value = 15;
      $('bolt-eff').value = '0';
      $('bolt-shear').checked = false;
      switchWorkspace('3d');
      recalculateAll(false);
    });

    // Sensor de Brújula Móvil (DeviceOrientation API)
    $('btn-compass-sensor').addEventListener('click', () => {
      const pill = $('compass-live-pill');
      if (compassActive) {
        compassActive = false;
        pill.textContent = 'Sensor: Manual';
        return;
      }
      compassActive = true;
      pill.textContent = 'Sensor: Activo (Incline el equipo)';
      window.addEventListener('deviceorientation', (ev) => {
        if (!compassActive) return;
        if (ev.beta !== null && ev.alpha !== null) {
          const dip = Math.min(89, Math.max(1, Math.round(Math.hypot(ev.beta, ev.gamma || 0))));
          const dipDir = Math.round((360 - ev.alpha) % 360);
          $('f-dip').value = dip;
          $('f-dipdir').value = dipDir;
          pill.textContent = `Vivo: ${dip}° / ${dipDir}°`;
        }
      });
    });

    // Controles de Estereonet & Monte Carlo
    $('stereo-proj-select').addEventListener('change', () => refreshStereonetAndMC());
    $('btn-run-mc').addEventListener('click', () => refreshStereonetAndMC());
    ['mc-std-dip', 'mc-std-dipdir', 'mc-std-phi'].forEach((id) => {
      $(id).addEventListener('input', () => refreshStereonetAndMC());
    });

    // Suite de Verificación Literatura Analítica
    $('btn-run-verify').addEventListener('click', () => renderVerificationSuiteTable());

    // Exportar / Importar JSON y Reporte PDF
    $('btn-export-json').addEventListener('click', () => {
      const payload = {
        app: 'GeologgIA Cuña 3D',
        version: '1.0',
        timestamp: new Date().toISOString(),
        input: currentInput,
        fieldPlanes: fieldPlanes
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'proyecto_cuna_geologgia.json';
      a.click();
    });

    $('in-import-json').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.input) applyInputToDOM(data.input);
          if (Array.isArray(data.fieldPlanes)) {
            fieldPlanes = data.fieldPlanes;
            renderFieldPlanesTable();
          }
          recalculateAll(true);
        } catch (err) {
          console.error('Error al importar JSON:', err);
        }
      };
      reader.readAsText(file);
    });

    $('btn-print-report').addEventListener('click', () => generatePrintableReport());

    // Inicializar tablas y modelo por defecto (Priest Ejemplo 1 — FS = 1.4966)
    renderFieldPlanesTable();
    renderVerificationSuiteTable();
    recalculateAll(true);

    // Registrar Service Worker para funcionamiento PWA 100% Offline
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  });
})();
