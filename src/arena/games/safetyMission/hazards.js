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
  PPE: "PPE non-compliance — required kit not worn",
  HEIGHT: "Work at height — risk of a fall",
  ELECTRICAL: "Electrical hazard — live supply",
  LIFTING: "Lifting operation — suspended load",
  EXCAVATION: "Excavation — risk of collapse",
  HOUSEKEEPING: "Housekeeping — slips, trips and falls",
  EMERGENCY: "Emergency access is obstructed",
  SCAFFOLD: "Scaffold defect — not safe to use",
  OVERLOAD: "Plant overload — capacity breached",
  STRUCK: "Struck-by — falling object",
};

export const ACTIONS = {
  STOP_REMOVE: "Stop the task straight away and walk the person well clear of the danger zone",
  ISSUE_PPE: "Stop the worker, issue the correct PPE and brief them properly before restarting",
  FIT_GUARDRAIL: "Fit compliant guardrails, mid rails and toe boards along the whole open edge",
  COVER_OPENING: "Fit a secured, load-rated cover marked HOLE and barrier the opening off as well",
  ISOLATE_LOCKOFF: "Isolate the supply, lock off and tag it, then have a competent electrician repair it",
  TAPE_IT_UP: "Wrap the damaged section in insulating tape and carry on using the tool as before",
  EXCLUSION_ZONE: "Set up a barriered exclusion zone around it and appoint a trained banksman to watch",
  STOP_LIFT: "Stop the lift, land the load somewhere safe and re-plan it with the appointed person",
  CLEAR_ROUTE: "Clear the route immediately and keep the escape way unobstructed from now on",
  SIGN_THE_ROUTE: "Put up a sign telling people to climb over the stored material and leave it there",
  TIDY_AREA: "Sort the material and move it to the marked storage and waste areas straight away",
  SHORE_EXCAVATION: "Stop entry, shore or batter the sides and fit edge protection before anyone re-enters",
  DEEPEN_EXCAVATION: "Dig the trench a good deal deeper so that the spoil has somewhere to fall into",
  OFFLOAD_TO_SWL: "Offload it to the rated capacity, check the SWL plate and re-inspect the hoist",
  COMPLETE_BOARDING: "Stop use, tag it out, finish boarding the platform and have it re-inspected",
  CLIP_ON: "Stop the work and have the operative clip their lanyard to a rated anchor point",
  TELL_SUPERVISOR_LATER: "Make a note of it and mention the problem at the next weekly safety meeting",
  CARRY_ON_WATCH: "Let the work carry on as it is while you watch from a safe distance nearby",
};

/* The same classifications and controls in Tamil, keyed by the English
 * text so an option built from either table carries its translation
 * with it. Both languages are shown on the question at once — a
 * toggle somewhere else is no use to someone reading the dialog. */
export const CATEGORIES_TA = {
  [CATEGORIES.PPE]: "PPE விதிமீறல் — தேவையான உபகரணம் அணியவில்லை",
  [CATEGORIES.HEIGHT]: "உயரத்தில் வேலை — விழும் ஆபத்து",
  [CATEGORIES.ELECTRICAL]: "மின்சார ஆபத்து — மின்சாரம் உள்ளது",
  [CATEGORIES.LIFTING]: "தூக்கும் பணி — தொங்கும் சுமை",
  [CATEGORIES.EXCAVATION]: "அகழி வேலை — இடியும் ஆபத்து",
  [CATEGORIES.HOUSEKEEPING]: "தளத் தூய்மை — வழுக்கி இடறி விழும் ஆபத்து",
  [CATEGORIES.EMERGENCY]: "அவசரப் பாதை அடைக்கப்பட்டுள்ளது",
  [CATEGORIES.SCAFFOLD]: "சாரக்கட்டுக் குறைபாடு — பயன்படுத்தக் கூடாது",
  [CATEGORIES.OVERLOAD]: "இயந்திரத்தில் அதிக சுமை — திறன் மீறல்",
  [CATEGORIES.STRUCK]: "மேலிருந்து விழும் பொருள் — மோதும் ஆபத்து",
};

export const ACTIONS_TA = {
  [ACTIONS.STOP_REMOVE]: "வேலையை உடனே நிறுத்தி, அந்த நபரை ஆபத்து மண்டலத்திலிருந்து வெளியே அழைத்து வரவும்",
  [ACTIONS.ISSUE_PPE]: "வேலையை நிறுத்தி, சரியான PPE கொடுத்து, நன்கு விளக்கிச் சொன்ன பிறகே தொடங்கவும்",
  [ACTIONS.FIT_GUARDRAIL]: "திறந்த விளிம்பு முழுவதும் தரமான கைப்பிடி, இடைத் தடுப்பு, கால் பலகை பொருத்தவும்",
  [ACTIONS.COVER_OPENING]: "HOLE என எழுதிய, எடை தாங்கும் மூடியைப் பொருத்தி, சுற்றிலும் தடுப்பும் போடவும்",
  [ACTIONS.ISOLATE_LOCKOFF]: "மின்சாரத்தை நிறுத்தி, பூட்டி, டேக் போட்டு, தகுதியான மின்வல்லுநரால் சரிசெய்யவும்",
  [ACTIONS.TAPE_IT_UP]: "சேதமான பகுதியில் மின்காப்பு டேப் சுற்றிவிட்டு அந்தக் கருவியைத் தொடர்ந்து பயன்படுத்தவும்",
  [ACTIONS.EXCLUSION_ZONE]: "தடுப்பு போட்டு ஒதுக்கப்பட்ட மண்டலம் அமைத்து, பயிற்சி பெற்ற பேங்க்ஸ்மேனை நியமிக்கவும்",
  [ACTIONS.STOP_LIFT]: "தூக்குதலை நிறுத்தி, சுமையைப் பாதுகாப்பாக இறக்கி, பொறுப்பாளருடன் மீண்டும் திட்டமிடவும்",
  [ACTIONS.CLEAR_ROUTE]: "பாதையை உடனே காலி செய்து, தப்பிக்கும் வழியை எப்போதும் தடையில்லாமல் வைத்திருக்கவும்",
  [ACTIONS.SIGN_THE_ROUTE]: "அடுக்கிய பொருட்களின் மேல் ஏறிச் செல்லுங்கள் என்று அறிவிப்புப் பலகை வைத்து விடவும்",
  [ACTIONS.TIDY_AREA]: "பொருட்களைப் பிரித்து, குறிக்கப்பட்ட சேமிப்பு, கழிவுப் பகுதிக்கு எடுத்துச் செல்லவும்",
  [ACTIONS.SHORE_EXCAVATION]: "உள்ளே செல்வதை நிறுத்தி, பக்கங்களுக்கு ஆதரவு கொடுத்து, விளிம்புத் தடுப்பு பொருத்தவும்",
  [ACTIONS.DEEPEN_EXCAVATION]: "மண் விழுவதற்கு இடம் இருக்கும்படி அகழியை இன்னும் ஆழமாகத் தோண்டி விடவும்",
  [ACTIONS.OFFLOAD_TO_SWL]: "அனுமதித்த அளவுக்கு இறக்கி, SWL தகட்டைச் சரிபார்த்து, ஹாய்ஸ்டை மீண்டும் ஆய்வு செய்யவும்",
  [ACTIONS.COMPLETE_BOARDING]: "பயன்பாட்டை நிறுத்தி, டேக் போட்டு, தளப் பலகையை முடித்து, மீண்டும் ஆய்வு செய்யச் சொல்லவும்",
  [ACTIONS.CLIP_ON]: "வேலையை நிறுத்தி, அந்த நபரின் லான்யார்டை தரமான ஆங்கர் புள்ளியில் கொளுவச் சொல்லவும்",
  [ACTIONS.TELL_SUPERVISOR_LATER]: "ஒரு குறிப்பு எழுதி வைத்து, அடுத்த வாரப் பாதுகாப்புக் கூட்டத்தில் சொன்னால் போதும்",
  [ACTIONS.CARRY_ON_WATCH]: "நீங்கள் பாதுகாப்பான தூரத்தில் நின்று கவனித்துக் கொண்டே வேலையைத் தொடர விடவும்",
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
    ta: {
      title: "தலைக் கவசம் இல்லாமல் வேலை செய்பவர்",
      detail: "ஒரு கம்பிக் கட்டுபவர், தூக்கும் பணி நடக்கும் இடத்தின் கீழே, தரை மட்டத்தில் பாதுகாப்பு ஹெல்மெட் இல்லாமல் வேலை செய்கிறார்.",
    },
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
    ta: {
      title: "மூடப்படாத தரைத் துளை",
      detail: "முதல் தளத்தின் தரையில் மூடியோ தடுப்போ இல்லாத ஒரு துளை திறந்தே உள்ளது. அங்கிருந்து விழுந்தால் 3.4 மீட்டர் தூரம் கீழே விழ வேண்டும்.",
    },
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
    ta: {
      title: "சேதமான மின் கேபிள்",
      detail: "ஒரு மின் கேபிளின் காப்பு கிழிந்து, உள்ளே உள்ள கம்பிகள் தெரிகின்றன. அது ஈரமான தரையில் வேலை நடக்கும் இடத்தின் குறுக்கே கிடக்கிறது.",
    },
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
    ta: {
      title: "முழுமையடையாத சாரக்கட்டுத் தளம்",
      detail: "சாரக்கட்டின் மேல் தளத்தில் பலகைகள் இல்லாத இடைவெளி உள்ளது. ஆனால் அதில் பச்சை டேக் தொங்குகிறது, வேலையாளர்களும் பயன்படுத்துகிறார்கள்.",
    },
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
    ta: {
      title: "ஆட்கள் மேல் செல்லும் தொங்கும் சுமை",
      detail: "கிரேன் ஒரு சுமையைத் தூக்கிச் செல்கிறது. கீழே ஆட்கள் வேலை செய்கிறார்கள், தடுப்பும் இல்லை, பேங்க்ஸ்மேனும் இல்லை.",
    },
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
    ta: {
      title: "ஹார்னஸ் கொளுவாமல் விளிம்பில் வேலை",
      detail: "ஒரு வேலையாளர் திறந்த விளிம்பருகே வேலை செய்கிறார். ஹார்னஸ் அணிந்திருக்கிறார், ஆனால் லான்யார்ட் எந்த ஆங்கர் புள்ளியிலும் கொளுவப்படவில்லை.",
    },
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
    ta: {
      title: "பாதையை அடைக்கும் பொருட்கள்",
      detail: "நடைபாதையில் கழிவுகள், கம்பித் துண்டுகள், சிதறிய சாரக்கட்டுக் குழாய்கள் நிறைந்து கிடக்கின்றன.",
    },
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
    ta: {
      title: "அடைக்கப்பட்ட அவசர வெளியேறும் வழி",
      detail: "அவசர வெளியேறும் கதவின் முன்னால் பொருட்கள் அடுக்கி வைக்கப்பட்டுள்ளன. அறிவிப்புப் பலகை மட்டும் தெரிகிறது.",
    },
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
    ta: {
      title: "ஆதரவு இல்லாத அகழி",
      detail: "2.2 மீட்டர் ஆழமான அகழியின் பக்கங்கள் செங்குத்தாக, எந்த ஆதரவும் இல்லாமல் உள்ளன. தோண்டிய மண் விளிம்பிலேயே குவிந்துள்ளது, தடுப்பும் இல்லை.",
    },
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
    ta: {
      title: "அதிக சுமை ஏற்றிய பொருள் ஹாய்ஸ்ட்",
      detail: "ஹாய்ஸ்ட் கூடையில் அனுமதித்த அளவுக்கு மேல் பொருட்கள் ஏற்றப்பட்டுள்ளன. கூடையின் கைப்பிடிக்கு மேலேயும் பொருட்கள் அடுக்கப்பட்டுள்ளன.",
    },
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
    { id: "correct", label: hazard.category, labelTa: CATEGORIES_TA[hazard.category] || "", correct: true },
    ...decoys.map((d, i) => ({ id: `d${i}`, label: d, labelTa: CATEGORIES_TA[d] || "", correct: false })),
  ]);
}

export function actionOptions(hazard) {
  const decoys = hazard.actionDecoys.slice(0, 3);
  return shuffle([
    { id: "correct", label: hazard.action, labelTa: ACTIONS_TA[hazard.action] || "", correct: true },
    ...decoys.map((d, i) => ({ id: `d${i}`, label: d, labelTa: ACTIONS_TA[d] || "", correct: false })),
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
