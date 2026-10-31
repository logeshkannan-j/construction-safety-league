/* ------------------------------------------------------------------ *
 *  GAME 2 — LIFTING INTERRUPTS
 *
 *  A lift is not a transport puzzle. The thing that actually kills
 *  people on a crane is what happens AROUND the load while it is in
 *  the air, so these are the five situations that stop the lift dead
 *  and make the operator deal with them before anything else moves.
 *
 *  Each one: the crane halts, the hazard is highlighted, and the
 *  operator has to choose the control that resolves it. The lift does
 *  not resume until they do.
 *
 *  The wrong answers are deliberately things crane crews really say.
 *  "Swing it round quickly before he looks up", "tell him to move",
 *  "take it slowly" — all of them keep the load in the air over the
 *  problem, which is the lesson: you land the load or you stop. You do
 *  not negotiate with a suspended load.
 *
 *  Pure data, no THREE, so the set can be reviewed by a safety officer
 *  without reading any 3D code, and tested without a renderer.
 * ------------------------------------------------------------------ */

export const INTERRUPT_SCORING = {
  resolvedFirstTry: 500,
  resolvedAfterMiss: 200,
  wrongAnswer: -200,
  allResolved: 800,
};

export const INTERRUPTS = [
  {
    id: "rigging",
    title: "Stop — check the rigging",
    /** What the player is shown before the question. */
    warning:
      "The bundle is choked with a single sling at its centre. It is 3.2 m long, it is already "
      + "tilting, and nothing is stopping it rotating once it leaves the ground.",
    question: "What do you do before this load leaves the ground?",
    options: [
      "Lift it just clear of the ground, let it settle, and then carry on with the lift",
      "Set the load down, re-rig it on two legs and fit a tagline before lifting",
      "Lift it slowly and have the banksman steady it by hand as it comes clear",
      "Keep the load low the whole way across, so anything slipping cannot fall far",
    ],
    correct: 1,
    why:
      "A single choker on a long bundle lets it rotate and slide out. It is re-rigged on the "
      + "ground, not corrected in the air, and nobody steadies a load by hand — that is how "
      + "hands go between the load and the structure. A tagline is held from outside the zone.",
    toast: "Re-rigged on two legs with a tagline fitted.",
  },

  {
    id: "person-under-load",
    title: "STOP — a person is under the load",
    warning:
      "A worker has walked into the exclusion zone and is directly beneath the suspended bundle. "
      + "He has not looked up and cannot hear you over the plant.",
    question: "The load is in the air and a man is under it. What is the FIRST thing you do?",
    options: [
      "Slew away from him, so that the load is no longer hanging over his head",
      "Sound the horn and keep going once he has looked up and moved himself",
      "Stop everything and have him walked out of the zone before moving again",
      "Land the load on the nearest clear slab, straight down, out of his way",
    ],
    correct: 2,
    why:
      "You stop. Moving the load — in any direction — while somebody is underneath it puts the "
      + "swing somewhere you cannot predict, and a horn makes people look UP, not move. The zone "
      + "is cleared by a person on the ground, then the lift continues.",
    toast: "All motion stopped and the zone cleared on the ground.",
  },

  {
    id: "no-barricade",
    title: "Stop — the landing area is open",
    warning:
      "The slab you are landing on has no barricade and no banksman. Two operatives are working "
      + "within a few metres of where this bundle is going to touch down.",
    question: "The landing area is not controlled. What is the correct action?",
    options: [
      "Land it on the far corner of the slab, as far from the two operatives as it will go",
      "Ask the two operatives to keep an eye on the load while you bring it down",
      "Hold the load clear until the area is barricaded and a banksman posted there",
      "Bring it down very slowly, so that anybody nearby has time to see it and move",
    ],
    correct: 2,
    why:
      "A landing area is controlled BEFORE the load arrives, not while it is overhead. Slower, "
      + "further away, or asking people to watch out are all the same answer: the load is still "
      + "coming down into an uncontrolled area.",
    toast: "Landing area barricaded and a banksman posted.",
  },

  {
    id: "swing",
    title: "Stop — the load is swinging",
    warning:
      "The bundle has picked up a swing well beyond its footprint. Every slew input is making it "
      + "worse, and it is heading towards the scaffold.",
    question: "The load is swinging badly. How do you bring it back under control?",
    options: [
      "Slew against the swing, timing it so that the two cancel each other out",
      "Stop the slew, let the swing damp out, then start moving again gently",
      "Hoist up quickly, because a shorter rope swings through a smaller arc",
      "Carry on to the landing and let the load settle once it is on the slab",
    ],
    correct: 1,
    why:
      "A swinging load is a pendulum. Chasing it with the slew pumps energy in — which is exactly "
      + "how people cancel a swing in a car park and exactly why loads hit scaffolds. You stop, "
      + "you wait, you start again smoothly.",
    toast: "Motion stopped and the swing allowed to damp out.",
  },

  {
    id: "unsafe-instruction",
    title: "Radio — an unsafe instruction",
    warning:
      "The site manager calls up: \"Take it straight across over the canteen, it is quicker than "
      + "going round, nobody is out there at this time.\"",
    question: "You have been told to swing the load over an occupied area. What do you do?",
    options: [
      "Take the short route but lift higher, so that the load clears the canteen roof",
      "Check whether anybody is actually in the canteen, and go over if it is empty",
      "Do as you are instructed, because the site manager is responsible for the call",
      "Refuse the lift over the canteen, say why, and take the agreed route round",
    ],
    correct: 3,
    why:
      "The operator has the final say on whether a lift goes ahead and can refuse any lift they "
      + "believe is unsafe. Height does not help — a dropped load does not care. And \"nobody is "
      + "in there\" is a guess about a place people walk into without telling anyone.",
    toast: "Lift refused and the agreed route taken.",
  },
];

export const INTERRUPT_COUNT = INTERRUPTS.length;

export function interruptById(id) {
  return INTERRUPTS.find((i) => i.id === id) || null;
}
