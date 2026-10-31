/**
 * Tests for the ONE event plan.
 *
 * There is a single ordered list for the whole event: 3D missions and
 * questions as rows in the same plan. The admin edits it; every
 * participant plays it; only the option order inside each question is
 * per-participant.
 *
 * These cover the question bank behind the plan, the plan itself, and a
 * participant's run through it.
 */

const SRC = new URL("../src", import.meta.url).href;

const bank = await import(`${SRC}/questionBank.js`);
const session = await import(`${SRC}/session.js`);
const arena = await import(`${SRC}/arena/arenaConstants.js`);

const { QUIZ_BANK, MILLIONAIRE_BANK, TOPICS, TIER_ORDER } = bank;
const {
  buildEventPlan, renumberPlan, planSummary, planRoundCount, isQuestionItem,
  createRun, isRunValid, currentItem, answerItem, advanceRun, releaseRun,
  completeItemGame, skipItemGame, runRoundIndex,
  runTotals, runSummary, runProgress, itemRemainingMs, runPlayingMs,
  roundSpeedBonus, ROUND_SPEED_BONUS, ROUND_SPEED_FLOOR_SECONDS, ROUND_SPEED_PAR_SECONDS,
  applyPermutation, scoreAnswer, game3dPoints, clampQuizPerRound,
  itemsPerRound, totalItems,
  STAGES, QUIZ_SECONDS, MILLIONAIRE_SECONDS, SESSION_VERSION, NOT_RELEASED,
  ROUND_COUNT, ROUND_GAMES, ROUND_MISSION_NAMES, ROUND_MISSION_BLURBS,
  QUIZ_PER_ROUND, MQ_PER_ROUND, QUIZ_PER_ROUND_OPTIONS, GAME_POINTS_PER_ROUND,
  ITEM_GAME3D, ITEM_QUIZ, ITEM_MILLIONAIRE,
} = session;

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, extra = "") {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${extra ? `  — ${extra}` : ""}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }

/** Plays a plan right through, releasing each round as it comes up. */
function playPlan(plan, run, { now }) {
  let out = run;
  let guard = 0;
  while (out.stage !== STAGES.DONE && guard++ < 400) {
    if (out.stage === STAGES.LOCKED || out.stage === STAGES.ROUND_DONE) {
      const step = releaseRun(plan, out, { releasedRound: runRoundIndex(plan, out), now: now() });
      if (!step.changed) break;
      out = step.run;
      continue;
    }
    const item = currentItem(plan, out);
    if (!item) break;
    if (item.round === ITEM_GAME3D) {
      out = completeItemGame(plan, out, { score: 12000, maxScore: 12000, completed: true }, { now: now() }).run;
    } else {
      out = answerItem(plan, out, { pickedIndex: item.correct, now: now() }).run;
    }
    out = advanceRun(plan, out, { now: now() });
  }
  return out;
}

const clock = () => { let t = 0; return () => (t += 1000); };

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

/* ============ the answer must not be guessable ============ */

section("The answer is not findable without knowing it");

{
  // Position. "Always pick A" must not work.
  const slots = [0, 0, 0, 0];
  for (let i = 0; i < 60; i++) {
    const plan = buildEventPlan();
    const run = createRun(plan);
    plan.forEach((item, idx) => {
      if (!isQuestionItem(item)) return;
      slots[applyPermutation(item, run.perms[idx]).correct] += 1;
    });
  }
  const total = slots.reduce((a, b) => a + b, 0);
  const share = slots.map((n) => n / total);
  check("the correct answer is spread evenly across A/B/C/D",
    share.every((s) => s > 0.18 && s < 0.32),
    share.map((s, i) => `${"ABCD"[i]}:${Math.round(s * 100)}%`).join(" "));

  // Length. 82% of correct answers used to be the LONGEST option, so a
  // player who knew nothing could score 82% by picking the longest line.
  // Both directions matter: never-longest just hands them the inverse.
  let longest = 0;
  let shortest = 0;
  let counted = 0;
  allBank.forEach((q) => {
    counted += 1;
    const L = q.options.map((o) => o.length);
    if (L[q.correct] === Math.max(...L)) longest += 1;
    if (L[q.correct] === Math.min(...L)) shortest += 1;
  });
  const longPct = Math.round((longest / counted) * 100);
  const shortPct = Math.round((shortest / counted) * 100);
  check("'always pick the longest option' does not beat guessing",
    longest / counted < 0.42, `${longPct}% were longest (chance 25%)`);
  check("'never pick the longest option' does not beat guessing either",
    longest / counted > 0.04, `only ${longPct}% were longest`);
  check("'always pick the shortest option' does not beat guessing",
    shortest / counted < 0.42, `${shortPct}% were shortest (chance 25%)`);
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
  const bad = applyPermutation(q, [0, 1]);
  check("a malformed permutation falls back to the original order",
    bad.options[bad.correct] === q.options[q.correct] && bad.options.length === 4);
  check("applyPermutation tolerates a missing question", applyPermutation(null, [0]) === null);
}

/* ====================== the event plan ====================== */

section("The event plan is one unit");

{
  const plan = buildEventPlan();
  const s = planSummary(plan);

  check("3D missions and questions are rows in the SAME list",
    plan.some((i) => i.round === ITEM_GAME3D) && plan.some((i) => i.round === ITEM_QUIZ),
    JSON.stringify(s));
  check(`the default plan is ${ROUND_COUNT} rounds`, s.rounds === ROUND_COUNT, `${s.rounds}`);
  check(`it holds ${ROUND_COUNT} missions`, s.missions === ROUND_COUNT, `${s.missions}`);
  check(`it holds ${ROUND_COUNT * QUIZ_PER_ROUND} quiz questions`,
    s.quiz === ROUND_COUNT * QUIZ_PER_ROUND, `${s.quiz}`);
  check(`it holds ${ROUND_COUNT * MQ_PER_ROUND} finale questions`,
    s.millionaire === ROUND_COUNT * MQ_PER_ROUND, `${s.millionaire}`);
  check(`that is ${totalItems()} items in all`, s.items === totalItems(), `${s.items}`);

  // Every round must OPEN with its 3D mission.
  for (let r = 0; r < ROUND_COUNT; r++) {
    const rows = plan.filter((i) => i.roundIndex === r);
    check(`round ${r + 1} opens with a 3D mission`,
      rows[0]?.round === ITEM_GAME3D, rows[0]?.round);
    check(`round ${r + 1} ends with the finale question`,
      rows[rows.length - 1]?.round === ITEM_MILLIONAIRE, rows[rows.length - 1]?.round);
  }

  check("every mission row names a real Arena game",
    plan.filter((i) => i.round === ITEM_GAME3D).every((i) => arena.GAME_IDS.includes(i.gameId)));
  check("all five missions appear, each exactly once",
    new Set(plan.filter((i) => i.round === ITEM_GAME3D).map((i) => i.gameId)).size === ROUND_COUNT);
  check("every mission has a display name and a blurb",
    ROUND_GAMES.every((id) => ROUND_MISSION_NAMES[id] && ROUND_MISSION_BLURBS[id]));

  const qIds = plan.filter((i) => i.round === ITEM_QUIZ).map((i) => i.bankId);
  check("no quiz question repeats in a plan", new Set(qIds).size === qIds.length);
  const fIds = plan.filter((i) => i.round === ITEM_MILLIONAIRE).map((i) => i.bankId);
  check("no finale question repeats in a plan", new Set(fIds).size === fIds.length);

  check("every question row carries its own text and options",
    plan.filter(isQuestionItem).every((i) =>
      typeof i.question === "string" && Array.isArray(i.options) && i.options.length === 4));
}

/* ============ the host owns the shape and the order ============ */

section("The admin controls the plan");

{
  for (const n of QUIZ_PER_ROUND_OPTIONS) {
    const plan = buildEventPlan({ quizPerRound: n });
    const s = planSummary(plan);
    check(`${n} MCQ per round: the plan has ${ROUND_COUNT * n} quiz rows`,
      s.quiz === ROUND_COUNT * n, `${s.quiz}`);
    check(`${n} MCQ per round: the plan is ${totalItems(n)} items`,
      s.items === totalItems(n), `${s.items}`);
    check(`${n} MCQ per round: still ${ROUND_COUNT} rounds and ${ROUND_COUNT} missions`,
      s.rounds === ROUND_COUNT && s.missions === ROUND_COUNT);
  }
  check("an out-of-range choice is clamped rather than accepted",
    clampQuizPerRound(99) <= 4 && clampQuizPerRound(0) >= 1 && clampQuizPerRound("x") >= 1);

  // Reordering: a 3D row STARTS a round, so dragging rows re-rounds it.
  const plan = buildEventPlan();
  const moved = [...plan];
  const [mission] = moved.splice(moved.findIndex((i, idx) => i.round === ITEM_GAME3D && idx > 0), 1);
  moved.push(mission);
  const renumbered = renumberPlan(moved);
  check("moving a mission row re-rounds the plan",
    planRoundCount(renumbered) === ROUND_COUNT, `${planRoundCount(renumbered)}`);
  check("every row still belongs to a round",
    renumbered.every((i) => Number.isFinite(i.roundIndex)));
  check("rows before the first mission are not orphaned",
    renumbered.every((i) => i.roundIndex >= 0));

  // Deleting a mission collapses its round rather than breaking the plan.
  const without = renumberPlan(plan.filter((i) => i.round !== ITEM_GAME3D || i.roundIndex !== 2));
  check("removing a mission leaves a readable plan",
    planRoundCount(without) >= 1 && without.every((i) => Number.isFinite(i.roundIndex)));
}

/* ====================== variety between participants ====================== */

section("Variety");

{
  const plans = Array.from({ length: 200 }, () => buildEventPlan());
  const missionOrders = new Set(plans.map((p) =>
    p.filter((i) => i.round === ITEM_GAME3D).map((i) => i.gameId).join(",")));
  check("the mission order genuinely varies between events",
    missionOrders.size > 40, `only ${missionOrders.size} distinct orders in 200 plans`);

  const papers = new Set(plans.map((p) => p.filter(isQuestionItem).map((i) => i.bankId).join(",")));
  check("the question paper genuinely varies between events",
    papers.size > 150, `only ${papers.size} distinct papers in 200 plans`);

  const freq = {};
  plans.forEach((p) => p.filter((i) => i.round === ITEM_MILLIONAIRE)
    .forEach((i) => { freq[i.bankId] = (freq[i.bankId] || 0) + 1; }));
  const worst = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  check("no finale question appears in more than 60% of plans",
    worst[1] / plans.length <= 0.6,
    `${worst[0]} in ${Math.round((worst[1] / plans.length) * 100)}%`);

  // Two participants on the SAME plan must still see different options.
  const plan = buildEventPlan();
  const a = createRun(plan);
  const b = createRun(plan);
  const sameOrder = plan.filter(isQuestionItem).every((item, idx) => {
    const i = plan.indexOf(item);
    return JSON.stringify(a.perms[i]) === JSON.stringify(b.perms[i]);
  });
  check("two participants on one plan get different option orders", !sameOrder);
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
  const late = scoreAnswer({ question: q, pickedIndex: 2, elapsedMs: 999999, limitSeconds: 45 });
  check("elapsed time is clamped to the limit", late.elapsedMs === 45000 && late.points === 100);

  check("a perfect mission is worth the round's game points",
    game3dPoints({ score: 12000, maxScore: 12000 }) === GAME_POINTS_PER_ROUND);
  check("an over-max mission score is capped",
    game3dPoints({ score: 999999, maxScore: 12000 }) === GAME_POINTS_PER_ROUND);
  check("a missing mission score is worth nothing", game3dPoints(null) === 0);
}

/* ====================== host-released rounds ====================== */

section("Host-released rounds");

{
  const plan = buildEventPlan();
  let run = createRun(plan, { now: 0 });
  check("a new run starts locked on the first row",
    run.stage === STAGES.LOCKED && run.itemIndex === 0);
  check("a new run is valid against its plan", isRunValid(plan, run));

  let step = releaseRun(plan, run, { releasedRound: NOT_RELEASED, now: 10 });
  check("an unreleased round does not open", !step.changed);

  step = releaseRun(plan, run, { releasedRound: 0, now: 10 });
  check("releasing round 1 opens it on the 3D mission",
    step.changed && step.run.stage === STAGES.GAME3D);
  run = step.run;

  const pushed = releaseRun(plan, run, { releasedRound: 4, now: 20 });
  check("a later release cannot pull a participant out of the round they are in",
    !pushed.changed);

  // Work the whole of round 1.
  let t = 30;
  while (run.stage !== STAGES.ROUND_DONE && run.stage !== STAGES.DONE) {
    const item = currentItem(plan, run);
    if (item.round === ITEM_GAME3D) {
      run = completeItemGame(plan, run, { score: 6000, maxScore: 12000, completed: true }, { now: (t += 5) }).run;
    } else {
      run = answerItem(plan, run, { pickedIndex: item.correct, now: (t += 5) }).run;
    }
    run = advanceRun(plan, run, { now: (t += 5) });
  }
  check("finishing a round parks the participant on ROUND_DONE",
    run.stage === STAGES.ROUND_DONE, run.stage);

  step = releaseRun(plan, run, { releasedRound: 0, now: 100 });
  check("a finished participant waits until the NEXT round is released", !step.changed);
  step = releaseRun(plan, run, { releasedRound: 1, now: 101 });
  check("releasing the next round moves them into it",
    step.changed && runRoundIndex(plan, step.run) === 1);
}

/* ====================== a whole event ====================== */

section("A whole event, played right through");

{
  const plan = buildEventPlan();
  const run = playPlan(plan, createRun(plan, { now: 0 }), { now: clock() });

  check("the run ends DONE", run.stage === STAGES.DONE, run.stage);

  const s = runSummary(plan, run);
  check("every mission was played", s.gamesPlayed === planSummary(plan).missions);
  check("every mission was completed", s.gamesCompleted === planSummary(plan).missions);
  check("every quiz question was answered correctly", s.quizCorrect === s.quizTotal,
    `${s.quizCorrect}/${s.quizTotal}`);
  check("every finale question was answered correctly", s.mqCorrect === s.mqTotal,
    `${s.mqCorrect}/${s.mqTotal}`);
  check("accuracy is 100%", s.accuracy === 100, `${s.accuracy}`);

  const totals = runTotals(plan, run);
  check("a perfect 3D run scores the full mission allowance",
    totals.game3d === ROUND_COUNT * GAME_POINTS_PER_ROUND, `${totals.game3d}`);
  check("the three sections are tracked separately",
    totals.quiz > 0 && totals.millionaire > 0 && totals.game3d > 0);
  check("the total is the sum of every section, including the speed bonus",
    totals.total === totals.game3d + totals.quiz + totals.millionaire + totals.speed,
    `${totals.total} vs ${totals.game3d}+${totals.quiz}+${totals.millionaire}+${totals.speed}`);

  const p = runProgress(plan, run);
  check("progress reports every item done",
    p.itemsDone === plan.length && p.percent === 100, JSON.stringify(p));
}

/* ====================== no double scoring ====================== */

section("No double scoring");

{
  const plan = buildEventPlan();
  let run = releaseRun(plan, createRun(plan, { now: 0 }), { releasedRound: 0, now: 1 }).run;

  const first = completeItemGame(plan, run, { score: 12000, maxScore: 12000, completed: true }, { now: 2 });
  const again = completeItemGame(plan, first.run, { score: 12000, maxScore: 12000, completed: true }, { now: 3 });
  check("the first mission result is banked", first.changed);
  check("replaying the mission does not bank a second score", !again.changed);
  check("the mission score did not change",
    runTotals(plan, again.run).game3d === GAME_POINTS_PER_ROUND);

  run = advanceRun(plan, first.run, { now: 4 });
  const item = currentItem(plan, run);
  const a1 = answerItem(plan, run, { pickedIndex: item.correct, now: 5 });
  const a2 = answerItem(plan, a1.run, { pickedIndex: item.correct, now: 6 });
  check("the first answer counts", a1.changed);
  check("a double tap does not score the question twice", !a2.changed);
  check("the quiz score did not change",
    runTotals(plan, a1.run).quiz === runTotals(plan, a2.run).quiz);

  // A skipped mission banks a zero that cannot later be replaced.
  let t = releaseRun(plan, createRun(plan, { now: 0 }), { releasedRound: 0, now: 1 }).run;
  t = skipItemGame(plan, t, { now: 2 });
  check("a skipped mission scores nothing", runTotals(plan, t).game3d === 0);
  const retried = completeItemGame(plan, t, { score: 12000, maxScore: 12000 }, { now: 3 });
  check("a skipped mission cannot later be scored",
    !retried.changed && runTotals(plan, retried.run).game3d === 0);
}

/* ====================== the participant record ====================== */

section("The participant record end to end");

{
  const plan = buildEventPlan();
  const joined = {
    id: "p1", name: "Priya", team: "Civil Team", company: "Casagrand",
    gameCode: "123456", score: 0, session: createRun(plan, { now: 0 }),
  };
  check("joining ties the participant to the game code", joined.gameCode === "123456");
  check("joining gives them a valid run", isRunValid(plan, joined.session));

  // Play one round.
  let run = releaseRun(plan, joined.session, { releasedRound: 0, now: 100 }).run;
  let t = 100;
  while (run.stage !== STAGES.ROUND_DONE && run.stage !== STAGES.DONE) {
    const item = currentItem(plan, run);
    if (item.round === ITEM_GAME3D) {
      run = completeItemGame(plan, run, { score: 9000, maxScore: 12000, completed: true }, { now: (t += 5) }).run;
    } else {
      run = answerItem(plan, run, { pickedIndex: item.correct, now: (t += 5) }).run;
    }
    run = advanceRun(plan, run, { now: (t += 5) });
  }

  const totals = runTotals(plan, run);
  // Mirrors what SoloSession.persist() writes.
  const stored = {
    ...joined, session: run, score: totals.total,
    scores: {
      game3d: totals.game3d, quiz: totals.quiz,
      millionaire: totals.millionaire, speed: totals.speed,
    },
    playingMs: runPlayingMs(run),
  };

  // The record is re-read from the database verbatim on a refresh.
  const afterRefresh = JSON.parse(JSON.stringify(stored));
  check("a refresh keeps the same participant id", afterRefresh.id === "p1");
  check("a refresh keeps the score", afterRefresh.score === stored.score);
  check("a refresh keeps the position in the plan",
    afterRefresh.session.itemIndex === stored.session.itemIndex
    && afterRefresh.session.stage === STAGES.ROUND_DONE);
  check("a refresh keeps the exact same option order",
    JSON.stringify(afterRefresh.session.perms) === JSON.stringify(stored.session.perms));
  check("a refresh still validates against the plan", isRunValid(plan, afterRefresh.session));
  check("a refresh does not re-open a finished round",
    !releaseRun(plan, afterRefresh.session, { releasedRound: 0, now: 400 }).changed);

  check("player.score is the combined total the leaderboard reads",
    stored.score === stored.scores.game3d + stored.scores.quiz
      + stored.scores.millionaire + (stored.scores.speed || 0));
  check("the three section scores are stored separately",
    stored.scores.game3d > 0 && stored.scores.quiz > 0 && stored.scores.millionaire > 0);

  // A run from an older build, or against a different plan, is rejected
  // rather than half-read.
  check("a run from an older build is rejected",
    !isRunValid(plan, { ...joined.session, v: SESSION_VERSION - 1 }));
  check("a run against a different plan is rejected",
    !isRunValid(buildEventPlan({ quizPerRound: 1 }), joined.session));
  check("garbage is rejected",
    !isRunValid(plan, null) && !isRunValid(null, joined.session) && !isRunValid([], joined.session));
}

/* ====================== timers ====================== */

section("Question timers");

{
  const plan = buildEventPlan();
  // Put the run on a quiz row.
  let run = releaseRun(plan, createRun(plan, { now: 0 }), { releasedRound: 0, now: 0 }).run;
  run = advanceRun(plan, completeItemGame(plan, run, { score: 0 }, { now: 0 }).run, { now: 0 });
  const quizRun = { ...run, stageStartedAt: 0 };

  check("a fresh quiz question has the full time",
    itemRemainingMs(plan, quizRun, 0) === QUIZ_SECONDS * 1000);
  check("time runs down",
    itemRemainingMs(plan, quizRun, 10000) === QUIZ_SECONDS * 1000 - 10000);
  check("time never goes negative", itemRemainingMs(plan, quizRun, 999999) === 0);
  // A stageStartedAt of 0 is a real timestamp, not "missing".
  check("a stageStartedAt of 0 is treated as a real timestamp",
    itemRemainingMs(plan, quizRun, 1000) === QUIZ_SECONDS * 1000 - 1000);

  const scored = answerItem(plan, quizRun, { pickedIndex: currentItem(plan, quizRun).correct, now: 0 });
  check("answering instantly from timestamp 0 scores full value",
    scored.result.speedMark === 100);

  // The finale row gets the longer limit.
  const finaleIndex = plan.findIndex((i) => i.round === ITEM_MILLIONAIRE);
  check("the finale question gets longer",
    itemRemainingMs(plan, { itemIndex: finaleIndex, stageStartedAt: 0 }, 0) === MILLIONAIRE_SECONDS * 1000);
}


/* ================================================================ *
 *  The race: everyone is released together, so finishing a round
 *  sooner is worth points and breaks ties.
 * ================================================================ */

section("Finishing a round sooner is worth points");

{
  check("a round finished inside the floor is worth the full bonus",
    roundSpeedBonus(ROUND_SPEED_FLOOR_SECONDS * 1000 - 1) === ROUND_SPEED_BONUS);
  check("a round finished instantly is worth the full bonus",
    roundSpeedBonus(0) === ROUND_SPEED_BONUS);
  check("a round finished at par is worth nothing",
    roundSpeedBonus(ROUND_SPEED_PAR_SECONDS * 1000) === 0);
  check("a round finished beyond par is worth nothing, never negative",
    roundSpeedBonus(ROUND_SPEED_PAR_SECONDS * 1000 * 4) === 0);
  check("rubbish input is worth nothing",
    roundSpeedBonus(undefined) === 0 && roundSpeedBonus(-50) === 0 && roundSpeedBonus(NaN) === 0);

  // The bonus has to fall as the round gets slower, with no flat spots
  // between the floor and par, or being quicker stops paying.
  const mid = [];
  for (let sec = ROUND_SPEED_FLOOR_SECONDS; sec <= ROUND_SPEED_PAR_SECONDS; sec += 30) {
    mid.push(roundSpeedBonus(sec * 1000));
  }
  check("the bonus decays all the way from the floor to par",
    mid.every((v, i) => i === 0 || v < mid[i - 1]), mid.join(", "));

  // Two participants, same answers, released at the same moment: the
  // one who finishes the round sooner must score more.
  const plan = buildEventPlan({ quizPerRound: 1 });
  const roundOne = plan.filter((p) => (p.roundIndex ?? 0) === 0);

  function playRound(finishSeconds) {
    let run = createRun(plan, { now: 0 });
    run = releaseRun(plan, run, { releasedRound: 0, now: 1000 }).run;
    // Walk the round, landing the last advance at the chosen time.
    const step = (finishSeconds * 1000) / roundOne.length;
    for (let i = 0; i < roundOne.length; i++) {
      const at = 1000 + Math.round(step * (i + 1));
      const item = plan[run.itemIndex];
      if (item.round === ITEM_GAME3D) {
        run = completeItemGame(plan, run, {
          score: 12000, maxScore: 12000, completed: true, accuracy: 100,
        }, { now: at }).run;
      } else {
        run = answerItem(plan, run, { pickedIndex: item.correct, now: at }).run;
      }
      run = advanceRun(plan, run, { now: at });
    }
    return run;
  }

  const quick = playRound(200);
  const slow = playRound(900);

  check("the quick run banked a speed bonus",
    (quick.rounds?.[0]?.bonus || 0) > 0, JSON.stringify(quick.rounds?.[0]));
  check("the slow run banked none",
    (slow.rounds?.[0]?.bonus || 0) === 0, JSON.stringify(slow.rounds?.[0]));
  check("the quick participant ends the round ahead on points",
    runTotals(plan, quick).total > runTotals(plan, slow).total,
    `${runTotals(plan, quick).total} vs ${runTotals(plan, slow).total}`);
  // Both played the mission perfectly, so the mission half is level and
  // the gap is time. (The written questions are ALSO scored on how fast
  // each one was answered, so those totals legitimately differ too.)
  check("both ran the mission perfectly, so the mission half is level",
    runTotals(plan, quick).game3d === runTotals(plan, slow).game3d,
    `${runTotals(plan, quick).game3d} vs ${runTotals(plan, slow).game3d}`);
  check("the round speed bonus is what separates them",
    runTotals(plan, quick).speed > runTotals(plan, slow).speed,
    `${runTotals(plan, quick).speed} vs ${runTotals(plan, slow).speed}`);

  // The round clock must measure the ROUND, not time spent waiting for
  // the host to release the next one.
  check("the round clock records how long the round took",
    Math.abs((quick.rounds[0].elapsedMs || 0) - 200000) < 1500,
    `${quick.rounds[0].elapsedMs} ms`);
  check("playing time is the sum of the round clocks",
    runPlayingMs(quick) === quick.rounds[0].elapsedMs, `${runPlayingMs(quick)}`);

  // The clock must not restart if the participant refreshes and the
  // host's release is applied again.
  const reRead = JSON.parse(JSON.stringify(quick));
  const reReleased = releaseRun(plan, reRead, { releasedRound: 1, now: 9_000_000 }).run;
  check("a refresh does not reset a round clock that already started",
    reReleased.rounds[0].startedAt === quick.rounds[0].startedAt,
    `${reReleased.rounds[0].startedAt} vs ${quick.rounds[0].startedAt}`);

  // And the bonus is banked once, not recomputed on every later write.
  const bankedBefore = quick.rounds[0].bonus;
  const advancedAgain = advanceRun(plan, quick, { now: 9_000_000 });
  check("a banked bonus is never recomputed later",
    advancedAgain.rounds[0].bonus === bankedBefore,
    `${advancedAgain.rounds[0].bonus} vs ${bankedBefore}`);

  // Abandoning the mission to bank the bonus must never pay.
  const skipper = (() => {
    let run = createRun(plan, { now: 0 });
    run = releaseRun(plan, run, { releasedRound: 0, now: 1000 }).run;
    run = skipItemGame(plan, run, { now: 2000 });
    run = advanceRun(plan, run, { now: 2000 });
    for (let i = 1; i < roundOne.length; i++) {
      const item = plan[run.itemIndex];
      run = answerItem(plan, run, { pickedIndex: item.correct, now: 3000 }).run;
      run = advanceRun(plan, run, { now: 3000 });
    }
    return run;
  })();
  check("skipping the mission to grab the bonus loses points overall",
    runTotals(plan, skipper).total < runTotals(plan, slow).total,
    `skipper ${runTotals(plan, skipper).total} vs slow-but-complete ${runTotals(plan, slow).total}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
process.exit(fail ? 1 : 0);
