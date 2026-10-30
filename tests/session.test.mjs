/**
 * Tests for the integrated participant session: the question draw, the
 * shuffling, correct-answer remapping, refresh stability, scoring,
 * duplicate prevention, host-released rounds and the stage machine.
 *
 * A session is FIVE ROUNDS. Each round is one 3D mission, then one quiz
 * question, then one finale question — 15 items in total.
 */

const SRC = new URL("../src", import.meta.url).href;

const bank = await import(`${SRC}/questionBank.js`);
const session = await import(`${SRC}/session.js`);
const arena = await import(`${SRC}/arena/arenaConstants.js`);

const { QUIZ_BANK, MILLIONAIRE_BANK, TOPICS, TIER_ORDER } = bank;
const {
  createSession, createSessionDescriptor, createLivePaper, hydrateSession,
  isSessionValid, applyPermutation, scoreAnswer, answerQuestion, advanceQuestion,
  releaseRound, completeGame3d, skipGame3d, currentRound, game3dPoints,
  sectionTotals, sessionSummary, sessionProgress, questionRemainingMs,
  STAGES, QUIZ_SECONDS, MILLIONAIRE_SECONDS, SESSION_VERSION,
  ROUND_COUNT, ROUND_GAMES, ROUND_MISSION_NAMES, ROUND_MISSION_BLURBS,
  QUIZ_COUNT, MILLIONAIRE_COUNT, TOTAL_QUESTIONS, TOTAL_ITEMS,
  GAME_POINTS_PER_ROUND, NOT_RELEASED,
  QUIZ_PER_ROUND, MQ_PER_ROUND, QUIZ_PER_ROUND_OPTIONS,
  quizPerRoundOf, currentQuestion, totalItems, itemsPerRound, clampQuizPerRound,
} = session;

/** Plays every MCQ in the current round, then the finale question. */
function playRound(s, { now }) {
  let out = s;
  let guard = 0;
  while (out.stage === STAGES.QUIZ && guard++ < 12) {
    const q = currentQuestion(out);
    out = answerQuestion(out, { section: "quiz", pickedIndex: q.correct, now: now() }).session;
    out = advanceQuestion(out, { now: now() });
  }
  const mq = currentQuestion(out);
  out = answerQuestion(out, { section: "mq", pickedIndex: mq.correct, now: now() }).session;
  return advanceQuestion(out, { now: now() });
}

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, extra = "") {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${extra ? `  — ${extra}` : ""}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }

/* ====================== the bank itself ====================== */

section("Question bank");

check("the quiz bank has at least 24 questions", QUIZ_BANK.length >= 24, `${QUIZ_BANK.length}`);
check("the finale bank has at least 8 questions", MILLIONAIRE_BANK.length >= 8, `${MILLIONAIRE_BANK.length}`);

check("every quiz question id is unique",
  new Set(QUIZ_BANK.map((q) => q.id)).size === QUIZ_BANK.length);
check("every finale question id is unique",
  new Set(MILLIONAIRE_BANK.map((q) => q.id)).size === MILLIONAIRE_BANK.length);

const allBank = [...QUIZ_BANK, ...MILLIONAIRE_BANK];
check("every question has 4 options", allBank.every((q) => q.options.length === 4),
  allBank.filter((q) => q.options.length !== 4).map((q) => q.id).join(","));
check("every question's correct index is in range",
  allBank.every((q) => q.correct >= 0 && q.correct < q.options.length));
check("no question has duplicate options",
  allBank.every((q) => new Set(q.options).size === q.options.length),
  allBank.filter((q) => new Set(q.options).size !== q.options.length).map((q) => q.id).join(","));
check("every question has an explanation", allBank.every((q) => (q.explanation || "").length > 20));
check("every question carries points", allBank.every((q) => Number(q.points) > 0));
check("every question has a topic", allBank.every((q) => !!q.topic));

const required = Object.values(TOPICS);
const covered = new Set(QUIZ_BANK.map((q) => q.topic));
check(`the quiz bank covers all ${required.length} required topics`,
  required.every((t) => covered.has(t)),
  required.filter((t) => !covered.has(t)).join(", "));
check("every topic has at least 2 quiz questions so papers can differ",
  required.every((t) => QUIZ_BANK.filter((q) => q.topic === t).length >= 2),
  required.filter((t) => QUIZ_BANK.filter((q) => q.topic === t).length < 2).join(", "));

check("the finale bank covers every tier",
  TIER_ORDER.every((tier) => MILLIONAIRE_BANK.some((q) => q.tier === tier)),
  TIER_ORDER.filter((tier) => !MILLIONAIRE_BANK.some((q) => q.tier === tier)).join(", "));

check("the bank is not the old seeded question set",
  !QUIZ_BANK.some((q) => q.question.includes("What colour hard hat is typically worn by site visitors")));

/* ====================== round structure ====================== */

section("Round structure");

check(`a session is ${ROUND_COUNT} rounds`, ROUND_COUNT === 5, `${ROUND_COUNT}`);
check(`a round is 1 mission + ${QUIZ_PER_ROUND} quiz + ${MQ_PER_ROUND} finale`,
  QUIZ_COUNT === ROUND_COUNT * QUIZ_PER_ROUND && MILLIONAIRE_COUNT === ROUND_COUNT * MQ_PER_ROUND);
check(`a session is ${ROUND_COUNT} x ${itemsPerRound()} = ${TOTAL_ITEMS} items`,
  TOTAL_ITEMS === ROUND_COUNT * (1 + QUIZ_PER_ROUND + MQ_PER_ROUND),
  `${TOTAL_ITEMS} items / ${TOTAL_QUESTIONS} questions`);
check("the default round is 1 mission + 3 quiz + 1 finale",
  QUIZ_PER_ROUND === 3 && MQ_PER_ROUND === 1, `${QUIZ_PER_ROUND} + ${MQ_PER_ROUND}`);
check("the host can choose the MCQs per round",
  QUIZ_PER_ROUND_OPTIONS.length > 1 && QUIZ_PER_ROUND_OPTIONS.includes(QUIZ_PER_ROUND));
check("an out-of-range choice is clamped rather than accepted",
  clampQuizPerRound(99) <= 4 && clampQuizPerRound(0) >= 1 && clampQuizPerRound("x") >= 1);

// The round list must name real Arena games, or a round would load nothing.
check("every round names a real Arena game",
  ROUND_GAMES.every((id) => arena.GAME_IDS.includes(id)),
  ROUND_GAMES.filter((id) => !arena.GAME_IDS.includes(id)).join(", "));
check("the five rounds use five DIFFERENT missions",
  new Set(ROUND_GAMES).size === ROUND_COUNT);
check("every Arena game is used by exactly one round",
  arena.GAME_IDS.length === ROUND_COUNT && arena.GAME_IDS.every((id) => ROUND_GAMES.includes(id)));
check("every round has a display name and a blurb",
  ROUND_GAMES.every((id) => ROUND_MISSION_NAMES[id] && ROUND_MISSION_BLURBS[id]),
  ROUND_GAMES.filter((id) => !ROUND_MISSION_NAMES[id] || !ROUND_MISSION_BLURBS[id]).join(", "));

/* ====================== the draw ====================== */

section("Session draw");

{
  const d = createSessionDescriptor();
  check(`the descriptor has ${ROUND_COUNT} rounds`, d.rounds.length === ROUND_COUNT, `${d.rounds.length}`);
  check("each round carries a mission, its quiz ids and a finale id",
    d.rounds.every((r) => r.gameId && Array.isArray(r.quiz)
      && r.quiz.length === QUIZ_PER_ROUND && r.quiz.every((q) => q.id) && r.mq?.id));
  check("the rounds use all five missions, each exactly once",
    new Set(d.rounds.map((r) => r.gameId)).size === ROUND_COUNT
    && d.rounds.every((r) => ROUND_GAMES.includes(r.gameId)),
    d.rounds.map((r) => r.gameId).join(","));

  const quizIds = d.rounds.flatMap((r) => r.quiz.map((q) => q.id));
  const mqIds = d.rounds.map((r) => r.mq.id);
  check("no quiz question repeats in a session", new Set(quizIds).size === quizIds.length);
  check("no finale question repeats in a session", new Set(mqIds).size === mqIds.length);

  const { rounds } = hydrateSession({ v: SESSION_VERSION, descriptor: d });
  const topics = rounds.flatMap((r) => r.quiz.map((q) => q.topic));
  check("the quiz questions are spread across many topics",
    new Set(topics).size >= Math.min(10, topics.length),
    `${new Set(topics).size} topics across ${topics.length} questions`);

  const tiers = rounds.map((r) => r.millionaire.tier);
  const ascending = tiers.every((t, i) =>
    i === 0 || TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(tiers[i - 1]));
  check("the finale questions ascend by tier across the rounds", ascending, tiers.join(" -> "));

  const bytes = JSON.stringify(d).length;
  check("the descriptor is small enough to store per player", bytes < 2000, `${bytes} bytes`);
}

/* ============ the host owns the shape of a round ============ */

section("The admin can change the pattern");

{
  for (const n of QUIZ_PER_ROUND_OPTIONS) {
    const s = createSession({ now: 0, quizPerRound: n });
    const { rounds } = hydrateSession(s);
    check(`${n} MCQ per round: every round holds exactly ${n}`,
      rounds.every((r) => r.quiz.length === n),
      rounds.map((r) => r.quiz.length).join(","));
    check(`${n} MCQ per round: the session is ${ROUND_COUNT * (2 + n)} items`,
      totalItems(n) === ROUND_COUNT * (1 + n + MQ_PER_ROUND), `${totalItems(n)}`);
    check(`${n} MCQ per round: the session validates`, isSessionValid(s));
    check(`${n} MCQ per round: the choice is stored on the paper`,
      quizPerRoundOf(s) === n, `${quizPerRoundOf(s)}`);

    // And it actually plays through at that length.
    let x = releaseRound(s, { releasedRound: 0, now: 1 }).session;
    x = completeGame3d(x, { score: 0, maxScore: 12000 }, { now: 2 }).session;
    let answered = 0;
    let clock = 10;
    while (x.stage === STAGES.QUIZ && answered < 10) {
      x = answerQuestion(x, { section: "quiz", pickedIndex: currentQuestion(x).correct, now: (clock += 5) }).session;
      x = advanceQuestion(x, { now: (clock += 5) });
      answered += 1;
    }
    check(`${n} MCQ per round: exactly ${n} were asked before the finale`,
      answered === n && x.stage === STAGES.MILLIONAIRE, `${answered} asked, stage=${x.stage}`);
  }

  // Changing the setting must NOT reshape a paper already in play — the
  // count is baked into the descriptor when the participant joins.
  const joined = createSession({ now: 0, quizPerRound: 2 });
  check("a paper already dealt keeps its own shape",
    quizPerRoundOf(joined) === 2 && hydrateSession(joined).rounds.every((r) => r.quiz.length === 2));
}

/* ====================== variety between participants ====================== */

section("Variety");

{
  const draws = Array.from({ length: 40 }, () => createSessionDescriptor());
  const signatures = new Set(draws.map((d) => d.rounds.flatMap((r) => r.quiz.map((q) => q.id)).join(",")));
  check("40 participants get many different papers", signatures.size > 20, `${signatures.size}/40 distinct`);

  /* ---- shuffle quality, measured rather than assumed ----
   *
   * Every one of these started out broken: the missions were dealt in a
   * fixed order, and Platinum and Diamond had one question each, so the
   * last two rounds were identical for every participant at every event.
   */
  const big = Array.from({ length: 200 }, () => createSessionDescriptor());

  const missionOrders = new Set(big.map((d) => d.rounds.map((r) => r.gameId).join(",")));
  check("the mission order genuinely varies between participants",
    missionOrders.size > 40, `only ${missionOrders.size} distinct orders in 200 draws`);

  const finalePapers = new Set(big.map((d) => d.rounds.map((r) => r.mq.id).join(",")));
  check("the finale paper genuinely varies between participants",
    finalePapers.size > 100, `only ${finalePapers.size} distinct finale papers in 200 draws`);

  // No single question may dominate. A tier with only one question in the
  // bank shows up here instantly as a 100% frequency.
  const freq = {};
  big.forEach((d) => d.rounds.forEach((r) => { freq[r.mq.id] = (freq[r.mq.id] || 0) + 1; }));
  const worst = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  check("no finale question appears in more than 60% of papers",
    worst[1] / big.length <= 0.6, `${worst[0]} appears in ${Math.round((worst[1] / big.length) * 100)}%`);

  // Each mission must be able to land in any round, not just its own.
  const roundsSeenPerMission = {};
  big.forEach((d) => d.rounds.forEach((r, i) => {
    (roundsSeenPerMission[r.gameId] ||= new Set()).add(i);
  }));
  check("every mission can appear in any of the five rounds",
    Object.values(roundsSeenPerMission).every((set) => set.size === ROUND_COUNT),
    Object.entries(roundsSeenPerMission).map(([g, set]) => `${g}:${set.size}`).join(" "));

  // The correct answer must not settle into one slot.
  const slots = new Set();
  draws.forEach((d) => {
    const { rounds } = hydrateSession({ v: SESSION_VERSION, descriptor: d });
    rounds.forEach((r) => { r.quiz.forEach((q) => slots.add(q.correct)); slots.add(r.millionaire.correct); });
  });
  check("the correct answer lands in every option slot across draws",
    slots.size === 4, `slots seen: ${[...slots].sort().join(",")}`);
}

/* ============ the answer must not be guessable ============ */

section("The answer is not findable without knowing it");

{
  // 1. Position. If the correct answer favours a slot, players learn to
  //    pick that slot. Over 2000 questions every slot must be close to
  //    25%, and this is what "it is always option A" would fail.
  const slots = [0, 0, 0, 0];
  for (let i = 0; i < 200; i++) {
    const { rounds } = hydrateSession({ v: SESSION_VERSION, descriptor: createSessionDescriptor() });
    rounds.forEach((r) => { slots[r.quiz.correct] += 1; slots[r.millionaire.correct] += 1; });
  }
  const total = slots.reduce((a, b) => a + b, 0);
  const share = slots.map((n) => n / total);
  check("the correct answer is spread evenly across A/B/C/D",
    share.every((s) => s > 0.18 && s < 0.32),
    share.map((s, i) => `${"ABCD"[i]}:${Math.round(s * 100)}%`).join(" "));
  check("no slot is starved of correct answers", slots.every((n) => n > 0));

  // 2. Length. "The longest option is the answer" is the oldest trick in
  //    multiple choice, and this bank failed it badly: 82% of correct
  //    answers were the longest option, so a player who knew nothing
  //    could score 82% by always picking the longest line.
  //
  //    BOTH directions have to be checked. Over-correcting until the
  //    answer is never the longest just hands players the inverse rule.
  //    Pure chance with four options is 25% each way.
  let longest = 0;
  let shortest = 0;
  let counted = 0;
  for (let i = 0; i < 120; i++) {
    const { rounds } = hydrateSession({ v: SESSION_VERSION, descriptor: createSessionDescriptor() });
    rounds.forEach((r) => {
      [...r.quiz, r.millionaire].forEach((q) => {
        counted += 1;
        const lengths = q.options.map((o) => o.length);
        if (lengths[q.correct] === Math.max(...lengths)) longest += 1;
        if (lengths[q.correct] === Math.min(...lengths)) shortest += 1;
      });
    });
  }
  const longPct = Math.round((longest / counted) * 100);
  const shortPct = Math.round((shortest / counted) * 100);
  check("'always pick the longest option' does not beat guessing",
    longest / counted < 0.42, `${longPct}% of correct answers were longest (chance 25%)`);
  check("'never pick the longest option' does not beat guessing either",
    longest / counted > 0.04, `only ${longPct}% were longest — the inverse rule now works`);
  check("'always pick the shortest option' does not beat guessing",
    shortest / counted < 0.42, `${shortPct}% of correct answers were shortest (chance 25%)`);

  // 3. Shape. The shuffled question must carry NOTHING that marks the
  //    answer beyond the `correct` index the UI never renders.
  const { rounds } = hydrateSession({ v: SESSION_VERSION, descriptor: createSessionDescriptor() });
  const q = rounds[0].quiz[0];
  const leaky = Object.keys(q).filter((k) =>
    /answer|isCorrect|right|solution/i.test(k) && k !== "correct");
  check("a question carries no extra field that marks the answer",
    leaky.length === 0, leaky.join(", "));
  check("options are plain strings with no marker objects",
    q.options.every((o) => typeof o === "string"));
}

/* ====================== option remapping ====================== */

section("Answer remapping");

{
  let wrong = 0;
  for (let i = 0; i < 300; i++) {
    const q = QUIZ_BANK[i % QUIZ_BANK.length];
    const perm = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const shuffled = applyPermutation(q, perm);
    if (shuffled.options[shuffled.correct] !== q.options[q.correct]) wrong++;
  }
  check("300 shuffles never move the correct answer away from its text", wrong === 0, `${wrong} broken`);

  const q = QUIZ_BANK[0];
  const bad = applyPermutation(q, [0, 1]);          // wrong length
  check("a malformed permutation falls back to the original order",
    bad.options[bad.correct] === q.options[q.correct] && bad.options.length === 4);
  check("applyPermutation tolerates a missing question", applyPermutation(null, [0]) === null);
}

/* ====================== refresh safety ====================== */

section("Refresh safety");

{
  const s = createSession({ now: 1000 });
  const roundTrip = JSON.parse(JSON.stringify(s));
  const a = hydrateSession(s);
  const b = hydrateSession(roundTrip);
  const shape = (h) => JSON.stringify(h.rounds.map((r) => [r.gameId, r.quiz.question, r.quiz.options, r.millionaire.question]));
  check("a JSON round-trip rebuilds the identical paper", shape(a) === shape(b));

  check("a fresh session is valid", isSessionValid(s));
  check("a session from an older build is rejected rather than half-used",
    !isSessionValid({ ...s, v: SESSION_VERSION - 1 }));
  check("a session with a missing round is rejected",
    !isSessionValid({ ...s, descriptor: { ...s.descriptor, rounds: s.descriptor.rounds.slice(0, 3) } }));
  check("a session naming an unknown mission is rejected", !isSessionValid({
    ...s,
    descriptor: { ...s.descriptor, rounds: s.descriptor.rounds.map((r, i) => (i === 0 ? { ...r, gameId: "nope" } : r)) },
  }));
  check("garbage is rejected", !isSessionValid(null) && !isSessionValid({}) && !isSessionValid({ v: SESSION_VERSION }));
}

/* ====================== scoring ====================== */

section("Scoring");

{
  const q = { options: ["a", "b", "c", "d"], correct: 2, points: 200 };
  const instant = scoreAnswer({ question: q, pickedIndex: 2, elapsedMs: 0, limitSeconds: 45 });
  check("a correct answer at once is worth full value", instant.points === 200 && instant.correct);
  check("an instant answer scores 100 for speed", instant.speedMark === 100);

  const buzzer = scoreAnswer({ question: q, pickedIndex: 2, elapsedMs: 45000, limitSeconds: 45 });
  check("a correct answer at the buzzer is worth half", buzzer.points === 100);

  const wrong = scoreAnswer({ question: q, pickedIndex: 0, elapsedMs: 1000, limitSeconds: 45 });
  check("a wrong answer scores nothing", wrong.points === 0 && !wrong.correct);
  check("a wrong answer gets no speed mark", wrong.speedMark === 0);

  const late = scoreAnswer({ question: q, pickedIndex: 2, elapsedMs: 999999, limitSeconds: 45 });
  check("elapsed time is clamped to the limit", late.elapsedMs === 45000 && late.points === 100);
  const negative = scoreAnswer({ question: q, pickedIndex: 2, elapsedMs: -5000, limitSeconds: 45 });
  check("a negative elapsed time is clamped to zero", negative.elapsedMs === 0);

  // 3D missions are normalised so they cannot swamp the written questions.
  check("a perfect mission is worth the round's game points",
    game3dPoints({ score: 12000, maxScore: 12000 }) === GAME_POINTS_PER_ROUND);
  check("half a mission is worth half the points",
    game3dPoints({ score: 6000, maxScore: 12000 }) === GAME_POINTS_PER_ROUND / 2);
  check("a zero mission is worth nothing", game3dPoints({ score: 0, maxScore: 12000 }) === 0);
  check("an over-max mission score is capped",
    game3dPoints({ score: 999999, maxScore: 12000 }) === GAME_POINTS_PER_ROUND);
  check("a missing mission score is worth nothing", game3dPoints(null) === 0);
}

/* ====================== host-released rounds ====================== */

section("Host-released rounds");

{
  let s = createSession({ now: 0 });
  check("a new session starts locked", s.stage === STAGES.LOCKED && s.roundIndex === 0);

  // Before the host starts, nothing opens.
  let step = releaseRound(s, { releasedRound: NOT_RELEASED, now: 10 });
  check("an unreleased round does not open", !step.changed && step.session.stage === STAGES.LOCKED);

  step = releaseRound(s, { releasedRound: 0, now: 10 });
  check("releasing round 1 opens it into the 3D mission",
    step.changed && step.session.stage === STAGES.GAME3D && step.session.roundIndex === 0);
  s = step.session;

  // A participant mid-round is never yanked forward by a later release.
  const pushed = releaseRound(s, { releasedRound: 4, now: 20 });
  check("a later release cannot pull a participant out of the round they are in",
    !pushed.changed && pushed.session.stage === STAGES.GAME3D && pushed.session.roundIndex === 0);

  // Finish round 1 and come back to waiting.
  s = completeGame3d(s, { score: 6000, maxScore: 12000, completed: true }, { now: 30 }).session;
  check("finishing the mission moves to the round's quiz question", s.stage === STAGES.QUIZ);
  // Work through every MCQ in the round, then the finale.
  check(`the round holds ${QUIZ_PER_ROUND} MCQs`,
    currentRound(s).quiz.length === QUIZ_PER_ROUND, `${currentRound(s).quiz.length}`);
  for (let step = 0; step < QUIZ_PER_ROUND; step++) {
    check(`MCQ ${step + 1} of the round is on screen`,
      s.stage === STAGES.QUIZ && s.quizStep === step, `stage=${s.stage} step=${s.quizStep}`);
    s = answerQuestion(s, { section: "quiz", pickedIndex: currentQuestion(s).correct, now: 31 }).session;
    s = advanceQuestion(s, { now: 32 });
  }
  check("the last MCQ leads to the finale question", s.stage === STAGES.MILLIONAIRE);
  s = answerQuestion(s, { section: "mq", pickedIndex: currentQuestion(s).correct, now: 33 }).session;
  s = advanceQuestion(s, { now: 34 });
  check("the finale question ends the round, back to waiting",
    s.stage === STAGES.ROUND_DONE && s.roundIndex === 0);

  // Still only round 0 released, so round 2 must not open.
  step = releaseRound(s, { releasedRound: 0, now: 40 });
  check("a finished participant waits until the NEXT round is released",
    !step.changed && step.session.stage === STAGES.ROUND_DONE);

  step = releaseRound(s, { releasedRound: 1, now: 41 });
  check("releasing round 2 moves the participant into it",
    step.changed && step.session.roundIndex === 1 && step.session.stage === STAGES.GAME3D);
}

/* ====================== the whole session ====================== */

section("A full session");

{
  let s = createSession({ now: 0 });
  let clock = 0;
  const tick = () => (clock += 1000);

  for (let round = 0; round < ROUND_COUNT; round++) {
    s = releaseRound(s, { releasedRound: round, now: tick() }).session;
    check(`round ${round + 1} opens on one of the five missions`,
      s.stage === STAGES.GAME3D && s.roundIndex === round
      && ROUND_GAMES.includes(currentRound(s).gameId),
      currentRound(s)?.gameId);

    s = completeGame3d(s, { score: 12000, maxScore: 12000, completed: true, accuracy: 100 }, { now: tick() }).session;
    s = playRound(s, { now: tick });
  }

  check("the session ends after the last round", s.stage === STAGES.DONE);

  const summary = sessionSummary(s);
  check("all five missions were played", summary.gamesPlayed === ROUND_COUNT);
  check("all five missions were completed", summary.gamesCompleted === ROUND_COUNT);
  check("every quiz question was answered correctly",
    summary.quizCorrect === ROUND_COUNT * QUIZ_PER_ROUND,
    `${summary.quizCorrect}/${ROUND_COUNT * QUIZ_PER_ROUND}`);
  check("every finale question was answered correctly", summary.mqCorrect === ROUND_COUNT);
  check("accuracy is 100%", summary.accuracy === 100);

  const totals = sectionTotals(s);
  check("a perfect 3D run scores the full mission allowance",
    totals.game3d === ROUND_COUNT * GAME_POINTS_PER_ROUND, `${totals.game3d}`);
  check("the three sections are tracked separately",
    totals.quiz > 0 && totals.millionaire > 0 && totals.game3d > 0);
  check("the total is the sum of the three sections",
    totals.total === totals.game3d + totals.quiz + totals.millionaire);

  const progress = sessionProgress(s);
  check("progress reports all 15 items done",
    progress.itemsDone === TOTAL_ITEMS && progress.percent === 100);
}

/* ====================== duplicate protection ====================== */

section("No double scoring");

{
  let s = createSession({ now: 0 });
  s = releaseRound(s, { releasedRound: 0, now: 1 }).session;

  // Replaying the mission must not bank twice.
  const first = completeGame3d(s, { score: 12000, maxScore: 12000, completed: true }, { now: 2 });
  const again = completeGame3d(first.session, { score: 12000, maxScore: 12000, completed: true }, { now: 3 });
  check("the first mission result is banked", first.changed);
  check("replaying the mission does not bank a second score", !again.changed);
  check("the mission score did not change", sectionTotals(again.session).game3d === GAME_POINTS_PER_ROUND);

  s = first.session;
  const correct = currentQuestion(s).correct;
  const a1 = answerQuestion(s, { section: "quiz", pickedIndex: correct, now: 4 });
  const a2 = answerQuestion(a1.session, { section: "quiz", pickedIndex: correct, now: 5 });
  check("the first answer counts", a1.changed);
  check("a double tap does not score the question twice", !a2.changed);
  check("the quiz score did not change",
    sectionTotals(a1.session).quiz === sectionTotals(a2.session).quiz);

  // Skipping a mission banks a zero, and cannot be retried for points.
  let t = createSession({ now: 0 });
  t = releaseRound(t, { releasedRound: 0, now: 1 }).session;
  t = skipGame3d(t, { now: 2 });
  check("skipping the mission moves on to the quiz", t.stage === STAGES.QUIZ);
  check("a skipped mission scores nothing", sectionTotals(t).game3d === 0);
  const retried = completeGame3d(t, { score: 12000, maxScore: 12000 }, { now: 3 });
  check("a skipped mission cannot later be scored",
    !retried.changed && sectionTotals(retried.session).game3d === 0);
}

/* ====================== the participant record ====================== */

section("The participant record end to end");

{
  // What App.jsx actually stores on a player when they join.
  const joined = {
    id: "p1", name: "Priya", team: "Civil Team", company: "Casagrand",
    gameCode: "123456", score: 0, session: createSession({ now: 0 }),
  };
  check("joining ties the participant to the game code", joined.gameCode === "123456");
  check("joining deals them a valid session", isSessionValid(joined.session));

  // Play one full round.
  let s = releaseRound(joined.session, { releasedRound: 0, now: 100 }).session;
  s = completeGame3d(s, { score: 9000, maxScore: 12000, completed: true }, { now: 200 }).session;
  let clk = 250;
  s = playRound(s, { now: () => (clk += 10) });

  const totals = sectionTotals(s);
  const stored = {
    ...joined, session: s, score: totals.total,
    scores: { game3d: totals.game3d, quiz: totals.quiz, millionaire: totals.millionaire },
  };

  // A refresh: the record is re-read from the database verbatim.
  const afterRefresh = JSON.parse(JSON.stringify(stored));
  check("a refresh keeps the same participant id", afterRefresh.id === "p1");
  check("a refresh keeps the score", afterRefresh.score === stored.score);
  check("a refresh keeps the round position",
    afterRefresh.session.roundIndex === 0 && afterRefresh.session.stage === STAGES.ROUND_DONE);
  check("a refresh keeps the exact same paper",
    JSON.stringify(hydrateSession(afterRefresh.session).rounds.map((r) => r.quiz.question))
    === JSON.stringify(hydrateSession(stored.session).rounds.map((r) => r.quiz.question)));
  check("a refresh does not re-open a finished round",
    !releaseRound(afterRefresh.session, { releasedRound: 0, now: 400 }).changed);

  check("player.score is the combined total the leaderboard reads",
    stored.score === stored.scores.game3d + stored.scores.quiz + stored.scores.millionaire);
  check("the three section scores are stored separately",
    stored.scores.game3d > 0 && stored.scores.quiz > 0 && stored.scores.millionaire > 0);
}

/* ====================== timers ====================== */

section("Question timers");

{
  const s = { stage: STAGES.QUIZ, stageStartedAt: 0 };
  check("a fresh quiz question has the full time",
    questionRemainingMs(s, 0) === QUIZ_SECONDS * 1000);
  check("time runs down", questionRemainingMs(s, 10000) === QUIZ_SECONDS * 1000 - 10000);
  check("time never goes negative", questionRemainingMs(s, 999999) === 0);
  check("the finale question gets longer",
    questionRemainingMs({ stage: STAGES.MILLIONAIRE, stageStartedAt: 0 }, 0) === MILLIONAIRE_SECONDS * 1000);
  // A stageStartedAt of 0 is a real timestamp, not "missing".
  check("a stageStartedAt of 0 is treated as a real timestamp",
    questionRemainingMs({ stage: STAGES.QUIZ, stageStartedAt: 0 }, 1000) === QUIZ_SECONDS * 1000 - 1000);

  // The same trap in answerQuestion.
  let t = createSession({ now: 0 });
  t = releaseRound(t, { releasedRound: 0, now: 0 }).session;
  t = completeGame3d(t, { score: 0, maxScore: 12000 }, { now: 0 }).session;
  const scored = answerQuestion({ ...t, stageStartedAt: 0 }, {
    section: "quiz", pickedIndex: currentQuestion(t).correct, now: 0,
  });
  check("answering instantly from timestamp 0 scores full value", scored.result.speedMark === 100);
}

/* ====================== live event mode ====================== */

section("Live event paper (unchanged shape)");

{
  const papers = Array.from({ length: 15 }, () => createLivePaper());
  check("a live paper is still 10 quiz questions",
    papers.every((p) => p.quiz.length === 10), `${papers[0].quiz.length}`);
  check("a live paper is still 5 finale questions",
    papers.every((p) => p.millionaire.length === 5), `${papers[0].millionaire.length}`);
  check("a live paper's options are already shuffled in place",
    papers.every((p) => p.quiz.every((q) => Array.isArray(q.optionOrder))));
  check("a live paper never moves the correct answer away from its text",
    papers.every((p) => [...p.quiz, ...p.millionaire].every((q) => {
      const original = allBank.find((b) => b.id === q.id);
      return q.options[q.correct] === original.options[original.correct];
    })));

  const anyDuplicates = papers.some((p) => {
    const ids = [...p.quiz, ...p.millionaire].map((q) => q.id);
    return new Set(ids).size !== ids.length;
  });
  check("no live paper repeats a question", !anyDuplicates);

  const signatures = new Set(papers.map((p) => p.quiz.map((q) => q.id).join(",")));
  check("each new live game deals a different paper", signatures.size > 5, `${signatures.size}/15 distinct`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
process.exit(fail ? 1 : 0);
