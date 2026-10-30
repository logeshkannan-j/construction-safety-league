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
  },
  {
    id: "mq5",
    tier: "Gold Badge",
    topic: TOPICS.CRANE,
    question: "What is the usual minimum safe approach distance to overhead power lines for plant, unless the line is isolated?",
    options: [
      "A distance set by the line's voltage and the network operator, commonly 6 to 15 metres",
      "Half a metre in every case, measured from the outermost conductor of the line",
      "Two metres in all cases, whatever the line voltage",
      "No distance, provided insulated gloves are worn",
    ],
    correct: 0,
    points: 600,
    explanation: "Electricity can arc across a gap. The clearance depends on voltage and must come from the network operator, not from a rule of thumb.",
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
  },

  /* ----------------------------- Gold ----------------------------- */
  {
    id: "mq13",
    tier: "Gold Badge",
    topic: TOPICS.EXCAVATION,
    question: "What does the term 'surcharge' describe at an excavation?",
    options: [
      "Extra load near the crest — spoil, plant or materials — that can collapse the face",
      "The additional cost of shoring and support charged against the excavation",
      "The extra depth dug below the design formation level",
      "The charge for disposing of excavated material",
    ],
    correct: 0,
    points: 600,
    explanation: "Spoil heaped at the edge, or a lorry parked beside it, loads the ground the face depends on. Keeping the crest clear is as important as the support itself.",
  },
  {
    id: "mq14",
    tier: "Gold Badge",
    topic: TOPICS.ELECTRICAL,
    question: "Why is 110 V centre-tapped supply preferred to 240 V on construction sites?",
    options: [
      "A fault gives a maximum of 55 V to earth, which is far less likely to be lethal",
      "The cable, connector and distribution cost is lower across a large site",
      "The tools run with more torque at the lower voltage",
      "It removes the fire risk from damaged leads entirely",
    ],
    correct: 0,
    points: 600,
    explanation: "Centre-tapping means the worst shock to earth is 55 V rather than 240 V. It does not make electricity safe — it makes a mistake survivable.",
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
