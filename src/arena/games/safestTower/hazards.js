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
    title: "Open trench with no edge protection",
    // Where the hazard object sits in the compound.
    at: { x: -11, z: 6 },
    rotY: 0,
    brief:
      "A 2.2 m service trench has been dug across the compound and left open. There is nothing "
      + "along either crest, and the spoil is heaped right up to the edge.",
    question: "How do you make this trench safe?",
    options: [
      "Put a DEEP EXCAVATION sign at each end of it",
      "Run hazard tape between cones all around it",
      "Guardrail both edges and support the sides",
      "Lay boards over the trench so people can cross",
    ],
    correct: 2,
    control: "engineer",
    why: "A trench this deep needs a physical barrier and support to the sides. A sign or tape tells you the hole is there. It does not stop you, or a tonne of spoil, falling in.",
    toast: "Guardrails fitted, sides supported, spoil moved back.",
    ta: {
      title: "விளிம்புப் பாதுகாப்பு இல்லாத திறந்த அகழி",
      question: "இந்த அகழியை எப்படிப் பாதுகாப்பாக்குவீர்கள்?",
      options: [
        "இரு முனைகளிலும் 'ஆழமான அகழி' பலகை வைக்கவும்",
        "கூம்புகளுக்கு இடையே எச்சரிக்கை டேப் கட்டவும்",
        "இரு விளிம்பிலும் தடுப்பு, பக்கங்களுக்கு ஆதரவு",
        "மேலே பலகை போட்டு நடக்க வழி செய்யவும்",
      ],
      why: "இவ்வளவு ஆழமான அகழிக்கு உண்மையான தடுப்பும் பக்கங்களுக்கு ஆதரவும் தேவை. பலகையோ டேப்போ குழி இருப்பதை மட்டும் சொல்கிறது. நீங்களோ ஒரு டன் மண்ணோ விழுவதைத் தடுக்காது.",
      toast: "கைப்பிடி தடுப்பு, பக்க ஆதரவு, மண் விலக்கப்பட்டது.",
    },
  },

  {
    id: "electrical",
    kind: "electrical",
    title: "Damaged cable lying in water",
    at: { x: 9, z: 11 },
    rotY: -0.4,
    brief:
      "A 240 V extension lead runs from the hut to a cut-off saw. The outer sheath is split and "
      + "taped, and the whole run lies through a puddle that has not drained since the last rain.",
    question: "What do you do about this cable?",
    options: [
      "Wrap the cut with new tape and keep working",
      "Switch it off, remove it, run a 110 V supply",
      "Put a board over the puddle to keep it dry",
      "Put an ELECTRICAL HAZARD sign by the puddle",
    ],
    correct: 1,
    control: "eliminate",
    why: "A damaged cable is removed, not taped. Tape is not a repair. On site the supply should be 110 V through an RCD, and no cable should lie in water.",
    toast: "Switched off, removed, 110 V supply run clear of the water.",
    ta: {
      title: "தண்ணீரில் கிடக்கும் சேதமான கேபிள்",
      question: "இந்தக் கேபிளை என்ன செய்வீர்கள்?",
      options: [
        "வெட்டில் புதிய டேப் சுற்றி வேலையைத் தொடரவும்",
        "மின்சாரம் நிறுத்தி, அகற்றி, 110 V போடவும்",
        "ஈரமாகாமல் இருக்க மேலே பலகை போடவும்",
        "அருகில் 'மின் ஆபத்து' பலகை வைக்கவும்",
      ],
      why: "சேதமான கேபிளை டேப் போட்டு சரிசெய்ய முடியாது, அதை அகற்ற வேண்டும். தளத்தில் RCD வழியாக 110 V இணைப்பு இருக்க வேண்டும். எந்தக் கேபிளும் தண்ணீரில் கிடக்கக் கூடாது.",
      toast: "மின்சாரம் நிறுத்தப்பட்டு, கேபிள் அகற்றப்பட்டது.",
    },
  },

  {
    id: "cylinders",
    kind: "cylinders",
    title: "Gas cylinders lying loose by the hut",
    at: { x: 15, z: -8 },
    rotY: 0.6,
    brief:
      "Oxygen and propane cylinders are lying on their sides against the side of the canteen hut, "
      + "unsecured, with no caps fitted and no separation between fuel gas and oxidiser.",
    question: "How should these cylinders be kept?",
    options: [
      "Stand them against the hut wall and leave them",
      "Cover them with a sheet to keep the sun off",
      "Put a NO SMOKING sign on the side of the hut",
      "Upright and chained in a cage, oxygen apart",
    ],
    correct: 3,
    control: "engineer",
    why: "Cylinders stand upright and chained so the valve cannot be knocked off. A loose cylinder that loses its valve flies like a rocket. A cover traps a leak instead of letting it blow away.",
    toast: "Upright, chained, capped and separated.",
    ta: {
      title: "ஹட் அருகில் கிடக்கும் கேஸ் சிலிண்டர்கள்",
      question: "இந்தச் சிலிண்டர்களை எப்படி வைக்க வேண்டும்?",
      options: [
        "ஹட் சுவரில் சாய்த்து நிறுத்தி விட்டுவிடவும்",
        "வெயில் படாமல் துணி போட்டு மூடி வைக்கவும்",
        "ஹட் மேல் 'புகைபிடிக்காதே' பலகை வைக்கவும்",
        "நிமிர்த்தி கூண்டில் கட்டி, ஆக்சிஜன் தனியாக",
      ],
      why: "சிலிண்டர்களை நிமிர்த்தி சங்கிலியால் கட்ட வேண்டும், இல்லையெனில் வால்வு உடைந்து ராக்கெட் போல் பறக்கும். துணி போட்டு மூடினால் கசிவு வெளியேறாமல் உள்ளேயே தங்கி ஆபத்து அதிகமாகும்.",
      toast: "நிமிர்த்தி, கட்டி, மூடி, தனியாக வைக்கப்பட்டது.",
    },
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
      "Band the stack and leave it where it is now",
      "Lower the stack and move it off the route",
      "Paint a new escape route around the stack",
      "Put a MIND THE STACK sign on the top pallet",
    ],
    correct: 1,
    control: "eliminate",
    why: "Two faults, one action. The stack is unstable AND it blocks the only way out — which matters most at the moment nobody can see. An escape route is kept clear, not moved around whatever is in the way.",
    toast: "Restacked safely, escape route clear.",
    ta: {
      title: "வெளியேறும் பாதையை அடைக்கும் பொருட்கள்",
      question: "இங்கே என்ன செய்வது சரி?",
      options: [
        "அடுக்கைக் கட்டி அதே இடத்தில் விட்டுவிடவும்",
        "அடுக்கைக் குறைத்து பாதையிலிருந்து நகர்த்தவும்",
        "அடுக்கைச் சுற்றி புதிய வெளியேறும் வழி வரையவும்",
        "மேல் பலகையில் 'கவனம்' அறிவிப்பு வைக்கவும்",
      ],
      why: "இரண்டு தவறுகள், ஒரே நடவடிக்கை. அடுக்கு நிலையற்றது, மேலும் ஒரே வெளியேறும் பாதையை அடைக்கிறது. புகை மூட்டத்தில் எதுவும் தெரியாத நேரத்தில்தான் அது முக்கியம். வெளியேறும் பாதை எப்போதும் காலியாக இருக்க வேண்டும்.",
      toast: "பாதுகாப்பாக அடுக்கப்பட்டது, பாதை காலி.",
    },
  },

  {
    id: "ladder",
    kind: "ladder",
    title: "Ladder untied and at the wrong angle",
    at: { x: 4, z: 14 },
    rotY: Math.PI,
    brief:
      "A leaning ladder gives access to the scaffold lift. It is pitched far too shallow, it is not "
      + "tied at the stiles, and it finishes level with the platform with nothing to hold.",
    question: "What does this ladder need?",
    options: [
      "Have a labourer hold the foot while it is used",
      "Put a board under the feet so they do not sink",
      "Tie the sides and set it one out to four up",
      "Put a THREE POINTS OF CONTACT sign at the foot",
    ],
    correct: 2,
    control: "engineer",
    why: "A ladder is tied, set at one out to four up, and taken a metre past the landing so there is something to hold. Footing a ladder is a last resort and puts a second person underneath it.",
    toast: "Tied, set at the right angle, extended past the landing.",
    ta: {
      title: "கட்டப்படாத, தவறான சாய்வில் உள்ள ஏணி",
      question: "இந்த ஏணிக்கு என்ன தேவை?",
      options: [
        "பயன்படுத்தும் போது ஒருவர் அடியில் பிடிக்கட்டும்",
        "கால்கள் புதையாமல் கீழே ஒரு பலகை போடவும்",
        "பக்கங்களைக் கட்டி ஒன்றுக்கு நான்கு சாய்வில் வைக்கவும்",
        "அடியில் 'மூன்று புள்ளித் தொடர்பு' பலகை வைக்கவும்",
      ],
      why: "ஏணியைக் கட்ட வேண்டும், ஒன்றுக்கு நான்கு சாய்வில் வைக்க வேண்டும், இறங்கும் இடத்தை விட ஒரு மீட்டர் மேலே நீட்ட வேண்டும். அடியில் ஒருவர் பிடிப்பது கடைசி வழி, அது இன்னொருவரை ஆபத்தில் நிறுத்துகிறது.",
      toast: "கட்டப்பட்டு, சரியான சாய்வில், மேலே நீட்டப்பட்டது.",
    },
  },

  {
    id: "floor-opening",
    kind: "opening",
    title: "Floor opening with no cover",
    at: { x: -16, z: -6 },
    rotY: 0.3,
    brief:
      "A 1.2 m square riser opening has been formed in the slab and left completely open. There "
      + "is no cover, no barrier, and nothing marking it. The drop is two storeys.",
    question: "What is the right control for this opening?",
    options: [
      "Hang bunting around it so that people see it",
      "Fit a fixed cover, marked with what is below",
      "Stand an OPEN RISER sign beside the opening",
      "Lay a loose sheet of ply over the hole",
    ],
    correct: 1,
    control: "engineer",
    why: "An opening gets a cover that is fixed down and marked, or a fixed barrier. Loose ply is worse than nothing: it hides the hole and slides when you step on it. Bunting holds nobody up.",
    toast: "Fixed, marked cover in place.",
    ta: {
      title: "மூடி இல்லாத தரைத் துளை",
      question: "இந்தத் துளைக்கு எது சரியான கட்டுப்பாடு?",
      options: [
        "தெரியும்படி சுற்றிலும் கொடி கட்டி வைக்கவும்",
        "நிலையான மூடி போட்டு கீழே என்ன என்று எழுதவும்",
        "அருகில் 'திறந்த துளை' பலகை நிறுத்தி வைக்கவும்",
        "துளை மேல் ஒரு பலகையைத் தளர்வாகப் போடவும்",
      ],
      why: "துளைக்கு நிலையாகப் பொருத்திய, குறியிடப்பட்ட மூடி அல்லது நிலையான தடுப்பு வேண்டும். தளர்வான பலகை இல்லாததை விட மோசம்: அது துளையை மறைக்கிறது, கால் வைத்தால் நகர்கிறது.",
      toast: "நிலையான, குறியிடப்பட்ட மூடி போடப்பட்டது.",
    },
  },

  {
    id: "edge",
    kind: "edge",
    title: "Open edge with no guardrail",
    at: { x: 14, z: 2 },
    rotY: -0.5,
    brief:
      "The slab edge on this elevation has no guardrail. Materials are stacked within a metre of "
      + "it and two operatives are working along it.",
    question: "What does this edge need?",
    options: [
      "Fit a guardrail and toe board along the edge",
      "Set cones and tape a metre back from the edge",
      "Give the two men working there a harness each",
      "Put a warning sign at each end of the elevation",
    ],
    correct: 0,
    control: "engineer",
    why: "Edge protection comes first because it protects everybody who goes near, without them having to do anything. A harness protects one person who clips on correctly, every time. Tape stops nobody.",
    toast: "Guardrail and toe board fixed to the edge.",
    ta: {
      title: "தடுப்பு இல்லாத திறந்த விளிம்பு",
      question: "இந்த விளிம்புக்கு என்ன தேவை?",
      options: [
        "விளிம்பு நெடுகிலும் தடுப்பும் கால் பலகையும்",
        "விளிம்பிலிருந்து ஒரு மீட்டர் விலகி டேப் கட்டவும்",
        "அங்கே வேலை செய்யும் இருவருக்கும் ஹார்னஸ் தரவும்",
        "இரு முனைகளிலும் எச்சரிக்கைப் பலகை வைக்கவும்",
      ],
      why: "விளிம்புத் தடுப்புதான் முதல் தேர்வு, ஏனெனில் அது அருகில் வரும் அனைவரையும் தானாகவே காக்கிறது. ஹார்னஸ் சரியாகக் கொளுவும் ஒருவரை மட்டுமே காக்கும். டேப் யாரையும் தடுக்காது.",
      toast: "கைப்பிடி தடுப்பும் கால் பலகையும் பொருத்தப்பட்டது.",
    },
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
      "Put a MIND YOUR STEP board at each end of it",
      "Sweep it to the sides to leave a path clear",
      "Clear it now and knock over every nail",
      "Give everyone boots with a steel midsole",
    ],
    correct: 2,
    control: "eliminate",
    why: "Rubbish is the one hazard you can always remove, so you always remove it. Nails are knocked over or pulled as soon as the timber comes off. Sweeping it aside leaves it there.",
    toast: "Cleared, nails pulled, daily clean-up agreed.",
    ta: {
      title: "நடைபாதையில் கிடக்கும் மரத்துண்டுகளும் ஆணிகளும்",
      question: "இதை எப்படிக் கையாள்வது?",
      options: [
        "இரு முனைகளிலும் 'கவனமாக நடக்கவும்' பலகை வைக்கவும்",
        "ஓரமாகத் தள்ளி நடுவில் வழி விட்டு வைக்கவும்",
        "இப்போதே அகற்றி ஆணிகளை மடக்கி விடவும்",
        "அனைவருக்கும் இரும்புத் தட்டு காலணி கொடுக்கவும்",
      ],
      why: "குப்பை என்பது எப்போதும் முற்றிலும் அகற்றக்கூடிய ஒரே ஆபத்து, எனவே அதை அகற்றவே வேண்டும். மரம் அகற்றியவுடன் ஆணிகளை மடக்க வேண்டும். ஓரமாகத் தள்ளுவது அதை அங்கேயே விட்டுவிடுகிறது.",
      toast: "அகற்றப்பட்டது, ஆணிகள் மடக்கப்பட்டன.",
    },
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
    question: "What do you do about this spill?",
    options: [
      "Cone it off and let it dry out during the day",
      "Soak it up with granules and fix the leak",
      "Wash it off the road with a hose and water",
      "Cover it over with sand and drive across it",
    ],
    correct: 1,
    control: "eliminate",
    why: "A spill is soaked up, collected and thrown away properly, and the leak is repaired — otherwise it is back tomorrow. Hosing it sends oil into the drains, which is an offence. Sand just spreads it.",
    toast: "Soaked up, bagged, leak booked for repair.",
    ta: {
      title: "வாகனப் பாதையில் எண்ணெய் கசிவு",
      question: "இந்தக் கசிவை என்ன செய்வீர்கள்?",
      options: [
        "கூம்பு வைத்து மறித்து பகலில் காயட்டும் எனவிடவும்",
        "பொடி போட்டு உறிஞ்சி கசிவைச் சரிசெய்யவும்",
        "குழாய் தண்ணீரால் சாலையில் இருந்து கழுவவும்",
        "மணல் போட்டு மூடி மேலே வண்டி ஓட்டவும்",
      ],
      why: "கசிவை உறிஞ்சி, சேகரித்து, முறையாக அகற்ற வேண்டும். கசிவுக்குக் காரணமானதையும் சரிசெய்ய வேண்டும், இல்லையெனில் நாளை மீண்டும் வரும். தண்ணீரால் கழுவினால் எண்ணெய் வடிகாலுக்குச் செல்லும், அது குற்றம்.",
      toast: "உறிஞ்சப்பட்டு சேகரிக்கப்பட்டது, கசிவு சரிசெய்யப்படும்.",
    },
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
      "Mark a route around the packs to the exit",
      "Move the packs and keep the exit clear",
      "Leave them if the door still opens far enough",
      "Put a notice up telling people to use the other stair",
    ],
    correct: 1,
    control: "eliminate",
    why: "A fire exit is kept clear, full stop. Everything else assumes people will read, think and find another way — in smoke, in the dark, in a hurry. They will not. They will go the way they always go.",
    toast: "Exit cleared and the route marked.",
    ta: {
      title: "பொருட்களால் அடைக்கப்பட்ட தீ வெளியேறும் வழி",
      question: "இங்கே என்ன செய்வது சரி?",
      options: [
        "பொருட்களைச் சுற்றி வெளியேறும் வழி குறிக்கவும்",
        "பொருட்களை நகர்த்தி வழியைக் காலியாக வைக்கவும்",
        "கதவு திறந்தால் போதும் என்று அப்படியே விடவும்",
        "'மற்ற படிக்கட்டைப் பயன்படுத்தவும்' என்று ஒட்டவும்",
      ],
      why: "தீ வெளியேறும் வழி எப்போதும் காலியாக இருக்க வேண்டும், அவ்வளவுதான். மற்ற பதில்கள் எல்லாம் மக்கள் புகையில், இருட்டில், அவசரத்தில் படித்து யோசிப்பார்கள் என்று நம்புகின்றன. அவர்கள் வழக்கமான வழியில்தான் ஓடுவார்கள்.",
      toast: "வழி காலி செய்யப்பட்டு குறியிடப்பட்டது.",
    },
  },
];

export const HAZARD_COUNT = HAZARDS.length;

export function hazardById(id) {
  return HAZARDS.find((h) => h.id === id) || null;
}
