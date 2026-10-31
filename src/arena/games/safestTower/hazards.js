/* ------------------------------------------------------------------ *
 *  GAME 3 — SPOT THE HAZARDS (ground level)
 *
 *  Five real ground-level hazards around the Casagrand Aria compound.
 *  The player inspects each one and chooses the control that actually
 *  removes the risk.
 *
 *  Every hazard's wrong answers are deliberately *plausible* site
 *  practice — a sign, some tape, a board over the problem. They are the
 *  things people really do instead of fixing it, which is the lesson:
 *  warning somebody about a hazard is not the same as controlling it.
 *
 *  This file is pure data (no THREE), so the hazard set is testable and
 *  can be reviewed by a safety officer without reading any 3D code.
 * ------------------------------------------------------------------ */

export const SCORING = {
  solvedFirstTry: 1200,
  solvedAfterMiss: 600,
  wrongAnswer: -150,
  allSolved: 2000,
  accuracyMax: 2000,
  timeBonusPerSecond: 3,
};

/** The control hierarchy, used in the debrief. */
export const HIERARCHY = {
  eliminate: "Eliminate",
  engineer: "Engineering control",
  admin: "Administrative control",
  ppe: "PPE",
};

export const HAZARDS = [
  {
    id: "excavation",
    kind: "excavation",
    title: "Open excavation, no edge protection",
    // Where the hazard object sits in the compound.
    at: { x: -11, z: 6 },
    rotY: 0,
    brief:
      "A 2.2 m service trench has been dug across the compound and left open. There is nothing "
      + "along either crest, and the spoil is heaped right up to the edge.",
    question: "What is the correct control for this excavation?",
    options: [
      "Put a sign reading DEEP EXCAVATION — KEEP CLEAR at each end of it",
      "Run hazard tape between cones all the way around the opening",
      "Guardrail both crests, shore the faces, and set the spoil back",
      "Lay scaffold boards across the trench so people can walk over it",
    ],
    correct: 2,
    control: "engineer",
    why:
      "A trench this deep needs physical edge protection and support to the faces. Signs and tape "
      + "tell someone a hole is there; they do not stop them, or a tonne of spoil, going into it. "
      + "Spoil heaped at the crest is surcharge — it is what makes the face collapse.",
    toast: "Edge protection, support and the spoil set back.",
  },

  {
    id: "electrical",
    kind: "electrical",
    title: "Damaged lead through standing water",
    at: { x: 9, z: 11 },
    rotY: -0.4,
    brief:
      "A 240 V extension lead runs from the hut to a cut-off saw. The outer sheath is split and "
      + "taped, and the whole run lies through a puddle that has not drained since the last rain.",
    question: "What do you do about this lead?",
    options: [
      "Wrap the split properly in fresh insulating tape and carry on working",
      "Isolate it, take it out of service, and re-run a tested 110 V supply",
      "Lay a scaffold board over the puddle so that the lead stays dry",
      "Put a sign reading ELECTRICAL HAZARD next to the puddle",
    ],
    correct: 1,
    control: "eliminate",
    why:
      "A damaged lead is quarantined, not repaired with tape — taped joints are not a repair and "
      + "fail the next inspection anyway. On a construction site the supply should be 110 V centre-tapped "
      + "through an RCD, and no cable run should sit in water.",
    toast: "Isolated, removed from service, re-run on 110 V through an RCD.",
  },

  {
    id: "cylinders",
    kind: "cylinders",
    title: "Gas cylinders lying loose beside the hut",
    at: { x: 15, z: -8 },
    rotY: 0.6,
    brief:
      "Oxygen and propane cylinders are lying on their sides against the side of the canteen hut, "
      + "unsecured, with no caps fitted and no separation between fuel gas and oxidiser.",
    question: "How should these cylinders be stored?",
    options: [
      "Stand them upright against the hut wall and leave them there",
      "Cover them over with a tarpaulin so they are out of the sun",
      "Put a NO SMOKING — COMPRESSED GAS sign on the side of the hut",
      "Upright and chained in a vented cage, capped, oxygen away from fuel gas",
    ],
    correct: 3,
    control: "engineer",
    why:
      "Cylinders are stored upright and restrained so the valve cannot be knocked off — a loose "
      + "cylinder that loses its valve becomes a projectile. Oxygen and fuel gas must be separated, "
      + "and a tarpaulin makes it worse by trapping any leak instead of letting it disperse.",
    toast: "Upright, chained, capped, separated and ventilated.",
  },

  {
    id: "stacking",
    kind: "stacking",
    title: "Material stacked across the escape route",
    at: { x: -4, z: -13 },
    rotY: 0.25,
    brief:
      "Blockwork pallets have been stacked four high, unbanded and leaning, directly across the "
      + "marked escape route from the compound to the muster point.",
    question: "What is the right action here?",
    options: [
      "Band the stack together and leave it standing where it is",
      "Break the stack down to a safe height and move it off the route",
      "Paint a new escape route that goes around the stack",
      "Put a sign reading MIND THE STACK on the top pallet",
    ],
    correct: 1,
    control: "eliminate",
    why:
      "Two faults, one action. The stack is unstable, and it blocks the only escape route — which "
      + "matters most at exactly the moment nobody can see. An escape route is kept clear; it is not "
      + "re-routed around whatever happens to be in the way.",
    toast: "Restacked at a safe height, escape route clear.",
  },

  {
    id: "ladder",
    kind: "ladder",
    title: "Untied ladder at the wrong angle",
    at: { x: 4, z: 14 },
    rotY: Math.PI,
    brief:
      "A leaning ladder gives access to the scaffold lift. It is pitched far too shallow, it is not "
      + "tied at the stiles, and it finishes level with the platform with nothing to hold.",
    question: "What does this ladder access need?",
    options: [
      "Have a labourer stand and foot the ladder whenever it is used",
      "Move it onto a scaffold board so that the feet cannot sink in",
      "Pitch it one out to four up, tie the stiles, take it past the landing",
      "Put a LADDER — USE THREE POINTS OF CONTACT sign at the bottom",
    ],
    correct: 2,
    control: "engineer",
    why:
      "A ladder is tied, pitched 1:4, and taken a metre past the landing so there is something to "
      + "hold while stepping off. Footing a ladder is a last resort for short duration work only — it "
      + "does nothing about the pitch and it puts a second person under the hazard.",
    toast: "Tied, pitched at 1:4, and extended past the landing.",
  },

  {
    id: "floor-opening",
    kind: "opening",
    title: "Floor opening with no cover or barrier",
    at: { x: -16, z: -6 },
    rotY: 0.3,
    brief:
      "A 1.2 m square riser opening has been formed in the slab and left completely open. There "
      + "is no cover, no barrier, and nothing marking it. The drop is two storeys.",
    question: "What is the correct control for this opening?",
    options: [
      "Hang bunting around the opening so people can see where it is",
      "Fit a fixed cover that cannot be lifted out, marked to say what is under it",
      "Stand a sign beside it reading 'OPEN RISER — DO NOT STEP'",
      "Lay a sheet of ply loosely over the hole to stop anyone dropping through",
    ],
    correct: 1,
    control: "engineer",
    why:
      "An opening is covered with something secured and marked, or guarded with a fixed edge "
      + "protection. Loose ply is worse than nothing: it hides the hole and moves when somebody "
      + "steps on it. Bunting and signs do not hold a person's weight.",
    toast: "Covered with a secured, marked cover.",
  },

  {
    id: "edge",
    kind: "edge",
    title: "Unprotected leading edge",
    at: { x: 14, z: 2 },
    rotY: -0.5,
    brief:
      "The slab edge on this elevation has no guardrail. Materials are stacked within a metre of "
      + "it and two operatives are working along it.",
    question: "What does this edge need?",
    options: [
      "A double guardrail and toe board fixed along the full open edge",
      "A line of cones and hazard tape set back a metre from the edge",
      "Harnesses for the two operatives working along the edge",
      "A sign at each end of the elevation warning of the open edge",
    ],
    correct: 0,
    control: "engineer",
    why:
      "Edge protection comes first: it protects everybody who comes near, without them having to "
      + "do anything. Harnesses protect one person who clips on correctly, every time, and are "
      + "the last resort, not the first. Tape stops nobody and nothing.",
    toast: "Double guardrail and toe board fixed to the edge.",
  },

  {
    id: "housekeeping",
    kind: "housekeeping",
    title: "Offcuts and nails across the walkway",
    at: { x: -8, z: 17 },
    rotY: 1.1,
    brief:
      "Timber offcuts with nails still in them, banding, and broken block are spread across the "
      + "walkway between the gate and the stair core. People are stepping over it all day.",
    question: "How is this dealt with?",
    options: [
      "Put a 'MIND YOUR STEP' board at each end of the walkway",
      "Sweep it to the sides so there is a clear path down the middle",
      "Clear it now, de-nail the timber, and put a daily clear-up in place",
      "Issue the people using the walkway with midsole-protected boots",
    ],
    correct: 2,
    control: "eliminate",
    why:
      "Housekeeping is the one hazard that is ALWAYS removable, so it is always removed. Nails "
      + "are turned over or pulled the moment timber is struck. Sweeping it aside leaves it there, "
      + "and PPE is what protects you from what is left after you have cleared everything you can.",
    toast: "Cleared, de-nailed, and a daily clear-up in place.",
  },

  {
    id: "spill",
    kind: "spill",
    title: "Oil spill across the plant route",
    at: { x: 18, z: -14 },
    rotY: 2.1,
    brief:
      "Hydraulic oil has leaked from a telehandler across the plant route and spread into the "
      + "pedestrian walkway beside it. It is already tracked out in both directions.",
    question: "What is the correct response to this spill?",
    options: [
      "Cone the spill off and let it dry out on its own over the day",
      "Absorb it with granules, bag it as contaminated waste, fix the leak",
      "Hose the area down so the oil is washed off the route",
      "Cover the spill with sand and let traffic run over it",
    ],
    correct: 1,
    control: "eliminate",
    why:
      "A spill is absorbed, collected and disposed of, and the thing that caused it is repaired — "
      + "otherwise it is back tomorrow. Hosing it moves it into the drains, which is a pollution "
      + "offence, and sand just spreads a slippery layer further.",
    toast: "Absorbed, collected, and the leak booked in for repair.",
  },

  {
    id: "access",
    kind: "access",
    title: "Fire exit blocked by materials",
    at: { x: 6, z: -17 },
    rotY: -2.4,
    brief:
      "Plasterboard packs and a pallet of adhesive have been unloaded directly in front of the "
      + "final fire exit from the stair core. The door opens outwards into them.",
    question: "What is the right action here?",
    options: [
      "Mark a route around the materials so people can still reach the exit",
      "Move the packs now and keep the exit and its route permanently clear and marked",
      "Leave them but make sure the door can still be pushed open far enough to get out",
      "Put a notice on the door telling people to use the other stair in an emergency",
    ],
    correct: 1,
    control: "eliminate",
    why:
      "A fire exit is kept clear, full stop. Everything else here assumes people will read, think "
      + "and navigate — in smoke, in the dark, in a hurry. They will not. They will go the way they "
      + "always go, and find it blocked.",
    toast: "Exit cleared and the route marked and kept clear.",
  },
];

export const HAZARD_COUNT = HAZARDS.length;

export function hazardById(id) {
  return HAZARDS.find((h) => h.id === id) || null;
}
