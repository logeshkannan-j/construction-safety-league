

export const SCENARIOS = [
  /* =================================================================== *
   *  FIRE
   * =================================================================== */
  {
    id: "fire",
    scene: "fire",
    title: "Fire in the plant room",
    alert: "SMOKE REPORTED — PLANT ROOM, GROUND FLOOR, EAST END",
    brief:
      "A fire has started in the ground floor plant room. Thick smoke is tracking along the " +
      "ground floor. There are LPG cylinders stored against the external wall ten metres away, " +
      "and one worker has not been accounted for.",
    ta: {
      title: "இயந்திர அறையில் தீ விபத்து",
      alert: "புகை தெரிவிக்கப்பட்டது — இயந்திர அறை, தரை தளம், கிழக்கு முனை",
      brief: "தரை தளத்தின் இயந்திர அறையில் தீ பிடித்துள்ளது. அடர்ந்த புகை தரை தளம் முழுவதும் பரவுகிறது. பத்து மீட்டர் தொலைவில் வெளிச் சுவரோரம் LPG சிலிண்டர்கள் சேமித்து வைக்கப்பட்டுள்ளன, ஒரு வேலையாளரைக் காணவில்லை.",
    },
  },

  /* =================================================================== *
   *  FALL FROM HEIGHT — suspended in harness
   * =================================================================== */
  {
    id: "fall",
    scene: "fall",
    title: "Fall from height — operative suspended",
    alert: "MAN DOWN — SCAFFOLD, LEVEL 3, WEST ELEVATION",
    brief:
      "A steel erector has fallen from the third lift of the scaffold and is hanging in his harness " +
      "about nine metres up. His lanyard has arrested the fall. He is conscious but not moving much, " +
      "and he has been suspended for an unknown length of time.",
    ta: {
      title: "உயரத்திலிருந்து விழுந்து ஹார்னஸில் தொங்குகிறார்",
      alert: "ஆள் விழுந்துவிட்டார் — சாரக்கட்டு, நிலை 3, மேற்கு பக்கம்",
      brief: "ஒரு இரும்புப் பணியாளர் சாரக்கட்டின் மூன்றாவது நிலையிலிருந்து விழுந்து, சுமார் ஒன்பது மீட்டர் உயரத்தில் ஹார்னஸில் தொங்குகிறார். லான்யார்ட் விழுவதைத் தடுத்துள்ளது. அவருக்கு நினைவு உள்ளது, ஆனால் அதிகம் அசையவில்லை; எவ்வளவு நேரம் தொங்குகிறார் என்று தெரியவில்லை.",
    },
  },

  /* =================================================================== *
   *  ELECTRICAL CONTACT
   * =================================================================== */
  {
    id: "electrical",
    scene: "electrical",
    title: "Electrical contact — worker in contact with a live cable",
    alert: "CASUALTY — LEVEL 1 EAST, ELECTRICAL CONTACT",
    brief:
      "A worker cutting a chase has struck a buried live cable. He is on the floor, not moving, and " +
      "the damaged cable is still in contact with the wet concrete around him. Two colleagues are " +
      "standing over him.",
    ta: {
      title: "மின்சாரத் தொடர்பு — கம்பியில் சிக்கிய வேலையாளர்",
      alert: "காயமடைந்தவர் — நிலை 1 கிழக்கு, மின்சாரத் தொடர்பு",
      brief: "சுவரில் பாதை வெட்டிக் கொண்டிருந்த வேலையாளர், உள்ளே புதைந்திருந்த மின்சாரக் கம்பியை வெட்டிவிட்டார். அவர் தரையில் அசையாமல் கிடக்கிறார், சேதமான கம்பி இன்னும் அவரைச் சுற்றியுள்ள ஈரமான கான்கிரீட்டைத் தொட்டுக் கொண்டிருக்கிறது. இரண்டு சகாக்கள் அவர் அருகில் நிற்கிறார்கள்.",
    },
  },
];


/** A scenario by id (the host or a test can name one), otherwise at random. */
export function pickScenario(preferId = null) {
  return SCENARIOS.find((s) => s.id === preferId)
    || SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
}
