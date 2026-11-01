/* ------------------------------------------------------------------ *
 *  3D MODEL VIEWER — the models in public/models, in one scene.
 *
 *  Built with @react-three/fiber and drei, and loaded only when it is
 *  opened (from the Arena home, or ?role=arena&view=models), so nobody
 *  playing the missions downloads any of it.
 *
 *  What is in the scene comes from models.json:
 *
 *    the Mixamo characters  the rig and mesh the four animations came
 *                           with, and every rigged Mixamo character
 *                           listed under "characters", which gets the
 *                           same clips retargeted onto its own bones.
 *                           One set of buttons switches all of them
 *                           between Walking, Fast Run, Angry and Snatch,
 *                           with a short crossfade
 *    the rubble scan        model.obj through MTLLoader and OBJLoader,
 *                           then given a MeshStandardMaterial with the
 *                           diffuse, normal, roughness and AO maps
 *    the props              grass, the city block, planks and stones
 *
 *  Every model is scaled to a real size and stood on the ground, and
 *  each loads on its own: one that fails says so in the panel and the
 *  rest of the scene carries on.
 * ------------------------------------------------------------------ */

import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations, Sky, ContactShadows, useProgress } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { ChevronLeft, Play, Bone, AlertTriangle, CheckCircle2, Loader2, Layers } from "lucide-react";
import { C } from "./arenaConstants.js";
import MANIFEST from "./models.json";

const BASE = `${import.meta.env?.BASE_URL || "/"}${MANIFEST.base}`;
const urlOf = (file) => `${BASE}${file}`;

/** The character the clips came with, then the others beside it. */
const CHARACTERS = [MANIFEST.animated, ...(MANIFEST.characters || [])];

/**
 * Scales an object so its height (or its largest footprint side) is
 * `size` metres, turns it, and stands it on the ground at `at`.
 */
export function fitTo(object, { size, by = "max", at = [0, 0, 0], rotY = 0 }) {
  object.rotation.y = rotY;
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const dims = box.getSize(new THREE.Vector3());
  const ref = by === "height" ? dims.y : Math.max(dims.x, dims.z);
  if (ref > 0 && Number.isFinite(ref)) object.scale.multiplyScalar(size / ref);
  object.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(object);
  const centre = fitted.getCenter(new THREE.Vector3());
  object.position.x += at[0] - centre.x;
  object.position.z += at[2] - centre.z;
  object.position.y += at[1] - fitted.min.y;
  return object;
}

const shadowsOn = (object) => {
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return object;
};

/* --------------------- clips from one rig on another --------------------- */

/**
 * A Mixamo bone's name without the rig's prefix or the "_1" a loader
 * gives a duplicate: "mixamorigLeftArm", "mixamorig1:LeftArm" and
 * "mixamorigLeftArm_1" are all "LeftArm".
 */
export const boneBase = (name) => String(name).replace(/^mixamorig\d*[:_]?/i, "").replace(/_\d+$/, "");

/**
 * A rig's bones by base name. Where a loader has duplicated a bone the
 * first is kept: it is the one a clip drives, and the copy hangs under it.
 */
function bonesByBase(root) {
  const bones = new Map();
  root.traverse((o) => {
    if (o.isBone && !bones.has(boneBase(o.name))) bones.set(boneBase(o.name), o);
  });
  return bones;
}

/**
 * How far a rig's hips stand from where they hang at rest. Read once and
 * kept, because once a clip plays the hips are wherever it puts them.
 */
function restHips(root) {
  if (root.userData.restHips === undefined) {
    root.userData.restHips = bonesByBase(root).get("Hips")?.position.length() ?? 0;
  }
  return root.userData.restHips;
}

/** Without these a rig is not a Mixamo body the clips can move. */
const CORE_BONES = ["Hips", "Spine", "Head", "LeftArm", "RightArm", "LeftUpLeg", "RightUpLeg"];

/**
 * Puts clips recorded on one Mixamo rig onto another. Mixamo names every
 * bone the same way, so tracks are matched on the name without the rig's
 * prefix. Every bone takes the clip's rotations; only the hips take its
 * movement, scaled by how high the two rigs' hips stand, so a shorter or
 * taller character keeps its feet on the ground. Tracks for bones the
 * target does not have are left out.
 *
 * @returns {{ clips: THREE.AnimationClip[], matched: number, of: number }}
 *          the clips, and how many of the bones they move were found
 */
export function retargetClips(clips, source, target) {
  const from = bonesByBase(source);
  const to = bonesByBase(target);
  const k = restHips(source) > 0 ? restHips(target) / restHips(source) : 0;
  const moved = new Set();
  const found = new Set();
  const out = clips.map((clip) => {
    const tracks = [];
    clip.tracks.forEach((track) => {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      const base = boneBase(nodeName);
      if (from.has(base)) moved.add(base);
      const bone = to.get(base);
      const hipsMove = propertyName === "position" && base === "Hips" && k > 0;
      if (!bone || (propertyName !== "quaternion" && !hipsMove)) return;
      const copy = track.clone();
      copy.name = `${bone.name}.${propertyName}`;
      if (hipsMove) copy.values = copy.values.map((v) => v * k);
      tracks.push(copy);
      found.add(base);
    });
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
  return { clips: out, matched: found.size, of: moved.size };
}

/* ------------------------------ the models ------------------------------ */

/**
 * A Mixamo character playing whichever clip is chosen. The clips are the
 * four in mixamo-character.glb: that character plays them as they are,
 * and any other gets them retargeted onto its own bones.
 */
function MixamoCharacter({ spec, clip, onRig }) {
  const own = useGLTF(urlOf(spec.file), false, true);
  const lib = useGLTF(urlOf(MANIFEST.animated.file), false, true);
  const root = useRef();
  const object = useMemo(() => {
    restHips(own.scene); // before a clip moves them
    return shadowsOn(fitTo(own.scene, { size: spec.size ?? 1.8, by: "height", at: spec.at ?? [0, 0, 0] }));
  }, [own.scene, spec]);
  const rig = useMemo(() => {
    if (own.scene === lib.scene) {
      const n = bonesByBase(own.scene).size;
      return { clips: lib.animations, matched: n, of: n };
    }
    return retargetClips(lib.animations, lib.scene, own.scene);
  }, [own.scene, lib.scene, lib.animations]);
  const { actions } = useAnimations(rig.clips, root);

  useEffect(() => {
    // Each of a character's skinned meshes can carry its own copy of the
    // skeleton, and the loader keeps node names unique by adding "_1" to
    // the copies — so bones are counted once, by their base name.
    const bones = bonesByBase(object);
    onRig?.(spec.id, {
      bones: [...bones.values()].map((b) => b.name),
      clips: rig.clips.filter((c) => c.tracks.length).map((c) => c.name),
      matched: rig.matched,
      of: rig.of,
      plays: CORE_BONES.every((b) => bones.has(b)),
    });
  }, [object, rig, spec.id, onRig]);

  useEffect(() => {
    const action = actions?.[clip];
    if (!action) return undefined;
    action.reset().fadeIn(0.35).play();
    return () => { action.fadeOut(0.35); };
  }, [clip, actions]);

  return <primitive ref={root} object={object} />;
}

/**
 * The rubble scan through MTLLoader and OBJLoader, then a proper
 * MeshStandardMaterial with all four maps.
 *
 * About the AO map: an OBJ only ever has one UV set, and older three.js
 * read aoMap from a second one (uv2), which is why the usual advice is
 * to skip AO on an OBJ. Since r151 a texture names the UV set it reads
 * with `texture.channel`, so setting the AO map's channel to 0 makes it
 * read the scan's one UV set — the set it was baked for — and the AO is
 * kept. The viewer can switch it off to compare.
 */
function RubbleScan({ ao }) {
  const r = MANIFEST.rubble;
  const materials = useLoader(MTLLoader, urlOf(r.mtl));
  const obj = useLoader(OBJLoader, urlOf(r.obj), (loader) => {
    materials.preload();
    loader.setMaterials(materials);
  });
  const [diffuse, normal, roughness, aoMap] = useLoader(THREE.TextureLoader, [
    urlOf(r.maps.diffuse), urlOf(r.maps.normal), urlOf(r.maps.roughness), urlOf(r.maps.ao),
  ]);
  const material = useMemo(() => {
    diffuse.colorSpace = THREE.SRGBColorSpace;
    aoMap.channel = 0;
    return new THREE.MeshStandardMaterial({
      map: diffuse, normalMap: normal, roughnessMap: roughness, aoMap,
      roughness: 1, metalness: 0,
    });
  }, [diffuse, normal, roughness, aoMap]);
  useEffect(() => {
    material.aoMapIntensity = ao ? 1 : 0;
  }, [ao, material]);
  const object = useMemo(() => {
    const o = obj.clone(true);
    o.traverse((m) => { if (m.isMesh) m.material = material; });
    return shadowsOn(fitTo(o, { size: r.size, at: r.at }));
  }, [obj, material, r.size, r.at]);
  return <primitive object={object} />;
}

/** A prop from the manifest, once or at each of its copies. */
function Prop({ prop }) {
  const { scene } = useGLTF(urlOf(prop.file), false, true);
  const placed = useMemo(() => {
    const spots = [prop.at, ...(prop.copies || [])];
    return spots.map((at, i) => shadowsOn(fitTo(scene.clone(true), { size: prop.size, at, rotY: i * 1.3 })));
  }, [scene, prop]);
  return <>{placed.map((o, i) => <primitive key={i} object={o} />)}</>;
}

/* ------------------------- per-model safety net ------------------------- */

/** Keeps one model's failure from taking the whole scene down. */
class ModelBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(`[models] ${this.props.id} failed to load`, error);
    this.props.onStatus?.(this.props.id, "failed", String(error?.message || error));
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Reports a model as loaded once Suspense lets it render. */
function Loaded({ id, onStatus, children }) {
  useEffect(() => { onStatus?.(id, "loaded"); }, [id, onStatus]);
  return children;
}

function Slot({ id, onStatus, children }) {
  return (
    <ModelBoundary id={id} onStatus={onStatus}>
      <Suspense fallback={null}>
        <Loaded id={id} onStatus={onStatus}>{children}</Loaded>
      </Suspense>
    </ModelBoundary>
  );
}

/* ------------------------------ the panel ------------------------------ */

function Progress() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div style={{
      position: "absolute", left: "50%", top: 64, transform: "translateX(-50%)",
      background: "rgba(10,12,14,0.86)", border: `1px solid ${C.line}`, borderRadius: 999,
      padding: "6px 14px", color: C.muted, fontSize: 12, display: "flex", gap: 8, alignItems: "center",
    }}>
      <Loader2 size={14} style={{ animation: "cslSpin 1s linear infinite" }} />
      Loading models… {Math.round(progress)}%
    </div>
  );
}

const LIST = [
  ...CHARACTERS.map((c) => ({ id: c.id, label: c.label, mb: c.mb })),
  { id: MANIFEST.rubble.id, label: MANIFEST.rubble.label, mb: MANIFEST.rubble.mb },
  ...MANIFEST.props.map((p) => ({ id: p.id, label: p.label, mb: p.mb })),
];

/** What the panel says about one character's rig. */
function rigLine(spec, r) {
  if (spec.id === MANIFEST.animated.id) return `${r.bones.length} bones, ${r.clips.length} clips.`;
  if (!r.plays) return `${r.bones.length} bones, not a Mixamo skeleton, so the clips cannot move it.`;
  return r.matched < r.of
    ? `${r.bones.length} bones, plays the same ${r.clips.length} clips (${r.matched} of the ${r.of} bones they move are on this rig).`
    : `${r.bones.length} bones, plays the same ${r.clips.length} clips.`;
}

/**
 * @param onBack   back to the Arena home
 */
export default function ModelViewer({ onBack }) {
  const [clip, setClip] = useState(MANIFEST.animated.clips[0]);
  const [ao, setAo] = useState(true);
  const [status, setStatus] = useState({});
  const [rigs, setRigs] = useState({});
  const [showBones, setShowBones] = useState(false);
  const onStatus = useMemo(() => (id, value, detail) => {
    setStatus((s) => (s[id]?.value === value ? s : { ...s, [id]: { value, detail } }));
  }, []);
  const onRig = useMemo(() => (id, info) => setRigs((r) => ({ ...r, [id]: info })), []);
  const rigged = CHARACTERS.filter((c) => rigs[c.id]);
  const mobile = typeof window !== "undefined" && window.innerWidth < 760;

  const btn = (active) => ({
    border: `1px solid ${active ? C.yellow : C.line}`, borderRadius: 8,
    background: active ? C.yellow : "rgba(255,255,255,0.04)",
    color: active ? "#1A1200" : C.ink, fontWeight: 800, fontSize: 12.5,
    padding: "8px 11px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0B0E11", color: C.ink }}>
      <style>{"@keyframes cslSpin { to { transform: rotate(360deg); } }"}</style>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [7.5, 4.2, 11], fov: 45, near: 0.1, far: 900 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Sky sunPosition={[60, 40, 30]} turbidity={6} rayleigh={1.2} />
        <hemisphereLight args={[0xcfe2f0, 0x6b6253, 0.9]} />
        <directionalLight
          position={[18, 26, 14]} intensity={2.2} castShadow
          shadow-mapSize={[2048, 2048]} shadow-camera-left={-30} shadow-camera-right={30}
          shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-far={120}
        />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[260, 260]} />
          <meshStandardMaterial color="#8a8274" roughness={1} />
        </mesh>
        <ContactShadows position={[0, 0.01, 0]} scale={14} blur={2.4} opacity={0.5} far={6} />

        {CHARACTERS.map((c) => (
          <Slot key={c.id} id={c.id} onStatus={onStatus}>
            <MixamoCharacter spec={c} clip={clip} onRig={onRig} />
          </Slot>
        ))}
        <Slot id={MANIFEST.rubble.id} onStatus={onStatus}>
          <RubbleScan ao={ao} />
        </Slot>
        {MANIFEST.props.map((p) => (
          <Slot key={p.id} id={p.id} onStatus={onStatus}>
            <Prop prop={p} />
          </Slot>
        ))}

        <OrbitControls target={[0, 1, -4]} maxPolarAngle={Math.PI / 2 - 0.04} minDistance={2} maxDistance={140} />
      </Canvas>

      <Progress />

      {/* ---- top bar ---- */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", background: "linear-gradient(rgba(11,14,17,0.9), rgba(11,14,17,0))",
      }}>
        <button type="button" onClick={onBack} style={btn(false)} aria-label="Back to the Arena">
          <ChevronLeft size={15} /> Arena
        </button>
        <span style={{ fontWeight: 900, letterSpacing: 0.4 }}>3D model viewer</span>
      </div>

      {/* ---- the panel ---- */}
      <div style={{
        position: "absolute", right: mobile ? 8 : 14, left: mobile ? 8 : "auto",
        bottom: mobile ? 8 : "auto", top: mobile ? "auto" : 58,
        width: mobile ? "auto" : 340, maxHeight: mobile ? "46vh" : "calc(100vh - 74px)", overflowY: "auto",
        background: "rgba(11,14,17,0.88)", border: `1px solid ${C.line}`, borderRadius: 12,
        padding: 14, display: "grid", gap: 12, fontSize: 12.5,
      }}>
        <section aria-label="Animations">
          <div style={{ fontWeight: 900, letterSpacing: 1, fontSize: 11, color: C.yellow, marginBottom: 8 }}>
            ANIMATION · {CHARACTERS.length > 1 ? "every character" : MANIFEST.animated.label}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {MANIFEST.animated.clips.map((name) => (
              <button key={name} type="button" onClick={() => setClip(name)} style={btn(clip === name)} aria-pressed={clip === name}>
                <Play size={13} /> {name}
              </button>
            ))}
          </div>
          {rigged.length > 0 && (
            <div style={{ color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
              {rigged.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  {rigs[c.id].plays
                    ? <Bone size={13} style={{ flexShrink: 0, marginTop: 3 }} />
                    : <AlertTriangle size={13} color={C.orange} style={{ flexShrink: 0, marginTop: 3 }} />}
                  <span>{c.label}: {rigLine(c, rigs[c.id])}</span>
                </div>
              ))}
              <button type="button" onClick={() => setShowBones((v) => !v)}
                style={{ background: "none", border: 0, color: C.blue || C.yellow, cursor: "pointer", padding: 0, fontSize: 12 }}>
                {showBones ? "Hide bone names" : "Show bone names"}
              </button>
              {showBones && rigged.map((c) => (
                <div key={c.id} style={{ marginTop: 6, fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.5 }}>
                  {rigged.length > 1 && `${c.label}: `}{rigs[c.id].bones.join(", ")}
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Rubble scan">
          <div style={{ fontWeight: 900, letterSpacing: 1, fontSize: 11, color: C.green, marginBottom: 6 }}>RUBBLE SCAN · OBJ + MTL</div>
          <button type="button" onClick={() => setAo((v) => !v)} style={btn(ao)} aria-pressed={ao}>
            <Layers size={13} /> Ambient occlusion {ao ? "on" : "off"}
          </button>
          <div style={{ color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
            Diffuse, normal, roughness and AO on a MeshStandardMaterial. The AO reads the scan&apos;s one
            UV set (texture.channel = 0), so no second UV set is needed.
          </div>
        </section>

        <section aria-label="Models">
          <div style={{ fontWeight: 900, letterSpacing: 1, fontSize: 11, color: C.muted, marginBottom: 6 }}>IN THE SCENE</div>
          {LIST.map((m) => {
            const st = status[m.id]?.value;
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                {st === "loaded" ? <CheckCircle2 size={14} color={C.green} />
                  : st === "failed" ? <AlertTriangle size={14} color={C.red} />
                    : <Loader2 size={14} color={C.muted} style={{ animation: "cslSpin 1s linear infinite" }} />}
                <span style={{ flex: 1 }}>{m.label}</span>
                <span style={{ color: C.muted }}>{m.mb} MB</span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
