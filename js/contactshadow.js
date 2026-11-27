// ContactShadow: a soft dark patch under each tyre of a bike, where the tyre meets the ground. The sun's shadow map is
// too coarse to darken that much: on the menu's stand and on the road the bike read as floating over its own shadow
// (the critic panel, bike15, every round). Each patch is a small quad with a soft round falloff, drawn flat on the
// ground under its tyre: along the bike's heading and pitch, never its lean, so a bike leant into a bend keeps its
// patch on the road. Two quads a bike, unlit, drawn in the transparent pass; no shadow map, no extra pass.
//
// A patch is a child of the bike's group (so it goes when the bike goes, and BikeModels keeps it through a swap:
// userData.contactShadow), but its transform is set from the wheels at each draw (onBeforeRender), not inherited.
const ContactShadow = (() => {
  // The patch's length and width as shares of the tyre's radius, and how dark its middle is
  const LENGTH = 1.5;
  const WIDTH = 0.75;
  const DARK = 0.55;
  // How far over the ground it is drawn (m), so it does not fight the ground for depth
  const LIFT = 0.006;

  let texture = null;

  // A round falloff from DARK in the middle to nothing at the edge, as a texture's alpha (made once)
  function falloff() {
    if (texture) return texture;
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${DARK})`);
    gradient.addColorStop(0.45, `rgba(0, 0, 0, ${DARK * 0.6})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  const offset = new THREE.Vector3();

  // Puts `patch` flat on the ground under `wheel` of `vehicle`, `radius` its tyre's ([y, z, radius] axles)
  function place(patch, vehicle, wheel, radius) {
    const group = vehicle.group;
    if (!wheel || !group) return;
    wheel.getWorldPosition(centre);
    // The bike's heading with its pitch, without its lean: the ground's slope along the bike
    forward.set(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));
    side.crossVectors(up, forward);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    normal.crossVectors(forward, side).normalize();
    forward.crossVectors(side, normal).normalize();
    // Under the axle on the ground: the group's origin is on the ground (Vehicle: ground contact at y = 0), so the
    // axle is dropped onto the plane through it; a leant bike's axle comes down beside its contact, near enough
    group.getWorldPosition(origin);
    const height = normal.dot(offset.subVectors(centre, origin));
    centre.addScaledVector(normal, LIFT - height);
    // A wheel off the ground (a wheelie, a jump) loses its patch as it rises
    const left = Math.max(0, Math.min(1, (radius * 1.6 - height) / (radius * 0.5)));
    const length = radius * LENGTH * left + 1e-4, width = radius * WIDTH * left + 1e-4;
    basis.makeBasis(side.clone().multiplyScalar(width), forward.clone().multiplyScalar(length), normal);
    basis.setPosition(centre);
    patch.matrixWorld.copy(basis);
  }

  // Two patches for a bike (Vehicle), one under each tyre
  function attach(vehicle) {
    const material = new THREE.MeshBasicMaterial({ map: falloff(), color: 0x000000, transparent: true, depthWrite: false, fog: true, toneMapped: false, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(1, 1);
    for (const which of ["rearWheel", "frontWheel"]) {
      const patch = new THREE.Mesh(geometry, material);
      patch.name = `contact_${which}`;
      patch.userData.contactShadow = true;
      patch.matrixAutoUpdate = false;
      // At rest (to anything that measures the bike's box) the patch is a point at the bike's foot
      patch.matrix.makeScale(1e-4, 1e-4, 1e-4);
      patch.frustumCulled = false;
      patch.castShadow = false;
      patch.receiveShadow = false;
      // (after the opaque ground, before the other see-through things)
      patch.renderOrder = -1;
      patch.onBeforeRender = () => {
        const axle = vehicle.axles && vehicle.axles[which === "rearWheel" ? "rear" : "front"];
        place(patch, vehicle, vehicle[which], axle ? axle[2] : 0.3);
        patch.matrixWorldNeedsUpdate = false;
      };
      vehicle.group.add(patch);
    }
  }

  return { attach, place, LENGTH, WIDTH, DARK, LIFT };
})();
