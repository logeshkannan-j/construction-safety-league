/* ------------------------------------------------------------------ *
 *  CONSTRUCTION SAFETY QUESTION BANK
 *
 *  Replaces the original seeded question set. Every question is site
 *  safety and covers the twelve required topics:
 *
 *    Working at height · Scaffolding · Electrical · PPE · Excavation
 *    Lifting operations · Crane and hoist · Fire prevention
 *    Housekeeping · Confined space · Emergency response
 *    Material handling
 *
 *  The bank is deliberately larger than a session needs (24 general +
 *  8 finale) so that two participants sitting next to each other get
 *  different papers. See session.js for how a session is drawn.
 *
 *  `correct` is the index into `options` AS WRITTEN HERE. Sessions
 *  shuffle the option order and remap the answer, so never assume the
 *  answer stays at this index at runtime.
 * ------------------------------------------------------------------ */

export const TOPICS = {
  HEIGHT: "Working at Height",
  SCAFFOLD: "Scaffolding Safety",
  ELECTRICAL: "Electrical Safety",
  PPE: "PPE Requirements",
  EXCAVATION: "Excavation Safety",
  LIFTING: "Lifting Operations",
  CRANE: "Crane and Hoist Safety",
  FIRE: "Fire Prevention",
  HOUSEKEEPING: "Housekeeping",
  CONFINED: "Confined Space Safety",
  EMERGENCY: "Emergency Response",
  MATERIAL: "Material Handling",
};

/* ====================== general quiz (24) ====================== */

export const QUIZ_BANK = [
  /* ---------------------------- height ---------------------------- */
  {
    id: "h1",
    topic: TOPICS.HEIGHT,
    difficulty: "Medium",
    question: "You are working on a flat roof with an unprotected edge. Which control should be used FIRST?",
    options: [
      "A guardrail or other collective edge protection",
      "A safety harness clipped to a rated anchor point above the work",
      "A warning sign at the edge",
      "A verbal briefing before starting",
    ],
    correct: 0,
    points: 150,
    explanation:
      "The hierarchy for work at height puts collective protection — a guardrail that protects everyone, with no action needed from the worker — above personal fall arrest, which only protects one person and only if used correctly.",
    ta: {
      question: "மேல்தளத்தின் திறந்த விளிம்பில் வேலை செய்கிறீர்கள். முதலில் எந்தக் கட்டுப்பாடு?",
      options: [
        "கைப்பிடி தடுப்பு அல்லது அனைவரையும் காக்கும் விளிம்புத் தடுப்பு",
        "வேலைக்கு மேலே உள்ள கொக்கியில் கட்டப்பட்ட பாதுகாப்பு ஹார்னஸ்",
        "விளிம்பில் ஒரு எச்சரிக்கைப் பலகை",
        "வேலை தொடங்கும் முன் வாய்மொழி விளக்கம்",
      ],
    },
  },
  {
    id: "h2",
    topic: TOPICS.HEIGHT,
    difficulty: "Hard",
    question: "A worker's fall is arrested and they are left hanging in their harness. Why is this still an emergency?",
    options: [
      "Suspension in a harness restricts blood return and can be fatal within minutes",
      "The harness webbing will begin to fail if it is left loaded for more than about an hour",
      "The anchor point has to be re-certified immediately",
      "It is not an emergency — the harness has done its job",
    ],
    correct: 0,
    points: 200,
    explanation:
      "Suspension trauma is why every work-at-height job needs a rescue plan before it starts. The harness stops the fall; it does not make the casualty safe.",
    ta: {
      question: "ஒருவர் விழுந்து ஹார்னஸில் தொங்குகிறார். இது ஏன் இன்னும் அவசரநிலை?",
      options: [
        "ஹார்னஸில் தொங்குவது ரத்த ஓட்டத்தைத் தடுத்து உயிரிழக்கச் செய்யும்",
        "ஒரு மணி நேரத்துக்கு மேல் சுமை தாங்கினால் ஹார்னஸ் பட்டை கிழியத் தொடங்கும்",
        "கொக்கி பொருத்திய இடத்தை உடனடியாக மீண்டும் சான்றளிக்க வேண்டியிருக்கும்",
        "இது அவசரநிலையே அல்ல — ஹார்னஸ் அதன் வேலையைச் சரியாகச் செய்துவிட்டது",
      ],
    },
  },

  /* --------------------------- scaffolding --------------------------- */
  {
    id: "s1",
    topic: TOPICS.SCAFFOLD,
    difficulty: "Easy",
    question: "A scaffold tag at the access ladder is RED. What does that mean?",
    options: [
      "Do not use — the scaffold is incomplete or unsafe",
      "Safe to use, inspected today",
      "Use with care — it is rated for light duty and one person only",
      "Use only with a harness",
    ],
    correct: 0,
    points: 100,
    explanation:
      "A red tag means the scaffold has not been handed over. Only a competent person who has inspected it can change that tag.",
    ta: {
      question: "ஏணி அருகில் உள்ள சாரக்கட்டு டேக் சிவப்பு. இதன் பொருள் என்ன?",
      options: [
        "பயன்படுத்த வேண்டாம் — சாரக்கட்டு முழுமையடையவில்லை",
        "பயன்படுத்தலாம், இன்றுதான் ஆய்வு செய்து சான்றளிக்கப்பட்டது",
        "கவனமாகப் பயன்படுத்தவும் — ஒருவருக்கு மட்டும், குறைந்த சுமை",
        "ஹார்னஸ் அணிந்து மட்டுமே பயன்படுத்த வேண்டும்",
      ],
    },
  },
  {
    id: "s2",
    topic: TOPICS.SCAFFOLD,
    difficulty: "Medium",
    question: "How often must a scaffold in use be inspected by a competent person?",
    options: [
      "At least every 7 days, and after any event likely to affect its stability",
      "Once, when it is first erected and handed over for use",
      "Every 30 days, in line with the hire agreement",
      "Only when somebody reports a defect, a near miss, or damage after bad weather",
    ],
    correct: 0,
    points: 150,
    explanation:
      "Weekly inspection is the baseline, plus a re-inspection after high winds, an impact, or any alteration to the scaffold.",
    ta: {
      question: "பயன்பாட்டில் உள்ள சாரக்கட்டை எவ்வளவு அடிக்கடி ஆய்வு செய்ய வேண்டும்?",
      options: [
        "குறைந்தது 7 நாட்களுக்கு ஒருமுறை, நிலைத்தன்மை பாதித்தாலும்",
        "அமைத்து ஒப்படைக்கும் போது ஒரே ஒரு முறை மட்டுமே போதும்",
        "வாடகை ஒப்பந்தப்படி 30 நாட்களுக்கு ஒருமுறை செய்தால் போதும்",
        "குறை தெரிவித்தாலோ மோசமான வானிலைக்குப் பின்னரோ மட்டும்",
      ],
    },
  },

  /* --------------------------- electrical --------------------------- */
  {
    id: "e1",
    topic: TOPICS.ELECTRICAL,
    difficulty: "Medium",
    question: "What is the correct sequence before working on an electrical circuit?",
    options: [
      "Isolate, lock off, tag, then prove dead at the point of work",
      "Prove dead, then isolate and lock off",
      "Switch off and start work straight away",
      "Isolate and tag — proving dead is only needed on high voltage",
    ],
    correct: 0,
    points: 150,
    explanation:
      "Proving dead at the point of work is the step people skip, and it is the only one that confirms the isolation actually removed the supply you are about to touch.",
    ta: {
      question: "மின் சுற்றில் வேலை செய்யும் முன் சரியான வரிசை என்ன?",
      options: [
        "நிறுத்தி, பூட்டி, டேக் போட்டு, மின்சாரம் இல்லை என நிரூபிக்கவும்",
        "முதலில் மின்சாரம் இல்லை என நிரூபித்து, பிறகு நிறுத்திப் பூட்டவும்",
        "ஆஃப் செய்துவிட்டு உடனடியாக வேலையைத் தொடங்கி விடவும்",
        "நிறுத்தி டேக் போட்டால் போதும், நிரூபிப்பது உயர் மின்னழுத்தத்துக்கு",
      ],
    },
  },
  {
    id: "e2",
    topic: TOPICS.ELECTRICAL,
    difficulty: "Hard",
    question: "A colleague is unconscious and still in contact with a live cable. What do you do first?",
    options: [
      "Stop anyone touching them, and get the supply isolated and proved dead",
      "Pull them clear using their hi-vis vest",
      "Start CPR immediately",
      "Use a dry timber batten to lever the cable away from them before anything else",
    ],
    correct: 0,
    points: 200,
    explanation:
      "Until the supply is dead, anyone who touches the casualty becomes part of the circuit. Isolation comes before treatment, every time.",
    ta: {
      question: "ஒரு சகா மயங்கி விழுந்து இன்னும் மின்கம்பியைத் தொட்டுக் கொண்டிருக்கிறார். முதலில் என்ன?",
      options: [
        "யாரும் தொடாமல் தடுத்து, மின்சாரத்தை நிறுத்தி நிரூபிக்கவும்",
        "அவரது ஹை-விஸ் ஜாக்கெட்டைப் பிடித்து இழுத்து விலக்கி விடவும்",
        "உடனடியாக CPR தொடங்கி உயிரைக் காப்பாற்ற முயலவும்",
        "உலர்ந்த மரக்கட்டையால் கம்பியை விலக்கிய பிறகு அணுகவும்",
      ],
    },
  },

  /* ------------------------------- PPE ------------------------------- */
  {
    id: "p1",
    topic: TOPICS.PPE,
    difficulty: "Medium",
    question: "Where does PPE sit in the hierarchy of control?",
    options: [
      "Last — it is used when the risk cannot be removed or reduced by other means",
      "First — it should always be the starting point of any risk assessment on site",
      "Second, immediately after elimination has been considered",
      "It sits outside the hierarchy and is governed separately",
    ],
    correct: 0,
    points: 150,
    explanation:
      "PPE protects one person, only while worn correctly, and does nothing to the hazard itself. It is the last line, not the first.",
    ta: {
      question: "கட்டுப்பாட்டு வரிசையில் PPE எங்கே வருகிறது?",
      options: [
        "கடைசியாக — வேறு வழிகளில் ஆபத்தைக் குறைக்க முடியாத போது மட்டும்",
        "முதலில் — எந்த ஆபத்து மதிப்பீட்டிலும் இதுவே தொடக்கப் புள்ளியாக இருக்க வேண்டும்",
        "இரண்டாவதாக, ஆபத்தை முற்றிலும் நீக்குவதைப் பரிசீலித்த உடனேயே",
        "இது வரிசைக்கு வெளியே, தனியாகக் கையாளப்படுகிறது",
      ],
    },
  },
  {
    id: "p2",
    topic: TOPICS.PPE,
    difficulty: "Easy",
    question: "A worker's safety helmet has taken a heavy impact but looks undamaged. What should happen to it?",
    options: [
      "Take it out of service and replace it",
      "Keep using it — there is no visible damage",
      "Keep it as a spare for visitors",
      "Use it until the next inspection",
    ],
    correct: 0,
    points: 100,
    explanation:
      "A helmet absorbs an impact by deforming, and that damage is often invisible. After any significant impact it is scrap.",
    ta: {
      question: "ஒருவரின் ஹெல்மெட் பலமாக அடிபட்டது, ஆனால் சேதம் தெரியவில்லை. என்ன செய்வது?",
      options: [
        "பயன்பாட்டிலிருந்து நீக்கி புதிது வாங்கிக் கொடுக்க வேண்டும்",
        "தொடர்ந்து பயன்படுத்தலாம் — வெளியே எந்தச் சேதமும் தெரியவில்லை",
        "வருகையாளர்களுக்கான கூடுதல் ஹெல்மெட்டாக வைத்துக் கொள்ளலாம்",
        "அடுத்த ஆய்வு வரை பயன்படுத்தலாம்",
      ],
    },
  },

  /* ---------------------------- excavation ---------------------------- */
  {
    id: "x1",
    topic: TOPICS.EXCAVATION,
    difficulty: "Medium",
    question: "What must be done before anyone enters a 2 metre deep trench with vertical sides?",
    options: [
      "Support the sides by shoring, or batter them back to a safe angle",
      "Put hazard tape around the top",
      "Make sure a competent person watches continuously from the surface above",
      "Nothing, if the entry will be brief",
    ],
    correct: 0,
    points: 150,
    explanation:
      "A cubic metre of soil weighs more than a tonne and collapses without warning. Entry needs shoring or battering, plus edge protection and a safe means of access.",
    ta: {
      question: "செங்குத்தான பக்கங்களுடன் 2 மீட்டர் ஆழ அகழிக்குள் இறங்கும் முன் என்ன செய்ய வேண்டும்?",
      options: [
        "பக்கங்களுக்கு ஆதரவு கொடுக்கவும் அல்லது சாய்வாக வெட்டவும்",
        "மேலே சுற்றிலும் எச்சரிக்கை டேப் கட்டி வைத்தால் போதும்",
        "மேலிருந்து ஒருவர் தொடர்ந்து கவனித்துக் கொண்டே இருக்க வேண்டும்",
        "சிறிது நேரம் மட்டும் இறங்கினால் எந்த ஏற்பாடும் தேவையில்லை",
      ],
    },
  },
  {
    id: "x2",
    topic: TOPICS.EXCAVATION,
    difficulty: "Hard",
    question: "Why must spoil be kept back from the edge of an excavation?",
    options: [
      "Its weight surcharges the sides and makes a collapse more likely",
      "It makes the excavation harder to measure",
      "It stops water draining away from the trench",
      "It only matters for excavations deeper than five metres or in made ground",
    ],
    correct: 0,
    points: 200,
    explanation:
      "Spoil heaped at the edge adds load exactly where the ground is weakest, and can also roll back in on anyone working below.",
    ta: {
      question: "அகழியின் விளிம்பிலிருந்து மண்ணை ஏன் விலக்கி வைக்க வேண்டும்?",
      options: [
        "அதன் எடை பக்கங்களை அழுத்தி இடிவதற்கான வாய்ப்பை அதிகரிக்கிறது",
        "அகழியை அளப்பது கடினமாகிறது",
        "அகழியிலிருந்து தண்ணீர் வடிவதைத் தடுக்கிறது",
        "ஐந்து மீட்டருக்கு மேல் ஆழம் அல்லது நிரப்பிய மண்ணில் மட்டுமே இது முக்கியம்",
      ],
    },
  },

  /* ---------------------------- lifting ---------------------------- */
  {
    id: "l1",
    topic: TOPICS.LIFTING,
    difficulty: "Medium",
    question: "Who is responsible for planning a lifting operation?",
    options: [
      "An appointed person who is competent to plan that lift",
      "The crane operator",
      "The slinger who rigs the load",
      "Whoever happens to be supervising that area of the site on the day",
    ],
    correct: 0,
    points: 150,
    explanation:
      "Every lift needs a plan from an appointed person. The operator and slinger carry it out; they do not design it.",
    ta: {
      question: "தூக்கும் பணியைத் திட்டமிடும் பொறுப்பு யாருடையது?",
      options: [
        "அந்தப் பணியைத் திட்டமிடத் தகுதியான, நியமிக்கப்பட்ட ஒருவர்",
        "கிரேன் ஆபரேட்டர்",
        "சுமையைக் கட்டும் ஸ்லிங்கர்",
        "அன்று அந்தப் பகுதியை மேற்பார்வை செய்பவர் யாராக இருந்தாலும்",
      ],
    },
  },
  {
    id: "l2",
    topic: TOPICS.LIFTING,
    difficulty: "Easy",
    question: "A load is suspended over a pedestrian walkway. What is the correct action?",
    options: [
      "Stop the lift, land the load safely and re-plan the operation",
      "Ask people to walk quickly underneath",
      "Continue, but sound the horn first",
      "Continue — the slings and shackles are all rated well above this load",
    ],
    correct: 0,
    points: 100,
    explanation:
      "Nobody passes or works under a suspended load. If the planned path crosses a walkway, the plan is wrong.",
    ta: {
      question: "நடைபாதைக்கு மேல் ஒரு சுமை தொங்குகிறது. சரியான நடவடிக்கை என்ன?",
      options: [
        "பணியை நிறுத்தி, சுமையைப் பாதுகாப்பாக இறக்கி, மீண்டும் திட்டமிட வேண்டும்",
        "கீழே வேகமாக நடந்து போகச் சொல்ல வேண்டும்",
        "ஹாரன் அடித்துவிட்டுத் தொடர வேண்டும்",
        "தொடரலாம் — ஸ்லிங்கும் ஷேக்கிளும் இந்தச் சுமையை விட அதிகம் தாங்கும்",
      ],
    },
  },

  /* -------------------------- crane and hoist -------------------------- */
  {
    id: "c1",
    topic: TOPICS.CRANE,
    difficulty: "Hard",
    question: "A tower crane's safe working load falls as the radius increases. Why?",
    options: [
      "The limit is the overturning moment, which is load multiplied by radius",
      "The hoist rope stretches noticeably more when the trolley is at long radius",
      "The motor loses power further along the jib",
      "Wind pressure is higher at the jib tip",
    ],
    correct: 0,
    points: 200,
    explanation:
      "Capacity is a moment limit. Running the trolley out doubles the leverage on the crane base, so the load it can carry falls in proportion.",
    ta: {
      question: "ஆரம் அதிகரிக்கும் போது டவர் கிரேனின் பாதுகாப்பான சுமை ஏன் குறைகிறது?",
      options: [
        "வரம்பு கவிழ்க்கும் திருப்புவிசை — சுமை பெருக்கல் ஆரம்",
        "ட்ராலி தொலைவில் இருக்கும் போது கயிறு அதிகமாக நீண்டு விடுகிறது",
        "ஜிப்பில் தொலைவு செல்லச் செல்ல மோட்டாரின் சக்தி குறைகிறது",
        "ஜிப்பின் நுனிப்பகுதியில் காற்றழுத்தம் மிகவும் அதிகமாக உள்ளது",
      ],
    },
  },
  {
    id: "c2",
    topic: TOPICS.CRANE,
    difficulty: "Medium",
    question: "A material hoist is loaded above its marked safe working load. What should you do?",
    options: [
      "Stop the hoist and offload until it is within the marked SWL",
      "Send it up slowly to reduce the strain",
      "Send it up, but keep everyone away from the base",
      "Carry on — the SWL plate already includes a generous built-in safety margin",
    ],
    correct: 0,
    points: 150,
    explanation:
      "The safety margin is there for the unexpected, not to be spent deliberately. Overloading risks a brake or structural failure with the load over people below.",
    ta: {
      question: "ஒரு மெட்டீரியல் ஹாய்ஸ்ட் குறிக்கப்பட்ட சுமைக்கு மேல் ஏற்றப்பட்டுள்ளது. என்ன செய்வீர்கள்?",
      options: [
        "ஹாய்ஸ்டை நிறுத்தி, குறிக்கப்பட்ட அளவுக்குள் வரும் வரை இறக்க வேண்டும்",
        "அழுத்தம் குறைய மெதுவாக மேலே அனுப்ப வேண்டும்",
        "அனுப்பலாம், ஆனால் அடிப்பகுதியில் யாரும் இல்லாமல் பார்த்துக் கொள்ள வேண்டும்",
        "தொடரலாம் — குறிக்கப்பட்ட அளவிலேயே பாதுகாப்பு இடைவெளி சேர்க்கப்பட்டுள்ளது",
      ],
    },
  },

  /* ------------------------------- fire ------------------------------- */
  {
    id: "f1",
    topic: TOPICS.FIRE,
    difficulty: "Medium",
    question: "Which extinguisher is correct for a fire in live electrical equipment?",
    options: [
      "CO2",
      "Water",
      "Foam",
      "Wet chemical",
    ],
    correct: 0,
    points: 150,
    explanation:
      "CO2 is non-conductive and leaves no residue. Water and foam both conduct and would put the current through the jet and through you.",
    ta: {
      question: "மின் உபகரணத்தில் பற்றிய தீக்கு எந்த தீயணைப்பான் சரி?",
      options: [
        "CO2",
        "தண்ணீர்",
        "நுரை",
        "வெட் கெமிக்கல்",
      ],
    },
  },
  {
    id: "f2",
    topic: TOPICS.FIRE,
    difficulty: "Medium",
    question: "How long must a hot works fire watch normally continue after the work stops?",
    options: [
      "At least 60 minutes, checking the area and any adjacent spaces",
      "Until the equipment has been put away",
      "It is not needed provided an extinguisher was kept to hand throughout the work",
      "Five minutes is sufficient",
    ],
    correct: 0,
    points: 150,
    explanation:
      "Most hot works fires are discovered after the work finished. A smouldering fire in a void can take an hour or more to show itself.",
    ta: {
      question: "வெப்பப் பணி முடிந்த பிறகு தீக் காவல் எவ்வளவு நேரம் தொடர வேண்டும்?",
      options: [
        "குறைந்தது 60 நிமிடங்கள், அருகில் உள்ள இடங்களையும் சரிபார்த்து",
        "உபகரணங்களை எடுத்து பத்திரமாக வைக்கும் வரை தொடர வேண்டும்",
        "தீயணைப்பான் கையருகில் இருந்தால் இது தேவையே இல்லை",
        "ஐந்து நிமிடங்கள் கவனித்தால் முற்றிலும் போதுமானது",
      ],
    },
  },

  /* --------------------------- housekeeping --------------------------- */
  {
    id: "k1",
    topic: TOPICS.HOUSEKEEPING,
    difficulty: "Easy",
    question: "When should a work area be cleared of offcuts and waste?",
    options: [
      "As the work proceeds, continuously",
      "At the end of the shift",
      "At the end of the week",
      "When the area is needed by another trade",
    ],
    correct: 0,
    points: 100,
    explanation:
      "Slips, trips and falls are the most common site injury. Clearing as you go is the only approach that keeps a route safe all day.",
    ta: {
      question: "வேலை இடத்தில் கழிவுகளை எப்போது அகற்ற வேண்டும்?",
      options: [
        "வேலை நடக்கும் போதே, தொடர்ந்து",
        "ஷிஃப்ட் முடிவில்",
        "வார இறுதியில்",
        "வேறு ஒரு பிரிவுக்கு அந்த இடம் தேவைப்படும் போது",
      ],
    },
  },
  {
    id: "k2",
    topic: TOPICS.HOUSEKEEPING,
    difficulty: "Medium",
    question: "Stored materials are blocking a signed escape route. What is the correct response?",
    options: [
      "Clear the route immediately and keep it permanently unobstructed",
      "Put up a sign and bunting directing people safely around the obstruction",
      "Leave it, as long as the materials will move tomorrow",
      "Mark the materials with hazard tape",
    ],
    correct: 0,
    points: 150,
    explanation:
      "In a fire, a blocked exit is the difference between an evacuation and a fatality. Escape routes are kept clear at all times, not tidied later.",
    ta: {
      question: "சேமித்த பொருட்கள் குறிக்கப்பட்ட வெளியேறும் வழியை அடைக்கின்றன. சரியான பதில் என்ன?",
      options: [
        "உடனே வழியைக் காலி செய்து எப்போதும் தடையின்றி வைக்கவும்",
        "பலகையும் கொடியும் வைத்து மக்களைச் சுற்றிப் பாதுகாப்பாக வழிநடத்தவும்",
        "நாளை நகர்த்தப்படும் என்பதால் இன்றைக்கு அப்படியே விட்டு வைக்கலாம்",
        "பொருட்களை எச்சரிக்கை டேப்பால் சுற்றிக் குறித்து வைத்தால் போதும்",
      ],
    },
  },

  /* -------------------------- confined space -------------------------- */
  {
    id: "n1",
    topic: TOPICS.CONFINED,
    difficulty: "Hard",
    question: "What must be in place before anyone enters a confined space?",
    options: [
      "A permit, atmospheric testing, continuous monitoring and a rescue plan",
      "A torch, a radio, and a colleague keeping watch at the entrance throughout",
      "A gas detector carried by the entrant",
      "A toolbox talk on the morning of the work",
    ],
    correct: 0,
    points: 200,
    explanation:
      "Most confined space deaths include a would-be rescuer. The rescue arrangements have to exist before entry, not be improvised afterwards.",
    ta: {
      question: "அடைபட்ட இடத்திற்குள் நுழையும் முன் என்ன இருக்க வேண்டும்?",
      options: [
        "அனுமதிச் சீட்டு, காற்றுச் சோதனை, கண்காணிப்பு, மீட்புத் திட்டம்",
        "டார்ச், ரேடியோ, வாசலில் தொடர்ந்து கவனிக்க ஒரு சகா வேண்டும்",
        "உள்ளே செல்பவர் கொண்டு செல்லும் ஒரு கேஸ் கண்டறியும் கருவி",
        "அன்று காலை நடத்தப்படும் ஒரு பாதுகாப்பு விழிப்புணர்வுக் கூட்டம்",
      ],
    },
  },
  {
    id: "n2",
    topic: TOPICS.CONFINED,
    difficulty: "Medium",
    question: "A colleague collapses inside a confined space. What do you do?",
    options: [
      "Raise the alarm and start the rescue plan — do not enter",
      "Enter immediately and drag them clear before they deteriorate",
      "Enter holding your breath to keep it quick",
      "Enter wearing a dust mask",
    ],
    correct: 0,
    points: 150,
    explanation:
      "The atmosphere that dropped them will drop you. Entry is only for trained rescuers with breathing apparatus.",
    ta: {
      question: "அடைபட்ட இடத்தில் ஒரு சகா மயங்கி விழுகிறார். என்ன செய்வீர்கள்?",
      options: [
        "அலாரம் அடித்து மீட்புத் திட்டத்தைத் தொடங்கவும் — நுழையாதீர்",
        "நிலைமை மோசமாகும் முன் உடனடியாக உள்ளே சென்று இழுத்து வரவும்",
        "வேகமாக முடிக்க மூச்சைப் பிடித்துக் கொண்டு உள்ளே சென்று வரவும்",
        "தூசி முகக்கவசம் அணிந்து கொண்டு உள்ளே இறங்கிச் செல்லவும்",
      ],
    },
  },

  /* ---------------------------- emergency ---------------------------- */
  {
    id: "m1",
    topic: TOPICS.EMERGENCY,
    difficulty: "Easy",
    question: "You discover a fire on site. What is the first thing you do?",
    options: [
      "Raise the alarm",
      "Fight it with the nearest extinguisher",
      "Find the site manager",
      "Take a photograph for the report",
    ],
    correct: 0,
    points: 100,
    explanation:
      "Raising the alarm protects everyone else on site. Only tackle a small fire afterwards, and only with your escape route behind you.",
    ta: {
      question: "தளத்தில் தீ பற்றியதைக் கண்டால் முதலில் என்ன செய்வீர்கள்?",
      options: [
        "அலாரம் அடிக்க வேண்டும்",
        "அருகில் உள்ள தீயணைப்பானால் அணைக்க முயல வேண்டும்",
        "தள மேலாளரைத் தேட வேண்டும்",
        "அறிக்கைக்காகப் புகைப்படம் எடுக்க வேண்டும்",
      ],
    },
  },
  {
    id: "m2",
    topic: TOPICS.EMERGENCY,
    difficulty: "Medium",
    question: "Why must everyone report to the muster point during an evacuation?",
    options: [
      "So the roll call can identify anyone still inside",
      "So the site office can reconcile attendance against the payroll record",
      "So the fire service has somewhere to park",
      "So supervisors can reallocate work",
    ],
    correct: 0,
    points: 150,
    explanation:
      "If you are not accounted for, crews will search the building for you — putting them at risk for nothing.",
    ta: {
      question: "வெளியேற்றத்தின் போது அனைவரும் ஏன் ஒன்றுகூடும் இடத்திற்கு வர வேண்டும்?",
      options: [
        "உள்ளே யாராவது மாட்டியிருக்கிறார்களா எனத் தெரிந்து கொள்ள",
        "வருகைப் பதிவை ஊதியப் பட்டியலுடன் ஒப்பிட்டுச் சரிபார்க்க",
        "தீயணைப்புத் துறை வாகனம் நிறுத்த இடம் கிடைக்கும் பொருட்டு",
        "மேற்பார்வையாளர்கள் வேலையை மறுபங்கீடு செய்வதற்கு வசதியாக",
      ],
    },
  },

  /* -------------------------- material handling -------------------------- */
  {
    id: "g1",
    topic: TOPICS.MATERIAL,
    difficulty: "Easy",
    question: "What is the best way to reduce manual handling injuries on a site?",
    options: [
      "Avoid the manual handling, by using mechanical aids or redesigning the task",
      "Train everyone in correct lifting technique and refresh that training every year",
      "Issue back support belts to everyone handling materials",
      "Share every heavy lift between two or more trained people",
    ],
    correct: 0,
    points: 100,
    explanation:
      "Technique and sharing help, but the first question is always whether the lift has to be done by hand at all.",
    ta: {
      question: "கைகளால் தூக்கும் காயங்களைக் குறைக்க சிறந்த வழி எது?",
      options: [
        "இயந்திர உதவி அல்லது பணியை மாற்றி அமைத்து, கையால் தூக்குவதையே தவிர்ப்பது",
        "அனைவருக்கும் சரியான தூக்கும் முறையைப் பயிற்றுவித்து ஆண்டுதோறும் புதுப்பிப்பது",
        "பொருட்களைக் கையாளும் அனைவருக்கும் முதுகுப் பட்டை வழங்குவது",
        "ஒவ்வொரு கனமான பொருளையும் இரண்டு பேருக்கு மேல் சேர்ந்து தூக்குவது",
      ],
    },
  },
  {
    id: "g2",
    topic: TOPICS.MATERIAL,
    difficulty: "Medium",
    question: "Uncapped starter bars are projecting from a slab at waist height. What is the hazard and the control?",
    options: [
      "Impalement — fit protective caps and barrier the area",
      "Trip hazard — mark them with paint",
      "Corrosion of the exposed steel — cover the ends with plastic sheeting",
      "There is no hazard if they are visible",
    ],
    correct: 0,
    points: 150,
    explanation:
      "Exposed rebar causes impalement injuries from quite short falls. Caps plus a barrier, not just visibility.",
    ta: {
      question: "மூடி இல்லாத இரும்புக் கம்பிகள் இடுப்பு உயரத்தில் நீட்டிக் கொண்டுள்ளன. ஆபத்தும் கட்டுப்பாடும் என்ன?",
      options: [
        "உடலில் குத்தும் ஆபத்து — மூடி போட்டு, அந்தப் பகுதியைத் தடுக்க வேண்டும்",
        "இடறி விழும் ஆபத்து — வண்ணம் பூசிக் குறிக்க வேண்டும்",
        "இரும்பு துருப்பிடிக்கும் ஆபத்து — நுனிகளை பிளாஸ்டிக்கால் மூட வேண்டும்",
        "தெரிந்தால் எந்த ஆபத்தும் இல்லை",
      ],
    },
  },
];

/* ================== Safety Millionaire finale (8) ================== */

/**
 * The finale ladder. A session draws 5 and plays them in ascending tier
 * order, so the stakes always climb regardless of which five came out.
 */
export const MILLIONAIRE_BANK = [
  {
    id: "mq1",
    tier: "Bronze Badge",
    topic: TOPICS.PPE,
    question: "On most sites, what does a BLUE safety helmet usually indicate?",
    options: ["A site visitor or someone under supervision", "The site manager or the person in charge that day", "A trained first aider on the emergency rota", "An approved electrician working on live systems"],
    correct: 0,
    points: 200,
    explanation: "Helmet colour conventions vary by site, which is exactly why the induction tells you the local scheme.",
    ta: {
      question: "பெரும்பாலான தளங்களில் நீல ஹெல்மெட் பொதுவாக எதைக் குறிக்கிறது?",
      options: [
        "வருகையாளர் அல்லது மேற்பார்வையில் வேலை செய்பவர்",
        "தள மேலாளர் அல்லது அன்று பொறுப்பில் இருப்பவர்",
        "அவசரப் பட்டியலில் உள்ள பயிற்சி பெற்ற முதலுதவியாளர்",
        "மின் அமைப்புகளில் வேலை செய்யும் அங்கீகரிக்கப்பட்ட மின்வல்லுநர்",
      ],
    },
  },
  {
    id: "mq2",
    tier: "Bronze Badge",
    topic: TOPICS.FIRE,
    question: "How often should a site fire extinguisher be given a visual check?",
    options: ["Monthly", "Annually only", "Only after it has been used", "Only when it looks damaged"],
    correct: 0,
    points: 200,
    explanation: "A monthly visual check catches a discharged, damaged or missing extinguisher long before you need it.",
    ta: {
      question: "தளத்தின் தீயணைப்பானை எவ்வளவு அடிக்கடி கண்ணால் சரிபார்க்க வேண்டும்?",
      options: [
        "மாதம் ஒருமுறை",
        "ஆண்டுக்கு ஒருமுறை மட்டும்",
        "பயன்படுத்திய பிறகு மட்டும்",
        "சேதமாகத் தெரிந்தால் மட்டும்",
      ],
    },
  },
  {
    id: "mq3",
    tier: "Silver Badge",
    topic: TOPICS.HOUSEKEEPING,
    question: "What is the minimum height of a guardrail on a working platform in most jurisdictions?",
    options: ["About 950 mm to 1100 mm", "About 600 mm", "About 1500 mm", "There is no stated minimum height"],
    correct: 0,
    points: 400,
    explanation: "A top rail around a metre high, plus a mid rail and a toe board, is the standard arrangement.",
    ta: {
      question: "வேலை மேடையில் கைப்பிடி தடுப்பின் குறைந்தபட்ச உயரம் என்ன?",
      options: [
        "சுமார் 950 மிமீ முதல் 1100 மிமீ வரை",
        "சுமார் 600 மிமீ",
        "சுமார் 1500 மிமீ",
        "குறைந்தபட்ச உயரம் என்று எதுவும் குறிப்பிடப்படவில்லை",
      ],
    },
  },
  {
    id: "mq4",
    tier: "Silver Badge",
    topic: TOPICS.ELECTRICAL,
    question: "What does an RCD protect against?",
    options: [
      "An earth fault, by cutting the supply when current leaks to earth",
      "Overloading a circuit by running too many tools from one supply",
      "Lightning strikes on the site supply",
      "Mechanical damage to a trailing cable",
    ],
    correct: 0,
    points: 400,
    explanation: "An RCD detects current escaping to earth — often through a person — and disconnects in milliseconds. It is not an overload device.",
    ta: {
      question: "RCD எதிலிருந்து பாதுகாக்கிறது?",
      options: [
        "மின்சாரம் பூமிக்குக் கசியும் போது இணைப்பைத் துண்டிக்கிறது",
        "ஒரே இணைப்பில் பல கருவிகள் இயக்கி சுற்றை அதிக சுமை ஏற்றுவதிலிருந்து",
        "தள மின் இணைப்பில் இடி விழுந்து சேதம் ஏற்படுவதிலிருந்து",
        "இழுத்துச் செல்லும் கேபிளுக்கு ஏற்படும் இயந்திரச் சேதத்திலிருந்து",
      ],
    },
  },
  {
    id: "mq5",
    tier: "Gold Badge",
    topic: TOPICS.CRANE,
    question: "What is the usual minimum safe approach distance to overhead power lines for plant, unless the line is isolated?",
    options: [
      "A distance set by the line's voltage and the network operator",
      "Half a metre, measured from the outermost conductor of the line",
      "Two metres in all cases, whatever the voltage of the line is",
      "No distance at all, provided insulated gloves are being worn",
    ],
    correct: 0,
    points: 600,
    explanation: "Electricity can arc across a gap. The clearance depends on voltage and must come from the network operator, not from a rule of thumb.",
    ta: {
      question: "மின்சாரம் நிறுத்தப்படாத மேல்நிலைக் கம்பிகளிலிருந்து வாகனங்கள் எவ்வளவு தூரம் விலகி இருக்க வேண்டும்?",
      options: [
        "மின்னழுத்தத்தையும் நிறுவன விதியையும் பொறுத்து, 6 முதல் 15 மீட்டர்",
        "வெளிப்புறக் கம்பியிலிருந்து அளந்து, எப்போதும் அரை மீட்டர் போதும்",
        "மின்னழுத்தம் எதுவாக இருந்தாலும் எல்லா நேரமும் இரண்டு மீட்டர் மட்டும்",
        "காப்பு கையுறை அணிந்திருந்தால் எந்த தூரமும் தேவையில்லை",
      ],
    },
  },
  {
    id: "mq6",
    tier: "Gold Badge",
    topic: TOPICS.CONFINED,
    question: "Which atmospheric hazard causes the most confined space fatalities?",
    options: ["Oxygen deficiency", "Excessive noise levels", "High humidity", "Low temperature"],
    correct: 0,
    points: 600,
    explanation: "An oxygen-deficient atmosphere gives no warning: there is no smell and often no distress before collapse.",
    ta: {
      question: "அடைபட்ட இடங்களில் அதிக உயிரிழப்புகளுக்குக் காரணமான காற்று ஆபத்து எது?",
      options: [
        "ஆக்சிஜன் குறைபாடு",
        "அதிக ஒலி அளவு",
        "அதிக ஈரப்பதம",
        "குறைந்த வெப்பநிலை",
      ],
    },
  },
  {
    id: "mq7",
    tier: "Platinum Badge",
    topic: TOPICS.HEIGHT,
    question: "In the hierarchy of control, which is the MOST effective way to deal with a hazard?",
    options: [
      "Eliminate it — remove the hazard altogether",
      "Engineering controls such as guarding",
      "Administrative controls such as training and signage",
      "Personal protective equipment",
    ],
    correct: 0,
    points: 800,
    explanation: "Everything below elimination relies on a control continuing to work, or on a person continuing to behave perfectly.",
    ta: {
      question: "கட்டுப்பாட்டு வரிசையில் ஆபத்தைக் கையாள மிகச் சிறந்த வழி எது?",
      options: [
        "ஆபத்தை முற்றிலும் நீக்குவது",
        "பாதுகாப்பு அடைப்பு போன்ற பொறியியல் கட்டுப்பாடுகள்",
        "பயிற்சி, அறிவிப்புப் பலகை போன்ற நிர்வாகக் கட்டுப்பாடுகள்",
        "தனிநபர் பாதுகாப்பு உபகரணம்",
      ],
    },
  },
  {
    id: "mq8",
    tier: "Diamond Badge",
    topic: TOPICS.EMERGENCY,
    question: "A near miss occurs and nobody is hurt. What should happen?",
    options: [
      "Report and investigate it as you would an incident",
      "Nothing — no harm was done",
      "Mention it only if someone asks",
      "Quietly fix the cause yourself and move on with the job",
    ],
    correct: 0,
    points: 1000,
    explanation: "A near miss is the same failure as an injury, with luck in place of a casualty. It is the cheapest warning you will ever get.",
    ta: {
      question: "ஒரு அபாயம் நேர்ந்து யாருக்கும் காயம் இல்லை. என்ன நடக்க வேண்டும்?",
      options: [
        "விபத்து போலவே அதைத் தெரிவித்து விசாரிக்க வேண்டும்",
        "எதுவும் வேண்டாம் — யாருக்கும் காயம் இல்லையே",
        "யாராவது கேட்டால் மட்டும் சொன்னால் போதும்",
        "காரணத்தை நீங்களே அமைதியாகச் சரிசெய்து வேலையைத் தொடரவும்",
      ],
    },
  },

  /* ------------------------------------------------------------------ *
   *  The bank below exists because the original eight questions left
   *  Platinum and Diamond with ONE question each — so the last two
   *  rounds were the SAME two questions for every single participant,
   *  every single time. Four per tier is the minimum that makes the
   *  finale genuinely vary between people sitting next to each other.
   * ------------------------------------------------------------------ */

  /* ---------------------------- Bronze ---------------------------- */
  {
    id: "mq9",
    tier: "Bronze Badge",
    topic: TOPICS.HOUSEKEEPING,
    question: "Why is site housekeeping treated as a safety control rather than tidiness?",
    options: [
      "Slips, trips and falls on the level are among the most common site injuries",
      "It makes the site look better for visitors and clients",
      "It is only really required in the week before an external client inspection",
      "It reduces the cost of skip hire and waste collection",
    ],
    correct: 0,
    points: 200,
    explanation: "Trips over materials and trailing leads injure more people on construction sites than almost anything else. Clearing as you go is a control, not a chore.",
    ta: {
      question: "தளத்தைச் சுத்தமாக வைப்பது ஏன் வெறும் ஒழுங்கு அல்ல, பாதுகாப்புக் கட்டுப்பாடாகக் கருதப்படுகிறது?",
      options: [
        "வழுக்கி, இடறி, தரையிலேயே விழுவதுதான் தளங்களில் மிகச் சாதாரணமான காயம்",
        "வருகையாளர்களுக்கும் வாடிக்கையாளர்களுக்கும் தளம் நன்றாகத் தெரிய",
        "வெளி ஆய்வுக்கு முந்தைய வாரத்தில் மட்டுமே இது உண்மையில் தேவை",
        "குப்பை அகற்றும் செலவைக் குறைக்கிறது",
      ],
    },
  },
  {
    id: "mq10",
    tier: "Bronze Badge",
    topic: TOPICS.HEIGHT,
    question: "What is the first question to ask before any work at height?",
    options: [
      "Can the work be done without going to height at all?",
      "Which harness should be worn?",
      "How long will the job take?",
      "Who on the team is trained and authorised to use the ladder?",
    ],
    correct: 0,
    points: 200,
    explanation: "Avoid, prevent, minimise — in that order. Assembling at ground level and lifting the finished item into place removes the risk instead of managing it.",
    ta: {
      question: "உயரத்தில் வேலை செய்யும் முன் கேட்க வேண்டிய முதல் கேள்வி என்ன?",
      options: [
        "உயரத்திற்கே போகாமல் இந்த வேலையைச் செய்ய முடியுமா?",
        "எந்த ஹார்னஸ் அணிய வேண்டும்?",
        "இந்த வேலைக்கு எவ்வளவு நேரம் ஆகும்?",
        "குழுவில் யாருக்கு ஏணி பயன்படுத்தப் பயிற்சியும் அனுமதியும் உள்ளது?",
      ],
    },
  },

  /* ---------------------------- Silver ---------------------------- */
  {
    id: "mq11",
    tier: "Silver Badge",
    topic: TOPICS.CONFINED,
    question: "Before entry to a confined space, which atmospheric test comes FIRST?",
    options: [
      "Oxygen level",
      "Flammable gas",
      "Toxic gas",
      "Humidity",
    ],
    correct: 0,
    points: 400,
    explanation: "Oxygen first, then flammables, then toxics. The order matters because most gas detectors cannot read flammable concentrations reliably in an oxygen-deficient atmosphere.",
    ta: {
      question: "அடைபட்ட இடத்திற்குள் நுழையும் முன் முதலில் எந்தச் சோதனை?",
      options: [
        "ஆக்சிஜன் அளவு",
        "எரியக்கூடிய வாயு",
        "நச்சு வாயு",
        "ஈரப்பதம",
      ],
    },
  },
  {
    id: "mq12",
    tier: "Silver Badge",
    topic: TOPICS.SCAFFOLD,
    question: "A scaffold carries a green tag dated eleven days ago. What does that mean?",
    options: [
      "It is overdue — scaffolds need inspection at least every 7 days",
      "It is fine, tags last a month",
      "It is perfectly fine, as long as nothing about it has visibly changed since",
      "It only needs re-tagging after bad weather",
    ],
    correct: 0,
    points: 400,
    explanation: "A scaffold must be inspected before first use, after any alteration or event likely to affect its stability, and at intervals not exceeding 7 days. An eleven-day-old tag is an expired tag.",
    ta: {
      question: "ஒரு சாரக்கட்டில் பதினொரு நாட்களுக்கு முந்தைய தேதியுள்ள பச்சை டேக் உள்ளது. இதன் பொருள்?",
      options: [
        "காலம் கடந்துவிட்டது — 7 நாட்களுக்கு ஒருமுறை ஆய்வு வேண்டும்",
        "பரவாயில்லை, சாரக்கட்டு டேக் ஒரு மாத காலத்துக்குச் செல்லும்",
        "அதற்குப் பிறகு எதுவும் மாறவில்லை என்றால் முற்றிலும் பரவாயில்லை",
        "மோசமான வானிலைக்குப் பிறகு மட்டுமே மீண்டும் டேக் தேவைப்படும்",
      ],
    },
  },

  /* ----------------------------- Gold ----------------------------- */
  {
    id: "mq13",
    tier: "Gold Badge",
    topic: TOPICS.EXCAVATION,
    question: "What does the term 'surcharge' describe at an excavation?",
    options: [
      "Extra load near the crest that can collapse the face",
      "The additional cost of shoring charged against the excavation",
      "The extra depth dug below the design formation level of the dig",
      "The charge for disposing of the excavated material off site",
    ],
    correct: 0,
    points: 600,
    explanation: "Spoil heaped at the edge, or a lorry parked beside it, loads the ground the face depends on. Keeping the crest clear is as important as the support itself.",
    ta: {
      question: "அகழியில் 'சர்சார்ஜ்' என்பது எதைக் குறிக்கிறது?",
      options: [
        "விளிம்பருகே உள்ள கூடுதல் எடை, இது பக்கத்தை இடிக்கக்கூடும்",
        "ஆதரவு அமைப்புக்காக அகழிக்குச் சேர்க்கப்படும் கூடுதல் செலவுத் தொகை",
        "வடிவமைத்த அளவை விடக் கூடுதலாகத் தோண்டப்பட்ட ஆழப் பகுதி",
        "தோண்டி எடுத்த மண்ணை வெளியே அகற்றுவதற்கான கட்டணத் தொகை",
      ],
    },
  },
  {
    id: "mq14",
    tier: "Gold Badge",
    topic: TOPICS.ELECTRICAL,
    question: "Why is 110 V centre-tapped supply preferred to 240 V on construction sites?",
    options: [
      "A fault gives a maximum of 55 V to earth, rarely enough to kill",
      "The cable, connector and distribution cost is lower across a large site",
      "The tools run with more torque and speed at the lower voltage",
      "It removes the fire risk from damaged leads and connectors entirely",
    ],
    correct: 0,
    points: 600,
    explanation: "Centre-tapping means the worst shock to earth is 55 V rather than 240 V. It does not make electricity safe — it makes a mistake survivable.",
    ta: {
      question: "கட்டுமானத் தளங்களில் 240 V ஐ விட 110 V ஏன் விரும்பப்படுகிறது?",
      options: [
        "கோளாறில் அதிகபட்சம் 55 V, உயிருக்கு ஆபத்து மிகக் குறைவு",
        "பெரிய தளத்தில் கேபிள், இணைப்பான் செலவு கணிசமாகக் குறைகிறது",
        "குறைந்த மின்னழுத்தத்தில் கருவிகள் அதிக சக்தியுடன் இயங்குகின்றன",
        "சேதமான கேபிளால் வரும் தீ ஆபத்தை முற்றிலுமாக நீக்கி விடுகிறது",
      ],
    },
  },

  /* --------------------------- Platinum --------------------------- */
  {
    id: "mq15",
    tier: "Platinum Badge",
    topic: TOPICS.LIFTING,
    question: "As the radius of a crane's load increases, what happens to its safe working load?",
    options: [
      "It falls — the moment limit is fixed, so load must drop as radius grows",
      "It rises, because the jib gains leverage further out",
      "It stays the same at every radius the jib can reach",
      "It depends only on the wind speed being recorded at the jib tip at the time",
    ],
    correct: 0,
    points: 800,
    explanation: "Safe working load = moment limit ÷ radius. Running the trolley out is the single most common way an operator walks into an overload.",
    ta: {
      question: "கிரேனின் ஆரம் அதிகரிக்கும் போது அதன் பாதுகாப்பான சுமைக்கு என்ன நடக்கும்?",
      options: [
        "குறையும் — திருப்புவிசை வரம்பு நிலையானது, ஆரம் கூடினால் சுமை குறைய வேண்டும்",
        "கூடும், ஏனெனில் ஜிப் தொலைவில் அதிக நெம்புகோல் விசை பெறுகிறது",
        "ஜிப் எட்டும் எல்லா ஆரத்திலும் ஒரே அளவாகவே இருக்கும்",
        "அந்த நேரத்தில் ஜிப் நுனியில் பதிவாகும் காற்றின் வேகத்தை மட்டுமே பொறுத்தது",
      ],
    },
  },
  {
    id: "mq16",
    tier: "Platinum Badge",
    topic: TOPICS.EMERGENCY,
    question: "You arrive at a casualty in a confined space who is unconscious. What do you do?",
    options: [
      "Raise the alarm and wait for trained rescuers with breathing apparatus",
      "Enter immediately and drag them out",
      "Enter holding your breath and move as quickly as you can",
      "Enter with a colleague holding onto your legs so that you can be pulled straight back out",
    ],
    correct: 0,
    points: 800,
    explanation: "Most confined-space deaths are would-be rescuers. The atmosphere that took the first person will take you in the same number of breaths.",
    ta: {
      question: "அடைபட்ட இடத்தில் மயங்கிக் கிடக்கும் ஒருவரிடம் வருகிறீர்கள். என்ன செய்வீர்கள்?",
      options: [
        "அலாரம் அடித்து பயிற்சி பெற்ற மீட்புக் குழுவுக்குக் காத்திருக்கவும்",
        "உடனடியாக உள்ளே சென்று அவரை வெளியே இழுத்து வந்து விடுங்கள்",
        "மூச்சைப் பிடித்துக் கொண்டு முடிந்தவரை வேகமாக உள்ளே சென்று வரவும்",
        "ஒரு சகா கால்களைப் பிடித்துக் கொள்ள, உள்ளே தலைகீழாக இறங்கவும்",
      ],
    },
  },

  /* ---------------------------- Diamond ---------------------------- */
  {
    id: "mq17",
    tier: "Diamond Badge",
    topic: TOPICS.HEIGHT,
    question: "A worker is in a harness, suspended after a fall, and conscious. Why is time critical?",
    options: [
      "Suspension trauma — blood pools in the legs and can be fatal within minutes",
      "The harness stitching and webbing will begin to fail under the sustained load",
      "The anchor point will work loose under the shock load",
      "They will lose body heat quickly while hanging in the open",
    ],
    correct: 0,
    points: 1000,
    explanation: "Motionless suspension causes blood to pool in the legs, and the casualty can lose consciousness in minutes. A rescue plan is part of the work-at-height plan, not an afterthought.",
    ta: {
      question: "விழுந்த பிறகு ஹார்னஸில் தொங்கும் ஒருவர் நினைவுடன் இருக்கிறார். நேரம் ஏன் முக்கியம்?",
      options: [
        "ரத்தம் கால்களில் தேங்கி, சில நிமிடங்களில் உயிரிழப்பு ஏற்படலாம்",
        "தொடர்ந்து சுமை தாங்குவதால் ஹார்னஸ் தையலும் பட்டையும் கிழியத் தொடங்கும்",
        "அதிர்ச்சி சுமையால் கொக்கி பொருத்திய இடம் தளரத் தொடங்கும்",
        "திறந்தவெளியில் தொங்குவதால் உடல் வெப்பம் விரைவில் குறையும்",
      ],
    },
  },
  {
    id: "mq18",
    tier: "Diamond Badge",
    topic: TOPICS.MATERIAL,
    question: "What does the hierarchy of control require you to try BEFORE issuing PPE?",
    options: [
      "Eliminate, substitute, engineer it out, then control administratively",
      "Nothing — PPE is correctly the first line of defence",
      "A toolbox talk and a signed risk assessment collected from everyone involved",
      "A second opinion from the supervisor before issuing it",
    ],
    correct: 0,
    points: 1000,
    explanation: "PPE is the LAST line of defence and protects only the person wearing it, only when worn correctly. Everything above it in the hierarchy protects everybody.",
    ta: {
      question: "PPE கொடுப்பதற்கு முன் கட்டுப்பாட்டு வரிசை எதைச் செய்யச் சொல்கிறது?",
      options: [
        "நீக்கவும், மாற்றவும், பொறியியலால் தவிர்க்கவும், பின் கட்டுப்படுத்தவும்",
        "எதுவும் செய்ய வேண்டாம் — PPE தான் சரியாகவே முதல் பாதுகாப்பு ஆகும்",
        "ஒரு பாதுகாப்புக் கூட்டமும் அனைவரும் கையொப்பமிட்ட ஆபத்து மதிப்பீடும்",
        "கொடுப்பதற்கு முன்னர் மேற்பார்வையாளரிடம் ஒரு இரண்டாவது கருத்து",
      ],
    },
  },
];

/* ------------------------------ helpers ------------------------------ */

// How many questions a paper draws is NOT the bank's business — an
// integrated session takes one per round and a live event takes 10 + 5.
// Both counts live in session.js so there is a single source of truth.

export function quizQuestionById(id) {
  return QUIZ_BANK.find((q) => q.id === id) || null;
}
export function millionaireQuestionById(id) {
  return MILLIONAIRE_BANK.find((q) => q.id === id) || null;
}

// Tier order for the finale, lowest stake first.
export const TIER_ORDER = [
  "Bronze Badge", "Silver Badge", "Gold Badge", "Platinum Badge", "Diamond Badge",
];
