class Environment {
  constructor(scene, startSegment = 0, endSegment = 703, legIndex = 0) {
    this.scene = scene;
    this.roadPath = []; // Store the path for other uses (full track for physics/AI)
    this.startSegment = startSegment; // Start of visual geometry range
    this.endSegment = endSegment; // End of visual geometry range
    this.legIndex = legIndex; // Current leg index (0-7)
    this.finishLinePosition = null; // Store finish line position for detection
    this.roadworksZones = []; // Store construction zones
    this.jumpRamps = []; // Store jump ramp objects for collision detection
    this.roadworkObstacles = []; // Store barriers and equipment for collision detection
    this.boulders = []; // Store boulder objects for collision detection
    this.checkpoints = []; // Store checkpoint positions for scoring

    // Calculate road width - first 4 legs are wider (easier)
    this.roadWidth = legIndex < 4 ? 20 : 16;
    console.log(
      `Initializing environment for segments ${startSegment}-${endSegment}, leg ${legIndex}, road width ${this.roadWidth}`,
    );

    this.createRoad(); // Generates full roadPath, but only creates geometry for segment range
    this.createGrass();
    this.createLayeredMountains(); // Add layered mountain scenery
    this.createRoadMarkings();
    this.addEnvironmentalDetails();
    this.createRoadworks(); // Add construction zones
    this.addHairpinWarnings(); // Add hairpin bend warnings
    this.createCheckpoints(); // Add scoring checkpoints

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

        // Calculate elevation with smooth continuous function - gentle rolling terrain
        // Reduced amplitude for smoother ride
        const elevation =
          Math.sin(segmentIndex * 0.04) * 8 +
          Math.cos(segmentIndex * 0.025) * 6 +
          25;

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
    roadMesh.castShadow = true;
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
      { color: 0x181818, roughness: 0.95, envMapIntensity: 0.15 },
      { color: 0x1e1e20, roughness: 0.92, envMapIntensity: 0.2 },
      { color: 0x26262a, roughness: 0.88, envMapIntensity: 0.3 }, // Slate blue-grey
      { color: 0x2a2a2a, roughness: 0.92, envMapIntensity: 0.2 },
      { color: 0x34343a, roughness: 0.85, envMapIntensity: 0.35 }, // Lighter weathered face
      { color: 0x221a12, roughness: 0.94, envMapIntensity: 0.15 },
      { color: 0x2a2016, roughness: 0.9, envMapIntensity: 0.25 },
      { color: 0x32281a, roughness: 0.88, envMapIntensity: 0.25 }, // Iron-stained brown
      { color: 0x3a3226, roughness: 0.86, envMapIntensity: 0.3 },
      { color: 0x40382a, roughness: 0.9, envMapIntensity: 0.25 }, // Sandy granite
    ];
    const rockMaterials = rockMaterialParams.map(
      (params) =>
        new THREE.MeshStandardMaterial({
          color: params.color,
          roughness: params.roughness,
          metalness: 0.0,
          envMapIntensity: params.envMapIntensity,
          flatShading: false,
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
      if (index % 15 === 0) {
        // Much less frequent
        // Left side cliff rocks (elevated side) - properly grounded
        const cliffX =
          point.x - (18 + Math.random() * 8) * Math.cos(point.heading);
        const cliffZ =
          point.z + (18 + Math.random() * 8) * Math.sin(point.heading);
        const cliffY = point.y - 1; // Ground level, partially embedded

        // Create irregular rock shape using multiple merged geometries
        const rockGroup = new THREE.Group();

        // Main rock body - smooth with natural angular variation
        const size = 2 + Math.random() * 2;
        const mainRockGeometry = this.displaceVertices(
          new THREE.IcosahedronGeometry(size, 4),
          size * 0.3,
        );
        const mainRock = new THREE.Mesh(
          mainRockGeometry,
          rockMaterials[Math.floor(Math.random() * rockMaterials.length)],
        );
        mainRock.position.set(0, 0, 0);
        mainRock.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI,
        );
        mainRock.scale.set(
          1 + Math.random() * 0.5,
          0.7 + Math.random() * 0.6,
          1 + Math.random() * 0.5,
        );
        mainRock.castShadow = true;
        mainRock.receiveShadow = true;
        rockGroup.add(mainRock);

        // Additional rock chunks for detail - smooth spheres with irregular scaling
        for (let j = 0; j < 2 + Math.floor(Math.random() * 2); j++) {
          const chunkSize = 1 + Math.random() * 2;
          const chunkGeometry = this.displaceVertices(
            new THREE.IcosahedronGeometry(chunkSize, 3),
            chunkSize * 0.35,
          );
          const chunk = new THREE.Mesh(
            chunkGeometry,
            rockMaterials[Math.floor(Math.random() * rockMaterials.length)],
          );
          chunk.position.set(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 4,
          );
          chunk.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI,
          );
          chunk.scale.set(
            1 + Math.random() * 0.4,
            0.6 + Math.random() * 0.5,
            1 + Math.random() * 0.4,
          );
          chunk.castShadow = true;
          chunk.receiveShadow = true;
          rockGroup.add(chunk);
        }

        rockGroup.position.set(cliffX, cliffY, cliffZ);
        this.scene.add(rockGroup);
      }

      // Small boulders only near the road edge - DISABLED to prevent floating
      // These are replaced by better-grounded boulders in createRoadWalls()
      if (false && index % 8 === 0 && Math.random() > 0.7) {
        // Disabled
        const side = Math.random() > 0.5 ? 1 : -1;
        const baseDistance = 10 + Math.random() * 3;
        const boulderX =
          point.x + side * baseDistance * Math.cos(point.heading);
        const boulderZ =
          point.z - side * baseDistance * Math.sin(point.heading);

        // Calculate proper Y position accounting for terrain drop-off
        const roadY = point.y || 0;
        let boulderY;
        const boulderRadius = 0.5 + Math.random() * 1.5;

        if (side > 0) {
          // Right side - account for drop-off
          const dropDistance = Math.max(0, baseDistance - 8);
          const terrainDropRate = 3;
          const dropAmount = Math.min(dropDistance * terrainDropRate, 50);
          boulderY = roadY - dropAmount - boulderRadius * 0.7; // 70% embedded
        } else {
          // Left side - at road level
          boulderY = roadY - boulderRadius * 0.7;
        }

        const boulderGeometry = this.displaceVertices(
          new THREE.IcosahedronGeometry(boulderRadius, 3),
          boulderRadius * 0.25,
        );
        const boulder = new THREE.Mesh(
          boulderGeometry,
          rockMaterials[Math.floor(Math.random() * rockMaterials.length)],
        );
        boulder.position.set(boulderX, boulderY, boulderZ);
        boulder.scale.set(
          1 + Math.random() * 0.3,
          0.7 + Math.random() * 0.4,
          1 + Math.random() * 0.3,
        );
        boulder.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI,
        );
        boulder.castShadow = true;
        boulder.receiveShadow = true;
        this.scene.add(boulder);

        // Store boulder for collision detection
        this.boulders.push({
          position: new THREE.Vector3(boulderX, boulderY, boulderZ),
          radius: boulderRadius,
          mesh: boulder,
        });
      }
    }

    // Rock face walls removed - now handled by faceted cliff walls in createRoadWalls()
  }

  createGuardRails() {
    // Create metal guard rails for dangerous sections
    const railHeight = 0.8;
    const postSpacing = 4; // meters between posts

    // Metal rail material - galvanized steel with a soft sheen that picks
    // up the environment map along its length
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8bcc0,
      roughness: 0.38,
      metalness: 0.85,
      envMapIntensity: 1.1,
    });

    // Post material
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.8,
      metalness: 0.6,
    });

    // Only create rail sections for the active segment range (lazy generation)
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    // Create continuous rail sections
    for (let i = startIdx; i < endIdx; i++) {
      const point = this.roadPath[i];
      const nextPoint = this.roadPath[i + 1];

      // Determine if this section needs guard rails based on elevation drop
      const elevationDrop = Math.abs(point.y);
      const nextIndex = Math.min(i + 1, this.roadPath.length - 1);
      const headingDelta = this.roadPath[nextIndex].heading - point.heading;
      const headingChange = Math.abs(headingDelta);

      // Add rails on curves and high elevation sections
      if (elevationDrop > 5 || headingChange > 0.02) {
        // Rail goes on the outside of the curve: right turn (positive
        // delta) -> left side (-1), left turn -> right side (1)
        const railSide =
          headingChange > 0.02 ? (headingDelta > 0 ? -1 : 1) : 0;

        if (railSide <= 0) {
          // Left side rail - create as vertical cylindrical rail
          const railGeometry = new THREE.CylinderGeometry(
            0.05,
            0.05,
            Math.sqrt(
              Math.pow(nextPoint.x - point.x, 2) +
                Math.pow(nextPoint.z - point.z, 2),
            ),
            8,
          );
          const rail = new THREE.Mesh(railGeometry, railMaterial);

          const perpX = Math.cos(point.heading) * 8.2;
          const perpZ = -Math.sin(point.heading) * 8.2;

          // Position and rotate properly
          rail.position.set(
            (point.x + nextPoint.x) / 2 - perpX,
            (point.y + nextPoint.y) / 2 + railHeight,
            (point.z + nextPoint.z) / 2 - perpZ,
          );
          rail.rotation.z = Math.PI / 2; // Rotate to horizontal
          rail.rotation.y = point.heading;
          rail.castShadow = true;
          rail.receiveShadow = true;
          this.scene.add(rail);
        }

        if (railSide >= 0 || elevationDrop > 10) {
          // Right side rail - create as vertical cylindrical rail
          const railGeometry = new THREE.CylinderGeometry(
            0.05,
            0.05,
            Math.sqrt(
              Math.pow(nextPoint.x - point.x, 2) +
                Math.pow(nextPoint.z - point.z, 2),
            ),
            8,
          );
          const rail = new THREE.Mesh(railGeometry, railMaterial);

          const perpX = Math.cos(point.heading) * 8.2;
          const perpZ = -Math.sin(point.heading) * 8.2;

          // Position and rotate properly
          rail.position.set(
            (point.x + nextPoint.x) / 2 + perpX,
            (point.y + nextPoint.y) / 2 + railHeight,
            (point.z + nextPoint.z) / 2 + perpZ,
          );
          rail.rotation.z = Math.PI / 2; // Rotate to horizontal
          rail.rotation.y = point.heading;
          rail.castShadow = true;
          rail.receiveShadow = true;
          this.scene.add(rail);
        }

        // Add posts every few segments
        if (i % 2 === 0) {
          const postGeometry = new THREE.BoxGeometry(
            0.1,
            railHeight + 0.2,
            0.1,
          );

          if (railSide <= 0) {
            // Left post
            const perpX = Math.cos(point.heading) * 8.2;
            const perpZ = -Math.sin(point.heading) * 8.2;
            const post = new THREE.Mesh(postGeometry, postMaterial);
            post.position.set(
              point.x - perpX,
              point.y + (railHeight + 0.2) / 2,
              point.z - perpZ,
            );
            post.castShadow = true;
            post.receiveShadow = true;
            this.scene.add(post);
          }

          if (railSide >= 0 || elevationDrop > 10) {
            // Right post
            const perpX = Math.cos(point.heading) * 8.2;
            const perpZ = -Math.sin(point.heading) * 8.2;
            const post = new THREE.Mesh(postGeometry, postMaterial);
            post.position.set(
              point.x + perpX,
              point.y + (railHeight + 0.2) / 2,
              point.z + perpZ,
            );
            post.castShadow = true;
            post.receiveShadow = true;
            this.scene.add(post);
          }
        }
      }
    }
  }

  createRoadWalls() {
    // Rock materials for boulders - very dark, no green
    const rockMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0x181818,
        roughness: 0.98,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x1e1e1e,
        roughness: 0.97,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x242424,
        roughness: 0.96,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.98,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x303030,
        roughness: 0.97,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x221a12,
        roughness: 0.98,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x282118,
        roughness: 0.97,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x2e261c,
        roughness: 0.96,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x342c20,
        roughness: 0.98,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x3a3224,
        roughness: 0.97,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x363636,
        roughness: 0.96,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x3c3c3c,
        roughness: 0.97,
        metalness: 0.0,
      }),
    ];

    // Create continuous faceted rock walls with integrated slope
    const createFacetedCliff = (side, height, isDropOff) => {
      const group = new THREE.Group();

      // Create rock texture
      const rockTexture = this.createRockTexture();

      // Rock material with smooth shading for realistic weathered appearance
      const cliffMaterial = new THREE.MeshStandardMaterial({
        map: rockTexture,
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.0,
        flatShading: false,
        side: THREE.DoubleSide,
        envMapIntensity: 0.2,
      });

      // Create main cliff face geometry
      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      const indices = [];
      const colors = [];
      const uvs = [];

      // Higher resolution for detailed faceting
      const horizontalSubdivisions = 4; // Increased from 2 for finer horizontal detail
      const verticalSegments = 35; // Increased from 20 for finer vertical detail

      // Only create geometry for the active segment range (lazy generation)
      // Extend by 20 segments to match road geometry and decorative elements
      const startIdx = Math.max(0, this.startSegment);
      const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

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

          // Create vertical segments
          for (let j = 0; j <= verticalSegments; j++) {
            const verticalProgress = j / verticalSegments;

            // Variable height along the cliff length
            // Use sine waves and noise for natural variation - higher frequency for more ups and downs
            const lengthProgress = i / this.roadPath.length;
            const cliffHeightMultiplier =
              1.0 +
              Math.sin(lengthProgress * Math.PI * 8) * 0.5 + // 8 major peaks and valleys
              Math.sin(lengthProgress * Math.PI * 15) * 0.25 + // 15 medium variations
              Math.sin(lengthProgress * Math.PI * 27) * 0.15 + // 27 small details
              (Math.random() - 0.5) * 0.2; // Random noise (20%)

            const variableHeight = height * cliffHeightMultiplier;
            const currentHeight = variableHeight * verticalProgress;

            // Calculate base perpendicular distance with slope for walls
            // Start closer to account for displacement pushing wall outward
            let baseDistance = 6.5; // Reduced from 8 to eliminate gap

            if (side > 0 && isDropOff) {
              // Right wall (drop-off) - add dramatic overhanging slope
              // Start at road edge, slope inward as we go down
              const slopeAmount = verticalProgress * verticalProgress * 50; // Quadratic slope for overhang
              baseDistance -= slopeAmount;

              // Debug: Log slope amount for first segment
              if (i === 0 && h === 0 && j % 5 === 0) {
                console.log(
                  `Right cliff overhang at height ${verticalProgress.toFixed(2)}: base=${baseDistance.toFixed(1)}, slope=${slopeAmount.toFixed(1)}`,
                );
              }
            } else if (side < 0 && !isDropOff) {
              // Left wall (mountain) - with lip at bottom
              baseDistance = this.roadWidth / 2 + 1; // Start just outside road edge

              // Add lip/ledge at the bottom (first 10% of height)
              if (verticalProgress < 0.1) {
                // Lip extends outward at the base
                const lipExtension = (0.1 - verticalProgress) * 20; // Max 2 units out at ground level
                baseDistance = this.roadWidth / 2 + 1 - lipExtension;
              }

              // Then dramatic overhang as it goes up
              const slopeAmount = verticalProgress * verticalProgress * 25; // Quadratic slope for overhang
              baseDistance += slopeAmount;
            }

            // Multi-layer displacement for natural rock face
            // Use 0-based index for vertex calculations
            const idx = (i - startIdx) * horizontalSubdivisions + h;

            // Reduce displacement at base to prevent gaps
            const heightFactor = Math.min(verticalProgress * 2, 1); // Ramps up from 0 at base to 1

            // Layer 1: Large rock formations (increased amplitude)
            const primary =
              (Math.sin(idx * 0.12 + j * 0.18) * Math.cos(j * 0.08) +
                Math.sin(idx * 0.08 - j * 0.15) * 0.7) *
              8.0 *
              heightFactor;

            // Layer 2: Medium rock faces (more variation)
            const secondary =
              (Math.sin(idx * 0.35 + j * 0.45) * Math.cos(idx * 0.25) +
                Math.cos(idx * 0.5 - j * 0.3) * 0.8) *
              4.0 *
              heightFactor;

            // Layer 3: Small surface details (increased frequency and amplitude)
            const tertiary =
              (Math.sin(idx * 1.2 + j * 1.5) * 0.6 +
                Math.cos(idx * 1.8 - j * 2.0) * 0.4) *
              1.5 *
              heightFactor;

            // Layer 4: Micro details for texture
            const micro = Math.sin(idx * 3.5 + j * 4.0) * 0.5 * heightFactor;

            // Combine displacements with height-based variation
            const totalDisplacement = primary + secondary + tertiary + micro;

            // Apply faceting by quantizing displacement - smaller facets for more angular look
            const facetSize = 0.7 + Math.sin(idx * 0.3) * 0.3; // Reduced from 1.2±0.4 to 0.7±0.3 for sharper angles
            const facetedDisplacement =
              Math.floor(totalDisplacement / facetSize) * facetSize;

            // Calculate base final distance
            const displacementScale = verticalProgress === 0 ? 0.15 : 0.7; // Increased from 0.55 to 0.70 for more pronounced faceting
            let finalDistance =
              baseDistance + facetedDisplacement * displacementScale;

            // Apply slope for overhang
            if (side > 0 && isDropOff) {
              const slopeAmount = verticalProgress * 150;
              finalDistance += slopeAmount;
            }

            // Ensure minimum distance to prevent gaps at road edge (scales with road width)
            finalDistance = Math.max(finalDistance, this.roadWidth / 2 + 1.4);

            // Calculate position
            const perpX = Math.cos(interpHeading) * finalDistance * side;
            const perpZ = -Math.sin(interpHeading) * finalDistance * side;

            vertices.push(
              interpX + perpX,
              interpY + currentHeight,
              interpZ + perpZ,
            );

            // More realistic mountain rock colors with grey variations
            const greyBase = 0.35 + Math.random() * 0.25; // 0.35 to 0.6

            // Add geological stratification layers
            const stratumHeight = 8; // Height of each stratum in units
            const stratumIndex = Math.floor(
              (interpY + currentHeight) / stratumHeight,
            );
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
              0.2,
              Math.min(
                0.8,
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
            const redTint = finalGrey + mineralStreak - greenTintStrength * 0.2;
            const greenTint = finalGrey - 0.02 + greenTintStrength;
            const blueTint = finalGrey + 0.03 - greenTintStrength * 0.15;

            colors.push(redTint, greenTint, blueTint);

            // UV coordinates
            uvs.push(idx * 0.1, verticalProgress);
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
      group.add(mainCliff);

      // Enhanced boulder position testing with more comprehensive checks
      const testBoulderPosition = (x, y, z, roadPoint, boulderRadius, side) => {
        // Test 1: Not on the road (must be at least 10 units from center)
        const perpDist = Math.sqrt(
          Math.pow(x - roadPoint.x, 2) + Math.pow(z - roadPoint.z, 2),
        );
        if (perpDist < 10) {
          console.warn(
            `Boulder too close to road: ${perpDist.toFixed(1)} units from center`,
          );
          return false;
        }

        // Test 2: Calculate expected ground level based on terrain
        let expectedGroundY;
        const roadY = roadPoint.y || 0;

        if (side > 0) {
          // Right side - calculate drop-off based on distance from road
          const dropDistance = Math.max(0, perpDist - 8); // Distance beyond road edge
          const terrainDropRate = 3; // Must match boulder placement calculation
          const terrainDrop = Math.min(dropDistance * terrainDropRate, 50); // Progressive drop, max 50
          expectedGroundY = roadY - terrainDrop;
        } else {
          // Left side - should be at road level
          expectedGroundY = roadY;
        }

        // Test 3: Boulder bottom should be at or below expected ground - STRICT
        const boulderBottom = y - boulderRadius * 1.1; // Account for scaled geometry
        const tolerance = 0.1; // Very strict tolerance

        if (boulderBottom > expectedGroundY + tolerance) {
          console.warn(
            `Boulder FLOATING (size ${boulderRadius.toFixed(1)}): Bottom at ${boulderBottom.toFixed(1)}, expected ground at ${expectedGroundY.toFixed(1)}, FORCING DOWN`,
          );
          // Force deep embedding for all boulders
          const embedDepth = 0.6 + (boulderRadius < 1.5 ? 0.2 : 0);
          return {
            valid: false,
            correctY: expectedGroundY - boulderRadius * embedDepth,
          };
        }

        // Test 4: Boulder shouldn't be too deep (more than 80% embedded)
        const boulderTop = y + boulderRadius;
        if (boulderTop < expectedGroundY - boulderRadius * 0.5) {
          console.warn(
            `Boulder too deep: Top at ${boulderTop.toFixed(1)}, ground at ${expectedGroundY.toFixed(1)}`,
          );
          return {
            valid: false,
            correctY: expectedGroundY - boulderRadius * 0.4,
          };
        }

        // Test 5: Check against cliff wall position (left side)
        if (side < 0) {
          // Ensure boulder isn't inside the cliff wall (starts around 8.5 units)
          const distFromCenter = Math.abs(perpDist);
          if (distFromCenter < 9 && distFromCenter > 7) {
            console.warn(
              `Boulder conflicting with cliff base at ${distFromCenter.toFixed(1)} units`,
            );
            return false;
          }
        }

        // Test 6: Additional floating check - ensure center is below expected ground
        if (y > expectedGroundY + boulderRadius * 0.3) {
          console.warn(
            `Boulder center too high (size ${boulderRadius.toFixed(1)}): Center at ${y.toFixed(1)}, ground at ${expectedGroundY.toFixed(1)}, FORCING DOWN`,
          );
          return {
            valid: false,
            correctY: expectedGroundY - boulderRadius * 0.6,
          };
        }

        return { valid: true };
      };

      // Add MANY more boulders along the cliff base (only in active segment range)
      for (let i = startIdx; i <= endIdx; i += 3) {
        // Much denser spacing
        const point = this.roadPath[i];

        // Add 2-3 rocks per segment
        const numRocks = 2 + Math.floor(Math.random() * 2);

        for (let r = 0; r < numRocks; r++) {
          if (Math.random() > 0.2) {
            // 80% chance for variety

            // Height position on cliff (0 = base, 1 = top) - keep rocks very low to prevent floating
            const heightRatio = Math.random() * 0.25; // Maximum 25% up the cliff
            const cliffHeight = Math.abs(height) * heightRatio;

            // Hug the wall base / road edge so the rock field stays dense and
            // visible, with size capped by proximity below
            let distance = this.roadWidth / 2 + 0.5;
            if (side > 0 && isDropOff) {
              // Right cliff - account for outward slope but keep close to face
              distance += heightRatio * 25; // Match cliff slope more closely
            } else if (side < 0 && !isDropOff) {
              // Left cliff - account for overhang but keep attached
              distance += heightRatio * 20; // Match cliff overhang
            }

            // Random outward variation - farther rocks may be larger
            distance += Math.random() * 3;

            // Cap size so the rock's scaled radius (max scale 1.5) never
            // reaches past the road edge: rocks at the lane edge stay small
            // (fallen-debris look), rocks farther out / up the cliff get big
            const clearance = distance - this.roadWidth / 2 + 0.4;
            const maxSize = Math.max(0.4, clearance / 1.5);
            const rockSize = Math.min(0.8 + Math.random() * 2.5, maxSize);
            const rockGeometry = this.displaceVertices(
              new THREE.IcosahedronGeometry(rockSize, 3),
              rockSize * 0.3,
            );
            const rock = new THREE.Mesh(
              rockGeometry,
              rockMaterials[Math.floor(Math.random() * rockMaterials.length)],
            );

            const perpX = Math.cos(point.heading) * distance * side;
            const perpZ = -Math.sin(point.heading) * distance * side;

            // Position the rock embedded into cliff face
            const embedDepth = rockSize * 0.5; // Embed 50% into cliff (increased from 40%)

            let rockY;
            if (height > 0) {
              // Left side - mountain wall going up
              rockY = (point.y || 0) + cliffHeight - embedDepth;
              rock.position.set(point.x + perpX, rockY, point.z + perpZ);
            } else {
              // Right side - cliff going down
              rockY = (point.y || 0) - cliffHeight + embedDepth;
              rock.position.set(point.x + perpX, rockY, point.z + perpZ);
            }

            // Validate embedded rock isn't floating
            const roadY = point.y || 0;
            const expectedMinY = roadY - Math.abs(height);
            if (rockY > roadY + rockSize && heightRatio < 0.1) {
              // Rock too high and near base - skip it
              console.warn(
                `Skipping floating embedded rock at height ${rockY.toFixed(1)} above road ${roadY.toFixed(1)}`,
              );
              continue;
            }

            // Random rotation for natural look
            rock.rotation.set(
              Math.random() * Math.PI * 2,
              Math.random() * Math.PI * 2,
              Math.random() * Math.PI * 2,
            );

            // Varied scaling for natural appearance
            rock.scale.set(
              1.0 + Math.random() * 0.5,
              0.7 + Math.random() * 0.4,
              1.0 + Math.random() * 0.5,
            );

            rock.castShadow = true;
            rock.receiveShadow = true;
            group.add(rock);
          } // Close the if statement from line 700
        } // Close the for loop from line 699

        // Small debris rocks that have fallen off the cliff onto the road
        // edge - deliberately small (0.2-0.45m) and registered as collidable
        // boulders so riding into one crashes the bike
        if (side < 0 && !isDropOff && Math.random() < 0.15) {
          const debrisSize = 0.2 + Math.random() * 0.25;
          const debrisGeometry = this.displaceVertices(
            new THREE.IcosahedronGeometry(debrisSize, 2),
            debrisSize * 0.25,
          );
          const debris = new THREE.Mesh(
            debrisGeometry,
            rockMaterials[Math.floor(Math.random() * rockMaterials.length)],
          );

          // Scatter onto the cliff-side portion of the road, from near the
          // wall to roughly the middle of the left lane
          const debrisDistance =
            (this.roadWidth / 2 - 1 - Math.random() * 4) * side;
          const debrisX = point.x + Math.cos(point.heading) * debrisDistance;
          const debrisZ = point.z - Math.sin(point.heading) * debrisDistance;
          const debrisY = (point.y || 0) + debrisSize * 0.4; // Slightly embedded in the road

          debris.position.set(debrisX, debrisY, debrisZ);
          debris.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
          );
          debris.castShadow = true;
          debris.receiveShadow = true;
          group.add(debris);

          this.boulders.push({
            position: new THREE.Vector3(debrisX, debrisY, debrisZ),
            radius: debrisSize,
          });
        }

        // Add EVEN MORE boulders at the base - DISABLED to prevent floating
        if (false && (i % 2 === 0 || Math.random() > 0.2)) {
          // Every 2 segments or 80% chance
          // Create 2-5 boulders per position
          const numBoulders = 2 + Math.floor(Math.random() * 4);

          for (let b = 0; b < numBoulders; b++) {
            const baseBoulderSize = 0.8 + Math.random() * 3.0; // More varied sizes (0.8-3.8)
            const baseBoulder = new THREE.Mesh(
              this.displaceVertices(
                new THREE.IcosahedronGeometry(baseBoulderSize, 3),
                baseBoulderSize * 0.3,
              ),
              rockMaterials[Math.floor(Math.random() * rockMaterials.length)],
            );

            // Position at cliff base with variation
            const baseDistance = 10 + Math.random() * 8 + b * 2; // Minimum 10 units from road center
            const perpX = Math.cos(point.heading) * baseDistance * side;
            const perpZ = -Math.sin(point.heading) * baseDistance * side;

            // Calculate position
            const boulderX = point.x + perpX;
            const boulderZ = point.z + perpZ;
            let boulderY;

            // FIXED: Use actual road point Y value, not cliff height
            const roadY = point.y || 0;

            if (side > 0) {
              // Right side - properly calculate drop-off position
              const dropDistance = Math.max(0, baseDistance - 8); // Distance beyond road edge
              const terrainDropRate = 3; // Drop 3 units per unit distance from road
              const dropAmount = Math.min(dropDistance * terrainDropRate, 50); // Cap at 50 units drop
              // All boulders embedded at least 50% of their radius
              const embedRatio = 0.5 + (baseBoulderSize < 1.5 ? 0.2 : 0);
              boulderY = roadY - dropAmount - baseBoulderSize * embedRatio;
            } else {
              // Left side - at road level, properly embedded
              // All boulders embedded at least 50% of their radius
              const embedRatio = 0.5 + (baseBoulderSize < 1.5 ? 0.2 : 0);
              boulderY = roadY - baseBoulderSize * embedRatio;
            }

            // Special handling for very small boulders - use consistent drop calculation
            if (baseBoulderSize < 1.2) {
              // Force small boulders to be deeply embedded
              if (side > 0) {
                const dropDistance = Math.max(0, baseDistance - 8);
                const terrainDropRate = 3; // MUST match the rate used above
                const dropAmount = Math.min(dropDistance * terrainDropRate, 50);
                boulderY = roadY - dropAmount - baseBoulderSize * 0.7; // 70% embedded
              } else {
                boulderY = roadY - baseBoulderSize * 0.7;
              }
            }

            // Run comprehensive position tests
            const testResult = testBoulderPosition(
              boulderX,
              boulderY,
              boulderZ,
              point,
              baseBoulderSize,
              side,
            );

            if (!testResult || !testResult.valid) {
              if (testResult && testResult.correctY !== undefined) {
                // Use corrected Y position
                boulderY = testResult.correctY;
                console.log(
                  `Boulder size ${baseBoulderSize.toFixed(1)} corrected to Y=${boulderY.toFixed(1)}`,
                );
              } else {
                // Skip this boulder entirely
                continue;
              }
            }

            baseBoulder.position.set(boulderX, boulderY, boulderZ);

            // Random rotation with some stability (not fully random)
            baseBoulder.rotation.set(
              Math.random() * Math.PI * 0.5, // Less rotation on X
              Math.random() * Math.PI * 2, // Full rotation on Y
              Math.random() * Math.PI * 0.3, // Minimal tilt
            );

            baseBoulder.scale.set(
              1.0 + Math.random() * 0.6,
              0.7 + Math.random() * 0.4,
              1.0 + Math.random() * 0.6,
            );

            baseBoulder.castShadow = true;
            baseBoulder.receiveShadow = true;
            group.add(baseBoulder);

            // Store boulder for collision detection
            this.boulders.push({
              position: new THREE.Vector3(boulderX, boulderY, boulderZ),
              radius: baseBoulderSize * 0.6,
              mesh: baseBoulder,
            });
          }
        }
      } // Close the for loop from line 693

      // Add crack systems to cliff face
      const crackMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 1.0,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

      // Create major vertical cracks (only in active segment range)
      for (let i = startIdx; i <= endIdx; i += 25) {
        if (Math.random() > 0.5) {
          const point = this.roadPath[i];

          // Create crack geometry as thin box
          const crackHeight = Math.abs(height) * (0.4 + Math.random() * 0.4);
          const crackWidth = 0.1 + Math.random() * 0.15;
          const crackDepth = 0.5 + Math.random() * 0.5;

          const crackGeometry = new THREE.BoxGeometry(
            crackWidth,
            crackHeight,
            crackDepth,
          );
          const crack = new THREE.Mesh(crackGeometry, crackMaterial);

          // Position crack on cliff face
          let distance = 7.8 + Math.random() * 2;
          const verticalOffset = Math.random() * Math.abs(height) * 0.3;

          if (side > 0 && isDropOff) {
            distance += (verticalOffset / Math.abs(height)) * 30;
          } else if (side < 0 && !isDropOff) {
            distance += (verticalOffset / Math.abs(height)) * 15;
          }

          const perpX = Math.cos(point.heading) * distance * side;
          const perpZ = -Math.sin(point.heading) * distance * side;

          if (height > 0) {
            crack.position.set(
              point.x + perpX,
              (point.y || 0) + crackHeight / 2 + verticalOffset,
              point.z + perpZ,
            );
          } else {
            crack.position.set(
              point.x + perpX,
              (point.y || 0) - crackHeight / 2 - verticalOffset,
              point.z + perpZ,
            );
          }

          // Rotate crack to align with cliff face
          crack.rotation.y =
            point.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
          crack.rotation.z = (Math.random() - 0.5) * 0.3; // Slight tilt

          crack.castShadow = true;
          crack.receiveShadow = true;
          group.add(crack);

          // Add smaller branching cracks
          const numBranches = 1 + Math.floor(Math.random() * 2);
          for (let b = 0; b < numBranches; b++) {
            const branchHeight = crackHeight * (0.3 + Math.random() * 0.3);
            const branchGeometry = new THREE.BoxGeometry(
              crackWidth * 0.6,
              branchHeight,
              crackDepth * 0.7,
            );
            const branch = new THREE.Mesh(branchGeometry, crackMaterial);

            // Position relative to main crack
            branch.position.copy(crack.position);
            branch.position.x += (Math.random() - 0.5) * 2;
            branch.position.y += (Math.random() - 0.5) * crackHeight * 0.5;
            branch.position.z += (Math.random() - 0.5) * 2;

            branch.rotation.y = crack.rotation.y + (Math.random() - 0.5) * 0.5;
            branch.rotation.z = (Math.random() - 0.5) * 0.4;

            branch.castShadow = true;
            branch.receiveShadow = true;
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
        if (Math.random() > 0.5) {
          const point = this.roadPath[i];

          // Create irregular seepage patch
          const seepageGeometry = new THREE.PlaneGeometry(
            1.5 + Math.random() * 2,
            3 + Math.random() * 4,
            4,
            6,
          );

          // Distort vertices for irregular shape
          const positions = seepageGeometry.attributes.position;
          for (let v = 0; v < positions.count; v++) {
            const x = positions.getX(v);
            const y = positions.getY(v);
            positions.setZ(v, (Math.random() - 0.5) * 0.2);
            positions.setX(v, x * (0.8 + Math.random() * 0.4));
          }

          const seepage = new THREE.Mesh(seepageGeometry, seepageMaterial);

          // Position on cliff face
          const seepageHeight = Math.abs(height) * (0.2 + Math.random() * 0.5);
          let distance = 7.6 + Math.random() * 0.5;

          if (side > 0 && isDropOff) {
            distance += (seepageHeight / Math.abs(height)) * 30;
          } else if (side < 0 && !isDropOff) {
            distance += (seepageHeight / Math.abs(height)) * 15;
          }

          const perpX = Math.cos(point.heading) * distance * side;
          const perpZ = -Math.sin(point.heading) * distance * side;

          if (height > 0) {
            seepage.position.set(
              point.x + perpX,
              (point.y || 0) + seepageHeight,
              point.z + perpZ,
            );
          } else {
            seepage.position.set(
              point.x + perpX,
              (point.y || 0) - seepageHeight,
              point.z + perpZ,
            );
          }

          seepage.rotation.y =
            point.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
          seepage.receiveShadow = true;
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
        if (Math.random() > 0.6) {
          const point = this.roadPath[i];

          // Create vine as elongated curved mesh
          const vineLength = 3 + Math.random() * 5;
          const vineGeometry = new THREE.PlaneGeometry(
            0.3 + Math.random() * 0.2,
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

          // Position vine hanging from cliff face
          const vineHeight = Math.abs(height) * (0.3 + Math.random() * 0.4);
          let distance = 7.5 + Math.random() * 1;

          if (side > 0 && isDropOff) {
            distance += (vineHeight / Math.abs(height)) * 30;
          } else if (side < 0 && !isDropOff) {
            distance += (vineHeight / Math.abs(height)) * 15;
          }

          const perpX = Math.cos(point.heading) * distance * side;
          const perpZ = -Math.sin(point.heading) * distance * side;

          const roadY = point.y || 0;

          if (height > 0) {
            vine.position.set(
              point.x + perpX,
              roadY + vineHeight - vineLength / 2,
              point.z + perpZ,
            );
          } else {
            vine.position.set(
              point.x + perpX,
              roadY - vineHeight - vineLength / 2,
              point.z + perpZ,
            );
          }

          vine.rotation.y =
            point.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
          vine.rotation.x = (Math.random() - 0.5) * 0.2;

          vine.castShadow = true;
          vine.receiveShadow = true;
          group.add(vine);
        }
      }

      // Add moss and small vegetation patches - DISABLED to prevent floating
      // These were positioned using cliff height which caused floating objects
      if (false) {
      for (let i = 0; i < this.roadPath.length; i += 12) {
        const point = this.roadPath[i];

        // Add vegetation at various heights
        if (Math.random() > 0.4) {
          const numPatches = 1 + Math.floor(Math.random() * 2);

          for (let p = 0; p < numPatches; p++) {
            // Height on cliff (favor lower areas for vegetation)
            const heightRatio = Math.random() * 0.5; // Lower half of cliff
            const cliffHeight = Math.abs(height) * heightRatio;

            // Calculate position with slope
            let distance = 7.2 + Math.random() * 0.5;
            if (side > 0 && isDropOff) {
              distance += heightRatio * heightRatio * 25;
            } else if (side < 0 && !isDropOff) {
              distance += heightRatio * heightRatio * 12;
            }

            const perpX = Math.cos(point.heading) * distance * side;
            const perpZ = -Math.sin(point.heading) * distance * side;

            // Choose between moss patch or small bush
            if (Math.random() > 0.5) {
              // Moss patch (flat against cliff)
              const mossGeometry = new THREE.PlaneGeometry(
                1.5 + Math.random() * 2,
                1 + Math.random() * 1.5,
              );
              const moss = new THREE.Mesh(mossGeometry, mossMaterial);

              // Position moss on cliff face
              const mossY =
                height > 0
                  ? (point.y || 0) + cliffHeight // Mountain side
                  : (point.y || 0) - cliffHeight; // Drop-off side

              moss.position.set(point.x + perpX, mossY, point.z + perpZ);

              // Rotate to face outward from cliff
              moss.rotation.y =
                point.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
              moss.rotation.x = (Math.random() - 0.5) * 0.3;
              moss.rotation.z = (Math.random() - 0.5) * 0.3;

              moss.receiveShadow = true;
              group.add(moss);
            } else {
              // Small bush/grass tuft
              const bushGeometry = new THREE.SphereGeometry(
                0.3 + Math.random() * 0.4,
                5,
                4,
              );
              const bush = new THREE.Mesh(bushGeometry, vegetationMaterial);

              if (height > 0) {
                bush.position.set(
                  point.x + perpX,
                  (point.y || 0) + cliffHeight,
                  point.z + perpZ,
                );
              } else {
                bush.position.set(
                  point.x + perpX,
                  (point.y || 0) - cliffHeight,
                  point.z + perpZ,
                );
              }

              bush.scale.set(
                1.2 + Math.random() * 0.3,
                0.8 + Math.random() * 0.3,
                1 + Math.random() * 0.3,
              );

              bush.castShadow = true;
              bush.receiveShadow = true;
              group.add(bush);
            }
          }
        }
      }
      } // Close if (false) for vegetation patches

      // Add snow patches and rocky outcrops on upper mountain (if going up)
      if (height > 20) {
        // Snow patches on upper elevations
        const snowMaterial = new THREE.MeshStandardMaterial({
          color: 0xf0f0f0,
          roughness: 0.7,
          metalness: 0.0,
        });

        for (let i = startIdx; i <= endIdx; i += 8) {
          if (Math.random() > 0.4 && height > 30) {
            const point = this.roadPath[i];
            const snowGeometry = new THREE.PlaneGeometry(
              3 + Math.random() * 4,
              2 + Math.random() * 3,
            );
            const snow = new THREE.Mesh(snowGeometry, snowMaterial);

            const perpX =
              Math.cos(point.heading) * (8 + Math.random() * 2) * side;
            const perpZ =
              -Math.sin(point.heading) * (8 + Math.random() * 2) * side;

            snow.position.set(
              point.x + perpX,
              (point.y || 0) + height * (0.7 + Math.random() * 0.3),
              point.z + perpZ,
            );

            // Rotate to face outward and add some randomness
            snow.rotation.y =
              point.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
            snow.rotation.x = (Math.random() - 0.5) * 0.3;
            snow.rotation.z = (Math.random() - 0.5) * 0.3;

            snow.receiveShadow = true;
            group.add(snow);
          }
        }

        // Sparse alpine vegetation - DISABLED to prevent floating
        // These were positioned using cliff height which caused floating
        if (false) {
        const alpineBushGeometry = new THREE.SphereGeometry(0.6, 4, 3);
        const alpineBushMaterial = new THREE.MeshStandardMaterial({
          color: 0x1a3a1a,
          roughness: 0.9,
          metalness: 0.0,
        });

        for (let i = 0; i < this.roadPath.length; i += 15) {
          if (Math.random() > 0.6) {
            const point = this.roadPath[i];
            const bush = new THREE.Mesh(alpineBushGeometry, alpineBushMaterial);

            const perpX = Math.cos(point.heading) * 9 * side;
            const perpZ = -Math.sin(point.heading) * 9 * side;

            bush.position.set(
              point.x + perpX,
              (point.y || 0) + height * 0.3,
              point.z + perpZ,
            );

            bush.scale.set(
              1 + Math.random() * 0.3,
              0.6 + Math.random() * 0.3,
              1 + Math.random() * 0.3,
            );

            bush.castShadow = true;
            bush.receiveShadow = true;
            group.add(bush);
          }
        }
        }
      }

      return group;
    };

    // Create single wide ground strip that spans the full road width
    const createFullWidthStrip = () => {
      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      const indices = [];
      const colors = [];

      // Asymmetric edges to match asymmetric cliff walls, with slight shift
      const shiftRight = -0.5; // Shift entire strip left by 0.5m
      const leftEdge = -(this.roadWidth / 2 + 1.6) + shiftRight;
      const rightEdge = this.roadWidth / 2 + 2 + shiftRight;

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

        // Brown color
        for (let j = 0; j < 4; j++) {
          colors.push(0.25, 0.2, 0.18);
        }

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
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0.0,
        side: THREE.DoubleSide // Make sure both sides render
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      return mesh;
    };

    // Add single full-width ground strip
    const groundStrip = createFullWidthStrip();
    this.scene.add(groundStrip);

    // Left cliff wall (mountain face rising above)
    const leftCliff = createFacetedCliff(-1, 40, false); // Taller mountain wall
    this.scene.add(leftCliff);

    // Right cliff wall (drop-off) - extremely tall mountainside cliff
    const rightCliff = createFacetedCliff(1, -200, true); // Doubled height from -100 to -200
    this.scene.add(rightCliff);
  }

  createLayeredMountains() {
    // Create multiple layers of mountains for depth

    // Layer 1: Distant mountain range (far background)
    this.createDistantMountainRange();

    // Layer 2: Mid-range mountains
    this.createMidRangeMountains();

    // Layer 3: Near hills with more detail
    this.createNearHills();

    // Layer 4: Majestic peak - the dominant mountain
    this.createMajesticPeak();

    // Layer 5: End course dramatic mountains
    this.createEndCourseMountains();
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

    // Create mountain silhouette
    const points = [];

    // Start from left edge
    points.push(new THREE.Vector3(-width / 2, -80, baseDistance));

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
    points.push(new THREE.Vector3(width / 2, -80, baseDistance));

    // Create triangulated mountain face
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Create two triangles for each segment (forming a quad to ground)
      const baseIndex = vertices.length / 3;

      // Add vertices
      vertices.push(p1.x, p1.y, p1.z); // Top left
      vertices.push(p2.x, p2.y, p2.z); // Top right
      vertices.push(p2.x, -80, p2.z); // Bottom right
      vertices.push(p1.x, -80, p1.z); // Bottom left

      // Add indices for two triangles
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
      indices.push(baseIndex, baseIndex + 2, baseIndex + 3);

      // Atmospheric perspective - darker blue-grey color
      const atmosphericColor = {
        r: 0.35 + Math.random() * 0.05,
        g: 0.4 + Math.random() * 0.05,
        b: 0.5 + Math.random() * 0.05,
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
  }

  createMidRangeMountains() {
    // Create mid-distance mountains with more detail
    const group = new THREE.Group();

    // Create several individual peaks - MOVED to avoid road overlap
    // Actual road bounds: X: 0-3622, Z: 0-2488
    // Placing peaks far left (X < -500) to guarantee clearance
    const peaks = [
      { x: -900, z: 700, height: 250, width: 300 }, // Left back - MOVED from -600
      { x: -700, z: 1200, height: 200, width: 280 }, // Left-center back - MOVED from -200
      { x: -1000, z: 1800, height: 280, width: 350 }, // Left far - MOVED from 300
      { x: -600, z: 2200, height: 230, width: 290 }, // Left-back - MOVED from 800
      { x: -800, z: 2600, height: 260, width: 310 }, // Left end - MOVED from 1200
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
  }

  createLakeIslandMountain() {
    // Create a dramatic mountain rising from the lake in the center of the map
    const group = new THREE.Group();

    // Main mountain peak rising from the lake - smaller to avoid road
    const mainPeak = this.createMountainPeak(
      350, // Center of the map area
      100, // Slightly forward from true center
      180, // Reduced height to avoid crossing road
      250, // Smaller base
      0x3a4540, // Darker grey-green for contrast with lake
    );
    group.add(mainPeak);

    // Add a secondary smaller peak for visual interest
    const secondaryPeak = this.createMountainPeak(
      250, // Offset to the left
      -50, // Move further forward/left to avoid road
      120, // Smaller height
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
      const distance = 100 + Math.random() * 40;
      const rockX = 350 + Math.cos(angle) * distance;
      const rockZ = 100 + Math.sin(angle) * distance;

      const rockSize = 15 + Math.random() * 10;
      const rockGeometry = this.displaceVertices(
        new THREE.IcosahedronGeometry(rockSize, 3),
        rockSize * 0.25,
      );
      const rock = new THREE.Mesh(rockGeometry, rockMaterial);
      rock.position.set(rockX, -70, rockZ); // Just above water level
      rock.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      rock.scale.set(
        1 + Math.random() * 0.5,
        0.6 + Math.random() * 0.3,
        1 + Math.random() * 0.5,
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
        const snowWhite = 0.97 + Math.random() * 0.03;
        colors1.push(
          snowWhite - 0.03, // Slightly less red for blue tint
          snowWhite,
          snowWhite + 0.02,
        );
      } else if (normalizedHeight > 0.64) {
        // Transition zone - ragged mix of rock and snow patches
        const mixFactor = (normalizedHeight - 0.64) / 0.14;
        const patchiness = Math.random() < mixFactor * 0.7 ? 0.25 : 0; // Snow patches
        const rockGrey = 0.35 + normalizedHeight * 0.15;
        const snowWhite = 0.96;
        const mixed = Math.min(
          rockGrey + (snowWhite - rockGrey) * mixFactor + patchiness,
          snowWhite,
        );
        colors1.push(
          mixed + Math.random() * 0.03,
          mixed + Math.random() * 0.03,
          mixed + Math.random() * 0.03 + 0.03,
        );
      } else {
        // Rock colors - darker at base, lighter towards peak, with
        // horizontal strata banding for geological drama
        const band =
          Math.sin(normalizedHeight * 28) > 0.55 ? -0.06 : 0; // Dark strata
        const baseGrey = 0.23 + normalizedHeight * 0.24 + band;
        const variation = Math.random() * 0.05;
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
        const snowWhite = 0.96 + Math.random() * 0.04;
        colors.push(snowWhite - 0.03, snowWhite, snowWhite + 0.02);
      } else if (normalizedHeight > 0.6) {
        // Ragged transition with snow patches clinging to the rock
        const mixFactor = (normalizedHeight - 0.6) / 0.15;
        const patchiness = Math.random() < mixFactor * 0.7 ? 0.22 : 0;
        const rockGrey = 0.35 + normalizedHeight * 0.15;
        const snowWhite = 0.95;
        const mixed = Math.min(
          rockGrey + (snowWhite - rockGrey) * mixFactor + patchiness,
          snowWhite,
        );
        colors.push(
          mixed + Math.random() * 0.03,
          mixed + Math.random() * 0.03,
          mixed + Math.random() * 0.03 + 0.03,
        );
      } else {
        // Rock with subtle strata banding, slightly different cadence to
        // distinguish it from the first peak
        const band = Math.sin(normalizedHeight * 24 + 1.3) > 0.6 ? -0.05 : 0;
        const baseGrey = 0.25 + normalizedHeight * 0.22 + band;
        const variation = Math.random() * 0.05;
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
    mountain.position.set(x, -50, z); // Base at lake level
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
      snowCap.position.set(x, height * 0.85 - 50, z);
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
        g: baseGreen + Math.random() * 0.06,
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
    const numTrees = Math.floor(3 + Math.random() * 4);
    for (let i = 0; i < numTrees; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = width * 0.2 + Math.random() * width * 0.3;
      const treeX = x + Math.cos(angle) * distance;
      const treeZ = z + Math.sin(angle) * distance;
      const treeY = -60 + height * (0.3 + Math.random() * 0.4);

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

    const numBushes = Math.floor(5 + Math.random() * 5);
    for (let i = 0; i < numBushes; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = width * 0.15 + Math.random() * width * 0.35;
      const bushX = x + Math.cos(angle) * distance;
      const bushZ = z + Math.sin(angle) * distance;
      const bushY = -60 + height * (0.2 + Math.random() * 0.3);

      const bushGeometry = new THREE.SphereGeometry(
        3 + Math.random() * 2,
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
    ctx.fillStyle = "#656565";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add noise for rough surface
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 30;
      data[i] += noise; // Red
      data[i + 1] += noise; // Green
      data[i + 2] += noise; // Blue
    }

    ctx.putImageData(imageData, 0, 0);

    // Add stratification lines
    ctx.strokeStyle = "#4a4a4a";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;

    for (let y = 0; y < canvas.height; y += 15 + Math.random() * 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < canvas.width; x += 20) {
        ctx.lineTo(x, y + (Math.random() - 0.5) * 3);
      }
      ctx.stroke();
    }

    // Add cracks
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.4;

    for (let i = 0; i < 15; i++) {
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      ctx.beginPath();
      ctx.moveTo(startX, startY);

      let x = startX;
      let y = startY;
      const steps = 5 + Math.random() * 10;

      for (let j = 0; j < steps; j++) {
        x += (Math.random() - 0.5) * 30;
        y += Math.random() * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Add mineral veins
    ctx.strokeStyle = "#7a7570";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.2;

    for (let i = 0; i < 5; i++) {
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(
        startX + Math.random() * 100,
        startY + Math.random() * 100,
        startX + Math.random() * 200,
        startY + Math.random() * 200,
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
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Large-scale tonal mottling - soft warm/cool patches give the asphalt
    // depth instead of reading as a flat grey sheet
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = 150 + Math.random() * 300;
      const warm = Math.random() > 0.5;
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
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 8 + 3;
      const darkness = Math.random() * 20;
      ctx.fillStyle = `rgba(${40 - darkness}, ${40 - darkness}, ${40 - darkness}, 0.3)`;
      ctx.fillRect(x, y, size, size);
    }

    // Fine aggregate texture (small stones) - subtle warm/cool tint variation
    // so the chip seal sparkles slightly instead of being pure grey
    for (let i = 0; i < 2600; i++) {
      const gray = Math.random() * 30 + 35;
      const tint = Math.floor((Math.random() - 0.5) * 12);
      ctx.fillStyle = `rgba(${gray + tint}, ${gray}, ${gray - tint}, ${0.4 + Math.random() * 0.5})`;
      const size = Math.random() * 2.5 + 0.5;
      ctx.fillRect(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        size,
        size,
      );
    }

    // Sparse bright quartz flecks that catch the light
    for (let i = 0; i < 220; i++) {
      const bright = 95 + Math.random() * 50;
      ctx.fillStyle = `rgba(${bright}, ${bright}, ${bright - 5}, ${0.35 + Math.random() * 0.35})`;
      const size = Math.random() * 1.5 + 0.5;
      ctx.fillRect(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        size,
        size,
      );
    }

    // Coarse aggregate (larger stones)
    for (let i = 0; i < 250; i++) {
      const gray = Math.random() * 25 + 45;
      ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, 0.7)`;
      const size = Math.random() * 5 + 2;
      ctx.beginPath();
      ctx.arc(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        size / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Embedded larger rocks
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 4 + 3;
      const gray = Math.random() * 20 + 50;
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
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      const length = 60 + Math.random() * 250;
      const angle = (Math.random() - 0.5) * 0.6;

      ctx.lineWidth = 6 + Math.random() * 20;
      ctx.globalAlpha = 0.25 + Math.random() * 0.4;

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
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const width = 18 + Math.random() * 35;
      const height = 35 + Math.random() * 70;

      ctx.fillStyle = "#0f0f0f";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((Math.random() - 0.5) * 0.6);
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.restore();
    }

    // Diagonal skid marks from drifting
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 10; i++) {
      // Reduced from 15
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      const angle = Math.random() * Math.PI * 2;
      const length = 40 + Math.random() * 100;

      ctx.strokeStyle = "#151515";
      ctx.lineWidth = 10 + Math.random() * 12;
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
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      const length = 80 + Math.random() * 150;

      ctx.lineWidth = 8 + Math.random() * 10;
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
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = 10 + Math.random() * 20;

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
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      ctx.moveTo(startX, startY);

      for (let j = 0; j < 5; j++) {
        ctx.lineTo(
          startX + (Math.random() - 0.5) * 50,
          startY + Math.random() * 60,
        );
      }
      ctx.stroke();
    }

    // Large patch repairs (rectangular)
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 12; i++) {
      // Reduced from 20
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const width = 25 + Math.random() * 50;
      const height = 25 + Math.random() * 50;

      ctx.fillStyle = "#424242";
      ctx.fillRect(x, y, width, height);

      for (let j = 0; j < 30; j++) {
        const px = x + Math.random() * width;
        const py = y + Math.random() * height;
        ctx.fillStyle = `rgba(${48 + Math.random() * 22}, ${48 + Math.random() * 22}, ${48 + Math.random() * 22}, 0.6)`;
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    }

    // Irregular patch repairs
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 8; i++) {
      // Reduced from 12
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = 30 + Math.random() * 60;

      ctx.fillStyle = "#3f3f3f";
      ctx.beginPath();
      for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
        const radius = size * (0.7 + Math.random() * 0.3);
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
      const y = Math.random() * canvas.height;
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
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = 8 + Math.random() * 15;

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
    for (let y = 0; y < canvas.height; y += 30 + Math.random() * 20) {
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
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      const segments = 4 + Math.floor(Math.random() * 3);
      ctx.lineWidth = 10 + Math.random() * 6;

      for (let j = 0; j < segments; j++) {
        ctx.beginPath();
        const segY = startY + j * 25;
        ctx.moveTo(startX, segY);
        ctx.lineTo(startX + (Math.random() - 0.5) * 4, segY + 10);
        ctx.stroke();
      }
    }

    // Corner entry marks - reduced
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 5; i++) {
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      const length = 50 + Math.random() * 80;
      const curve = (Math.random() - 0.5) * 0.3;

      ctx.strokeStyle = "#0a0a0a";
      ctx.lineWidth = 12 + Math.random() * 8;
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
      const cx = Math.random() * canvas.width;
      const cy = Math.random() * canvas.height;
      const radius = 40 + Math.random() * 80;
      const arcStart = Math.random() * Math.PI;
      const arcLength = Math.PI * 0.3 + Math.random() * Math.PI * 0.3;

      ctx.strokeStyle = "#121212";
      ctx.lineWidth = 7 + Math.random() * 5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, arcStart, arcStart + arcLength);
      ctx.stroke();
    }

    // Rubber buildup marks - reduced
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#080808";
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = 2 + Math.random() * 4;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Circular pothole repairs - reduced
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = 15 + Math.random() * 20;

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
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const width = 20 + Math.random() * 15;
      const length = 80 + Math.random() * 120;
      const angle = (Math.random() - 0.5) * 0.6;

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
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      const length = 40 + Math.random() * 80;

      const gradient = ctx.createLinearGradient(
        startX,
        startY,
        startX + 5,
        startY + length,
      );
      gradient.addColorStop(0, "rgba(25, 25, 25, 0.25)");
      gradient.addColorStop(1, "rgba(25, 25, 25, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(startX, startY, 6 + Math.random() * 4, length);
    }

    // Surface oxidation - reduced
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = 80 + Math.random() * 100;

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
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      ctx.moveTo(startX, startY);

      for (let j = 0; j < 3; j++) {
        ctx.lineTo(
          startX + (Math.random() - 0.5) * 30,
          startY + Math.random() * 40,
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
        const snow = 0.92 + Math.random() * 0.08;
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
    finalPeak1.rotation.y = Math.random() * Math.PI;
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
    finalPeak2.rotation.y = Math.random() * Math.PI;
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
    finalPeak3.rotation.y = Math.random() * Math.PI;
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
      const distance = 1500 + Math.random() * 400;

      // Calculate position relative to road direction
      const forwardX = Math.sin(endHeading);
      const forwardZ = Math.cos(endHeading);

      smallPeak.position.set(
        endPoint.x +
          forwardX * distance * Math.cos(angle) +
          perpX * distance * Math.sin(angle),
        -100 - Math.random() * 50,
        endPoint.z +
          forwardZ * distance * Math.cos(angle) +
          perpZ * distance * Math.sin(angle),
      );
      smallPeak.scale.set(
        0.8 + Math.random() * 0.4,
        0.7 + Math.random() * 0.6,
        0.8 + Math.random() * 0.4,
      );
      smallPeak.rotation.y = Math.random() * Math.PI;
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
        800 + Math.random() * 400, // Wider bases
        600 + Math.random() * 300, // Varied heights
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
        -200 - Math.random() * 100,
        roadPoint.z - localPerpZ * (2000 + i * 300),
      );
      distantPeak.scale.set(
        1.5 + Math.random() * 0.5,
        1.2 + Math.random() * 0.4,
        1.5 + Math.random() * 0.5,
      );
      distantPeak.rotation.y = Math.random() * Math.PI;
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
        -300 - Math.random() * 100,
        endPoint.z - perpZ * leftDist + Math.cos(endHeading) * forwardDist,
      );
      farPeak.scale.set(
        1.8 + Math.random() * 0.6,
        1.5 + Math.random() * 0.5,
        1.8 + Math.random() * 0.6,
      );
      farPeak.rotation.y = Math.random() * Math.PI * 2;
      farPeak.castShadow = false; // Too distant for shadows
      farPeak.receiveShadow = true;
      group.add(farPeak);
    }

    this.tagMeshes(group, "mountain");
    this.scene.add(group);
  }

  createGrass() {
    // Create a lake at the bottom instead of grass
    const lakeMaterial = new THREE.MeshStandardMaterial({
      color: 0x10539e, // Deeper, more saturated alpine blue
      side: THREE.DoubleSide,
      roughness: 0.06, // Glassy water surface
      metalness: 0.55, // Stronger specular response
      envMapIntensity: 1.6, // Pick up more sky reflection for shine
    });

    const lakeGeometry = new THREE.PlaneGeometry(3000, 3000);
    const lake = new THREE.Mesh(lakeGeometry, lakeMaterial);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(0, -200, 0); // Below cliff level
    lake.receiveShadow = true;
    this.scene.add(lake);

    // Create continuous terrain strips along the road (only in active segment range)
    // Extend by 20 segments to match road geometry and decorative elements
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    const createTerrainStrip = (side, offset, dropAmount, color) => {
      const points = [];
      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      const indices = [];

      // Create vertices for terrain strip (only for active range)
      for (let i = startIdx; i < endIdx; i++) {
        const point = this.roadPath[i];
        const nextPoint = this.roadPath[i + 1];
        const roadY = point.y !== undefined ? point.y : 0;
        const nextRoadY = nextPoint.y !== undefined ? nextPoint.y : 0;

        // Calculate perpendicular offset
        const perpX = Math.cos(point.heading) * offset * side;
        const perpZ = -Math.sin(point.heading) * offset * side;
        const nextPerpX = Math.cos(nextPoint.heading) * offset * side;
        const nextPerpZ = -Math.sin(nextPoint.heading) * offset * side;

        // Inner edge (closer to road)
        vertices.push(
          point.x + perpX,
          roadY + dropAmount,
          point.z + perpZ,
          nextPoint.x + nextPerpX,
          nextRoadY + dropAmount,
          nextPoint.z + nextPerpZ,
        );

        // Outer edge (further from road) - extend much further for mountainside
        vertices.push(
          point.x + perpX * 8,
          roadY + dropAmount * 2,
          point.z + perpZ * 8,
          nextPoint.x + nextPerpX * 8,
          nextRoadY + dropAmount * 2,
          nextPoint.z + nextPerpZ * 8,
        );
      }

      // Create triangles
      const segmentCount = endIdx - startIdx;
      for (let i = 0; i < segmentCount; i++) {
        const baseIndex = i * 4;
        // Two triangles per segment
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

      // Create simple grass texture
      const grassCanvas = document.createElement("canvas");
      grassCanvas.width = 256;
      grassCanvas.height = 256;
      const grassCtx = grassCanvas.getContext("2d");

      // Base color from parameter
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      grassCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      grassCtx.fillRect(0, 0, grassCanvas.width, grassCanvas.height);

      // Add darker grass patches for texture
      grassCtx.globalAlpha = 0.3;
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * grassCanvas.width;
        const y = Math.random() * grassCanvas.height;
        const size = Math.random() * 8 + 2;
        const darkness = Math.random() * 30;
        grassCtx.fillStyle = `rgb(${Math.max(0, r - darkness)}, ${Math.max(0, g - darkness)}, ${Math.max(0, b - darkness)})`;
        grassCtx.fillRect(x, y, size, size);
      }

      // Add lighter highlights
      grassCtx.globalAlpha = 0.2;
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * grassCanvas.width;
        const y = Math.random() * grassCanvas.height;
        const size = Math.random() * 4 + 1;
        grassCtx.fillStyle = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 15)})`;
        grassCtx.fillRect(x, y, size, size);
      }

      const grassTexture = new THREE.CanvasTexture(grassCanvas);
      grassTexture.wrapS = THREE.RepeatWrapping;
      grassTexture.wrapT = THREE.RepeatWrapping;
      grassTexture.repeat.set(4, 4);

      const material = new THREE.MeshStandardMaterial({
        map: grassTexture,
        roughness: 0.95,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      return mesh;
    };

    // No terrain strips needed - using white road edge lines instead

    // Add vertical walls connecting road to terrain
    this.createRoadWalls();

    // Guard rails commented out due to rendering issues
    // this.createGuardRails();

    // Add some water depth variation patches
    for (let i = 0; i < 20; i++) {
      const patchSize = 50 + Math.random() * 100;
      const patchGeometry = new THREE.PlaneGeometry(patchSize, patchSize);
      const patchMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a5599, // Darker blue for deeper water
        side: THREE.DoubleSide,
        roughness: 0.15, // Still water-like
        metalness: 0.35,
      });
      const patch = new THREE.Mesh(patchGeometry, patchMaterial);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(
        (Math.random() - 0.5) * 1500,
        -200.005, // Match lake level
        (Math.random() - 0.5) * 1500,
      );
      patch.receiveShadow = true;
      this.scene.add(patch);
    }
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

      // Checkered banner gantry over the finish line
      this.createFinishBanner(this.roadPath[finishSegmentIdx]);

      // Store finish line position for detection
      this.finishLinePosition = new THREE.Vector3(
        this.roadPath[finishSegmentIdx].x,
        finishY,
        this.roadPath[finishSegmentIdx].z,
      );
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
    textPanel.castShadow = true;
    group.add(textPanel);

    // Orient across the road at the finish segment. The group's local X axis
    // must lie along the road's perpendicular: rotate by heading around Y
    group.position.set(point.x, point.y || 0, point.z);
    group.rotation.y = point.heading;
    this.scene.add(group);
  }

  addEnvironmentalDetails() {
    // Rock formations and cliff details
    this.addRockFormations();

    // Trees along the roadside - only on the mountain side (left)
    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.6, 4);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
      metalness: 0.0,
    });
    const foliageGeometry = new THREE.SphereGeometry(3, 6, 5);
    // Three foliage tones (shared materials) so the treeline reads as a
    // mixed forest instead of identical green spheres
    const foliageMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0x2e7d32, // Mid forest green
        roughness: 0.95,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x4a7a2a, // Sunlit olive green
        roughness: 0.95,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x1c5e38, // Deep pine green
        roughness: 0.95,
        metalness: 0.0,
      }),
    ];

    // Place trees along road path - only on left (mountain) side (only in active segment range)
    const startIdx = Math.max(0, this.startSegment);
    const endIdx = Math.min(this.roadPath.length - 1, this.endSegment + 20);

    for (let index = startIdx; index <= endIdx; index++) {
      const point = this.roadPath[index];
      if (index % 7 === 0) {
        // Every 7th segment for sparser placement
        // Only place trees on the left (mountain) side
        const treeDistance = 20 + Math.random() * 10;

        // Left side tree (mountain side)
        const leftX = point.x - treeDistance * Math.cos(point.heading);
        const leftZ = point.z + treeDistance * Math.sin(point.heading);

        // Ground level for tree base
        const groundLevel = point.y - 0.5;

        // Vary each tree's size and canopy shape slightly
        const treeScale = 0.8 + Math.random() * 0.55;
        const canopyWidth = 0.9 + Math.random() * 0.25;
        const canopyHeight = 0.95 + Math.random() * 0.35;

        const leftTrunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        leftTrunk.scale.setScalar(treeScale);
        leftTrunk.position.set(leftX, groundLevel + 2 * treeScale, leftZ);
        leftTrunk.castShadow = true;
        leftTrunk.receiveShadow = true;
        this.scene.add(leftTrunk);

        const leftFoliage = new THREE.Mesh(
          foliageGeometry,
          foliageMaterials[Math.floor(Math.random() * foliageMaterials.length)],
        );
        leftFoliage.scale.set(
          treeScale * canopyWidth,
          treeScale * canopyHeight,
          treeScale * canopyWidth,
        );
        leftFoliage.rotation.y = Math.random() * Math.PI;
        leftFoliage.position.set(leftX, groundLevel + 5.5 * treeScale, leftZ);
        leftFoliage.castShadow = true;
        leftFoliage.receiveShadow = true;
        this.scene.add(leftFoliage);

        // No trees on right side (cliff drop-off) to avoid floating trees
      }
    }

    // Bushes along the mountain side only (only in active segment range)
    const bushGeometry = new THREE.SphereGeometry(1, 6, 4);
    const bushMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0x2d5016,
        roughness: 0.9,
        metalness: 0.0,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x3f6622, // Lighter scrub green for variety
        roughness: 0.9,
        metalness: 0.0,
      }),
    ];

    for (let index = startIdx; index <= endIdx; index++) {
      const point = this.roadPath[index];
      if (index % 6 === 0) {
        // Less frequent
        // Only left side bushes (mountain side)
        const bushDistance = 12 + Math.random() * 5;
        const bushX = point.x - bushDistance * Math.cos(point.heading);
        const bushZ = point.z + bushDistance * Math.sin(point.heading);

        const leftBush = new THREE.Mesh(
          bushGeometry,
          bushMaterials[Math.floor(Math.random() * bushMaterials.length)],
        );
        const bushScale = 0.7 + Math.random() * 0.7;
        leftBush.scale.set(bushScale * 1.1, bushScale * 0.8, bushScale * 1.1);
        leftBush.position.set(bushX, point.y - 0.3, bushZ); // Partially embedded
        leftBush.castShadow = true;
        leftBush.receiveShadow = true;
        this.scene.add(leftBush);

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
          const leftX = point.x - 8.5 * Math.cos(point.heading);
          const leftZ = point.z + 8.5 * Math.sin(point.heading);
          const leftCone = new THREE.Mesh(coneGeometry, coneMaterial);
          leftCone.position.set(leftX, coneY, leftZ);
          leftCone.castShadow = true;
          leftCone.receiveShadow = true;
          this.scene.add(leftCone);

          const rightX = point.x + 8.5 * Math.cos(point.heading);
          const rightZ = point.z - 8.5 * Math.sin(point.heading);
          const rightCone = new THREE.Mesh(coneGeometry, coneMaterial);
          rightCone.position.set(rightX, coneY, rightZ);
          rightCone.castShadow = true;
          rightCone.receiveShadow = true;
          this.scene.add(rightCone);
        }
      }
    }

    // Start sign
    const signPostGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 8);
    const signPostMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.9,
      metalness: 0.0,
    });
    const signPost = new THREE.Mesh(signPostGeometry, signPostMaterial);
    signPost.position.set(-5, 1, 10);
    signPost.castShadow = true;
    signPost.receiveShadow = true;
    this.scene.add(signPost);

    const signGeometry = new THREE.PlaneGeometry(2, 1);
    const signMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.0,
    });
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(-5, 2, 10);
    sign.castShadow = true;
    sign.receiveShadow = true;
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
      if (index % 3 === 0) {
        // Every 3rd segment (60m spacing)
        // Posts on outside of curves, both sides on straights
        const nextIndex = Math.min(index + 1, this.roadPath.length - 1);
        const headingChange = this.roadPath[nextIndex].heading - point.heading;

        if (Math.abs(headingChange) < 0.01) {
          // Straight section - posts on both sides
          // Left post
          const leftX = point.x - 9 * Math.sin(point.heading + Math.PI / 2);
          const leftZ = point.z - 9 * Math.cos(point.heading + Math.PI / 2);
          const leftPost = new THREE.Mesh(postGeometry, postMaterial);
          leftPost.position.set(leftX, 0.75, leftZ);
          leftPost.castShadow = true;
          leftPost.receiveShadow = true;
          this.scene.add(leftPost);

          // White reflector strip near the top of the post
          const leftReflector = new THREE.Mesh(
            reflectorGeometry,
            whiteReflectorMaterial,
          );
          leftReflector.position.set(leftX, 1.2, leftZ);
          leftReflector.rotation.y = point.heading;
          this.scene.add(leftReflector);

          // Right post
          const rightX = point.x + 9 * Math.sin(point.heading + Math.PI / 2);
          const rightZ = point.z + 9 * Math.cos(point.heading + Math.PI / 2);
          const rightPost = new THREE.Mesh(postGeometry, postMaterial);
          rightPost.position.set(rightX, 0.75, rightZ);
          rightPost.castShadow = true;
          rightPost.receiveShadow = true;
          this.scene.add(rightPost);

          const rightReflector = new THREE.Mesh(
            reflectorGeometry,
            whiteReflectorMaterial,
          );
          rightReflector.position.set(rightX, 1.2, rightZ);
          rightReflector.rotation.y = point.heading;
          this.scene.add(rightReflector);
        } else {
          // Curve - post on outside only
          const side = headingChange > 0 ? -1 : 1; // Outside of curve
          const postX =
            point.x + side * 9 * Math.sin(point.heading + Math.PI / 2);
          const postZ =
            point.z + side * 9 * Math.cos(point.heading + Math.PI / 2);
          const post = new THREE.Mesh(postGeometry, postMaterial);
          post.position.set(postX, 0.75, postZ);
          post.castShadow = true;
          post.receiveShadow = true;
          this.scene.add(post);

          // Add reflector
          const reflector = new THREE.Mesh(
            reflectorGeometry,
            reflectorMaterial,
          );
          reflector.position.set(postX, 1.2, postZ);
          reflector.rotation.y = point.heading;
          reflector.castShadow = true;
          reflector.receiveShadow = true;
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

        // Add reflective stripe
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.copy(cone.position);
        stripe.position.y += 0.2;
        stripe.rotation.x = -Math.PI / 2;
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
      // Skip placing barriers near the ramp (within 4 segments)
      if (hasRamp && Math.abs(i - rampSegment) <= 4) {
        continue;
      }

      const point = this.roadPath[i];

      // Place barrier on left side (mountain side) to avoid floating over cliff
      const barrierX = point.x - Math.cos(point.heading) * 25;
      const barrierZ = point.z + Math.sin(point.heading) * 25;

      const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
      barrier.position.set(barrierX, point.y + 0.5, barrierZ);
      barrier.rotation.y = point.heading;
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      this.scene.add(barrier);

      // Store barrier for collision detection
      this.roadworkObstacles.push({
        type: "barrier",
        position: new THREE.Vector3(barrierX, point.y + 0.5, barrierZ),
        width: 4,
        height: 1,
        depth: 0.8,
      });

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

      // Add construction equipment (static bulldozer) - moved far from road on mountain side
      this.createBulldozer(
        rampPoint.x - Math.cos(rampPoint.heading) * 30,
        rampPoint.y,
        rampPoint.z + Math.sin(rampPoint.heading) * 30,
        rampPoint.heading,
      );

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

      // Add a simple work truck instead of bulldozer (moved far from road on mountain side)
      this.createWorkTruck(
        workPoint.x - Math.cos(workPoint.heading) * 25,
        workPoint.y,
        workPoint.z + Math.sin(workPoint.heading) * 25,
        workPoint.heading,
      );
    }

    // Add appropriate signage based on zone type
    if (zoneType === "major") {
      this.createConstructionSign(
        this.roadPath[Math.max(0, startSegment - 5)],
        "ROAD WORK AHEAD",
      );

      // Add warning lights for major zones - REMOVED
      // this.createWarningLight(
      //     this.roadPath[Math.max(0, startSegment - 1)],
      //     'right'
      // );
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
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 4 + 1;
      const brightness = Math.random() * 60 - 30;

      // Vary between very dark dirt tones
      const r = Math.max(
        0,
        Math.min(255, 58 + brightness + Math.random() * 15),
      );
      const g = Math.max(
        0,
        Math.min(255, 34 + brightness + Math.random() * 12),
      );
      const b = Math.max(0, Math.min(255, 16 + brightness + Math.random() * 8));

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add darker soil patches
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const width = Math.random() * 25 + 8;
      const height = Math.random() * 25 + 8;

      ctx.fillStyle = "#281810";
      ctx.fillRect(x, y, width, height);
    }

    // Add some small rocks/pebbles
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 2 + 1;

      ctx.fillStyle = "#666666";
      ctx.fillRect(x, y, size, size);
    }

    // Add sparse grass patches on top
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const width = Math.random() * 20 + 5;
      const height = Math.random() * 15 + 3;

      ctx.fillStyle = "#228B22";
      ctx.fillRect(x, y, width, height);
    }

    // Add tire tracks or disturbance marks
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#2F1B14";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      ctx.moveTo(startX, startY);

      // Create irregular track marks
      for (let j = 0; j < 5; j++) {
        const nextX = startX + (Math.random() - 0.5) * 30;
        const nextY = startY + Math.random() * 20;
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

    // Store bulldozer for collision detection
    this.roadworkObstacles.push({
      type: "bulldozer",
      position: new THREE.Vector3(x, y, z),
      width: 4,
      height: 3,
      depth: 5,
      rotation: rotation,
    });
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

    // Position sign beside road
    const signX = point.x - Math.cos(point.heading) * 10;
    const signZ = point.z + Math.sin(point.heading) * 10;

    signGroup.position.set(signX, point.y, signZ);
    signGroup.rotation.y = point.heading;

    signGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(signGroup);
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

    // Store work truck for collision detection
    this.roadworkObstacles.push({
      type: "worktruck",
      position: new THREE.Vector3(x, y, z),
      width: 2,
      height: 2.5,
      depth: 4,
      rotation: rotation,
    });
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

  createWarningLight(point, side) {
    const lightGroup = new THREE.Group();

    // Light pole
    const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2);
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.8,
      metalness: 0.5,
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(0, 1, 0);
    lightGroup.add(pole);

    // Warning light
    const lightGeometry = new THREE.SphereGeometry(0.2, 8, 6);
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa500,
      emissive: 0xffa500,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.1,
    });
    const warningLight = new THREE.Mesh(lightGeometry, lightMaterial);
    warningLight.position.set(0, 2, 0);
    lightGroup.add(warningLight);

    // Position beside construction zone entrance
    const offset = side === "left" ? -4 : 4;
    const lightX = point.x + Math.cos(point.heading) * offset;
    const lightZ = point.z - Math.sin(point.heading) * offset;

    lightGroup.position.set(lightX, point.y, lightZ);

    lightGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(lightGroup);
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

      // Create red and white striped barrier
      const barrierGeometry = new THREE.BoxGeometry(3, 1.2, 0.5);
      const barrierMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.9,
        metalness: 0.1,
      });

      const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
      barrier.position.set(barrierX, point.y + 0.6, barrierZ);
      barrier.rotation.y = point.heading;
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      this.scene.add(barrier);

      // Store hairpin barrier for collision detection
      this.roadworkObstacles.push({
        type: "hairpin_barrier",
        position: new THREE.Vector3(barrierX, point.y + 0.6, barrierZ),
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
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.copy(barrier.position);
        stripe.position.x += Math.sin(point.heading) * s * 0.8;
        stripe.position.z += Math.cos(point.heading) * s * 0.8;
        stripe.position.z += 0.01; // Slightly in front
        this.scene.add(stripe);
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

    // Position sign beside road
    const signX = point.x - Math.cos(point.heading) * 10;
    const signZ = point.z + Math.sin(point.heading) * 10;

    signGroup.position.set(signX, point.y, signZ);
    signGroup.rotation.y = point.heading;

    signGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(signGroup);
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

    // Position on outside of turn
    const markerDistance = 8;
    const markerX = point.x - Math.cos(point.heading) * markerDistance;
    const markerZ = point.z + Math.sin(point.heading) * markerDistance;

    chevronGroup.position.set(markerX, point.y, markerZ);
    chevronGroup.rotation.y = point.heading;

    chevronGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(chevronGroup);
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
      leftPole.position.set(-6, 2.5, 0);
      gateGroup.add(leftPole);

      const rightPole = new THREE.Mesh(poleGeometry, poleMaterial);
      rightPole.position.set(6, 2.5, 0);
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

      // Store checkpoint info
      this.checkpoints.push({
        index: i,
        position: new THREE.Vector3(point.x, point.y, point.z),
        heading: point.heading,
        passed: false,
        width: 16, // Width of checkpoint gate
        segmentIndex: segmentIndex,
      });
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
        object.material.color.setHex(grassColor);
        object.material.needsUpdate = true;
      }
    });
  }

  updateMountainColors(mountainColor) {
    // Update mountain meshes
    this.scene.traverse((object) => {
      if (object.isMesh && object.userData.type === "mountain") {
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
          this.roadMaterial.roughness =
            0.85 * (1 - intensity) + 0.3 * intensity; // Smoother when wet
          this.roadMaterial.metalness = 0.4 * intensity; // More reflective
          this.roadMaterial.color.setHex(0x1a1a1a); // Darker when wet
          this.roadMaterial.needsUpdate = true;
        }
        // Darker grass and mountains
        this.updateTerrainColors(0x3a6a3a);
        this.updateMountainColors(0x5a4a32);
        break;

      case "snow":
        // Icy road - very reflective
        if (this.roadMaterial) {
          this.roadMaterial.roughness = 0.2; // Very smooth/icy
          this.roadMaterial.metalness = 0.5; // Highly reflective
          this.roadMaterial.color.setHex(0xc0d0e0); // Lighter, icy blue tint
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

  getLandscapeVariation(segmentIndex) {
    // Return subtle landscape characteristics based on segment position
    // This can be used for procedural variation within legs
    const variation = {
      elevation: 1.0,
      roughness: 1.0,
      density: 1.0,
    };

    // Example: Increase elevation in high pass sections (segments 120-179)
    if (segmentIndex >= 120 && segmentIndex < 180) {
      variation.elevation = 1.5;
      variation.roughness = 1.3;
    }
    // Valley sections (segments 60-119) are flatter
    else if (segmentIndex >= 60 && segmentIndex < 120) {
      variation.elevation = 0.7;
      variation.density = 1.2;
    }
    // Coastal descent (segments 180-239)
    else if (segmentIndex >= 180 && segmentIndex < 240) {
      variation.elevation = 0.8;
      variation.roughness = 0.9;
    }

    return variation;
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
