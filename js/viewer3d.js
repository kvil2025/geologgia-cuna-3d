/**
 * GeologgIA Cuña 3D — Motor de Renderizado CAD 3D (Three.js)
 * Soporta Vista Perspectiva Interactiva y Cuádruple Vista CAD (Top / Front / Side / Perspective)
 * Incluye extracción animada de la cuña, cavidad en el talud, vectores 3D de fuerza, pernos y agua empalsada.
 */
(function (global) {
  'use strict';

  class WedgeViewer3D {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas || typeof THREE === 'undefined') return;

      this.scene = new THREE.Scene();
      this.darkMode = true;
      this.quadView = false;
      this.showVectors = true;
      this.showBolts = true;
      this.showWireframe = true;
      this.xrayMode = false;
      this.displacement = 0.18; // Desplazamiento inicial leve para distinguir la cuña
      this.animating = false;
      this.animTime = 0;

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      // Cámara principal en perspectiva
      this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
      // Cámaras ortográficas para modo Cuádruple Vista CAD (Top, Front, Side)
      this.camTop = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 5000);
      this.camFront = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 5000);
      this.camSide = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 5000);

      // Estado de órbita esférica (En Three.js usamos Y=Arriba, X=Este, Z=-Norte o Sur)
      this.target = new THREE.Vector3(0, 4, 0);
      this.spherical = { radius: 34, theta: 0.45, phi: 1.12 };
      this.isDragging = false;
      this.dragMode = 'rotate'; // 'rotate' o 'pan'
      this.lastMouse = { x: 0, y: 0 };

      this.rootGroup = new THREE.Group();
      this.wedgeGroup = new THREE.Group();
      this.vectorsGroup = new THREE.Group();
      this.boltsGroup = new THREE.Group();
      this.scene.add(this.rootGroup);
      this.scene.add(this.wedgeGroup);
      this.scene.add(this.vectorsGroup);
      this.scene.add(this.boltsGroup);

      this.lastResult = null;
      this.lastInput = null;

      this._setupLights();
      this._setupControls();
      this._onResize();
      window.addEventListener('resize', () => this._onResize());

      this._animateLoop();
    }

    /**
     * Convierte coordenadas ENU del motor matemático (X=Este, Y=Norte, Z=Arriba)
     * a coordenadas de escena Three.js (X=Este, Y=Arriba, Z=Sur = -Norte)
     */
    enuToThree(pt) {
      return new THREE.Vector3(pt[0], pt[2], -pt[1]);
    }

    _setupLights() {
      const amb = new THREE.AmbientLight(0xffffff, 0.68);
      const dir1 = new THREE.DirectionalLight(0xffffff, 0.85);
      dir1.position.set(40, 80, 60);
      const dir2 = new THREE.DirectionalLight(0x38bdf8, 0.32);
      dir2.position.set(-50, 30, -40);
      this.scene.add(amb, dir1, dir2);
    }

    _setupControls() {
      const el = this.canvas;
      el.addEventListener('contextmenu', (e) => e.preventDefault());

      el.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.dragMode = (e.button === 2 || e.shiftKey) ? 'pan' : 'rotate';
        this.lastMouse = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        this.lastMouse = { x: e.clientX, y: e.clientY };

        if (this.dragMode === 'rotate') {
          this.spherical.theta -= dx * 0.0075;
          this.spherical.phi = Math.max(0.12, Math.min(Math.PI * 0.48, this.spherical.phi - dy * 0.0075));
        } else {
          const panScale = this.spherical.radius * 0.0016;
          const right = new THREE.Vector3();
          const up = new THREE.Vector3(0, 1, 0);
          const forward = new THREE.Vector3().subVectors(this.target, this.camera.position).normalize();
          right.crossVectors(forward, up).normalize();
          this.target.addScaledVector(right, -dx * panScale);
          this.target.y += dy * panScale;
        }
        this._updateCameraPosition();
      });

      window.addEventListener('mouseup', () => {
        this.isDragging = false;
      });

      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        this.spherical.radius = Math.max(3, Math.min(2500, this.spherical.radius * factor));
        this._updateCameraPosition();
      }, { passive: false });

      // Soporte Táctil (Mobile / Tablet en Terreno)
      let touchDist = 0;
      el.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          this.isDragging = true;
          this.dragMode = 'rotate';
          this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
          this.isDragging = false;
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          touchDist = Math.hypot(dx, dy);
        }
      }, { passive: true });

      el.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && this.isDragging) {
          const dx = e.touches[0].clientX - this.lastMouse.x;
          const dy = e.touches[0].clientY - this.lastMouse.y;
          this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          this.spherical.theta -= dx * 0.008;
          this.spherical.phi = Math.max(0.12, Math.min(Math.PI * 0.48, this.spherical.phi - dy * 0.008));
          this._updateCameraPosition();
        } else if (e.touches.length === 2 && touchDist > 0) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const newDist = Math.hypot(dx, dy);
          const ratio = touchDist / Math.max(10, newDist);
          this.spherical.radius = Math.max(3, Math.min(2500, this.spherical.radius * ratio));
          touchDist = newDist;
          this._updateCameraPosition();
        }
      }, { passive: true });

      el.addEventListener('touchend', () => {
        this.isDragging = false;
      });
    }

    _updateCameraPosition() {
      const r = this.spherical.radius;
      const sinPhi = Math.sin(this.spherical.phi);
      const cosPhi = Math.cos(this.spherical.phi);
      const sinTheta = Math.sin(this.spherical.theta);
      const cosTheta = Math.cos(this.spherical.theta);

      this.camera.position.set(
        this.target.x + r * sinPhi * sinTheta,
        this.target.y + r * cosPhi,
        this.target.z + r * sinPhi * cosTheta
      );
      this.camera.lookAt(this.target);
    }

    _onResize() {
      if (!this.canvas || !this.canvas.parentElement) return;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const w = Math.max(80, Math.floor(rect.width));
      const h = Math.max(80, Math.floor(rect.height));
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this._updateOrthoCameras(w, h);
    }

    _updateOrthoCameras(w, h) {
      const aspect = (w * 0.5) / Math.max(1, h * 0.5);
      const halfH = Math.max(8, this.spherical.radius * 0.48);
      const halfW = halfH * aspect;

      [this.camTop, this.camFront, this.camSide].forEach((cam) => {
        cam.left = -halfW;
        cam.right = halfW;
        cam.top = halfH;
        cam.bottom = -halfH;
        cam.updateProjectionMatrix();
      });

      const d = this.spherical.radius * 2.0;
      // Top View (mirando desde arriba -Y)
      this.camTop.position.set(this.target.x, this.target.y + d, this.target.z);
      this.camTop.up.set(0, 0, -1);
      this.camTop.lookAt(this.target);

      // Front View (mirando de frente a la cara del talud)
      const slopeAzRad = ((this.lastInput && this.lastInput.slope ? this.lastInput.slope.dipDir : 180) * Math.PI) / 180.0;
      const frontDir = new THREE.Vector3(Math.sin(slopeAzRad), 0, -Math.cos(slopeAzRad));
      this.camFront.position.copy(this.target).addScaledVector(frontDir, d);
      this.camFront.up.set(0, 1, 0);
      this.camFront.lookAt(this.target);

      // Side View (perfil transversal del talud, 90° a la derecha)
      const sideDir = new THREE.Vector3(frontDir.z, 0, -frontDir.x);
      this.camSide.position.copy(this.target).addScaledVector(sideDir, d);
      this.camSide.up.set(0, 1, 0);
      this.camSide.lookAt(this.target);
    }

    toggleXRay() {
      this.xrayMode = !this.xrayMode;
      if (this.lastResult && this.lastInput) {
        this.renderModel(this.lastResult, this.lastInput, false);
      }
      return this.xrayMode;
    }

    setTheme(isDark) {
      this.darkMode = isDark;
      if (this.lastResult && this.lastInput) {
        this.renderModel(this.lastResult, this.lastInput, false);
      }
    }

    setDisplacement(val) {
      this.displacement = Math.max(0, Math.min(1.5, Number(val) || 0));
      this._applyWedgeDisplacement();
    }

    _applyWedgeDisplacement() {
      if (!this.lastResult || !this.lastResult.valid) return;
      const H = (this.lastInput && this.lastInput.slope) ? Number(this.lastInput.slope.height) || 10 : 10;
      const sDirENU = this.lastResult.vectors.slidingDir;
      const sDirThree = this.enuToThree(sDirENU).normalize();
      const dist = this.displacement * H * 0.45;
      this.wedgeGroup.position.copy(sDirThree).multiplyScalar(dist);
    }

    fitView() {
      if (!this.lastResult || !this.lastResult.valid) return;
      const v1 = this.enuToThree(this.lastResult.vertices.V1);
      const v2 = this.enuToThree(this.lastResult.vertices.V2);
      const v3 = this.enuToThree(this.lastResult.vertices.V3);
      const center = new THREE.Vector3().add(v1).add(v2).add(v3).multiplyScalar(0.25);
      const maxDim = Math.max(v1.length(), v2.length(), v3.length(), v1.distanceTo(v2), 6);

      this.target.copy(center);
      const slopeAzRad = ((this.lastInput && this.lastInput.slope ? this.lastInput.slope.dipDir : 180) * Math.PI) / 180.0;
      // Colocar la cámara frente a la cara del talud con un ángulo oblicuo de 25°
      this.spherical.theta = slopeAzRad + 0.42;
      this.spherical.phi = 1.08;
      this.spherical.radius = maxDim * 2.35;
      this._updateCameraPosition();
      this._onResize();
    }

    _clearGroup(grp) {
      while (grp.children.length > 0) {
        const obj = grp.children[0];
        grp.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
      }
    }

    /**
     * Construye una malla triangular a partir de una lista de tripletes de vértices Three.Vector3
     */
    _buildTriangleMesh(triangles, material, addEdges, edgeColor) {
      const geom = new THREE.BufferGeometry();
      const positions = [];
      for (let i = 0; i < triangles.length; i++) {
        const tri = triangles[i];
        positions.push(tri[0].x, tri[0].y, tri[0].z);
        positions.push(tri[1].x, tri[1].y, tri[1].z);
        positions.push(tri[2].x, tri[2].y, tri[2].z);
      }
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.computeVertexNormals();
      const mesh = new THREE.Mesh(geom, material);
      if (addEdges) {
        const edges = new THREE.EdgesGeometry(geom, 12);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeColor || 0xffffff, transparent: true, opacity: 0.55 }));
        mesh.add(line);
      }
      return mesh;
    }

    /**
     * Renderiza el talud 3D, la cavidad de las juntas, la cuña tetraédrica, vectores y pernos
     */
    renderModel(result, input, autoFit = true) {
      this.lastResult = result;
      this.lastInput = input;

      this._clearGroup(this.rootGroup);
      this._clearGroup(this.wedgeGroup);
      this._clearGroup(this.vectorsGroup);
      this._clearGroup(this.boltsGroup);

      if (!result || !result.valid) return;

      const V0 = this.enuToThree(result.vertices.V0);
      const V1 = this.enuToThree(result.vertices.V1);
      const V2 = this.enuToThree(result.vertices.V2);
      const V3 = this.enuToThree(result.vertices.V3);
      const H = Math.max(2, Number(input.slope.height) || 10);

      // 1. Grilla de referencia en el piso del banco (z = 0 -> Three.y = 0)
      const gridSpan = Math.max(H * 3.5, V1.distanceTo(V2) * 2.5, 24);
      const grid = new THREE.GridHelper(
        gridSpan,
        20,
        this.darkMode ? 0x00e5b4 : 0x0d2560,
        this.darkMode ? 0x1e293b : 0xcbd5e1
      );
      grid.position.set(0, -0.02, 0);
      this.rootGroup.add(grid);

      // 2. Macizo Rocoso del Talud con Cavidad de Cuña (Socket 3D estilo Cuña 3D)
      this._buildSlopeBenchWithSocket(V0, V1, V2, V3, H, input);

      // 3. Cuña Tetraédrica 3D Deslizable (4 caras coloreadas por rol geotécnico)
      const fsColor = result.FS < 1.0 ? 0xf43f5e : (result.FS < 1.3 ? 0xf59e0b : 0x00e5b4);

      const isXRay = this.xrayMode;
      // Cara Junta 1 (V0, V1, V3) — Cian Geotécnico
      const matJ1 = new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        roughness: 0.42,
        metalness: 0.1,
        transparent: isXRay,
        opacity: isXRay ? 0.40 : 1.0,
        side: THREE.DoubleSide
      });
      this.wedgeGroup.add(this._buildTriangleMesh([[V0, V1, V3]], matJ1, this.showWireframe, 0xe0f2fe));

      // Cara Junta 2 (V0, V3, V2) — Ámbar / Dorado Estructural
      const matJ2 = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.42,
        metalness: 0.1,
        transparent: isXRay,
        opacity: isXRay ? 0.40 : 1.0,
        side: THREE.DoubleSide
      });
      this.wedgeGroup.add(this._buildTriangleMesh([[V0, V3, V2]], matJ2, this.showWireframe, 0xfef3c7));

      // Cara Frontal del Talud en la Cuña (V0, V2, V1) — Tintada según estado de FS
      const matFace = new THREE.MeshStandardMaterial({
        color: fsColor,
        roughness: 0.38,
        metalness: 0.12,
        transparent: true,
        opacity: isXRay ? 0.30 : 0.88,
        side: THREE.DoubleSide
      });
      this.wedgeGroup.add(this._buildTriangleMesh([[V0, V2, V1]], matFace, this.showWireframe, 0xffffff));

      // Cara Superior / Berma de la Cuña (V1, V2, V3)
      const matUpper = new THREE.MeshStandardMaterial({
        color: this.darkMode ? 0x334155 : 0x64748b,
        roughness: 0.5,
        metalness: 0.08,
        transparent: isXRay,
        opacity: isXRay ? 0.40 : 1.0,
        side: THREE.DoubleSide
      });
      this.wedgeGroup.add(this._buildTriangleMesh([[V1, V2, V3]], matUpper, this.showWireframe, 0x94a3b8));

      // Línea de Intersección Destacada (V0 -> V3) en la cavidad y en la cuña
      const intLineGeom = new THREE.BufferGeometry().setFromPoints([V0, V3]);
      const intLineMat = new THREE.LineBasicMaterial({ color: 0x00e5b4, linewidth: 3 });
      this.rootGroup.add(new THREE.Line(intLineGeom, intLineMat));
      this.wedgeGroup.add(new THREE.Line(intLineGeom.clone(), new THREE.LineBasicMaterial({ color: 0xffffff })));

      // 4. Agua Empalsada en el Pie del Talud (Ponded Water 3D Prism)
      if (input.water && input.water.pondedEnabled && Number(input.water.pondedDepth) > 0) {
        this._buildPondedWaterPrism(V0, V1, V2, H, Number(input.water.pondedDepth), input);
      }

      // 5. Vectores 3D de Fuerzas (Peso W, Deslizamiento S, Normales N1/N2, Agua U1/U2, Sismo E)
      if (this.showVectors) {
        this._buildForceVectors(result, input, H);
      }

      // 6. Pernos de Anclaje 3D
      if (this.showBolts && Array.isArray(input.bolts)) {
        this._buildBolts3D(result, input, H);
      }

      this._applyWedgeDisplacement();
      if (autoFit) {
        this.fitView();
      } else {
        this._onResize();
      }
    }

    _buildSlopeBenchWithSocket(V0, V1, V2, V3, H, input) {
      // Construir el bloque del banco alrededor de los puntos V1, V2, V3 y V0
      // Calculamos el vector horizontal de dirección del talud (hacia afuera de la cara)
      const slopeAzRad = ((input.slope ? input.slope.dipDir : 180) * Math.PI) / 180.0;
      const slopeDipRad = ((input.slope ? input.slope.dip : 65) * Math.PI) / 180.0;

      // Vector unitario hacia el frente del talud (horizontal) y a lo largo del rumbo (strike)
      const outDir = new THREE.Vector3(Math.sin(slopeAzRad), 0, -Math.cos(slopeAzRad)).normalize();
      const strikeDir = new THREE.Vector3(outDir.z, 0, -outDir.x).normalize();

      // Ordenar V1 y V2 a lo largo del strike para construir las alas izquierda y derecha del banco
      const s1 = V1.dot(strikeDir);
      const s2 = V2.dot(strikeDir);
      const vLeft = s1 < s2 ? V1 : V2;
      const vRight = s1 < s2 ? V2 : V1;

      const span = Math.max(V1.distanceTo(V2) * 0.55, H * 0.65);
      const backDepth = Math.max(
        Math.abs(V3.clone().sub(V1).dot(outDir)) * 1.45,
        H * 1.25
      );

      // Puntos de la cresta extendida a izquierda y derecha
      const crestL = vLeft.clone().addScaledVector(strikeDir, -span);
      const crestR = vRight.clone().addScaledVector(strikeDir, span);

      // Desplazamiento del pie hacia la cresta en horizontal
      const toeToCrestHoriz = H / Math.tan(Math.max(0.2, slopeDipRad));
      const toeOffset = outDir.clone().multiplyScalar(toeToCrestHoriz);

      const toeL = new THREE.Vector3(crestL.x + toeOffset.x, 0, crestL.z + toeOffset.z);
      const toeR = new THREE.Vector3(crestR.x + toeOffset.x, 0, crestR.z + toeOffset.z);

      // Puntos posteriores del bloque (back)
      const backVec = outDir.clone().multiplyScalar(-backDepth);
      const backTopL = crestL.clone().add(backVec);
      const backTopR = crestR.clone().add(backVec);
      // Asegurar que V3 quede dentro del bloque posterior
      backTopL.y = Math.max(crestL.y, V3.y);
      backTopR.y = Math.max(crestR.y, V3.y);

      const backBotL = new THREE.Vector3(backTopL.x, 0, backTopL.z);
      const backBotR = new THREE.Vector3(backTopR.x, 0, backTopR.z);

      const rockColor = this.darkMode ? 0x1e2636 : 0x94a3b8;
      const rockMat = new THREE.MeshStandardMaterial({
        color: rockColor,
        roughness: 0.72,
        metalness: 0.06,
        side: THREE.DoubleSide,
        transparent: this.xrayMode,
        opacity: this.xrayMode ? 0.28 : 1.0,
        depthWrite: !this.xrayMode
      });

      const benchTris = [
        // Cara del talud alrededor de la cavidad (V0, vLeft, vRight)
        [toeL, V0, crestL],
        [crestL, V0, vLeft],
        [V0, toeR, vRight],
        [vRight, toeR, crestR],
        // Superficie superior (berma) alrededor de la cavidad (vLeft, vRight, V3)
        [crestL, vLeft, backTopL],
        [vLeft, V3, backTopL],
        [vRight, crestR, backTopR],
        [V3, vRight, backTopR],
        [backTopL, V3, backTopR],
        // Paredes laterales, espalda y piso del banco
        [toeL, crestL, backTopL],
        [toeL, backTopL, backBotL],
        [toeR, backTopR, crestR],
        [toeR, backBotR, backTopR],
        [backBotL, backTopL, backTopR],
        [backBotL, backTopR, backBotR]
      ];

      this.rootGroup.add(this._buildTriangleMesh(benchTris, rockMat, true, this.darkMode ? 0x334155 : 0x475569));

      // Superficies internas de la cavidad (Joint 1 y Joint 2 en el macizo, oscurecidas)
      const socketJ1Mat = new THREE.MeshStandardMaterial({
        color: 0x075985,
        roughness: 0.6,
        side: THREE.DoubleSide
      });
      const socketJ2Mat = new THREE.MeshStandardMaterial({
        color: 0x92400e,
        roughness: 0.6,
        side: THREE.DoubleSide
      });
      this.rootGroup.add(this._buildTriangleMesh([[V0, V1, V3]], socketJ1Mat, true, 0x38bdf8));
      this.rootGroup.add(this._buildTriangleMesh([[V0, V3, V2]], socketJ2Mat, true, 0xfbbf24));
    }

    _buildPondedWaterPrism(V0, V1, V2, H, pondedDepth, input) {
      const hw = Math.min(H * 1.4, pondedDepth);
      const ratio = Math.min(1.0, hw / Math.max(0.1, H));
      const wV1 = V0.clone().lerp(V1, ratio);
      const wV2 = V0.clone().lerp(V2, ratio);
      const slopeAzRad = ((input.slope ? input.slope.dipDir : 180) * Math.PI) / 180.0;
      const outDir = new THREE.Vector3(Math.sin(slopeAzRad), 0, -Math.cos(slopeAzRad)).normalize();
      const poolFront1 = new THREE.Vector3(wV1.x + outDir.x * H * 0.45, wV1.y, wV1.z + outDir.z * H * 0.45);
      const poolFront2 = new THREE.Vector3(wV2.x + outDir.x * H * 0.45, wV2.y, wV2.z + outDir.z * H * 0.45);

      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.42,
        roughness: 0.15,
        side: THREE.DoubleSide
      });
      const tris = [
        [wV1, wV2, poolFront2],
        [wV1, poolFront2, poolFront1],
        [V0, wV1, poolFront1],
        [V0, wV2, poolFront2]
      ];
      this.rootGroup.add(this._buildTriangleMesh(tris, waterMat, true, 0x7dd3fc));
    }

    _buildForceVectors(result, input, H) {
      const c = this.enuToThree(result.vertices.centroid);
      const arrowLen = Math.max(2.2, H * 0.34);

      // 1. Vector Peso W (Gravedad hacia abajo -Y)
      this.vectorsGroup.add(new THREE.ArrowHelper(
        new THREE.Vector3(0, -1, 0),
        c,
        arrowLen,
        0xf8fafc,
        arrowLen * 0.22,
        arrowLen * 0.12
      ));

      // 2. Vector Dirección de Deslizamiento (Verde si estable, Rojo si FS < 1)
      const sDir = this.enuToThree(result.vectors.slidingDir).normalize();
      const sColor = result.FS < 1.0 ? 0xf43f5e : 0x00e5b4;
      this.vectorsGroup.add(new THREE.ArrowHelper(
        sDir,
        c,
        arrowLen * 1.25,
        sColor,
        arrowLen * 0.25,
        arrowLen * 0.14
      ));

      // 3. Reacciones Normales Efectivas N1 y N2
      if (result.N1 > 0) {
        const n1Dir = this.enuToThree(result.vectors.inN1).normalize();
        this.vectorsGroup.add(new THREE.ArrowHelper(
          n1Dir,
          c,
          arrowLen * 0.85,
          0x0ea5e9,
          arrowLen * 0.2,
          arrowLen * 0.11
        ));
      }
      if (result.N2 > 0) {
        const n2Dir = this.enuToThree(result.vectors.inN2).normalize();
        this.vectorsGroup.add(new THREE.ArrowHelper(
          n2Dir,
          c,
          arrowLen * 0.85,
          0xf59e0b,
          arrowLen * 0.2,
          arrowLen * 0.11
        ));
      }

      // 4. Fuerza Sísmica E
      if (result.seismicMagMN > 0 && input.seismic && input.seismic.enabled) {
        const sHorizontal = new THREE.Vector3(sDir.x, 0, sDir.z).normalize();
        this.vectorsGroup.add(new THREE.ArrowHelper(
          sHorizontal,
          c,
          arrowLen * 0.95,
          0xef4444,
          arrowLen * 0.22,
          arrowLen * 0.12
        ));
      }
    }

    _buildBolts3D(result, input, H) {
      const V0 = this.enuToThree(result.vertices.V0);
      const V1 = this.enuToThree(result.vertices.V1);
      const V2 = this.enuToThree(result.vertices.V2);

      const activeBolts = (input.bolts || []).filter((b) => b && b.enabled !== false);
      if (activeBolts.length === 0) return;

      const primary = activeBolts[0];
      const count = Math.max(1, Math.min(60, Number(primary.count) || 1));
      const boltLength = Math.max(1.0, Number(primary.length) || 8.0);
      const trend = Number(primary.trend) || 0;
      const plunge = Number(primary.plunge) || 0;
      const type = primary.type || 'mechanically_anchored';
      const isPassive = primary.model !== 'active';

      // Vector unitario de perforación del perno en Three.js
      const boltDirENU = WedgeEngine.vectorFromPlungeTrend(plunge, trend);
      const bDirThree = this.enuToThree(boltDirENU).normalize();

      // Normal hacia afuera de la cara del talud (para asentar placas y orientar emboquille)
      const slopeNormal = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(V1, V0),
        new THREE.Vector3().subVectors(V2, V0)
      ).normalize();
      if (slopeNormal.y < 0 || slopeNormal.dot(bDirThree) > 0) {
        slopeNormal.negate();
      }

      // Estilo y color según el tipo de perno
      let rodColor = 0x10b981; // Grouted Dowel (verde esmeralda)
      let ghostColor = 0x10b981;
      let plateColor = 0x34d399;
      let hasGroutCasing = false;
      let hasExpansionShell = false;
      let isCable = false;

      if (type === 'mechanically_anchored') {
        rodColor = 0xd4d4d8; // Acero plateado
        ghostColor = 0x38bdf8;
        plateColor = 0xf97316; // Placa naranja industrial
        hasExpansionShell = true;
      } else if (type === 'grouted_dowel_100' || type === 'grouted_dowel_8m') {
        rodColor = 0x10b981;
        ghostColor = 0x10b981;
        plateColor = 0x059669;
        hasGroutCasing = true;
      } else if (type === 'cable_bolt') {
        rodColor = 0x06b6d4; // Cyan cable
        ghostColor = 0x06b6d4;
        plateColor = 0x0284c7;
        isCable = true;
      } else if (type === 'split_set') {
        rodColor = 0xf59e0b; // Ámbar dorado
        ghostColor = 0xf59e0b;
        plateColor = 0xfbbf24;
      } else if (type === 'swellex') {
        rodColor = 0x84cc16; // Lima brillante
        ghostColor = 0x84cc16;
        plateColor = 0xa3e635;
      }

      // Dimensiones proporcionales y claramente visibles (sobresale ~30 cm hacia afuera de los bloques)
      const stickout = 0.32; // Exactamente ~30-32 cm sobresaliendo de la cara del bloque
      const rodRadius = Math.max(0.065, Math.min(0.14, H * 0.013)); // Barra más gruesa y visible
      const plateWidth = Math.max(0.48, Math.min(0.95, H * 0.065)); // Placa amplia
      const plateThickness = 0.07;
      const totalRodLen = boltLength + stickout;

      // Geometrías compartidas
      const rodGeom = new THREE.CylinderGeometry(rodRadius, rodRadius, totalRodLen, 16);
      const ghostGeom = new THREE.CylinderGeometry(rodRadius * 1.45, rodRadius * 1.45, totalRodLen, 10);
      const plateGeom = new THREE.BoxGeometry(plateWidth, plateThickness, plateWidth);
      const nutGeom = new THREE.CylinderGeometry(plateWidth * 0.26, plateWidth * 0.26, 0.16, 6);
      const washerGeom = new THREE.CylinderGeometry(plateWidth * 0.36, plateWidth * 0.36, 0.04, 16);
      const headGeom = new THREE.CylinderGeometry(rodRadius * 1.05, rodRadius * 1.05, stickout, 16);

      // Materiales
      const solidRodMat = new THREE.MeshStandardMaterial({
        color: rodColor,
        roughness: 0.35,
        metalness: 0.7
      });
      const ghostRodMat = new THREE.MeshBasicMaterial({
        color: ghostColor,
        transparent: true,
        opacity: 0.65,
        depthTest: false,
        depthWrite: false
      });
      const plateMat = new THREE.MeshStandardMaterial({
        color: plateColor,
        roughness: 0.4,
        metalness: 0.5
      });
      const nutMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.2,
        metalness: 0.85
      });

      // Orientación del cilindro hacia bDirThree
      const upUnit = new THREE.Vector3(0, 1, 0);
      const boltQuat = new THREE.Quaternion().setFromUnitVectors(upUnit, bDirThree);

      // Orientación de la placa perpendicular al perno
      const plateQuat = boltQuat.clone();

      // Calcular posiciones de collar en la cara del talud (V0, V1, V2)
      const collarPositions = [];
      if (count === 1) {
        // Un solo perno centrado exactamente en el baricentro de la cara
        const center = new THREE.Vector3().add(V0).add(V1).add(V2).multiplyScalar(1.0 / 3.0);
        collarPositions.push(center);
      } else if (count === 2) {
        // 2 pernos espaciados a media altura
        const pMid = V0.clone().lerp(new THREE.Vector3().add(V1).add(V2).multiplyScalar(0.5), 0.6);
        const spanVec = new THREE.Vector3().subVectors(V2, V1).multiplyScalar(0.22);
        collarPositions.push(pMid.clone().sub(spanVec));
        collarPositions.push(pMid.clone().add(spanVec));
      } else {
        // Cuadrícula / Malla regular
        const rows = Math.ceil(Math.sqrt(count));
        let placed = 0;
        for (let r = 1; r <= rows && placed < count; r++) {
          const u = (r / (rows + 0.65));
          const colsInRow = Math.max(1, Math.min(count - placed, r));
          for (let k = 0; k < colsInRow && placed < count; k++) {
            const frac = (k + 0.5) / colsInRow;
            const pLeft = V0.clone().lerp(V1, u);
            const pRight = V0.clone().lerp(V2, u);
            collarPositions.push(pLeft.lerp(pRight, frac));
            placed++;
          }
        }
      }

      // Construir cada perno en 3D
      collarPositions.forEach((pos, idx) => {
        // Desplazamiento mínimo fuera de la cara para evitar z-fighting
        const collarPt = pos.clone().addScaledVector(slopeNormal, 0.02);

        // 1. Barra de acero del perno (volumétrica sólida)
        const rodMesh = new THREE.Mesh(rodGeom, solidRodMat);
        const rodCenter = collarPt.clone().addScaledVector(bDirThree, (boltLength - stickout) * 0.5);
        rodMesh.position.copy(rodCenter);
        rodMesh.quaternion.copy(boltQuat);
        this.boltsGroup.add(rodMesh);

        // 2. Capa X-Ray permanente (permite ver el perno penetrando la roca desde cualquier vista)
        const ghostMesh = new THREE.Mesh(ghostGeom, ghostRodMat);
        ghostMesh.position.copy(rodCenter);
        ghostMesh.quaternion.copy(boltQuat);
        this.boltsGroup.add(ghostMesh);

        // 3. Manga de lechada (grout) para pernos con lechada
        if (hasGroutCasing) {
          const groutGeom = new THREE.CylinderGeometry(rodRadius * 1.7, rodRadius * 1.7, boltLength * 0.85, 10);
          const groutMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, transparent: true, opacity: 0.55 });
          const groutMesh = new THREE.Mesh(groutGeom, groutMat);
          groutMesh.position.copy(collarPt.clone().addScaledVector(bDirThree, boltLength * 0.5));
          groutMesh.quaternion.copy(boltQuat);
          this.boltsGroup.add(groutMesh);
        }

        // 4. Anclaje de expansión en la punta
        if (hasExpansionShell) {
          const shellGeom = new THREE.CylinderGeometry(rodRadius * 2.2, rodRadius * 1.2, 0.65, 8);
          const shellMat = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.6 });
          const shellMesh = new THREE.Mesh(shellGeom, shellMat);
          shellMesh.position.copy(collarPt.clone().addScaledVector(bDirThree, boltLength - 0.35));
          shellMesh.quaternion.copy(boltQuat);
          this.boltsGroup.add(shellMesh);
        }

        // 5. Tramo exterior de la barra que sobresale exactamente 30 cm desde el bloque
        const extRodMat = new THREE.MeshStandardMaterial({
          color: 0xf1f5f9,
          metalness: 0.85,
          roughness: 0.2
        });
        const extRodMesh = new THREE.Mesh(headGeom, extRodMat);
        extRodMesh.position.copy(collarPt.clone().addScaledVector(bDirThree, -stickout * 0.5));
        extRodMesh.quaternion.copy(boltQuat);
        this.boltsGroup.add(extRodMesh);

        // 6. Placa de apoyo cuadrada asentada en la cara del talud (Bearing Plate)
        const plateMesh = new THREE.Mesh(plateGeom, plateMat);
        plateMesh.position.copy(collarPt.clone().addScaledVector(bDirThree, -plateThickness * 0.5));
        plateMesh.quaternion.copy(plateQuat);
        this.boltsGroup.add(plateMesh);

        // 7. Arandela esférica y Tuerca hexagonal sobresaliendo en el extremo
        const washerMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
        const washerMesh = new THREE.Mesh(washerGeom, washerMat);
        washerMesh.position.copy(collarPt.clone().addScaledVector(bDirThree, -plateThickness - 0.02));
        washerMesh.quaternion.copy(plateQuat);
        this.boltsGroup.add(washerMesh);

        const nutMesh = new THREE.Mesh(nutGeom, nutMat);
        nutMesh.position.copy(collarPt.clone().addScaledVector(bDirThree, -stickout + 0.08));
        nutMesh.quaternion.copy(plateQuat);
        this.boltsGroup.add(nutMesh);

        // 7. Flecha de tensión si es modelo ACTIVO (pretensado)
        if (!isPassive) {
          const tArrow = new THREE.ArrowHelper(
            bDirThree.clone().negate(),
            collarPt.clone().addScaledVector(bDirThree, -0.2),
            H * 0.16,
            0x38ef7d,
            H * 0.05,
            H * 0.03
          );
          this.boltsGroup.add(tArrow);
        }
      });
    }

    capturePNG() {
      this._renderFrame();
      return this.canvas.toDataURL('image/png');
    }

    _renderFrame() {
      if (!this.renderer || !this.scene) return;
      const bgHex = this.darkMode ? 0x07090e : 0xf1f5f9;
      this.renderer.setClearColor(bgHex, 1);

      const w = this.canvas.width / (this.renderer.getPixelRatio() || 1);
      const h = this.canvas.height / (this.renderer.getPixelRatio() || 1);

      if (!this.quadView) {
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, w, h);
        this.renderer.render(this.scene, this.camera);
      } else {
        this._updateOrthoCameras(w, h);
        this.renderer.setScissorTest(true);
        const hw = Math.floor(w * 0.5);
        const hh = Math.floor(h * 0.5);

        // Cuadrante 1: Arriba-Izquierda -> Top View
        this.renderer.setViewport(0, hh, hw, hh);
        this.renderer.setScissor(0, hh, hw, hh);
        this.renderer.render(this.scene, this.camTop);

        // Cuadrante 2: Arriba-Derecha -> Perspective 3D
        this.camera.aspect = hw / Math.max(1, hh);
        this.camera.updateProjectionMatrix();
        this.renderer.setViewport(hw, hh, w - hw, hh);
        this.renderer.setScissor(hw, hh, w - hw, hh);
        this.renderer.render(this.scene, this.camera);

        // Cuadrante 3: Abajo-Izquierda -> Front View
        this.renderer.setViewport(0, 0, hw, hh);
        this.renderer.setScissor(0, 0, hw, hh);
        this.renderer.render(this.scene, this.camFront);

        // Cuadrante 4: Abajo-Derecha -> Side View
        this.renderer.setViewport(hw, 0, w - hw, hh);
        this.renderer.setScissor(hw, 0, w - hw, hh);
        this.renderer.render(this.scene, this.camSide);

        this.camera.aspect = w / Math.max(1, h);
        this.camera.updateProjectionMatrix();
      }
    }

    _animateLoop() {
      requestAnimationFrame(() => this._animateLoop());
      if (this.animating) {
        this.animTime += 0.025;
        this.displacement = 0.55 * (0.5 - 0.5 * Math.cos(this.animTime));
        this._applyWedgeDisplacement();
        const slider = document.getElementById('wedge-slide-range');
        const badge = document.getElementById('wedge-slide-val');
        if (slider) slider.value = this.displacement.toFixed(2);
        if (badge) badge.textContent = Math.round(this.displacement * 100) + '%';
      }
      this._renderFrame();
    }
  }

  global.WedgeViewer3D = WedgeViewer3D;
})(typeof window !== 'undefined' ? window : globalThis);
