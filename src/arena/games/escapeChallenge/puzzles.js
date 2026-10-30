/* ------------------------------------------------------------------ *
 *  GAME 4 — SAFETY ESCAPE CHALLENGE
 *  Room puzzles
 *
 *  One real safety decision per area. Every wrong option is a mistake
 *  people genuinely make on site, and the consequence text says plainly
 *  what would have happened — the game never rewards an unsafe choice,
 *  and never dramatises a dangerous action as heroic.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 *  FIVE areas, each teaching something the other four do not.
 *
 *  Two were removed because they were not pulling their weight:
 *
 *   - "Basement" asked which of three openings was the escape route,
 *     which is the same judgement the scaffold tag and the alarm areas
 *     already cover, and it was the weakest of the three.
 *   - "Stores" asked the player to spot the one wrong thing in a room.
 *     That is now the entire mechanic of Game 3, Spot the Hazards, so
 *     keeping it here made two of the five missions feel like the same
 *     game.
 * ------------------------------------------------------------------ */

export const PUZZLES = {
  electrical: {
    area: "Electrical room",
    eyebrow: "AREA 1 OF 5 — ELECTRICAL ROOM",
    title: "The door ahead is powered and the frame is live. How do you make it safe?",
    subtitle:
      "There is a distribution board, a local isolator for the door circuit, and an emergency lighting inverter.",
    options: [
      {
        id: "isolate",
        label: "Isolate the door circuit at its local isolator, lock off and tag it, then prove dead",
        desc: "Lock-off, tag-out, test before touching",
        correct: true,
        feedback: "Correct. Isolate, lock off, tag, then prove dead with an approved tester. Only then is it safe to work on.",
      },
      {
        id: "main",
        label: "Pull the main incoming switch for the whole building",
        desc: "Kills everything, including the emergency lighting",
        feedback: "That also kills the emergency lighting and the fire alarm, in a smoke-filled building. Isolate the circuit you need, not the whole supply.",
        consequence: "You are now in complete darkness.",
      },
      {
        id: "glove",
        label: "Use insulated gloves and work on it live",
        desc: "Faster, and the gloves are rated",
        feedback: "Live working is only permitted in very limited, specifically justified circumstances. This is not one of them.",
        consequence: "An arc flash across the frame.",
      },
      {
        id: "tape",
        label: "Tape over the live frame and carry on",
        desc: "It stops accidental contact",
        feedback: "Tape is not insulation and not isolation. The circuit is still live behind it.",
        consequence: "The tape does nothing.",
      },
    ],
  },

  ppe: {
    area: "Construction floor",
    eyebrow: "AREA 2 OF 5 — CONSTRUCTION FLOOR",
    title: "Beyond this door is an open floor with overhead work. What do you take from the PPE store?",
    subtitle:
      "You must cross an unfinished floor with a leading edge, and there is a crane lifting above it.",
    options: [
      {
        id: "full",
        label: "Helmet, hi-vis, safety boots, gloves and a full body harness with lanyard",
        desc: "Head protection, visibility, and fall arrest for the leading edge",
        correct: true,
        feedback: "Correct. Overhead work needs head protection, the leading edge needs fall arrest, and the crane operator needs to see you.",
      },
      {
        id: "helmetonly",
        label: "Just the helmet — you will not be there long",
        desc: "Quickest option",
        feedback: "Exposure time does not change the hazard. The leading edge is still a fall and the crane still cannot see you.",
        consequence: "Unprotected at an open edge.",
      },
      {
        id: "goggles",
        label: "Goggles, ear defenders and a dust mask",
        desc: "Full respiratory and hearing protection",
        feedback: "Good PPE — for the wrong hazards. Nothing here protects you from a fall or a falling object.",
        consequence: "No fall protection, no head protection.",
      },
      {
        id: "harness",
        label: "The harness on its own, no helmet",
        desc: "Fall protection is the big risk",
        feedback: "Fall arrest is right, but there is active lifting overhead. Head protection is not optional.",
        consequence: "Nothing above your head.",
      },
    ],
  },

  fire: {
    area: "Plant room",
    eyebrow: "AREA 3 OF 5 — PLANT ROOM",
    title: "A switchgear cabinet is alight and blocking the route. Which extinguisher?",
    subtitle:
      "On the wall: water, foam, CO2 and a wet chemical extinguisher. The fire is small and the route beyond is clear.",
    options: [
      {
        id: "co2",
        label: "CO2 — then get out and raise the alarm",
        desc: "Non-conductive, leaves no residue on electrical equipment",
        correct: true,
        feedback: "Correct. CO2 is the right medium for live electrical equipment. Only tackle a small fire if your escape route stays behind you.",
      },
      {
        id: "water",
        label: "Water — it is the biggest one",
        desc: "Red, 9 litres",
        feedback: "Water conducts. On live electrical equipment it would put the current through you and the jet.",
        consequence: "Electric shock through the water jet.",
      },
      {
        id: "foam",
        label: "Foam — it smothers the fire",
        desc: "Cream label",
        feedback: "Foam is water-based and also conducts. It is for flammable liquids, not live electrics.",
        consequence: "A conductive path to the cabinet.",
      },
      {
        id: "wet",
        label: "Wet chemical — the specialist one",
        desc: "Yellow label",
        feedback: "Wet chemical is for cooking oils and fats. Wrong class entirely.",
        consequence: "No effect on the fire.",
      },
    ],
  },

  signage: {
    area: "Scaffold area",
    eyebrow: "AREA 4 OF 5 — SCAFFOLD ACCESS",
    title: "The scaffold tag at the access point is red. What does that mean you do?",
    subtitle:
      "A red scaffold tag hangs at the foot of the ladder. The route through the scaffold is the short way to the exit.",
    options: [
      {
        id: "dontuse",
        label: "Do not use the scaffold — take the longer route at ground level",
        desc: "A red tag means the scaffold is incomplete or unsafe and is not handed over",
        correct: true,
        feedback: "Correct. A red tag means do not use. An unhandedover scaffold is not a shortcut, even in an evacuation.",
      },
      {
        id: "quick",
        label: "Use it anyway — it is an emergency and the route is shorter",
        desc: "Saves two minutes",
        feedback: "A red-tagged scaffold may be missing boards, ties or guardrails. Using it in poor visibility is how an evacuation becomes a fatality.",
        consequence: "A part-boarded platform in smoke.",
      },
      {
        id: "flip",
        label: "Turn the tag to green and then use it",
        desc: "The tag is just a card",
        feedback: "Only a competent person who has inspected the scaffold can change that tag. Falsifying it endangers everyone who follows.",
        consequence: "A falsified inspection record.",
      },
      {
        id: "climb",
        label: "Climb the outside of the frame to avoid the bad platform",
        desc: "Avoids the boards entirely",
        feedback: "Climbing a scaffold frame is never an access method. The access is the ladder, when the scaffold is fit to use.",
        consequence: "A free climb at height.",
      },
    ],
  },

  alarm: {
    area: "Exit lobby",
    eyebrow: "AREA 5 OF 5 — EXIT LOBBY",
    title: "You can see the final exit. What do you do before you go through it?",
    subtitle:
      "There is a break-glass call point beside the door, a fire extinguisher, and the signed muster point is across the yard.",
    options: [
      {
        id: "raise",
        label: "Raise the alarm at the call point, then leave and go to the muster point",
        desc: "Warns everyone still inside, then accounts for you at the muster",
        correct: true,
        feedback: "Correct. Raising the alarm protects everyone still inside, and going to the muster point is how the roll call knows you are out.",
      },
      {
        id: "leave",
        label: "Just get out — someone else will have raised it",
        desc: "Fastest way out",
        feedback: "Assuming someone else has raised the alarm is how buildings get evacuated too late. Raise it yourself.",
        consequence: "Nobody else has been warned.",
      },
      {
        id: "goback",
        label: "Go back and look for anyone still inside",
        desc: "Nobody left behind",
        feedback: "Re-entering a smoke-filled building is for trained, equipped fire crews. Report who is missing at the muster point — do not become a second casualty.",
        consequence: "Re-entering unprotected.",
      },
      {
        id: "carpark",
        label: "Leave and drive home to be safe",
        desc: "Out of the area entirely",
        feedback: "If you are not at the muster point, the roll call records you as missing and crews will search the building for you.",
        consequence: "Search teams sent in for you.",
      },
    ],
  },
};

export const SCORING = {
  firstTry: 250,
  afterMistake: 120,
  wrong: -60,
  wrongTimePenaltyMs: 25000,
  escaped: 600,
  timeBonusPerSecond: 3,
};

export const AREA_ORDER = ["electrical", "ppe", "fire", "signage", "alarm"];
