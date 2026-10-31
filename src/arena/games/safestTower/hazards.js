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
      "Install guardrails with toe boards to both crests, batter or shore the faces, and set the spoil back from the edge",
      "Put a 'DEEP EXCAVATION — KEEP CLEAR' sign at each end",
      "Run hazard tape between two cones around the opening",
      "Lay scaffold boards across the trench so people can walk over it",
    ],
    correct: 0,
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
      "Isolate it, take the damaged lead out of service, and re-run a tested 110 V supply through an RCD, clear of the water",
      "Wrap the split properly in fresh insulating tape and carry on",
      "Lay a scaffold board over the puddle so the lead stays dry",
      "Put an 'ELECTRICAL HAZARD' sign next to the puddle",
    ],
    correct: 0,
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
      "Upright and chained in a ventilated cage, valve caps on, oxygen separated from fuel gas, away from the hut and any ignition source",
      "Stand them up against the hut wall and leave them there",
      "Cover them with a tarpaulin so they are out of the sun",
      "Put a 'NO SMOKING — COMPRESSED GAS' sign on the hut",
    ],
    correct: 0,
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
      "Break the stack down to a stable height on level ground and move it clear, keeping the escape route free",
      "Band the stack and leave it where it is",
      "Paint a new escape route around the stack",
      "Put a 'MIND THE STACK' sign on the top pallet",
    ],
    correct: 0,
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
      "Pitch it at 75° (one out, four up), tie it at the stiles, and extend it a metre above the landing",
      "Have a labourer stand and foot the ladder whenever it is used",
      "Move it onto a scaffold board so the feet do not sink",
      "Put a 'LADDER — USE THREE POINTS OF CONTACT' sign at the bottom",
    ],
    correct: 0,
    control: "engineer",
    why:
      "A ladder is tied, pitched 1:4, and taken a metre past the landing so there is something to "
      + "hold while stepping off. Footing a ladder is a last resort for short duration work only — it "
      + "does nothing about the pitch and it puts a second person under the hazard.",
    toast: "Tied, pitched at 1:4, and extended past the landing.",
  },
];

export const HAZARD_COUNT = HAZARDS.length;

export function hazardById(id) {
  return HAZARDS.find((h) => h.id === id) || null;
}
