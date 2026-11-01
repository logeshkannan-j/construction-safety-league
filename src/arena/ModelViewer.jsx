/* ------------------------------------------------------------------ *
 *  3D MODEL VIEWER — the models in public/models, in one scene.
 *
 *  Built with @react-three/fiber and drei, and loaded only when it is
 *  opened (from the Arena home, or ?role=arena&view=models), so nobody
 *  playing the missions downloads any of it.
 *
 *  What is in the scene comes from models.json:
 *
 *    the Mixamo character   the rig and mesh the four animations came
 *                           with, playing Walking, Fast Run, Angry or
 *                           Snatch — the buttons switch between them,
 *                           with a short crossfade
 *    the worker scan        worker.glb. It has NO skeleton, so it is
 *                           shown standing, with what it would take to
 *                           animate it
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

/* ------------------------------ the models ------------------------------ */

/** The Mixamo rig, playing whichever clip is chosen. */
function MixamoCharacter({ clip, onRig }) {
  const { scene, animations } = useGLTF(urlOf(MANIFEST.animated.file), false, true);
  const root = useRef();
  const object = useMemo(() => shadowsOn(fitTo(scene, { size: 1.8, by: "height", at: [0, 0, 0] })), [scene]);
  const { actions, names } = useAnimations(animations, root);

  useEffect(() => {
    // Each of the character's two skinned meshes carries its own copy
    // of the skeleton, and the loader keeps node names unique by adding
    // "_1" to the copies — so bones are counted by their base name.
    const bones = new Set();
    object.traverse((o) => { if (o.isBone) bones.add(o.name.replace(/_\d+$/, "")); });
    onRig?.({ clips: names, bones: [...bones] });
  }, [object, names, onRig]);

  useEffect(() => {
    const action = actions?.[clip];
    if (!action) return undefined;
    action.reset().fadeIn(0.35).play();
    return () => { action.fadeOut(0.35); };
  }, [clip, actions]);

  return <primitive ref={root} object={object} />;
}

/** The worker scan: shown as it is, and checked for a skeleton. */
function WorkerScan({ onChecked }) {
  const { scene } = useGLTF(urlOf(MANIFEST.worker.file), false, true);
  const object = useMemo(() => shadowsOn(fitTo(scene, { size: 1.75, by: "height", at: [2.4, 0, 0.2] })), [scene]);
  useEffect(() => {
    let bones = 0;
    let skinned = 0;
    let triangles = 0;
    object.traverse((o) => {
      if (o.isBone) bones += 1;
      if (o.isSkinnedMesh) skinned += 1;
      if (o.isMesh) {
        const g = o.geometry;
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
    });
    onChecked?.({ bones, skinned, triangles: Math.round(triangles) });
  }, [object, onChecked]);
  return <primitive object={object} />;
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
  { id: MANIFEST.animated.id, label: MANIFEST.animated.label, mb: MANIFEST.animated.mb },
  { id: MANIFEST.worker.id, label: MANIFEST.worker.label, mb: MANIFEST.worker.mb },
  { id: MANIFEST.rubble.id, label: MANIFEST.rubble.label, mb: MANIFEST.rubble.mb },
  ...MANIFEST.props.map((p) => ({ id: p.id, label: p.label, mb: p.mb })),
];

/**
 * @param onBack   back to the Arena home
 */
export default function ModelViewer({ onBack }) {
  const [clip, setClip] = useState(MANIFEST.animated.clips[0]);
  const [ao, setAo] = useState(true);
  const [status, setStatus] = useState({});
  const [rig, setRig] = useState(null);
  const [worker, setWorker] = useState(null);
  const [showBones, setShowBones] = useState(false);
  const onStatus = useMemo(() => (id, value, detail) => {
    setStatus((s) => (s[id]?.value === value ? s : { ...s, [id]: { value, detail } }));
  }, []);
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

        <Slot id={MANIFEST.animated.id} onStatus={onStatus}>
          <MixamoCharacter clip={clip} onRig={setRig} />
        </Slot>
        <Slot id={MANIFEST.worker.id} onStatus={onStatus}>
          <WorkerScan onChecked={setWorker} />
        </Slot>
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
            ANIMATION · {MANIFEST.animated.label}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {MANIFEST.animated.clips.map((name) => (
              <button key={name} type="button" onClick={() => setClip(name)} style={btn(clip === name)} aria-pressed={clip === name}>
                <Play size={13} /> {name}
              </button>
            ))}
          </div>
          {rig && (
            <div style={{ color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
              <Bone size={13} style={{ verticalAlign: -2 }} /> Mixamo rig: {rig.bones.length} bones, {rig.clips.length} clips.{" "}
              <button type="button" onClick={() => setShowBones((v) => !v)}
                style={{ background: "none", border: 0, color: C.blue || C.yellow, cursor: "pointer", padding: 0, fontSize: 12 }}>
                {showBones ? "Hide bone names" : "Show bone names"}
              </button>
              {showBones && (
                <div style={{ marginTop: 6, fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.5 }}>
                  {rig.bones.join(", ")}
                </div>
              )}
            </div>
          )}
        </section>

        <section aria-label="The worker scan">
          <div style={{ fontWeight: 900, letterSpacing: 1, fontSize: 11, color: C.orange, marginBottom: 6 }}>
            WORKER.GLB · CAN IT ANIMATE?
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.5 }}>
            <AlertTriangle size={15} color={C.orange} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              No skeleton.{" "}
              {worker
                ? `Checked in this browser: ${worker.bones} bones, ${worker.skinned} skinned meshes, ${worker.triangles.toLocaleString()} triangles.`
                : `${MANIFEST.worker.triangles.toLocaleString()} triangles, 0 bones.`}
            </span>
          </div>
          <ol style={{ margin: "8px 0 0", paddingLeft: 18, color: C.muted, lineHeight: 1.5 }}>
            {MANIFEST.worker.fix.map((line) => <li key={line} style={{ marginBottom: 4 }}>{line}</li>)}
          </ol>
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
