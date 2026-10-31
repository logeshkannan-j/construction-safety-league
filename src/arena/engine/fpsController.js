/* ------------------------------------------------------------------ *
 *  ARENA ENGINE — first-person controller
 *
 *  Drives the camera for the two walk-around games (Safety Mission
 *  Simulator, Safety Escape Challenge) from the unified input object,
 *  so the SAME controller is driven by WASD + mouse on desktop and by
 *  the virtual joystick + touch-look pad on a phone.
 *
 *  Collision is swept axis-aligned box resolution against the collider
 *  list the kit builders return. It is deliberately not a physics
 *  engine: AABB-vs-AABB with per-axis resolution plus a step-up test is
 *  exact for the boxy geometry a construction site is made of, costs
 *  almost nothing on a phone, and never produces the jittering a
 *  general solver does when a capsule rests in a corner.
 * ------------------------------------------------------------------ */

import * as THREE from "three";

const GRAVITY = 22;
const MAX_PITCH = Math.PI / 2 - 0.08;

export function createFirstPerson(camera, input, {
  colliders = [],
  ladders = [],
  // Rectangles where the walkable ground sits BELOW zero — excavations
  // and basements. Without these the world floor is a single infinite
  // plane and a trench is only a picture of a hole.
  pits = [],
  spawn = { x: 0, y: 0, z: 0 },
  yaw = 0,
  eyeHeight = 1.68,
  crouchEyeHeight = 1.05,
  radius = 0.32,
  height = 1.78,
  crouchHeight = 1.15,
  // Third person puts the camera on a boom behind the player so they
  // can see their own character. The boom shortens rather than passing
  // through a wall, which is the one thing a chase camera must do.
  thirdPerson = false,
  boomLength = 3.6,
  boomHeight = 0.65,
  // Set both false to use this purely as a MOVEMENT solver: it walks a
  // character with collision, ground and step-up, and leaves the camera
  // and the look input to whoever asked for it. That is how the two
  // games with an orbit camera get a walkable character without having
  // their cameras replaced.
  ownsCamera = true,
  ownsLook = true,
  walkSpeed = 3.4,
  runSpeed = 6.0,
  crouchSpeed = 1.6,
  jumpSpeed = 6.4,
  stepHeight = 0.45,
  lookSpeed = 0.0024,
  canJump = true,
  canCrouch = true,
  worldFloorY = 0,
  fallLimit = -30,
  onStep = null,
  onLand = null,
  onFall = null,
} = {}) {
  const position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  const velocity = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  const state = {
    yaw,
    pitch: 0,
    grounded: false,
    crouching: false,
    running: false,
    onLadder: false,
    speed: 0,
    stepTimer: 0,
    bob: 0,
    frozen: false,
    thirdPerson: !!thirdPerson,
    // The compass direction actually TRAVELLED, kept separate from
    // `yaw`, which is where the player is looking. A third-person
    // avatar has to face the way it is going, and in the two games
    // with an orbit camera those are not the same thing — the camera
    // yaw is fixed while the player walks about underneath it.
    heading: yaw,
    // The height the player last left solid ground at. Seeded with the
    // spawn height so a mission that starts the player in the air still
    // measures the drop correctly.
    airborneFrom: spawn.y,
  };

  let activeColliders = colliders;
  let activeLadders = ladders;
  let activePits = pits;

  /** The world floor height at a horizontal position. */
  function floorAt(x, z) {
    let y = worldFloorY;
    for (let i = 0; i < activePits.length; i++) {
      const p = activePits[i];
      if (x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ) {
        if (p.floorY < y) y = p.floorY;
      }
    }
    return y;
  }
  // Broadphase: rebuilt only when the player has moved far enough to
  // matter, so a site with 400 colliders costs ~20 overlap tests/frame.
  let nearby = colliders;
  const lastBroadphase = new THREE.Vector3(1e9, 1e9, 1e9);

  function refreshBroadphase(force = false) {
    if (!force && lastBroadphase.distanceToSquared(position) < 4) return;
    lastBroadphase.copy(position);
    const pad = 6;
    nearby = activeColliders.filter((c) =>
      c.maxX > position.x - pad && c.minX < position.x + pad &&
      c.maxZ > position.z - pad && c.minZ < position.z + pad &&
      c.maxY > position.y - 4 && c.minY < position.y + 6
    );
  }

  function currentHeight() {
    return state.crouching ? crouchHeight : height;
  }

  function aabbAt(x, y, z, h) {
    return {
      minX: x - radius, maxX: x + radius,
      minY: y, maxY: y + h,
      minZ: z - radius, maxZ: z + radius,
    };
  }

  function overlaps(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX &&
           a.minY < b.maxY && a.maxY > b.minY &&
           a.minZ < b.maxZ && a.maxZ > b.minZ;
  }

  function collidingWith(boxA) {
    const hits = [];
    for (let i = 0; i < nearby.length; i++) {
      if (overlaps(boxA, nearby[i])) hits.push(nearby[i]);
    }
    return hits;
  }

  function isFree(x, y, z, h) {
    return collidingWith(aabbAt(x, y, z, h)).length === 0;
  }

  /**
   * Horizontal move on one axis with an automatic step-up, which is what
   * lets the player walk up stair treads and onto low kerbs and slabs
   * without a jump.
   */
  function moveAxis(axis, delta) {
    if (delta === 0) return;
    const h = currentHeight();
    const nx = axis === "x" ? position.x + delta : position.x;
    const nz = axis === "z" ? position.z + delta : position.z;

    if (isFree(nx, position.y, nz, h)) {
      position.x = nx;
      position.z = nz;
      return;
    }

    // Blocked — can we step on top of what blocked us?
    const hits = collidingWith(aabbAt(nx, position.y, nz, h));
    let highest = -Infinity;
    hits.forEach((c) => { if (c.maxY > highest) highest = c.maxY; });
    const rise = highest - position.y;
    if (rise > 0.02 && rise <= stepHeight && isFree(nx, highest + 0.01, nz, h)) {
      position.x = nx;
      position.z = nz;
      position.y = highest + 0.01;
      velocity.y = 0;
      state.grounded = true;
      return;
    }
    // Truly blocked: slide along the surface (the other axis still runs).
  }

  function resolveVertical(dt) {
    const h = currentHeight();

    if (state.onLadder) {
      velocity.y = 0;
      return;
    }

    velocity.y -= GRAVITY * dt;
    const nextY = position.y + velocity.y * dt;

    if (velocity.y <= 0) {
      // Find the highest surface under the player's feet.
      let ground = floorAt(position.x, position.z);
      const footBox = aabbAt(position.x, nextY, position.z, h);
      for (let i = 0; i < nearby.length; i++) {
        const c = nearby[i];
        const horizontally =
          footBox.minX < c.maxX && footBox.maxX > c.minX &&
          footBox.minZ < c.maxZ && footBox.maxZ > c.minZ;
        if (!horizontally) continue;
        // Only surfaces at or below where the feet were this frame count,
        // so the player cannot be teleported on top of a wall they walked
        // into.
        if (c.maxY <= position.y + 0.26 && c.maxY > ground) ground = c.maxY;
      }
      if (nextY <= ground) {
        const wasAirborne = !state.grounded;
        position.y = ground;
        velocity.y = 0;
        state.grounded = true;
        if (wasAirborne && onLand) onLand(state.airborneFrom - ground);
      } else {
        position.y = nextY;
        if (state.grounded) state.airborneFrom = position.y;
        state.grounded = false;
      }
    } else {
      // Rising: stop at a ceiling.
      const headBox = aabbAt(position.x, nextY, position.z, h);
      const hits = collidingWith(headBox);
      let ceiling = Infinity;
      hits.forEach((c) => {
        if (c.minY >= position.y + h - 0.05 && c.minY < ceiling) ceiling = c.minY;
      });
      if (ceiling !== Infinity) {
        position.y = ceiling - h - 0.01;
        velocity.y = 0;
      } else {
        position.y = nextY;
      }
      state.grounded = false;
    }

    if (position.y < fallLimit && onFall) onFall();
  }

  function ladderAt(x, y, z) {
    for (let i = 0; i < activeLadders.length; i++) {
      const l = activeLadders[i];
      if (x > l.minX && x < l.maxX && z > l.minZ && z < l.maxZ && y >= l.baseY - 0.4 && y <= l.topY + 0.6) {
        return l;
      }
    }
    return null;
  }

  const controller = {
    position,
    velocity,
    state,
    camera,

    get yaw() { return state.yaw; },
    get pitch() { return state.pitch; },

    setColliders(list) {
      activeColliders = list || [];
      refreshBroadphase(true);
    },

    setLadders(list) { activeLadders = list || []; },

    setPits(list) { activePits = list || []; },

    /** Exposed so games can ask "what is the ground here?" */
    floorAt,

    teleport(x, y, z, newYaw) {
      position.set(x, y, z);
      velocity.set(0, 0, 0);
      if (typeof newYaw === "number") state.yaw = newYaw;
      state.grounded = false;
      refreshBroadphase(true);
      controller.syncCamera();
    },

    setFrozen(value) { state.frozen = !!value; },

    get thirdPerson() { return state.thirdPerson; },

    /** Switches between looking through their eyes and over their shoulder. */
    setThirdPerson(value) {
      state.thirdPerson = !!value;
      controller.syncCamera();
      return state.thirdPerson;
    },

    /** True when the player is actually walking, for the walk cycle. */
    get moving() { return state.speed > 0.35; },

    /**
     * Which way they are TRAVELLING, for a visible body to face.
     *
     * Not `yaw`: that is where they are looking. The avatar used to be
     * turned with atan2 of `velocity`, but velocity only ever carries
     * the vertical component — gravity and jumping — so it was always
     * atan2(0, 0) = 0 and every character walked due south while
     * sliding in whatever direction it was actually going.
     */
    get heading() { return state.heading; },

    /** Point the character somewhere, when an outside camera owns the yaw. */
    setYaw(value) {
      if (Number.isFinite(value)) state.yaw = value;
    },

    /** Direction the camera is looking, for raycasts and prompts. */
    getLookDirection(target = new THREE.Vector3()) {
      camera.getWorldDirection(target);
      return target;
    },

    syncCamera() {
      if (!ownsCamera) return;
      const eye = state.crouching ? crouchEyeHeight : eyeHeight;
      const bobAmount = state.grounded ? Math.sin(state.bob) * 0.022 * (state.running ? 1.5 : 1) : 0;
      const eyeY = position.y + eye + bobAmount;

      if (!state.thirdPerson) {
        camera.position.set(position.x, eyeY, position.z);
        camera.rotation.set(0, 0, 0);
        camera.rotateY(state.yaw);
        camera.rotateX(state.pitch);
        return;
      }

      // Behind and a little above, along the look direction. Pitch
      // raises the camera rather than tilting it past the player.
      const back = Math.cos(state.pitch) * boomLength;
      const lift = boomHeight + Math.sin(-state.pitch) * boomLength * 0.8;
      const dirX = Math.sin(state.yaw);
      const dirZ = Math.cos(state.yaw);

      // Walk the boom outwards and stop before it enters anything, so
      // the camera never ends up inside a wall looking at the inside of
      // a hoarding panel.
      let reach = back;
      const STEP = 0.3;
      for (let d = STEP; d <= back; d += STEP) {
        const cx = position.x + dirX * d;
        const cz = position.z + dirZ * d;
        if (collidingWith(aabbAt(cx, eyeY - 0.2, cz, 0.4)).length) {
          reach = Math.max(0.6, d - STEP);
          break;
        }
      }

      camera.position.set(
        position.x + dirX * reach,
        eyeY + lift * (reach / Math.max(0.0001, back)),
        position.z + dirZ * reach
      );
      camera.lookAt(position.x, eyeY + 0.05, position.z);
    },

    update(dt) {
      if (state.frozen) {
        controller.syncCamera();
        return;
      }

      // ---- look ----
      // When something else owns the look (an orbit camera), it also
      // owns the yaw: taking the drag here would steal it, and moving
      // relative to a yaw nobody is steering sends the player sideways.
      const look = ownsLook ? input.consumeLook() : { dx: 0, dy: 0 };
      state.yaw -= look.dx * lookSpeed;
      state.pitch -= look.dy * lookSpeed;
      state.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, state.pitch));
      // Keep yaw bounded so it never loses float precision in a long run.
      if (state.yaw > Math.PI) state.yaw -= Math.PI * 2;
      if (state.yaw < -Math.PI) state.yaw += Math.PI * 2;

      // ---- stance ----
      if (canCrouch) {
        const wantCrouch = input.isHeld("crouch");
        if (wantCrouch !== state.crouching) {
          if (!wantCrouch) {
            // Only stand back up if there is room.
            if (isFree(position.x, position.y, position.z, height)) state.crouching = false;
          } else {
            state.crouching = true;
          }
        }
      }
      state.running = input.isHeld("run") && !state.crouching;

      refreshBroadphase();

      // ---- ladders ----
      const ladder = ladderAt(position.x, position.y, position.z);
      state.onLadder = !!ladder;

      // ---- movement ----
      const speed = state.crouching ? crouchSpeed : state.running ? runSpeed : walkSpeed;
      forward.set(Math.sin(state.yaw) * -1, 0, Math.cos(state.yaw) * -1);
      right.set(forward.z * -1, 0, forward.x);

      const mx = input.state.moveX;
      const my = input.state.moveY;

      if (ladder) {
        // On a ladder, pushing "forward" climbs and "back" descends.
        const climb = my * 2.2;
        position.y = Math.min(ladder.topY + 0.1, Math.max(ladder.baseY, position.y + climb * dt));
        velocity.y = 0;
        // Allow a little lateral shuffle to step off at the top.
        const stepOffX = right.x * mx * 1.2 * dt;
        const stepOffZ = right.z * mx * 1.2 * dt;
        moveAxis("x", stepOffX);
        moveAxis("z", stepOffZ);
        if (position.y >= ladder.topY - 0.05 && my > 0.3) {
          // Nudge the player over the top edge onto the platform.
          const outX = ladder.exit ? ladder.exit.x - position.x : 0;
          const outZ = ladder.exit ? ladder.exit.z - position.z : 0;
          const len = Math.hypot(outX, outZ) || 1;
          moveAxis("x", (outX / len) * 1.8 * dt);
          moveAxis("z", (outZ / len) * 1.8 * dt);
        }
        state.speed = Math.abs(climb);
      } else {
        const dx = (forward.x * my + right.x * mx) * speed;
        const dz = (forward.z * my + right.z * mx) * speed;
        // atan2(x, z) gives the angle whose (sin, cos) is (x, z),
        // which is the convention a model built facing +Z needs.
        if (Math.abs(dx) + Math.abs(dz) > 0.05) state.heading = Math.atan2(dx, dz);
        state.speed = Math.hypot(dx, dz);
        moveAxis("x", dx * dt);
        moveAxis("z", dz * dt);

        if (canJump && state.grounded && input.wasPressed("jump")) {
          velocity.y = jumpSpeed;
          state.grounded = false;
          state.airborneFrom = position.y;
        }
      }

      resolveVertical(dt);

      // ---- footsteps + head bob ----
      if (state.grounded && state.speed > 0.4) {
        state.bob += dt * (state.running ? 13 : 9);
        state.stepTimer += dt * state.speed;
        const interval = state.running ? 2.6 : 2.0;
        if (state.stepTimer > interval) {
          state.stepTimer = 0;
          if (onStep) onStep();
        }
      } else {
        state.bob = 0;
        state.stepTimer = 1.5;
      }

      controller.syncCamera();
    },
  };

  refreshBroadphase(true);
  controller.syncCamera();
  return controller;
}

/** Helper to turn a ladder mesh/placement into a climbable volume. */
export function ladderVolume({ x, z, baseY = 0, topY = 4, width = 0.9, depth = 0.9, exit = null }) {
  return {
    minX: x - width / 2, maxX: x + width / 2,
    minZ: z - depth / 2, maxZ: z + depth / 2,
    baseY, topY, exit,
  };
}
