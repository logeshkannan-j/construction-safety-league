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
    warning: "The bundle is slung with a single choker at its middle. It is 3.2 m long, already tilting, and nothing stops it turning once it is off the ground.",
    question: "What do you do before this load leaves the ground?",
    options: [
      "Lift it just clear, let it settle, and then carry on",
      "Set it down and re-rig it on two legs with a tagline",
      "Lift slowly and let the banksman steady it by hand",
      "Keep it low the whole way so a slip cannot fall far",
    ],
    correct: 1,
    why:
      "A single choker on a long bundle lets it rotate and slide out. It is re-rigged on the "
      + "ground, not corrected in the air, and nobody steadies a load by hand — that is how "
      + "hands go between the load and the structure. A tagline is held from outside the zone.",
    toast: "Re-rigged on two legs with a tagline fitted.",
    ta: {
      title: "நிறுத்து — கட்டை சரிபாருங்கள்",
      warning: "3.2 மீட்டர் நீளமான இந்தக் கட்டு நடுவில் ஒரே ஸ்லிங்கில் தொங்குகிறது. ஏற்கனவே சாய்ந்துள்ளது, தரையை விட்டால் சுழல்வதைத் தடுக்க எதுவும் இல்லை.",
      question: "இந்தச் சுமை தரையை விட்டு எழும் முன் என்ன செய்வீர்கள்?",
      options: [
        "சற்றே தூக்கி, நிலைபெறட்டும், பிறகு தொடரவும்",
        "கீழே இறக்கி, இரண்டு ஸ்லிங்கில் மீண்டும் கட்டி டேக்லைன் போடவும்",
        "மெதுவாகத் தூக்கி, பேங்க்ஸ்மேன் கையால் பிடிக்கட்டும்",
        "தாழ்வாகவே கொண்டு செல்லவும், விழுந்தாலும் தூரம் குறைவு",
      ],
    },
  },

  {
    id: "person-under-load",
    title: "STOP — a man is under the load",
    warning: "A worker has walked into the exclusion zone and is standing directly under the bundle. He has not looked up and cannot hear you over the plant.",
    question: "A man is under a load in the air. What do you do FIRST?",
    options: [
      "Slew away so the load is no longer over his head",
      "Sound the horn and carry on once he has moved away",
      "Stop everything and have him walked out of the zone",
      "Land it on the nearest clear slab, well out of his way",
    ],
    correct: 2,
    why:
      "You stop. Moving the load — in any direction — while somebody is underneath it puts the "
      + "swing somewhere you cannot predict, and a horn makes people look UP, not move. The zone "
      + "is cleared by a person on the ground, then the lift continues.",
    toast: "All motion stopped and the zone cleared on the ground.",
    ta: {
      title: "நிறுத்து — சுமைக்குக் கீழே ஒருவர்",
      warning: "ஒரு தொழிலாளி தடைசெய்யப்பட்ட பகுதிக்குள் வந்து சுமைக்கு நேராகக் கீழே நிற்கிறார். அவர் மேலே பார்க்கவில்லை, இயந்திர ஒலியில் உங்கள் குரலும் கேட்காது.",
      question: "காற்றில் உள்ள சுமைக்குக் கீழே ஒருவர். முதலில் என்ன செய்வீர்கள்?",
      options: [
        "அவர் தலைக்கு மேல் இல்லாதபடி சுமையை வேறு பக்கம் திருப்பவும்",
        "ஹாரன் அடித்து, அவர் நகர்ந்ததும் வேலையைத் தொடரவும்",
        "அனைத்தையும் நிறுத்தி அவரை வெளியே அழைக்கச் சொல்லவும்",
        "அருகில் உள்ள காலி தளத்தில் உடனடியாக இறக்கிவிடவும்",
      ],
    },
  },

  {
    id: "no-barricade",
    title: "Stop — the landing area is open",
    warning: "The slab you are landing on has no barrier and no banksman. Two men are working a few metres from where this bundle will touch down.",
    question: "The landing area is not controlled. What is right?",
    options: [
      "Land on the far corner, well away from the two men",
      "Ask the two men to watch the load as it comes down",
      "Hold it clear until the area is barriered and manned",
      "Bring it down very slowly so people have time to move",
    ],
    correct: 2,
    why:
      "A landing area is controlled BEFORE the load arrives, not while it is overhead. Slower, "
      + "further away, or asking people to watch out are all the same answer: the load is still "
      + "coming down into an uncontrolled area.",
    toast: "Landing area barricaded and a banksman posted.",
    ta: {
      title: "நிறுத்து — இறக்கும் இடம் திறந்திருக்கிறது",
      warning: "நீங்கள் இறக்கப் போகும் தளத்தில் தடுப்போ பேங்க்ஸ்மேனோ இல்லை. சுமை இறங்கும் இடத்திலிருந்து சில மீட்டரில் இருவர் வேலை செய்கிறார்கள்.",
      question: "இறக்கும் இடம் கட்டுப்பாட்டில் இல்லை. எது சரி?",
      options: [
        "இருவரிடமிருந்து விலகி, தூரமான மூலையில் இறக்கவும்",
        "சுமை இறங்கும் போது கவனிக்கச் சொல்லி இருவரிடம் கேட்கவும்",
        "தடுப்பும் ஆளும் வரும் வரை சுமையைக் காற்றிலேயே வைக்கவும்",
        "மிக மெதுவாக இறக்கவும், நகர நேரம் கிடைக்கும்",
      ],
    },
  },

  {
    id: "swing",
    title: "Stop — the load is swinging",
    warning: "The bundle has picked up a swing well past its own width. Every slew input is making it worse, and it is heading for the scaffold.",
    question: "The load is swinging badly. How do you get it back?",
    options: [
      "Slew against the swing, timed so as to cancel it out",
      "Stop, let the swing die down, then start again gently",
      "Hoist up fast, because a shorter rope swings less far",
      "Carry on and let it settle once it is down on the slab",
    ],
    correct: 1,
    why:
      "A swinging load is a pendulum. Chasing it with the slew pumps energy in — which is exactly "
      + "how people cancel a swing in a car park and exactly why loads hit scaffolds. You stop, "
      + "you wait, you start again smoothly.",
    toast: "Motion stopped and the swing allowed to damp out.",
    ta: {
      title: "நிறுத்து — சுமை ஆடுகிறது",
      warning: "சுமை தன் அகலத்தை விட அதிகமாக ஆடுகிறது. ஒவ்வொரு சுழற்சியும் அதை மோசமாக்குகிறது, அது சாரக்கட்டை நோக்கிப் போகிறது.",
      question: "சுமை மோசமாக ஆடுகிறது. எப்படிக் கட்டுக்குள் கொண்டு வருவீர்கள்?",
      options: [
        "ஆட்டத்திற்கு எதிராகச் சுழற்றி அதை ரத்து செய்யவும்",
        "நிறுத்தி, ஆட்டம் அடங்கட்டும், பிறகு மெதுவாகத் தொடங்கவும்",
        "வேகமாக மேலே தூக்கவும், கயிறு குறைந்தால் ஆட்டம் குறையும்",
        "தொடர்ந்து சென்று, தளத்தில் இறங்கியதும் அடங்கட்டும்",
      ],
    },
  },

  {
    id: "unsafe-instruction",
    title: "Radio — an unsafe instruction",
    warning: "The site manager calls up: take it straight across over the canteen, it is quicker than going round, nobody is out there at this time.",
    question: "You are told to swing a load over an occupied area. What now?",
    options: [
      "Take the short way but lift higher over the roof",
      "Check if anyone is in the canteen, and go over if not",
      "Do as you are told — the manager made the decision",
      "Refuse it, say why, and take the agreed route round",
    ],
    correct: 3,
    why:
      "The operator has the final say on whether a lift goes ahead and can refuse any lift they "
      + "believe is unsafe. Height does not help — a dropped load does not care. And \"nobody is "
      + "in there\" is a guess about a place people walk into without telling anyone.",
    toast: "Lift refused and the agreed route taken.",
    ta: {
      title: "ரேடியோ — பாதுகாப்பற்ற உத்தரவு",
      warning: "தள மேலாளர் அழைக்கிறார்: கேன்டீன் மேலாகவே நேராகக் கொண்டு வா, சுற்றி வருவதை விட வேகம், இந்த நேரத்தில் அங்கே யாரும் இருக்க மாட்டார்கள்.",
      question: "ஆட்கள் உள்ள இடத்தின் மேல் சுமையைக் கொண்டு செல்லச் சொல்கிறார்கள். என்ன செய்வீர்கள்?",
      options: [
        "குறுக்கு வழியில் போகவும், ஆனால் கூரைக்கு மேலே தூக்கவும்",
        "கேன்டீனில் யாராவது இருக்கிறார்களா பார்த்து, இல்லையேல் போகவும்",
        "சொன்னபடி செய்யவும் — முடிவு மேலாளருடையது",
        "மறுத்து, காரணம் சொல்லி, ஒப்புக்கொண்ட வழியில் போகவும்",
      ],
    },
  },
];

export const INTERRUPT_COUNT = INTERRUPTS.length;

export function interruptById(id) {
  return INTERRUPTS.find((i) => i.id === id) || null;
}
