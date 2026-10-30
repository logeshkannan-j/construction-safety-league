/* ------------------------------------------------------------------ *
 *  PARTICIPANT SESSION
 *
 *  One participant enters the game code and their details ONCE, and gets
 *  one session made of five rounds. The host releases each round; inside
 *  a released round the participant plays at their own speed:
 *
 *      ROUND n:  3D mission n  →  1 quiz question  →  1 finale question
 *
 *  Five rounds × three items = 15 items, and the five rounds use the
 *  five different 3D missions in order.
 *
 *  Everything here is a pure function over plain data, for two reasons:
 *
 *  1. It is testable without a browser (see tests/session.test.mjs).
 *  2. The session descriptor is small enough to store on the player's
 *     own record in the Realtime Database, which is what makes a page
 *     refresh resume exactly where the participant left off instead of
 *     re-shuffling the paper or starting them again.
 *
 *  The descriptor stores question IDS and an option PERMUTATION, not
 *  the question text — so it is a few hundred bytes, and the questions
 *  are rebuilt deterministically from the bank on every device.
 * ------------------------------------------------------------------ */

import {
  QUIZ_BANK, MILLIONAIRE_BANK,
  TIER_ORDER, quizQuestionById, millionaireQuestionById,
} from "./questionBank.js";

// Bumped to 2 when the session became round-based. A session written by
// an older build no longer validates, so the participant is given a
// fresh paper instead of being resumed into a shape this build cannot
// read. See isSessionValid.
export const SESSION_VERSION = 2;

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

/** One quiz question and one finale question per round. */
export const QUIZ_COUNT = ROUND_COUNT;
export const MILLIONAIRE_COUNT = ROUND_COUNT;
export const TOTAL_QUESTIONS = QUIZ_COUNT + MILLIONAIRE_COUNT;
export const TOTAL_ITEMS = ROUND_COUNT * 3;

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
export function drawQuiz(count = QUIZ_COUNT) {
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
export function drawMillionaire(count = MILLIONAIRE_COUNT) {
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

/**
 * A flat paper for the ORIGINAL live event mode, which is not
 * round-based and keeps its own 10 + 5 shape. Shares this module's draw
 * and shuffle so the two modes can never drift apart.
 */
export function createLivePaper({ quizCount = 10, mqCount = 5 } = {}) {
  const withPerm = (question) => applyPermutation(question, permutationFor(question.options.length));
  return {
    quiz: drawQuiz(quizCount).map(withPerm),
    millionaire: drawMillionaire(mqCount).map(withPerm),
  };
}

/**
 * Draws a fresh paper and pairs it with the five missions, so round n
 * holds mission n, one quiz question and one finale question.
 */
export function createSessionDescriptor() {
  const quiz = drawQuiz();
  const mq = drawMillionaire();

  const rounds = ROUND_GAMES.map((gameId, i) => ({
    gameId,
    quiz: { id: quiz[i].id, perm: permutationFor(quiz[i].options.length) },
    mq: { id: mq[i].id, perm: permutationFor(mq[i].options.length) },
  }));

  return { v: SESSION_VERSION, rounds };
}

/** The session block stored on a player record when they join. */
export function createSession({ now = Date.now() } = {}) {
  return {
    v: SESSION_VERSION,
    descriptor: createSessionDescriptor(),
    roundIndex: 0,
    stage: STAGES.LOCKED,
    startedAt: now,
    stageStartedAt: now,
    answers: { quiz: {}, mq: {} },  // both keyed by round index
    games: {},                      // 3D result, keyed by round index
  };
}

/* --------------------------- reading one back --------------------------- */

/**
 * Rebuilds the participant's actual rounds from their descriptor.
 * Deterministic: the same descriptor always produces the same paper, on
 * any device, after any refresh.
 */
export function hydrateSession(session) {
  const rounds = session?.descriptor?.rounds;
  if (!Array.isArray(rounds)) return { rounds: [], quiz: [], millionaire: [] };

  const built = rounds.map((round, index) => ({
    index,
    gameId: round.gameId,
    quiz: applyPermutation(quizQuestionById(round.quiz?.id), round.quiz?.perm),
    millionaire: applyPermutation(millionaireQuestionById(round.mq?.id), round.mq?.perm),
  }));

  return {
    rounds: built,
    quiz: built.map((r) => r.quiz).filter(Boolean),
    millionaire: built.map((r) => r.millionaire).filter(Boolean),
  };
}

/** True when the stored session is usable by this build. */
export function isSessionValid(session) {
  if (!session || session.v !== SESSION_VERSION) return false;
  const { rounds } = hydrateSession(session);
  return rounds.length === ROUND_COUNT
    && rounds.every((r) => r.quiz && r.millionaire && ROUND_GAMES.includes(r.gameId));
}

/* ------------------------------ scoring ------------------------------ */

/**
 * Points for one answer. Correct answers are worth more the sooner they
 * arrive, using the same speed curve the live quiz already used: a
 * correct answer is worth between 50% and 100% of the question's value.
 */
export function scoreAnswer({ question, pickedIndex, elapsedMs, limitSeconds }) {
  const limitMs = Math.max(1, limitSeconds * 1000);
  const clamped = Math.max(0, Math.min(limitMs, Number(elapsedMs) || 0));
  const correct = pickedIndex === question.correct;
  const speedMark = correct ? Math.round(((limitMs - clamped) / limitMs) * 100) : 0;
  const base = Number(question.points) || 100;
  const points = correct ? Math.round(base * (0.5 + speedMark / 200)) : 0;
  return {
    correct,
    points,
    speedMark,
    pickedIndex,
    elapsedMs: Math.round(clamped),
  };
}

/** Scales one mission's raw Arena score into its session value. */
export function game3dPoints(result) {
  const max = Math.max(1, Number(result?.maxScore) || 12000);
  const raw = Math.max(0, Number(result?.score) || 0);
  return Math.max(0, Math.min(GAME_POINTS_PER_ROUND,
    Math.round((raw / max) * GAME_POINTS_PER_ROUND)));
}

export function sectionTotals(session) {
  const sum = (obj) => Object.values(obj || {}).reduce((t, a) => t + (a?.points || 0), 0);
  const quizPoints = sum(session?.answers?.quiz);
  const mqPoints = sum(session?.answers?.mq);
  const game3d = Object.values(session?.games || {})
    .reduce((t, g) => t + (Number(g?.points) || 0), 0);
  return {
    game3d,
    quiz: quizPoints,
    millionaire: mqPoints,
    total: game3d + quizPoints + mqPoints,
  };
}

/* ---------------------------- transitions ---------------------------- */

/**
 * Opens the current round if the host has released it.
 *
 * `releasedRound` is the highest round index the host has started.
 * A participant can never run ahead of it, which is what keeps the room
 * together, and can never be pushed backwards out of a round they have
 * already begun.
 */
export function releaseRound(session, { releasedRound, now = Date.now() } = {}) {
  const released = Number.isFinite(releasedRound) ? releasedRound : NOT_RELEASED;
  if (session.stage === STAGES.DONE) return { session, changed: false };

  const waiting = session.stage === STAGES.LOCKED || session.stage === STAGES.ROUND_DONE;
  if (!waiting) return { session, changed: false };

  // ROUND_DONE means this round is finished, so the NEXT one is what is
  // being waited on.
  const wantedRound = session.stage === STAGES.ROUND_DONE ? session.roundIndex + 1 : session.roundIndex;
  if (wantedRound >= ROUND_COUNT) {
    return { session: { ...session, stage: STAGES.DONE, finishedAt: now }, changed: true };
  }
  if (released < wantedRound) return { session, changed: false };

  return {
    session: {
      ...session,
      roundIndex: wantedRound,
      stage: STAGES.GAME3D,
      stageStartedAt: now,
    },
    changed: true,
  };
}

/**
 * Records one quiz or finale answer for the current round.
 *
 * Returns { session, result, changed }. `changed` is false when the
 * answer was ignored — which happens if that round's question is already
 * answered, so a double tap, a retry or a replayed network request can
 * never score twice.
 */
export function answerQuestion(session, { section, pickedIndex, now = Date.now() }) {
  const key = section === "mq" ? "mq" : "quiz";
  const index = session.roundIndex;
  const { rounds } = hydrateSession(session);
  const round = rounds[index];
  const question = key === "mq" ? round?.millionaire : round?.quiz;
  if (!question) return { session, result: null, changed: false };

  const existing = session.answers?.[key]?.[index];
  if (existing !== undefined) {
    return { session, result: existing, changed: false };
  }

  const limitSeconds = key === "mq" ? MILLIONAIRE_SECONDS : QUIZ_SECONDS;
  // Nullish, not falsy: a stageStartedAt of 0 is a real timestamp.
  const startedAt = session.stageStartedAt ?? now;
  const elapsedMs = now - startedAt;
  const result = scoreAnswer({ question, pickedIndex, elapsedMs, limitSeconds });

  const answers = {
    ...session.answers,
    [key]: { ...(session.answers?.[key] || {}), [index]: { ...result, answeredAt: now } },
  };

  return { session: { ...session, answers }, result, changed: true };
}

/**
 * Moves past the question just answered: quiz → finale → end of round.
 *
 * At the end of a round the participant goes back to waiting, because
 * the host decides when the room moves on.
 */
export function advanceQuestion(session, { now = Date.now() } = {}) {
  if (session.stage === STAGES.QUIZ) {
    return { ...session, stage: STAGES.MILLIONAIRE, stageStartedAt: now };
  }
  if (session.stage === STAGES.MILLIONAIRE) {
    const isLast = session.roundIndex + 1 >= ROUND_COUNT;
    return {
      ...session,
      stage: isLast ? STAGES.DONE : STAGES.ROUND_DONE,
      stageStartedAt: now,
      ...(isLast ? { finishedAt: now } : {}),
    };
  }
  return session;
}

/**
 * Records this round's 3D result and moves on to the round's quiz.
 *
 * Idempotent: once a round's 3D result is stored it is never
 * overwritten, so replaying a mission cannot inflate the score and a
 * refresh cannot bank it twice.
 */
export function completeGame3d(session, result, { now = Date.now() } = {}) {
  const index = session.roundIndex;
  if (session.games?.[index]) {
    return { session: { ...session, stage: STAGES.QUIZ, stageStartedAt: now }, changed: false };
  }
  const entry = {
    points: game3dPoints(result),
    score: Math.max(0, Math.round(result?.score || 0)),
    completed: !!result?.completed,
    accuracy: Math.max(0, Math.min(100, Math.round(result?.accuracy || 0))),
    performance: Math.max(0, Math.min(100, Math.round(result?.performance ?? result?.accuracy ?? 0))),
    timeTakenMs: Math.max(0, Math.round(result?.timeTakenMs || 0)),
    rating: String(result?.rating || ""),
    gameId: String(result?.gameId || ROUND_GAMES[index] || ""),
    finishedAt: now,
  };
  return {
    session: {
      ...session,
      games: { ...(session.games || {}), [index]: entry },
      stage: STAGES.QUIZ,
      stageStartedAt: now,
    },
    changed: true,
  };
}

export function skipGame3d(session, { now = Date.now() } = {}) {
  const index = session.roundIndex;
  if (session.games?.[index]) {
    return { ...session, stage: STAGES.QUIZ, stageStartedAt: now };
  }
  return {
    ...session,
    games: {
      ...(session.games || {}),
      [index]: {
        points: 0, score: 0, completed: false, accuracy: 0, performance: 0,
        timeTakenMs: 0, rating: "SKIPPED", skipped: true,
        gameId: ROUND_GAMES[index] || "", finishedAt: now,
      },
    },
    stage: STAGES.QUIZ,
    stageStartedAt: now,
  };
}

/* ----------------------------- progress ----------------------------- */

export function currentRound(session) {
  const { rounds } = hydrateSession(session);
  return rounds[session?.roundIndex] || null;
}

export function sessionProgress(session) {
  const quizAnswered = Object.keys(session?.answers?.quiz || {}).length;
  const mqAnswered = Object.keys(session?.answers?.mq || {}).length;
  const gamesDone = Object.keys(session?.games || {}).length;
  const done = gamesDone + quizAnswered + mqAnswered;
  return {
    roundIndex: session?.roundIndex ?? 0,
    roundNumber: (session?.roundIndex ?? 0) + 1,
    roundCount: ROUND_COUNT,
    quizAnswered,
    mqAnswered,
    gamesDone,
    answered: quizAnswered + mqAnswered,
    totalQuestions: TOTAL_QUESTIONS,
    itemsDone: done,
    totalItems: TOTAL_ITEMS,
    percent: Math.round((done / TOTAL_ITEMS) * 100),
  };
}

export function sessionSummary(session) {
  const hydrated = hydrateSession(session);
  const totals = sectionTotals(session);
  const quizAnswers = session?.answers?.quiz || {};
  const mqAnswers = session?.answers?.mq || {};

  const quizCorrect = Object.values(quizAnswers).filter((a) => a?.correct).length;
  const mqCorrect = Object.values(mqAnswers).filter((a) => a?.correct).length;
  const games = session?.games || {};

  return {
    totals,
    quizCorrect,
    quizAnswered: Object.keys(quizAnswers).length,
    quizTotal: QUIZ_COUNT,
    mqCorrect,
    mqAnswered: Object.keys(mqAnswers).length,
    mqTotal: MILLIONAIRE_COUNT,
    correctTotal: quizCorrect + mqCorrect,
    questionTotal: TOTAL_QUESTIONS,
    accuracy: Math.round(((quizCorrect + mqCorrect) / TOTAL_QUESTIONS) * 100),
    gamesCompleted: Object.values(games).filter((g) => g?.completed).length,
    gamesPlayed: Object.keys(games).length,
    gameTotal: ROUND_COUNT,
    games,
    rounds: hydrated.rounds,
    questions: hydrated,
    answers: { quiz: quizAnswers, mq: mqAnswers },
  };
}

/** Remaining milliseconds on the current question. */
export function questionRemainingMs(session, now = Date.now()) {
  const limitSeconds = session?.stage === STAGES.MILLIONAIRE ? MILLIONAIRE_SECONDS : QUIZ_SECONDS;
  // Nullish, not falsy: a stageStartedAt of 0 is a real timestamp.
  const elapsed = now - (session?.stageStartedAt ?? now);
  return Math.max(0, limitSeconds * 1000 - elapsed);
}
