/* ------------------------------------------------------------------ *
 *  GAME 5 — EMERGENCY RESPONSE COMMANDER
 *  The Emergency Response Team
 *
 *  The site's own ERT — a team leader, a first aider and two rescuers,
 *  in red hard hats and red vests with ERT across the back — waits at
 *  its post. When the commander sends it, the mission STOPS: the clock
 *  freezes, the camera goes to the team, and the player watches what a
 *  trained response to THIS emergency actually looks like, captioned in
 *  English and Tamil. Then the camera comes back and the clock runs on.
 *
 *  What they do depends on the scenario, because the right response is
 *  different every time:
 *
 *    fall         nobody climbs up to him: the rescue kit on the lift
 *                 lowers him, the first aider treats him for suspension
 *                 trauma, and he is carried on the spinal board to the
 *                 first-aid post, where they wait with him for the
 *                 ambulance
 *    fire         the fire wardens fight it from OUTSIDE, upwind, with
 *                 CO2 from the fire point, keep the LPG clear, hand over
 *                 to the fire service and report to the assembly point
 *    electrical   nobody touches him until the supply is proved dead,
 *                 then CPR and the AED; once he is breathing he goes on
 *                 the board to the first-aid post to wait for the
 *                 ambulance
 *
 *  This module owns the team, its kit and the beats of each response.
 *  The game owns the clock, the camera and the HUD; it hands this a
 *  context and asks it to play.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { buildWorker, animateWorker, turnToward, box, cylinder } from "../../engine/kit.js";

/* The captions, beat by beat, in both languages. The Tamil has not been
 * checked by a native speaker yet — have someone read it before the
 * event. */
export const ERT_CAPTIONS = {
  fall: [
    {
      en: "The ERT turns out from its post: the team leader, the first aider, and two rescuers with the spinal board.",
      ta: "அவசர மீட்புக் குழு தன் நிலையிலிருந்து புறப்படுகிறது: குழுத் தலைவர், முதலுதவியாளர், முதுகெலும்புப் பலகையுடன் இரண்டு மீட்பாளர்கள்.",
    },
    {
      en: "Nobody climbs up to him. The rescue kit on the lift above lowers him slowly to the ground.",
      ta: "யாரும் அவரை நோக்கி ஏறுவதில்லை. மேலே உள்ள தளத்திலிருந்து மீட்புக் கருவி அவரை மெதுவாகத் தரைக்கு இறக்குகிறது.",
    },
    {
      en: "The first aider checks his airway and breathing, and treats him for suspension trauma.",
      ta: "முதலுதவியாளர் அவரது சுவாசப் பாதையையும் மூச்சையும் சோதித்து, தொங்கியதால் ஏற்பட்ட பாதிப்புக்குச் சிகிச்சை அளிக்கிறார்.",
    },
    {
      en: "He is strapped to the spinal board, and the rescuers carry him to the first-aid post, the first aider walking beside him.",
      ta: "அவர் முதுகெலும்புப் பலகையில் கட்டப்பட்டு, மீட்பாளர்கள் அவரை முதலுதவி நிலையத்துக்குத் தூக்கிச் செல்கிறார்கள்; முதலுதவியாளர் அருகிலேயே நடந்து வருகிறார்.",
    },
    {
      en: "At the first-aid post they set him down and keep him still and warm. The first aider stays with him and the team leader radios the gate. They wait there for the ambulance.",
      ta: "முதலுதவி நிலையத்தில் அவரை மெதுவாகக் கீழே வைத்து, அசையாமலும் கதகதப்பாகவும் வைத்திருக்கிறார்கள். முதலுதவியாளர் அவருடனேயே இருக்கிறார்; குழுத் தலைவர் வாயிலுக்கு ரேடியோவில் தகவல் தருகிறார். ஆம்புலன்ஸ் வரும் வரை அங்கேயே காத்திருக்கிறார்கள்.",
    },
  ],
  fire: [
    {
      en: "The ERT turns out: the team leader and two fire wardens, with the first aider standing by.",
      ta: "அவசர மீட்புக் குழு புறப்படுகிறது: குழுத் தலைவரும் இரண்டு தீ காப்பாளர்களும், முதலுதவியாளர் தயார் நிலையில்.",
    },
    {
      en: "The wardens take CO2 extinguishers from the fire point and come in from upwind.",
      ta: "தீ காப்பாளர்கள் தீயணைப்பு நிலையத்திலிருந்து CO2 அணைப்பான்களை எடுத்து, காற்று வீசும் பக்கத்திலிருந்து நெருங்குகிறார்கள்.",
    },
    {
      en: "Short bursts at the base of the fire, from outside. Nobody goes into the smoke.",
      ta: "வெளியில் இருந்தபடியே தீயின் அடிப்பகுதியில் சிறு சிறு தெளிப்பு. யாரும் புகைக்குள் செல்வதில்லை.",
    },
    {
      en: "The fire is knocked down. They keep the LPG cylinders clear and hold until the fire service takes over.",
      ta: "தீ கட்டுக்குள் வருகிறது. LPG சிலிண்டர்களைப் பாதுகாத்து, தீயணைப்புத் துறை பொறுப்பேற்கும் வரை காத்திருக்கிறார்கள்.",
    },
    {
      en: "With the fire handed over to the fire service, the ERT reports to the assembly point for the roll call.",
      ta: "தீயைத் தீயணைப்புத் துறையிடம் ஒப்படைத்ததும், அவசர மீட்புக் குழு பெயர் சரிபார்ப்புக்காகக் கூடும் இடத்துக்குச் செல்கிறது.",
    },
  ],
  electrical: [
    {
      en: "The ERT turns out with the AED and the first-aid kit.",
      ta: "அவசர மீட்புக் குழு AED கருவியுடனும் முதலுதவிப் பெட்டியுடனும் புறப்படுகிறது.",
    },
    {
      en: "Nobody touches him until the supply is proved dead. The team leader checks it at the panel.",
      ta: "மின்சாரம் முழுமையாகத் துண்டிக்கப்பட்டது உறுதியாகும் வரை யாரும் அவரைத் தொடுவதில்லை. குழுத் தலைவர் பலகையில் அதைச் சரிபார்க்கிறார்.",
    },
    {
      en: "He is not breathing normally. The first aider starts CPR and puts the AED pads on.",
      ta: "அவர் சரியாக மூச்சு விடவில்லை. முதலுதவியாளர் CPR தொடங்கி AED பட்டைகளைப் பொருத்துகிறார்.",
    },
    {
      en: "The AED advises a shock. Everybody stands clear; then CPR again, until his breathing comes back.",
      ta: "AED ஷாக் கொடுக்கச் சொல்கிறது. அனைவரும் விலகி நிற்கிறார்கள்; பிறகு அவரது மூச்சு திரும்பும் வரை மீண்டும் CPR.",
    },
    {
      en: "On the spinal board they bring him down to the first-aid post, where the ambulance can reach him. The first aider stays with him, the AED still on, and they wait for the ambulance.",
      ta: "முதுகெலும்புப் பலகையில் வைத்து, ஆம்புலன்ஸ் வந்து சேரக்கூடிய முதலுதவி நிலையத்துக்கு அவரைக் கீழே கொண்டு வருகிறார்கள். AED பொருத்தப்பட்ட நிலையில் முதலுதவியாளர் அவருடனேயே இருக்கிறார்; ஆம்புலன்ஸுக்காகக் காத்திருக்கிறார்கள்.",
    },
  ],
};

export const ERT_DONE = {
  en: "The ERT has the casualty at the first-aid post, waiting for the ambulance. The clock is running again — carry on with the response.",
  ta: "அவசரக் குழு பாதிக்கப்பட்டவருடன் முதலுதவி நிலையத்தில் ஆம்புலன்ஸுக்காகக் காத்திருக்கிறது. நேரம் மீண்டும் ஓடுகிறது — மீதிப் பணிகளைத் தொடருங்கள்.",
};

/** What the player is told when the response is over, by scenario. */
const ERT_DONE_BY_KIND = {
  fire: {
    en: "The ERT has handed the fire over and is at the assembly point. The clock is running again — carry on with the response.",
    ta: "அவசரக் குழு தீயை ஒப்படைத்துவிட்டு கூடும் இடத்தில் உள்ளது. நேரம் மீண்டும் ஓடுகிறது — மீதிப் பணிகளைத் தொடருங்கள்.",
  },
};

/** How long each beat is on screen, in seconds. */
const BEAT_SECONDS = [6, 7, 7, 7, 8];

/* ------------------------------ the kit ------------------------------ */

function buildSpinalBoard(geo, mat) {
  const g = new THREE.Group();
  g.add(box(geo, mat.orange, 0.46, 0.05, 1.86, 0, 0, 0));
  [-0.55, 0, 0.55].forEach((z) => g.add(box(geo, mat.black, 0.5, 0.06, 0.06, 0, 0.02, z, { shadow: false })));
  // Hand holds down both sides.
  [-1, 1].forEach((side) => g.add(box(geo, mat.yellow, 0.04, 0.05, 1.6, side * 0.25, 0.01, 0, { shadow: false })));
  return g;
}

function buildKitBag(geo, mat) {
  const g = new THREE.Group();
  g.add(box(geo, mat.green, 0.32, 0.22, 0.14, 0, -0.14, 0.02));
  g.add(box(geo, mat.white, 0.16, 0.05, 0.02, 0, -0.12, 0.095, { shadow: false }));
  g.add(box(geo, mat.white, 0.05, 0.16, 0.02, 0, -0.12, 0.095, { shadow: false }));
  return g;
}

function buildExtinguisherInHand(geo, mat) {
  const g = new THREE.Group();
  g.add(cylinder(geo, mat.red, 0.075, 0.5, 0, -0.3, 0.04));
  g.add(box(geo, mat.black, 0.05, 0.09, 0.12, 0, -0.02, 0.06, { shadow: false }));
  return g;
}

function buildAED(geo, mat) {
  const g = new THREE.Group();
  g.add(box(geo, mat.yellow, 0.32, 0.12, 0.26, 0, 0.06, 0));
  g.add(box(geo, mat.black, 0.18, 0.02, 0.12, 0, 0.13, 0, { shadow: false }));
  return g;
}

/* --------------------------- the team --------------------------- */

/**
 * @param ctx.scene, geo, mat     the game's world and kit
 * @param ctx.post                {x, z} where the team waits
 * @param ctx.scenario            the scenario object (.scene is the kind)
 * @param ctx.incident            { position: Vector3 }
 * @param ctx.casualty            the casualty figure, if there is one
 * @param ctx.lanyard             the fall casualty's lanyard mesh
 * @param ctx.anchorY             where that lanyard is tied off
 * @param ctx.fire, smoke, smokeMat, sparks   the fire and electrical effects
 * @param ctx.mates               the electrical scenario's colleagues
 * @param ctx.stair               { foot: {x, z}, top: {x, y, z} } of the flight
 * @param ctx.firePoint           {x, z} of the fire point
 * @param ctx.gate                {x, z} of the emergency vehicle gate
 * @param ctx.firstAid            {x, z} of the first-aid post
 * @param ctx.muster              {x, z} of the assembly point
 * @param ctx.shot(shot)          point the camera at a shot
 */
export function createERT(ctx) {
  const { scene, geo, mat, post } = ctx;
  const kind = ctx.scenario?.scene || "fall";
  const captions = ERT_CAPTIONS[kind] || ERT_CAPTIONS.fall;

  const make = (opts, at) => {
    const w = buildWorker(geo, mat, {
      helmetColor: "red", vestColor: "red", badge: "ERT", sleeves: "long", gloves: true, ...opts,
    });
    // Animated by the response, so the crowd animator leaves them alone.
    w.userData.selfAnimated = true;
    w.userData.ert = true;
    w.position.set(post.x + at[0], 0, post.z + at[1]);
    w.rotation.y = Math.PI * 0.75;
    scene.add(w);
    return w;
  };
  const leader = make({ seed: 7101, helmetColor: "white" }, [1.6, -1.2]);
  const medic = make({ seed: 7102, gender: "female", braid: true, gloves: false }, [2.4, 0.2]);
  const bearerA = make({ seed: 7103 }, [0.4, 1.4]);
  const bearerB = make({ seed: 7104 }, [-0.8, 0.6]);
  const team = [leader, medic, bearerA, bearerB];

  /* ---- the kit ---- */
  const board = buildSpinalBoard(geo, mat);
  board.position.set(post.x - 1.4, 0.5, post.z + 2.2);
  board.rotation.set(0, 0, 1.2);
  scene.add(board);
  const handOf = (w) => w.userData.rig.armR.userData.hand;
  handOf(medic).add(buildKitBag(geo, mat));
  const extinguishers = [];
  const sprays = [];
  if (kind === "fire") {
    [bearerA, bearerB].forEach((w) => {
      const ext = buildExtinguisherInHand(geo, mat);
      ext.visible = false;
      handOf(w).add(ext);
      extinguishers.push(ext);
      // The discharge: a white cone out of the horn.
      const spray = new THREE.Mesh(geo.cone, new THREE.MeshBasicMaterial({
        color: 0xf2f6f8, transparent: true, opacity: 0.55, depthWrite: false,
      }));
      // Out along the fingers, narrow at the horn and widening away.
      spray.scale.set(0.5, 2.4, 0.5);
      spray.position.set(0, -1.36, 0.04);
      spray.visible = false;
      handOf(w).add(spray);
      sprays.push(spray);
    });
  }
  let aed = null;
  if (kind === "electrical") {
    aed = buildAED(geo, mat);
    aed.visible = false;
    scene.add(aed);
  }

  /* ---- moving people about ----
   * Each member is given a route of points (with height, for stairs)
   * and walks or runs along it, turning to face where they go; at the
   * end they hold a pose. */
  const moves = new Map();
  // On standby at the post: the leader on the radio, the others going over
  // the kit together — not standing about.
  const standby = new Map([[leader, "radio"], [medic, "talk"], [bearerA, "talk"], [bearerB, "talk"]]);
  team.forEach((w) => moves.set(w, { route: [], speed: 0, run: false, pose: standby.get(w) || "stand", face: null, cpr: false }));
  const send = (w, route, { run = true, pose = "stand", face = null } = {}) => {
    const m = moves.get(w);
    m.route = route.map((p) => new THREE.Vector3(p[0], p[1] ?? 0, p[2]));
    m.speed = run ? 3.8 : 1.5;
    m.run = run;
    m.pose = pose;
    m.face = face;
  };
  const place = (w, p) => w.position.set(p[0], p[1] ?? 0, p[2]);

  // The stretcher: carried between the two rescuers, or lying where set.
  let boardCarried = false;
  let casualtyOnBoard = false;

  // Which end of the stretcher a rescuer has, the board ahead of them or
  // behind. Each holds a handle low at either side, arms down, the way a
  // stretcher is carried — not out in front of the chest like a tray.
  const stretcherEnd = (w) => {
    if (!boardCarried || (w !== bearerA && w !== bearerB)) return false;
    const ahead = (board.position.x - w.position.x) * Math.sin(w.rotation.y)
      + (board.position.z - w.position.z) * Math.cos(w.rotation.y);
    return ahead > 0 ? "ahead" : "behind";
  };

  /* ---- the beats of each response ---- */
  const inc = ctx.incident.position;
  const P = post;
  // Every shot is taken from OUTSIDE the building: the camera here has
  // no collision, and a shot aimed across the frame ends up inside a
  // slab. The post shot looks up the west side, the way the team runs.
  const postShot = () => ctx.shot({ center: [P.x + 1, 1, P.z - 3], yaw: -0.55, pitch: 0.38, distance: 17 });
  const run1 = (targets) => {
    const wp = kind === "fire"
      ? [[P.x + 6, 0, P.z + 1.8], [-2, 0, 16.5], [1.5, 0, 10]]
      : kind === "electrical"
        ? [[P.x + 4, 0, P.z - 7], [-20.5, 0, 0.6]]
        : [[P.x + 3, 0, P.z - 8], [-21.5, 0, -6.5]];
    // There: the leader reports in on the radio, the rest size it up together.
    team.forEach((w, i) => send(w, [...wp, targets[i]], { pose: w === leader ? "radio" : "talk" }));
  };

  // Where the fall casualty is laid down: clear of the scaffold, on the
  // open ground north of the building, head away from the face.
  const ground = { x: inc.x, z: inc.z - 1.6 };

  // Where the board is set down at the first-aid post, and the assembly
  // point the team reports to after a fire.
  const firstAid = ctx.firstAid || { x: P.x - 3.4, z: P.z + 1.8 };
  const aid = new THREE.Vector3(firstAid.x + 2.2, 0, firstAid.z - 3.2);
  const muster = ctx.muster || { x: P.x + 50, z: P.z + 10 };

  // The last beat for a casualty: cut to the first-aid post as they come
  // in with him, the first aider and the team leader with them. The
  // board goes down when the bearers get there (see during()).
  const toFirstAid = () => {
    casualtyOnBoard = true;
    boardCarried = true;
    if (ctx.casualty) ctx.casualty.userData.pose = "stand";
    place(bearerA, [aid.x + 3.6, 0, aid.z]);
    place(bearerB, [aid.x + 5.5, 0, aid.z]);
    send(bearerA, [[aid.x - 0.95, 0, aid.z]], { run: false, pose: "carry" });
    send(bearerB, [[aid.x + 0.95, 0, aid.z]], { run: false, pose: "carry" });
    place(medic, [aid.x + 4.6, 0, aid.z + 1.3]);
    send(medic, [[aid.x - 0.1, 0, aid.z + 0.78]], { run: false, pose: "kneel", face: Math.PI });
    place(leader, [aid.x + 6, 0, aid.z - 1.4]);
    const gate = ctx.gate || { x: aid.x + 40, z: aid.z };
    send(leader, [[aid.x + 2.4, 0, aid.z + 1.5]], {
      // Watching the gate, on the radio to the ambulance.
      run: false, pose: "radio", face: Math.atan2(gate.x - (aid.x + 2.4), gate.z - (aid.z + 1.5)),
    });
    ctx.shot({ center: [aid.x + 1, 0.7, aid.z + 0.3], yaw: -2.35, pitch: 0.36, distance: 9.5 });
  };

  const beats = {
    fall: [
      () => {
        boardCarried = true;
        run1([[inc.x - 2.6, 0, inc.z - 3.4], [inc.x + 1.8, 0, inc.z - 3.8], [inc.x - 0.6, 0, inc.z - 5.2], [inc.x - 0.6, 0, inc.z - 7.3]]);
        postShot();
      },
      () => {
        // The camera stands north of him, out in the yard, looking at
        // the scaffold face he hangs from.
        ctx.shot({ center: [inc.x, 2.6, inc.z - 1.4], yaw: Math.PI - 0.5, pitch: 0.22, distance: 13 });
      },
      () => {
        boardCarried = false;
        board.position.set(ground.x + 1.3, 0.04, ground.z - 0.9);
        board.rotation.set(0, 0, 0);
        send(medic, [[ground.x - 0.72, 0, ground.z - 0.95]], { run: false, pose: "kneel", face: Math.PI / 2 });
        // The leader calls the ambulance; the bearers get the board ready.
        send(leader, [[ground.x - 1.9, 0, ground.z - 2.2]], { run: false, pose: "radio", face: 0.7 });
        send(bearerA, [[ground.x + 2.1, 0, ground.z - 2.4]], { run: false, pose: "talk", face: -0.6 });
        send(bearerB, [[ground.x + 2.1, 0, ground.z + 0.3]], { run: false, pose: "talk", face: -2.4 });
        ctx.shot({ center: [ground.x, 0.5, ground.z - 0.9], yaw: Math.PI - 0.45, pitch: 0.42, distance: 7.5 });
      },
      () => {
        // Strapped on and carried off along the yard, round the building
        // towards the first-aid post, the first aider beside him.
        casualtyOnBoard = true;
        boardCarried = true;
        place(bearerA, [ground.x - 0.95, 0, ground.z]);
        place(bearerB, [ground.x + 0.95, 0, ground.z]);
        const west = [ground.x - 11, 0, ground.z - 1.9];
        send(bearerA, [west], { run: false, pose: "carry" });
        send(bearerB, [[west[0] + 1.9, 0, west[2]]], { run: false, pose: "carry" });
        send(medic, [[west[0] + 1, 0, west[2] + 1.1]], { run: false });
        send(leader, [[west[0] - 2.2, 0, west[2] - 0.6]], { run: false });
        ctx.shot({ center: [ground.x - 5, 0.8, ground.z - 2], yaw: Math.PI - 0.25, pitch: 0.34, distance: 14 });
      },
      toFirstAid,
    ],
    fire: [
      () => {
        // To the fire point, round the south side of the building.
        run1([[0.2, 0, 9.6], [-3, 0, 15.6], [0.8, 0, 7.8], [0.2, 0, 8.6]]);
        postShot();
      },
      () => {
        // Extinguishers up, and in from the open yard to the south —
        // upwind of the smoke, never through the building.
        extinguishers.forEach((e) => { e.visible = true; });
        send(bearerA, [[inc.x - 0.8, 0, inc.z + 5.8]], { run: false, pose: "work", face: Math.PI });
        send(bearerB, [[inc.x + 1.4, 0, inc.z + 5.8]], { run: false, pose: "work", face: Math.PI });
        // The leader points them at the base of the fire.
        send(leader, [[inc.x + 4.6, 0, inc.z + 6.6]], { run: false, pose: "point", face: Math.PI });
        ctx.shot({ center: [inc.x + 0.3, 1.6, inc.z + 4], yaw: 0.5, pitch: 0.3, distance: 13 });
      },
      () => {
        sprays.forEach((spray) => { spray.visible = true; });
        ctx.shot({ center: [inc.x + 0.3, 1.4, inc.z + 4], yaw: 0.2, pitch: 0.24, distance: 10 });
      },
      () => {
        sprays.forEach((spray) => { spray.visible = false; });
        // Out: the leader reports it on the radio.
        send(leader, [[inc.x + 6.5, 0, inc.z + 4.6]], { run: false, pose: "radio", face: -Math.PI / 2 });
        ctx.shot({ center: [inc.x + 1, 2, inc.z + 2], yaw: 0.3, pitch: 0.45, distance: 20 });
      },
      () => {
        // Handed over to the fire service: the team reports to the
        // assembly point and lines up for the roll call.
        extinguishers.forEach((e) => { e.visible = false; });
        team.forEach((w, i) => {
          place(w, [muster.x - 5 + i * 0.9, 0, muster.z - 9 - i * 0.5]);
          send(w, [[muster.x - 1.8 + i * 1.2, 0, muster.z - 2.6]], {
            run: false, pose: w === leader ? "radio" : "talk", face: 0,
          });
        });
        ctx.shot({ center: [muster.x, 1, muster.z - 2.4], yaw: Math.PI - 0.35, pitch: 0.3, distance: 13 });
      },
    ],
    electrical: [
      () => {
        // To the foot of the stairs.
        // Gathered at the foot of the flight, wherever the frame put it.
        const foot = ctx.stair.foot || { x: -17.8, z: 0.6 };
        run1([[foot.x - 0.8, 0, foot.z], [foot.x - 1.5, 0, foot.z + 0.7], [foot.x - 2.1, 0, foot.z - 0.6], [foot.x - 2.7, 0, foot.z + 0.3]]);
        postShot();
      },
      () => {
        // Up the stairs (off screen) to the floor where he lies.
        const top = ctx.stair.top;
        team.forEach((w, i) => place(w, [top.x + 0.6, top.y, top.z + i * 0.5]));
        send(leader, [[top.x + 3, top.y, inc.z - 3], [inc.x + 6.2, inc.y, inc.z - 2]], { pose: "work", face: Math.PI / 2 });
        // The rest keep everyone back until the power is off.
        send(medic, [[top.x + 3, top.y, inc.z - 2], [inc.x - 2.2, inc.y, inc.z - 1.2]], { pose: "talk", face: 1.2 });
        send(bearerA, [[top.x + 3, top.y, inc.z - 1], [inc.x - 3, inc.y, inc.z + 1.6]], { pose: "talk", face: 1.6 });
        send(bearerB, [[top.x + 3, top.y, inc.z], [inc.x - 3.4, inc.y, inc.z - 0.4]], { pose: "talk", face: 1.4 });
        // The two who were about to grab him step back.
        (ctx.mates || []).forEach((m, i) => {
          m.position.x -= 1.6;
          m.position.z += i ? -0.8 : 0.8;
        });
        // In through the open south face, between the slabs.
        ctx.shot({ center: [inc.x + 2.5, inc.y + 0.8, inc.z - 0.5], yaw: 0.4, pitch: 0.18, distance: 11 });
      },
      () => {
        if (ctx.sparks) ctx.sparks.visible = false;
        send(medic, [[inc.x - 0.75, inc.y, inc.z + 0.1]], { run: false, pose: "kneel", face: Math.PI / 2 });
        moves.get(medic).cpr = true;
        aed.visible = true;
        aed.position.set(inc.x - 0.6, inc.y + 0.02, inc.z + 0.9);
        ctx.shot({ center: [inc.x - 0.3, inc.y + 0.5, inc.z + 0.3], yaw: 0.15, pitch: 0.16, distance: 6.4 });
      },
      () => {
        ctx.shot({ center: [inc.x - 0.4, inc.y + 0.6, inc.z + 0.3], yaw: -0.2, pitch: 0.18, distance: 7.2 });
      },
      () => {
        // Breathing again: on the board and down to the first-aid post,
        // the AED still on him.
        moves.get(medic).cpr = false;
        toFirstAid();
      },
    ],
  };
  const script = beats[kind] || beats.fall;

  /* ---- the run of the response ---- */
  const run = { active: false, index: -1, t: 0, onEnd: null, played: false };

  function startBeat(i) {
    run.index = i;
    run.t = 0;
    script[i]?.();
  }

  function play(onEnd) {
    if (run.played) return false;
    run.played = true;
    run.active = true;
    run.onEnd = onEnd;
    startBeat(0);
    return true;
  }

  function end() {
    run.active = false;
    run.index = -1;
    const done = run.onEnd;
    run.onEnd = null;
    done?.();
  }

  /** Effects that run THROUGH a beat, not just at its start. */
  function during(dt) {
    const b = run.index;
    if (kind === "fall" && b === 1 && ctx.casualty) {
      // Lowered under control, a bit over a metre a second.
      const c = ctx.casualty;
      c.position.y = Math.max(0.12, c.position.y - dt * 0.75);
      c.rotation.z *= 1 - Math.min(1, dt * 0.8);
      if (ctx.lanyard) {
        const top = ctx.anchorY;
        const length = Math.max(0.3, top - (c.position.y + 1.3));
        ctx.lanyard.scale.y = length;
        ctx.lanyard.position.y = top - length / 2;
      }
    }
    if (kind === "fall" && b === 2 && ctx.casualty && run.t > 0.8) {
      // Down and laid flat for the first aider, clear of the scaffold.
      const c = ctx.casualty;
      c.rotation.order = "YXZ";
      c.rotation.set(-Math.PI / 2, 0, 0);
      c.position.set(ground.x, 0.14, ground.z);
      // Down, and still: no more struggling.
      c.userData.pose = "stand";
      if (ctx.lanyard) ctx.lanyard.visible = false;
    }
    if (kind === "fire" && b >= 2 && ctx.fire) {
      // Knocked down by the bursts, never quite out until the brigade.
      const target = b === 2 ? 0.35 : 0.22;
      const s = ctx.fire.scale.x + (target - ctx.fire.scale.x) * Math.min(1, dt * 0.5);
      ctx.fire.scale.setScalar(s);
      if (ctx.smokeMat) ctx.smokeMat.opacity = Math.max(0.1, ctx.smokeMat.opacity - dt * 0.02);
      sprays.forEach((spray) => {
        spray.material.opacity = 0.3 + 0.3 * Math.abs(Math.sin(run.t * 9));
      });
    }
    if (kind === "electrical" && b === 3) {
      // The shock: hands off for a moment, then back on the chest.
      moves.get(medic).cpr = run.t > 2.2;
    }
    if (kind !== "fire" && b === 4 && boardCarried
      && !moves.get(bearerA).route.length && !moves.get(bearerB).route.length) {
      // At the post: the board down on the ground, and the bearers step
      // back. The first aider is already on her knees beside him.
      boardCarried = false;
      board.position.set(aid.x, 0.04, aid.z);
      board.rotation.set(0, Math.PI / 2, 0);
      send(bearerA, [[aid.x - 1.6, 0, aid.z - 1.2]], { run: false, pose: "talk", face: 0.8 });
      send(bearerB, [[aid.x + 1.5, 0, aid.z - 1.3]], { run: false, pose: "talk", face: -0.7 });
      if (aed) {
        aed.visible = true;
        aed.position.set(aid.x + 0.25, 0.02, aid.z + 0.62);
      }
    }
  }

  function update(dt, t) {
    if (run.active) {
      run.t += dt;
      during(dt);
      if (run.t >= BEAT_SECONDS[run.index]) {
        if (run.index + 1 < script.length) startBeat(run.index + 1);
        else end();
      }
    }

    team.forEach((w) => {
      const m = moves.get(w);
      if (m.route.length) {
        const to = m.route[0];
        const d = new THREE.Vector3(to.x - w.position.x, to.y - w.position.y, to.z - w.position.z);
        const flat = Math.hypot(d.x, d.z);
        const step = m.speed * dt;
        if (flat <= step || d.length() <= step) {
          w.position.copy(to);
          m.route.shift();
        } else {
          w.position.x += (d.x / flat) * step;
          w.position.z += (d.z / flat) * step;
          // Height comes along in proportion, so stairs are climbed.
          w.position.y += d.y * (step / flat);
          turnToward(w, Math.atan2(d.x, d.z), dt, 10);
        }
        animateWorker(w, { dt, speed: m.speed, running: m.run, carrying: stretcherEnd(w), t: t + w.userData.idleOffset });
      } else {
        if (Number.isFinite(m.face)) turnToward(w, m.face, dt, 6);
        animateWorker(w, { dt, speed: 0, pose: m.pose, carrying: stretcherEnd(w), t: t + w.userData.idleOffset });
        if (m.cpr) {
          // Chest compressions: about two a second, arms locked straight.
          const rig = w.userData.rig;
          const push = Math.max(0, Math.sin(t * 12));
          rig.spine.rotation.x = 0.55 + push * 0.12;
          rig.armL.rotation.x = -1.25;
          rig.armR.rotation.x = -1.25;
          rig.armL.userData.elbow.rotation.x = -0.08;
          rig.armR.userData.elbow.rotation.x = -0.08;
        }
      }
    });

    // The board between the two rescuers while it is carried.
    if (boardCarried) {
      const a = bearerA.position;
      const b = bearerB.position;
      board.position.set((a.x + b.x) / 2, Math.max(a.y, b.y) + 0.82, (a.z + b.z) / 2);
      board.rotation.set(0, Math.atan2(a.x - b.x, a.z - b.z), 0);
    }
    if (casualtyOnBoard && ctx.casualty) {
      const c = ctx.casualty;
      c.rotation.order = "YXZ";
      c.rotation.set(-Math.PI / 2, board.rotation.y + Math.PI, 0);
      // Lying along the board, feet at one end.
      const along = new THREE.Vector3(Math.sin(board.rotation.y), 0, Math.cos(board.rotation.y));
      c.position.set(board.position.x - along.x * 0.85, board.position.y + 0.14, board.position.z - along.z * 0.85);
    }
  }

  function caption() {
    if (!run.active) return null;
    const c = captions[run.index] || captions[0];
    return {
      eyebrow: "ERT RESPONSE",
      eyebrowAlt: "அவசர மீட்புக் குழு",
      line: c.en,
      lineAlt: c.ta,
      step: run.index + 1,
      steps: captions.length,
    };
  }

  return {
    team,
    leader, medic, bearerA, bearerB,
    board,
    // Where the casualty is taken, and where the team reports after a fire.
    aid, muster,
    // What the player is told when it is over.
    done: ERT_DONE_BY_KIND[kind] || ERT_DONE,
    play,
    update,
    caption,
    get active() { return run.active; },
    get played() { return run.played; },
    get beat() { return run.index; },
    seconds: BEAT_SECONDS.reduce((a, b) => a + b, 0),
  };
}
