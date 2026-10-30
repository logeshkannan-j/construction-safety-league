/* ------------------------------------------------------------------ *
 *  GAME 1 — SAFETY MISSION SIMULATOR
 *  Hazard catalogue
 *
 *  Each hazard is a real, recognisable construction defect with:
 *    category  the risk classification the player must choose
 *    action    the correct corrective action
 *    lesson    what the results screen tells them to review
 *
 *  Distractor options are drawn from the master lists below, so the
 *  wrong answers are always plausible safety answers rather than
 *  obvious filler — which is what makes the identification step
 *  actually teach classification.
 * ------------------------------------------------------------------ */

export const CATEGORIES = {
  PPE: "PPE non-compliance",
  HEIGHT: "Work at height — fall risk",
  ELECTRICAL: "Electrical hazard",
  LIFTING: "Lifting operation / suspended load",
  EXCAVATION: "Excavation — collapse risk",
  HOUSEKEEPING: "Housekeeping — slips, trips and falls",
  EMERGENCY: "Emergency access obstruction",
  SCAFFOLD: "Scaffold defect",
  OVERLOAD: "Plant overload / capacity breach",
  STRUCK: "Struck-by / falling object",
};

export const ACTIONS = {
  STOP_REMOVE: "Stop the task and move the person out of the danger zone",
  ISSUE_PPE: "Stop the worker, issue the correct PPE and brief them before restarting",
  FIT_GUARDRAIL: "Fit compliant guardrails, mid rails and toe boards to the open edge",
  COVER_OPENING: "Fit a secured, load-rated cover marked HOLE and barrier it off",
  ISOLATE_LOCKOFF: "Isolate the supply, lock off and tag, then have a competent electrician repair it",
  TAPE_IT_UP: "Wrap the damaged section in insulating tape and keep using it",
  EXCLUSION_ZONE: "Establish a barriered exclusion zone and appoint a trained banksman",
  STOP_LIFT: "Stop the lift, land the load in a safe place and re-plan with the appointed person",
  CLEAR_ROUTE: "Clear the route immediately and keep the escape way permanently unobstructed",
  SIGN_THE_ROUTE: "Put up a sign telling people to climb over the stored material",
  TIDY_AREA: "Clear and sort the material to the designated storage and waste areas",
  SHORE_EXCAVATION: "Stop entry, shore or batter the sides and fit edge protection before anyone re-enters",
  DEEPEN_EXCAVATION: "Dig the trench deeper so the spoil has somewhere to fall",
  OFFLOAD_TO_SWL: "Offload to the rated capacity, check the SWL plate and re-inspect the hoist",
  COMPLETE_BOARDING: "Stop use, tag it out, complete the platform boarding and have it re-inspected",
  CLIP_ON: "Stop the work and have the operative clip their lanyard to a rated anchor point",
  TELL_SUPERVISOR_LATER: "Make a note and mention it at the next weekly safety meeting",
  CARRY_ON_WATCH: "Let the work continue while you watch from a safe distance",
};

/**
 * The ten hazards. `place` is read by the world builder in index.js:
 * it says where the hazard's interaction anchor sits and how close the
 * player must be.
 */
export const HAZARDS = [
  {
    id: "no-helmet",
    title: "Worker with no head protection",
    detail: "A steel fixer is working at ground level under an active lift zone with no safety helmet.",
    category: CATEGORIES.PPE,
    action: ACTIONS.ISSUE_PPE,
    categoryDecoys: [CATEGORIES.HOUSEKEEPING, CATEGORIES.STRUCK, CATEGORIES.HEIGHT],
    actionDecoys: [ACTIONS.TELL_SUPERVISOR_LATER, ACTIONS.CARRY_ON_WATCH, ACTIONS.EXCLUSION_ZONE],
    lesson: "Head protection is mandatory wherever there is any risk of a falling object — not only directly under a lift.",
    place: { x: -16, y: 0, z: -4, radius: 3.6, eyeY: 1.5 },
  },
  {
    id: "floor-opening",
    title: "Unprotected floor opening",
    detail: "A 1.5 m service void on Level 1 is completely open — no cover, no barrier, no signage.",
    category: CATEGORIES.HEIGHT,
    action: ACTIONS.COVER_OPENING,
    categoryDecoys: [CATEGORIES.HOUSEKEEPING, CATEGORIES.STRUCK, CATEGORIES.SCAFFOLD],
    actionDecoys: [ACTIONS.TAPE_IT_UP, ACTIONS.SIGN_THE_ROUTE, ACTIONS.TELL_SUPERVISOR_LATER],
    lesson: "Floor openings need a secured, load-rated cover or full edge protection — signage alone does not stop a fall.",
    place: { x: -15, y: 3.4, z: 13, radius: 3.4, eyeY: 1.2 },
  },
  {
    id: "electrical",
    title: "Damaged electrical connection",
    detail: "A distribution board is open with exposed live conductors and a damaged trailing lead across the ground.",
    category: CATEGORIES.ELECTRICAL,
    action: ACTIONS.ISOLATE_LOCKOFF,
    categoryDecoys: [CATEGORIES.HOUSEKEEPING, CATEGORIES.OVERLOAD, CATEGORIES.EMERGENCY],
    actionDecoys: [ACTIONS.TAPE_IT_UP, ACTIONS.CARRY_ON_WATCH, ACTIONS.TIDY_AREA],
    lesson: "Damaged or exposed electrical equipment must be isolated and locked off — never repaired with tape or left in service.",
    place: { x: -30, y: 0, z: -6, radius: 3.6, eyeY: 1.5 },
  },
  {
    id: "scaffold-platform",
    title: "Incomplete scaffold platform",
    detail: "The third lift is missing two boards, leaving a gap in the working platform — and it is still in use.",
    category: CATEGORIES.SCAFFOLD,
    action: ACTIONS.COMPLETE_BOARDING,
    categoryDecoys: [CATEGORIES.HOUSEKEEPING, CATEGORIES.OVERLOAD, CATEGORIES.STRUCK],
    actionDecoys: [ACTIONS.CARRY_ON_WATCH, ACTIONS.SIGN_THE_ROUTE, ACTIONS.EXCLUSION_ZONE],
    lesson: "A part-boarded scaffold must be tagged out of use until the platform is complete and re-inspected by a competent person.",
    // Generous radius: a part-boarded lift is clearly visible from the
    // ground, so the player should not have to climb to report it.
    place: { x: -12, y: 6, z: 1.6, radius: 7, eyeY: 1.2 },
  },
  {
    id: "unsafe-lift",
    title: "Load suspended over a walkway",
    detail: "A slung bundle is parked over a pedestrian route with a worker underneath, and no exclusion zone or banksman.",
    category: CATEGORIES.LIFTING,
    action: ACTIONS.STOP_LIFT,
    categoryDecoys: [CATEGORIES.STRUCK, CATEGORIES.OVERLOAD, CATEGORIES.HEIGHT],
    actionDecoys: [ACTIONS.CARRY_ON_WATCH, ACTIONS.TELL_SUPERVISOR_LATER, ACTIONS.TIDY_AREA],
    lesson: "Nobody works or walks under a suspended load. Stop the lift, land it safely and re-plan the operation.",
    place: { x: 22, y: 0, z: 2, radius: 5.2, eyeY: 1.6 },
  },
  {
    id: "no-harness",
    title: "Working at height without fall arrest",
    detail: "An operative is at the unprotected Level 2 edge wearing a harness that is not clipped to anything.",
    category: CATEGORIES.HEIGHT,
    action: ACTIONS.CLIP_ON,
    categoryDecoys: [CATEGORIES.PPE, CATEGORIES.SCAFFOLD, CATEGORIES.STRUCK],
    actionDecoys: [ACTIONS.ISSUE_PPE, ACTIONS.CARRY_ON_WATCH, ACTIONS.SIGN_THE_ROUTE],
    lesson: "A harness only protects anybody once the lanyard is attached to a suitable, rated anchor point.",
    // Level 2, at the unprotected south edge. Reaching this one needs
    // the stair core, which is the point of making the site climbable.
    place: { x: -7, y: 6.8, z: 15.6, radius: 4.2, eyeY: 1.4 },
  },
  {
    id: "housekeeping",
    title: "Poor housekeeping in a walkway",
    detail: "Offcuts, banding and loose material are strewn across the main pedestrian route, with a trailing cable through it.",
    category: CATEGORIES.HOUSEKEEPING,
    action: ACTIONS.TIDY_AREA,
    categoryDecoys: [CATEGORIES.EMERGENCY, CATEGORIES.STRUCK, CATEGORIES.ELECTRICAL],
    actionDecoys: [ACTIONS.SIGN_THE_ROUTE, ACTIONS.TELL_SUPERVISOR_LATER, ACTIONS.CARRY_ON_WATCH],
    lesson: "Slips, trips and falls are the most common site injury. Walkways get cleared as work proceeds, not at the end of the shift.",
    place: { x: -2, y: 0, z: -14, radius: 3.8, eyeY: 1.1 },
  },
  {
    id: "blocked-exit",
    title: "Obstructed emergency exit",
    detail: "The west emergency gate — part of the signed escape route — is blocked by stacked pallets and a site bin.",
    category: CATEGORIES.EMERGENCY,
    action: ACTIONS.CLEAR_ROUTE,
    categoryDecoys: [CATEGORIES.HOUSEKEEPING, CATEGORIES.STRUCK, CATEGORIES.OVERLOAD],
    actionDecoys: [ACTIONS.SIGN_THE_ROUTE, ACTIONS.TIDY_AREA, ACTIONS.TELL_SUPERVISOR_LATER],
    lesson: "Escape routes must be kept clear at all times — in a fire, a blocked exit is the difference between an evacuation and a fatality.",
    place: { x: -42, y: 0, z: 18, radius: 4.4, eyeY: 1.4 },
  },
  {
    id: "excavation",
    title: "Unsupported excavation",
    detail: "A 2.2 m deep trench has vertical, unsupported sides, spoil heaped at the edge and no barriers.",
    category: CATEGORIES.EXCAVATION,
    action: ACTIONS.SHORE_EXCAVATION,
    categoryDecoys: [CATEGORIES.HEIGHT, CATEGORIES.HOUSEKEEPING, CATEGORIES.STRUCK],
    actionDecoys: [ACTIONS.DEEPEN_EXCAVATION, ACTIONS.SIGN_THE_ROUTE, ACTIONS.CARRY_ON_WATCH],
    lesson: "Any excavation over about 1.2 m needs shoring or battering. Collapses happen without warning and a cubic metre of soil weighs over a tonne.",
    place: { x: 18, y: 0, z: 22, radius: 5.6, eyeY: 1.4 },
  },
  {
    id: "hoist-overload",
    title: "Overloaded material hoist",
    detail: "The hoist cage is loaded well above its rated capacity, with material stacked above the cage rail.",
    category: CATEGORIES.OVERLOAD,
    action: ACTIONS.OFFLOAD_TO_SWL,
    categoryDecoys: [CATEGORIES.LIFTING, CATEGORIES.STRUCK, CATEGORIES.SCAFFOLD],
    actionDecoys: [ACTIONS.EXCLUSION_ZONE, ACTIONS.CARRY_ON_WATCH, ACTIONS.TELL_SUPERVISOR_LATER],
    lesson: "Every hoist has a marked safe working load. Overloading risks a structural or brake failure with the load over people below.",
    place: { x: 2.2, y: 0, z: 10, radius: 4.2, eyeY: 1.6 },
  },
];

/* --------------------------- option builders --------------------------- */

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Builds the identification options for a hazard: the correct category
 * plus three decoys, shuffled, each tagged with whether it is correct.
 */
export function categoryOptions(hazard) {
  const decoys = hazard.categoryDecoys.slice(0, 3);
  return shuffle([
    { id: "correct", label: hazard.category, correct: true },
    ...decoys.map((d, i) => ({ id: `d${i}`, label: d, correct: false })),
  ]);
}

export function actionOptions(hazard) {
  const decoys = hazard.actionDecoys.slice(0, 3);
  return shuffle([
    { id: "correct", label: hazard.action, correct: true },
    ...decoys.map((d, i) => ({ id: `d${i}`, label: d, correct: false })),
  ]);
}

/* ------------------------------- scoring ------------------------------- */

export const SCORING = {
  identify: 100,
  action: 150,
  wrong: -50,
  allHazardsBonus: 500,
  completionBonus: 300,
  timeBonusPerSecond: 3,
};
