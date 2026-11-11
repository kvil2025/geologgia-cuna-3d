/**
 * GeologgIA Cuña 3D — Motor Matemático Vectorial de Equilibrio Límite 3D
 * Basado en las formulaciones analíticas de Hoek & Bray (1981), Kovari & Fritz (1975),
 * Priest (1993) y el Manual de Verificación Oficial de Literatura Analítica Cuña 3D (Build 7.016).
 * 100% Client-Side · Sin dependencias externas.
 */
(function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180.0;
  const RAD2DEG = 180.0 / Math.PI;

  // --- Álgebra Vectorial 3D (Sistema ENU: X = Este, Y = Norte, Z = Arriba) ---
  function vec3(x, y, z) {
    return [x || 0, y || 0, z || 0];
  }
  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
  function scale(a, s) {
    return [a[0] * s, a[1] * s, a[2] * s];
  }
  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
  function norm(a) {
    return Math.sqrt(dot(a, a));
  }
  function normalize(a) {
    const L = norm(a);
    return L > 1e-12 ? [a[0] / L, a[1] / L, a[2] / L] : [0, 0, 0];
  }

  /**
   * Vector normal unitario apuntando hacia ARRIBA (z >= 0) a partir de Dip y Dip Direction (°)
   */
  function normalFromDipDipDir(dipDeg, dipDirDeg) {
    const d = dipDeg * DEG2RAD;
    const dd = dipDirDeg * DEG2RAD;
    return [
      Math.sin(d) * Math.sin(dd), // East (X)
      Math.sin(d) * Math.cos(dd), // North (Y)
      Math.cos(d)                 // Up (Z)
    ];
  }

  /**
   * Vector unitario en dirección de una línea definida por Plunge (inclinación hacia abajo) y Trend (azimut)
   */
  function vectorFromPlungeTrend(plungeDeg, trendDeg) {
    const p = plungeDeg * DEG2RAD;
    const t = trendDeg * DEG2RAD;
    return [
      Math.cos(p) * Math.sin(t),
      Math.cos(p) * Math.cos(t),
      -Math.sin(p)
    ];
  }

  /**
   * Obtiene Plunge (0..90° hacia abajo) y Trend (0..360° azimut) de un vector 3D
   */
  function plungeTrendFromVector(v) {
    let u = normalize(v);
    if (u[2] > 0) u = scale(u, -1); // apuntar hacia el hemisferio inferior
    const plunge = Math.asin(Math.max(-1, Math.min(1, -u[2]))) * RAD2DEG;
    let trend = Math.atan2(u[0], u[1]) * RAD2DEG;
    if (trend < 0) trend += 360.0;
    return { plunge, trend };
  }

  /**
   * Resistencia al corte por unidad de área (MPa) según Mohr-Coulomb o Barton-Bandis
   */
  function computeShearStrengthStress(sigmaN, joint) {
    if (sigmaN <= 0) return 0;
    const wav = (joint.waviness || 0);
    if (joint.model === 'barton-bandis') {
      const phiR = joint.phiR !== undefined ? joint.phiR : (joint.phi || 30);
      const jrc = joint.jrc !== undefined ? joint.jrc : 8;
      const jcs = Math.max(0.1, joint.jcs !== undefined ? joint.jcs : 50); // MPa
      const ratio = Math.max(1.001, jcs / Math.max(1e-5, sigmaN));
      const effPhi = Math.min(70.0, phiR + jrc * Math.log10(ratio) + wav);
      return sigmaN * Math.tan(effPhi * DEG2RAD);
    }
    // Por defecto Mohr-Coulomb
    const c = joint.c || 0;
    const phi = (joint.phi || 0) + wav;
    return c + sigmaN * Math.tan(phi * DEG2RAD);
  }

  /**
   * Catálogo oficial de pernos (Estándar Internacional de Pernos Geotécnicos)
   */
  const BOLT_CATALOG = {
    mechanically_anchored: {
      id: 'mechanically_anchored',
      name: 'Anclaje Mecánico (Mechanically Anchored)',
      tensileMN: 0.10,
      plateMN: 0.10,
      anchorMN: 0.10,
      shearMN: 0.01
    },
    grouted_dowel_100: {
      id: 'grouted_dowel_100',
      name: 'Perno Lechada 100% (Grouted Dowel 100%)',
      tensileMN: 0.24,
      plateMN: 0.10,
      bondMN: 0.34,
      EffectiveTensileMN: 0.24,
      shearMN: 0.02
    },
    grouted_dowel_8m: {
      id: 'grouted_dowel_8m',
      name: 'Perno Lechada 8m Bond (Grouted Dowel 8m)',
      tensileMN: 0.24,
      plateMN: 0.10,
      bondMN: 0.10,
      EffectiveTensileMN: 0.10,
      shearMN: 0.02
    },
    cable_bolt: {
      id: 'cable_bolt',
      name: 'Cable de Anclaje (Cable Bolt)',
      tensileMN: 0.20,
      plateMN: 0.10,
      bondMN: 0.34,
      EffectiveTensileMN: 0.20,
      shearMN: 0.02
    },
    split_set: {
      id: 'split_set',
      name: 'Estabilizador por Fricción (Split Set)',
      tensileMN: 0.10,
      plateMN: 0.05,
      bondMN: 0.03,
      EffectiveTensileMN: 0.10,
      shearMN: 0.01
    },
    swellex: {
      id: 'swellex',
      name: 'Perno Expandible (Swellex)',
      tensileMN: 0.10,
      plateMN: 0.05,
      bondMN: 0.12,
      EffectiveTensileMN: 0.10,
      shearMN: 0.01
    },
    simple_force: {
      id: 'simple_force',
      name: 'Fuerza de Perno Directa (Simple Bolt Force)',
      tensileMN: 0.10,
      plateMN: 0.10,
      bondMN: 0.10,
      EffectiveTensileMN: 0.10,
      shearMN: 0.01
    }
  };

  /**
   * Solucionador Analítico Principal 3D de Cuña 3D
   * @param {Object} input Parámetros del talud, discontinuidades, agua, sismo y soporte
   */
  function solveWedge(input) {
    const slope = input.slope || { dip: 65, dipDir: 180, height: 15, unitWeight: 0.026 };
    const upper = input.upperSlope || { dip: 0, dipDir: 180 };
    const j1 = input.joint1 || { dip: 45, dipDir: 140, c: 0.01, phi: 35, waviness: 0, model: 'mohr-coulomb' };
    const j2 = input.joint2 || { dip: 50, dipDir: 225, c: 0.015, phi: 38, waviness: 0, model: 'mohr-coulomb' };
    const water = input.water || { enabled: false, mode: 'custom_mean', u1: 0, u2: 0, percentFilled: 0, hu: 1.0, gammaW: 0.00981, pondedEnabled: false, pondedDepth: 0, slopeFaceType: 'impervious' };
    const seismic = input.seismic || { enabled: false, eta: 0, directionMode: 'horiz_sliding', trend: 180, plunge: 0 };
    const extForces = input.externalForces || [];
    const bolts = input.bolts || [];
    const shotcrete = input.shotcrete || { enabled: false, thicknessCm: 0, shearStrengthMPa: 0.5 };
    const tc = input.tensionCrack || { enabled: false, dip: 85, dipDir: 180, traceRatio: 0.65 };

    const H = Math.max(0.1, Number(slope.height) || 10.0);
    const gamma = Math.max(0.001, Number(slope.unitWeight) || 0.026); // MN/m3

    const n1 = normalFromDipDipDir(j1.dip, j1.dipDir);
    const n2 = normalFromDipDipDir(j2.dip, j2.dipDir);
    const nu = normalFromDipDipDir(upper.dip, upper.dipDir);
    const nf = normalFromDipDipDir(slope.dip, slope.dipDir);

    // Rayos de las aristas desde el ápice inferior V0 = (0,0,0) hacia arriba (z > 0)
    let r1 = cross(n1, nf);
    if (r1[2] < 0) r1 = scale(r1, -1);
    let r2 = cross(n2, nf);
    if (r2[2] < 0) r2 = scale(r2, -1);
    let r3 = cross(n1, n2);
    if (r3[2] < 0) r3 = scale(r3, -1);

    const r3Norm = norm(r3);
    if (r3Norm < 1e-8) {
      return { valid: false, reason: 'Los planos de la Junta 1 y Junta 2 son paralelos (no se intersectan).' };
    }

    const r3UnitUp = scale(r3, 1.0 / r3Norm);
    const s12 = scale(r3UnitUp, -1.0); // Vector unitario de deslizamiento apuntando hacia abajo por la línea de intersección
    const intInfo = plungeTrendFromVector(s12);

    // Validación cinemática: ¿La línea de intersección aflora (daylights) en la cara del talud y sobre la superficie superior?
    // Para que aflore en la cara del talud, al avanzar desde V0 hacia arriba por r3UnitUp, debe entrar hacia el macizo respecto de nf,
    // es decir dot(nf, r3UnitUp) < 0 (la pendiente de la cara es más empinada que la línea de intersección en esa dirección).
    const dotSlopeInt = dot(nf, r3UnitUp);
    const dotUpperR1 = dot(nu, r1);
    const dotUpperR2 = dot(nu, r2);
    const dotUpperR3 = dot(nu, r3);

    if (dotSlopeInt >= -1e-6 || dotUpperR1 <= 1e-6 || dotUpperR2 <= 1e-6 || dotUpperR3 <= 1e-6) {
      return {
        valid: false,
        reason: 'No se forma una cuña cinemáticamente extraíble (la línea de intersección no aflora en la cara del talud o buza hacia adentro del macizo).',
        plunge: intInfo.plunge,
        trend: intInfo.trend
      };
    }

    // Vértices unitarios intersectando el plano del talud superior (nu . x = 1)
    const V1_u = scale(r1, 1.0 / dotUpperR1);
    const V2_u = scale(r2, 1.0 / dotUpperR2);
    const V3_u = scale(r3, 1.0 / dotUpperR3);

    if (V1_u[2] <= 1e-6 || V2_u[2] <= 1e-6 || V3_u[2] <= 1e-6) {
      return {
        valid: false,
        reason: 'Geometría de trazas inválida respecto al talud superior.',
        plunge: intInfo.plunge,
        trend: intInfo.trend
      };
    }

    // Escalamiento exacto de Cuña 3D: V1_z = H (o escalamiento por volumen objetivo si se especifica)
    let geomScale = H / V1_u[2];
    const volUnit = Math.abs(dot(V1_u, cross(V2_u, V3_u))) / 6.0;
    if (slope.targetVolume && slope.targetVolume > 0) {
      geomScale = Math.cbrt(slope.targetVolume / volUnit);
    }

    const V0 = [0, 0, 0];
    const V1 = scale(V1_u, geomScale);
    const V2 = scale(V2_u, geomScale);
    const V3 = scale(V3_u, geomScale);

    // Factor de truncamiento si hay grieta de tracción (Tension Crack)
    let tcFactor = 1.0;
    let A_tc = 0.0;
    if (tc && tc.enabled) {
      const ratio = Math.max(0.15, Math.min(0.95, Number(tc.traceRatio) || 0.7));
      // La parte posterior del tetraedro de fracción (1 - ratio) es removida por la grieta de tracción
      tcFactor = 1.0 - Math.pow(1.0 - ratio, 3);
      const areaSlice = 0.5 * norm(cross(V1, V2)) * Math.pow(1.0 - ratio, 2);
      A_tc = areaSlice;
    }

    const areaScale = Math.cbrt(tcFactor * tcFactor);
    const volume = (Math.abs(dot(V1, cross(V2, V3))) / 6.0) * tcFactor;
    const weightMN = volume * gamma;

    const A1 = 0.5 * norm(cross(V1, V3)) * areaScale;
    const A2 = 0.5 * norm(cross(V2, V3)) * areaScale;
    const Af = 0.5 * norm(cross(V1, V2));
    const Au = 0.5 * norm(cross(sub(V2, V1), sub(V3, V1))) * areaScale;

    const traceLengthJ1Slope = norm(V1);
    const traceLengthJ2Slope = norm(V2);
    const traceLengthJ1Upper = norm(sub(V3, V1)) * Math.sqrt(areaScale);
    const traceLengthJ2Upper = norm(sub(V3, V2)) * Math.sqrt(areaScale);
    const intLength = norm(V3) * Math.sqrt(areaScale);

    // Ángulo diedro de la cuña y ángulo medio omega (Kovari & Fritz)
    const cosAlpha = dot(n1, n2) / (norm(n1) * norm(n2));
    const alphaDeg = Math.acos(Math.max(-1, Math.min(1, Math.abs(cosAlpha)))) * RAD2DEG;
    const halfWedgeOmegaDeg = (180.0 - alphaDeg) / 2.0;
    const wedgeFactorKovari = 1.0 / Math.sin(halfWedgeOmegaDeg * DEG2RAD);

    // Normales hacia ADENTRO del bloque de cuña (dirección de la reacción normal roca -> cuña)
    const centroid = scale(add(add(V1, V2), V3), 0.25);
    const inN1 = dot(n1, centroid) >= 0 ? n1 : scale(n1, -1);
    const inN2 = dot(n2, centroid) >= 0 ? n2 : scale(n2, -1);
    const inNf = dot(nf, centroid) >= 0 ? nf : scale(nf, -1);
    const inNu = dot(nu, centroid) >= 0 ? nu : scale(nu, -1);

    // --- 1. Fuerza de Gravedad ---
    let R_active = [0, 0, -weightMN];

    // --- 2. Fuerza Sísmica Pseudoestática ---
    let F_seismic = [0, 0, 0];
    let seismicMagMN = 0;
    if (seismic && seismic.enabled && Number(seismic.eta) > 0) {
      const eta = Number(seismic.eta);
      seismicMagMN = eta * weightMN;
      let sDir;
      if (seismic.directionMode === 'custom') {
        sDir = vectorFromPlungeTrend(Number(seismic.plunge) || 0, Number(seismic.trend) || intInfo.trend);
      } else {
        // Horizontal en el azimut de deslizamiento (estándar Cuña 3D)
        sDir = normalize([s12[0], s12[1], 0]);
      }
      F_seismic = scale(sDir, seismicMagMN);
      R_active = add(R_active, F_seismic);
    }

    // --- 3. Fuerzas Externas Puntuales ---
    let F_ext_total = [0, 0, 0];
    if (Array.isArray(extForces)) {
      for (let i = 0; i < extForces.length; i++) {
        const ef = extForces[i];
        const mag = Number(ef.magnitudeMN !== undefined ? ef.magnitudeMN : ef.mag) || 0;
        if (mag > 0) {
          const dir = vectorFromPlungeTrend(Number(ef.plunge) || 0, Number(ef.trend) || 0);
          F_ext_total = add(F_ext_total, scale(dir, mag));
        }
      }
      R_active = add(R_active, F_ext_total);
    }

    // --- 4. Agua Empalsada en el Pie / Talud (Ponded Water Pressure) ---
    let F_ponded = [0, 0, 0];
    let U_ponded_slope = 0;
    let U_ponded_upper = 0;
    const gammaW = Number(water.gammaW) || 0.00981;
    const pondedDepth = (water && water.pondedEnabled) ? Math.max(0, Number(water.pondedDepth) || 0) : 0;

    if (pondedDepth > 0) {
      // Presión en los 3 vértices de la cara del talud (V0, V1, V2)
      const p0 = Math.max(0, gammaW * (pondedDepth - V0[2]));
      const p1 = Math.max(0, gammaW * (pondedDepth - V1[2]));
      const p2 = Math.max(0, gammaW * (pondedDepth - V2[2]));
      // Si el nivel de agua supera toda la altura de la cara o es parcial:
      const subRatioSlope = pondedDepth >= V1[2] ? 1.0 : Math.pow(pondedDepth / Math.max(0.01, V1[2]), 2);
      const pAvgSlope = pondedDepth >= V1[2]
        ? (p0 + p1 + p2) / 3.0
        : (p0 / 3.0) * subRatioSlope;
      U_ponded_slope = pAvgSlope * Af;
      F_ponded = add(F_ponded, scale(inNf, U_ponded_slope));

      // Si el agua empalsada sobrepasa la cresta (pondedDepth > V1[2]), actúa también sobre la cara superior
      if (pondedDepth > V1[2]) {
        const p3 = Math.max(0, gammaW * (pondedDepth - V3[2]));
        const subRatioUpper = pondedDepth >= V3[2]
          ? 1.0
          : Math.pow((pondedDepth - V1[2]) / Math.max(0.01, V3[2] - V1[2]), 2);
        const pAvgUpper = pondedDepth >= V3[2]
          ? (p1 + p2 + p3) / 3.0
          : ((p1 + p2) / 6.0) * subRatioUpper;
        U_ponded_upper = pAvgUpper * Au;
        F_ponded = add(F_ponded, scale(inNu, U_ponded_upper));
      }
      R_active = add(R_active, F_ponded);
    }

    // --- 5. Subpresión de Agua en las Discontinuidades (Joint Water Pressure U1, U2) ---
    let u1MeanMPa = 0;
    let u2MeanMPa = 0;

    if (water && water.enabled) {
      if (water.mode === 'custom_mean') {
        u1MeanMPa = Math.max(0, Number(water.u1) || 0);
        u2MeanMPa = Math.max(0, Number(water.u2) || 0);
      } else {
        // Modelo de Porcentaje de Llenado (% Filled) con continuidad Pervious / Impervious
        const pct = Math.max(0, Math.min(100, Number(water.percentFilled) || 0)) / 100.0;
        const hu = Math.max(0, Math.min(1, Number(water.hu !== undefined ? water.hu : 1.0)));
        if (pct > 0) {
          const zCrestAvg = 0.5 * (V1[2] + V2[2]);
          const zApexTop = V3[2];
          if (water.slopeFaceType === 'pervious' && pondedDepth > 0) {
            // Distribución tetraédrica acoplada con el nivel freático y el nivel empalsado (Sección 3.2 y 3.3 del Manual)
            const zWaterPeak = pct * zApexTop;
            const pCrest = Math.max(0, gammaW * (Math.min(zWaterPeak, zCrestAvg) * 0.5 + Math.max(0, pondedDepth - 0.35 * zCrestAvg)));
            const pBase = Math.max(0, gammaW * pondedDepth);
            const pTop = Math.max(0, gammaW * Math.max(0, pondedDepth - zApexTop));
            const pMeanPervious = hu * ((pBase + 2.0 * pCrest + pTop) / 6.0);
            u1MeanMPa = pMeanPervious;
            u2MeanMPa = pMeanPervious;
          } else {
            // Modelo piramidal clásico Cuña 3D (Peak Pressure Beneath Crest): P_max = hu * gammaW * (zApexTop - zCrestAvg o H/2), u_mean = P_max / 3 * pct^3 / pct^2
            const hWaterEff = zCrestAvg * pct;
            const pMean = hu * (gammaW * hWaterEff / 4.0) * Math.pow(pct, 1.5);
            u1MeanMPa = pMean;
            u2MeanMPa = pMean;
          }
        }
      }
    }

    const U1 = u1MeanMPa * A1;
    const U2 = u2MeanMPa * A2;

    // --- 6. Soporte por Pernos de Anclaje (Activos y Pasivos) ---
    let F_bolts_active = [0, 0, 0];
    let F_bolts_passive = [0, 0, 0];
    let boltShearResistMN = 0;

    if (Array.isArray(bolts)) {
      for (let i = 0; i < bolts.length; i++) {
        const b = bolts[i];
        if (b.enabled === false) continue;
        const catalogItem = BOLT_CATALOG[b.type] || BOLT_CATALOG.mechanically_anchored;
        const count = Math.max(1, Number(b.count) || 1);
        const bDir = vectorFromPlungeTrend(Number(b.plunge) || 0, Number(b.trend) || 0);

        if (b.useShear) {
          // Modo de resistencia al corte puro del perno (Formulación Analítica de Corte en Anclajes)
          const sCap = (b.shearMN !== undefined ? Number(b.shearMN) : catalogItem.shearMN) * count;
          boltShearResistMN += sCap;
        } else {
          let tCap = (b.tensileMN !== undefined ? Number(b.tensileMN) : (catalogItem.EffectiveTensileMN || catalogItem.tensileMN)) * count;
          if (b.useOrientationEfficiency) {
            // Método Cosine Tension/Shear de Cuña 3D
            const cosTheta = Math.max(0, -dot(bDir, s12));
            tCap *= cosTheta;
          }
          const fVec = scale(bDir, tCap);
          if (b.model === 'active') {
            F_bolts_active = add(F_bolts_active, fVec);
          } else {
            F_bolts_passive = add(F_bolts_passive, fVec);
          }
        }
      }
    }

    // --- 7. Soporte por Shotcrete en la cara del talud ---
    let shotcreteResistMN = 0;
    if (shotcrete && shotcrete.enabled && Number(shotcrete.thicknessCm) > 0) {
      const tMeters = Number(shotcrete.thicknessCm) / 100.0;
      const perimeterFace = traceLengthJ1Slope + traceLengthJ2Slope;
      const tauSc = Number(shotcrete.shearStrengthMPa) || 0.5;
      shotcreteResistMN = perimeterFace * tMeters * tauSc;
    }

    // --- 8. Equilibrio de Fuerzas Normales Efectivas y Detección de Modo de Falla ---
    // R_eff incluye las fuerzas activas + empuje de agua en las juntas (U1*inN1 + U2*inN2) + pernos activos
    const R_base = add(add(R_active, scale(inN1, U1)), scale(inN2, U2));
    const R_with_bolts = add(add(R_base, F_bolts_active), F_bolts_passive);

    // Resolvemos sistema 2x2 para las reacciones normales efectivas N1_eff y N2_eff en deslizamiento por ambos planos:
    // N1_eff + N2_eff * (inN1 . inN2) = - (R_with_bolts . inN1)
    // N1_eff * (inN1 . inN2) + N2_eff = - (R_with_bolts . inN2)
    const dot12 = dot(inN1, inN2);
    const det = 1.0 - dot12 * dot12;
    const rhs1 = -dot(R_with_bolts, inN1);
    const rhs2 = -dot(R_with_bolts, inN2);

    let N1_eff = (rhs1 - dot12 * rhs2) / det;
    let N2_eff = (rhs2 - dot12 * rhs1) / det;

    let mode = 'Sliding on Joints 1&2';
    let modeEs = 'Deslizamiento por Juntas 1 y 2';
    let slidingDir = s12;
    let drivingForceMN = 0;
    let resistingForceMN = 0;
    let tau1MPa = 0;
    let tau2MPa = 0;
    let sigma1MPa = 0;
    let sigma2MPa = 0;

    if (N1_eff >= 0 && N2_eff >= 0) {
      // Deslizamiento por ambos planos a lo largo de la línea de intersección s12
      sigma1MPa = A1 > 1e-6 ? N1_eff / A1 : 0;
      sigma2MPa = A2 > 1e-6 ? N2_eff / A2 : 0;
      tau1MPa = computeShearStrengthStress(sigma1MPa, j1);
      tau2MPa = computeShearStrengthStress(sigma2MPa, j2);

      const R_for_drive = add(R_base, F_bolts_active);
      drivingForceMN = Math.max(0, dot(R_for_drive, s12));
      const passiveTangential = Math.max(0, -dot(F_bolts_passive, s12));
      resistingForceMN = tau1MPa * A1 + tau2MPa * A2 + passiveTangential + boltShearResistMN + shotcreteResistMN;
    } else if (N1_eff < 0 && N2_eff < 0) {
      // Pérdida de contacto en ambos planos (Caída libre / Levantamiento hidráulico)
      mode = 'Contact Lost on Both Joints (Falling / Liftoff)';
      modeEs = 'Pérdida de Contacto en Ambas Juntas (Caída Libre)';
      N1_eff = 0;
      N2_eff = 0;
      drivingForceMN = norm(R_base);
      resistingForceMN = boltShearResistMN + shotcreteResistMN;
    } else if (N1_eff < 0) {
      // Se pierde contacto en la Junta 1 -> Deslizamiento únicamente sobre la Junta 2 (Ej: Priest Verification Problem #7)
      mode = 'Sliding on Joint 2';
      modeEs = 'Deslizamiento por Junta 2 (Junta 1 se abre)';
      N1_eff = 0;
      N2_eff = Math.max(0, -dot(R_with_bolts, inN2));
      sigma1MPa = 0;
      sigma2MPa = A2 > 1e-6 ? N2_eff / A2 : 0;
      tau1MPa = 0;
      tau2MPa = computeShearStrengthStress(sigma2MPa, j2);

      const R_for_drive = add(R_base, F_bolts_active);
      const n2Comp = -dot(R_for_drive, inN2);
      const slipVec2 = add(R_for_drive, scale(inN2, n2Comp));
      drivingForceMN = norm(slipVec2);
      slidingDir = drivingForceMN > 1e-8 ? scale(slipVec2, 1.0 / drivingForceMN) : s12;
      const passiveTangential = Math.max(0, -dot(F_bolts_passive, slidingDir));
      resistingForceMN = tau2MPa * A2 + passiveTangential + boltShearResistMN + shotcreteResistMN;
    } else {
      // Se pierde contacto en la Junta 2 -> Deslizamiento únicamente sobre la Junta 1
      mode = 'Sliding on Joint 1';
      modeEs = 'Deslizamiento por Junta 1 (Junta 2 se abre)';
      N2_eff = 0;
      N1_eff = Math.max(0, -dot(R_with_bolts, inN1));
      sigma2MPa = 0;
      sigma1MPa = A1 > 1e-6 ? N1_eff / A1 : 0;
      tau2MPa = 0;
      tau1MPa = computeShearStrengthStress(sigma1MPa, j1);

      const R_for_drive = add(R_base, F_bolts_active);
      const n1Comp = -dot(R_for_drive, inN1);
      const slipVec1 = add(R_for_drive, scale(inN1, n1Comp));
      drivingForceMN = norm(slipVec1);
      slidingDir = drivingForceMN > 1e-8 ? scale(slipVec1, 1.0 / drivingForceMN) : s12;
      const passiveTangential = Math.max(0, -dot(F_bolts_passive, slidingDir));
      resistingForceMN = tau1MPa * A1 + passiveTangential + boltShearResistMN + shotcreteResistMN;
    }

    const FS = drivingForceMN > 1e-9 ? resistingForceMN / drivingForceMN : 99.99;
    const slipInfo = plungeTrendFromVector(slidingDir);

    return {
      valid: true,
      FS: FS,
      volume: volume,
      weightMN: weightMN,
      weightTons: weightMN * 101.9716,
      A1: A1,
      A2: A2,
      Af: Af,
      Au: Au,
      A_tc: A_tc,
      N1: N1_eff,
      N2: N2_eff,
      sigma1MPa: sigma1MPa,
      sigma2MPa: sigma2MPa,
      tau1MPa: tau1MPa,
      tau2MPa: tau2MPa,
      U1: U1,
      U2: U2,
      u1MeanMPa: u1MeanMPa,
      u2MeanMPa: u2MeanMPa,
      U_ponded_slope: U_ponded_slope,
      U_ponded_upper: U_ponded_upper,
      seismicMagMN: seismicMagMN,
      drivingForceMN: drivingForceMN,
      resistingForceMN: resistingForceMN,
      mode: mode,
      modeEs: modeEs,
      plunge: intInfo.plunge,
      trend: intInfo.trend,
      slidingPlunge: slipInfo.plunge,
      slidingTrend: slipInfo.trend,
      halfWedgeOmegaDeg: halfWedgeOmegaDeg,
      wedgeAngle2OmegaDeg: halfWedgeOmegaDeg * 2.0,
      wedgeFactorKovari: wedgeFactorKovari,
      traces: {
        j1Slope: traceLengthJ1Slope,
        j2Slope: traceLengthJ2Slope,
        j1Upper: traceLengthJ1Upper,
        j2Upper: traceLengthJ2Upper,
        intersection: intLength
      },
      vertices: {
        V0: V0,
        V1: V1,
        V2: V2,
        V3: V3,
        centroid: centroid
      },
      vectors: {
        n1: n1,
        n2: n2,
        nf: nf,
        nu: nu,
        inN1: inN1,
        inN2: inN2,
        inNf: inNf,
        s12: s12,
        slidingDir: slidingDir
      }
    };
  }

  /**
   * Optimizador de Soporte para Terreno (Calcula pernos, tonelaje y malla requeridos para FS objetivo)
   */
  function optimizeFieldSupport(input, targetFS, boltSpec) {
    const baseRes = solveWedge(Object.assign({}, input, { bolts: [], shotcrete: { enabled: false } }));
    if (!baseRes.valid) return { valid: false, reason: baseRes.reason };

    const fs0 = baseRes.FS;
    const goalFS = Math.max(1.05, Number(targetFS) || 1.5);
    if (fs0 >= goalFS) {
      return {
        valid: true,
        needsSupport: false,
        initialFS: fs0,
        targetFS: goalFS,
        requiredForceMN: 0,
        requiredForceTons: 0,
        boltCount: 0,
        recommendedSpacingM: 0,
        equivalentShotcreteCm: 0
      };
    }

    const spec = boltSpec || {
      type: 'grouted_dowel_100',
      model: 'passive',
      trend: (input.slope ? (input.slope.dipDir + 180) % 360 : 0),
      plunge: 15
    };
    const cat = BOLT_CATALOG[spec.type] || BOLT_CATALOG.grouted_dowel_100;
    const singleBoltCapMN = cat.EffectiveTensileMN || cat.tensileMN;
    const bDir = vectorFromPlungeTrend(Number(spec.plunge) || 0, Number(spec.trend) || 0);

    // Ganancia de fuerza resistente por cada 1 MN de fuerza de perno
    const sDir = baseRes.vectors.slidingDir;
    const inN1 = baseRes.vectors.inN1;
    const inN2 = baseRes.vectors.inN2;
    const dot12 = dot(inN1, inN2);
    const det = 1.0 - dot12 * dot12;
    const rhs1 = -dot(bDir, inN1);
    const rhs2 = -dot(bDir, inN2);
    const dN1 = Math.max(0, (rhs1 - dot12 * rhs2) / det);
    const dN2 = Math.max(0, (rhs2 - dot12 * rhs1) / det);

    const tanPhi1 = Math.tan(((input.joint1.phi || 35) + (input.joint1.waviness || 0)) * DEG2RAD);
    const tanPhi2 = Math.tan(((input.joint2.phi || 35) + (input.joint2.waviness || 0)) * DEG2RAD);
    const tangGain = Math.max(0, -dot(bDir, sDir));
    const normalGain = dN1 * tanPhi1 + dN2 * tanPhi2;

    const effGainPerMN = Math.max(0.25, tangGain + normalGain);
    const deficitResistMN = Math.max(0, goalFS * baseRes.drivingForceMN - baseRes.resistingForceMN);
    const reqForceMN = deficitResistMN / effGainPerMN;
    const boltCount = Math.ceil(reqForceMN / singleBoltCapMN);
    const spacingM = boltCount > 0 ? Math.sqrt(Math.max(1.0, baseRes.Af) / boltCount) : 0;

    // Espesor equivalente de shotcrete (tau = 0.5 MPa)
    const perim = baseRes.traces.j1Slope + baseRes.traces.j2Slope;
    const eqShotcreteCm = perim > 0.1 ? (deficitResistMN / (perim * 0.5)) * 100.0 : 0;

    return {
      valid: true,
      needsSupport: true,
      initialFS: fs0,
      targetFS: goalFS,
      deficitResistMN: deficitResistMN,
      requiredForceMN: reqForceMN,
      requiredForceTons: reqForceMN * 101.9716,
      singleBoltCapMN: singleBoltCapMN,
      boltTypeName: cat.name,
      boltCount: boltCount,
      recommendedSpacingM: Math.max(0.8, Math.min(3.5, spacingM)),
      equivalentShotcreteCm: Math.ceil(eqShotcreteCm)
    };
  }

  /**
   * Analizador Automático de Combinaciones para Mapeo Estructural de Terreno
   * Evalúa los N(N-1)/2 pares de familias/discontinuidades mapeadas en un talud.
   */
  function runCombinationAnalysis(planes, baseInput) {
    const results = [];
    if (!Array.isArray(planes) || planes.length < 2) return results;

    for (let i = 0; i < planes.length; i++) {
      for (let j = i + 1; j < planes.length; j++) {
        const p1 = planes[i];
        const p2 = planes[j];
        const simInput = Object.assign({}, baseInput, {
          joint1: {
            dip: Number(p1.dip),
            dipDir: Number(p1.dipDir),
            c: Number(p1.c || 0),
            phi: Number(p1.phi || 35),
            waviness: Number(p1.waviness || 0),
            model: p1.model || 'mohr-coulomb',
            jrc: Number(p1.jrc || 8),
            jcs: Number(p1.jcs || 50)
          },
          joint2: {
            dip: Number(p2.dip),
            dipDir: Number(p2.dipDir),
            c: Number(p2.c || 0),
            phi: Number(p2.phi || 35),
            waviness: Number(p2.waviness || 0),
            model: p2.model || 'mohr-coulomb',
            jrc: Number(p2.jrc || 8),
            jcs: Number(p2.jcs || 50)
          }
        });
        const res = solveWedge(simInput);
        results.push({
          pairId: `${p1.id || (i + 1)} × ${p2.id || (j + 1)}`,
          p1: p1,
          p2: p2,
          valid: res.valid,
          FS: res.valid ? res.FS : null,
          volume: res.valid ? res.volume : 0,
          weightTons: res.valid ? res.weightTons : 0,
          plunge: res.plunge || 0,
          trend: res.trend || 0,
          modeEs: res.valid ? res.modeEs : 'Cinemáticamente Estable (No aflora)',
          result: res
        });
      }
    }

    results.sort((a, b) => {
      if (a.valid && !b.valid) return -1;
      if (!a.valid && b.valid) return 1;
      if (!a.valid && !b.valid) return 0;
      return a.FS - b.FS;
    });

    return results;
  }

  /**
   * Simulación Probabilística de Monte Carlo (Confiabilidad Geotécnica y Pf)
   */
  function runMonteCarlo(baseInput, options) {
    const opts = options || {};
    const iterations = Math.max(100, Math.min(10000, Number(opts.iterations) || 2000));
    const stdDip = Number(opts.stdDip !== undefined ? opts.stdDip : 3.0);
    const stdDipDir = Number(opts.stdDipDir !== undefined ? opts.stdDipDir : 5.0);
    const stdPhi = Number(opts.stdPhi !== undefined ? opts.stdPhi : 2.5);
    const stdCohesionRatio = Number(opts.stdCohesionRatio !== undefined ? opts.stdCohesionRatio : 0.15);

    // Generador Box-Muller determinístico con semilla para reproducibilidad
    let seed = 133742;
    function randUniform() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return (seed + 0.5) / 4294967296.0;
    }
    function randNormal() {
      const u1 = randUniform();
      const u2 = randUniform();
      return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }

    const fsValues = [];
    let failedCount = 0;
    let validWedges = 0;

    for (let i = 0; i < iterations; i++) {
      const simInput = JSON.parse(JSON.stringify(baseInput));
      simInput.joint1.dip = Math.max(5, Math.min(89, simInput.joint1.dip + randNormal() * stdDip));
      simInput.joint1.dipDir = (simInput.joint1.dipDir + randNormal() * stdDipDir + 360) % 360;
      simInput.joint1.phi = Math.max(10, Math.min(65, simInput.joint1.phi + randNormal() * stdPhi));
      simInput.joint1.c = Math.max(0, (simInput.joint1.c || 0) * (1.0 + randNormal() * stdCohesionRatio));

      simInput.joint2.dip = Math.max(5, Math.min(89, simInput.joint2.dip + randNormal() * stdDip));
      simInput.joint2.dipDir = (simInput.joint2.dipDir + randNormal() * stdDipDir + 360) % 360;
      simInput.joint2.phi = Math.max(10, Math.min(65, simInput.joint2.phi + randNormal() * stdPhi));
      simInput.joint2.c = Math.max(0, (simInput.joint2.c || 0) * (1.0 + randNormal() * stdCohesionRatio));

      const r = solveWedge(simInput);
      if (r.valid && isFinite(r.FS) && r.FS < 25) {
        validWedges++;
        fsValues.push(r.FS);
        if (r.FS < 1.0) failedCount++;
      }
    }

    if (fsValues.length === 0) {
      return { valid: false, iterations, validWedges: 0 };
    }

    fsValues.sort((a, b) => a - b);
    const n = fsValues.length;
    const mean = fsValues.reduce((s, v) => s + v, 0) / n;
    const variance = fsValues.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, n - 1);
    const stdDev = Math.sqrt(variance);
    const beta = stdDev > 1e-6 ? (mean - 1.0) / stdDev : 9.99;
    const pfPercent = (failedCount / n) * 100.0;

    // Construir 24 bins para el histograma
    const minFS = fsValues[0];
    const maxFS = Math.min(Math.max(fsValues[n - 1], 1.5), mean + 3.5 * stdDev);
    const numBins = 24;
    const binWidth = Math.max(0.02, (maxFS - minFS) / numBins);
    const bins = [];
    for (let b = 0; b < numBins; b++) {
      bins.push({
        x0: minFS + b * binWidth,
        x1: minFS + (b + 1) * binWidth,
        count: 0
      });
    }
    for (let k = 0; k < n; k++) {
      const idx = Math.min(numBins - 1, Math.max(0, Math.floor((fsValues[k] - minFS) / binWidth)));
      bins[idx].count++;
    }

    return {
      valid: true,
      iterations: iterations,
      validWedges: validWedges,
      failedCount: failedCount,
      pfPercent: pfPercent,
      reliabilityIndexBeta: beta,
      meanFS: mean,
      stdDevFS: stdDev,
      minFS: fsValues[0],
      p5FS: fsValues[Math.floor(n * 0.05)],
      medianFS: fsValues[Math.floor(n * 0.50)],
      p95FS: fsValues[Math.floor(n * 0.95)],
      maxFS: fsValues[n - 1],
      bins: bins
    };
  }

  /**
   * Suite Oficial de Verificación (Literatura Analítica Cuña 3D Verification Manual — Build 7.016)
   */
  const VERIFICATION_SUITE = [
    {
      id: 'VP-1.1',
      code: 'Prob #1 (Kovari & Fritz T35)',
      title: 'Cuña Simétrica Estática Seca (Kovari & Fritz, 1975 / Kumsar et al.)',
      refManualPage: 'Pág. 8 (Fig. 1.1.5)',
      expectedFS: 1.0061,
      expectedPlunge: 37.85,
      tolerance: 0.001,
      input: {
        slope: { dip: 70, dipDir: 180, height: 6.134, unitWeight: 0.026 },
        upperSlope: { dip: 0, dipDir: 180 },
        joint1: { dip: 45, dipDir: 141, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 45, dipDir: 219, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false },
        seismic: { enabled: false }
      }
    },
    {
      id: 'VP-1.2A',
      code: 'Prob #2A (Estático T30)',
      title: 'Evaluación Estática Pre-Sísmica Serie T30 (Kumsar et al., 2000)',
      refManualPage: 'Pág. 13 (Tabla 1.2.1)',
      expectedFS: 1.6325,
      expectedPlunge: 30.02,
      tolerance: 0.001,
      input: {
        slope: { dip: 70, dipDir: 180, height: 10, unitWeight: 0.026 },
        upperSlope: { dip: 0, dipDir: 180 },
        joint1: { dip: 50, dipDir: 119, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 50, dipDir: 241, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false },
        seismic: { enabled: false }
      }
    },
    {
      id: 'VP-1.2B',
      code: 'Prob #2B (Sísmico DSA η=0.2365)',
      title: 'Estabilidad Dinámica Pseudoestática Serie T30 (η = 0.2365)',
      refManualPage: 'Pág. 15 (Fig. 1.2.5)',
      expectedFS: 1.0001,
      expectedPlunge: 30.02,
      tolerance: 0.001,
      input: {
        slope: { dip: 70, dipDir: 180, height: 10, unitWeight: 0.026 },
        upperSlope: { dip: 0, dipDir: 180 },
        joint1: { dip: 50, dipDir: 119, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 50, dipDir: 241, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false },
        seismic: { enabled: true, eta: 0.2365, directionMode: 'horiz_sliding' }
      }
    },
    {
      id: 'VP-1.3',
      code: 'Prob #3 (Castillo de Ankara)',
      title: 'Falla de Cuña Asimétrica en Castillo de Ankara (Bent Deresi)',
      refManualPage: 'Pág. 19 (Tabla 1.3.3)',
      expectedFS: 0.7123,
      expectedPlunge: 42.26,
      tolerance: 0.001,
      input: {
        slope: { dip: 70, dipDir: 160, height: 10, unitWeight: 0.026 },
        upperSlope: { dip: 0, dipDir: 180 },
        joint1: { dip: 45, dipDir: 195, c: 0, phi: 30, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 70, dipDir: 105, c: 0, phi: 30, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false },
        seismic: { enabled: false }
      }
    },
    {
      id: 'VP-1.4A',
      code: 'Prob #4A (Dinar Estático)',
      title: 'Talud Dinar Turquía — Condición Estática (φ = 40.8°)',
      refManualPage: 'Pág. 22 (Tabla 1.4.4)',
      expectedFS: 2.0203,
      expectedPlunge: 47.06,
      tolerance: 0.001,
      input: {
        slope: { dip: 75, dipDir: 337.5, height: 32, unitWeight: 0.026 },
        upperSlope: { dip: 0, dipDir: 180 },
        joint1: { dip: 75, dipDir: 33.5, c: 0, phi: 40.8, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 75, dipDir: 248, c: 0, phi: 40.8, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false },
        seismic: { enabled: false }
      }
    },
    {
      id: 'VP-1.4B',
      code: 'Prob #4B (Dinar Sísmico η=0.3303)',
      title: 'Talud Dinar Turquía — Sismo E-W 324 cm/s² (η = 0.3303)',
      refManualPage: 'Pág. 22 (Tabla 1.4.4)',
      expectedFS: 0.9872,
      expectedPlunge: 47.06,
      tolerance: 0.001,
      input: {
        slope: { dip: 75, dipDir: 337.5, height: 32, unitWeight: 0.026 },
        upperSlope: { dip: 0, dipDir: 180 },
        joint1: { dip: 75, dipDir: 33.5, c: 0, phi: 40.8, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 75, dipDir: 248, c: 0, phi: 40.8, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false },
        seismic: { enabled: true, eta: 0.3303, directionMode: 'horiz_sliding' }
      }
    },
    {
      id: 'VP-1.6',
      code: 'Prob #6 (Priest Ej. 1 Completo)',
      title: 'Priest (1993) Ej. 1: Doble Plano + Cohesión + Agua + Fundación Pilono (180 kN)',
      refManualPage: 'Pág. 37 (Sección 1.6.4)',
      expectedFS: 1.4966,
      expectedVolume: 45.201,
      tolerance: 0.001,
      input: {
        slope: { dip: 60, dipDir: 230, height: 6.7978, unitWeight: 0.026 },
        upperSlope: { dip: 5, dipDir: 225 },
        joint1: { dip: 47, dipDir: 203, c: 0.01, phi: 40, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 52, dipDir: 287, c: 0.02, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: true, mode: 'custom_mean', u1: 0.005, u2: 0.015 },
        seismic: { enabled: false },
        externalForces: [{ name: 'Fundación Pilono', magnitudeMN: 0.180, trend: 168, plunge: 70 }]
      }
    },
    {
      id: 'VP-1.7',
      code: 'Prob #7 (Priest Ej. 2 Plano Único)',
      title: 'Priest (1993) Ej. 2: Pérdida de Contacto en Junta 1 por Subpresión (Desliza en J2)',
      refManualPage: 'Pág. 41 (Sección 1.7.4)',
      expectedFS: 0.8493,
      expectedVolume: 81.741,
      tolerance: 0.001,
      input: {
        slope: { dip: 65, dipDir: 134, height: 6.8471, unitWeight: 0.025 },
        upperSlope: { dip: 11, dipDir: 122 },
        joint1: { dip: 74, dipDir: 65, c: 0.015, phi: 32, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 41, dipDir: 186, c: 0.005, phi: 40, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: true, mode: 'custom_mean', u1: 0.025, u2: 0.015 },
        seismic: { enabled: false }
      }
    },
    {
      id: 'VP-2.1A',
      code: 'Sec 2 #1A (Perno Pasivo 0.1 MN)',
      title: 'Verificación Perno Anclaje Mecánico Pasivo (T = 0.10 MN Equilibrio Límite 3D)',
      refManualPage: 'Pág. 49 (Tabla 2.1.5)',
      expectedFS: 1.0140,
      tolerance: 0.001,
      input: {
        slope: { dip: 90, dipDir: 180, height: 10, unitWeight: 0.027 },
        upperSlope: { dip: 0, dipDir: 180 },
        joint1: { dip: 45, dipDir: 125, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 70, dipDir: 225, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false },
        seismic: { enabled: false },
        bolts: [{ type: 'mechanically_anchored', model: 'passive', trend: 0, plunge: 0, count: 1, useOrientationEfficiency: false, useShear: false }]
      }
    },
    {
      id: 'VP-2.1B',
      code: 'Sec 2 #1B (Perno Lechada 0.24 MN + Efic.)',
      title: 'Verificación Grouted Dowel 100% con Eficiencia Coseno Tensión/Corte',
      refManualPage: 'Pág. 49 (Tabla 2.1.5)',
      expectedFS: 1.0297,
      tolerance: 0.001,
      input: {
        slope: { dip: 90, dipDir: 180, height: 10, unitWeight: 0.027 },
        upperSlope: { dip: 0, dipDir: 180 },
        joint1: { dip: 45, dipDir: 125, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 70, dipDir: 225, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false },
        seismic: { enabled: false },
        bolts: [{ type: 'grouted_dowel_100', model: 'passive', trend: 0, plunge: 0, count: 1, useOrientationEfficiency: true, useShear: false }]
      }
    },
    {
      id: 'VP-3.1A',
      code: 'Sec 3 #1A (Talud Seco Hw=0m)',
      title: 'Modelo de Agua Empalsada — Condición Base Seca (Hw = 0 m)',
      refManualPage: 'Pág. 56 (Tabla 3.1.3)',
      expectedFS: 0.9218,
      tolerance: 0.001,
      input: {
        slope: { dip: 60, dipDir: 0, height: 10, unitWeight: 0.026 },
        upperSlope: { dip: 20, dipDir: 0 },
        joint1: { dip: 55, dipDir: 320, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 50, dipDir: 50, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false, pondedEnabled: false, pondedDepth: 0 },
        seismic: { enabled: false }
      }
    },
    {
      id: 'VP-3.1B',
      code: 'Sec 3 #1B (Talud Inundado Hw=10m)',
      title: 'Modelo de Agua Empalsada en Pie de Talud (Hw = 10 m, U_pond = 1.911 MN)',
      refManualPage: 'Pág. 56 (Tabla 3.1.3)',
      expectedFS: 2.4348,
      tolerance: 0.001,
      input: {
        slope: { dip: 60, dipDir: 0, height: 10, unitWeight: 0.026 },
        upperSlope: { dip: 20, dipDir: 0 },
        joint1: { dip: 55, dipDir: 320, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        joint2: { dip: 50, dipDir: 50, c: 0, phi: 35, waviness: 0, model: 'mohr-coulomb' },
        water: { enabled: false, pondedEnabled: true, pondedDepth: 10, gammaW: 0.00981, slopeFaceType: 'impervious' },
        seismic: { enabled: false }
      }
    }
  ];

  function runVerificationSuite() {
    return VERIFICATION_SUITE.map((item) => {
      const res = solveWedge(item.input);
      const calcFS = res.valid ? res.FS : 0;
      const diff = Math.abs(calcFS - item.expectedFS);
      const passed = res.valid && diff <= (item.tolerance || 0.002);
      return {
        id: item.id,
        code: item.code,
        title: item.title,
        refManualPage: item.refManualPage,
        expectedFS: item.expectedFS,
        calculatedFS: calcFS,
        absError: diff,
        relErrorPct: (diff / item.expectedFS) * 100.0,
        passed: passed,
        modeEs: res.modeEs,
        volume: res.volume,
        drivingMN: res.drivingForceMN,
        resistingMN: res.resistingForceMN,
        input: item.input
      };
    });
  }

  global.WedgeEngine = {
    BOLT_CATALOG,
    VERIFICATION_SUITE,
    normalFromDipDipDir,
    vectorFromPlungeTrend,
    plungeTrendFromVector,
    solveWedge,
    optimizeFieldSupport,
    runCombinationAnalysis,
    runMonteCarlo,
    runVerificationSuite
  };
})(typeof window !== 'undefined' ? window : globalThis);
