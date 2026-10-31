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
    title: "The door ahead is live. How do you make it safe?",
    subtitle: "There is a main board, a local isolator for the door circuit, and a lighting inverter.",
    options: [
      {
        id: "isolate",
        label: "Lock off the local isolator and prove the frame dead",
        desc: "Lock-off, tag-out, test before touching",
        correct: true,
        feedback: "Correct. Isolate, lock off, tag, then prove dead with an approved tester. Only then is it safe to work on.",
      },
      {
        id: "main",
        label: "Switch the whole main board off at the incomer",
        desc: "Kills everything, including the emergency lighting",
        feedback: "That also kills the emergency lighting and the fire alarm, in a smoke-filled building. Isolate the circuit you need, not the whole supply.",
        consequence: "You are now in complete darkness.",
      },
      {
        id: "glove",
        label: "Pull the fuse out and keep it in your pocket",
        desc: "Faster, and the gloves are rated",
        feedback: "Live working is only permitted in very limited, specifically justified circumstances. This is not one of them.",
        consequence: "An arc flash across the frame.",
      },
      {
        id: "tape",
        label: "Put a sign on the frame telling people not to touch",
        desc: "It stops accidental contact",
        feedback: "Tape is not insulation and not isolation. The circuit is still live behind it.",
        consequence: "The tape does nothing.",
      },
    ],
    ta: {
      title: "முன்னால் உள்ள கதவில் மின்சாரம். எப்படிப் பாதுகாப்பாக்குவீர்கள்?",
      subtitle: "இங்கே ஒரு மெயின் போர்டு, கதவு சர்க்யூட்டுக்கான ஐசோலேட்டர், மற்றும் லைட்டிங் இன்வெர்ட்டர் உள்ளன.",
      options: [
        "கதவு ஐசோலேட்டரை ஆஃப் செய்து பூட்டி, மின்சாரம் இல்லை என உறுதி செய்யவும்",
        "மெயின் போர்டு முழுவதையும் இன்கமரில் ஆஃப் செய்து பூட்டி விடவும்",
        "ஃப்யூஸை கழற்றி உங்கள் பாக்கெட்டில் பத்திரமாக வைத்துக் கொள்ளவும்",
        "'தொடாதீர்கள்' என்று கதவு சட்டத்தில் ஒரு பலகை ஒட்டி வைக்கவும்",
      ],
    },
  },

  ppe: {
    area: "Construction floor",
    eyebrow: "AREA 2 OF 5 — CONSTRUCTION FLOOR",
    title: "Beyond this door is an open floor with work going on above it. What do you take?",
    subtitle: "You have to cross an unfinished floor with an open edge, and a crane is lifting overhead.",
    options: [
      {
        id: "full",
        label: "Helmet, hi-vis, safety boots, gloves and a harness",
        desc: "Head protection, visibility, and fall arrest for the leading edge",
        correct: true,
        feedback: "Correct. Overhead work needs head protection, the leading edge needs fall arrest, and the crane operator needs to see you.",
      },
      {
        id: "helmetonly",
        label: "Just a helmet — you will not be out there long",
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
        label: "A harness on its own, without a helmet",
        desc: "Fall protection is the big risk",
        feedback: "Fall arrest is right, but there is active lifting overhead. Head protection is not optional.",
        consequence: "Nothing above your head.",
      },
    ],
    ta: {
      title: "இந்தக் கதவுக்கு அப்பால் திறந்த தளம், மேலே வேலை நடக்கிறது. எதை எடுப்பீர்கள்?",
      subtitle: "திறந்த விளிம்புள்ள முடிக்கப்படாத தளத்தைக் கடக்க வேண்டும், மேலே கிரேன் பொருட்களைத் தூக்குகிறது.",
      options: [
        "ஹெல்மெட், ஹை-விஸ் ஜாக்கெட், பாதுகாப்பு காலணி, கையுறை, ஹார்னஸ்",
        "ஹெல்மெட் மட்டும் — அங்கே அதிக நேரம் இருக்கப் போவதில்லை",
        "கண்ணாடி, காது அடைப்பான், தூசி முகக்கவசம் மட்டும் போதும்",
        "ஹார்னஸ் மட்டும், ஹெல்மெட் எதுவும் இல்லாமல் போகலாம்",
      ],
    },
  },

  fire: {
    area: "Plant room",
    eyebrow: "AREA 3 OF 5 — PLANT ROOM",
    title: "A switchgear cabinet is on fire and blocking the way. Which extinguisher?",
    subtitle: "On the wall: water, foam, CO2 and wet chemical. The fire is small and the route past it is clear.",
    options: [
      {
        id: "co2",
        label: "CO2 — it does not conduct and leaves no mess",
        desc: "Non-conductive, leaves no residue on electrical equipment",
        correct: true,
        feedback: "Correct. CO2 is the right medium for live electrical equipment. Only tackle a small fire if your escape route stays behind you.",
      },
      {
        id: "water",
        label: "Water — there is plenty of it and the fire is small",
        desc: "Red, 9 litres",
        feedback: "Water conducts. On live electrical equipment it would put the current through you and the jet.",
        consequence: "Electric shock through the water jet.",
      },
      {
        id: "foam",
        label: "Foam — it smothers the fire and cools it down",
        desc: "Cream label",
        feedback: "Foam is water-based and also conducts. It is for flammable liquids, not live electrics.",
        consequence: "A conductive path to the cabinet.",
      },
      {
        id: "wet",
        label: "Wet chemical — it is the newest one on the rack",
        desc: "Yellow label",
        feedback: "Wet chemical is for cooking oils and fats. Wrong class entirely.",
        consequence: "No effect on the fire.",
      },
    ],
    ta: {
      title: "ஸ்விட்ச்கியர் பெட்டியில் தீ, வழியை அடைக்கிறது. எந்த தீயணைப்பான்?",
      subtitle: "சுவரில்: தண்ணீர், நுரை, CO2, வெட் கெமிக்கல். தீ சிறியது, அதற்கு அப்பால் வழி காலியாக உள்ளது.",
      options: [
        "CO2 — மின்சாரத்தைக் கடத்தாது, கறையும் விடாது",
        "தண்ணீர் — நிறைய இருக்கிறது, தீயும் சிறியது",
        "நுரை — தீயை மூடி அணைத்து குளிர்விக்கும்",
        "வெட் கெமிக்கல் — ரேக்கில் உள்ள புதியது",
      ],
    },
  },

  signage: {
    area: "Scaffold area",
    eyebrow: "AREA 4 OF 5 — SCAFFOLD ACCESS",
    title: "The scaffold tag at the ladder is red. What does that mean you do?",
    subtitle: "A red tag hangs at the foot of the ladder. Going through the scaffold is the short way to the exit.",
    options: [
      {
        id: "dontuse",
        label: "Do not use it — find another way out",
        desc: "A red tag means the scaffold is incomplete or unsafe and is not handed over",
        correct: true,
        feedback: "Correct. A red tag means do not use. An unhandedover scaffold is not a shortcut, even in an evacuation.",
      },
      {
        id: "quick",
        label: "Use it carefully, since the tag is only a warning",
        desc: "Saves two minutes",
        feedback: "A red-tagged scaffold may be missing boards, ties or guardrails. Using it in poor visibility is how an evacuation becomes a fatality.",
        consequence: "A part-boarded platform in smoke.",
      },
      {
        id: "flip",
        label: "Turn the tag over to green and then climb it",
        desc: "The tag is just a card",
        feedback: "Only a competent person who has inspected the scaffold can change that tag. Falsifying it endangers everyone who follows.",
        consequence: "A falsified inspection record.",
      },
      {
        id: "climb",
        label: "Use it if somebody holds the bottom of the ladder",
        desc: "Avoids the boards entirely",
        feedback: "Climbing a scaffold frame is never an access method. The access is the ladder, when the scaffold is fit to use.",
        consequence: "A free climb at height.",
      },
    ],
    ta: {
      title: "ஏணியில் உள்ள சாரக்கட்டு டேக் சிவப்பு. அப்படியானால் நீங்கள் என்ன செய்வீர்கள்?",
      subtitle: "ஏணியின் அடியில் சிவப்பு டேக் தொங்குகிறது. சாரக்கட்டு வழியாகப் போவதுதான் வெளியேறும் குறுக்கு வழி.",
      options: [
        "பயன்படுத்தக் கூடாது — வேறு வழியைத் தேட வேண்டும்",
        "டேக் ஒரு எச்சரிக்கை மட்டுமே, கவனமாகப் பயன்படுத்தலாம்",
        "டேக்கைத் திருப்பி பச்சையாக்கிவிட்டு ஏற வேண்டும்",
        "யாராவது அடியில் பிடித்தால் பயன்படுத்தலாம்",
      ],
    },
  },

  alarm: {
    area: "Exit lobby",
    eyebrow: "AREA 5 OF 5 — EXIT LOBBY",
    title: "You can see the final exit. What do you do before you go through it?",
    subtitle: "There is a break-glass call point by the door, an extinguisher, and the muster point is across the yard.",
    options: [
      {
        id: "raise",
        label: "Hit the call point, then go to the muster point",
        desc: "Warns everyone still inside, then accounts for you at the muster",
        correct: true,
        feedback: "Correct. Raising the alarm protects everyone still inside, and going to the muster point is how the roll call knows you are out.",
      },
      {
        id: "leave",
        label: "Go straight out — you are nearly clear of it now",
        desc: "Fastest way out",
        feedback: "Assuming someone else has raised the alarm is how buildings get evacuated too late. Raise it yourself.",
        consequence: "Nobody else has been warned.",
      },
      {
        id: "goback",
        label: "Take the extinguisher with you in case you need it",
        desc: "Nobody left behind",
        feedback: "Re-entering a smoke-filled building is for trained, equipped fire crews. Report who is missing at the muster point — do not become a second casualty.",
        consequence: "Re-entering unprotected.",
      },
      {
        id: "carpark",
        label: "Go back and check that everybody else is out",
        desc: "Out of the area entirely",
        feedback: "If you are not at the muster point, the roll call records you as missing and crews will search the building for you.",
        consequence: "Search teams sent in for you.",
      },
    ],
    ta: {
      title: "கடைசி வெளியேறும் வழி தெரிகிறது. அதன் வழியாகப் போகும் முன் என்ன செய்வீர்கள்?",
      subtitle: "கதவு அருகில் அலாரம் பட்டன், ஒரு தீயணைப்பான், மற்றும் முற்றத்திற்கு அப்பால் ஒன்றுகூடும் இடம் உள்ளது.",
      options: [
        "அலாரம் பட்டனை அழுத்திவிட்டு ஒன்றுகூடும் இடத்திற்குச் செல்லவும்",
        "நேராக வெளியே போகவும் — ஏறக்குறைய வெளியே வந்துவிட்டீர்கள்",
        "தேவைப்படலாம் என்பதால் தீயணைப்பானை எடுத்துச் செல்லவும்",
        "மற்ற அனைவரும் வெளியே வந்துவிட்டார்களா எனத் திரும்பிப் பார்க்கவும்",
      ],
    },
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
