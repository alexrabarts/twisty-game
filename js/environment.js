class Environment {
  constructor(scene, startSegment = 0, endSegment = 703, legIndex = 0) {
    this.scene = scene;
    this.roadPath = []; // Store the path for other uses (full track for physics/AI)
    this.startSegment = startSegment; // Start of visual geometry range
    this.endSegment = endSegment; // End of visual geometry range
    this.legIndex = legIndex; // Current leg index (0-7)
    this.finishGate = null; // The finish as a gate record: position, heading, segment, reach each side
    this.roadworksZones = []; // Store construction zones
    this.jumpRamps = []; // Store jump ramp objects for collision detection
    this.roadworkObstacles = []; // Store barriers and equipment for collision detection
    this.boulders = []; // Store boulder objects for collision detection
    this.checkpoints = []; // Store checkpoint positions for scoring
    this.groundedObjects = []; // Objects whose base must rest on the terrain model

    this.vergeBaseColor = 0x4a3d34; // Bare dirt shoulder

    // Every per-leg world value comes from one table entry; only this
    // constructor looks it up, everything else reads this.config
    this.config = Terrain.legConfig(legIndex);
    this.terrain = this.config.profile;
    this.floorY = this.config.floor.y;
    // Clutter the left side carries (rocks, roadworks plant) stands on ground a
    // bike can ride on when that side is run-off, so it collides as a solid
    // circle in `boulders`. Beside a wall it is out of reach: the rocks are
    // scenery only, and the roadworks plant (bulldozer, barrier, work truck) is
    // not built, because up a wall it would hang on the rock face.
    this.solidClutter = !!this.terrain.left.runoff;
    // Where the leg has a tunnel or a village: scenery keeps out
    this.setPieces = Terrain.setPieces(this.terrain);

    this.roadWidth = this.config.roadWidth;
    // How far out on the left the roadworks plant stands: a few metres onto the
    // run-off ground (a leg whose run-off is narrow says so in its `plant`)
    const halfRoad = this.roadWidth / 2;
    const past = { bulldozer: 9, barrier: 6, truck: 6, ...this.config.plant };
    this.plantLateral = { bulldozer: halfRoad + past.bulldozer, barrier: halfRoad + past.barrier, truck: halfRoad + past.truck };
    // What Terrain needs to read the road: the path fills in during createRoad
    this.terrainGeometry = {
      path: this.roadPath,
      roadWidth: this.roadWidth,
      startSegment,
      endSegment,
    };
    console.log(
      `Initializing environment for segments ${startSegment}-${endSegment}, leg ${legIndex}, road width ${this.roadWidth}`,
    );

    // Deterministic per-leg generation: the same leg must look identical
    // every time it's built (menu preview, gameplay, rebuilds). All scenery
    // randomness goes through this seeded generator instead of this.rand().
    this.randState = ((startSegment + 1) * 2654435761 ^ (legIndex + 1) * 40503) >>> 0;

    this.createRoad(); // Generates full roadPath, but only creates geometry for segment range
    this.createFloor();
    this.createRoadWalls(); // Vertical walls connecting road to terrain
    this.createLayeredMountains(); // Add layered mountain scenery
    this.createRoadMarkings();
    this.addEnvironmentalDetails();
    this.createRoadworks(); // Add construction zones
    this.addHairpinWarnings(); // Add hairpin bend warnings
    this.createCheckpoints(); // Add scoring checkpoints
    this.createSetPieces(); // Bridge, tunnel and village

    // Validate terrain-road clearance (development-time check)
    const terrainErrors = this.validateAllTerrainClearance();
    if (terrainErrors.length > 0) {
      console.error("❌ TERRAIN-ROAD OVERLAP DETECTED:");
      terrainErrors.forEach((error) => {
        console.error(
          `  - ${error.name} at (${error.position.x}, ${error.position.z}) radius ${error.radius}`,
        );
      });
      console.error(
        "These terrain objects are too close to or overlapping the road!",
      );
    } else {
      console.log("✅ Terrain validation passed - no road overlaps detected");
    }

    // Validate that every registered scenery object actually rests on the
    // terrain model (development-time check for floating objects)
    const groundingViolations = this.validateGrounding();
    if (groundingViolations.length > 0) {
      console.error(
        `❌ FLOATING OBJECTS DETECTED: ${groundingViolations.length} object(s) hover above the terrain (see warnings above)`,
      );
    } else {
      console.log("✅ Grounding validation passed - no floating objects detected");
    }
  }

  // Terrain elevation model shared by every scenery placement site. Mirrors
  // the physics model, Terrain.groundY: the road surface plus
  // a 2m ledge sit at the segment's y; beyond the ledge each side follows
  // its profile (see js/terrain.js). Where a side has a rock face (the cliff
  // wall and the drop) the answer is the drawn face itself.
  groundYAt(x, z) {
    return Terrain.groundY(
      this.terrain,
      this.terrainGeometry,
      x,
      z,
      0,
      this.roadPath.length - 1,
      true,
    );
  }

  // Whether a segment lies inside a set piece, widened by `margin` segments
  // each side (a rock aimed just before a tunnel can land in it)
  inSetPiece(index, margin = 0) {
    return this.setPieces.some((piece) => index >= piece.from - margin && index <= piece.to + margin);
  }

  // A circle a bike collides with at any height below `height` above it
  // (see Vehicle's boulder loop): clutter on run-off ground
  addSolidCircle(x, y, z, radius, height, label) {
    this.boulders.push({ position: new THREE.Vector3(x, y, z), radius, solid: true, height, label });
  }

  // Register an object whose bounding-box bottom must rest on (or below) the
  // terrain model at its position. Objects flagged with
  // userData.allowFloating = true are skipped during validation.
  registerGrounded(object, label) {
    this.groundedObjects.push({ object, label });
  }

  // Development-time validation: every registered object's bounding-box
  // bottom must be at or below the highest groundYAt() under its footprint
  // (the centre and the middle of each edge), within tolerance: an object on
  // a steep wall touches it on its uphill side. Returns an array of
  // violations and console.warns each one.
  validateGrounding(tolerance = 0.75) {
    const violations = [];
    if (!this.groundedObjects || this.groundedObjects.length === 0) {
      return violations;
    }

    const box = new THREE.Box3();
    this.groundedObjects.forEach(({ object, label }) => {
      if (object.userData && object.userData.allowFloating) return;

      box.setFromObject(object);
      if (box.isEmpty()) return;

      const centerX = (box.min.x + box.max.x) / 2;
      const centerZ = (box.min.z + box.max.z) / 2;
      const groundY = Math.max(
        this.groundYAt(centerX, centerZ),
        this.groundYAt(box.min.x, centerZ),
        this.groundYAt(box.max.x, centerZ),
        this.groundYAt(centerX, box.min.z),
        this.groundYAt(centerX, box.max.z),
      );
      const delta = box.min.y - groundY;

      if (delta > tolerance) {
        violations.push({
          label,
          delta,
          position: { x: centerX, y: box.min.y, z: centerZ },
        });
        console.warn(
          `⚠️ Floating object: ${label} bottom y=${box.min.y.toFixed(2)} hovers ${delta.toFixed(2)} above ground y=${groundY.toFixed(2)} at (${centerX.toFixed(1)}, ${centerZ.toFixed(1)})`,
        );
      }
    });

    return violations;
  }

  // Mulberry32 - small, fast, deterministic
  rand() {
    this.randState = (this.randState + 0x6d2b79f5) >>> 0;
    let t = this.randState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  displaceVertices(geometry, amount) {
    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    // Use noise-like function for continuous surface deformation
    const noise = (x, y, z) => {
      // Multiple octaves of sine waves for pseudo-noise
      const scale1 = 2.0;
      const scale2 = 5.0;
      const scale3 = 10.0;

      return (
        Math.sin(x * scale1 + y * scale1) * Math.cos(z * scale1) * 0.5 +
        Math.sin(x * scale2 - z * scale2) * Math.cos(y * scale2) * 0.3 +
        Math.sin(y * scale3 + z * scale3) * Math.cos(x * scale3) * 0.2
      );
    };

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      const distance = vertex.length();

      // Use position-based noise for continuous displacement
      const noiseValue = noise(vertex.x, vertex.y, vertex.z);
      const displacement = noiseValue * amount;

      vertex.normalize().multiplyScalar(distance + displacement);
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  createRoad() {
    // Create road texture
    const roadTexture = this.createRoadTexture();
    const roadMaterialProps = {
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0.0,
      envMapIntensity: 0.3,
    };
    if (roadTexture) {
      roadMaterialProps.map = roadTexture;
    } else {
      roadMaterialProps.color = 0x2a2a2a; // Dark grey fallback
    }
    const roadMaterial = new THREE.MeshStandardMaterial(roadMaterialProps);
    this.roadMaterial = roadMaterial; // Store for weather effects

    const roadWidth = this.roadWidth; // Use instance road width (varies by leg difficulty)
    const segmentLength = 20; // Shorter segments for smoother curves

    // Track position and heading as we build the road
    let currentX = 0;
    let currentZ = 0;
    let currentHeading = 0; // Current direction in radians (0 = north/+Z)

    // Define the course as a series of straights and turns
    // Each element defines how many segments and the turn rate per segment
    // Progressive layout: 380 segments across 8 legs with increasing difficulty
    // Course doubled in length: each section has 2x the segments at half the
    // turn rate, so every curve keeps its total angle at twice the radius.
    const courseLayout = [
      // === LEG 1: MOUNTAIN DAWN (0-69) - Gentle winding, 70 segments = 1400m ===
      { segments: 16, turnRate: 0 }, // Long start straight
      { segments: 8, turnRate: 0.03 }, // Gentle right sweep
      { segments: 10, turnRate: 0 }, // Flowing straight
      { segments: 6, turnRate: -0.025 }, // Gentle left
      { segments: 10, turnRate: 0 }, // Long straight section
      { segments: 8, turnRate: 0.04 }, // Moderate right
      { segments: 6, turnRate: 0 }, // Short straight
      { segments: 6, turnRate: -0.035 }, // Moderate left

      // === LEG 2: VALLEY RUN (70-149) - Fast flowing, 80 segments = 1600m ===
      { segments: 14, turnRate: 0 }, // Fast straight
      { segments: 10, turnRate: 0.045 }, // Sweeping right
      { segments: 12, turnRate: 0 }, // Long fast section
      { segments: 8, turnRate: -0.05 }, // Sweeping left
      { segments: 14, turnRate: 0 }, // High-speed straight
      { segments: 8, turnRate: 0.04 }, // Fast right
      { segments: 8, turnRate: 0 }, // Straight
      { segments: 6, turnRate: -0.045 }, // Fast left sweep

      // === LEG 3: COASTAL DESCENT (150-233) - Sweeping, 84 segments = 1680m ===
      { segments: 10, turnRate: 0 }, // Descent approach
      { segments: 12, turnRate: 0.05 }, // Sweeping right descent
      { segments: 14, turnRate: 0 }, // Fast downhill
      { segments: 10, turnRate: -0.055 }, // Sweeping left descent
      { segments: 16, turnRate: 0 }, // Extended high-speed
      { segments: 8, turnRate: 0.045 }, // Flowing right
      { segments: 10, turnRate: 0 }, // Fast straight
      { segments: 4, turnRate: -0.05 }, // Coastal sweep left

      // === LEG 4: FOGGY GORGE (234-321) - Visibility challenge, 88 segments = 1760m ===
      { segments: 16, turnRate: 0 }, // Fog approach
      { segments: 10, turnRate: 0.055 }, // Misty right
      { segments: 12, turnRate: 0 }, // Limited visibility straight
      { segments: 8, turnRate: -0.06 }, // Foggy left
      { segments: 14, turnRate: 0 }, // Long fog section
      { segments: 10, turnRate: 0.05 }, // Technical right
      { segments: 10, turnRate: 0 }, // Straight
      { segments: 8, turnRate: -0.055 }, // Exit curve

      // === LEG 5: HIGH PASS (322-413) - Technical hairpins, 92 segments = 1840m ===
      { segments: 10, turnRate: 0 }, // Pass approach
      { segments: 8, turnRate: 0.075 }, // Sharp right
      { segments: 6, turnRate: 0 }, // Chicane straight
      { segments: 8, turnRate: -0.075 }, // Sharp left
      { segments: 16, turnRate: 0.14 }, // HAIRPIN RIGHT
      { segments: 6, turnRate: 0 }, // Recovery
      { segments: 10, turnRate: 0.06 }, // Tight right
      { segments: 14, turnRate: -0.125 }, // HAIRPIN LEFT
      { segments: 8, turnRate: 0 }, // Exit
      { segments: 6, turnRate: 0.07 }, // Technical right

      // === LEG 6: STORM VALLEY (414-509) - Rain + grip, 96 segments = 1920m ===
      { segments: 14, turnRate: 0 }, // Storm approach
      { segments: 10, turnRate: 0.045 }, // Wet right curve
      { segments: 12, turnRate: 0 }, // Rain straight
      { segments: 10, turnRate: -0.05 }, // Slippery left
      { segments: 16, turnRate: 0 }, // Long wet section
      { segments: 10, turnRate: 0.04 }, // Technical right
      { segments: 12, turnRate: 0 }, // Straight
      { segments: 8, turnRate: -0.045 }, // Left curve
      { segments: 4, turnRate: 0 }, // Exit section

      // === LEG 7: NIGHT RIDE (510-607) - Darkness, 98 segments = 1960m ===
      { segments: 16, turnRate: 0 }, // Night approach
      { segments: 10, turnRate: 0.055 }, // Dark right curve
      { segments: 12, turnRate: 0 }, // Under stars
      { segments: 10, turnRate: -0.06 }, // Technical left
      { segments: 14, turnRate: 0 }, // Long night straight
      { segments: 10, turnRate: 0.05 }, // Flowing right
      { segments: 10, turnRate: 0 }, // Link section
      { segments: 8, turnRate: -0.055 }, // Left curve
      { segments: 8, turnRate: 0 }, // Straight section

      // === LEG 8: WINTER PASS (608-703) - Ice + snow, 96 segments = 1920m ===
      { segments: 14, turnRate: 0 }, // Winter approach
      { segments: 10, turnRate: 0.065 }, // Icy right
      { segments: 10, turnRate: 0 }, // Snow straight
      { segments: 8, turnRate: -0.07 }, // Slippery left
      { segments: 12, turnRate: 0 }, // Long snow section
      { segments: 10, turnRate: 0.06 }, // Technical right
      { segments: 10, turnRate: 0 }, // Link
      { segments: 8, turnRate: -0.065 }, // Final left
      { segments: 14, turnRate: 0 }, // Grand finale straight to finish

      // Extra scenery beyond finish (for +20 runoff rendering)
      { segments: 30, turnRate: 0 }, // Post-finish straight
      { segments: 10, turnRate: 0.025 }, // Gentle curve
    ];

    // First, build the road path
    let segmentIndex = 0;
    courseLayout.forEach((section) => {
      for (let i = 0; i < section.segments; i++) {
        // Calculate center position for this segment
        const centerX =
          currentX + (segmentLength / 2) * Math.sin(currentHeading);
        const centerZ =
          currentZ + (segmentLength / 2) * Math.cos(currentHeading);

        // Road height comes from the leg's terrain profile
        const elevation = Terrain.elevation(
          this.terrain,
          segmentIndex,
          this.startSegment,
          this.endSegment,
        );

        // Store path point with elevation
        this.roadPath.push({
          x: centerX,
          z: centerZ,
          y: elevation,
          heading: currentHeading,
        });

        // Update position for next segment
        currentX += segmentLength * Math.sin(currentHeading);
        currentZ += segmentLength * Math.cos(currentHeading);

        // Update heading for next segment
        currentHeading += section.turnRate;
        segmentIndex++;
      }
    });

    // Create continuous road surface
    this.createContinuousRoad(roadMaterial);

    console.log("Course created with", this.roadPath.length, "segments");
    console.log("Start position:", this.roadPath[0]);
  }

  createContinuousRoad(roadMaterial) {
    const roadWidth = this.roadWidth; // Use instance road width (varies by leg difficulty)
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const uvs = [];

    // Only create geometry for the active segment range (lazy generation)
    // Extend by 20 segments to match decorative elements (trees, markings)
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    console.log(
      `Creating road geometry for segments ${startIdx} to ${endIdx} (${endIdx - startIdx + 1} segments)`,
    );

    // Create vertices for continuous road surface (only for active range)
    for (let i = startIdx; i <= endIdx; i++) {
      const point = this.roadPath[i];
      const nextPoint =
        i < this.roadPath.length - 1 ? this.roadPath[i + 1] : point;

      // Smoothly interpolate elevation between points
      const y = point.y;
      const nextY = nextPoint.y;

      // Calculate perpendicular to road direction
      const perpX = (Math.cos(point.heading) * roadWidth) / 2;
      const perpZ = (-Math.sin(point.heading) * roadWidth) / 2;

      // Add vertices for left and right edge of road
      vertices.push(
        point.x - perpX,
        y,
        point.z - perpZ, // Left edge
        point.x + perpX,
        y,
        point.z + perpZ, // Right edge
      );

      // Add UV coordinates (use relative indexing so each leg starts at UV.v = 0)
      uvs.push(0, (i - startIdx) * 0.1, 1, (i - startIdx) * 0.1);
    }

    // Create triangles connecting the vertices (optimized indexing)
    const segmentCount = endIdx - startIdx;
    for (let i = 0; i < segmentCount; i++) {
      const baseIndex = i * 2;
      // Two triangles per road segment - counter-clockwise winding
      indices.push(
        baseIndex,
        baseIndex + 2,
        baseIndex + 1,
        baseIndex + 1,
        baseIndex + 2,
        baseIndex + 3,
      );
    }

    // Set geometry attributes
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // Create the road mesh
    const roadMesh = new THREE.Mesh(geometry, roadMaterial);
    roadMesh.receiveShadow = true;
    // A flat ribbon has nothing to shadow, and casting made it shadow itself
    roadMesh.castShadow = false;
    roadMesh.userData.part = "ground";
    this.scene.add(roadMesh);

    console.log(
      "Created continuous road with",
      vertices.length / 3,
      "vertices",
    );
  }

  addRockFormations() {
    // Create rock materials with smooth weathered appearance matching cliffs.
    // Wider tonal spread (cool greys, warm browns, slate blues) plus varied
    // roughness/envMapIntensity so adjacent boulders catch light differently.
    const rockMaterialParams = [
      { color: 0x7a756c, roughness: 0.95, envMapIntensity: 0.15 },
      { color: 0x86807a, roughness: 0.92, envMapIntensity: 0.2 },
      { color: 0x8d8a90, roughness: 0.88, envMapIntensity: 0.3 }, // Slate blue-grey
      { color: 0x948e84, roughness: 0.92, envMapIntensity: 0.2 },
      { color: 0xa39d96, roughness: 0.85, envMapIntensity: 0.35 }, // Lighter weathered face
      { color: 0x7d6a55, roughness: 0.94, envMapIntensity: 0.15 },
      { color: 0x8c7860, roughness: 0.9, envMapIntensity: 0.25 },
      { color: 0x9a8468, roughness: 0.88, envMapIntensity: 0.25 }, // Iron-stained brown
      { color: 0xa69478, roughness: 0.86, envMapIntensity: 0.3 },
      { color: 0xb3a58a, roughness: 0.9, envMapIntensity: 0.25 }, // Sandy granite
    ];
    const rockMaterials = rockMaterialParams.map(
      (params) =>
        new THREE.MeshStandardMaterial({
          color: params.color,
          roughness: params.roughness,
          metalness: 0.0,
          envMapIntensity: params.envMapIntensity,
          flatShading: true,
        }),
    );

    // NOTE: Most rock formations are now handled by the faceted cliff walls
    // Only adding minimal standalone rocks to avoid floating objects

    // Occasional large rocks near the cliff base (only in active segment range)
    // Extend by 20 segments to match road geometry
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    for (let index = startIdx; index <= endIdx; index++) {
      const point = this.roadPath[index];
      if (index % 15 === 0 && !this.inSetPiece(index)) {
        // Much less frequent
        // Rocks on the mountain side (the left, unless the left is the drop) - properly grounded
        const side = Terrain.clutterSignAt(this.terrain, index);
        const cliffX =
          point.x + side * (18 + this.rand() * 8) * Math.cos(point.heading);
        const cliffZ =
          point.z - side * (18 + this.rand() * 8) * Math.sin(point.heading);
        // Rest the rock cluster on the mountain face at this lateral offset
        // (the old point.y - 1 buried it inside the wall, or left it floating
        // when the wall dipped). Group center at ground = roughly half embedded.
        const cliffY = this.groundYAt(cliffX, cliffZ);

        // Create irregular rock shape using multiple merged geometries
        const rockGroup = new THREE.Group();

        // Main rock body - smooth with natural angular variation
        const size = 2 + this.rand() * 2;
        const mainRockGeometry = this.displaceVertices(
          new THREE.IcosahedronGeometry(size, 4),
          size * 0.3,
        );
        const mainRock = new THREE.Mesh(
          mainRockGeometry,
          rockMaterials[Math.floor(this.rand() * rockMaterials.length)],
        );
        mainRock.position.set(0, 0, 0);
        mainRock.rotation.set(
          this.rand() * Math.PI,
          this.rand() * Math.PI,
          this.rand() * Math.PI,
        );
        mainRock.scale.set(
          1 + this.rand() * 0.5,
          0.7 + this.rand() * 0.6,
          1 + this.rand() * 0.5,
        );
        mainRock.castShadow = true;
        mainRock.receiveShadow = true;
        rockGroup.add(mainRock);

        // Additional rock chunks for detail - smooth spheres with irregular scaling
        for (let j = 0; j < 2 + Math.floor(this.rand() * 2); j++) {
          const chunkSize = 1 + this.rand() * 2;
          const chunkGeometry = this.displaceVertices(
            new THREE.IcosahedronGeometry(chunkSize, 3),
            chunkSize * 0.35,
          );
          const chunk = new THREE.Mesh(
            chunkGeometry,
            rockMaterials[Math.floor(this.rand() * rockMaterials.length)],
          );
          chunk.position.set(
            (this.rand() - 0.5) * 4,
            (this.rand() - 0.5) * 3,
            (this.rand() - 0.5) * 4,
          );
          chunk.rotation.set(
            this.rand() * Math.PI,
            this.rand() * Math.PI,
            this.rand() * Math.PI,
          );
          chunk.scale.set(
            1 + this.rand() * 0.4,
            0.6 + this.rand() * 0.5,
            1 + this.rand() * 0.4,
          );
          chunk.castShadow = true;
          chunk.receiveShadow = true;
          rockGroup.add(chunk);
        }

        rockGroup.position.set(cliffX, cliffY, cliffZ);
        this.scene.add(rockGroup);
        this.registerGrounded(rockGroup, `cliff rock cluster (segment ${index})`);
        if (this.solidClutter) {
          this.boulders.push({
            position: new THREE.Vector3(cliffX, cliffY, cliffZ),
            radius: size * 1.2,
            solid: true,
            height: size * 1.2,
            label: "rock",
          });
        }
      }
    }

    // Rock face walls removed - now handled by faceted cliff walls in createRoadWalls()
  }

  createRoadWalls() {
    // Rock materials for boulders - very dark, no green
    const rockMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0x707070,
        roughness: 0.98,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x838383,
        roughness: 0.97,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x959595,
        roughness: 0.96,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xa8a8a8,
        roughness: 0.98,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xbababa,
        roughness: 0.97,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x8f765d,
        roughness: 0.98,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xa28c70,
        roughness: 0.97,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xb49b7c,
        roughness: 0.96,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xc7ae89,
        roughness: 0.98,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xd9c195,
        roughness: 0.97,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xcdcdcd,
        roughness: 0.96,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xe0e0e0,
        roughness: 0.97,
        metalness: 0.0,
      }),
    ];

    // Create single wide ground strip that spans the full road width
    const createFullWidthStrip = () => {
      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      const indices = [];

      // Asymmetric edges to match asymmetric cliff walls, with slight shift
      const shiftRight = -0.5; // Shift entire strip left by 0.5m
      const leftEdge = -(this.roadWidth / 2 + 1.6) + shiftRight;
      // (overlaps the top row of the drop-off face at roadWidth / 2 + 2;
      // stopping short of it left a slot with the lake showing through)
      const rightEdge = this.roadWidth / 2 + 2.4;
      // The strip runs under the road too (it closes the gap to both rock
      // faces), so push it back in depth: 0.1 below the tarmac is not
      // enough to stop it flickering through at a distance

      // Only create geometry for the active segment range (lazy generation)
      const startIdx = Math.max(0, this.startSegment);
      const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

      for (let i = startIdx; i < endIdx; i++) {
        const point = this.roadPath[i];
        const nextPoint = this.roadPath[i + 1];

        // Calculate perpendicular vectors for left and right edges
        const perpX1 = Math.cos(point.heading) * leftEdge;
        const perpZ1 = -Math.sin(point.heading) * leftEdge;
        const perpX2 = Math.cos(point.heading) * rightEdge;
        const perpZ2 = -Math.sin(point.heading) * rightEdge;

        const nextPerpX1 = Math.cos(nextPoint.heading) * leftEdge;
        const nextPerpZ1 = -Math.sin(nextPoint.heading) * leftEdge;
        const nextPerpX2 = Math.cos(nextPoint.heading) * rightEdge;
        const nextPerpZ2 = -Math.sin(nextPoint.heading) * rightEdge;

        const baseIndex = (i - startIdx) * 4;
        vertices.push(
          point.x + perpX1,
          point.y - 0.1,
          point.z + perpZ1,
          point.x + perpX2,
          point.y - 0.1,
          point.z + perpZ2,
          nextPoint.x + nextPerpX1,
          nextPoint.y - 0.1,
          nextPoint.z + nextPerpZ1,
          nextPoint.x + nextPerpX2,
          nextPoint.y - 0.1,
          nextPoint.z + nextPerpZ2,
        );


        indices.push(
          baseIndex,
          baseIndex + 1,
          baseIndex + 2,
          baseIndex + 1,
          baseIndex + 3,
          baseIndex + 2,
        );
      }

      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      // Plain colour (no vertex colours) so the per-leg and weather verge
      // tints in updateTerrainColors() show
      const material = new THREE.MeshStandardMaterial({
        color: this.vergeBaseColor,
        roughness: 0.95,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 8,
        side: THREE.DoubleSide // Make sure both sides render
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.userData.type = "terrain";
      mesh.userData.part = "ground";
      return mesh;
    };

    // Add single full-width ground strip
    const groundStrip = createFullWidthStrip();
    this.scene.add(groundStrip);

    // Left face first, then right: one group per side, ribbon then dressing
    const first = Math.max(0, this.startSegment);
    const last = Math.min(this.roadPath.length - 1, this.endSegment + 20);
    for (const [sign, side] of [[-1, this.terrain.left], [1, this.terrain.right]]) {
      const group = new THREE.Group();
      group.add(this.buildTerrainRibbon(sign, side));
      // Only the segments whose side is a rock face are dressed: a beach that
      // follows a sea cliff has no face to hang cracks and vines on
      const faces = Terrain.faceRange(this.terrain, sign, first, last);
      if (faces) this.decorateRockFace(sign, group, rockMaterials, faces);

      // Everything else a face builder added to its group dresses the face
      group.children.forEach((child) => {
        if (!child.userData.part) child.userData.part = "decals";
      });
      this.scene.add(group);
    }
  }

  // Rendered ground ribbon beside the road: one vertex-coloured mesh whose
  // cross-section comes from Terrain.row. Draws one this.rand() per vertex,
  // columns in order, which keeps the seeded stream identical to the old
  // hand-written cliff.
  buildTerrainRibbon(sign, side) {
    // Ground with no rock face (meadow, forest floor, sand, snow) is coloured
    // vertices on a plain material; a rock face carries the rock texture. A
    // ribbon that is a face for some of its length (a sea cliff, then a beach)
    // keeps the rock material and colours its ground columns by vertex.
    const isGround = Terrain.sidesOf(this.terrain, sign).every((candidate) => candidate.face === null);
    const groundColors = new Map();
    const groundColor = (columnSide) => {
      if (!groundColors.has(columnSide)) {
        groundColors.set(
          columnSide,
          new THREE.Color(columnSide.tint ?? this.config.look.grassColor).multiplyScalar(columnSide.shade ?? 1),
        );
      }
      return groundColors.get(columnSide);
    };

    // Rock material with smooth shading for realistic weathered appearance
    const cliffMaterial = isGround
      ? new THREE.MeshStandardMaterial({
          color: 0xffffff,
          vertexColors: true,
          roughness: 0.95,
          metalness: 0.0,
          side: THREE.DoubleSide,
          envMapIntensity: 0.3,
        })
      : new THREE.MeshStandardMaterial({
          map: this.createRockTexture(),
          color: 0xffffff,
          vertexColors: true,
          roughness: 0.92,
          metalness: 0.0,
          // Hard facets read as chiselled rock; smooth normals over this
          // displacement shaded like melted wax
          flatShading: true,
          side: THREE.DoubleSide,
          envMapIntensity: 0.6,
        });

    // Create main cliff face geometry
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const colors = [];
    const uvs = [];


    // Higher resolution for detailed faceting
    const horizontalSubdivisions = Terrain.COLUMNS_PER_SEGMENT;
    const verticalSegments = Terrain.ROWS;

    // Only create geometry for the active segment range (lazy generation)
    // Extend by 20 segments to match road geometry and decorative elements
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    const rowContext = {
      halfRoad: this.roadWidth / 2,
      roadY: 0,
      column: 0,
      index: 0,
      s: 0,
      pathLength: this.roadPath.length,
    };
    const vertex = {};
    // The row below in the same column, for the slope of ground that turns to rock
    const previousRow = { d: 0, y: 0 };
    const scree = new THREE.Color();
    const screeRock = new THREE.Color(0x76726a);

    // Create dense vertex grid with multi-layer displacement
    for (let i = startIdx; i <= endIdx; i++) {
      const point = this.roadPath[i];
      const nextPoint =
        i < this.roadPath.length - 1 ? this.roadPath[i + 1] : point;
      const roadY = point.y || 0;

      // Create horizontal subdivisions between road points
      for (let h = 0; h < horizontalSubdivisions; h++) {
        const hProgress = h / horizontalSubdivisions;

        // Interpolate position along road
        const interpX = point.x + (nextPoint.x - point.x) * hProgress;
        const interpZ = point.z + (nextPoint.z - point.z) * hProgress;
        const interpY = roadY + ((nextPoint.y || 0) - roadY) * hProgress;
        const interpHeading =
          point.heading + (nextPoint.heading - point.heading) * hProgress;

        // Use 0-based index for vertex calculations
        const idx = (i - startIdx) * horizontalSubdivisions + h;
        rowContext.roadY = interpY;
        rowContext.column = idx;
        rowContext.index = i;
        rowContext.s = i + hProgress;

        // Create vertical segments
        for (let j = 0; j <= verticalSegments; j++) {
          const verticalProgress = j / verticalSegments;
          Terrain.rowAt(this.terrain, sign, j, rowContext, vertex);
          const currentHeight = vertex.rise;
          const facetedDisplacement = vertex.displacement;

          // Calculate position
          const perpX = Math.cos(interpHeading) * vertex.d * sign;
          const perpZ = -Math.sin(interpHeading) * vertex.d * sign;

          vertices.push(interpX + perpX, vertex.y, interpZ + perpZ);

          // More realistic mountain rock colors with grey variations
          const greyBase = 0.6 + this.rand() * 0.25; // 0.6 to 0.85

          const columnSide = Terrain.sideAt(this.terrain, sign, i);
          if (columnSide.face === null && !columnSide.rock) {
            // Patchy ground: one seeded tint per vertex, from the same draw as rock grey
            const tint = 0.85 + ((greyBase - 0.6) / 0.25) * 0.3;
            let ground = groundColor(columnSide);
            // Ground steeper than the side's rock slope shows bare rock
            if (columnSide.rockSlope !== undefined && j > 0) {
              const slope = Math.abs(vertex.y - previousRow.y) / Math.max(0.001, vertex.d - previousRow.d);
              const bare = Math.min(1, Math.max(0, (slope - columnSide.rockSlope) / 0.3));
              if (bare > 0) ground = scree.copy(ground).lerp(screeRock, bare * 0.85);
            }
            previousRow.d = vertex.d;
            previousRow.y = vertex.y;
            colors.push(ground.r * tint, ground.g * tint, ground.b * tint);
            uvs.push(0, 0);
            continue;
          }

          // Add geological stratification layers
          const stratumHeight = 8; // Height of each stratum in units
          const stratumIndex = Math.floor(vertex.y / stratumHeight);
          const stratumVariation = (stratumIndex % 3) * 0.08; // Alternate between 3 rock layer types

          // Add variation based on height - darker at base, lighter up high
          const heightVariation = verticalProgress * 0.15;

          // Add variation based on displacement - deeper crevices are darker
          const depthVariation = Math.abs(facetedDisplacement) * 0.02;

          // Occasional brown/tan streaks for mineral deposits
          const mineralStreak =
            Math.sin(idx * 0.3 + j * 0.4) > 0.7 ? 0.08 : 0;

          // Weather staining - darker patches
          const weathering = Math.cos(idx * 0.5 - j * 0.3) > 0.6 ? -0.1 : 0;

          // Water staining - vertical dark streaks
          const waterStainX = idx * 0.2;
          const waterStain =
            Math.sin(waterStainX) > 0.7 && verticalProgress < 0.8 ? -0.15 : 0;

          // Regular rock colors
          const finalGrey = Math.max(
            0.38,
            Math.min(
              1.0,
              greyBase +
                heightVariation -
                depthVariation +
                weathering +
                stratumVariation +
                waterStain,
            ),
          );

          // Add green tinting for horizontal facets (where displacement is higher)
          const horizontalFactor = Math.min(
            1,
            Math.abs(facetedDisplacement) / 8,
          );
          const greenTintStrength = horizontalFactor * 0.08;

          // Slight color tints for realism
          // Warm sandstone cast
          const redTint = finalGrey + 0.03 + mineralStreak - greenTintStrength * 0.2;
          const greenTint = finalGrey - 0.02 + greenTintStrength;
          const blueTint = finalGrey - 0.07 - greenTintStrength * 0.15;

          colors.push(redTint, greenTint, blueTint);

          // UV coordinates
          // Roughly square texels: columns are 5 units apart
          uvs.push(idx * 0.3125, Math.abs(currentHeight) / 16);
        }
      }
    }

    // Create triangles for the faceted wall
    const vertsPerColumn = verticalSegments + 1;
    const columnsPerSegment = horizontalSubdivisions;
    const segmentCount = endIdx - startIdx + 1;
    const totalColumns = segmentCount * columnsPerSegment;

    for (let col = 0; col < totalColumns - 1; col++) {
      for (let row = 0; row < verticalSegments; row++) {
        const bl = col * vertsPerColumn + row; // bottom left
        const br = (col + 1) * vertsPerColumn + row; // bottom right
        const tl = bl + 1; // top left
        const tr = br + 1; // top right

        // Create two triangles with varied winding for natural facets
        if ((col + row) % 2 === 0) {
          indices.push(bl, br, tl);
          indices.push(br, tr, tl);
        } else {
          indices.push(bl, tr, tl);
          indices.push(bl, br, tr);
        }
      }
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    // Don't compute vertex normals - let flat shading handle it
    geometry.computeVertexNormals();

    // Main faceted cliff face
    const mainCliff = new THREE.Mesh(geometry, cliffMaterial);
    mainCliff.receiveShadow = true;
    mainCliff.castShadow = true;
    mainCliff.userData.part = "ground";
    return mainCliff;
  }

  // World position of the point a fraction v of the way up the drawn face
  // (0 is the foot of the face, 1 the top) beside road point i. Decals are
  // placed only through this, so they sit on whatever the profile draws.
  decalPoint(sign, side, i, v) {
    const point = this.roadPath[i];
    const ctx = {
      halfRoad: this.roadWidth / 2,
      roadY: point.y || 0,
      column: (i - Math.max(0, this.startSegment)) * Terrain.COLUMNS_PER_SEGMENT,
      index: i,
      pathLength: this.roadPath.length,
    };
    const face = Terrain.facePoint(side, v, ctx, {});
    return {
      x: point.x + Math.cos(point.heading) * face.d * sign,
      y: face.y,
      z: point.z - Math.sin(point.heading) * face.d * sign,
    };
  }

  // Rock dressing of one face: embedded rocks, road debris, cracks, seepage,
  // vines and snow. Rocks sit on the terrain model; the rest hang off the
  // face by design.
  decorateRockFace(sign, group, rockMaterials, faces) {
    const startIdx = faces.from;
    const endIdx = faces.to;
    // The face in force at a segment: a leg can change from a wall to a drop
    // on one side (the gorge's cliff roads), and a span may have no face
    const faceAt = (i) => Terrain.sideAt(this.terrain, sign, i);

    // Add MANY more boulders along the cliff base (only in active segment range)
    for (let i = startIdx; i <= endIdx; i += 3) {
      // A tunnel or village has no rock face to dress
      if (this.inSetPiece(i)) continue;
      const side = faceAt(i);
      if (!side.face) continue;
      const isDropOff = side.face.kind === 'drop';
      // Much denser spacing
      const point = this.roadPath[i];

      // Add 2-3 rocks per segment
      const numRocks = 2 + Math.floor(this.rand() * 2);

      for (let r = 0; r < numRocks; r++) {
        if (this.rand() > 0.2) {
          // 80% chance for variety

          // Height position on cliff (0 = base, 1 = top) - keep rocks very
          // low; only drives the lateral spread, the actual elevation comes
          // from the terrain model below
          const heightRatio = this.rand() * 0.25; // Maximum 25% up the cliff

          // Hug the wall base / road edge so the rock field stays dense and
          // visible, with size capped by proximity below
          let distance = this.roadWidth / 2 + 0.5;
          // The face decides how far its rocks spread outward per unit of height
          distance += heightRatio * side.face.rockSpread;

          // Random outward variation - farther rocks may be larger
          distance += this.rand() * 3;

          // Cap size so the rock's scaled radius (max scale 1.5) never
          // reaches past the road edge: rocks at the lane edge stay small
          // (fallen-debris look), rocks farther out / up the cliff get big
          const clearance = distance - this.roadWidth / 2 + 0.4;
          const maxSize = Math.max(0.4, clearance / 1.5);
          const rockSize = Math.min(0.8 + this.rand() * 2.5, maxSize);
          const rockGeometry = this.displaceVertices(
            new THREE.IcosahedronGeometry(rockSize, 3),
            rockSize * 0.3,
          );
          const rock = new THREE.Mesh(
            rockGeometry,
            rockMaterials[Math.floor(this.rand() * rockMaterials.length)],
          );

          const perpX = Math.cos(point.heading) * distance * sign;
          const perpZ = -Math.sin(point.heading) * distance * sign;

          // Rest the rock ON the cliff face at this lateral offset: the
          // terrain model maps the lateral distance to the face elevation
          // (rising mountain wall on the left, dropping cliff on the
          // right), so the rock center sits on the face (~half embedded).
          // The old heightRatio-based y used a slope that didn't match the
          // rendered face, leaving rocks hovering off the wall or buried.
          const rockWorldX = point.x + perpX;
          const rockWorldZ = point.z + perpZ;
          const rockY = this.groundYAt(rockWorldX, rockWorldZ);
          rock.position.set(rockWorldX, rockY, rockWorldZ);

          // Random rotation for natural look
          rock.rotation.set(
            this.rand() * Math.PI * 2,
            this.rand() * Math.PI * 2,
            this.rand() * Math.PI * 2,
          );

          // Varied scaling for natural appearance
          rock.scale.set(
            1.0 + this.rand() * 0.5,
            0.7 + this.rand() * 0.4,
            1.0 + this.rand() * 0.5,
          );

          rock.castShadow = true;
          rock.receiveShadow = true;
          group.add(rock);
          this.registerGrounded(rock, `embedded cliff rock (segment ${i}, side ${sign})`);
        } // Close the if statement from line 700
      } // Close the for loop from line 699

      // Small debris rocks that have fallen off the cliff onto the road
      // edge - deliberately small (0.2-0.45m) and registered as collidable
      // boulders so riding into one crashes the bike
      if (!isDropOff && this.rand() < 0.15) {
        const debrisSize = 0.2 + this.rand() * 0.25;
        const debrisGeometry = this.displaceVertices(
          new THREE.IcosahedronGeometry(debrisSize, 2),
          debrisSize * 0.25,
        );
        const debris = new THREE.Mesh(
          debrisGeometry,
          rockMaterials[Math.floor(this.rand() * rockMaterials.length)],
        );

        // Scatter onto the cliff-side portion of the road, from near the
        // wall to roughly the middle of the left lane
        const debrisDistance =
          (this.roadWidth / 2 - 1 - this.rand() * 4) * sign;
        const debrisX = point.x + Math.cos(point.heading) * debrisDistance;
        const debrisZ = point.z - Math.sin(point.heading) * debrisDistance;
        const debrisY = (point.y || 0) + debrisSize * 0.4; // Slightly embedded in the road

        debris.position.set(debrisX, debrisY, debrisZ);
        debris.rotation.set(
          this.rand() * Math.PI * 2,
          this.rand() * Math.PI * 2,
          this.rand() * Math.PI * 2,
        );
        debris.castShadow = true;
        debris.receiveShadow = true;
        group.add(debris);
        this.registerGrounded(debris, `road debris rock (segment ${i})`);

        this.boulders.push({
          position: new THREE.Vector3(debrisX, debrisY, debrisZ),
          radius: debrisSize,
        });
      }
    }

    // Add crack systems to cliff face
    const crackMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    // Create major vertical cracks (only in active segment range)
    for (let i = startIdx; i <= endIdx; i += 25) {
      if (this.inSetPiece(i)) continue;
      const side = faceAt(i);
      if (!side.face) continue;
      if (this.rand() > 0.5) {
        const point = this.roadPath[i];

        // Create crack geometry as thin box
        const crackHeight = Math.abs(side.face.height) * (0.4 + this.rand() * 0.4);
        const crackWidth = 0.1 + this.rand() * 0.15;
        const crackDepth = 0.5 + this.rand() * 0.5;

        const crackGeometry = new THREE.BoxGeometry(
          crackWidth,
          crackHeight,
          crackDepth,
        );
        const crack = new THREE.Mesh(crackGeometry, crackMaterial);

        // Centre the crack on the drawn face, up to 30% of the way along it.
        // The first draw is discarded: it used to set a lateral offset the
        // face now answers, and dropping it would shift the seeded stream.
        this.rand();
        const onFace = this.decalPoint(sign, side, i, this.rand() * 0.3);
        crack.position.set(onFace.x, onFace.y, onFace.z);

        // Rotate crack to align with cliff face
        crack.rotation.y =
          point.heading + (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
        crack.rotation.z = (this.rand() - 0.5) * 0.3; // Slight tilt

        crack.castShadow = true;
        crack.receiveShadow = true;
        crack.userData.allowFloating = true; // Wall decal embedded in the cliff face
        crack.userData.decal = "crack";
        group.add(crack);

        // Add smaller branching cracks
        const numBranches = 1 + Math.floor(this.rand() * 2);
        for (let b = 0; b < numBranches; b++) {
          const branchHeight = crackHeight * (0.3 + this.rand() * 0.3);
          const branchGeometry = new THREE.BoxGeometry(
            crackWidth * 0.6,
            branchHeight,
            crackDepth * 0.7,
          );
          const branch = new THREE.Mesh(branchGeometry, crackMaterial);

          // Position relative to main crack
          branch.position.copy(crack.position);
          branch.position.x += (this.rand() - 0.5) * 2;
          branch.position.y += (this.rand() - 0.5) * crackHeight * 0.5;
          branch.position.z += (this.rand() - 0.5) * 2;

          branch.rotation.y = crack.rotation.y + (this.rand() - 0.5) * 0.5;
          branch.rotation.z = (this.rand() - 0.5) * 0.4;

          branch.castShadow = true;
          branch.receiveShadow = true;
          branch.userData.allowFloating = true; // Wall decal embedded in the cliff face
          branch.userData.decal = "branch";
          group.add(branch);
        }
      }
    }

    // Base boulders already handled above - no need for dense boulder field

    // Add vegetation patches on the cliff face - muted colors
    const vegetationMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a4a32, // Darker, more muted green
      roughness: 0.9,
      metalness: 0.0,
    });

    const mossMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5242, // Grey-green moss color
      roughness: 0.95,
      metalness: 0.0,
    });

    // Add water seepage patches - dark wet areas on cliff
    const seepageMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.3, // Wet surfaces are less rough
      metalness: 0.1, // Slight metalness for wet look
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });

    // Create water seepage patches (only in active segment range)
    for (let i = startIdx; i <= endIdx; i += 30) {
      if (this.inSetPiece(i)) continue;
      const side = faceAt(i);
      if (!side.face) continue;
      if (this.rand() > 0.5) {
        const point = this.roadPath[i];

        // Create irregular seepage patch
        const seepageGeometry = new THREE.PlaneGeometry(
          1.5 + this.rand() * 2,
          3 + this.rand() * 4,
          4,
          6,
        );

        // Distort vertices for irregular shape
        const positions = seepageGeometry.attributes.position;
        for (let v = 0; v < positions.count; v++) {
          const x = positions.getX(v);
          const y = positions.getY(v);
          positions.setZ(v, (this.rand() - 0.5) * 0.2);
          positions.setX(v, x * (0.8 + this.rand() * 0.4));
        }

        const seepage = new THREE.Mesh(seepageGeometry, seepageMaterial);

        // Centre the patch on the drawn face, 20-70% of the way along it.
        // The second draw is discarded (see the cracks above).
        const onFace = this.decalPoint(sign, side, i, 0.2 + this.rand() * 0.5);
        this.rand();
        seepage.position.set(onFace.x, onFace.y, onFace.z);

        seepage.rotation.y =
          point.heading + (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
        seepage.receiveShadow = true;
        seepage.userData.allowFloating = true; // Wall decal on the cliff face
        seepage.userData.decal = "seepage";
        group.add(seepage);
      }
    }

    // Add hanging vines and climbing plants
    const vineMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a3d2a,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    // Create hanging vines from cliff ledges (only in active segment range)
    for (let i = startIdx; i <= endIdx; i += 20) {
      if (this.inSetPiece(i)) continue;
      const side = faceAt(i);
      if (!side.face) continue;
      if (this.rand() > 0.6) {
        const point = this.roadPath[i];

        // Create vine as elongated curved mesh
        const vineLength = 3 + this.rand() * 5;
        const vineGeometry = new THREE.PlaneGeometry(
          0.3 + this.rand() * 0.2,
          vineLength,
          1,
          8,
        );

        // Modify vertices to create curved hanging effect
        const positions = vineGeometry.attributes.position;
        for (let v = 0; v < positions.count; v++) {
          const y = positions.getY(v);
          const curve =
            Math.sin(((y + vineLength / 2) / vineLength) * Math.PI) * 0.5;
          positions.setZ(v, curve);
        }

        const vine = new THREE.Mesh(vineGeometry, vineMaterial);

        // Centre the vine on the drawn face, 30-70% of the way along it.
        // The second draw is discarded (see the cracks above).
        const onFace = this.decalPoint(sign, side, i, 0.3 + this.rand() * 0.4);
        this.rand();
        vine.position.set(onFace.x, onFace.y, onFace.z);

        vine.rotation.y =
          point.heading + (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
        vine.rotation.x = (this.rand() - 0.5) * 0.2;

        vine.castShadow = true;
        vine.receiveShadow = true;
        vine.userData.allowFloating = true; // Clings to the cliff face by design
        vine.userData.decal = "vine";
        group.add(vine);
      }
    }

    // Add snow patches on the upper part of a face that rises over 20 m
    const snowMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      roughness: 0.7,
      metalness: 0.0,
    });

    for (let i = startIdx; i <= endIdx; i += 8) {
      if (this.inSetPiece(i)) continue;
      const side = faceAt(i);
      if (!side.face || side.face.height <= 20) continue;
      if (this.rand() > 0.4 && side.face.height > 30 && side.face.snow !== false) {
        const point = this.roadPath[i];
        const snowGeometry = new THREE.PlaneGeometry(
          3 + this.rand() * 4,
          2 + this.rand() * 3,
        );
        const snow = new THREE.Mesh(snowGeometry, snowMaterial);

        // Pin the patch to the upper 30% of the drawn face
        const onFace = this.decalPoint(sign, side, i, 0.7 + this.rand() * 0.3);
        snow.position.set(onFace.x, onFace.y, onFace.z);

        // Rotate to face outward and add some randomness
        snow.rotation.y =
          point.heading + (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
        snow.rotation.x = (this.rand() - 0.5) * 0.3;
        snow.rotation.z = (this.rand() - 0.5) * 0.3;

        snow.receiveShadow = true;
        snow.userData.allowFloating = true; // Wall decal on the cliff face
        snow.userData.decal = "snow";
        group.add(snow);
      }
    }
  }

  createLayeredMountains() {
    // Create multiple layers of mountains for depth

    // Each leg lists the layers it wants, in build order
    const layers = {
      distant: () => this.createDistantMountainRange(), // far background
      mid: () => this.createMidRangeMountains(),
      near: () => this.createNearHills(), // more detail
      majestic: () => this.createMajesticPeak(), // the dominant mountain
      endCourse: () => this.createEndCourseMountains(), // dramatic end mountains
      approach: () => this.createApproachRange(), // the next leg's mountains, ahead
    };
    this.config.dressing.backdrop.forEach((key) => layers[key]());
  }

  // The mountains the road runs into after this leg: peaks either side of the
  // next leg's road, set back from it, the far (left) side further back, and a
  // few at the head of this leg's valley. At the start of the leg they are
  // over a kilometre off and faded out; they come in as the rider nears. They
  // stand on a base far below the road, behind the valley sides. One merged
  // mesh, rock under snow, never culled.
  createApproachRange() {
    const path = this.roadPath;
    const first = Math.max(0, this.startSegment);
    const end = Math.min(this.endSegment, path.length - 1);
    const last = Math.min(path.length - 1, end + 90);
    let lowest = Infinity;
    for (let i = first; i <= end; i++) lowest = Math.min(lowest, path[i].y);
    const baseY = lowest - 80;
    // Clear of the road from the start of this leg to well into the next (the
    // head of the valley only of the road this leg draws: the next leg turns
    // away from it)
    const clear = (x, z, radius, to = last) => {
      for (let i = first; i <= to; i++) {
        if (Math.hypot(x - path[i].x, z - path[i].z) < radius + 120) return false;
      }
      return true;
    };
    const positions = [];
    const colors = [];
    const indices = [];
    // Where each peak stands, for the fade and for tests
    this.approachPeaks = [];
    // A peak `lateral` metres out (positive right) and `ahead` metres along
    // from a road point, `height` over the leg's lowest road
    const place = (anchor, lateral, ahead, height, to, girth = 0.9) => {
      const radius = height * (girth + this.rand() * 0.5);
      const twist = this.rand() * Math.PI * 2;
      const seed = this.rand() * 100;
      const out = lateral + Math.sign(lateral) * radius * 0.5;
      const x = anchor.x + Math.cos(anchor.heading) * out + Math.sin(anchor.heading) * ahead;
      const z = anchor.z - Math.sin(anchor.heading) * out + Math.cos(anchor.heading) * ahead;
      if (!clear(x, z, radius, to)) return;
      this.approachPeaks.push({ x, z, apex: lowest + height, radius });
      this.addApproachPeak({ x, z, height: height - baseY + lowest, radius, twist, seed, baseY }, positions, colors, indices);
    };
    // Beside the next leg's road: the wall side (right) close, the lake side further off
    for (let a = end; a <= end + 84; a += 7) {
      const anchor = path[Math.min(a, path.length - 1)];
      for (const sign of [1, -1]) {
        const height = 230 + this.rand() * 270;
        const lateral = ((sign > 0 ? 300 : 520) + this.rand() * 360) * sign;
        place(anchor, lateral, (this.rand() - 0.5) * 200, height);
      }
    }
    // At the head of this leg's valley, straight on from its last stretch of
    // road, where the rider looks between the valley sides
    for (let n = 0; n < 6; n++) {
      const height = 300 + this.rand() * 220;
      const lateral = (this.rand() - 0.5) * 700;
      place(path[end], lateral, 750 + n * 110 + this.rand() * 80, height, Math.min(path.length - 1, end + 20), 0.6);
    }
    if (indices.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.3,
      side: THREE.DoubleSide,
      // Written to depth, so the peaks of the one mesh hide each other in
      // any draw order; the height fog reads depth only to 900 m, where the
      // range is already fading, and a peak faded out is discarded
      transparent: true,
    });
    // Fog alone turns a far peak into a flat silhouette in the fog colour, which
    // still stands out against the sky: fade the range out with distance
    // instead, gone by `far` and whole within `near`
    const fade = { near: 800, far: 1500 };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFade = { value: new THREE.Vector2(fade.near, fade.far) };
      shader.fragmentShader = `uniform vec2 uFade;\n${shader.fragmentShader}`.replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\n\tgl_FragColor.a *= 1.0 - smoothstep(uFade.x, uFade.y, length(vViewPosition));\n\tif (gl_FragColor.a < 0.01) discard;",
      );
    };
    material.customProgramCacheKey = () => "approach-range-fade";
    const range = new THREE.Mesh(geometry, material);
    range.name = "approach-range";
    range.userData.fade = fade;
    // Behind every other transparent thing: drawn first of them
    range.renderOrder = -1;
    range.userData.skipCulling = true;
    this.tagMeshes(range, "mountain");
    this.scene.add(range);
    this.registerGrounded(range, "approach range");
  }

  // One peak of the approach range: a cone with ridged, uneven flanks, rock
  // darkening toward the foot and snow over the top of the taller ones.
  // Colours are stored undecoded, as the other vertex-coloured peaks are.
  addApproachPeak({ x, z, height, radius, twist, seed, baseY }, positions, colors, indices) {
    const rings = 7;
    const around = 12;
    const offset = positions.length / 3;
    const snowLine = height > 380 ? 0.68 : height > 300 ? 0.8 : 2;
    for (let r = 0; r <= rings; r++) {
      const v = r / rings;
      for (let k = 0; k < around; k++) {
        const angle = (k / around) * Math.PI * 2 + twist;
        // Ridges run down the flanks; the foot spreads wide
        const ridge = 1 + 0.22 * Math.sin(angle * 3 + seed) + 0.12 * Math.sin(angle * 7 + seed * 1.7) * (1 - v);
        const spread = radius * (1 - v) * (1 + 0.35 * (1 - v) * (1 - v)) * ridge;
        const lift = v < 1 ? height * v * (1 + 0.06 * Math.sin(angle * 5 + seed + r)) : height;
        positions.push(x + Math.cos(angle) * spread, baseY + lift, z + Math.sin(angle) * spread);
        if (v >= snowLine - 0.04 * Math.sin(angle * 4 + seed)) {
          colors.push(0.9, 0.92, 0.95);
        } else {
          const rock = 0.3 + 0.22 * v;
          colors.push(rock * 1.05, rock, rock * 0.95);
        }
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let k = 0; k < around; k++) {
        const a = offset + r * around + k;
        const b = offset + r * around + ((k + 1) % around);
        const c = a + around;
        const d = b + around;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  createDistantMountainRange() {
    // Create far distant mountains with atmospheric perspective
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const colors = [];

    // Parameters for distant mountains
    const numPeaks = 8;
    const baseDistance = 5000; // MOVED: Much further away from road
    const maxHeight = 400;
    const width = 3000; // Wider to cover horizon

    // Create mountain silhouette. The silhouette base extends to -300 so it
    // reaches below the lake plane (y = -200) even for the offset/scaled
    // second range - a base at -80 left the whole range hovering above the
    // water line.
    const silhouetteBase = -300;
    const points = [];

    // Start from left edge
    points.push(new THREE.Vector3(-width / 2, silhouetteBase, baseDistance));

    // Generate smooth rolling mountain silhouette
    for (let i = 0; i <= numPeaks * 4; i++) {
      const x = -width / 2 + (width / (numPeaks * 4)) * i;
      // Use smoother sine waves for rolling hills
      const baseHeight = Math.sin(i * 0.15) * 120 + Math.cos(i * 0.08) * 80;
      const mediumWave = Math.sin(i * 0.25) * 50;
      const smallWave = Math.cos(i * 0.4) * 20;
      const peakHeight = Math.max(
        50,
        baseHeight + mediumWave + smallWave + maxHeight * 0.4,
      );
      const y = peakHeight;
      points.push(new THREE.Vector3(x, y, baseDistance));
    }

    // End at right edge
    points.push(new THREE.Vector3(width / 2, silhouetteBase, baseDistance));

    // Create triangulated mountain face
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Create two triangles for each segment (forming a quad to ground)
      const baseIndex = vertices.length / 3;

      // Add vertices
      vertices.push(p1.x, p1.y, p1.z); // Top left
      vertices.push(p2.x, p2.y, p2.z); // Top right
      vertices.push(p2.x, silhouetteBase, p2.z); // Bottom right
      vertices.push(p1.x, silhouetteBase, p1.z); // Bottom left

      // Add indices for two triangles
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
      indices.push(baseIndex, baseIndex + 2, baseIndex + 3);

      // Atmospheric perspective - darker blue-grey color
      const atmosphericColor = {
        r: 0.35 + this.rand() * 0.05,
        g: 0.4 + this.rand() * 0.05,
        b: 0.5 + this.rand() * 0.05,
      };

      // Add colors for all 4 vertices
      for (let j = 0; j < 4; j++) {
        colors.push(atmosphericColor.r, atmosphericColor.g, atmosphericColor.b);
      }
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
      fog: true,
    });

    const distantMountains = new THREE.Mesh(geometry, material);
    distantMountains.receiveShadow = true;
    this.scene.add(distantMountains);
    this.registerGrounded(distantMountains, "distant mountain range");

    // Add a second distant range slightly offset and behind
    const secondRangeGeometry = geometry.clone();
    const secondRangeMaterial = material.clone();
    const secondRange = new THREE.Mesh(
      secondRangeGeometry,
      secondRangeMaterial,
    );
    secondRange.position.set(-2000, 50, 6000); // MOVED: Far left and much further back
    secondRange.scale.set(0.8, 0.9, 1);
    this.scene.add(secondRange);
    this.registerGrounded(secondRange, "second distant mountain range");
  }

  createMidRangeMountains() {
    // Create mid-distance mountains with more detail
    const group = new THREE.Group();

    // Create several individual peaks - MOVED to avoid road overlap
    // Actual road bounds: X: 0-3622, Z: 0-2488
    // Placing peaks far left (X < -500) to guarantee clearance
    // Heights compensate for the peaks now being grounded at the lake plane
    // (y = -200) instead of floating at -50: each height grew by ~137 so the
    // apex stays at its original skyline elevation.
    const peaks = [
      { x: -900, z: 700, height: 385, width: 300 }, // Left back - MOVED from -600
      { x: -700, z: 1200, height: 340, width: 280 }, // Left-center back - MOVED from -200
      { x: -1000, z: 1800, height: 415, width: 350 }, // Left far - MOVED from 300
      { x: -600, z: 2200, height: 370, width: 290 }, // Left-back - MOVED from 800
      { x: -800, z: 2600, height: 395, width: 310 }, // Left end - MOVED from 1200
    ];

    peaks.forEach((peak) => {
      const mountain = this.createMountainPeak(
        peak.x,
        peak.z,
        peak.height,
        peak.width,
        0x505560, // Darker grey color
      );
      group.add(mountain);
    });

    this.tagMeshes(group, "mountain");
    this.scene.add(group);
    this.registerGrounded(group, "mid-range mountains");
  }

  createNearHills() {
    // Create near hills with vegetation and detail
    const group = new THREE.Group();

    // Only add the central mountain/island in the lake area
    // This creates a dramatic centerpiece visible from the mountain road
    const centralMountain = this.createLakeIslandMountain();
    group.add(centralMountain);

    this.tagMeshes(group, "mountain");
    this.scene.add(group);
    this.registerGrounded(group, "lake island mountain");
  }

  createLakeIslandMountain() {
    // Create a dramatic mountain rising from the lake in the center of the map
    const group = new THREE.Group();

    // Main mountain peak rising from the lake - smaller to avoid road.
    // Heights compensate for the peaks now being grounded at the lake plane
    // (y = -200) instead of floating at -50, keeping the apex elevations.
    const mainPeak = this.createMountainPeak(
      350, // Center of the map area
      100, // Slightly forward from true center
      320, // Grounded at the lake; apex stays at ~y=130
      250, // Smaller base
      0x3a4540, // Darker grey-green for contrast with lake
    );
    group.add(mainPeak);

    // Add a secondary smaller peak for visual interest
    const secondaryPeak = this.createMountainPeak(
      250, // Offset to the left
      -50, // Move further forward/left to avoid road
      265, // Grounded at the lake; apex stays at ~y=70
      150, // Smaller width
      0x424845, // Similar but slightly different color
    );
    group.add(secondaryPeak);

    // Remove the third peak that might be floating/problematic

    // Add some rocky outcrops around the base
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a5a5a,
      roughness: 0.95,
      metalness: 0.0,
    });

    // Create rocky base formations
    for (let i = 0; i < 5; i++) {
      const angle = ((Math.PI * 2) / 5) * i;
      const distance = 100 + this.rand() * 40;
      const rockX = 350 + Math.cos(angle) * distance;
      const rockZ = 100 + Math.sin(angle) * distance;

      const rockSize = 15 + this.rand() * 10;
      const rockGeometry = this.displaceVertices(
        new THREE.IcosahedronGeometry(rockSize, 3),
        rockSize * 0.25,
      );
      const rock = new THREE.Mesh(rockGeometry, rockMaterial);
      // Mostly submerged at the lake surface (y = -200) so the tops break the
      // water around the island base. The old -70 left them floating ~130
      // units above the water.
      rock.position.set(rockX, this.floorY + rockSize * 0.2, rockZ);
      rock.rotation.set(
        this.rand() * Math.PI,
        this.rand() * Math.PI,
        this.rand() * Math.PI,
      );
      rock.scale.set(
        1 + this.rand() * 0.5,
        0.6 + this.rand() * 0.3,
        1 + this.rand() * 0.5,
      );
      rock.castShadow = true;
      rock.receiveShadow = true;
      group.add(rock);
    }

    return group;
  }

  createMajesticPeak() {
    // Create twin peaks - two massive mountains close together
    const group = new THREE.Group();

    // First peak - Mont Blanc style with shallower slope
    // MOVED: Far left of road to avoid overlap (road X: 0-3622, Z: 0-2488)
    const peak1X = -1200;
    const peak1Z = 1000;
    const peak1Height = 500; // Very tall
    const peak1Width = 800; // Much wider base for shallower Mont Blanc-like slope

    // Second peak - slightly shorter and offset
    // MOVED: Far left to avoid road overlap
    const peak2X = -1600; // Move further apart due to wider bases
    const peak2Z = 1400;
    const peak2Height = 450;
    const peak2Width = 750; // Also wider for shallower slope

    // Create the first peak with more segments for smoother slope
    const mountain1Geometry = new THREE.ConeGeometry(
      peak1Width / 2,
      peak1Height,
      20,
      10,
    );

    // Deform the first peak to make it more mountain-like
    const positions1 = mountain1Geometry.attributes.position;
    for (let i = 0; i < positions1.count; i++) {
      const px = positions1.getX(i);
      const py = positions1.getY(i);
      const pz = positions1.getZ(i);

      // Get normalized height (0 at base, 1 at peak)
      const normalizedHeight = (py + peak1Height / 2) / peak1Height;

      // Add gentler ridges and variation for Mont Blanc style
      const ridgeAngle = Math.atan2(pz, px);
      const ridgeEffect =
        Math.sin(ridgeAngle * 3) * (1 - normalizedHeight) * 20; // Gentler ridges
      const noiseEffect = Math.sin(i * 0.3) * 15 * (1 - normalizedHeight); // Less noise

      // Apply deformation
      const distance = Math.sqrt(px * px + pz * pz);
      const newDistance = distance + ridgeEffect + noiseEffect;
      const scale = newDistance / (distance || 1);

      positions1.setX(i, px * scale);
      positions1.setZ(i, pz * scale);

      // Make the peak slightly asymmetric
      if (normalizedHeight > 0.7) {
        positions1.setX(i, px * (1 + Math.sin(py * 0.1) * 0.1));
        positions1.setY(i, py + Math.cos(px * 0.05) * 10);
      }

      // Widen the base significantly
      if (normalizedHeight < 0.3) {
        const baseWidening = 1 + (0.3 - normalizedHeight) * 2;
        positions1.setX(i, px * baseWidening);
        positions1.setZ(i, pz * baseWidening);
      }
    }

    mountain1Geometry.computeVertexNormals();

    // Create vertex colors with snow at the peak for first mountain
    const colors1 = [];
    for (let i = 0; i < positions1.count; i++) {
      const py = positions1.getY(i);
      const normalizedHeight = (py + peak1Height / 2) / peak1Height;

      // Transition to snow color at the peak - lower snow line and a
      // ragged transition for a more dramatic alpine cap
      if (normalizedHeight > 0.78) {
        // Bright snow white with slight blue tint
        const snowWhite = 0.97 + this.rand() * 0.03;
        colors1.push(
          snowWhite - 0.03, // Slightly less red for blue tint
          snowWhite,
          snowWhite + 0.02,
        );
      } else if (normalizedHeight > 0.64) {
        // Transition zone - ragged mix of rock and snow patches
        const mixFactor = (normalizedHeight - 0.64) / 0.14;
        const patchiness = this.rand() < mixFactor * 0.7 ? 0.25 : 0; // Snow patches
        const rockGrey = 0.35 + normalizedHeight * 0.15;
        const snowWhite = 0.96;
        const mixed = Math.min(
          rockGrey + (snowWhite - rockGrey) * mixFactor + patchiness,
          snowWhite,
        );
        colors1.push(
          mixed + this.rand() * 0.03,
          mixed + this.rand() * 0.03,
          mixed + this.rand() * 0.03 + 0.03,
        );
      } else {
        // Rock colors - darker at base, lighter towards peak, with
        // horizontal strata banding for geological drama
        const band =
          Math.sin(normalizedHeight * 28) > 0.55 ? -0.06 : 0; // Dark strata
        const baseGrey = 0.23 + normalizedHeight * 0.24 + band;
        const variation = this.rand() * 0.05;
        colors1.push(
          baseGrey + variation,
          baseGrey + variation + 0.02,
          baseGrey + variation + 0.06,
        );
      }
    }

    mountain1Geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors1, 3),
    );

    const mountainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true, // Keep some faceting for rock texture
    });

    const mountain1 = new THREE.Mesh(mountain1Geometry, mountainMaterial);
    mountain1.position.set(peak1X, peak1Height / 2 - 80, peak1Z);
    mountain1.castShadow = true;
    mountain1.receiveShadow = true;
    group.add(mountain1);

    // Create the second peak (copy-paste with adjustments)
    const mountain2 = this.createSecondPeak(
      peak2X,
      peak2Z,
      peak2Height,
      peak2Width,
    );
    group.add(mountain2);

    this.tagMeshes(group, "mountain");
    this.scene.add(group);
    this.registerGrounded(group, "majestic twin peaks");
  }

  createSecondPeak(x, z, height, width) {
    // Create the second peak with shallower slope
    const mountainGeometry = new THREE.ConeGeometry(width / 2, height, 20, 10);

    // Deform to make it natural
    const positions = mountainGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i);
      const py = positions.getY(i);
      const pz = positions.getZ(i);

      const normalizedHeight = (py + height / 2) / height;

      // Gentle ridge pattern for Mont Blanc style
      const ridgeAngle = Math.atan2(pz, px);
      const ridgeEffect =
        Math.sin(ridgeAngle * 4) * (1 - normalizedHeight) * 18; // Gentler
      const noiseEffect = Math.sin(i * 0.4) * 12 * (1 - normalizedHeight); // Less noise

      const distance = Math.sqrt(px * px + pz * pz);
      const newDistance = distance + ridgeEffect + noiseEffect;
      const scale = newDistance / (distance || 1);

      positions.setX(i, px * scale);
      positions.setZ(i, pz * scale);

      if (normalizedHeight > 0.7) {
        positions.setX(i, px * (1 + Math.cos(py * 0.12) * 0.08));
        positions.setY(i, py + Math.sin(px * 0.06) * 8);
      }

      if (normalizedHeight < 0.3) {
        const baseWidening = 1 + (0.3 - normalizedHeight) * 1.8;
        positions.setX(i, px * baseWidening);
        positions.setZ(i, pz * baseWidening);
      }
    }

    mountainGeometry.computeVertexNormals();

    // Add vertex colors with snow
    const colors = [];
    for (let i = 0; i < positions.count; i++) {
      const py = positions.getY(i);
      const normalizedHeight = (py + height / 2) / height;

      if (normalizedHeight > 0.75) {
        // Lower snow line with brighter snow
        const snowWhite = 0.96 + this.rand() * 0.04;
        colors.push(snowWhite - 0.03, snowWhite, snowWhite + 0.02);
      } else if (normalizedHeight > 0.6) {
        // Ragged transition with snow patches clinging to the rock
        const mixFactor = (normalizedHeight - 0.6) / 0.15;
        const patchiness = this.rand() < mixFactor * 0.7 ? 0.22 : 0;
        const rockGrey = 0.35 + normalizedHeight * 0.15;
        const snowWhite = 0.95;
        const mixed = Math.min(
          rockGrey + (snowWhite - rockGrey) * mixFactor + patchiness,
          snowWhite,
        );
        colors.push(
          mixed + this.rand() * 0.03,
          mixed + this.rand() * 0.03,
          mixed + this.rand() * 0.03 + 0.03,
        );
      } else {
        // Rock with subtle strata banding, slightly different cadence to
        // distinguish it from the first peak
        const band = Math.sin(normalizedHeight * 24 + 1.3) > 0.6 ? -0.05 : 0;
        const baseGrey = 0.25 + normalizedHeight * 0.22 + band;
        const variation = this.rand() * 0.05;
        colors.push(
          baseGrey + variation,
          baseGrey + variation + 0.01,
          baseGrey + variation + 0.05,
        );
      }
    }

    mountainGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );

    const mountainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });

    const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
    mountain.position.set(x, height / 2 - 80, z);
    mountain.castShadow = true;
    mountain.receiveShadow = true;

    return mountain;
  }

  createMountainPeak(x, z, height, width, color) {
    // Create a rounded mountain using sphere geometry for softer shapes
    const geometry = new THREE.SphereGeometry(width / 2, 12, 8);

    // Modify vertices for mountain shape
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i);
      const py = positions.getY(i);
      const pz = positions.getZ(i);

      // Stretch vertically and compress horizontally for mountain profile
      const normalizedY = py / (width / 2);

      // Create rounded mountain profile
      if (py > 0) {
        // Upper hemisphere - stretch to create peak
        const stretchFactor = 1.0 + normalizedY * (height / (width / 2) - 1);
        positions.setY(i, py * stretchFactor);

        // Gradually narrow towards peak for rounded cone shape
        const narrowFactor = 1.0 - normalizedY * 0.3;
        positions.setX(i, px * narrowFactor);
        positions.setZ(i, pz * narrowFactor);
      } else {
        // Lower hemisphere - flatten significantly
        positions.setY(i, py * 0.1);

        // Widen base
        const widenFactor = 1.0 + Math.abs(normalizedY) * 0.5;
        positions.setX(i, px * widenFactor);
        positions.setZ(i, pz * widenFactor);
      }

      // Add gentle noise for natural variation
      const noise = Math.sin(i * 0.2) * 5 + Math.cos(i * 0.3) * 3;
      positions.setX(
        i,
        positions.getX(i) + noise * (1 - Math.abs(normalizedY)),
      );
      positions.setZ(
        i,
        positions.getZ(i) + noise * (1 - Math.abs(normalizedY)) * 0.5,
      );
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.98,
      metalness: 0.0,
      flatShading: false, // Smooth shading for rounded mountains
    });

    const mountain = new THREE.Mesh(geometry, material);
    // Ground the peak: the flattened lower hemisphere extends (width/2)*0.1
    // below the mesh origin, so position the origin such that the base sits
    // 2 units below the lake plane (y = -200). The old fixed -50 left the
    // whole mountain hovering ~140 units above the water.
    const baseDepthBelowOrigin = (width / 2) * 0.1;
    mountain.position.set(x, this.floorY + baseDepthBelowOrigin - 2, z);
    mountain.castShadow = true;
    mountain.receiveShadow = true;

    // Add rounded snow cap for tall peaks
    if (height > 200) {
      const snowGeometry = new THREE.SphereGeometry(width / 5, 8, 6);
      const snowMaterial = new THREE.MeshStandardMaterial({
        color: 0xeaf0f5, // Brighter, cooler snow
        roughness: 0.55,
        metalness: 0.0,
        envMapIntensity: 0.8,
      });
      const snowCap = new THREE.Mesh(snowGeometry, snowMaterial);
      // Deform snow cap to be flatter
      const snowPositions = snowGeometry.attributes.position;
      for (let i = 0; i < snowPositions.count; i++) {
        const sy = snowPositions.getY(i);
        if (sy < 0) {
          snowPositions.setY(i, sy * 0.3);
        }
      }
      // Snow cap is a child of the mountain mesh, so its position is LOCAL:
      // (0, height * 0.85, 0) sits on the upper flank below the apex (local
      // y = height). The old world-coordinate position (x, ..., z) was added
      // on top of the parent transform, leaving snow caps floating in the
      // sky at twice the mountain's world offset.
      snowCap.userData.snow = true; // Not recoloured by the leg's rock tint
      snowCap.position.set(0, height * 0.85, 0);
      snowCap.scale.set(1.2, 0.6, 1.2);
      mountain.add(snowCap);
    }

    return mountain;
  }

  createDetailedHill(x, z, height, width) {
    // Create a detailed hill with vegetation
    const group = new THREE.Group();

    // Main hill body using sphere geometry
    const hillGeometry = new THREE.SphereGeometry(width / 2, 8, 6);

    // Deform sphere to create hill shape
    const positions = hillGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i);
      const py = positions.getY(i);
      const pz = positions.getZ(i);

      // Flatten bottom hemisphere
      if (py < 0) {
        positions.setY(i, py * 0.1);
      } else {
        // Add noise to top for natural shape
        const noise = Math.sin(i * 0.4) * 5 + Math.cos(i * 0.6) * 3;
        positions.setY(i, py * (height / (width / 2)) + noise);
      }

      // Add horizontal noise
      const horizontalNoise = Math.sin(i * 0.3) * 8;
      positions.setX(i, px + horizontalNoise);
      positions.setZ(i, pz + horizontalNoise * 0.5);
    }

    hillGeometry.computeVertexNormals();

    // Create gradient colors for the hill - darker green
    const colors = [];
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const heightRatio = Math.max(0, y) / height;

      // Base color - darker richer green
      const baseGreen = 0.35 + heightRatio * 0.12;
      const baseColor = {
        r: 0.18 + heightRatio * 0.08,
        g: baseGreen + this.rand() * 0.06,
        b: 0.15 + heightRatio * 0.06,
      };

      colors.push(baseColor.r, baseColor.g, baseColor.b);
    }

    hillGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );

    const hillMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: false,
    });

    const hill = new THREE.Mesh(hillGeometry, hillMaterial);
    hill.position.set(x, -60, z); // Base at lower level to avoid road
    hill.castShadow = true;
    hill.receiveShadow = true;
    group.add(hill);

    // Add vegetation patches - greener
    const vegetationMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d6a3d,
      roughness: 0.9,
      metalness: 0.0,
    });

    // Add trees on the hill
    const numTrees = Math.floor(3 + this.rand() * 4);
    for (let i = 0; i < numTrees; i++) {
      const angle = this.rand() * Math.PI * 2;
      const distance = width * 0.2 + this.rand() * width * 0.3;
      const treeX = x + Math.cos(angle) * distance;
      const treeZ = z + Math.sin(angle) * distance;
      const treeY = -60 + height * (0.3 + this.rand() * 0.4);

      // Simple tree
      const treeGeometry = new THREE.ConeGeometry(8, 20, 5);
      const tree = new THREE.Mesh(treeGeometry, vegetationMaterial);
      tree.position.set(treeX, treeY, treeZ);
      tree.castShadow = true;
      tree.receiveShadow = true;
      group.add(tree);
    }

    // Add bushes
    const bushMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a5a3a,
      roughness: 0.95,
      metalness: 0.0,
    });

    const numBushes = Math.floor(5 + this.rand() * 5);
    for (let i = 0; i < numBushes; i++) {
      const angle = this.rand() * Math.PI * 2;
      const distance = width * 0.15 + this.rand() * width * 0.35;
      const bushX = x + Math.cos(angle) * distance;
      const bushZ = z + Math.sin(angle) * distance;
      const bushY = -60 + height * (0.2 + this.rand() * 0.3);

      const bushGeometry = new THREE.SphereGeometry(
        3 + this.rand() * 2,
        4,
        3,
      );
      const bush = new THREE.Mesh(bushGeometry, bushMaterial);
      bush.position.set(bushX, bushY, bushZ);
      bush.scale.set(1.5, 0.8, 1.2);
      bush.castShadow = true;
      bush.receiveShadow = true;
      group.add(bush);
    }

    return group;
  }

  createRockTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    // Base rock color
    // Light, slightly warm stone: the texture is multiplied by the cliff's
    // vertex colours, and a mid-grey base times mid-grey vertices rendered
    // the whole mountain near black
    ctx.fillStyle = "#b9b1a6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add noise for rough surface
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = (this.rand() - 0.5) * 30;
      data[i] += noise; // Red
      data[i + 1] += noise; // Green
      data[i + 2] += noise; // Blue
    }

    ctx.putImageData(imageData, 0, 0);

    // Add stratification lines
    ctx.strokeStyle = "#7d756c";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;

    for (let y = 0; y < canvas.height; y += 15 + this.rand() * 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < canvas.width; x += 20) {
        ctx.lineTo(x, y + (this.rand() - 0.5) * 3);
      }
      ctx.stroke();
    }

    // Add cracks
    ctx.strokeStyle = "#4c4640";
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.4;

    for (let i = 0; i < 15; i++) {
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      ctx.beginPath();
      ctx.moveTo(startX, startY);

      let x = startX;
      let y = startY;
      const steps = 5 + this.rand() * 10;

      for (let j = 0; j < steps; j++) {
        x += (this.rand() - 0.5) * 30;
        y += this.rand() * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Add mineral veins
    ctx.strokeStyle = "#d6cfc4";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.2;

    for (let i = 0; i < 5; i++) {
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(
        startX + this.rand() * 100,
        startY + this.rand() * 100,
        startX + this.rand() * 200,
        startY + this.rand() * 200,
      );
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createRoadTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 2048;
    const ctx = canvas.getContext("2d");

    // Asphalt base with variation
    // (lighter than it looks: #3a3a3a is 4% reflectance once decoded, half
    // that of real asphalt, and vanished in anything but full sun)
    ctx.fillStyle = "#5a5957";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Large-scale tonal mottling - soft warm/cool patches give the asphalt
    // depth instead of reading as a flat grey sheet
    for (let i = 0; i < 18; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const radius = 150 + this.rand() * 300;
      const warm = this.rand() > 0.5;
      const r = warm ? 64 : 52;
      const g = warm ? 60 : 56;
      const b = warm ? 54 : 62;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.14)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add base texture variation
    for (let i = 0; i < 300; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const size = this.rand() * 8 + 3;
      const darkness = this.rand() * 20;
      ctx.fillStyle = `rgba(${40 - darkness}, ${40 - darkness}, ${40 - darkness}, 0.3)`;
      ctx.fillRect(x, y, size, size);
    }

    // Fine aggregate texture (small stones) - subtle warm/cool tint variation
    // so the chip seal sparkles slightly instead of being pure grey
    for (let i = 0; i < 2600; i++) {
      const gray = this.rand() * 30 + 35;
      const tint = Math.floor((this.rand() - 0.5) * 12);
      ctx.fillStyle = `rgba(${gray + tint}, ${gray}, ${gray - tint}, ${0.4 + this.rand() * 0.5})`;
      const size = this.rand() * 2.5 + 0.5;
      ctx.fillRect(
        this.rand() * canvas.width,
        this.rand() * canvas.height,
        size,
        size,
      );
    }

    // Sparse bright quartz flecks that catch the light
    for (let i = 0; i < 220; i++) {
      const bright = 95 + this.rand() * 50;
      ctx.fillStyle = `rgba(${bright}, ${bright}, ${bright - 5}, ${0.35 + this.rand() * 0.35})`;
      const size = this.rand() * 1.5 + 0.5;
      ctx.fillRect(
        this.rand() * canvas.width,
        this.rand() * canvas.height,
        size,
        size,
      );
    }

    // Coarse aggregate (larger stones)
    for (let i = 0; i < 250; i++) {
      const gray = this.rand() * 25 + 45;
      ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, 0.7)`;
      const size = this.rand() * 5 + 2;
      ctx.beginPath();
      ctx.arc(
        this.rand() * canvas.width,
        this.rand() * canvas.height,
        size / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Embedded larger rocks
    for (let i = 0; i < 80; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const size = this.rand() * 4 + 3;
      const gray = this.rand() * 20 + 50;
      ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, 0.8)`;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Broad tire-wear darkening down each lane center - soft-edged bands of
    // polished, rubber-stained asphalt where traffic actually runs
    ctx.globalAlpha = 1.0;
    [0.29, 0.71].forEach((laneCenter) => {
      const cx = canvas.width * laneCenter;
      const halfWidth = canvas.width * 0.085;
      const wearGradient = ctx.createLinearGradient(
        cx - halfWidth,
        0,
        cx + halfWidth,
        0,
      );
      wearGradient.addColorStop(0, "rgba(18, 18, 18, 0)");
      wearGradient.addColorStop(0.35, "rgba(18, 18, 18, 0.22)");
      wearGradient.addColorStop(0.5, "rgba(14, 14, 14, 0.3)");
      wearGradient.addColorStop(0.65, "rgba(18, 18, 18, 0.22)");
      wearGradient.addColorStop(1, "rgba(18, 18, 18, 0)");
      ctx.fillStyle = wearGradient;
      ctx.fillRect(cx - halfWidth, 0, halfWidth * 2, canvas.height);
    });

    // Tire tracks and wear marks
    ctx.globalAlpha = 0.4;

    // Left tire track
    const leftTrackX = canvas.width * 0.35;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(leftTrackX, 0);
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.lineTo(leftTrackX + Math.sin(y * 0.02) * 3, y);
    }
    ctx.stroke();

    // Right tire track
    const rightTrackX = canvas.width * 0.65;
    ctx.beginPath();
    ctx.moveTo(rightTrackX, 0);
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.lineTo(rightTrackX + Math.sin(y * 0.02 + 1) * 3, y);
    }
    ctx.stroke();

    // Center wear (from motorcycles)
    ctx.strokeStyle = "#282828";
    ctx.lineWidth = 12;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.lineTo(canvas.width / 2 + Math.sin(y * 0.03) * 2, y);
    }
    ctx.stroke();

    // Heavy skid marks and burnout streaks
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#0a0a0a";
    for (let i = 0; i < 15; i++) {
      // Reduced from 25
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      const length = 60 + this.rand() * 250;
      const angle = (this.rand() - 0.5) * 0.6;

      ctx.lineWidth = 6 + this.rand() * 20;
      ctx.globalAlpha = 0.25 + this.rand() * 0.4;

      ctx.beginPath();
      ctx.moveTo(startX, startY);

      for (let j = 0; j < length; j += 8) {
        const wobble = Math.sin(j * 0.08) * 3;
        ctx.lineTo(
          startX + Math.sin(angle) * j + wobble,
          startY + Math.cos(angle) * j,
        );
      }
      ctx.stroke();
    }

    // Tire burnout patches (darker circular marks)
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 12; i++) {
      // Reduced from 18
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const width = 18 + this.rand() * 35;
      const height = 35 + this.rand() * 70;

      ctx.fillStyle = "#0f0f0f";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((this.rand() - 0.5) * 0.6);
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.restore();
    }

    // Diagonal skid marks from drifting
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 10; i++) {
      // Reduced from 15
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      const angle = this.rand() * Math.PI * 2;
      const length = 40 + this.rand() * 100;

      ctx.strokeStyle = "#151515";
      ctx.lineWidth = 10 + this.rand() * 12;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(
        startX + Math.cos(angle) * length,
        startY + Math.sin(angle) * length,
      );
      ctx.stroke();
    }

    // Snake marks (S-shaped skids)
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#1a1a1a";
    for (let i = 0; i < 6; i++) {
      // Reduced from 10
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      const length = 80 + this.rand() * 150;

      ctx.lineWidth = 8 + this.rand() * 10;
      ctx.beginPath();
      ctx.moveTo(startX, startY);

      for (let j = 0; j < length; j += 5) {
        const sway = Math.sin(j * 0.1) * 15;
        ctx.lineTo(startX + sway, startY + j);
      }
      ctx.stroke();
    }

    // Oil stains and patches
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 5; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const radius = 10 + this.rand() * 20;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(20, 20, 20, 0.5)");
      gradient.addColorStop(1, "rgba(20, 20, 20, 0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cracks
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 20; i++) {
      // Reduced from 35
      ctx.beginPath();
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      ctx.moveTo(startX, startY);

      for (let j = 0; j < 5; j++) {
        ctx.lineTo(
          startX + (this.rand() - 0.5) * 50,
          startY + this.rand() * 60,
        );
      }
      ctx.stroke();
    }

    // Large patch repairs (rectangular)
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 12; i++) {
      // Reduced from 20
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const width = 25 + this.rand() * 50;
      const height = 25 + this.rand() * 50;

      ctx.fillStyle = "#424242";
      ctx.fillRect(x, y, width, height);

      for (let j = 0; j < 30; j++) {
        const px = x + this.rand() * width;
        const py = y + this.rand() * height;
        ctx.fillStyle = `rgba(${48 + this.rand() * 22}, ${48 + this.rand() * 22}, ${48 + this.rand() * 22}, 0.6)`;
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    }

    // Irregular patch repairs
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 8; i++) {
      // Reduced from 12
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const size = 30 + this.rand() * 60;

      ctx.fillStyle = "#3f3f3f";
      ctx.beginPath();
      for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
        const radius = size * (0.7 + this.rand() * 0.3);
        ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Tar seams (road joint repairs)
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const y = this.rand() * canvas.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < canvas.width; x += 10) {
        ctx.lineTo(x, y + Math.sin(x * 0.1) * 2);
      }
      ctx.stroke();
    }

    // Weathering stains
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 25; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const radius = 8 + this.rand() * 15;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(30, 30, 30, 0.4)");
      gradient.addColorStop(1, "rgba(30, 30, 30, 0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;

    // White edge lines - visible road boundaries.
    // Dark underpaint first so the white pops with a crisp edge.
    ctx.strokeStyle = "#161616";
    ctx.lineWidth = 50;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(100, 0);
    ctx.lineTo(100, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvas.width - 100, 0);
    ctx.lineTo(canvas.width - 100, canvas.height);
    ctx.stroke();

    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = "#f2f2ee";
    ctx.lineWidth = 36;
    ctx.beginPath();
    ctx.moveTo(100, 0);
    ctx.lineTo(100, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvas.width - 100, 0);
    ctx.lineTo(canvas.width - 100, canvas.height);
    ctx.stroke();

    // Bright core stripe - reads as fresh retro-reflective paint
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(100, 0);
    ctx.lineTo(100, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvas.width - 100, 0);
    ctx.lineTo(canvas.width - 100, canvas.height);
    ctx.stroke();

    // Edge line wear
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineWidth = 2;
    for (let y = 0; y < canvas.height; y += 30 + this.rand() * 20) {
      ctx.beginPath();
      ctx.moveTo(45, y);
      ctx.lineTo(55, y + 10);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(canvas.width - 55, y);
      ctx.lineTo(canvas.width - 45, y + 10);
      ctx.stroke();
    }

    // ABS braking patterns - reduced
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#0d0d0d";
    for (let i = 0; i < 4; i++) {
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      const segments = 4 + Math.floor(this.rand() * 3);
      ctx.lineWidth = 10 + this.rand() * 6;

      for (let j = 0; j < segments; j++) {
        ctx.beginPath();
        const segY = startY + j * 25;
        ctx.moveTo(startX, segY);
        ctx.lineTo(startX + (this.rand() - 0.5) * 4, segY + 10);
        ctx.stroke();
      }
    }

    // Corner entry marks - reduced
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 5; i++) {
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      const length = 50 + this.rand() * 80;
      const curve = (this.rand() - 0.5) * 0.3;

      ctx.strokeStyle = "#0a0a0a";
      ctx.lineWidth = 12 + this.rand() * 8;
      ctx.beginPath();
      ctx.moveTo(startX, startY);

      for (let j = 0; j < length; j += 5) {
        const curveAmount = Math.pow(j / length, 2) * curve * 50;
        ctx.lineTo(startX + curveAmount, startY + j);
      }
      ctx.stroke();
    }

    // Motorcycle lean marks - reduced
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 5; i++) {
      const cx = this.rand() * canvas.width;
      const cy = this.rand() * canvas.height;
      const radius = 40 + this.rand() * 80;
      const arcStart = this.rand() * Math.PI;
      const arcLength = Math.PI * 0.3 + this.rand() * Math.PI * 0.3;

      ctx.strokeStyle = "#121212";
      ctx.lineWidth = 7 + this.rand() * 5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, arcStart, arcStart + arcLength);
      ctx.stroke();
    }

    // Rubber buildup marks - reduced
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#080808";
    for (let i = 0; i < 50; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const size = 2 + this.rand() * 4;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Circular pothole repairs - reduced
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 4; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const radius = 15 + this.rand() * 20;

      ctx.fillStyle = "#2a2a2a";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#3f3f3f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Utility cut repairs - reduced
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 3; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const width = 20 + this.rand() * 15;
      const length = 80 + this.rand() * 120;
      const angle = (this.rand() - 0.5) * 0.6;

      ctx.fillStyle = "#404040";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillRect(-width / 2, 0, width, length);

      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-width / 2, 0);
      ctx.lineTo(-width / 2, length);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, length);
      ctx.stroke();
      ctx.restore();
    }

    // Rain staining - reduced
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 8; i++) {
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      const length = 40 + this.rand() * 80;

      const gradient = ctx.createLinearGradient(
        startX,
        startY,
        startX + 5,
        startY + length,
      );
      gradient.addColorStop(0, "rgba(25, 25, 25, 0.25)");
      gradient.addColorStop(1, "rgba(25, 25, 25, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(startX, startY, 6 + this.rand() * 4, length);
    }

    // Surface oxidation - reduced
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 12; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const radius = 80 + this.rand() * 100;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(60, 60, 60, 0.15)");
      gradient.addColorStop(1, "rgba(60, 60, 60, 0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tar crack sealing - reduced
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      ctx.moveTo(startX, startY);

      for (let j = 0; j < 3; j++) {
        ctx.lineTo(
          startX + (this.rand() - 0.5) * 30,
          startY + this.rand() * 40,
        );
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createEndCourseMountains() {
    // Add dramatic mountain scenery specifically for the end section of the course
    const group = new THREE.Group();

    // Calculate positions based on the last quarter of the road path
    const lastQuarterIndex = Math.floor(this.roadPath.length * 0.75);
    const endPoint = this.roadPath[this.roadPath.length - 1];
    const threeQuarterPoint = this.roadPath[lastQuarterIndex];

    // Create a dramatic mountain wall on the left side for the final section
    const finalMountainGeometry = new THREE.ConeGeometry(600, 700, 24, 12);

    // Deform for natural mountain shape
    const positions = finalMountainGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i);
      const py = positions.getY(i);
      const pz = positions.getZ(i);

      const normalizedHeight = (py + 350) / 700;

      // Create dramatic ridges
      const angle = Math.atan2(pz, px);
      const ridgeEffect = Math.sin(angle * 4) * (1 - normalizedHeight) * 40;
      const noise = Math.sin(i * 0.2) * 20 * (1 - normalizedHeight);

      const distance = Math.sqrt(px * px + pz * pz);
      const newDistance = distance + ridgeEffect + noise;
      const scale = newDistance / (distance || 1);

      positions.setX(i, px * scale);
      positions.setZ(i, pz * scale);

      // Dramatic peak shaping
      if (normalizedHeight > 0.8) {
        positions.setY(i, py + Math.sin(angle * 2) * 15);
      }

      // Wide dramatic base
      if (normalizedHeight < 0.2) {
        const baseScale = 1 + (0.2 - normalizedHeight) * 3;
        positions.setX(i, px * baseScale);
        positions.setZ(i, pz * baseScale);
      }
    }

    finalMountainGeometry.computeVertexNormals();

    // Add vertex colors with dramatic snow coverage
    const colors = [];
    for (let i = 0; i < positions.count; i++) {
      const py = positions.getY(i);
      const normalizedHeight = (py + 350) / 700;

      if (normalizedHeight > 0.7) {
        // Extensive snow coverage
        const snow = 0.92 + this.rand() * 0.08;
        colors.push(snow, snow, snow + 0.03);
      } else if (normalizedHeight > 0.5) {
        // Mixed zone
        const mix = 0.4 + normalizedHeight * 0.3;
        colors.push(mix, mix + 0.02, mix + 0.05);
      } else {
        // Dark dramatic rock
        const rock = 0.2 + normalizedHeight * 0.2;
        colors.push(rock, rock + 0.01, rock + 0.02);
      }
    }

    finalMountainGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );

    const mountainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });

    // Position multiple peaks AWAY from the road using perpendicular offsets
    // Calculate perpendicular direction at end point
    const endHeading = endPoint.heading || 0;
    const perpX = Math.cos(endHeading);
    const perpZ = -Math.sin(endHeading);

    // First peak - far to the left of the road
    const finalPeak1 = new THREE.Mesh(finalMountainGeometry, mountainMaterial);
    finalPeak1.position.set(
      endPoint.x - perpX * 1000, // 1000 units perpendicular to left
      -100,
      endPoint.z - perpZ * 1000,
    );
    finalPeak1.rotation.y = this.rand() * Math.PI;
    finalPeak1.castShadow = true;
    finalPeak1.receiveShadow = true;
    group.add(finalPeak1);

    // Second peak - far to the right of the road
    const finalPeak2 = new THREE.Mesh(
      finalMountainGeometry.clone(),
      mountainMaterial,
    );
    finalPeak2.position.set(
      endPoint.x + perpX * 1200, // 1200 units perpendicular to right
      -150,
      endPoint.z + perpZ * 1200,
    );
    finalPeak2.scale.set(1.2, 1.3, 1.2);
    finalPeak2.rotation.y = this.rand() * Math.PI;
    finalPeak2.castShadow = true;
    finalPeak2.receiveShadow = true;
    group.add(finalPeak2);

    // Third peak - left side at three-quarter point
    const threeQuarterHeading = threeQuarterPoint.heading || 0;
    const perpX3Q = Math.cos(threeQuarterHeading);
    const perpZ3Q = -Math.sin(threeQuarterHeading);

    const finalPeak3 = new THREE.Mesh(
      finalMountainGeometry.clone(),
      mountainMaterial,
    );
    finalPeak3.position.set(
      threeQuarterPoint.x - perpX3Q * 800, // 800 units to left
      -80,
      threeQuarterPoint.z - perpZ3Q * 800,
    );
    finalPeak3.scale.set(0.9, 1.1, 0.9);
    finalPeak3.rotation.y = this.rand() * Math.PI;
    finalPeak3.castShadow = true;
    finalPeak3.receiveShadow = true;
    group.add(finalPeak3);

    // Add dramatic ridge line between the left-side peaks
    const ridgeGeometry = new THREE.ConeGeometry(400, 400, 16, 8);
    const ridge1 = new THREE.Mesh(ridgeGeometry, mountainMaterial);
    ridge1.position.set(
      endPoint.x - perpX * 900,
      -120,
      endPoint.z - perpZ * 900,
    );
    ridge1.scale.set(2, 1, 0.5);
    ridge1.rotation.y = endHeading; // Align with road direction
    ridge1.rotation.z = 0.2;
    ridge1.castShadow = true;
    ridge1.receiveShadow = true;
    group.add(ridge1);

    // Add smaller peaks in a semi-circle BEHIND the end point (not around it)
    for (let i = 0; i < 5; i++) {
      const smallPeakGeometry = new THREE.ConeGeometry(200, 250, 12, 6);
      const smallPeak = new THREE.Mesh(smallPeakGeometry, mountainMaterial);

      // Position behind and to the sides of the end point
      const angle = (Math.PI * 0.5 * i) / 4 - Math.PI / 4; // Semi-circle behind
      const distance = 1500 + this.rand() * 400;

      // Calculate position relative to road direction
      const forwardX = Math.sin(endHeading);
      const forwardZ = Math.cos(endHeading);

      // y keeps the cone base (height 250, min y-scale 0.7 => base extends
      // >= 87.5 below center) under the lake plane at -200; at -100 the
      // shortest peaks floated ~12 units above the water
      smallPeak.position.set(
        endPoint.x +
          forwardX * distance * Math.cos(angle) +
          perpX * distance * Math.sin(angle),
        -160 - this.rand() * 50,
        endPoint.z +
          forwardZ * distance * Math.cos(angle) +
          perpZ * distance * Math.sin(angle),
      );
      smallPeak.scale.set(
        0.8 + this.rand() * 0.4,
        0.7 + this.rand() * 0.6,
        0.8 + this.rand() * 0.4,
      );
      smallPeak.rotation.y = this.rand() * Math.PI;
      smallPeak.castShadow = true;
      smallPeak.receiveShadow = true;
      group.add(smallPeak);
    }

    // Add DISTANT mountain range on the LEFT side towards the end
    const distantMountainMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b7b9a, // Blue-grey for atmospheric perspective
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });

    // Create a long mountain range to the left
    for (let i = 0; i < 8; i++) {
      const distantGeometry = new THREE.ConeGeometry(
        800 + this.rand() * 400, // Wider bases
        600 + this.rand() * 300, // Varied heights
        16,
        8,
      );

      // Deform for variety
      const positions = distantGeometry.attributes.position;
      for (let j = 0; j < positions.count; j++) {
        const py = positions.getY(j);
        const px = positions.getX(j);
        const pz = positions.getZ(j);

        // Add some ridge variation
        const angle = Math.atan2(pz, px);
        positions.setX(j, px + Math.sin(angle * 3) * 30);
        positions.setZ(j, pz + Math.cos(angle * 2) * 40);
      }
      distantGeometry.computeVertexNormals();

      const distantPeak = new THREE.Mesh(
        distantGeometry,
        distantMountainMaterial,
      );

      // Position along the left side, getting closer to the end
      const progressAlongEnd = 0.6 + (i / 8) * 0.4; // From 60% to 100% of road
      const roadIndex = Math.floor(this.roadPath.length * progressAlongEnd);
      const roadPoint =
        this.roadPath[Math.min(roadIndex, this.roadPath.length - 1)];
      const localHeading = roadPoint.heading || 0;
      const localPerpX = Math.cos(localHeading);
      const localPerpZ = -Math.sin(localHeading);

      distantPeak.position.set(
        roadPoint.x - localPerpX * (2000 + i * 300), // 2000-4400 units to left
        this.floorY - this.rand() * 100,
        roadPoint.z - localPerpZ * (2000 + i * 300),
      );
      distantPeak.scale.set(
        1.5 + this.rand() * 0.5,
        1.2 + this.rand() * 0.4,
        1.5 + this.rand() * 0.5,
      );
      distantPeak.rotation.y = this.rand() * Math.PI;
      distantPeak.castShadow = true;
      distantPeak.receiveShadow = true;
      group.add(distantPeak);
    }

    // Add even more distant layered peaks ahead/left of the end point
    const veryDistantMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a95aa, // Even more faded blue-grey
      roughness: 0.98,
      metalness: 0.0,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });

    // Mountains ahead and to the left of the finish
    for (let i = 0; i < 6; i++) {
      const farGeometry = new THREE.ConeGeometry(1200, 800, 12, 6);
      const farPeak = new THREE.Mesh(farGeometry, veryDistantMaterial);

      // Position ahead and left of the end point
      const forwardDist = 3000 + i * 500;
      const leftDist = 1500 + i * 400;

      farPeak.position.set(
        endPoint.x - perpX * leftDist + Math.sin(endHeading) * forwardDist,
        -300 - this.rand() * 100,
        endPoint.z - perpZ * leftDist + Math.cos(endHeading) * forwardDist,
      );
      farPeak.scale.set(
        1.8 + this.rand() * 0.6,
        1.5 + this.rand() * 0.5,
        1.8 + this.rand() * 0.6,
      );
      farPeak.rotation.y = this.rand() * Math.PI * 2;
      farPeak.castShadow = false; // Too distant for shadows
      farPeak.receiveShadow = true;
      group.add(farPeak);
    }

    this.tagMeshes(group, "mountain");
    this.scene.add(group);
    this.registerGrounded(group, "end-course mountains");
  }

  createFloor() {
    const { floor } = this.terrain;
    if (floor.kind === "none") return;
    if (floor.kind === "river") {
      this.createRiver(floor);
      return;
    }
    // Lake under the whole active leg. (A fixed 3000-unit plane at the world
    // origin only reached the first leg; later legs dropped into nothing.)
    const legMid = this.roadPath[
      Math.floor(
        (Math.max(0, this.startSegment) +
          Math.min(this.endSegment, this.roadPath.length - 1)) / 2,
      )
    ];
    const frozen = floor.kind === "ice";
    let lakeMaterial;
    if (frozen) {
      lakeMaterial =
        typeof createIceMaterial === "function"
          ? createIceMaterial()
          : new THREE.MeshStandardMaterial({ color: 0xcfe3ee, roughness: 0.2, metalness: 0.1, envMapIntensity: 1.2 });
      lakeMaterial.name = "ice";
    } else {
      lakeMaterial =
        typeof createWaterMaterial === "function"
          ? createWaterMaterial()
          : new THREE.MeshStandardMaterial({
              color: 0x10539e,
              roughness: 0.06,
              metalness: 0.55,
              envMapIntensity: 1.6,
            });
    }
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), lakeMaterial);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(legMid.x, this.floorY, legMid.z);
    lake.receiveShadow = true;
    lake.userData.part = "floor";
    lake.name = floor.kind === "sea" ? "floor-sea" : "floor-lake";
    this.scene.add(lake);
  }

  // A river ribbon beside the road: a strip from lateral `from` to `to` on
  // one side, `below` metres under the road along the whole built range. The
  // ground dips beneath it, so the water shows only where the ground is lower.
  createRiver(floor) {
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);
    const vertices = [];
    const uvs = [];
    const indices = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const point = this.roadPath[i];
      // The water's normal map tiles every 10 m
      const tileWidth = (floor.to - floor.from) / 10;
      uvs.push(0, i * 2, tileWidth, i * 2);
      for (const lateral of [floor.from, floor.to]) {
        const offset = lateral * floor.side;
        vertices.push(
          point.x + Math.cos(point.heading) * offset,
          Terrain.waterLevel(this.terrain, point.y),
          point.z - Math.sin(point.heading) * offset,
        );
      }
      if (i > startIdx) {
        const base = (i - startIdx - 1) * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material =
      typeof createWaterMaterial === "function"
        ? createWaterMaterial()
        : new THREE.MeshStandardMaterial({ color: 0x10539e, roughness: 0.06, metalness: 0.55, envMapIntensity: 1.6 });
    material.side = THREE.DoubleSide;
    const river = new THREE.Mesh(geometry, material);
    river.name = "floor-river";
    river.receiveShadow = true;
    river.userData.part = "floor";
    this.scene.add(river);
  }

  createRoadMarkings() {
    // Yellow center line dashes
    const dashMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 0.1,
      roughness: 0.8,
      metalness: 0.0,
    });

    // Place dashes along the road path (only in active segment range)
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    for (let index = startIdx; index <= endIdx; index++) {
      const point = this.roadPath[index];
      if (index % 2 === 0) {
        // Every other segment
        const dashGeometry = new THREE.PlaneGeometry(0.2, 4);
        const dash = new THREE.Mesh(dashGeometry, dashMaterial);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = point.heading;
        const dashY = point.y !== undefined ? point.y + 0.02 : 0.02;
        dash.position.set(point.x, dashY, point.z);
        dash.receiveShadow = true;
        this.scene.add(dash);
      }
    }

    // Add start/finish line
    if (this.roadPath.length > 0) {
      const startGeometry = new THREE.PlaneGeometry(16, 2);
      const startMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.6,
        roughness: 0.7,
        metalness: 0.0,
      });
      const startLine = new THREE.Mesh(startGeometry, startMaterial);
      startLine.rotation.x = -Math.PI / 2;
      // Place start line at beginning of leg
      const startSegmentIdx = Math.min(this.startSegment + 5, this.endSegment);
      // Align across the road like the finish line - heading is non-zero on
      // every leg except the very first segment of the track
      startLine.rotation.z = this.roadPath[startSegmentIdx].heading;
      const startY =
        this.roadPath[startSegmentIdx].y !== undefined
          ? this.roadPath[startSegmentIdx].y + 0.03
          : 0.03;
      startLine.position.set(
        this.roadPath[startSegmentIdx].x,
        startY,
        this.roadPath[startSegmentIdx].z,
      );
      startLine.receiveShadow = true;
      this.scene.add(startLine);
      this.registerGrounded(startLine, "start line");

      // Checkered pattern for finish line at end of leg
      const finishMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        roughness: 0.7,
        metalness: 0.0,
      });
      // Place finish line at endSegment + 5, giving runout space after
      const finishSegmentIdx = Math.min(
        this.roadPath.length - 1,
        this.endSegment + 5,
      );
      const finishLine = new THREE.Mesh(startGeometry, finishMaterial);
      finishLine.rotation.x = -Math.PI / 2;
      finishLine.rotation.z = this.roadPath[finishSegmentIdx].heading;
      const finishY =
        this.roadPath[finishSegmentIdx].y !== undefined
          ? this.roadPath[finishSegmentIdx].y + 0.03
          : 0.03;
      finishLine.position.set(
        this.roadPath[finishSegmentIdx].x,
        finishY,
        this.roadPath[finishSegmentIdx].z,
      );
      finishLine.receiveShadow = true;
      this.scene.add(finishLine);
      this.registerGrounded(finishLine, "finish line");

      // Checkered banner gantry over the finish line
      this.createFinishBanner(this.roadPath[finishSegmentIdx]);

      // The finish as a gate, tested by Game.inGate like the checkpoints
      this.finishGate = {
        kind: "finish",
        position: new THREE.Vector3(
          this.roadPath[finishSegmentIdx].x,
          finishY,
          this.roadPath[finishSegmentIdx].z,
        ),
        heading: this.roadPath[finishSegmentIdx].heading,
        segmentIndex: finishSegmentIdx,
        ...this.gateReach(finishSegmentIdx),
      };
      this.createGateLimitPosts(this.roadPath[finishSegmentIdx], this.finishGate, "finish gate");
      console.log(
        `Finish line placed at segment ${finishSegmentIdx} (leg range: ${this.startSegment}-${this.endSegment})`,
      );
    }
  }

  createCheckeredBannerTexture() {
    if (this.checkeredBannerTexture) {
      return this.checkeredBannerTexture;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const square = 16;
    for (let y = 0; y < canvas.height / square; y++) {
      for (let x = 0; x < canvas.width / square; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#111111" : "#f5f5f5";
        ctx.fillRect(x * square, y * square, square, square);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    this.checkeredBannerTexture = texture;
    return texture;
  }

  createFinishBanner(point) {
    // Overhead gantry spanning the road with a checkered banner, plus
    // checkered flags on each pole
    const group = new THREE.Group();
    const halfSpan = this.roadWidth / 2 + 1.5;
    const bannerHeight = 5;

    const poleGeometry = new THREE.CylinderGeometry(0.12, 0.15, bannerHeight + 1, 10);
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      roughness: 0.35,
      metalness: 0.8,
    });
    [-halfSpan, halfSpan].forEach((offset) => {
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.set(offset, (bannerHeight + 1) / 2, 0);
      pole.castShadow = true;
      pole.receiveShadow = true;
      group.add(pole);

      // Small checkered flag at the top of each pole
      const flagGeometry = new THREE.PlaneGeometry(1.0, 0.65);
      const flagMaterial = new THREE.MeshStandardMaterial({
        map: this.createCheckeredBannerTexture(),
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.0,
      });
      const flag = new THREE.Mesh(flagGeometry, flagMaterial);
      flag.position.set(offset + (offset > 0 ? -0.55 : 0.55), bannerHeight + 0.6, 0);
      flag.castShadow = true;
      flag.userData.allowFloating = true; // Mounted at the top of the pole
      group.add(flag);
    });

    // Banner spanning the road
    const bannerGeometry = new THREE.PlaneGeometry(halfSpan * 2, 1.1);
    const bannerMaterial = new THREE.MeshStandardMaterial({
      map: this.createCheckeredBannerTexture(),
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0.0,
    });
    const banner = new THREE.Mesh(bannerGeometry, bannerMaterial);
    banner.position.set(0, bannerHeight - 0.55, 0);
    banner.castShadow = true;
    banner.userData.allowFloating = true; // Overhead span between the poles
    group.add(banner);

    // "FINISH" text panel below the banner
    const textCanvas = document.createElement("canvas");
    textCanvas.width = 512;
    textCanvas.height = 96;
    const textCtx = textCanvas.getContext("2d");
    textCtx.fillStyle = "#cc1111";
    textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
    textCtx.fillStyle = "#ffffff";
    textCtx.font = "bold 72px Arial";
    textCtx.textAlign = "center";
    textCtx.textBaseline = "middle";
    textCtx.fillText("FINISH", textCanvas.width / 2, textCanvas.height / 2);
    const textTexture = new THREE.CanvasTexture(textCanvas);
    const textPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.1),
      new THREE.MeshStandardMaterial({
        map: textTexture,
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0.0,
      }),
    );
    textPanel.position.set(0, bannerHeight - 1.7, 0);
    // Face the approaching rider (planes face +Z but riders arrive traveling
    // along +Z, so they were seeing the DoubleSide back face - mirrored text)
    textPanel.rotation.y = Math.PI;
    textPanel.castShadow = true;
    textPanel.userData.allowFloating = true; // Hangs below the overhead banner
    group.add(textPanel);

    // Orient across the road at the finish segment. The group's local X axis
    // must lie along the road's perpendicular: rotate by heading around Y
    group.position.set(point.x, point.y || 0, point.z);
    group.rotation.y = point.heading;
    this.scene.add(group);
    // Pole bases rest on the road; banner/flags/text are tagged allowFloating
    this.registerGrounded(group, "finish banner gantry");
  }

  // Concatenate geometries into one non-indexed, vertex-coloured geometry.
  // Each part is { geometry, color: [bottomHex, topHex] }: the colour runs
  // from the part's lowest vertex to its highest.
  mergeColoredGeometries(parts) {
    const positions = [];
    const colors = [];
    const bottom = new THREE.Color();
    const top = new THREE.Color();
    const mixed = new THREE.Color();

    parts.forEach(({ geometry, color }) => {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      const position = flat.attributes.position;
      flat.computeBoundingBox();
      const minY = flat.boundingBox.min.y;
      const spanY = Math.max(0.001, flat.boundingBox.max.y - minY);
      // Colours are authored as sRGB hex; the renderer decodes float vertex
      // colours once (Graphics.fixColorSpaces), so store them undecoded
      bottom.setHex(color[0], THREE.NoColorSpace || "");
      top.setHex(color[1], THREE.NoColorSpace || "");
      for (let v = 0; v < position.count; v++) {
        const y = position.getY(v);
        positions.push(position.getX(v), y, position.getZ(v));
        mixed.copy(bottom).lerp(top, (y - minY) / spanY);
        colors.push(mixed.r, mixed.g, mixed.b);
      }
      if (flat !== geometry) flat.dispose();
      geometry.dispose();
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    merged.computeVertexNormals();
    return merged;
  }

  // Low-poly conifer: a trunk and three stacked, slightly irregular tiers
  createConiferGeometry() {
    const tier = (radius, height, y, twist) => {
      const g = new THREE.ConeGeometry(radius, height, 7, 1);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        // Push the skirt in and out so the silhouette is not a perfect cone
        if (p.getY(v) < 0) {
          const wobble = 0.85 + this.rand() * 0.3;
          p.setX(v, p.getX(v) * wobble);
          p.setZ(v, p.getZ(v) * wobble);
          p.setY(v, p.getY(v) - this.rand() * 0.25);
        }
      }
      g.rotateY(twist);
      g.translate(0, y, 0);
      return g;
    };
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 6, 1);
    trunk.translate(0, 1.1, 0);
    return this.mergeColoredGeometries([
      { geometry: trunk, color: [0x3b2a1e, 0x5a4030] },
      { geometry: tier(2.3, 3.2, 3.0, 0.0), color: [0x1b3d27, 0x2a5a33] },
      { geometry: tier(1.8, 2.9, 4.9, 0.5), color: [0x20472b, 0x33683a] },
      { geometry: tier(1.2, 2.6, 6.7, 1.1), color: [0x275330, 0x467a42] },
    ]);
  }

  // Low-poly broadleaf: a trunk under a cluster of faceted canopy lobes
  createBroadleafGeometry() {
    const lobe = (radius, x, y, z) => {
      const g = this.displaceVertices(new THREE.IcosahedronGeometry(radius, 1), radius * 0.22);
      g.scale(1, 0.82, 1);
      g.translate(x, y, z);
      return g;
    };
    const trunk = new THREE.CylinderGeometry(0.26, 0.42, 3.4, 6, 1);
    trunk.translate(0, 1.7, 0);
    return this.mergeColoredGeometries([
      { geometry: trunk, color: [0x40301f, 0x6a4c33] },
      { geometry: lobe(2.3, 0.0, 4.9, 0.0), color: [0x2b4f25, 0x55803a] },
      { geometry: lobe(1.7, 1.5, 4.1, 0.6), color: [0x264822, 0x4a7436] },
      { geometry: lobe(1.6, -1.3, 4.3, -0.7), color: [0x294b23, 0x507a36] },
      { geometry: lobe(1.4, 0.2, 6.3, -0.3), color: [0x33592a, 0x688f42] },
    ]);
  }

  // Trees on loose ground, both sides of the road, from `offset` past the road
  // edge outward (thinning with distance, `reach` further at most). A trunk
  // within a bike's reach is solid: it joins `boulders` with a height, and a
  // bike that is airborne above it still clears it. Trees further out can not
  // be reached, so they get no entry.
  plantRunoffTrees(index, point, layout, plant) {
    const [fewest, most] = layout.perSegment;
    const halfRoad = this.roadWidth / 2;
    for (const sign of [-1, 1]) {
      const count = fewest + Math.floor(this.rand() * (most - fewest + 1));
      for (let t = 0; t < count; t++) {
        const band = this.rand();
        const lateral = halfRoad + layout.offset + band * band * layout.reach;
        const along = (this.rand() - 0.5) * 20;
        const skipped = layout.exclude.some((zone) => zone.sign === sign && lateral >= zone.from && lateral <= zone.to);
        if (skipped) continue;
        const x = point.x + sign * lateral * Math.cos(point.heading) + along * Math.sin(point.heading);
        const z = point.z - sign * lateral * Math.sin(point.heading) + along * Math.cos(point.heading);
        // On a bend the nearest segment is not the one the tree was placed from,
        // so where the tree stands (and whether a bike can reach it) is read
        // back from the nearest segment, as the bike's own tests read it
        const found = Terrain.locate(
          this.roadPath, x, z,
          Math.max(0, index - 6), Math.min(this.roadPath.length - 1, index + 6), {},
        );
        const standing = Math.abs(found.lateral);
        // A trunk is solid where a bike can ride: out to the rideable limit
        // beside that segment (a valley's run-off narrows along the road)
        const reachable = Terrain.rideableLimit(this.terrain, found.index, sign, halfRoad);
        const groundY = this.groundYAt(x, z);
        plant(x, z, groundY, lateral);
        if (standing <= reachable) {
          this.boulders.push({
            position: new THREE.Vector3(x, groundY, z),
            radius: 0.6,
            solid: true,
            height: 6,
            label: "tree",
          });
        }
      }
    }
  }

  // Scatter an instanced forest over the drop-off slope (whichever side drops),
  // or over run-off ground by the leg's layout. Two draw calls for the whole
  // leg, and every tree stands on the rendered ground.
  createForest() {
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    // A leg of bare rock (the gorge) has no forest at all
    if (!this.config.dressing.forest) return;
    // Higher, colder legs are mostly conifers; the last leg is snowed in. A leg
    // whose valley closes in moves toward its `closed` values with the ground.
    const { coniferShare, snowy, layout, closed } = this.config.dressing.forest;
    // The conifer share at the segment being planted (set by layoutAt)
    let share = coniferShare;
    const layoutAt = (index) => {
      if (!closed) return layout;
      const w = Terrain.closingAt(this.terrain, index);
      share = coniferShare + (closed.coniferShare - coniferShare) * w;
      const [fewest, most] = layout.perSegment;
      return {
        ...layout,
        perSegment: [
          Math.round(fewest + (closed.perSegment[0] - fewest) * w),
          Math.round(most + (closed.perSegment[1] - most) * w),
        ],
      };
    };

    const placements = { conifer: [], broadleaf: [] };
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // Everything about one tree once its spot is chosen: size, turn, tint, kind
    const plant = (x, z, groundY, lateral) => {
      // Trees right beside the road stay small so they do not wall off
      // the view across the valley
      const nearRoad = lateral < this.roadWidth / 2 + 9;
      const size = (nearRoad ? 0.55 : 0.8) + this.rand() * (nearRoad ? 0.35 : 0.75);
      position.set(x, groundY - 0.6, z);
      quaternion.setFromAxisAngle(up, this.rand() * Math.PI * 2);
      scale.set(size * (0.85 + this.rand() * 0.3), size, size * (0.85 + this.rand() * 0.3));
      matrix.compose(position, quaternion, scale);

      // Per-tree tint: mostly healthy green, the odd dry or dark one
      const tint = new THREE.Color().setHSL(
        0.24 + (this.rand() - 0.5) * 0.1,
        0.15 + this.rand() * 0.25,
        0.6 + this.rand() * 0.3,
        THREE.SRGBColorSpace,
      );
      if (snowy) tint.lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(1.5);

      const kind = this.rand() < share ? "conifer" : "broadleaf";
      placements[kind].push({ matrix: matrix.clone(), tint });
    };

    for (let index = startIdx; index <= endIdx; index++) {
      // No trees in a tunnel, a village, or the segment either side of one
      if (this.inSetPiece(index, 1)) continue;
      const point = this.roadPath[index];
      if (layout) {
        this.plantRunoffTrees(index, point, layoutAt(index), plant);
        continue;
      }
      // Trees per segment thin out with distance down the slope, on the side that drops
      const slope = Terrain.fallSignAt(this.terrain, index) || 1;
      const count = 5 + Math.floor(this.rand() * 4);
      for (let t = 0; t < count; t++) {
        const band = this.rand();
        const lateral = this.roadWidth / 2 + 3.5 + band * band * 85;
        const along = (this.rand() - 0.5) * 20;
        const x = point.x + slope * lateral * Math.cos(point.heading) + along * Math.sin(point.heading);
        const z = point.z - slope * lateral * Math.sin(point.heading) + along * Math.cos(point.heading);
        const groundY = this.groundYAt(x, z);
        if (groundY < this.floorY + 15) continue; // At the waterline
        plant(x, z, groundY, lateral);
      }
    }

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.5,
    });

    const build = (kind, geometry) => {
      const list = placements[kind];
      if (list.length === 0) {
        geometry.dispose();
        return;
      }
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.name = `forest-${kind}`;
      list.forEach((placement, n) => {
        mesh.setMatrixAt(n, placement.matrix);
        mesh.setColorAt(n, placement.tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // One mesh spans the whole leg: its own bounds say nothing about
      // where the instances are
      mesh.frustumCulled = false;
      mesh.userData.skipCulling = true;
      this.scene.add(mesh);
    };
    build("conifer", this.createConiferGeometry());
    build("broadleaf", this.createBroadleafGeometry());
  }

  // Rock breaking through the ground where a valley closes in: none in open
  // country, about `perSegment` a segment where it has closed. Each stands past
  // the rideable limit, so no bike reaches one, and has its centre below the
  // ground under it, so the rock shows as a cap the ground cuts and never
  // stands clear of a slope. One draw call for the leg.
  createOutcrops() {
    const outcrops = this.config.dressing.outcrops;
    if (!outcrops) return;
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);
    const halfRoad = this.roadWidth / 2;
    // Never in the river (the trees keep out of the same band)
    const exclude = (this.config.dressing.forest && this.config.dressing.forest.layout && this.config.dressing.forest.layout.exclude) || [];
    const placements = [];
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    for (let index = startIdx; index <= endIdx; index++) {
      const w = Terrain.closingAt(this.terrain, index);
      if (w <= 0) continue;
      const count = Math.floor(outcrops.perSegment * w + this.rand());
      const point = this.roadPath[index];
      for (let n = 0; n < count; n++) {
        const sign = this.rand() < 0.5 ? -1 : 1;
        const lateral = Terrain.rideableLimit(this.terrain, index, sign, halfRoad) + 4 + this.rand() * 70;
        const along = (this.rand() - 0.5) * 20;
        const size = (1.2 + this.rand() * 2.4) * (0.6 + 0.6 * w);
        euler.set(this.rand() * Math.PI, this.rand() * Math.PI, this.rand() * Math.PI);
        scale.set(size * (1 + this.rand() * 0.6), size * (0.6 + this.rand() * 0.5), size * (1 + this.rand() * 0.6));
        const shade = 0.65 + this.rand() * 0.35;
        const reach = Math.max(scale.x, scale.z) * 1.3;
        if (exclude.some((zone) => zone.sign === sign && lateral + reach >= zone.from && lateral - reach <= zone.to)) continue;
        const x = point.x + sign * lateral * Math.cos(point.heading) + along * Math.sin(point.heading);
        const z = point.z - sign * lateral * Math.sin(point.heading) + along * Math.cos(point.heading);
        position.set(x, this.groundYAt(x, z) - scale.y * 0.5, z);
        quaternion.setFromEuler(euler);
        placements.push({ matrix: new THREE.Matrix4().compose(position, quaternion, scale), shade });
      }
    }
    if (placements.length === 0) return;
    const geometry = this.displaceVertices(new THREE.IcosahedronGeometry(1, 1), 0.28);
    const material = new THREE.MeshStandardMaterial({ color: 0x67635c, roughness: 0.95, metalness: 0.0, flatShading: true, envMapIntensity: 0.2 });
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    const tint = new THREE.Color();
    placements.forEach(({ matrix, shade }, n) => {
      mesh.setMatrixAt(n, matrix);
      mesh.setColorAt(n, tint.setScalar(shade));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = "outcrops";
    // One mesh spans the leg: its own bounds say nothing about where the rocks are
    mesh.frustumCulled = false;
    mesh.userData.skipCulling = true;
    this.scene.add(mesh);
  }

  addEnvironmentalDetails() {
    // Rock formations and cliff details
    this.addRockFormations();

    // Forest on the valley slope below the road
    this.createForest();
    this.createOutcrops();

    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    // Bushes along the drop-side ledge only (only in active segment range)
    const bushGeometry = this.displaceVertices(new THREE.IcosahedronGeometry(1, 1), 0.2);
    const bushMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0x3d6b22,
        roughness: 0.9,
        metalness: 0.0,
        flatShading: true,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x5a8a2e, // Lighter scrub green for variety
        roughness: 0.9,
        metalness: 0.0,
        flatShading: true,
      }),
    ];

    for (let index = startIdx; index <= endIdx; index++) {
      const point = this.roadPath[index];
      if (index % 6 === 0 && !this.inSetPiece(index)) {
        // Less frequent
        // Bushes on the ledge lip of the side that drops (road height by
        // construction); on the wall side the lip is rock
        const ledge = Terrain.fallSignAt(this.terrain, index) || 1;
        const bushDistance = (this.roadWidth / 2 + 1.0 + this.rand() * 0.8) * ledge;
        const bushX = point.x + bushDistance * Math.cos(point.heading);
        const bushZ = point.z - bushDistance * Math.sin(point.heading);

        const leftBush = new THREE.Mesh(
          bushGeometry,
          bushMaterials[Math.floor(this.rand() * bushMaterials.length)],
        );
        const bushScale = 0.7 + this.rand() * 0.7;
        leftBush.scale.set(bushScale * 1.1, bushScale * 0.8, bushScale * 1.1);
        // Center slightly above the terrain model so the sphere is roughly
        // half embedded in the mountain slope (point.y - 0.3 buried bushes
        // placed where the face has already risen)
        leftBush.position.set(
          bushX,
          this.groundYAt(bushX, bushZ) + bushScale * 0.2,
          bushZ,
        );
        leftBush.castShadow = true;
        leftBush.receiveShadow = true;
        this.scene.add(leftBush);
        this.registerGrounded(leftBush, `roadside bush (segment ${index})`);

        // No bushes on cliff side
      }
    }

    // Small cones for track detail (not guard rails) (only in active segment range)
    const coneGeometry = new THREE.ConeGeometry(0.15, 0.5, 8);
    const coneMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4500,
      roughness: 0.8,
      metalness: 0.0,
    });

    for (let index = startIdx; index <= endIdx; index++) {
      const point = this.roadPath[index];
      if (index % 8 === 0 && index > 30 && index < this.roadPath.length - 5) {
        const coneY = point.y !== undefined ? point.y + 0.25 : 0.25;

        const nextIndex = Math.min(index + 1, this.roadPath.length - 1);
        const headingChange = Math.abs(
          this.roadPath[nextIndex].heading - point.heading,
        );

        if (headingChange < 0.01) {
          // Just off the road edge (still on the flat ledge of the terrain
          // model) regardless of the leg's road width
          const coneDistance = this.roadWidth / 2 + 0.5;
          const leftX = point.x - coneDistance * Math.cos(point.heading);
          const leftZ = point.z + coneDistance * Math.sin(point.heading);
          const leftCone = new THREE.Mesh(coneGeometry, coneMaterial);
          leftCone.position.set(leftX, coneY, leftZ);
          leftCone.castShadow = true;
          leftCone.receiveShadow = true;
          this.scene.add(leftCone);
          this.registerGrounded(leftCone, `track cone left (segment ${index})`);

          const rightX = point.x + coneDistance * Math.cos(point.heading);
          const rightZ = point.z - coneDistance * Math.sin(point.heading);
          const rightCone = new THREE.Mesh(coneGeometry, coneMaterial);
          rightCone.position.set(rightX, coneY, rightZ);
          rightCone.castShadow = true;
          rightCone.receiveShadow = true;
          this.scene.add(rightCone);
          this.registerGrounded(rightCone, `track cone right (segment ${index})`);
        }
      }
    }

    // Start sign - beside the road at the start of the active leg. The old
    // hardcoded world position (-5, 1, 10) ignored the road elevation (~31)
    // and the active leg entirely.
    const startSignPoint =
      this.roadPath[Math.min(Math.max(0, this.startSegment), this.roadPath.length - 1)];
    // On the roadside ledge of the side that drops, clear of a wall
    const startSignDistance = (this.roadWidth / 2 + 1) * (Terrain.fallSignAt(this.terrain, Math.max(0, this.startSegment)) || 1);
    const startSignX =
      startSignPoint.x + Math.cos(startSignPoint.heading) * startSignDistance;
    const startSignZ =
      startSignPoint.z - Math.sin(startSignPoint.heading) * startSignDistance;
    const startSignGroundY = this.groundYAt(startSignX, startSignZ);

    const signPostGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 8);
    const signPostMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
      metalness: 0.0,
    });
    const signPost = new THREE.Mesh(signPostGeometry, signPostMaterial);
    signPost.position.set(startSignX, startSignGroundY + 1, startSignZ);
    signPost.castShadow = true;
    signPost.receiveShadow = true;
    this.scene.add(signPost);
    this.registerGrounded(signPost, "start sign post");

    const signGeometry = new THREE.PlaneGeometry(2, 1);
    const signMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.0,
    });
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(startSignX, startSignGroundY + 2, startSignZ);
    sign.rotation.y = startSignPoint.heading;
    sign.castShadow = true;
    sign.receiveShadow = true;
    sign.userData.allowFloating = true; // Board mounted on the post
    this.scene.add(sign);

    // Posts along the road - especially on curves
    const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.5);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.0,
      emissive: 0x444444,
      emissiveIntensity: 0.12, // Posts stay readable at dusk
    });
    const reflectorGeometry = new THREE.BoxGeometry(0.2, 0.3, 0.05);
    // Red retro-reflector for curve posts - glows strongly at dusk/night
    const reflectorMaterial = new THREE.MeshStandardMaterial({
      color: 0xff2200,
      emissive: 0xff3300,
      emissiveIntensity: 0.85,
      roughness: 0.3,
      metalness: 0.2,
    });
    // White retro-reflector strip for straight-section delineator posts
    const whiteReflectorMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.2,
    });

    // Place road posts (only in active segment range)
    for (let index = startIdx; index <= endIdx; index++) {
      const point = this.roadPath[index];
      // (a tunnel has a lining of its own)
      if (index % 3 === 0 && !this.inSetPiece(index)) {
        // Every 3rd segment (60m spacing)
        // Posts on outside of curves, both sides on straights
        const nextIndex = Math.min(index + 1, this.roadPath.length - 1);
        const headingChange = this.roadPath[nextIndex].heading - point.heading;

        // Posts sit on the roadside ledge (terrain model = road height
        // there). y positions are relative to point.y - the old hardcoded
        // 0.75/1.2 ignored the road elevation (13-39), burying every post
        // far below the surface.
        const postDistance = this.roadWidth / 2 + 1;

        if (Math.abs(headingChange) < 0.01) {
          // Straight section - posts on both sides
          // Left post
          const leftX =
            point.x - postDistance * Math.sin(point.heading + Math.PI / 2);
          const leftZ =
            point.z - postDistance * Math.cos(point.heading + Math.PI / 2);
          const leftPost = new THREE.Mesh(postGeometry, postMaterial);
          leftPost.position.set(leftX, point.y + 0.75, leftZ);
          leftPost.castShadow = true;
          leftPost.receiveShadow = true;
          this.scene.add(leftPost);
          this.registerGrounded(leftPost, `delineator post left (segment ${index})`);

          // White reflector strip near the top of the post
          const leftReflector = new THREE.Mesh(
            reflectorGeometry,
            whiteReflectorMaterial,
          );
          leftReflector.position.set(leftX, point.y + 1.2, leftZ);
          leftReflector.rotation.y = point.heading;
          leftReflector.userData.allowFloating = true; // Mounted on the post
          this.scene.add(leftReflector);

          // Right post
          const rightX =
            point.x + postDistance * Math.sin(point.heading + Math.PI / 2);
          const rightZ =
            point.z + postDistance * Math.cos(point.heading + Math.PI / 2);
          const rightPost = new THREE.Mesh(postGeometry, postMaterial);
          rightPost.position.set(rightX, point.y + 0.75, rightZ);
          rightPost.castShadow = true;
          rightPost.receiveShadow = true;
          this.scene.add(rightPost);
          this.registerGrounded(rightPost, `delineator post right (segment ${index})`);

          const rightReflector = new THREE.Mesh(
            reflectorGeometry,
            whiteReflectorMaterial,
          );
          rightReflector.position.set(rightX, point.y + 1.2, rightZ);
          rightReflector.rotation.y = point.heading;
          rightReflector.userData.allowFloating = true; // Mounted on the post
          this.scene.add(rightReflector);
        } else {
          // Curve - post on outside only
          const side = headingChange > 0 ? -1 : 1; // Outside of curve
          const postX =
            point.x +
            side * postDistance * Math.sin(point.heading + Math.PI / 2);
          const postZ =
            point.z +
            side * postDistance * Math.cos(point.heading + Math.PI / 2);
          const post = new THREE.Mesh(postGeometry, postMaterial);
          post.position.set(postX, point.y + 0.75, postZ);
          post.castShadow = true;
          post.receiveShadow = true;
          this.scene.add(post);
          this.registerGrounded(post, `curve post (segment ${index})`);

          // Add reflector
          const reflector = new THREE.Mesh(
            reflectorGeometry,
            reflectorMaterial,
          );
          reflector.position.set(postX, point.y + 1.2, postZ);
          reflector.rotation.y = point.heading;
          reflector.castShadow = true;
          reflector.receiveShadow = true;
          reflector.userData.allowFloating = true; // Mounted on the post
          this.scene.add(reflector);
        }
      }
    }
  }

  createRoadworks() {
    // Place construction zones relative to the ACTIVE LEG rather than at
    // hardcoded full-track segments (27-29/48-49), which only fell inside
    // legs 1-2 and left floating geometry + phantom collision obstacles when
    // other legs were rendered.
    const legStart = this.startSegment;
    const legEnd = Math.min(this.endSegment, this.roadPath.length - 1);
    const legLength = legEnd - legStart;

    const majorStart = legStart + Math.floor(legLength * 0.55);
    const minorStart = legStart + Math.floor(legLength * 0.85);

    const roadworksLocations = [
      {
        startSegment: majorStart,
        endSegment: majorStart + 2,
        hasRamp: true,
        type: "major",
      }, // Mid-leg major construction with jump
      {
        startSegment: minorStart,
        endSegment: minorStart + 1,
        hasRamp: false,
        type: "minor",
      }, // Near end minor repairs
    ];

    roadworksLocations.forEach((zone) => {
      this.createConstructionZone(
        zone.startSegment,
        zone.endSegment,
        zone.hasRamp,
        zone.type,
      );
    });
  }

  createConstructionZone(
    startSegment,
    endSegment,
    hasRamp = true,
    zoneType = "major",
  ) {
    // Ensure segments are valid
    if (
      startSegment >= this.roadPath.length ||
      endSegment >= this.roadPath.length
    ) {
      return;
    }

    const startPoint = this.roadPath[startSegment];
    const endPoint = this.roadPath[endSegment];

    // Create orange traffic cones along the construction zone
    const coneGeometry = new THREE.ConeGeometry(0.3, 0.8, 6);
    const coneMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.8,
      metalness: 0.1,
    });

    // Add white reflective stripes to cones
    const stripeGeometry = new THREE.RingGeometry(0.28, 0.32, 6);
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.5,
    });

    // Place cones with appropriate density based on zone type
    const coneSpacing = zoneType === "major" ? 3 : 5; // Major zones have closer cones

    for (let i = startSegment - 1; i <= endSegment + 1; i++) {
      if (i < 0 || i >= this.roadPath.length) continue;
      const point = this.roadPath[i];

      // Place cones at intervals
      const conesPerSegment = zoneType === "major" ? 3 : 2; // Fewer cones
      for (let j = 0; j < conesPerSegment; j++) {
        const progress = j / conesPerSegment;
        const nextIndex = Math.min(i + 1, this.roadPath.length - 1);
        const nextPoint = this.roadPath[nextIndex];

        // Interpolate position along segment
        const x = point.x + (nextPoint.x - point.x) * progress;
        const z = point.z + (nextPoint.z - point.z) * progress;
        const y = point.y + (nextPoint.y - point.y) * progress;
        const heading = point.heading;

        // Place cone at lane divider
        const laneOffset = zoneType === "major" ? -0.5 : 0; // Major zones push traffic more left
        const coneX = x + Math.cos(heading) * laneOffset;
        const coneZ = z - Math.sin(heading) * laneOffset;

        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.set(coneX, y + 0.4, coneZ);
        cone.castShadow = true;
        cone.receiveShadow = true;
        this.scene.add(cone);
        this.registerGrounded(cone, `construction cone (segment ${i})`);

        // Add reflective stripe band near the cone base (the ring radius
        // 0.28-0.32 matches the cone surface just above the base; at the old
        // +0.6 height it floated as a detached halo around the cone tip)
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.copy(cone.position);
        stripe.position.y -= 0.32;
        stripe.rotation.x = -Math.PI / 2;
        stripe.userData.allowFloating = true; // Decal band on the cone
        this.scene.add(stripe);

        // For major zones only, add edge cones
        if (
          zoneType === "major" &&
          i >= startSegment &&
          i <= endSegment &&
          j === 0
        ) {
          const rightCone = cone.clone();
          const rightX = x + Math.cos(heading) * 4; // Right lane edge
          const rightZ = z - Math.sin(heading) * 4;
          rightCone.position.set(rightX, y + 0.4, rightZ);
          rightCone.castShadow = true;
          rightCone.receiveShadow = true;
          this.scene.add(rightCone);
          this.registerGrounded(rightCone, `construction edge cone (segment ${i})`);
        }
      }
    }

    // Add fewer warning cones before major construction zones
    if (zoneType === "major") {
      const warningDistance = 5; // Shorter warning distance
      for (let i = startSegment - warningDistance; i < startSegment - 1; i++) {
        if (i < 0) continue;
        const point = this.roadPath[i];

        if (i % 3 === 0) {
          // Every third segment only
          // Simple warning cone on right side
          const rightCone = new THREE.Mesh(coneGeometry, coneMaterial);
          rightCone.position.set(
            point.x + Math.cos(point.heading) * 5,
            point.y + 0.4,
            point.z - Math.sin(point.heading) * 5,
          );
          rightCone.castShadow = true;
          rightCone.receiveShadow = true;
          this.scene.add(rightCone);
          this.registerGrounded(rightCone, `warning cone (segment ${i})`);
        }
      }
    }

    // Create construction barriers (Jersey barriers)
    const barrierGeometry = new THREE.BoxGeometry(4, 1, 0.8);
    const barrierMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.95,
      metalness: 0.05,
    });

    // Calculate ramp position to avoid placing barriers there
    const rampSegment = hasRamp
      ? Math.floor((startSegment + endSegment) / 2)
      : null;

    // Place barriers along the construction zone (skip around ramp)
    for (let i = startSegment; i <= endSegment; i += 2) {
      // Skip placing barriers near the ramp (within 4 segments), and up a wall
      if (hasRamp && Math.abs(i - rampSegment) <= 4) {
        continue;
      }
      if (!this.solidClutter) continue;

      const point = this.roadPath[i];

      // Place barrier on left side (mountain side) to avoid floating over cliff
      const barrierX = point.x - Math.cos(point.heading) * this.plantLateral.barrier;
      const barrierZ = point.z + Math.sin(point.heading) * this.plantLateral.barrier;

      // The mountain face has risen well above road height 25 units out, so
      // rest the barrier on the terrain model (the old point.y left it at
      // road height inside the wall). Collision entry matches the visual.
      const barrierY = this.groundYAt(barrierX, barrierZ) + 0.5;

      const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
      barrier.position.set(barrierX, barrierY, barrierZ);
      barrier.rotation.y = point.heading;
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      this.scene.add(barrier);
      this.registerGrounded(barrier, `construction barrier (segment ${i})`);

      // Store barrier for collision detection: a circle of radius 1 for each
      // 2 m of its length (it lies across the road)
      for (const along of [-1, 1]) {
        this.addSolidCircle(
          barrierX + Math.cos(point.heading) * along,
          barrierY,
          barrierZ - Math.sin(point.heading) * along,
          1,
          3,
          "barrier",
        );
      }

      // Add orange and white stripes
      const stripeTexture = this.createConstructionStripeTexture();
      const stripePanelGeometry = new THREE.PlaneGeometry(4, 0.3);
      const stripePanelMaterial = new THREE.MeshStandardMaterial({
        map: stripeTexture,
        side: THREE.DoubleSide,
      });

      const stripePanel = new THREE.Mesh(
        stripePanelGeometry,
        stripePanelMaterial,
      );
      stripePanel.position.copy(barrier.position);
      stripePanel.position.y += 0.7;
      stripePanel.rotation.y = barrier.rotation.y;
      stripePanel.userData.allowFloating = true; // Mounted atop the barrier
      this.scene.add(stripePanel);
    }

    // Only add ramp and heavy equipment for major construction zones
    if (hasRamp && zoneType === "major") {
      const midSegment = Math.floor((startSegment + endSegment) / 2);
      const rampPoint = this.roadPath[midSegment];

      // Move ramp to the right-hand lane
      const offsetPoint = {
        x: rampPoint.x + Math.cos(rampPoint.heading) * 5, // Right lane position
        z: rampPoint.z - Math.sin(rampPoint.heading) * 5,
        y: rampPoint.y,
        heading: rampPoint.heading,
      };

      this.createDirtRamp(offsetPoint, midSegment);

      // Add construction equipment (static bulldozer) - moved far from road
      // on mountain side, resting on the terrain model (the mountain face
      // has risen well above road height 30 units out)
      if (this.solidClutter) {
        const dozerX = rampPoint.x - Math.cos(rampPoint.heading) * this.plantLateral.bulldozer;
        const dozerZ = rampPoint.z + Math.sin(rampPoint.heading) * this.plantLateral.bulldozer;
        this.createBulldozer(
          dozerX,
          this.groundYAt(dozerX, dozerZ),
          dozerZ,
          rampPoint.heading,
        );
      }

      // Add shipping containers for collision - positioned on mountain side to avoid drop-off
      // Placed at -6 and -7 units (left side) for better visibility while avoiding dirt pile
      this.createShippingContainer(
        rampPoint.x - Math.cos(rampPoint.heading) * 6,
        rampPoint.y,
        rampPoint.z + Math.sin(rampPoint.heading) * 6,
        rampPoint.heading,
      );

      this.createShippingContainer(
        rampPoint.x - Math.cos(rampPoint.heading) * 7,
        rampPoint.y,
        rampPoint.z + Math.sin(rampPoint.heading) * 7,
        rampPoint.heading + Math.PI / 2,
      );
    } else if (zoneType === "minor") {
      // For minor zones, just add some work equipment
      const workPoint = this.roadPath[startSegment];

      // Add a simple work truck instead of bulldozer (moved far from road on
      // mountain side, resting on the terrain model rather than at road
      // height inside the rising mountain face)
      if (this.solidClutter) {
        const truckX = workPoint.x - Math.cos(workPoint.heading) * this.plantLateral.truck;
        const truckZ = workPoint.z + Math.sin(workPoint.heading) * this.plantLateral.truck;
        this.createWorkTruck(
          truckX,
          this.groundYAt(truckX, truckZ),
          truckZ,
          workPoint.heading,
        );
      }
    }

    // Add appropriate signage based on zone type
    if (zoneType === "major") {
      this.createConstructionSign(
        this.roadPath[Math.max(0, startSegment - 5)],
        "ROAD WORK AHEAD",
      );
    } else {
      // Minor zones just get a simple sign
      this.createConstructionSign(
        this.roadPath[Math.max(0, startSegment - 3)],
        "SLOW",
      );
    }

    // Store construction zone info for traffic AI
    this.roadworksZones.push({
      startSegment: startSegment,
      endSegment: endSegment,
      blockedLane: "right",
      rampSegment: hasRamp ? Math.floor((startSegment + endSegment) / 2) : null,
      type: zoneType,
      hasRamp: hasRamp,
    });
  }

  createDirtRamp(point, segmentIndex) {
    // Create dirt pile geometry - more irregular and mound-like
    const pileWidth = 5; // Narrower dirt pile
    const pileLength = 10; // Shorter than ramp
    const pileHeight = 1.5; // Half height

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const uvs = [];

    // Create irregular dirt pile shape
    const segments = 12;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -pileLength / 2 + pileLength * t;

      // Create mound-like height profile with irregularities
      let baseHeight;
      if (t < 0.3) {
        // Gentle rise at start
        baseHeight = (t / 0.3) * pileHeight * 0.4;
      } else if (t < 0.7) {
        // Peak in middle with some variation
        const peakProgress = (t - 0.3) / 0.4;
        baseHeight =
          pileHeight * (0.4 + 0.6 * Math.sin(peakProgress * Math.PI));
      } else {
        // Fall off at end
        const fallProgress = (t - 0.7) / 0.3;
        baseHeight = pileHeight * Math.cos((fallProgress * Math.PI) / 2) * 0.8;
      }

      // Add random height variations to make it look like piled dirt
      const heightVariation = (Math.sin(t * 15) + Math.cos(t * 8)) * 0.3;
      const y = Math.max(0, baseHeight + heightVariation);

      // Vary width to make it look less uniform
      const widthVariation = Math.sin(t * 6) * 0.5;
      const currentWidth = pileWidth + widthVariation;

      // Add width vertices with some asymmetry
      vertices.push(-currentWidth / 2, y, z);
      vertices.push(currentWidth / 2, y, z);

      uvs.push(0, t);
      uvs.push(1, t);
    }

    // Create triangles
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;

      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    // Add sides with irregular dirt pile profile
    const sideStart = vertices.length / 3;

    // Left side
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -pileLength / 2 + pileLength * t;

      // Get the corresponding top vertex height
      const topVertexIndex = i * 2;
      const topY = vertices[topVertexIndex * 3 + 1]; // Y coordinate of left top vertex

      // Add some base variation
      const baseVariation = Math.sin(t * 8) * 0.2;
      const baseY = Math.max(0, baseVariation);

      vertices.push(-pileWidth / 2 - Math.sin(t * 4) * 0.3, baseY, z);
      vertices.push(-pileWidth / 2 - Math.sin(t * 4) * 0.3, topY, z);

      uvs.push(0, t);
      uvs.push(0.2, t);
    }

    // Right side
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -pileLength / 2 + pileLength * t;

      // Get the corresponding top vertex height
      const topVertexIndex = i * 2 + 1;
      const topY = vertices[topVertexIndex * 3 + 1]; // Y coordinate of right top vertex

      // Add some base variation
      const baseVariation = Math.cos(t * 6) * 0.2;
      const baseY = Math.max(0, baseVariation);

      vertices.push(pileWidth / 2 + Math.cos(t * 5) * 0.3, baseY, z);
      vertices.push(pileWidth / 2 + Math.cos(t * 5) * 0.3, topY, z);

      uvs.push(0.8, t);
      uvs.push(1, t);
    }

    // Create side triangles
    for (let s = 0; s < 2; s++) {
      const offset = sideStart + s * (segments + 1) * 2;
      for (let i = 0; i < segments; i++) {
        const a = offset + i * 2;
        const b = offset + i * 2 + 1;
        const c = offset + (i + 1) * 2;
        const d = offset + (i + 1) * 2 + 1;

        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // Create dirt material with texture
    const dirtTexture = this.createDirtTexture();
    const dirtMaterialProps = {
      roughness: 0.98,
      metalness: 0.0,
    };
    if (dirtTexture) {
      dirtMaterialProps.map = dirtTexture;
      dirtMaterialProps.color = 0xffffff; // White base to let texture colors show through
    } else {
      dirtMaterialProps.color = 0x3a2210; // Very dark brown dirt fallback
    }
    const dirtMaterial = new THREE.MeshStandardMaterial(dirtMaterialProps);

    const ramp = new THREE.Mesh(geometry, dirtMaterial);
    ramp.position.set(point.x, point.y, point.z);
    ramp.rotation.y = point.heading;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    this.scene.add(ramp);
    this.registerGrounded(ramp, `dirt ramp (segment ${segmentIndex})`);

    // Store ramp info for collision detection
    this.jumpRamps.push({
      position: new THREE.Vector3(point.x, point.y, point.z),
      rotation: point.heading,
      width: pileWidth,
      length: pileLength,
      height: pileHeight,
      segmentIndex: segmentIndex,
    });
  }

  createDirtTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    // Base dirt color - very dark brown tones
    ctx.fillStyle = "#3A2210";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add large dirt clumps and variations
    for (let i = 0; i < 150; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const radius = this.rand() * 4 + 1;
      const brightness = this.rand() * 60 - 30;

      // Vary between very dark dirt tones
      const r = Math.max(
        0,
        Math.min(255, 58 + brightness + this.rand() * 15),
      );
      const g = Math.max(
        0,
        Math.min(255, 34 + brightness + this.rand() * 12),
      );
      const b = Math.max(0, Math.min(255, 16 + brightness + this.rand() * 8));

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add darker soil patches
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 25; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const width = this.rand() * 25 + 8;
      const height = this.rand() * 25 + 8;

      ctx.fillStyle = "#281810";
      ctx.fillRect(x, y, width, height);
    }

    // Add some small rocks/pebbles
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 40; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const size = this.rand() * 2 + 1;

      ctx.fillStyle = "#666666";
      ctx.fillRect(x, y, size, size);
    }

    // Add sparse grass patches on top
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 15; i++) {
      const x = this.rand() * canvas.width;
      const y = this.rand() * canvas.height;
      const width = this.rand() * 20 + 5;
      const height = this.rand() * 15 + 3;

      ctx.fillStyle = "#228B22";
      ctx.fillRect(x, y, width, height);
    }

    // Add tire tracks or disturbance marks
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#2F1B14";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      const startX = this.rand() * canvas.width;
      const startY = this.rand() * canvas.height;
      ctx.moveTo(startX, startY);

      // Create irregular track marks
      for (let j = 0; j < 5; j++) {
        const nextX = startX + (this.rand() - 0.5) * 30;
        const nextY = startY + this.rand() * 20;
        ctx.lineTo(nextX, nextY);
      }
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createConstructionStripeTexture() {
    // Cache - this is called once per barrier in a loop
    if (this.constructionStripeTexture !== undefined) {
      return this.constructionStripeTexture;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");

    // Orange and white diagonal stripes
    const stripeWidth = 32;
    ctx.fillStyle = "#FF6600";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#FFFFFF";
    for (
      let i = -canvas.height;
      i < canvas.width + canvas.height;
      i += stripeWidth * 2
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + stripeWidth, 0);
      ctx.lineTo(i + stripeWidth + canvas.height, canvas.height);
      ctx.lineTo(i + canvas.height, canvas.height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    this.constructionStripeTexture = texture;
    return texture;
  }

  createBulldozer(x, y, z, rotation) {
    const group = new THREE.Group();

    // Main body
    const bodyGeometry = new THREE.BoxGeometry(3, 2, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.7,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0, 1, 0);
    group.add(body);

    // Cabin
    const cabinGeometry = new THREE.BoxGeometry(2, 2, 2);
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.7,
      metalness: 0.3,
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(0, 2.5, -1);
    group.add(cabin);

    // Blade
    const bladeGeometry = new THREE.BoxGeometry(4, 1.5, 0.3);
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.9,
      metalness: 0.8,
    });
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.position.set(0, 0.75, 2.5);
    blade.rotation.x = -0.2;
    group.add(blade);

    // Tracks
    const trackGeometry = new THREE.BoxGeometry(1, 1, 4.5);
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.95,
      metalness: 0.1,
    });

    const leftTrack = new THREE.Mesh(trackGeometry, trackMaterial);
    leftTrack.position.set(-1.8, 0.5, 0);
    group.add(leftTrack);

    const rightTrack = new THREE.Mesh(trackGeometry, trackMaterial);
    rightTrack.position.set(1.8, 0.5, 0);
    group.add(rightTrack);

    group.position.set(x, y, z);
    group.rotation.y = rotation;
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(group);
    this.registerGrounded(group, "construction bulldozer");

    // Store bulldozer for collision detection: one circle of radius 3
    this.addSolidCircle(x, y, z, 3, 3, "bulldozer");
  }

  // Lettered face for a 4 x 1.5 sign board. The boards were blank: their
  // text was passed in and never drawn. The face sits on the side the rider
  // approaches from (local -Z once the sign is turned to the road heading).
  createSignFace(text, background, ink) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 10;
    ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Shrink long messages to fit the board
    let fontSize = 92;
    do {
      ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
      fontSize -= 4;
    } while (ctx.measureText(text).width > canvas.width - 60 && fontSize > 24);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(3.9, 1.4),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.6,
        metalness: 0.0,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: 0.25, // Retro-reflective: readable at dusk
      }),
    );
    face.position.set(0, 3, -0.06);
    face.rotation.y = Math.PI;
    return face;
  }

  createConstructionSign(point, text) {
    const signGroup = new THREE.Group();

    // Sign post
    const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8,
      metalness: 0.5,
    });
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(0, 1.5, 0);
    signGroup.add(post);

    // Sign board
    const boardGeometry = new THREE.BoxGeometry(4, 1.5, 0.1);
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.9,
      metalness: 0.1,
      emissive: 0xff6600,
      emissiveIntensity: 0.1,
    });
    const board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.position.set(0, 3, 0);
    signGroup.add(board);
    signGroup.add(this.createSignFace(text, "#ff6600", "#111111"));

    // Position sign beside road (roadWidth-relative, base on the terrain model)
    const signDistance = this.roadWidth / 2 + 1.2;
    const signX = point.x - Math.cos(point.heading) * signDistance;
    const signZ = point.z + Math.sin(point.heading) * signDistance;

    signGroup.position.set(signX, this.groundYAt(signX, signZ), signZ);
    signGroup.rotation.y = point.heading;

    signGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(signGroup);
    this.registerGrounded(signGroup, `construction sign "${text}"`);
  }

  createWorkTruck(x, y, z, rotation) {
    const group = new THREE.Group();

    // Truck body (smaller than bulldozer)
    const bodyGeometry = new THREE.BoxGeometry(2, 1.5, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa500, // Orange work truck
      roughness: 0.7,
      metalness: 0.2,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0, 0.75, 0);
    group.add(body);

    // Truck cab
    const cabGeometry = new THREE.BoxGeometry(1.8, 1.2, 1.5);
    const cabMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa500,
      roughness: 0.7,
      metalness: 0.2,
    });
    const cab = new THREE.Mesh(cabGeometry, cabMaterial);
    cab.position.set(0, 1.5, 1);
    group.add(cab);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8);
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.95,
      metalness: 0.1,
    });

    const wheelPositions = [
      { x: -0.8, y: 0.3, z: 1.5 },
      { x: 0.8, y: 0.3, z: 1.5 },
      { x: -0.8, y: 0.3, z: -1.5 },
      { x: 0.8, y: 0.3, z: -1.5 },
    ];

    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(pos.x, pos.y, pos.z);
      wheel.rotation.z = Math.PI / 2;
      group.add(wheel);
    });

    // Work light on top
    const lightBarGeometry = new THREE.BoxGeometry(1.5, 0.2, 0.2);
    const lightBarMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 0.3,
    });
    const lightBar = new THREE.Mesh(lightBarGeometry, lightBarMaterial);
    lightBar.position.set(0, 2.2, 1);
    group.add(lightBar);

    group.position.set(x, y, z);
    group.rotation.y = rotation;
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(group);
    this.registerGrounded(group, "work truck");

    // Store work truck for collision detection: two circles of radius 2 along
    // its length
    for (const along of [-1, 1]) {
      this.addSolidCircle(
        x + Math.sin(rotation) * along,
        y,
        z + Math.cos(rotation) * along,
        2,
        3,
        "work truck",
      );
    }
  }

  createShippingContainer(x, y, z, rotation) {
    // Create shipping container geometry
    const containerGeometry = new THREE.BoxGeometry(2.5, 2.5, 6);
    const containerMaterial = new THREE.MeshStandardMaterial({
      color: 0xaa3318, // Even darker orange for visibility
      roughness: 0.9,
      metalness: 0.1,
    });

    const container = new THREE.Mesh(containerGeometry, containerMaterial);

    // Add hazard stripes for visibility
    const stripeGeometry = new THREE.PlaneGeometry(2.4, 0.3);
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000, // Black hazard stripes
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });

    // Add hazard stripes on all sides
    const stripePositions = [
      // Front and back
      { position: [0, 0.6, 3.01], rotation: [0, 0, 0] },
      { position: [0, 0, 3.01], rotation: [0, 0, 0] },
      { position: [0, -0.6, 3.01], rotation: [0, 0, 0] },
      { position: [0, 0.6, -3.01], rotation: [0, Math.PI, 0] },
      { position: [0, 0, -3.01], rotation: [0, Math.PI, 0] },
      { position: [0, -0.6, -3.01], rotation: [0, Math.PI, 0] },
      // Sides
      { position: [1.26, 0.6, 0], rotation: [0, Math.PI / 2, 0] },
      { position: [1.26, 0, 0], rotation: [0, Math.PI / 2, 0] },
      { position: [1.26, -0.6, 0], rotation: [0, Math.PI / 2, 0] },
      { position: [-1.26, 0.6, 0], rotation: [0, -Math.PI / 2, 0] },
      { position: [-1.26, 0, 0], rotation: [0, -Math.PI / 2, 0] },
      { position: [-1.26, -0.6, 0], rotation: [0, -Math.PI / 2, 0] },
    ];

    stripePositions.forEach((stripe) => {
      const hazardStripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      hazardStripe.position.set(...stripe.position);
      hazardStripe.rotation.set(...stripe.rotation);
      container.add(hazardStripe);
    });

    container.position.set(x, y + 1.25, z); // Center at ground level + half height
    container.rotation.y = rotation;

    container.castShadow = true;
    container.receiveShadow = true;
    this.scene.add(container);
    this.registerGrounded(container, "shipping container");

    // Store container for collision detection
    this.roadworkObstacles.push({
      type: "container",
      position: new THREE.Vector3(x, y + 1.25, z),
      width: 2.5,
      height: 2.5,
      depth: 6,
      rotation: rotation,
    });
  }

  addHairpinWarnings() {
    // Detect hairpins from the actual road geometry (runs of sharp heading
    // change within the active leg) instead of a hardcoded segment count from
    // an obsolete layout - which placed warnings on a straight in Leg 2 and
    // left the real hairpins in Leg 5 unmarked.
    // Hairpins turn at 0.125-0.14 rad/segment in the doubled layout; the
    // sharpest ordinary corners are 0.075
    const hairpinTurnRate = 0.1;
    const hairpins = [];
    const scanStart = Math.max(1, this.startSegment);
    const scanEnd = Math.min(this.endSegment, this.roadPath.length - 1);

    let runStart = -1;
    let runDirection = 0;
    for (let i = scanStart; i <= scanEnd + 1; i++) {
      const delta =
        i <= scanEnd
          ? this.roadPath[i].heading - this.roadPath[i - 1].heading
          : 0;
      const isSharp = Math.abs(delta) >= hairpinTurnRate;
      if (isSharp && runStart === -1) {
        runStart = i - 1;
        runDirection = Math.sign(delta);
      } else if (!isSharp && runStart !== -1) {
        hairpins.push({ start: runStart, end: i - 1, direction: runDirection });
        runStart = -1;
      }
    }

    hairpins.forEach((hairpin) => {
      this.createHairpinWarningsFor(hairpin);
    });
  }

  createHairpinWarningsFor(hairpin) {
    const turnLength = hairpin.end - hairpin.start;
    // Outside of the turn: right turn (positive heading delta) -> left side
    const outsideSide = -hairpin.direction;
    const chevronDirection = hairpin.direction > 0 ? "right" : "left";

    // Add warning signs before the hairpin
    this.createHairpinSign(
      this.roadPath[Math.max(0, hairpin.start - 5)],
      "EXTREME HAIRPIN",
    );

    this.createHairpinSign(
      this.roadPath[Math.max(0, hairpin.start - 3)],
      "SLOW DOWN!",
    );

    // Add chevron markers through the turn
    for (let i = 0; i <= turnLength; i++) {
      if (hairpin.start + i >= this.roadPath.length) break;
      const point = this.roadPath[hairpin.start + i];
      this.createChevronMarker(point, chevronDirection);
    }

    // Add safety barriers on the outside of the hairpin
    for (let i = -1; i <= turnLength + 1; i++) {
      const segmentIndex = hairpin.start + i;
      if (segmentIndex < 0 || segmentIndex >= this.roadPath.length) continue;

      const point = this.roadPath[segmentIndex];

      // Place barrier on the outside of the turn, clear of the road surface
      // and its 2m ledge (these barriers are collidable)
      const barrierDistance = this.roadWidth / 2 + 2.5;
      const barrierX =
        point.x + Math.cos(point.heading) * barrierDistance * outsideSide;
      const barrierZ =
        point.z - Math.sin(point.heading) * barrierDistance * outsideSide;

      // Rest the barrier on the terrain model: 2.5 units off the road edge
      // is just past the 2m ledge, where the cliff has started to drop on
      // the right (and the wall to rise on the left), so road height alone
      // left cliff-side barriers hovering. Collision entry matches.
      const barrierY = this.groundYAt(barrierX, barrierZ) + 0.6;

      // Create red and white striped barrier
      const barrierGeometry = new THREE.BoxGeometry(3, 1.2, 0.5);
      const barrierMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.9,
        metalness: 0.1,
      });

      const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
      barrier.position.set(barrierX, barrierY, barrierZ);
      // The box is long in local X: turn it to run along the road
      barrier.rotation.y = point.heading + Math.PI / 2;
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      this.scene.add(barrier);
      this.registerGrounded(barrier, `hairpin barrier (segment ${segmentIndex})`);

      // Store hairpin barrier for collision detection
      this.roadworkObstacles.push({
        type: "hairpin_barrier",
        position: new THREE.Vector3(barrierX, barrierY, barrierZ),
        width: 3,
        height: 1.2,
        depth: 0.5,
      });

      // Add white stripes
      const stripeGeometry = new THREE.BoxGeometry(0.5, 1.2, 0.51);
      const stripeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.1,
      });

      for (let s = -1; s <= 1; s++) {
        // A child of the barrier, so it rides wherever the barrier is grounded
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position
          .set(Math.sin(point.heading) * s * 0.8, 0, Math.cos(point.heading) * s * 0.8)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), -barrier.rotation.y);
        stripe.userData.barrierStripe = true;
        barrier.add(stripe);
      }
    }
  }

  createHairpinSign(point, text) {
    const signGroup = new THREE.Group();

    // Sign post
    const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8,
      metalness: 0.5,
    });
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(0, 1.5, 0);
    signGroup.add(post);

    // Warning sign board - yellow with black text
    const boardGeometry = new THREE.BoxGeometry(4, 1.5, 0.1);
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdd00,
      roughness: 0.9,
      metalness: 0.1,
      emissive: 0xffdd00,
      emissiveIntensity: 0.2,
    });
    const board = new THREE.Mesh(boardGeometry, boardMaterial);
    board.position.set(0, 3, 0);
    signGroup.add(board);
    signGroup.add(this.createSignFace(text, "#ffdd00", "#111111"));

    // Position sign beside road (roadWidth-relative, base on the terrain model)
    const signDistance = this.roadWidth / 2 + 1.2;
    const signX = point.x - Math.cos(point.heading) * signDistance;
    const signZ = point.z + Math.sin(point.heading) * signDistance;

    signGroup.position.set(signX, this.groundYAt(signX, signZ), signZ);
    signGroup.rotation.y = point.heading;

    signGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(signGroup);
    this.registerGrounded(signGroup, `hairpin warning sign "${text}"`);
  }

  createChevronMarker(point, direction) {
    // Create chevron arrow marker pointing the direction of the turn
    const chevronGroup = new THREE.Group();

    // Post
    const postGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.8,
      metalness: 0.5,
    });
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(0, 0.75, 0);
    chevronGroup.add(post);

    // Chevron shape (arrow)
    const chevronGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -0.5, 0, 0, 0, 0, -0.3, 0.5, 0, 0, 0.5, 0.3, 0, 0, 0.3, -0.3, -0.5, 0.3,
      0,
    ]);
    const indices = [0, 1, 4, 0, 4, 5, 1, 2, 3, 1, 3, 4];
    chevronGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(vertices, 3),
    );
    chevronGeometry.setIndex(indices);
    chevronGeometry.computeVertexNormals();

    const chevronMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.3,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const chevron = new THREE.Mesh(chevronGeometry, chevronMaterial);
    chevron.position.set(0, 1.8, 0);
    chevron.scale.set(1.5, 1.5, 1.5);

    // Rotate chevron to point right for right turn
    if (direction === "right") {
      chevron.rotation.y = Math.PI / 2;
    } else {
      chevron.rotation.y = -Math.PI / 2;
    }

    chevronGroup.add(chevron);

    // Position on outside of turn (roadWidth-relative so the marker sits on
    // the roadside ledge, base on the terrain model)
    const markerDistance = this.roadWidth / 2 + 1;
    // Right turn -> left (mountain) side, left turn -> right (valley) side
    const markerSide = direction === "right" ? -1 : 1;
    const markerX = point.x + Math.cos(point.heading) * markerDistance * markerSide;
    const markerZ = point.z - Math.sin(point.heading) * markerDistance * markerSide;

    chevronGroup.position.set(markerX, this.groundYAt(markerX, markerZ), markerZ);
    chevronGroup.rotation.y = point.heading;

    chevronGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(chevronGroup);
    this.registerGrounded(chevronGroup, "chevron marker");
  }

  createRoadworksStripeTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");

    // Create red and white diagonal stripes
    const stripeWidth = 8;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#FF0000";
    for (
      let i = -canvas.height;
      i < canvas.width + canvas.height;
      i += stripeWidth * 2
    ) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + stripeWidth, 0);
      ctx.lineTo(i + stripeWidth - canvas.height, canvas.height);
      ctx.lineTo(i - canvas.height, canvas.height);
      ctx.closePath();
      ctx.fill();
    }

    // TEMP DISABLED to debug render issue
    return null;
    // const texture = new THREE.CanvasTexture(canvas);
    // texture.wrapS = THREE.RepeatWrapping;
    // texture.wrapT = THREE.RepeatWrapping;
    // return texture;
  }

  // How far a gate at a segment reaches to each side of the centre line: the
  // road and its ledges, or out across the run-off ground a bike can ride on
  gateReach(segmentIndex) {
    const halfRoad = this.roadWidth / 2;
    return {
      left: Terrain.gateReach(this.terrain, segmentIndex, -1, halfRoad),
      right: Terrain.gateReach(this.terrain, segmentIndex, 1, halfRoad),
    };
  }

  // Where a gate reaches across run-off ground, one thin post on each side
  // shows the rider its extent. Nothing is added when the gate stops at the
  // road's own ledges.
  createGateLimitPosts(point, reach, label) {
    const halfRoad = this.roadWidth / 2;
    const post = new THREE.CylinderGeometry(0.06, 0.06, 3);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, emissive: 0x444444, emissiveIntensity: 0.12 });
    for (const [sign, side] of [[-1, reach.left], [1, reach.right]]) {
      if (side <= halfRoad + 2) continue;
      const lateral = side - 2;
      const x = point.x + sign * lateral * Math.cos(point.heading);
      const z = point.z - sign * lateral * Math.sin(point.heading);
      const mesh = new THREE.Mesh(post, material);
      mesh.position.set(x, this.groundYAt(x, z) + 1.5, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.registerGrounded(mesh, `${label} limit post`);
    }
  }

  // The road's centre line at a fractional segment index (straights only: the
  // set pieces sit on them, so the heading is the nearest point's)
  pointAtSegment(s) {
    const a = Math.floor(s);
    const f = s - a;
    const p = this.roadPath[a];
    const q = this.roadPath[Math.min(a + 1, this.roadPath.length - 1)];
    return {
      x: p.x + (q.x - p.x) * f,
      y: p.y + (q.y - p.y) * f,
      z: p.z + (q.z - p.z) * f,
      heading: p.heading,
    };
  }

  // A point beside the road in a set piece's own frame (origin at `origin`):
  // `lateral` to the right of the centre line, `y` above the road
  piecePoint(point, lateral, y, origin) {
    return [
      point.x + Math.cos(point.heading) * lateral - origin.x,
      point.y + y - origin.y,
      point.z - Math.sin(point.heading) * lateral - origin.z,
    ];
  }

  // One box lying along the road at a road point: `width` runs across the
  // road, `length` along it, and `bottom` is its lower face above the road.
  pieceBox(point, lateral, bottom, width, height, length, origin) {
    const geometry = new THREE.BoxGeometry(width, height, length);
    geometry.rotateY(point.heading);
    geometry.translate(...this.piecePoint(point, lateral, bottom + height / 2, origin));
    return geometry;
  }

  // A mesh standing at the centre of its set piece. Culling measures the
  // distance to a mesh's origin, so a merged mesh left at the world origin
  // would be culled by where it is not.
  addPieceMesh(group, geometry, material, origin) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Tunnel and village: each a group named for its type, with a few
  // merged meshes and no lights of its own. The ground under and beside each
  // is the matching span of the profile (see Terrain.setPieces).
  createSetPieces() {
    const builders = { tunnel: this.buildTunnel, village: this.buildVillage };
    for (const piece of this.setPieces) {
      const mid = this.roadPath[Math.floor((piece.from + piece.to) / 2)];
      const origin = new THREE.Vector3(mid.x, mid.y, mid.z);
      const group = new THREE.Group();
      group.name = piece.type;
      group.userData.setPiece = piece.type;
      builders[piece.type].call(this, piece, group, origin);
      this.scene.add(group);
    }
  }

  // A roof over the road: an elliptical lining (inside faces), the hill over
  // it, the two portals, and a strip of emissive lamps along the crown. The
  // lining is as wide as the wall band (1 m past the road edge) and as high as
  // the span's ceiling; the hill's crest, 1.5 m above the ceiling, is where
  // the ribbon of the profile's hill sides ends.
  buildTunnel(piece, group, origin) {
    const span = this.terrain.spans.find((candidate) => candidate.type === 'tunnel' && candidate.from === piece.from);
    const halfWidth = this.roadWidth / 2 + 1;
    const crest = this.roadWidth / 2 + 2.5;
    const { ceiling } = span;
    const capHeight = ceiling + 1.5;
    const steps = 16;
    // Rings stand half a segment outside the span, so the portals are at its ends
    const first = piece.from - 0.5;
    const rings = piece.to - piece.from + 2;

    const lining = [];
    const cap = [];
    const portals = [];
    // Two triangles for the quad of (a, b) on one ring and (a, b) on the next
    const quad = (list, a0, b0, a1, b1) => list.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
    const arch = (point, t) => this.piecePoint(point, halfWidth * Math.cos(t), ceiling * Math.sin(t), origin);

    for (let k = 0; k < rings - 1; k++) {
      const near = this.pointAtSegment(first + k);
      const far = this.pointAtSegment(first + k + 1);
      for (let n = 0; n < steps; n++) {
        const t0 = (n / steps) * Math.PI;
        const t1 = ((n + 1) / steps) * Math.PI;
        quad(lining, arch(near, t0), arch(near, t1), arch(far, t0), arch(far, t1));
      }
      quad(
        cap,
        this.piecePoint(near, -crest, capHeight, origin), this.piecePoint(near, crest, capHeight, origin),
        this.piecePoint(far, -crest, capHeight, origin), this.piecePoint(far, crest, capHeight, origin),
      );
    }
    // A portal at each end: the ring between the opening and the hill's outline
    for (const point of [this.pointAtSegment(first), this.pointAtSegment(first + rings - 1)]) {
      // Where a ray from the road's centre at angle t leaves the outline
      const outline = (t) => {
        const reach = Math.min(crest / Math.max(1e-6, Math.abs(Math.cos(t))), capHeight / Math.max(1e-6, Math.sin(t)));
        return this.piecePoint(point, reach * Math.cos(t), reach * Math.sin(t), origin);
      };
      for (let n = 0; n < steps; n++) {
        const t0 = (n / steps) * Math.PI;
        const t1 = ((n + 1) / steps) * Math.PI;
        quad(portals, arch(point, t0), arch(point, t1), outline(t0), outline(t1));
      }
    }

    const shell = (positions) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      return geometry;
    };
    const material = (color, emissive = 0x000000) =>
      new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide });
    // The lining takes a faint glow of the lamps along it, so it reads at night
    this.addPieceMesh(group, shell(lining), material(0x5b5a5e, 0x24242a), origin);
    // The cap is the hill's own ground: grass in the forest, rock in the gorge
    this.addPieceMesh(group, shell(cap), material(span.cap ?? 0x2c4727), origin);
    this.addPieceMesh(group, shell(portals), material(0x6e6a63), origin);

    // Two rows of emissive bars under the crown, one pair at each ring. They
    // glow past the bloom threshold but are not lights: the scene keeps its seven.
    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 2.2, roughness: 0.6 });
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 2.4), lampMaterial, (rings - 2) * 2);
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const unit = new THREE.Vector3(1, 1, 1);
    for (let k = 1; k < rings - 1; k++) {
      const point = this.pointAtSegment(first + k);
      turn.setFromAxisAngle(up, point.heading);
      [-1, 1].forEach((sign, n) => {
        matrix.compose(new THREE.Vector3(...this.piecePoint(point, sign * 3, ceiling - 0.45, origin)), turn, unit);
        lamps.setMatrixAt((k - 1) * 2 + n, matrix);
      });
    }
    lamps.instanceMatrix.needsUpdate = true;
    lamps.position.copy(origin);
    lamps.frustumCulled = false;
    group.add(lamps);
  }

  // House fronts either side with a few lit windows, and lamp posts on the
  // pavement. The light on the road is a pool of additive glow under each lamp
  // head: no light objects, because every light costs every lit fragment.
  buildVillage(piece, group, origin) {
    const halfRoad = this.roadWidth / 2;
    // The wall band starts 3 m past the road edge: the fronts stand on it
    const front = halfRoad + 3;
    const depth = 9;
    const houses = [];
    const windows = [];
    const washes = [0xb9a58a, 0xa88f7a, 0xc8b8a0, 0x9a8a7c];
    for (let i = piece.from; i <= piece.to; i++) {
      const point = this.roadPath[i];
      for (const sign of [-1, 1]) {
        const storeys = 2 + Math.floor(this.rand() * 2);
        const height = 3.4 * storeys + 0.6;
        const wash = washes[Math.floor(this.rand() * washes.length)];
        houses.push({ geometry: this.pieceBox(point, sign * (front + depth / 2), -0.5, depth, height + 0.5, 15.4, origin), color: [wash, wash] });
        houses.push({ geometry: this.pieceBox(point, sign * (front + depth / 2), height, depth + 0.8, 0.6, 16.2, origin), color: [0x4a3328, 0x4a3328] });
        for (let floor = 0; floor < storeys; floor++) {
          for (const along of [-4.5, 0, 4.5]) {
            if (this.rand() < 0.35) continue;
            const spot = { ...point, x: point.x + Math.sin(point.heading) * along, z: point.z + Math.cos(point.heading) * along };
            windows.push({ geometry: this.pieceBox(spot, sign * (front - 0.07), 1.4 + floor * 3.4, 0.14, 1.4, 1.2, origin), color: [0xffc070, 0xffc070] });
          }
        }
      }
    }
    const wallMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: true });
    const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffc070, emissiveIntensity: 2.0, roughness: 0.5 });
    this.addPieceMesh(group, this.mergeColoredGeometries(houses), wallMaterial, origin);
    this.addPieceMesh(group, this.mergeColoredGeometries(windows), windowMaterial, origin).castShadow = false;

    // Lamp posts, heads and pools: one pair every segment, instanced
    const count = (piece.to - piece.from + 1) * 2;
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7, metalness: 0.4 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd49a, emissiveIntensity: 2.6, roughness: 0.5 });
    const poolMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc070, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const poolGeometry = new THREE.CircleGeometry(3.5, 16);
    poolGeometry.rotateX(-Math.PI / 2);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 5, 6), postMaterial, count);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), headMaterial, count);
    const pools = new THREE.InstancedMesh(poolGeometry, poolMaterial, count);
    const matrix = new THREE.Matrix4();
    let n = 0;
    for (let i = piece.from; i <= piece.to; i++) {
      const point = this.roadPath[i];
      for (const sign of [-1, 1]) {
        posts.setMatrixAt(n, matrix.makeTranslation(...this.piecePoint(point, sign * (halfRoad + 1.2), 2.5, origin)));
        heads.setMatrixAt(n, matrix.makeTranslation(...this.piecePoint(point, sign * (halfRoad + 1.2), 5.1, origin)));
        pools.setMatrixAt(n, matrix.makeTranslation(...this.piecePoint(point, sign * (halfRoad - 1.5), 0.06, origin)));
        n++;
      }
    }
    posts.castShadow = true;
    pools.renderOrder = 1;
    [posts, heads, pools].forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.position.copy(origin);
      mesh.frustumCulled = false;
      group.add(mesh);
    });
  }

  createCheckpoints() {
    // Place checkpoints evenly through the ACTIVE LEG (startSegment..endSegment),
    // in riding order. Distributing over the full track put at most one
    // checkpoint in any leg, so ordered checkpoint scoring could never trigger.
    const legStart = this.startSegment;
    const legEnd = Math.min(this.endSegment, this.roadPath.length - 1);
    const legLength = legEnd - legStart;
    const checkpointCount = 5;

    // Skip the first ~15% of the leg to avoid immediate scoring, and leave
    // room before the finish line
    const firstCheckpoint = legStart + Math.max(2, Math.floor(legLength * 0.15));
    const lastCheckpoint = legEnd - Math.max(2, Math.floor(legLength * 0.1));
    const checkpointInterval = Math.max(
      1,
      Math.floor((lastCheckpoint - firstCheckpoint) / (checkpointCount - 1)),
    );

    for (let i = 0; i < checkpointCount; i++) {
      const segmentIndex = Math.min(
        firstCheckpoint + i * checkpointInterval,
        lastCheckpoint,
      );
      const point = this.roadPath[segmentIndex];

      // Create checkpoint gate
      const gateGroup = new THREE.Group();

      // Left pole with red/white stripes
      const poleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 5);

      // Create red/white stripe material
      const stripeCanvas = document.createElement("canvas");
      stripeCanvas.width = 32;
      stripeCanvas.height = 128;
      const stripeCtx = stripeCanvas.getContext("2d");

      // Alternating red and white stripes
      for (let i = 0; i < 8; i++) {
        stripeCtx.fillStyle = i % 2 === 0 ? "#ff0000" : "#ffffff";
        stripeCtx.fillRect(0, i * 16, 32, 16);
      }

      const stripeTexture2 = new THREE.CanvasTexture(stripeCanvas);
      stripeTexture2.wrapS = THREE.RepeatWrapping;
      stripeTexture2.wrapT = THREE.RepeatWrapping;

      const poleMaterial = new THREE.MeshStandardMaterial({
        map: stripeTexture2,
        roughness: 0.6,
        metalness: 0.2,
      });

      const leftPole = new THREE.Mesh(poleGeometry, poleMaterial);
      // On the ledges, clear of both lanes
      const poleOffset = this.roadWidth / 2 + 0.6;
      leftPole.position.set(-poleOffset, 2.5, 0);
      gateGroup.add(leftPole);

      const rightPole = new THREE.Mesh(poleGeometry, poleMaterial);
      rightPole.position.set(poleOffset, 2.5, 0);
      gateGroup.add(rightPole);

      // Position and orient the checkpoint
      gateGroup.position.set(point.x, point.y, point.z);
      gateGroup.rotation.y = point.heading;

      gateGroup.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.scene.add(gateGroup);
      this.registerGrounded(gateGroup, `checkpoint gate ${i}`);

      // Store checkpoint info
      const reach = this.gateReach(segmentIndex);
      this.checkpoints.push({
        kind: "checkpoint",
        index: i,
        position: new THREE.Vector3(point.x, point.y, point.z),
        heading: point.heading,
        passed: false,
        width: 16, // Width of checkpoint gate
        segmentIndex: segmentIndex,
        ...reach,
      });
      this.createGateLimitPosts(point, reach, `checkpoint gate ${i}`);
    }
  }

  // Landscape variation methods for tour legs
  applyLandscapeConfig(config) {
    console.log("Applying landscape config:", config);

    // Store config for reference
    this.landscapeConfig = config;

    // Update terrain colors if available
    if (config.grassColor) {
      this.updateTerrainColors(config.grassColor);
    }

    // Update mountain colors if available
    if (config.mountainColor) {
      this.updateMountainColors(config.mountainColor);
    }

    // Update fog if available
    if (config.fogDensity !== undefined) {
      this.updateFog(config.fogDensity);
    }
  }

  // Tag every mesh in a subtree so the recolor functions below can find it.
  // Without these tags, per-leg landscape colors and weather tints were no-ops.
  tagMeshes(object, type) {
    object.traverse((child) => {
      if (child.isMesh) {
        child.userData.type = type;
      }
    });
  }

  updateTerrainColors(grassColor) {
    // Update terrain strips (grass/ground next to road)
    this.scene.traverse((object) => {
      if (object.isMesh && object.userData.type === "terrain") {
        // A worn verge: the leg's grass colour over bare dirt
        object.material.color.setHex(grassColor).lerp(new THREE.Color(this.vergeBaseColor), 0.6).multiplyScalar(0.75);
        object.material.needsUpdate = true;
      }
    });
  }

  updateMountainColors(mountainColor) {
    // Update mountain meshes
    this.scene.traverse((object) => {
      // Snow caps and vertex-coloured peaks carry their own colours
      if (
        object.isMesh &&
        object.userData.type === "mountain" &&
        !object.userData.snow &&
        !object.material.vertexColors
      ) {
        object.material.color.setHex(mountainColor);
        object.material.needsUpdate = true;
      }
    });
  }

  updateFog(density) {
    // Update scene fog if present
    if (this.scene.fog) {
      if (this.scene.fog.density !== undefined) {
        this.scene.fog.density = density;
      } else if (
        this.scene.fog.near !== undefined &&
        this.scene.fog.far !== undefined
      ) {
        // Convert density to linear fog parameters
        const baseFar = 1000;
        this.scene.fog.far = baseFar / (density * 100);
        this.scene.fog.near = this.scene.fog.far * 0.1;
      }
    } else {
      // Create fog if it doesn't exist
      this.scene.fog = new THREE.FogExp2(0x87ceeb, density);
    }
  }

  applyWeatherVisuals(weatherType, intensity = 1.0) {
    console.log(
      `Applying weather visuals: ${weatherType} (intensity: ${intensity})`,
    );

    switch (weatherType) {
      case "rain":
        // Wet road - darker, more reflective
        if (this.roadMaterial) {
          // A film of water: slightly darker, glossy, and mirror-like at
          // the shallow angle the rider sees it from. (Near-black with high
          // metalness had nothing bright to reflect and rendered as a void.)
          this.roadMaterial.roughness =
            0.85 * (1 - intensity) + 0.2 * intensity;
          this.roadMaterial.metalness = 0.12 * intensity;
          this.roadMaterial.envMapIntensity = 0.3 + 1.9 * intensity;
          this.roadMaterial.color.setHex(0xc8ccd2);
          this.roadMaterial.needsUpdate = true;
        }
        // Darker grass and mountains
        this.updateTerrainColors(0x3a6a3a);
        this.updateMountainColors(0x5a4a32);
        break;

      case "snow":
        // Icy road - very reflective
        if (this.roadMaterial) {
          this.roadMaterial.roughness = 0.32; // Packed snow and ice
          this.roadMaterial.metalness = 0.08;
          this.roadMaterial.envMapIntensity = 1.2;
          this.roadMaterial.color.setHex(0xdfe8f0); // Lighter, icy blue tint
          this.roadMaterial.needsUpdate = true;
        }
        // Snow-covered terrain
        this.updateTerrainColors(0xe0e8f0); // White/pale blue
        this.updateMountainColors(0xd0d8e0); // Snowy mountains
        break;

      case "fog":
        // No visual changes to road/terrain for fog
        // Fog is handled by WeatherSystem
        break;

      case "clear":
      default:
        // Reset to normal appearance
        if (this.roadMaterial) {
          this.roadMaterial.roughness = 0.85;
          this.roadMaterial.metalness = 0.0;
          this.roadMaterial.envMapIntensity = 0.3;
          // Don't override texture color - use white to show texture
          if (this.roadMaterial.map) {
            this.roadMaterial.color.setHex(0xffffff);
          } else {
            this.roadMaterial.color.setHex(0x2a2a2a); // Fallback if no texture
          }
          this.roadMaterial.needsUpdate = true;
        }
        // Terrain colors will be set by applyLandscapeConfig
        break;
    }
  }

  // Terrain validation methods to prevent road-terrain overlap
  validateTerrainRoadClearance(
    terrainX,
    terrainZ,
    terrainRadius,
    minClearance = 50,
  ) {
    // Check if terrain at (terrainX, terrainZ) with given radius intersects the road corridor
    // minClearance: additional buffer beyond road edges

    const roadWidth = this.roadWidth; // Use instance road width (varies by leg difficulty)
    const totalClearance = roadWidth / 2 + minClearance;

    // Only check against active segment range (lazy generation)
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    // Check against road segments in current leg
    for (let i = startIdx; i <= endIdx; i++) {
      const roadPoint = this.roadPath[i];

      // Calculate distance from terrain center to road segment center
      const dx = terrainX - roadPoint.x;
      const dz = terrainZ - roadPoint.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // If terrain bounding circle intersects road corridor, fail validation
      if (distance < terrainRadius + totalClearance) {
        console.warn(
          `Terrain overlap detected at (${terrainX}, ${terrainZ}) radius ${terrainRadius} - distance to road segment ${i}: ${distance.toFixed(1)} (min: ${(terrainRadius + totalClearance).toFixed(1)})`,
        );
        return false;
      }
    }

    return true;
  }

  validateAllTerrainClearance() {
    // Development-time check to ensure all terrain is clear of the road
    // This should be called after all terrain generation is complete
    // Returns array of validation errors

    const errors = [];

    // Define all terrain objects that need validation
    // This is a comprehensive list based on the terrain creation methods
    const terrainObjects = [
      // Lake island mountain (createNearHills -> createLakeIslandMountain)
      { name: "Lake island main peak", x: 350, z: 100, radius: 125 }, // width=250, radius=width/2
      { name: "Lake island secondary peak", x: 250, z: -50, radius: 75 }, // width=150, radius=75

      // Majestic peaks (createMajesticPeak) - UPDATED positions
      { name: "Majestic peak 1", x: -1200, z: 1000, radius: 400 }, // width=800, radius=400
      { name: "Majestic peak 2", x: -1600, z: 1400, radius: 375 }, // width=750, radius=375

      // Mid-range mountains (createMidRangeMountains) - UPDATED positions
      { name: "Mid-range peak 1", x: -900, z: 700, radius: 150 }, // width=300
      { name: "Mid-range peak 2", x: -700, z: 1200, radius: 140 }, // width=280
      { name: "Mid-range peak 3", x: -1000, z: 1800, radius: 175 }, // width=350
      { name: "Mid-range peak 4", x: -600, z: 2200, radius: 145 }, // width=290
      { name: "Mid-range peak 5", x: -800, z: 2600, radius: 155 }, // width=310
    ];

    // Validate each terrain object
    for (const terrain of terrainObjects) {
      const isValid = this.validateTerrainRoadClearance(
        terrain.x,
        terrain.z,
        terrain.radius,
        50, // 50 unit buffer
      );

      if (!isValid) {
        errors.push({
          name: terrain.name,
          position: { x: terrain.x, z: terrain.z },
          radius: terrain.radius,
        });
      }
    }

    return errors;
  }
}
