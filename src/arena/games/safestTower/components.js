/* ------------------------------------------------------------------ *
 *  GAME 3 — BUILD THE SAFEST TOWER
 *  Component catalogue and placement slots
 *
 *  The design point of this game: a building can be visually complete
 *  and still fail an audit. So most slots accept a `plausible`
 *  component as well as the `correct` one. A plausible choice LOOKS
 *  finished — the object appears, the slot stops asking for anything —
 *  but the audit at the end marks it non-compliant and explains why.
 *  That is how a player learns the difference between "signed" and
 *  "guarded".
 * ------------------------------------------------------------------ */

export const C_GUARDRAIL = "guardrail";
export const C_TOEBOARD = "toeboard";
export const C_NET = "net";
export const C_PLATFORM = "platform";
export const C_LADDER = "ladder";
export const C_STAIRCASE = "staircase";
export const C_HOLECOVER = "holecover";
export const C_BARRICADE = "barricade";
export const C_SIGN = "sign";
export const C_EXTINGUISHER = "extinguisher";
export const C_RCD = "rcd";
export const C_EXITSIGN = "exitsign";
export const C_ANCHOR = "anchor";

export const COMPONENTS = [
  { id: C_GUARDRAIL, label: "Guardrail", color: "#33C481", desc: "Top rail at 1.1 m with a mid rail" },
  { id: C_TOEBOARD, label: "Toe board", color: "#B5854D", desc: "150 mm board stopping material falling off an edge" },
  { id: C_NET, label: "Safety net", color: "#2BBF6F", desc: "Collective fall arrest slung below a leading edge" },
  { id: C_PLATFORM, label: "Scaffold platform", color: "#C3C9CF", desc: "Fully boarded working platform" },
  { id: C_LADDER, label: "Access ladder", color: "#9AA3AB", desc: "Tied ladder with 1 m hand-hold above the landing" },
  { id: C_STAIRCASE, label: "Temporary staircase", color: "#8E8C86", desc: "Permanent-route stair with handrails" },
  { id: C_HOLECOVER, label: "Hole cover", color: "#FFC629", desc: "Load-rated, secured and marked cover over an opening" },
  { id: C_BARRICADE, label: "Barricade", color: "#FF5A1F", desc: "Physical barrier keeping people out of an area" },
  { id: C_SIGN, label: "Warning sign", color: "#FFC629", desc: "Tells people about a hazard — does not remove it" },
  { id: C_EXTINGUISHER, label: "Fire extinguisher", color: "#EA4F4F", desc: "Fire point at the right class and location" },
  { id: C_RCD, label: "RCD board", color: "#59B7FF", desc: "Residual current device protecting site power" },
  { id: C_EXITSIGN, label: "Exit sign", color: "#13864A", desc: "Illuminated escape route marking" },
  { id: C_ANCHOR, label: "Fall arrest anchor", color: "#9B7CF2", desc: "Rated anchor point for a harness lanyard" },
];

export function getComponent(id) {
  return COMPONENTS.find((c) => c.id === id) || null;
}

/**
 * Slot definitions.
 *
 *  floor      which slab the slot belongs to (for the floor selector)
 *  at         local position relative to the building centre
 *  size       the ghost marker's footprint
 *  correct    the compliant component
 *  plausible  a component that will be accepted and look finished but
 *             fail the audit, with `plausibleWhy` explaining it
 *  after      slot ids that must be filled first, or the sequence is wrong
 */
export function buildSlots({ width, depth, floorHeight, floors }) {
  const hw = width / 2;
  const hd = depth / 2;
  const y = (floor) => floor * floorHeight;

  return [
    /* ---------------------------- ground ---------------------------- */
    {
      id: "ground-stair",
      floor: 0,
      label: "Main access to the upper floors",
      hint: "People need a safe permanent route up, not a ladder for every trip.",
      at: { x: -hw + 3.0, y: y(0), z: -hd + 2.2 },
      size: { x: 5.6, y: 0.4, z: 2.6 },
      correct: C_STAIRCASE,
      plausible: C_LADDER,
      plausibleWhy: "A ladder is for access, not for a main route carrying materials and people all shift.",
      audit: "Temporary staircase installed as the main access route",
    },
    {
      id: "ground-platform",
      floor: 0,
      label: "Scaffold working platform on the east face",
      hint: "The bricklayers need a fully boarded platform before they can work.",
      at: { x: hw + 1.6, y: y(0) + 2, z: 0 },
      size: { x: 2.0, y: 0.3, z: depth - 2 },
      correct: C_PLATFORM,
      audit: "Scaffold working platform fully boarded",
    },
    {
      id: "ground-platform-ladder",
      floor: 0,
      label: "Access to the scaffold platform",
      hint: "A platform with no way onto it is useless — and people will climb the frame.",
      at: { x: hw + 1.6, y: y(0), z: -hd + 1.4 },
      size: { x: 1.2, y: 0.4, z: 1.2 },
      correct: C_LADDER,
      after: ["ground-platform"],
      audit: "Tied access ladder to the scaffold platform",
    },
    {
      id: "ground-pedestrian",
      floor: 0,
      label: "Pedestrian route past the lifting area",
      hint: "Keep people physically out of the area under the crane.",
      at: { x: 0, y: y(0), z: hd + 4.2 },
      size: { x: width * 0.8, y: 0.4, z: 1.2 },
      correct: C_BARRICADE,
      plausible: C_SIGN,
      plausibleWhy: "Signage alone does not keep anyone out of a lifting area. A physical barrier does.",
      audit: "Pedestrian route physically segregated from the lifting area",
    },
    {
      id: "ground-fire",
      floor: 0,
      label: "Fire point at the ground floor exit",
      hint: "Fire cover belongs on the escape route, where people pass it on the way out.",
      at: { x: -hw + 1.4, y: y(0), z: hd - 1.4 },
      size: { x: 1.2, y: 0.4, z: 1.2 },
      correct: C_EXTINGUISHER,
      audit: "Fire point provided at the ground floor exit",
    },
    {
      id: "ground-power",
      floor: 0,
      label: "Site power distribution",
      hint: "Everything plugged in on site needs earth-fault protection.",
      at: { x: hw - 2.0, y: y(0), z: hd - 1.6 },
      size: { x: 1.4, y: 0.4, z: 1.2 },
      correct: C_RCD,
      audit: "Site power protected by an RCD",
    },

    /* ---------------------------- level 1 ---------------------------- */
    {
      id: "l1-north-edge",
      floor: 1,
      label: "Open edge — Level 1 north",
      hint: "The most common fatal defect on any site: an unprotected edge.",
      at: { x: 0, y: y(1), z: -hd + 0.2 },
      size: { x: width - 0.6, y: 1.2, z: 0.5 },
      correct: C_GUARDRAIL,
      plausible: C_SIGN,
      plausibleWhy: "An open edge needs a physical guardrail. A sign has never stopped a fall.",
      audit: "Level 1 north edge guarded",
    },
    {
      id: "l1-south-edge",
      floor: 1,
      label: "Open edge — Level 1 south",
      hint: "Every open edge, on every floor.",
      at: { x: 0, y: y(1), z: hd - 0.2 },
      size: { x: width - 0.6, y: 1.2, z: 0.5 },
      correct: C_GUARDRAIL,
      plausible: C_BARRICADE,
      plausibleWhy: "A loose barricade is not edge protection — it needs a fixed guardrail with a mid rail.",
      audit: "Level 1 south edge guarded",
    },
    {
      id: "l1-toeboard",
      floor: 1,
      label: "Material falling from the Level 1 edge",
      hint: "Stops offcuts and tools being kicked off the edge onto people below.",
      at: { x: 0, y: y(1), z: -hd + 0.6 },
      size: { x: width - 0.6, y: 0.4, z: 0.4 },
      correct: C_TOEBOARD,
      after: ["l1-north-edge"],
      audit: "Toe board fitted to the guarded edge",
    },
    {
      id: "l1-opening",
      floor: 1,
      label: "Service opening in the Level 1 slab",
      hint: "A 1.8 m hole straight through to the floor below.",
      at: { x: -hw + 5.0, y: y(1), z: 2.0 },
      size: { x: 2.4, y: 0.4, z: 2.4 },
      correct: C_HOLECOVER,
      plausible: C_BARRICADE,
      plausibleWhy: "Barricading a hole leaves it open. The compliant answer is a secured, load-rated, marked cover.",
      audit: "Floor opening covered with a secured load-rated cover",
    },
    {
      id: "l1-exit",
      floor: 1,
      label: "Escape route from Level 1",
      hint: "In smoke, people need to be able to find the stair.",
      at: { x: -hw + 2.4, y: y(1), z: -hd + 2.2 },
      size: { x: 1.4, y: 1.2, z: 1.2 },
      correct: C_EXITSIGN,
      after: ["ground-stair"],
      audit: "Escape route from Level 1 signed",
    },

    /* ---------------------------- level 2 ---------------------------- */
    {
      id: "l2-west-edge",
      floor: 2,
      label: "Open edge — Level 2 west",
      hint: "Higher up, the same rule.",
      at: { x: -hw + 0.2, y: y(2), z: 0 },
      size: { x: 0.5, y: 1.2, z: depth - 0.6 },
      correct: C_GUARDRAIL,
      audit: "Level 2 west edge guarded",
    },
    {
      id: "l2-leading-edge",
      floor: 2,
      label: "Leading edge where the slab is still being formed",
      hint: "You cannot guardrail an edge that is still moving. Protect the people below it instead.",
      at: { x: hw - 1.0, y: y(2), z: 0 },
      size: { x: 2.6, y: 0.6, z: depth - 2 },
      correct: C_NET,
      plausible: C_SIGN,
      plausibleWhy: "A moving leading edge needs collective fall protection — a net — not a notice.",
      audit: "Safety net slung below the leading edge",
    },
    {
      id: "l2-anchor",
      floor: 2,
      label: "Work at the leading edge needs fall arrest",
      hint: "A harness protects nobody without a rated anchor to clip to.",
      at: { x: hw - 4.0, y: y(2), z: -hd + 3.0 },
      size: { x: 1.2, y: 1.6, z: 1.2 },
      correct: C_ANCHOR,
      after: ["l2-leading-edge"],
      audit: "Rated fall arrest anchor provided at the leading edge",
    },
    {
      id: "l2-crane-warning",
      floor: 2,
      label: "Crane slewing overhead of Level 2",
      hint: "Here, telling people is the right control — you cannot barricade the sky.",
      at: { x: 0, y: y(2), z: hd - 2.4 },
      size: { x: 1.4, y: 1.2, z: 1.2 },
      correct: C_SIGN,
      audit: "Overhead lifting warning displayed",
    },

    /* ---------------------------- level 3 ---------------------------- */
    {
      id: "l3-perimeter",
      floor: 3,
      label: "Roof level perimeter",
      hint: "The top slab is the easiest place to forget.",
      at: { x: 0, y: y(3), z: -hd + 0.2 },
      size: { x: width - 0.6, y: 1.2, z: 0.5 },
      correct: C_GUARDRAIL,
      plausible: C_SIGN,
      plausibleWhy: "The roof perimeter is an open edge like any other and needs a guardrail.",
      audit: "Roof perimeter guarded",
    },
    {
      id: "l3-fire",
      floor: 3,
      label: "Fire cover for hot works on the roof",
      hint: "Hot works need fire cover within reach, not three floors down.",
      at: { x: hw - 2.4, y: y(3), z: hd - 2.4 },
      size: { x: 1.2, y: 1.2, z: 1.2 },
      correct: C_EXTINGUISHER,
      audit: "Fire point provided at the roof hot works area",
    },
  ].filter((slot) => slot.floor < floors);
}

export const SCORING = {
  correct: 150,
  sequenceBonus: 50,
  plausible: 25,         // it looks done, so a little credit — the audit takes it back
  wrong: -75,
  misplaced: -25,
  complianceBonusMax: 600,
  timeBonusPerSecond: 2,
};
