/* ------------------------------------------------------------------ *
 *  ARENA ENGINE — the site view (overhead / aerial camera)
 *
 *  One orbiting aerial camera, shared by all five missions, so that in
 *  every game the player can lift off the ground and see the whole
 *  site at once — the work in front of them AND the finished Casagrand
 *  Aria towers beyond it.
 *
 *  Why this lives in the engine rather than in each game: all five
 *  games drive `camera` directly, every frame, from their own
 *  controller (first person, crane cab, orbit, command view). Rather
 *  than teach four different controllers about an overhead mode, this
 *  object WRAPS whichever one a game already has:
 *
 *      siteView.update(dt, input, () => updateCamera(dt));
 *
 *  The game's own camera code runs exactly as before and puts the
 *  camera where it always did; this then blends from that pose up to
 *  the aerial one. Because the ground pose is recomputed every frame,
 *  the flight works in both directions — up to the aerial and back
 *  down to wherever the game has moved on to — with no cut either way.
 *
 *  Two things have to be relaxed on the way up, or the view is useless:
 *
 *    far plane  Lifting 90 m up and back puts the far side of the site
 *               200 m+ from the lens, past the far plane on the lower
 *               quality tiers (200 m) — which is what phones get.
 *
 *    fog        Same problem. The fog is tuned for a camera at head
 *               height, so from the air it would swallow exactly the
 *               thing the player went up there to look at.
 *
 *  Both are blended with the camera and fully restored on the way out,
 *  so a game that never toggles this is completely unaffected.
 * ------------------------------------------------------------------ */

import * as THREE from "three";

export function createTopView(camera, {
  scene = null,
  // What the aerial orbits. Set back from the site origin so the
  // finished towers share the frame with the working site.
  center = new THREE.Vector3(0, 0, -10),
  distance = 112,
  minDistance = 48,
  maxDistance = 190,
  // Elevation above the horizon, in radians. ~45° is an oblique
  // aerial, which reads far better than a flat plan view: you can
  // still see how tall everything is.
  pitch = 0.78,
  minPitch = 0.34,
  maxPitch = 1.42,
  // Azimuth 0 looks from the south, so the development sits beyond the
  // site rather than behind the camera.
  yaw = 0,
  fov = 60,
  // How fast the camera flies. Slow enough to read as a lift-off, fast
  // enough not to waste the player's clock.
  riseSpeed = 2.8,
} = {}) {
  const target = center.clone();
  const aerialPos = new THREE.Vector3();
  const groundPos = new THREE.Vector3();
  const groundQuat = new THREE.Quaternion();
  const aerialQuat = new THREE.Quaternion();
  const _m = new THREE.Matrix4();
  const _up = new THREE.Vector3(0, 1, 0);

  // The ground values to blend against and return to.
  //
  // fov and far are taken HERE, at construction, not at toggle time:
  // the games narrow camera.fov for their own zoom, and capturing a
  // zoomed lens as "the ground value" would leave the lens stuck
  // narrow after the aerial handed the camera back.
  const base = { fov: camera.fov, far: camera.far, fogNear: 0, fogFar: 0 };
  // Fog is captured lazily — addSky() installs it after the stage is
  // created, so it may not exist yet.
  let fogCaptured = false;
  let touched = false;

  let active = false;
  let dist = distance;
  let pit = pitch;
  let yw = yaw;
  // 0 = the game's own camera, 1 = fully overhead.
  let blend = 0;

  function captureFog() {
    if (fogCaptured || !scene?.fog) return;
    base.fogNear = scene.fog.near;
    base.fogFar = scene.fog.far;
    fogCaptured = true;
  }

  function restoreBase() {
    if (!touched) return;
    camera.far = base.far;
    camera.updateProjectionMatrix();
    if (scene?.fog && fogCaptured) {
      scene.fog.near = base.fogNear;
      scene.fog.far = base.fogFar;
    }
    // NOTE: camera.fov is deliberately not restored here. The game's
    // own zoom owns the lens once the aerial is done with it, and it
    // eases from wherever it is left.
    touched = false;
  }

  /** Blends lens, far plane and fog between the ground and the aerial. */
  function applyProjection(t) {
    touched = true;
    // The far plane has to reach the far corner of the site plus the
    // development beyond it. 3.4x the orbit radius covers it, and a far
    // plane costs nothing to widen.
    const aerialFar = Math.max(base.far, dist * 3.4);
    camera.far = base.far + (aerialFar - base.far) * t;
    camera.fov = base.fov + (fov - base.fov) * t;
    camera.updateProjectionMatrix();
    if (scene?.fog) {
      // Keep SOME haze from up here — it is what makes the towers read
      // as distant rather than pasted on — but start it beyond them.
      scene.fog.near = base.fogNear + (dist * 1.5 - base.fogNear) * t;
      scene.fog.far = base.fogFar + (dist * 3.4 - base.fogFar) * t;
    }
  }

  return {
    get active() { return active; },
    /** True whenever the camera is not fully back in the game's hands. */
    get engaged() { return active || blend > 0.002; },
    get blend() { return blend; },

    /** Re-aim the aerial — e.g. at the player's current position. */
    setCenter(x, y = 0, z = 0) {
      if (x && typeof x === "object") target.set(x.x, x.y, x.z);
      else target.set(x, y, z);
    },

    toggle() {
      active = !active;
      if (active) captureFog();
      return active;
    },

    close() { active = false; },

    /**
     * @param dt            frame delta in seconds
     * @param input         the game's input object (drag to orbit, wheel to climb)
     * @param updateGameCamera  the game's own camera function
     */
    update(dt, input, updateGameCamera) {
      const wanted = active ? 1 : 0;
      if (blend !== wanted) {
        blend += (wanted - blend) * Math.min(1, dt * riseSpeed);
        if (Math.abs(wanted - blend) < 0.003) blend = wanted;
      }

      // Nothing to do: the game owns the camera outright.
      if (!active && blend === 0) {
        restoreBase();
        updateGameCamera?.();
        return false;
      }

      captureFog();

      if (active && input) {
        // Drag to swing around the site, wheel or pinch to change height.
        const look = input.consumeLook();
        yw -= look.dx * 0.005;
        pit = Math.max(minPitch, Math.min(maxPitch, pit + look.dy * 0.004));
        const wheel = input.consumeWheel();
        if (wheel) dist = Math.max(minDistance, Math.min(maxDistance, dist + wheel * 0.09));
      }

      // Let the game put the camera where it would have been, so there
      // is a real pose to blend against in both directions. Skipped
      // once fully overhead, where it cannot be seen anyway.
      if (blend < 0.999) {
        updateGameCamera?.();
        groundPos.copy(camera.position);
        groundQuat.copy(camera.quaternion);
      }

      const horizontal = Math.cos(pit) * dist;
      aerialPos.set(
        target.x + Math.sin(yw) * horizontal,
        target.y + Math.sin(pit) * dist,
        target.z + Math.cos(yw) * horizontal
      );

      if (blend >= 0.999) {
        camera.position.copy(aerialPos);
        camera.lookAt(target);
      } else {
        _m.lookAt(aerialPos, target, _up);
        aerialQuat.setFromRotationMatrix(_m);
        // Smoothstep so the lift-off and the landing both ease.
        const t = blend * blend * (3 - 2 * blend);
        camera.position.lerpVectors(groundPos, aerialPos, t);
        camera.quaternion.slerpQuaternions(groundQuat, aerialQuat, t);
      }

      applyProjection(blend);
      return true;
    },

    dispose() { restoreBase(); },
  };
}
