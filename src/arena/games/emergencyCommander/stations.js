/* ------------------------------------------------------------------ *
 *  GAME 5 — EMERGENCY RESPONSE COMMANDER
 *  Command stations
 *
 *  The response is COMMANDED BY DOING, not by picking from a list. Each
 *  of the eight ICS steps is a real object somewhere on the site that
 *  the player has to find and act on:
 *
 *      raise the alarm   →  the break-glass call point on the hut
 *      isolate           →  the site intake panel by the compound gate
 *      evacuate          →  the muster point marker
 *      cordon            →  cones you place yourself around the incident
 *      casualty          →  the first-aid post, NOT the casualty
 *      call 999          →  the radio at the command post
 *      meet the services →  the site gate
 *      hand over         →  the command post board
 *
 *  Order matters, because it is the order that saves people. Acting out
 *  of sequence still works but costs scene control; the one thing that
 *  is always wrong is walking into the hazard yourself, and that is
 *  available as a clickable object precisely so it can be refused.
 *
 *  Pure data — no THREE — so the response plan can be reviewed without
 *  reading any 3D code.
 * ------------------------------------------------------------------ */

export const STATION_SCORING = {
  inSequence: 320,
  outOfSequence: 120,
  hazardEntry: -400,
  wrongTarget: -90,
  allStations: 600,
  casualtySurvived: 500,
  siteControlled: 300,
  timeBonusPerSecond: 2,
};

/**
 * `phase` is the ICS order. `effects` move the three live meters.
 * `where` tells the builder which world anchor to place it at.
 */
export const STATIONS = [
  {
    id: "assess",
    phase: 0,
    label: "Command post",
    action: "TAKE COMMAND",
    where: "commandPost",
    prompt: "Take command from a position of safety",
    done: "You have command. You can see the incident and you are not in it.",
    lesson:
      "The first thing a commander does is take a position where they can see the incident and "
      + "stay out of it. A commander inside the hazard is another casualty.",
    effects: { control: 18 },
    ta: { prompt: "பாதுகாப்பான இடத்தில் நின்று பொறுப்பேற்கவும்", label: "கட்டளை மையம்", action: "பொறுப்பேற்கவும்" },
  },
  {
    id: "alarm",
    phase: 1,
    label: "Break-glass call point",
    action: "RAISE THE ALARM",
    where: "callPoint",
    prompt: "Raise the alarm — it is the only thing that moves everybody at once",
    done: "Alarm raised. The whole site is now moving.",
    lesson:
      "The alarm is the highest-value action available to you, and it is almost free. Raise it "
      + "before you do anything clever.",
    effects: { control: 14, evacuation: 10 },
    ta: { prompt: "அலாரம் அடித்து அனைவரையும் எச்சரிக்கவும்", label: "அலாரம் பட்டன்", action: "அலாரம் அடிக்கவும்" },
  },
  {
    id: "isolate",
    phase: 2,
    label: "Site intake panel",
    action: "ISOLATE",
    where: "isolationPanel",
    prompt: "Isolate the supply — from outside the hazard",
    done: "Supply isolated at the intake, from a safe position.",
    lesson:
      "Isolate from outside the hazard. Sending somebody in to throw a switch is how the second "
      + "casualty happens.",
    effects: { control: 16, casualty: 4 },
    ta: { prompt: "தளத்தின் மின் இணைப்பை நிறுத்தவும்", label: "மின் இணைப்புப் பலகை", action: "மின்சாரம் நிறுத்தவும்" },
  },
  {
    id: "evacuate",
    phase: 3,
    label: "Muster point",
    action: "ORDER EVACUATION",
    where: "muster",
    prompt: "Send the workforce to the muster point and get them counted",
    done: "Workforce evacuating. The marshals are counting them in.",
    lesson:
      "Evacuation is not finished when people leave the building. It is finished when somebody "
      + "has counted them and knows who is missing.",
    effects: { control: 10, evacuation: 55 },
    ta: { prompt: "அனைவரையும் ஒன்றுகூடும் இடத்திற்கு அனுப்பவும்", label: "ஒன்றுகூடும் இடம்", action: "வெளியேற்றவும்" },
  },
  {
    id: "cordon",
    phase: 4,
    label: "Cordon",
    action: "PLACE CORDON",
    where: "cordon",
    prompt: "Cordon the incident so nobody walks into it",
    done: "Cordon established. The hazard area is closed off.",
    lesson:
      "A cordon stops the curious and the helpful from becoming casualties. Set it wide — you can "
      + "always bring it in later.",
    effects: { control: 18 },
    ta: { prompt: "கூம்புகளை வைத்து ஆபத்து மண்டலத்தைச் சுற்றி வளைக்கவும்", label: "தடுப்பு வேலி", action: "தடுப்பு அமைக்கவும்" },
  },
  {
    id: "casualty",
    phase: 5,
    label: "First-aid post",
    action: "SEND THE FIRST AIDER",
    where: "firstAid",
    prompt: "Send the trained first aider — do not go yourself",
    done: "The site first aider is on the way with the trauma kit.",
    lesson:
      "You send the trained responder. You do not go yourself, and you do not send willing "
      + "volunteers into a hazard they are not equipped for.",
    effects: { casualty: 26, control: 6 },
    ta: { prompt: "முதலுதவி நிலையத்திலிருந்து உதவியை அழைக்கவும்", label: "முதலுதவி மையம்", action: "முதலுதவியாளரை அனுப்பவும்" },
  },
  {
    id: "services",
    phase: 6,
    label: "Site radio",
    action: "CALL 999",
    where: "radio",
    prompt: "Call the emergency services with what you know now",
    done: "999 called. Services are en route with the details you have.",
    lesson:
      "Call with what you know now and update them later. Never delay the call to make the "
      + "information better.",
    effects: { casualty: 20, control: 12 },
    ta: { prompt: "ரேடியோவில் அவசர சேவைக்கு அழைக்கவும்", label: "தள ரேடியோ", action: "அவசர சேவையை அழைக்கவும்" },
  },
  {
    id: "meet",
    phase: 7,
    label: "Emergency vehicle gate",
    action: "MEET THE SERVICES",
    where: "gate",
    prompt: "Put somebody on the gate to bring the ambulance straight in",
    done: "Gate manned. The ambulance will be walked straight to the casualty.",
    lesson:
      "An ambulance that cannot find the entrance is an ambulance that is not treating anybody. "
      + "Somebody meets them, every time.",
    effects: { casualty: 14, control: 16 },
    ta: { prompt: "வரும் அவசர வாகனத்தை வாயிலில் வரவேற்று உள்ளே கொண்டு வரவும்", label: "அவசர வாகன வாயில்", action: "சேவையினரை வரவேற்கவும்" },
  },
];

export const STATION_COUNT = STATIONS.length;

/**
 * The trap. It is a real, clickable object in the world because the
 * decision to NOT do it is the whole lesson — the game has to give the
 * player the chance to get it wrong.
 */
export const HAZARD_ENTRY = {
  id: "enter",
  label: "The incident itself",
  action: "GO IN YOURSELF",
  prompt: "Enter the hazard",
  feedback:
    "You walked into the hazard. A commander who enters the incident stops being a commander, "
    + "and the people outside now have two problems instead of one.",
  effects: { control: -30, casualty: -12 },
};

export function stationById(id) {
  return STATIONS.find((s) => s.id === id) || null;
}
