/* ------------------------------------------------------------------ *
 *  THE EVENT — one plan, not two
 *
 *  There is a SINGLE ordered list for the whole event. A 3D mission is
 *  a row in it, exactly like a question is:
 *
 *      ROUND n:  3D mission  →  3 × MCQ  →  1 finale question
 *
 *  Five rounds × five items = 25 items by default. The admin sees that
 *  one list, reorders it, edits it and reshuffles it; every participant
 *  plays that same list; the host releases the rounds one at a time.
 *
 *  This used to be two separate things — an admin-visible question list
 *  and a per-participant 3D session the admin could not see — which is
 *  why the missions were invisible in the panel and could not be
 *  reordered. That split is gone.
 *
 *  The only per-participant part is `run.perms`: the option order
 *  inside each question. It is a few hundred bytes, lives on the
 *  player's own record, and is what makes a refresh resume exactly
 *  where they were instead of re-shuffling.
 *
 *  Everything here is a pure function over plain data, so it is
 *  testable without a browser (see tests/session.test.mjs).
 * ------------------------------------------------------------------ */

import {
  QUIZ_BANK, MILLIONAIRE_BANK,
  TIER_ORDER, quizQuestionById, millionaireQuestionById,
} from "./questionBank.js";

// Bumped to 3 when the two halves became one plan. A run written by an
// older build no longer validates, so that participant is re-dealt
// rather than resumed into a shape this build cannot read. See
// isRunValid.
export const SESSION_VERSION = 3;

/** The five rounds, and the 3D mission each one opens with. */
export const ROUND_GAMES = [
  "safety-mission",
  "crane-master",
  "safest-tower",
  "escape-challenge",
  "emergency-commander",
];
export const ROUND_COUNT = ROUND_GAMES.length;

/**
 * Short names and one-liners for the rounds, kept here so the admin
 * panel and the participant screens cannot disagree — and so neither
 * has to pull the 3D chunk in just to print five labels. Tests assert
 * these ids match the Arena's own game list.
 */
export const ROUND_MISSION_NAMES = {
  "safety-mission": "Safety Mission",
  "crane-master": "Tower Crane",
  "safest-tower": "Spot the Hazards",
  "escape-challenge": "Safety Escape",
  "emergency-commander": "Emergency Response",
};

export const ROUND_MISSION_BLURBS = {
  "safety-mission": "Walk the site and deal with the hazards you find",
  "crane-master": "Lift a load to the right floor without swinging it over anyone",
  "safest-tower": "Find five hazards at ground level and fix each one",
  "escape-challenge": "Work your way out of the building, safely",
  "emergency-commander": "Take command of a live site emergency",
};

/**
 * The shape of one round:
 *
 *     1 × 3D mission  →  QUIZ_PER_ROUND × MCQ  →  MQ_PER_ROUND × finale
 *
 * The host can change the MCQ count per round from the admin panel
 * (see `quizPerRound` on the game record). Whatever is chosen when a
 * participant JOINS is baked into their descriptor, so changing it
 * mid-event never reshapes a paper somebody is already sitting.
 */
export const QUIZ_PER_ROUND = 3;
export const MQ_PER_ROUND = 1;

/** What the admin is allowed to pick. */
export const QUIZ_PER_ROUND_OPTIONS = [1, 2, 3, 4];

// NOTE: there is deliberately no exported QUIZ_COUNT / TOTAL_ITEMS any
// more. Those described a fixed shape, and the admin can now reorder
// and delete rows — so the only truthful answer is to measure the plan
// that is actually in play with planSummary().

/**
 * The shape buildEventPlan() will produce for a given MCQ count. Used by
 * the admin panel to preview a plan before dealing it; the plan that is
 * actually in play is measured with planSummary() instead.
 */
export function itemsPerRound(quizPerRound = QUIZ_PER_ROUND) {
  return 1 + clampQuizPerRound(quizPerRound) + MQ_PER_ROUND;
}
export function totalItems(quizPerRound = QUIZ_PER_ROUND) {
  return ROUND_COUNT * itemsPerRound(quizPerRound);
}

/**
 * Every 3D mission is scored out of 12,000 in the Arena, which would
 * swamp the written questions. Inside a session each mission is worth
 * this much instead, so the balance is roughly:
 *
 *     3D   5 × 1000 = 5000      quiz ~750      finale 3000
 */
export const GAME_POINTS_PER_ROUND = 1000;

/** Seconds allowed per question. */
export const QUIZ_SECONDS = 45;
export const MILLIONAIRE_SECONDS = 60;

/* ------------------------- the race element -------------------------
 *
 * The host releases each round to everybody at once, so every
 * participant starts a round at the same moment. Finishing it sooner is
 * then worth something: the round speed bonus decays from the full
 * amount down to nothing between FLOOR and PAR seconds.
 *
 * Deliberately modest next to the 1,000 a mission is worth. It must
 * reward being quick WITHOUT making it pay to abandon the 3D mission —
 * skipping a mission to bank the bonus trades 1,000 points for 250,
 * which is never worth it.
 *
 * It is measured from the host's release to the moment the participant
 * finishes the last row of the round, so time spent waiting for the
 * host between rounds is not counted against anybody.
 */
export const ROUND_SPEED_BONUS = 250;
export const ROUND_SPEED_FLOOR_SECONDS = 210;
export const ROUND_SPEED_PAR_SECONDS = 660;

/** The bonus a round finished in `elapsedMs` is worth. */
export function roundSpeedBonus(elapsedMs) {
  const elapsed = Number(elapsedMs);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  const floor = ROUND_SPEED_FLOOR_SECONDS * 1000;
  const par = ROUND_SPEED_PAR_SECONDS * 1000;
  if (elapsed <= floor) return ROUND_SPEED_BONUS;
  if (elapsed >= par) return 0;
  return Math.round(ROUND_SPEED_BONUS * ((par - elapsed) / (par - floor)));
}

export const STAGES = {
  /** Waiting for the host to release this round. */
  LOCKED: "locked",
  GAME3D: "game3d",
  QUIZ: "quiz",
  MILLIONAIRE: "millionaire",
  /** This round is finished; waiting for the host to release the next. */
  ROUND_DONE: "roundDone",
  DONE: "done",
};

/** `releasedRound` on the game record before the host has started. */
export const NOT_RELEASED = -1;

/* ----------------------------- shuffling ----------------------------- */

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A permutation of [0..n-1] describing the new option order. */
function permutationFor(length) {
  return shuffle(Array.from({ length }, (_, i) => i));
}

/**
 * Applies a stored permutation to a question, remapping `correct` so the
 * right answer follows its option to its new position.
 *
 * This is the step that quietly breaks shuffled quizzes if it is done
 * wrong, so it is covered directly by the tests.
 */
export function applyPermutation(question, perm) {
  if (!question) return null;
  const order = Array.isArray(perm) && perm.length === question.options.length
    ? perm
    : question.options.map((_, i) => i);
  const options = order.map((i) => question.options[i]);
  const correct = order.indexOf(question.correct);
  return { ...question, options, correct, optionOrder: order };
}

/* ---------------------------- creating one ---------------------------- */

/** `count` general questions, spread across as many topics as possible. */
function drawQuiz(count = ROUND_COUNT * QUIZ_PER_ROUND) {
  const byTopic = new Map();
  QUIZ_BANK.forEach((question) => {
    if (!byTopic.has(question.topic)) byTopic.set(question.topic, []);
    byTopic.get(question.topic).push(question);
  });

  const picked = [];
  // One from each distinct topic — this is what guarantees a participant
  // never sees two questions on the same subject while others go unasked.
  for (const topic of shuffle([...byTopic.keys()])) {
    if (picked.length >= count) break;
    picked.push(shuffle(byTopic.get(topic))[0]);
  }
  // If the bank has fewer topics than questions wanted, top up without repeats.
  if (picked.length < count) {
    const used = new Set(picked.map((q) => q.id));
    for (const question of shuffle(QUIZ_BANK)) {
      if (picked.length >= count) break;
      if (!used.has(question.id)) { picked.push(question); used.add(question.id); }
    }
  }
  return shuffle(picked).slice(0, count);
}

/** `count` finale questions, one per tier, lowest stake first. */
function drawMillionaire(count = ROUND_COUNT * MQ_PER_ROUND) {
  const byTier = new Map();
  MILLIONAIRE_BANK.forEach((question) => {
    if (!byTier.has(question.tier)) byTier.set(question.tier, []);
    byTier.get(question.tier).push(question);
  });

  const finale = [];
  for (const tier of TIER_ORDER) {
    if (finale.length >= count) break;
    const pool = byTier.get(tier);
    if (pool?.length) finale.push(shuffle(pool)[0]);
  }
  if (finale.length < count) {
    const used = new Set(finale.map((q) => q.id));
    for (const question of MILLIONAIRE_BANK) {
      if (finale.length >= count) break;
      if (!used.has(question.id)) { finale.push(question); used.add(question.id); }
    }
  }
  return finale
    .slice(0, count)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}

export function clampQuizPerRound(n) {
  const v = Math.round(Number(n) || QUIZ_PER_ROUND);
  return Math.max(1, Math.min(QUIZ_PER_ROUND_OPTIONS[QUIZ_PER_ROUND_OPTIONS.length - 1], v));
}

/* ------------------------------------------------------------------ *
 *  There used to be a SECOND engine here — a per-participant round
 *  descriptor that existed alongside the admin's question list, so the
 *  3D missions lived in one and the questions in the other. That split
 *  is exactly what made the missions invisible to the admin, and it was
 *  deleted when the two became one plan. Everything below is the only
 *  engine now.
 * ------------------------------------------------------------------ */

/* ================================================================== *
 *  THE EVENT PLAN — one unit, not two
 *
 *  There used to be two separate things: a "live event" question list
 *  the admin could see and edit, and a per-participant 3D session the
 *  admin could not. That split is what made the 3D missions invisible
 *  in the admin panel and impossible to reorder.
 *
 *  There is now ONE ordered list. A 3D mission is a row in it, exactly
 *  like a question is. The admin edits that list; every participant
 *  plays that list; the only thing that differs per participant is the
 *  order of the options inside each question.
 *
 *  An item is one of:
 *    { round: "game3d",      roundIndex, gameId }
 *    { round: "quiz",        roundIndex, bankId?, question, options, correct, points, explanation, topic }
 *    { round: "millionaire", roundIndex, bankId?, question, options, correct, points, explanation, tier }
 * ================================================================== */

export const ITEM_GAME3D = "game3d";
export const ITEM_QUIZ = "quiz";
export const ITEM_MILLIONAIRE = "millionaire";

/**
 * Builds the default plan: five rounds, each a 3D mission then
 * `quizPerRound` MCQs then one finale question, with the missions in a
 * random order and the questions drawn fresh from the bank.
 */
export function buildEventPlan({ quizPerRound = QUIZ_PER_ROUND } = {}) {
  const perRound = clampQuizPerRound(quizPerRound);
  const quiz = drawQuiz(ROUND_COUNT * perRound);
  const mq = drawMillionaire(ROUND_COUNT * MQ_PER_ROUND);
  const missions = shuffle(ROUND_GAMES);

  const plan = [];
  missions.forEach((gameId, roundIndex) => {
    plan.push({ round: ITEM_GAME3D, roundIndex, gameId });
    quiz.slice(roundIndex * perRound, (roundIndex + 1) * perRound).forEach((q) => {
      plan.push({
        round: ITEM_QUIZ, roundIndex, bankId: q.id, topic: q.topic,
        question: q.question, options: [...q.options], correct: q.correct,
        points: q.points, explanation: q.explanation,
      });
    });
    const f = mq[roundIndex];
    if (f) {
      plan.push({
        round: ITEM_MILLIONAIRE, roundIndex, bankId: f.id, tier: f.tier,
        question: f.question, options: [...f.options], correct: f.correct,
        points: f.points, explanation: f.explanation,
      });
    }
  });
  return plan;
}

/** True for a plan row that is a question rather than a mission. */
export function isQuestionItem(item) {
  return item?.round === ITEM_QUIZ || item?.round === ITEM_MILLIONAIRE;
}

/**
 * Re-numbers `roundIndex` from the order of the list, so that dragging
 * rows in the admin panel actually re-rounds the event. A round starts
 * at each 3D mission; anything before the first mission belongs to
 * round 0.
 */
export function renumberPlan(plan) {
  let round = -1;
  return (plan || []).map((item) => {
    if (item.round === ITEM_GAME3D) round += 1;
    return { ...item, roundIndex: Math.max(0, round) };
  });
}

/** How many rounds the plan actually contains. */
export function planRoundCount(plan) {
  const rounds = new Set((plan || []).map((i) => i.roundIndex ?? 0));
  return Math.max(1, rounds.size);
}

export function planSummary(plan) {
  const list = plan || [];
  return {
    items: list.length,
    missions: list.filter((i) => i.round === ITEM_GAME3D).length,
    quiz: list.filter((i) => i.round === ITEM_QUIZ).length,
    millionaire: list.filter((i) => i.round === ITEM_MILLIONAIRE).length,
    rounds: planRoundCount(list),
  };
}

/* ------------------------------ scoring ------------------------------ */

/**
 * Points for one answer. A correct answer is worth more the sooner it
 * arrives — between 50% and 100% of the question's value.
 */
export function scoreAnswer({ question, pickedIndex, elapsedMs, limitSeconds }) {
  const limitMs = Math.max(1, limitSeconds * 1000);
  const clamped = Math.max(0, Math.min(limitMs, Number(elapsedMs) || 0));
  const correct = pickedIndex === question.correct;
  const speedMark = correct ? Math.round(((limitMs - clamped) / limitMs) * 100) : 0;
  const base = Number(question.points) || 100;
  return {
    correct,
    points: correct ? Math.round(base * (0.5 + speedMark / 200)) : 0,
    speedMark,
    pickedIndex,
    elapsedMs: Math.round(clamped),
  };
}

/**
 * Scales one mission's raw Arena score (out of 12,000) into its value
 * inside an event, so the 3D half cannot swamp the written half.
 */
export function game3dPoints(result) {
  const max = Math.max(1, Number(result?.maxScore) || 12000);
  const raw = Math.max(0, Number(result?.score) || 0);
  return Math.max(0, Math.min(GAME_POINTS_PER_ROUND,
    Math.round((raw / max) * GAME_POINTS_PER_ROUND)));
}

/* ------------------------- a participant's run ------------------------- */

/**
 * The per-participant part of the plan: an option permutation for each
 * question row. Tiny, and it is what keeps two people sitting together
 * from seeing the answers in the same place.
 */
export function createRun(plan, { now = Date.now() } = {}) {
  const perms = {};
  (plan || []).forEach((item, i) => {
    if (isQuestionItem(item)) perms[i] = permutationFor(item.options.length);
  });
  return {
    v: SESSION_VERSION,
    perms,
    itemIndex: 0,
    stage: STAGES.LOCKED,
    startedAt: now,
    stageStartedAt: now,
    answers: {},   // keyed by plan item index
    games: {},     // 3D results, keyed by plan item index
    // { startedAt, finishedAt, bonus } per round index, for the race.
    rounds: {},
  };
}

/** The plan row the participant is on, with its options shuffled. */
export function currentItem(plan, run) {
  const index = run?.itemIndex ?? 0;
  const item = (plan || [])[index];
  if (!item) return null;
  if (!isQuestionItem(item)) return { ...item, index };
  return { ...applyPermutation(item, run?.perms?.[index]), round: item.round, roundIndex: item.roundIndex, index };
}

export function runRoundIndex(plan, run) {
  return (plan || [])[run?.itemIndex ?? 0]?.roundIndex ?? 0;
}

/** True when this run can be read by this build against this plan. */
export function isRunValid(plan, run) {
  if (!run || run.v !== SESSION_VERSION) return false;
  if (!Array.isArray(plan) || plan.length === 0) return false;
  if (!Number.isFinite(run.itemIndex)) return false;
  // Every question row must have a stored permutation of the right size.
  return plan.every((item, i) => {
    if (!isQuestionItem(item)) return true;
    const perm = run.perms?.[i];
    return Array.isArray(perm) && perm.length === item.options.length;
  });
}

/* ----------------------- moving through the plan ----------------------- */

/** The stage a given plan row puts the participant in. */
function stageForItem(item) {
  if (!item) return STAGES.DONE;
  if (item.round === ITEM_GAME3D) return STAGES.GAME3D;
  if (item.round === ITEM_MILLIONAIRE) return STAGES.MILLIONAIRE;
  return STAGES.QUIZ;
}

/**
 * Opens the participant's current round if the host has released it.
 * A participant can never run ahead of `releasedRound`, and can never
 * be pulled out of a round they have already started.
 */
export function releaseRun(plan, run, { releasedRound, now = Date.now() } = {}) {
  const released = Number.isFinite(releasedRound) ? releasedRound : NOT_RELEASED;
  if (run.stage === STAGES.DONE) return { run, changed: false };
  const waiting = run.stage === STAGES.LOCKED || run.stage === STAGES.ROUND_DONE;
  if (!waiting) return { run, changed: false };

  const item = plan[run.itemIndex];
  if (!item) return { run: { ...run, stage: STAGES.DONE, finishedAt: now }, changed: true };
  if (released < (item.roundIndex ?? 0)) return { run, changed: false };

  // Stamp when this round opened for this participant. Everybody is
  // released together, so this is the common start line the race is
  // timed from. Never re-stamped: a rejoin must not reset the clock.
  const roundIndex = item.roundIndex ?? 0;
  const rounds = { ...(run.rounds || {}) };
  if (!rounds[roundIndex]?.startedAt) {
    rounds[roundIndex] = { ...(rounds[roundIndex] || {}), startedAt: now };
  }

  return {
    run: { ...run, rounds, stage: stageForItem(item), stageStartedAt: now },
    changed: true,
  };
}

/**
 * Steps to the next row. Crossing into a new round parks the
 * participant on ROUND_DONE until the host releases it.
 */
export function advanceRun(plan, run, { now = Date.now() } = {}) {
  const here = plan[run.itemIndex];
  const nextIndex = run.itemIndex + 1;
  const next = plan[nextIndex];
  const crossesRound = !next || (next.roundIndex ?? 0) !== (here?.roundIndex ?? 0);

  // Leaving a round closes its clock and banks the speed bonus. Done
  // once, here, so the bonus is fixed at the moment it was earned and
  // cannot drift if the record is re-read or re-written later.
  let rounds = run.rounds || {};
  if (crossesRound && here) {
    const roundIndex = here.roundIndex ?? 0;
    const entry = rounds[roundIndex];
    if (entry?.startedAt && !entry.finishedAt) {
      rounds = {
        ...rounds,
        [roundIndex]: {
          ...entry,
          finishedAt: now,
          elapsedMs: Math.max(0, now - entry.startedAt),
          bonus: roundSpeedBonus(now - entry.startedAt),
        },
      };
    }
  }

  if (!next) {
    return {
      ...run, rounds, itemIndex: nextIndex,
      stage: STAGES.DONE, finishedAt: now, stageStartedAt: now,
    };
  }
  return {
    ...run,
    rounds,
    itemIndex: nextIndex,
    stage: crossesRound ? STAGES.ROUND_DONE : stageForItem(next),
    stageStartedAt: now,
  };
}

/**
 * Records one answer. Idempotent per plan row, so a double tap, a
 * retry or a replayed write can never score the same question twice.
 */
export function answerItem(plan, run, { pickedIndex, now = Date.now() } = {}) {
  const index = run.itemIndex;
  const item = currentItem(plan, run);
  if (!item || !isQuestionItem(item)) return { run, result: null, changed: false };

  const existing = run.answers?.[index];
  if (existing !== undefined) return { run, result: existing, changed: false };

  const limitSeconds = item.round === ITEM_MILLIONAIRE ? MILLIONAIRE_SECONDS : QUIZ_SECONDS;
  // Nullish, not falsy: a stageStartedAt of 0 is a real timestamp.
  const startedAt = run.stageStartedAt ?? now;
  const result = scoreAnswer({
    question: item, pickedIndex, elapsedMs: now - startedAt, limitSeconds,
  });

  return {
    run: { ...run, answers: { ...(run.answers || {}), [index]: { ...result, answeredAt: now } } },
    result,
    changed: true,
  };
}

/** Banks a 3D mission result against its plan row. Idempotent. */
export function completeItemGame(plan, run, result, { now = Date.now() } = {}) {
  const index = run.itemIndex;
  const item = plan[index];
  if (!item || item.round !== ITEM_GAME3D) return { run, changed: false };
  if (run.games?.[index]) return { run, changed: false };

  const entry = {
    points: game3dPoints(result),
    score: Math.max(0, Math.round(result?.score || 0)),
    completed: !!result?.completed,
    accuracy: Math.max(0, Math.min(100, Math.round(result?.accuracy || 0))),
    performance: Math.max(0, Math.min(100, Math.round(result?.performance ?? result?.accuracy ?? 0))),
    timeTakenMs: Math.max(0, Math.round(result?.timeTakenMs || 0)),
    rating: String(result?.rating || ""),
    gameId: String(result?.gameId || item.gameId || ""),
    skipped: !!result?.skipped,
    finishedAt: now,
  };
  return { run: { ...run, games: { ...(run.games || {}), [index]: entry } }, changed: true };
}

export function skipItemGame(plan, run, { now = Date.now() } = {}) {
  return completeItemGame(plan, run, { score: 0, rating: "SKIPPED", skipped: true }, { now }).run;
}

/* ------------------------- totals over a run ------------------------- */

export function runTotals(plan, run) {
  let quiz = 0;
  let millionaire = 0;
  Object.entries(run?.answers || {}).forEach(([i, a]) => {
    const item = plan?.[Number(i)];
    if (item?.round === ITEM_MILLIONAIRE) millionaire += a?.points || 0;
    else quiz += a?.points || 0;
  });
  const game3d = Object.values(run?.games || {})
    .reduce((t, g) => t + (Number(g?.points) || 0), 0);
  const speed = Object.values(run?.rounds || {})
    .reduce((t, r) => t + (Number(r?.bonus) || 0), 0);
  return { game3d, quiz, millionaire, speed, total: game3d + quiz + millionaire + speed };
}

/**
 * Total time the participant actually spent playing: the sum of their
 * round clocks, NOT wall-clock since they joined. Waiting for the host
 * to release the next round is not their time.
 *
 * Used to break ties on the leaderboard, so that two people on the same
 * score are separated by who got there first.
 */
export function runPlayingMs(run) {
  return Object.values(run?.rounds || {})
    .reduce((t, r) => t + (Number(r?.elapsedMs) || 0), 0);
}

export function runProgress(plan, run) {
  const list = plan || [];
  const answered = Object.keys(run?.answers || {}).length;
  const played = Object.keys(run?.games || {}).length;
  const done = answered + played;
  return {
    itemIndex: run?.itemIndex ?? 0,
    roundIndex: runRoundIndex(list, run),
    roundNumber: runRoundIndex(list, run) + 1,
    roundCount: planRoundCount(list),
    answered,
    gamesDone: played,
    itemsDone: done,
    totalItems: list.length,
    percent: list.length ? Math.round((done / list.length) * 100) : 0,
  };
}

export function runSummary(plan, run) {
  const list = plan || [];
  const totals = runTotals(list, run);
  const s = planSummary(list);
  let quizCorrect = 0;
  let mqCorrect = 0;
  Object.entries(run?.answers || {}).forEach(([i, a]) => {
    if (!a?.correct) return;
    if (list[Number(i)]?.round === ITEM_MILLIONAIRE) mqCorrect += 1;
    else quizCorrect += 1;
  });
  const games = run?.games || {};
  const questionTotal = s.quiz + s.millionaire;
  return {
    totals,
    quizCorrect, quizTotal: s.quiz,
    mqCorrect, mqTotal: s.millionaire,
    correctTotal: quizCorrect + mqCorrect,
    questionTotal,
    accuracy: questionTotal ? Math.round(((quizCorrect + mqCorrect) / questionTotal) * 100) : 0,
    gamesCompleted: Object.values(games).filter((g) => g?.completed).length,
    gamesPlayed: Object.keys(games).length,
    gameTotal: s.missions,
    games,
    answers: run?.answers || {},
    rounds: run?.rounds || {},
    playingMs: runPlayingMs(run),
  };
}

/** Remaining milliseconds on the current question. */
export function itemRemainingMs(plan, run, now = Date.now()) {
  const item = plan?.[run?.itemIndex ?? 0];
  const limit = item?.round === ITEM_MILLIONAIRE ? MILLIONAIRE_SECONDS : QUIZ_SECONDS;
  const elapsed = now - (run?.stageStartedAt ?? now);
  return Math.max(0, limit * 1000 - elapsed);
}
