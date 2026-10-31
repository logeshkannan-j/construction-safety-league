/* ------------------------------------------------------------------ *
 *  MISSION BRIEFS — what each 3D mission asks of you, in English and
 *  Tamil, plus the event's rules and regulations.
 *
 *  This is the content behind the demo screen the host shows on the TV
 *  before releasing a round. The host can also paste a demo VIDEO per
 *  mission per language (see `missionVideos` on the game record); when
 *  one is set it plays above this text, and when one is not, this text
 *  IS the briefing — so the screen is useful before any video exists.
 *
 *  The same text is what the voice-over reads out, so it is written to
 *  be spoken: short sentences, no punctuation a screen reader will
 *  stumble on, no abbreviations that only make sense in writing.
 *
 *  TRANSLATION NOTE
 *  ----------------
 *  The Tamil here is written to be understood by site crews rather than
 *  to be a word-for-word rendering of the English, and safety terms
 *  that are used in English on Indian sites are deliberately left in
 *  English (helmet, crane, lift, muster point). It has NOT been checked
 *  by a native Tamil speaker. Have someone read it before the event.
 * ------------------------------------------------------------------ */

export const LANGUAGES = [
  { id: "en", label: "English", short: "EN", speechLang: "en-IN" },
  { id: "ta", label: "தமிழ்", short: "TA", speechLang: "ta-IN" },
];

export const DEFAULT_LANGUAGE = "en";

export function isLanguage(id) {
  return LANGUAGES.some((l) => l.id === id);
}

export function languageById(id) {
  return LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];
}

/* ----------------------- rules and regulations ----------------------- */

export const EVENT_RULES = {
  en: {
    title: "Rules and regulations",
    items: [
      "One phone, one player. Do not play on somebody else's account.",
      "The host starts every round. Everybody starts the round at the same moment.",
      "Finish a round sooner and you score more. The clock only runs while a round is open, so waiting for the host costs you nothing.",
      "Answer options are shuffled for every player, so the person next to you does not have the same answer in the same place.",
      "Every question is timed. A faster correct answer is worth more than a slow one. A wrong answer scores nothing.",
      "You cannot go back to a question once you have answered it.",
      "Leaving a mission early scores whatever you had reached. You cannot replay it.",
      "If your phone drops out, rejoin with the same name. Your score and your place in the round are kept.",
      "The host's decision on any dispute is final.",
    ],
  },
  ta: {
    title: "விதிகள் மற்றும் நிபந்தனைகள்",
    items: [
      "ஒரு ஃபோன், ஒரு வீரர். வேறு ஒருவரின் கணக்கில் விளையாடக் கூடாது.",
      "ஒவ்வொரு சுற்றையும் தொகுப்பாளர் தொடங்குவார். அனைவரும் ஒரே நேரத்தில் சுற்றைத் தொடங்குவீர்கள்.",
      "சுற்றை விரைவாக முடித்தால் அதிக மதிப்பெண். சுற்று திறந்திருக்கும் போது மட்டுமே கடிகாரம் ஓடும், எனவே தொகுப்பாளருக்காகக் காத்திருப்பதால் உங்களுக்கு எந்த இழப்பும் இல்லை.",
      "ஒவ்வொரு வீரருக்கும் விடைகளின் வரிசை மாறும், எனவே உங்கள் அருகில் இருப்பவருக்கு அதே இடத்தில் அதே விடை இருக்காது.",
      "ஒவ்வொரு கேள்விக்கும் நேர வரம்பு உண்டு. வேகமாகச் சரியான விடை அளித்தால் அதிக மதிப்பெண். தவறான விடைக்கு மதிப்பெண் இல்லை.",
      "ஒரு கேள்விக்கு விடை அளித்த பிறகு மீண்டும் அதற்குச் செல்ல முடியாது.",
      "பணியை இடையில் நிறுத்தினால், அதுவரை பெற்ற மதிப்பெண் மட்டுமே கிடைக்கும். மீண்டும் விளையாட முடியாது.",
      "உங்கள் ஃபோன் துண்டிக்கப்பட்டால், அதே பெயரில் மீண்டும் இணையுங்கள். உங்கள் மதிப்பெண்ணும் சுற்றில் உங்கள் இடமும் பாதுகாக்கப்படும்.",
      "எந்தவொரு தகராறிலும் தொகுப்பாளரின் முடிவே இறுதியானது.",
    ],
  },
};

/* --------------------------- the five missions --------------------------- */

export const MISSION_BRIEFS = {
  "safety-mission": {
    en: {
      title: "Safety Mission Simulator",
      oneLiner: "Walk the site. Find what is wrong. Fix it.",
      goal:
        "You are the safety officer on the Casagrand Aria site. Walk the whole site on foot, find every hazard, say what kind of hazard it is, and choose the action that actually removes it.",
      steps: [
        "Walk the site with the joystick on the left, and look around by dragging anywhere on the right.",
        "A hazard glows when you are close enough to inspect it. Walk up to it and press INSPECT.",
        "Say what kind of hazard it is first, then choose the control that removes it.",
        "A sign or a line of tape is not a control. It warns somebody that the hazard is there. It does not stop it hurting them.",
        "Use TOP VIEW at any time to lift off the ground and see the whole site, so you can find what you have missed.",
        "Find all of them before the shift ends.",
      ],
      scoring: [
        "Points for every hazard you find and classify correctly.",
        "More points for the right control, fewer for a control that only warns.",
        "A wrong answer costs you points, so look properly before you choose.",
        "Finding every hazard is worth a bonus on top.",
      ],
    },
    ta: {
      title: "பாதுகாப்புப் பணி உருவகப்படுத்தி",
      oneLiner: "தளத்தைச் சுற்றி நடங்கள். தவறு எது என்று கண்டறியுங்கள். சரிசெய்யுங்கள்.",
      goal:
        "நீங்கள் Casagrand Aria தளத்தின் பாதுகாப்பு அதிகாரி. தளம் முழுவதும் நடந்து, ஒவ்வொரு ஆபத்தையும் கண்டறிந்து, அது எந்த வகை ஆபத்து என்று சொல்லி, அதை உண்மையில் நீக்கும் நடவடிக்கையைத் தேர்ந்தெடுங்கள்.",
      steps: [
        "இடதுபுறம் உள்ள ஜாய்ஸ்டிக் மூலம் நடங்கள். வலதுபுறம் எங்கு வேண்டுமானாலும் இழுத்துச் சுற்றிப் பாருங்கள்.",
        "ஆபத்து அருகில் சென்றால் அது ஒளிரும். அருகில் சென்று INSPECT ஐ அழுத்துங்கள்.",
        "முதலில் அது எந்த வகை ஆபத்து என்று சொல்லுங்கள். பிறகு அதை நீக்கும் கட்டுப்பாட்டைத் தேர்ந்தெடுங்கள்.",
        "ஒரு அறிவிப்புப் பலகையோ டேப்போ கட்டுப்பாடு அல்ல. அது ஆபத்து இருப்பதை மட்டுமே எச்சரிக்கிறது. காயத்தைத் தடுப்பதில்லை.",
        "எப்போது வேண்டுமானாலும் TOP VIEW ஐப் பயன்படுத்தி மேலே சென்று தளம் முழுவதையும் பாருங்கள். விட்டுப்போனவற்றைக் கண்டுபிடிக்க இது உதவும்.",
        "ஷிஃப்ட் முடிவதற்குள் அனைத்தையும் கண்டுபிடியுங்கள்.",
      ],
      scoring: [
        "நீங்கள் கண்டறிந்து சரியாக வகைப்படுத்தும் ஒவ்வொரு ஆபத்துக்கும் மதிப்பெண்.",
        "சரியான கட்டுப்பாட்டுக்கு அதிக மதிப்பெண். எச்சரிப்பது மட்டுமே செய்யும் கட்டுப்பாட்டுக்குக் குறைவு.",
        "தவறான விடை மதிப்பெண்ணைக் குறைக்கும், எனவே நன்றாகப் பார்த்துவிட்டுத் தேர்ந்தெடுங்கள்.",
        "எல்லா ஆபத்துகளையும் கண்டுபிடித்தால் கூடுதல் போனஸ்.",
      ],
    },
  },

  "crane-master": {
    en: {
      title: "Tower Crane Master",
      oneLiner: "Slew, trolley and hoist, without swinging a load over anybody.",
      goal:
        "Take the cab of the tower crane and land one load exactly where it belongs, without ever taking it over a person, a structure or an exclusion zone.",
      steps: [
        "Hook on to the load first. Get the hook over it, then press ATTACH.",
        "SLEW swings the jib around. TROLLEY runs the hook in and out along the jib. HOIST raises and lowers it.",
        "Do one motion at a time. Slewing and hoisting together is how loads hit scaffolds.",
        "Ease the controls on and off. Snatching them is what makes a load swing, and a swinging load will not land where you want it.",
        "Never carry the load over a worker or over an exclusion zone. The crane will warn you.",
        "Watch the wind. Above the limit, stop the lift.",
        "E-STOP brakes everything at once. Use it the moment anything looks wrong.",
        "Land the load in the marked square, then press RELEASE.",
      ],
      scoring: [
        "Points for landing the load accurately and for a steady lift.",
        "Every safety violation costs points, and carrying a load over a person costs the most.",
        "A smooth lift with no violations is worth a large bonus.",
      ],
    },
    ta: {
      title: "டவர் கிரேன் மாஸ்டர்",
      oneLiner: "யார் மீதும் சுமையைக் கொண்டு செல்லாமல் கிரேனை இயக்குங்கள்.",
      goal:
        "டவர் கிரேனின் கேபினில் அமர்ந்து, ஒரு சுமையை அது சேர வேண்டிய இடத்தில் சரியாக இறக்குங்கள். எந்த நேரத்திலும் அதை ஒரு நபர், கட்டமைப்பு அல்லது தடைசெய்யப்பட்ட பகுதி மீது கொண்டு செல்லக் கூடாது.",
      steps: [
        "முதலில் சுமையைக் கொக்கியில் மாட்டுங்கள். கொக்கியை அதன் மேல் கொண்டு வந்து ATTACH ஐ அழுத்துங்கள்.",
        "SLEW ஜிப்பைச் சுழற்றும். TROLLEY கொக்கியை ஜிப்பில் உள்ளேயும் வெளியேயும் நகர்த்தும். HOIST அதை மேலேயும் கீழேயும் கொண்டு செல்லும்.",
        "ஒரு நேரத்தில் ஒரு இயக்கம் மட்டும். சுழற்றுவதும் தூக்குவதும் ஒன்றாகச் செய்தால்தான் சுமை சாரக்கட்டில் மோதுகிறது.",
        "கட்டுப்பாடுகளை மெதுவாகத் தொடங்கி மெதுவாக நிறுத்துங்கள். சட்டென இயக்கினால் சுமை ஆடும். ஆடும் சுமை நீங்கள் நினைத்த இடத்தில் இறங்காது.",
        "ஒரு தொழிலாளி மீதோ தடைசெய்யப்பட்ட பகுதி மீதோ சுமையைக் கொண்டு செல்லவே கூடாது. கிரேன் உங்களை எச்சரிக்கும்.",
        "காற்றைக் கவனியுங்கள். வரம்புக்கு மேல் சென்றால் தூக்குவதை நிறுத்துங்கள்.",
        "E-STOP அனைத்து இயக்கங்களையும் உடனே நிறுத்தும். ஏதாவது தவறாகத் தோன்றினால் உடனே அழுத்துங்கள்.",
        "குறிக்கப்பட்ட சதுரத்தில் சுமையை இறக்கி RELEASE ஐ அழுத்துங்கள்.",
      ],
      scoring: [
        "சுமையைச் சரியாக இறக்கியதற்கும் நிதானமான தூக்குதலுக்கும் மதிப்பெண்.",
        "ஒவ்வொரு பாதுகாப்பு மீறலும் மதிப்பெண்ணைக் குறைக்கும். ஒரு நபர் மீது சுமையைக் கொண்டு செல்வது மிகப் பெரிய இழப்பு.",
        "மீறல் இல்லாத நிதானமான தூக்குதலுக்குப் பெரிய போனஸ்.",
      ],
    },
  },

  "safest-tower": {
    en: {
      title: "Spot the Hazards",
      oneLiner: "A sign is not a control.",
      goal:
        "Walk the ground level compound before the shift starts. Five things down here are wrong. Inspect each one and choose the control that actually removes the risk, not the one that only warns people it is there.",
      steps: [
        "Drag to orbit around the compound, and pinch or use ZOOM to look closer.",
        "The five hazards are flagged. Tap one to inspect it and read what is wrong.",
        "Choose from four controls. Three of them are things people really do on site instead of fixing the problem.",
        "Ask yourself one question. Does this remove the hazard, or does it just tell somebody the hazard is there?",
        "NEXT jumps you to the next hazard you have not solved yet.",
        "TOP VIEW lifts you above the compound to see all five at once.",
      ],
      scoring: [
        "Full points for getting a hazard right first time, half for getting it right after a miss.",
        "A wrong answer costs points.",
        "Solving all five is worth a large bonus, and so is the time you have left.",
      ],
    },
    ta: {
      title: "ஆபத்துகளைக் கண்டறியுங்கள்",
      oneLiner: "அறிவிப்புப் பலகை ஒரு கட்டுப்பாடு அல்ல.",
      goal:
        "ஷிஃப்ட் தொடங்கும் முன் தரைத்தள வளாகத்தைச் சுற்றிப் பாருங்கள். இங்கே ஐந்து விஷயங்கள் தவறாக உள்ளன. ஒவ்வொன்றையும் ஆய்வு செய்து, ஆபத்தை உண்மையில் நீக்கும் கட்டுப்பாட்டைத் தேர்ந்தெடுங்கள். வெறுமனே எச்சரிப்பதை அல்ல.",
      steps: [
        "வளாகத்தைச் சுற்றிப் பார்க்க இழுங்கள். நெருக்கமாகப் பார்க்க பின்ச் செய்யுங்கள் அல்லது ZOOM ஐப் பயன்படுத்துங்கள்.",
        "ஐந்து ஆபத்துகளும் குறிக்கப்பட்டுள்ளன. ஒன்றைத் தட்டி, என்ன தவறு என்று படியுங்கள்.",
        "நான்கு கட்டுப்பாடுகளில் ஒன்றைத் தேர்ந்தெடுங்கள். அவற்றில் மூன்று, பிரச்சினையைச் சரிசெய்வதற்குப் பதிலாக தளங்களில் உண்மையில் செய்யப்படும் விஷயங்கள்.",
        "ஒரு கேள்வியை உங்களையே கேளுங்கள். இது ஆபத்தை நீக்குகிறதா, அல்லது ஆபத்து இருப்பதை மட்டும் சொல்கிறதா?",
        "NEXT உங்களை நீங்கள் இன்னும் தீர்க்காத அடுத்த ஆபத்துக்குக் கொண்டு செல்லும்.",
        "TOP VIEW உங்களை வளாகத்திற்கு மேலே கொண்டு சென்று ஐந்தையும் ஒரே நேரத்தில் காட்டும்.",
      ],
      scoring: [
        "முதல் முயற்சியிலேயே சரியாகச் சொன்னால் முழு மதிப்பெண். ஒரு தவறுக்குப் பிறகு சரியாகச் சொன்னால் பாதி.",
        "தவறான விடை மதிப்பெண்ணைக் குறைக்கும்.",
        "ஐந்தையும் தீர்த்தால் பெரிய போனஸ். மீதமுள்ள நேரத்திற்கும் போனஸ்.",
      ],
    },
  },

  "escape-challenge": {
    en: {
      title: "Safety Escape Challenge",
      oneLiner: "Five areas. One safe way out.",
      goal:
        "The alarm has gone off on a newly fitted out floor of the tower. Work your way out through five areas, solve the safety problem that unlocks each door, put the fire out with your own hands, and reach the assembly area before the clock runs out.",
      steps: [
        "Walk with the joystick, look around by dragging, and press USE to interact.",
        "Each area has one decision point. Answer it correctly and the door to the next area unlocks.",
        "In the plant room there is a fire. Pick up the right extinguisher for that class of fire, carry it to the fire, and discharge it. Carrying the wrong one wastes your time.",
        "The final door is not the finish line. You are safe when you are standing at the muster point, not when you are outside the building.",
        "PLAN VIEW lifts the ceilings off and shows the whole floor from above as an escape plan. Use it if you lose your way.",
      ],
      scoring: [
        "Points for every decision point you get right first time.",
        "Putting the fire out with the correct extinguisher is worth a large bonus.",
        "Every wrong decision costs you time as well as points.",
        "Reaching the muster point before the clock runs out is worth a bonus, and so is the time you have left.",
      ],
    },
    ta: {
      title: "பாதுகாப்பான தப்பிப்பு சவால்",
      oneLiner: "ஐந்து பகுதிகள். வெளியேற ஒரே பாதுகாப்பான வழி.",
      goal:
        "கோபுரத்தின் புதிதாக முடிக்கப்பட்ட ஒரு தளத்தில் அலாரம் ஒலித்துவிட்டது. ஐந்து பகுதிகள் வழியாக வெளியேறுங்கள். ஒவ்வொரு கதவையும் திறக்கும் பாதுகாப்புப் பிரச்சினையைத் தீருங்கள். தீயை உங்கள் கையாலேயே அணையுங்கள். நேரம் முடிவதற்குள் ஒன்றுகூடும் இடத்தை அடையுங்கள்.",
      steps: [
        "ஜாய்ஸ்டிக் மூலம் நடங்கள். இழுத்துச் சுற்றிப் பாருங்கள். தொடர்பு கொள்ள USE ஐ அழுத்துங்கள்.",
        "ஒவ்வொரு பகுதியிலும் ஒரு முடிவெடுக்கும் இடம் உள்ளது. சரியாக விடையளித்தால் அடுத்த பகுதிக்கான கதவு திறக்கும்.",
        "இயந்திர அறையில் தீ உள்ளது. அந்த வகைத் தீக்குச் சரியான தீயணைப்பானை எடுத்து, தீ அருகில் கொண்டு சென்று அணையுங்கள். தவறானதைக் கொண்டு சென்றால் நேரம் வீணாகும்.",
        "கடைசிக் கதவு முடிவுக் கோடு அல்ல. கட்டிடத்தை விட்டு வெளியே வந்தால் பாதுகாப்பு இல்லை. ஒன்றுகூடும் இடத்தில் நின்றால்தான் பாதுகாப்பு.",
        "PLAN VIEW மேற்கூரையை அகற்றி, தளம் முழுவதையும் மேலிருந்து தப்பிப்புத் திட்டமாகக் காட்டும். வழி தெரியவில்லை என்றால் பயன்படுத்துங்கள்.",
      ],
      scoring: [
        "முதல் முயற்சியிலேயே சரியாக முடிவெடுக்கும் ஒவ்வொன்றுக்கும் மதிப்பெண்.",
        "சரியான தீயணைப்பானால் தீயை அணைத்தால் பெரிய போனஸ்.",
        "ஒவ்வொரு தவறான முடிவும் மதிப்பெண்ணையும் நேரத்தையும் இழக்கச் செய்யும்.",
        "நேரம் முடிவதற்குள் ஒன்றுகூடும் இடத்தை அடைந்தால் போனஸ். மீதமுள்ள நேரத்திற்கும் போனஸ்.",
      ],
    },
  },

  "emergency-commander": {
    en: {
      title: "Emergency Response Commander",
      oneLiner: "Something has gone wrong. You are in charge.",
      goal:
        "An incident has happened on your site. There is no list of options to pick from. The eight steps of a real emergency response are eight things on the site that you have to find and use, in the right order.",
      steps: [
        "Look around the site and tap a station to act on it. The ones you still have to do are marked.",
        "Take command first. Nothing else works until somebody is in charge.",
        "Then raise the alarm, isolate the supply, order the evacuation, place the cordon, call the emergency services, and send somebody to meet them at the gate.",
        "Order matters. Doing the right thing at the wrong time still costs you.",
        "Never walk into the incident yourself. It is always available and it is always wrong. A commander who becomes a second casualty has stopped commanding.",
        "TOP VIEW stands you off the whole site so you can see where everybody is.",
        "BRIEF re-reads the incident brief if you need it again.",
      ],
      scoring: [
        "Points for every one of the eight actions you take.",
        "More points for taking them in the right order.",
        "Walking into the incident costs you heavily and is called out in your debrief.",
        "The faster the site is cleared and the services are met, the higher you score.",
      ],
    },
    ta: {
      title: "அவசரகால மீட்பு தளபதி",
      oneLiner: "ஏதோ தவறு நடந்துவிட்டது. பொறுப்பு உங்களுடையது.",
      goal:
        "உங்கள் தளத்தில் ஒரு விபத்து நடந்துள்ளது. தேர்ந்தெடுக்க விருப்பப் பட்டியல் எதுவும் இல்லை. உண்மையான அவசரகால மீட்பின் எட்டு படிகளும், தளத்தில் நீங்கள் கண்டுபிடித்துப் பயன்படுத்த வேண்டிய எட்டு பொருட்கள். சரியான வரிசையில் செய்ய வேண்டும்.",
      steps: [
        "தளத்தைச் சுற்றிப் பார்த்து, ஒரு நிலையத்தைத் தட்டி செயல்படுங்கள். இன்னும் செய்ய வேண்டியவை குறிக்கப்பட்டிருக்கும்.",
        "முதலில் பொறுப்பை ஏற்றுக் கொள்ளுங்கள். யாராவது பொறுப்பேற்கும் வரை வேறு எதுவும் வேலை செய்யாது.",
        "பிறகு அலாரம் அடியுங்கள், மின்சாரத்தைத் துண்டியுங்கள், வெளியேற்றத்திற்கு உத்தரவிடுங்கள், தடுப்பு அமையுங்கள், அவசர சேவைகளை அழையுங்கள், அவர்களை வாயிலில் சந்திக்க ஒருவரை அனுப்புங்கள்.",
        "வரிசை முக்கியம். சரியான செயலைத் தவறான நேரத்தில் செய்தாலும் இழப்புதான்.",
        "விபத்து நடந்த இடத்திற்கு நீங்களே நடந்து செல்லவே கூடாது. அந்த வாய்ப்பு எப்போதும் இருக்கும், அது எப்போதும் தவறு. தளபதியே இரண்டாவது காயமடைந்தவராக மாறினால் தலைமை என்பதே இல்லை.",
        "TOP VIEW உங்களை தளம் முழுவதற்கும் மேலே கொண்டு சென்று யார் எங்கே இருக்கிறார்கள் என்று காட்டும்.",
        "BRIEF விபத்து விவரத்தை மீண்டும் படிக்கத் தரும்.",
      ],
      scoring: [
        "எட்டு செயல்களில் நீங்கள் செய்யும் ஒவ்வொன்றுக்கும் மதிப்பெண்.",
        "சரியான வரிசையில் செய்தால் அதிக மதிப்பெண்.",
        "விபத்து இடத்திற்குள் நடந்து சென்றால் பெரிய இழப்பு. அது உங்கள் மதிப்பாய்வில் குறிப்பிடப்படும்.",
        "தளத்தை விரைவாகக் காலி செய்து அவசர சேவைகளைச் சந்தித்தால் அதிக மதிப்பெண்.",
      ],
    },
  },
};

export const BRIEF_GAME_IDS = Object.keys(MISSION_BRIEFS);

/** The brief for one mission in one language, falling back to English. */
export function missionBrief(gameId, lang = DEFAULT_LANGUAGE) {
  const entry = MISSION_BRIEFS[gameId];
  if (!entry) return null;
  return entry[lang] || entry[DEFAULT_LANGUAGE] || null;
}

export function eventRules(lang = DEFAULT_LANGUAGE) {
  return EVENT_RULES[lang] || EVENT_RULES[DEFAULT_LANGUAGE];
}

/**
 * The brief as one block of speech.
 *
 * Built from the same text that is on screen, so the voice-over can
 * never say something different from what the player is reading.
 */
export function briefSpeech(gameId, lang = DEFAULT_LANGUAGE, { includeRules = false } = {}) {
  const brief = missionBrief(gameId, lang);
  if (!brief) return "";
  const parts = [brief.title, brief.oneLiner, brief.goal, ...brief.steps, ...brief.scoring];
  if (includeRules) {
    const rules = eventRules(lang);
    parts.push(rules.title, ...rules.items);
  }
  // A full stop between blocks gives the synthesiser somewhere to breathe.
  return parts
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => (/[.。!?]$/.test(line) ? line : `${line}.`))
    .join(" ");
}

/**
 * The host's demo videos live on the game record as
 * `missionVideos[gameId][lang]`, so they use the same storage, the same
 * security rules and the same admin flow as the leaderboard media that
 * is already there.
 */
export function emptyMissionVideos() {
  const out = {};
  BRIEF_GAME_IDS.forEach((id) => { out[id] = { en: "", ta: "" }; });
  return out;
}

/** The demo video for a mission, falling back to the other language. */
export function missionVideoUrl(game, gameId, lang = DEFAULT_LANGUAGE) {
  const entry = game?.missionVideos?.[gameId];
  if (!entry) return "";
  const url = String(entry[lang] || "").trim();
  if (url) return url;
  const other = LANGUAGES.find((l) => l.id !== lang);
  return String(entry[other?.id] || "").trim();
}
