import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HardHat, Play, Clock, CheckCircle2, XCircle, Trophy, Gem, Target,
  ChevronRight, Percent, Users, Phone, Ban, Gamepad2, ListChecks,
  Award, Crown, Loader2, AlertTriangle, SkipForward, Zap, Languages,
} from "lucide-react";
import { COLORS, inputStyle, btnStyle, linkBtnStyle } from "./theme.js";
import { getLang, setLang, otherLang, LANGS, onLangChange, t, tOptions } from "./arena/language.js";

const MissionDemo = lazy(() => import("./MissionDemo.jsx"));

/** "7m 12s" — playing time, for the speed bonus line. */
function formatPlayTime(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const m = Math.floor(total / 60);
  const sec = Math.round(total % 60);
  return m ? `${m}m ${sec}s` : `${sec}s`;
}
import {
  STAGES, QUIZ_SECONDS, MILLIONAIRE_SECONDS, NOT_RELEASED,
  ROUND_MISSION_NAMES, ROUND_MISSION_BLURBS,
  ITEM_GAME3D, ITEM_MILLIONAIRE,
  createRun, isRunValid, currentItem, answerItem, advanceRun, releaseRun,
  completeItemGame, skipItemGame, runRoundIndex, planRoundCount, planSummary,
  runTotals, runSummary, runProgress, itemRemainingMs, runPlayingMs,
} from "./session.js";

// The 3D game runs inside the Arena's own shell, loaded on demand so a
// participant who never reaches that stage downloads none of it.
const GameShell = lazy(() => import("./arena/ui/GameShell.jsx"));

/* ------------------------------------------------------------------ *
 *  INTEGRATED PARTICIPANT SESSION
 *
 *  One game code, one set of details, five rounds:
 *
 *      ONE plan: 3D missions and questions in a single ordered list
 *
 *  The host releases each round (game.releasedRound); between rounds the
 *  participant waits. Inside a round they work at their own speed.
 *
 *  The participant's progress lives on their own player record in the
 *  Realtime Database, so a refresh resumes exactly where they were with
 *  the same questions in the same order. `player.score` is kept as the
 *  COMBINED total, which is what the existing TV race, leaderboard and
 *  admin panel already read — so none of them needed changing.
 * ------------------------------------------------------------------ */

export default function SoloSession({
  me, game, plan = [], players, connected, serverOffset = 0, onPersist, onExit,
}) {
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  // The questions carry Tamil alongside the English; this mirrors
  // the shared setting so the screen redraws when it changes.
  const [lang, setLangState] = useState(getLang);
  useEffect(() => onLangChange(setLangState), []);
  const [reveal, setReveal] = useState(null);
  const [lifelineView, setLifelineView] = useState({ audience: false, hint: false });
  const timedOutRef = useRef(new Set());

  const session = me.session;
  const valid = isRunValid(plan, session);
  const planInfo = useMemo(() => planSummary(plan), [plan]);
  const roundCount = planInfo.rounds;
  const releasedRound = Number.isFinite(game?.releasedRound) ? game.releasedRound : NOT_RELEASED;

  /* ----------------------------- clock ----------------------------- */

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + serverOffset), 250);
    return () => clearInterval(id);
  }, [serverOffset]);

  /* --------------------------- persistence --------------------------- */

  // Writes the whole player record, which is how the existing app
  // already persists a player. `score` stays the combined total.
  const persist = useCallback((nextSession, extra = {}) => {
    const totals = runTotals(plan, nextSession);
    const updated = {
      ...me,
      ...extra,
      session: nextSession,
      scores: {
        game3d: totals.game3d, quiz: totals.quiz,
        millionaire: totals.millionaire, speed: totals.speed,
      },
      score: totals.total,
      // Time actually spent playing, for the leaderboard tie-break.
      // Two people on the same score are separated by who got there
      // first, which is the point of releasing rounds together.
      playingMs: runPlayingMs(nextSession),
    };
    onPersist(updated);
    return updated;
  }, [me, onPersist, plan]);

  /* ------------------------- answer handling ------------------------- */

  const stage = session?.stage || STAGES.LOCKED;
  const item = valid ? currentItem(plan, session) : null;
  const isFinale = item?.round === ITEM_MILLIONAIRE;
  const index = session?.roundIndex ?? runRoundIndex(plan, session);
  const itemIndex = session?.itemIndex ?? 0;
  const question = item && item.round !== ITEM_GAME3D ? item : null;
  const answered = session?.answers?.[itemIndex];
  const remainingMs = itemRemainingMs(plan, session, now);
  // Where this question sits within its own round, for the header.
  const roundItems = useMemo(
    () => plan.filter((p) => (p.roundIndex ?? 0) === (item?.roundIndex ?? 0) && p.round !== ITEM_GAME3D),
    [plan, item?.roundIndex]
  );
  const stepInRound = roundItems.findIndex((_, i) =>
    plan.indexOf(roundItems[i]) === itemIndex) + 1;

  const submit = useCallback((pickedIndex) => {
    if (!question || answered !== undefined) return;
    const step = answerItem(plan, session, { pickedIndex, now: Date.now() + serverOffset });
    if (!step.changed) return;
    persist(step.run);
    setReveal({ ...step.result, question });
    setLifelineView({ audience: false, hint: false });
  }, [answered, persist, plan, question, serverOffset, session]);

  // Running out of time records a zero-score answer rather than leaving
  // the participant stuck on a dead question.
  useEffect(() => {
    if (!question || answered !== undefined) return;
    if (remainingMs > 0) return;
    const key = String(itemIndex);
    if (timedOutRef.current.has(key)) return;
    timedOutRef.current.add(key);
    submit(-1);
  }, [answered, itemIndex, question, remainingMs, submit]);

  const next = useCallback(() => {
    setReveal(null);
    setLifelineView({ audience: false, hint: false });
    persist(advanceRun(plan, session, { now: Date.now() + serverOffset }));
  }, [persist, plan, serverOffset, session]);

  /* --------------------------- focus hygiene --------------------------- */

  /**
   * Clears focus whenever the question changes.
   *
   * Without this the answer is given away. React keys the option
   * buttons by index, so advancing to the next question REUSES the same
   * DOM nodes — and whatever was focused (the option you just tapped,
   * or the CONTINUE button that took its place) keeps focus. The focus
   * ring then sits on the same slot on every single question, which
   * reads exactly like "the cursor is pointing at the answer".
   */
  useEffect(() => {
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (active && typeof active.blur === "function" && active !== document.body) {
      active.blur();
    }
  }, [session?.itemIndex, session?.stage, reveal]);

  /* ------------------------- host-released rounds ------------------------- */

  // The host opens each round. While waiting we poll our own stage
  // against game.releasedRound and step in as soon as it is our turn.
  // releaseRound() is a no-op unless the round really has been released,
  // so this cannot run the participant ahead of the room.
  const waiting = stage === STAGES.LOCKED || stage === STAGES.ROUND_DONE;
  useEffect(() => {
    if (!valid || !waiting) return;
    const step = releaseRun(plan, session, { releasedRound, now: Date.now() + serverOffset });
    if (step.changed) persist(step.run);
  }, [persist, plan, releasedRound, serverOffset, session, valid, waiting]);

  /* ---------------------------- lifelines ---------------------------- */

  const lifelines = me.lifelines || { fifty: false, audience: false, phone: false };
  const eliminated = (me.lifelineData || {})[`mq${index}`]?.fiftyEliminated || [];

  const useLifeline = useCallback((type) => {
    if (!question || lifelines[type]) return;
    const nextLifelines = { ...lifelines, [type]: true };
    const nextData = { ...(me.lifelineData || {}) };
    if (type === "fifty") {
      const wrong = question.options
        .map((_, i) => i)
        .filter((i) => i !== question.correct)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);
      nextData[`mq${index}`] = { fiftyEliminated: wrong };
    }
    if (type === "audience") setLifelineView((v) => ({ ...v, audience: true }));
    if (type === "phone") setLifelineView((v) => ({ ...v, hint: true }));
    persist(session, { lifelines: nextLifelines, lifelineData: nextData });
  }, [index, lifelines, me.lifelineData, persist, question, session]);

  // "Ask the room" reads what other participants picked on this exact
  // question, wherever they are in their own session.
  const audience = useMemo(() => {
    // Only computed while the lifeline is actually open — otherwise this
    // would re-hydrate every other participant's paper on every poll.
    if (!question || !isFinale || !lifelineView.audience) return null;
    const counts = question.options.map(() => 0);
    let total = 0;
    (players || []).forEach((p) => {
      if (p.id === me.id || !p.session) return;
      // Everyone runs the SAME plan, so the row index is shared — only
      // the option order differs, which is why the pick is compared by
      // text rather than by index.
      const a = p.session.answers?.[itemIndex];
      if (!a || a.pickedIndex === undefined || a.pickedIndex < 0) return;
      const theirs = currentItem(plan, { ...p.session, itemIndex });
      const pickedText = theirs?.options?.[a.pickedIndex];
      const slot = pickedText === undefined ? -1 : question.options.indexOf(pickedText);
      if (slot >= 0) { counts[slot] += 1; total += 1; }
    });
    return { counts, total };
  }, [itemIndex, lifelineView.audience, me.id, plan, players, question]);

  /* ------------------------------ stages ------------------------------ */

  // A player record from before this build, or a corrupted session.
  if (!valid) {
    return (
      <Centered>
        <Panel title="Starting your session" icon={<Loader2 size={18} color={COLORS.yellow} />}>
          <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
            We could not read your question set, so a fresh one needs to be drawn. Your details are
            kept — only the questions are re-dealt.
          </p>
          <button
            style={btnStyle(COLORS.yellow)}
            onClick={() => persist(createRun(plan, { now: Date.now() + serverOffset }))}
          >
            Deal my questions
          </button>
          <button style={linkBtnStyle} onClick={onExit}>← Back</button>
        </Panel>
      </Centered>
    );
  }

  if (waiting) {
    const nextRoundIndex = stage === STAGES.ROUND_DONE ? index + 1 : index;
    return (
      <RoundWaiting
        me={me}
        game={game}
        connected={connected}
        session={session}
        roundIndex={Math.min(nextRoundIndex, roundCount - 1)}
        plan={plan}
        roundCount={roundCount}
        justFinishedRound={stage === STAGES.ROUND_DONE ? index : null}
        onExit={onExit}
      />
    );
  }

  if (stage === STAGES.GAME3D) {
    return (
      <Suspense fallback={<Centered><p style={{ color: COLORS.muted }}>Loading the 3D mission…</p></Centered>}>
        <EmbeddedGame
          gameId={item?.gameId}
          roundNumber={index + 1}
          me={me}
          onComplete={(result) => {
            const outcome = completeItemGame(plan, session, result, { now: Date.now() + serverOffset });
            persist(advanceRun(plan, outcome.run, { now: Date.now() + serverOffset }));
          }}
          onSkip={() => {
            const skipped = skipItemGame(plan, session, { now: Date.now() + serverOffset });
            persist(advanceRun(plan, skipped, { now: Date.now() + serverOffset }));
          }}
        />
      </Suspense>
    );
  }

  if (stage === STAGES.DONE) {
    return <SessionResult me={me} plan={plan} players={players} onExit={onExit} />;
  }

  /* --------------------------- question view --------------------------- */

  const progress = runProgress(plan, session);
  const limitSeconds = isFinale ? MILLIONAIRE_SECONDS : QUIZ_SECONDS;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const showReveal = answered !== undefined;
  const revealData = reveal && reveal.question?.id === question?.id ? reveal : (showReveal ? { ...answered, question } : null);

  return (
    <div className="csl-player-stage" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SessionHeader
        me={me}
        connected={connected}
        progress={progress}
        label={isFinale
          ? `Round ${index + 1} of ${roundCount} · Safety Millionaire`
          : `Round ${index + 1} of ${roundCount} · Question ${stepInRound} of ${roundItems.length}`}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "18px 0" }}>
        <div style={{ width: "100%", maxWidth: 460 }}>
          {!question && (
            <p style={{ color: COLORS.muted, textAlign: "center" }}>Preparing the next question…</p>
          )}

          {question && !showReveal && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 }}>
                <span style={{ fontSize: 12, color: isFinale ? COLORS.purple : COLORS.muted, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  {isFinale ? <Gem size={14} /> : <Target size={14} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isFinale ? question.tier : question.topic}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 900, fontSize: 15, color: remainingSeconds <= 5 ? COLORS.red : COLORS.yellow, flexShrink: 0 }}>
                  <Clock size={14} /> {remainingSeconds}s
                </span>
              </div>

              <div style={{ height: 4, background: COLORS.surface, borderRadius: 2, marginBottom: 16, overflow: "hidden" }}>
                <div style={{
                  width: `${(remainingMs / (limitSeconds * 1000)) * 100}%`,
                  height: "100%",
                  background: remainingSeconds <= 5 ? COLORS.red : COLORS.yellow,
                  transition: "width .25s linear",
                }} />
              </div>

              {isFinale && (
                <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
                  Worth {question.points} points
                </div>
              )}

              <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35, marginBottom: 18 }}>
                {t(question, "question", lang)}
              </p>

              {isFinale && (
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <LifelineButton icon={<Percent size={14} />} label="50:50" used={lifelines.fifty} onClick={() => useLifeline("fifty")} />
                  <LifelineButton icon={<Users size={14} />} label="Ask the Room" used={lifelines.audience} onClick={() => useLifeline("audience")} />
                  <LifelineButton icon={<Phone size={14} />} label="Hint" used={lifelines.phone} onClick={() => useLifeline("phone")} />
                </div>
              )}

              {isFinale && lifelineView.audience && audience && (
                <div style={{ background: COLORS.surfaceRaised, borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 6 }}>
                    HOW OTHERS ANSWERED THIS QUESTION ({audience.total} {audience.total === 1 ? "person" : "people"})
                  </div>
                  {question.options.map((_, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 12 }}>
                      <span style={{ width: 18 }}>{String.fromCharCode(65 + i)}</span>
                      <div style={{ flex: 1, height: 8, background: "#00000033", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${audience.total ? (audience.counts[i] / audience.total) * 100 : 0}%`, height: "100%", background: COLORS.purple }} />
                      </div>
                    </div>
                  ))}
                  {audience.total === 0 && (
                    <div style={{ fontSize: 11, color: COLORS.muted }}>
                      Nobody else has reached this question yet.
                    </div>
                  )}
                </div>
              )}

              {isFinale && lifelineView.hint && (
                <div style={{ background: COLORS.surfaceRaised, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>
                  💡 {question.explanation}
                </div>
              )}

              <div style={{ display: "grid", gap: 10 }}>
                {tOptions(question, lang).map((option, i) => {
                  const isOut = isFinale && eliminated.includes(i);
                  return (
                    <button
                      // Keyed by the OPTION TEXT, not the index. Keying
                      // by index makes React reuse the same four DOM
                      // nodes for every question, which is how focus
                      // (and therefore the focus ring) ends up parked on
                      // the same slot question after question.
                      key={`${index}:${option}`}
                      type="button"
                      className="csl-answer"
                      disabled={isOut || remainingSeconds === 0}
                      onClick={() => submit(i)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                        padding: "14px 14px", borderRadius: 10,
                        border: `1px solid ${isOut ? COLORS.line : COLORS.line}`,
                        background: isOut ? COLORS.surface : COLORS.surfaceRaised,
                        color: isOut ? COLORS.muted : COLORS.ink,
                        fontWeight: 600, fontSize: 15, cursor: isOut ? "not-allowed" : "pointer",
                        opacity: isOut ? 0.45 : 1, minHeight: 56,
                        textDecoration: isOut ? "line-through" : "none",
                      }}
                    >
                      <span style={{
                        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                        background: (isFinale ? COLORS.purple : COLORS.yellow) + "22",
                        border: `1px solid ${(isFinale ? COLORS.purple : COLORS.yellow)}66`,
                        color: isFinale ? COLORS.purple : COLORS.yellow,
                        fontSize: 12, fontWeight: 900,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>{option}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {question && showReveal && revealData && (
            <QuestionReveal
              question={question}
              result={revealData}
              isFinale={isFinale}
              onNext={next}
              isLast={itemIndex >= plan.length - 1}
              endsRound={isFinale}
              roundNumber={index + 1}
              moreInRound={!isFinale && stepInRound < roundItems.length}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================ sub-screens ============================ */

function SessionHeader({ me, connected, progress, label }) {
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 10, marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {me.name}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted }}>{label}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* Every question carries Tamil. The switch sits on the
              question screen itself, not in a settings menu, and takes
              effect on the question already in front of you. */}
          <button
            type="button"
            onClick={() => setLang(otherLang())}
            aria-label="Change language"
            style={{
              display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
              background: COLORS.surface, color: COLORS.ink,
              border: `1px solid ${COLORS.line}`, borderRadius: 8,
              padding: "6px 10px", fontWeight: 900, fontSize: 11.5,
            }}
          >
            <Languages size={13} color={COLORS.muted} />
            {(LANGS.find((l) => l.id === getLang()) || LANGS[0]).short}
          </button>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: COLORS.yellow }}>{me.score || 0}</div>
            <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700 }}>POINTS</div>
          </div>
        </div>
      </div>
      <div style={{ height: 3, background: COLORS.surface, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
        <div style={{ width: `${progress.percent}%`, height: "100%", background: COLORS.green, transition: "width .3s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: COLORS.muted, marginTop: 4 }}>
        <span>{connected ? "Live" : "Reconnecting…"}</span>
        <span>{progress.itemsDone} / {progress.totalItems} done</span>
      </div>
    </div>
  );
}

/**
 * Between rounds. The host decides when the room moves on, so this is
 * where a participant sits until `game.releasedRound` reaches them —
 * before Round 1, and after finishing each round's finale question.
 */
function RoundWaiting({ me, game, connected, session, plan = [], roundCount = 1, roundIndex, justFinishedRound, onExit }) {
  const [briefOpen, setBriefOpen] = useState(false);
  const progress = runProgress(plan, session);
  const totals = runTotals(plan, session);
  // The mission that OPENS the round being waited on, read from the
  // plan rather than assumed — the admin may have reordered it.
  const gameId = plan.find((i) => (i.roundIndex ?? 0) === roundIndex && i.round === ITEM_GAME3D)?.gameId;
  const roundQuestions = plan.filter((i) => (i.roundIndex ?? 0) === roundIndex && i.round !== ITEM_GAME3D);
  const quizCount = roundQuestions.filter((i) => i.round !== ITEM_MILLIONAIRE).length;
  const finaleCount = roundQuestions.length - quizCount;
  const isFirst = justFinishedRound === null && roundIndex === 0;

  return (
    <div className="csl-player-stage" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SessionHeader
        me={me}
        connected={connected}
        progress={progress}
        label={isFirst ? "Waiting to start" : `Round ${(justFinishedRound ?? 0) + 1} complete`}
      />

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px 0" }}>
        <div style={{ width: "min(100%, 460px)" }}>
          <div style={{
            background: COLORS.surface, border: `1px solid ${COLORS.line}`,
            borderTop: `3px solid ${isFirst ? COLORS.yellow : COLORS.green}`,
            borderRadius: 14, padding: 22, marginBottom: 12, textAlign: "center",
          }}>
            {isFirst ? (
              <>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8, background: COLORS.yellow,
                  color: "#1A1200", padding: "5px 12px", borderRadius: 4, fontWeight: 800,
                  fontSize: 11, letterSpacing: 1, marginBottom: 14,
                }}>
                  <HardHat size={14} /> YOU'RE IN
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 8px", letterSpacing: -0.5 }}>
                  Welcome, {me.name}
                </h1>
                <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  {roundCount} rounds of 3D missions and questions — {plan.length} items in all,
                  scored into one result. The answer order inside every question is shuffled for you.
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 size={44} color={COLORS.green} />
                <h1 style={{ fontSize: 24, fontWeight: 900, margin: "10px 0 6px", letterSpacing: -0.5 }}>
                  Round {(justFinishedRound ?? 0) + 1} complete
                </h1>
                <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  {totals.total} points so far, across {progress.itemsDone} of {plan.length} items.
                </p>
              </>
            )}
          </div>

          <div style={{
            background: COLORS.surface, border: `1px solid ${COLORS.line}`,
            borderRadius: 12, padding: "14px 16px", marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, letterSpacing: 0.8, marginBottom: 8 }}>
              NEXT UP · ROUND {roundIndex + 1} OF {roundCount}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: COLORS.orange + "22", border: `1px solid ${COLORS.orange}66`, color: COLORS.orange,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Gamepad2 size={18} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 800, fontSize: 15 }}>
                  {ROUND_MISSION_NAMES[gameId] || "3D mission"}
                </span>
                <span style={{ display: "block", fontSize: 12.5, color: COLORS.muted, marginTop: 2, lineHeight: 1.45 }}>
                  {ROUND_MISSION_BLURBS[gameId] || ""}
                </span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 12, color: COLORS.muted }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Target size={13} color={COLORS.green} /> {quizCount} quiz question{quizCount === 1 ? "" : "s"}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Gem size={13} color={COLORS.purple} /> {finaleCount} finale question{finaleCount === 1 ? "" : "s"}</span>
            </div>
          </div>

          {/* The full instructions for the mission about to start, in
              English or Tamil, with the host's demo video if there is
              one. Collapsed by default so the waiting screen stays
              short, because most people will have watched it on the TV. */}
          <button
            type="button"
            onClick={() => setBriefOpen((v) => !v)}
            style={{
              ...btnStyle, width: "100%", marginBottom: 12,
              background: briefOpen ? COLORS.surfaceRaised : COLORS.surface,
              color: COLORS.ink, border: `1px solid ${COLORS.line}`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <ListChecks size={15} color={COLORS.green} />
            {briefOpen ? "Hide the briefing" : "How to play this mission · தமிழ்"}
          </button>

          {briefOpen && gameId && (
            <div style={{ marginBottom: 12 }}>
              <Suspense fallback={<p style={{ color: COLORS.muted, fontSize: 13, textAlign: "center" }}>Loading the briefing…</p>}>
                <MissionDemo
                  gameId={gameId}
                  game={game}
                  size="compact"
                  roundLabel={`ROUND ${roundIndex + 1} OF ${roundCount}`}
                />
              </Suspense>
            </div>
          )}

          <div style={{
            background: COLORS.surfaceRaised, borderRadius: 10, padding: "14px 14px",
            display: "flex", gap: 10, alignItems: "center", justifyContent: "center",
            fontSize: 13, color: COLORS.muted, lineHeight: 1.5, textAlign: "center",
          }}>
            <Loader2 size={16} color={COLORS.yellow} style={{ flexShrink: 0, animation: "cslSpin 1s linear infinite" }} />
            <span>Waiting for the host to start Round {roundIndex + 1}…</span>
          </div>
          <style>{"@keyframes cslSpin { to { transform: rotate(360deg); } }"}</style>

          <p style={{ fontSize: 12, color: COLORS.muted, textAlign: "center", marginTop: 12, lineHeight: 1.55 }}>
            You can close this page and come back — your progress, score and exact questions are saved.
          </p>
          <button style={linkBtnStyle} onClick={onExit}>← Back</button>
        </div>
      </div>
    </div>
  );
}

function EmbeddedGame({ gameId, roundNumber, me, onComplete, onSkip }) {
  const [arenaGame, setArenaGame] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import("./arena/arenaConstants.js")
      .then((mod) => { if (!cancelled) setArenaGame(mod.getGame(gameId) || mod.GAMES[0]); })
      .catch(() => { if (!cancelled) setArenaGame(null); });
    return () => { cancelled = true; };
  }, [gameId]);

  if (!arenaGame) {
    return (
      <Centered>
        <p style={{ color: COLORS.muted }}>Loading the 3D mission…</p>
      </Centered>
    );
  }

  return (
    <GameShell
      game={arenaGame}
      identity={{ id: me.id, name: me.name, team: me.team, source: "session" }}
      embedded
      roundLabel={`Round ${roundNumber}`}
      onEmbeddedComplete={onComplete}
      onExit={onSkip}
      onOpenLeaderboard={() => {}}
    />
  );
}

function QuestionReveal({ question, result, isFinale, onNext, isLast, endsRound, roundNumber, moreInRound }) {
  const correct = !!result.correct;
  const noAnswer = result.pickedIndex === undefined || result.pickedIndex < 0;
  return (
    <div style={{ textAlign: "center" }}>
      {correct ? <CheckCircle2 size={48} color={COLORS.green} /> : <XCircle size={48} color={COLORS.red} />}
      <h2 style={{ marginTop: 12, fontSize: 22, fontWeight: 900, color: correct ? COLORS.green : COLORS.red }}>
        {noAnswer ? "OUT OF TIME" : correct ? "CORRECT!" : "INCORRECT"}
      </h2>

      <div style={{
        background: COLORS.surfaceRaised, borderRadius: 10, padding: "12px 14px",
        marginTop: 16, textAlign: "left",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, letterSpacing: 0.8, marginBottom: 5 }}>
          CORRECT ANSWER
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, lineHeight: 1.45 }}>
          {tOptions(question, lang)[question.correct]}
        </div>
        {question.explanation && (
          <p style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6, margin: "10px 0 0" }}>
            {question.explanation}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
        <StatCell label="Points" value={`+${result.points || 0}`} />
        {correct && <StatCell label="Speed" value={`${result.speedMark || 0}/100`} />}
      </div>

      <button style={btnStyle(isFinale ? COLORS.purple : COLORS.yellow)} onClick={onNext}>
        {isLast
          ? "SEE MY RESULT"
          : endsRound
            ? `FINISH ROUND ${roundNumber}`
            : moreInRound
              ? "NEXT QUESTION"
              : "ON TO THE FINALE"}
        <ChevronRight size={16} style={{ verticalAlign: -3, marginLeft: 4 }} />
      </button>
    </div>
  );
}

function SessionResult({ me, plan = [], players, onExit }) {
  const summary = runSummary(plan, me.session);
  const sorted = useMemo(
    () => [...(players || [])].sort((a, b) => (b.score || 0) - (a.score || 0)),
    [players]
  );
  const rank = sorted.findIndex((p) => p.id === me.id) + 1;
  const { totals } = summary;

  const sections = [
    { label: `3D Missions (${summary.gameTotal})`, value: totals.game3d, color: COLORS.orange, icon: <Gamepad2 size={14} />,
      detail: `${summary.gamesCompleted} of ${summary.gameTotal} completed` },
    { label: `Safety Quiz (${summary.quizTotal})`, value: totals.quiz, color: COLORS.green, icon: <Target size={14} />,
      detail: `${summary.quizCorrect} of ${summary.quizTotal} correct` },
    { label: `Safety Millionaire (${summary.mqTotal})`, value: totals.millionaire, color: COLORS.purple, icon: <Gem size={14} />,
      detail: `${summary.mqCorrect} of ${summary.mqTotal} correct` },
    { label: "Speed bonus", value: totals.speed, color: COLORS.yellow, icon: <Zap size={14} />,
      detail: summary.playingMs
        ? `${formatPlayTime(summary.playingMs)} of playing time`
        : "awarded for finishing rounds quickly" },
  ];

  return (
    <div className="csl-player-stage" style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ textAlign: "center", padding: "22px 0 18px" }}>
          <Crown size={44} color={COLORS.yellow} />
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: "12px 0 4px" }}>Session complete</h1>
          <p style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>{me.name}</p>
          <div style={{ fontSize: 52, fontWeight: 900, color: COLORS.yellow, letterSpacing: -2, marginTop: 14, lineHeight: 1 }}>
            {totals.total}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 800, letterSpacing: 1.2 }}>
            TOTAL POINTS
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
          <StatCell label="Rank" value={rank ? `#${rank}` : "—"} />
          <StatCell label="Correct" value={`${summary.correctTotal}/${summary.questionTotal}`} />
          <StatCell label="Accuracy" value={`${summary.accuracy}%`} />
        </div>

        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 900, color: COLORS.muted, letterSpacing: 0.8, marginBottom: 12 }}>
            <ListChecks size={14} /> SCORE BREAKDOWN
          </div>
          {sections.map((s) => (
            <div key={s.label} style={{
              display: "flex", alignItems: "center", gap: 11,
              background: COLORS.surfaceRaised, borderRadius: 9,
              padding: "10px 12px", marginBottom: 6,
            }}>
              <span style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: s.color + "22", border: `1px solid ${s.color}66`, color: s.color,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {s.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 800, fontSize: 13.5 }}>{s.label}</span>
                <span style={{ display: "block", fontSize: 11, color: COLORS.muted }}>{s.detail}</span>
              </span>
              <b style={{ color: s.color, fontSize: 16, flexShrink: 0 }}>{s.value}</b>
            </div>
          ))}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            borderTop: `1px solid ${COLORS.line}`, marginTop: 10, paddingTop: 11,
            fontWeight: 900, fontSize: 15,
          }}>
            <span>Combined total</span>
            <span style={{ color: COLORS.yellow, fontSize: 20 }}>{totals.total}</span>
          </div>
        </div>

        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 900, color: COLORS.muted, letterSpacing: 0.8, marginBottom: 12 }}>
            <Trophy size={14} /> LEADERBOARD
          </div>
          {sorted.slice(0, 10).map((p, i) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: 8, marginBottom: 3,
              background: p.id === me.id ? COLORS.yellow + "1f" : "transparent",
            }}>
              <span style={{ width: 22, fontWeight: 800, fontSize: 13, color: i === 0 ? COLORS.yellow : COLORS.muted }}>
                {i + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}{p.id === me.id ? " (you)" : ""}
              </span>
              <b style={{ color: COLORS.yellow, fontSize: 13.5 }}>{p.score || 0}</b>
            </div>
          ))}
          {sorted.length === 0 && (
            <p style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>No scores yet.</p>
          )}
        </div>

        <div style={{
          background: COLORS.surfaceRaised, borderRadius: 10, padding: "11px 13px",
          fontSize: 12, color: COLORS.muted, lineHeight: 1.55, display: "flex", gap: 9,
        }}>
          <Award size={15} color={COLORS.green} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Your result is saved against your game code. Review the explanations with your
            supervisor — the questions you got wrong are the ones worth talking about.
          </span>
        </div>

        <button style={linkBtnStyle} onClick={onExit}>← Back to the main menu</button>
      </div>
    </div>
  );
}

/* ---------------------------- small pieces ---------------------------- */

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }}>
      {children}
    </div>
  );
}

function Panel({ title, icon, children }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 18, width: "min(100%, 420px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function StatCell({ label, value }) {
  return (
    <div style={{ background: COLORS.surfaceRaised, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.yellow }}>{value}</div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const LifelineButton = React.memo(function LifelineButton({ icon, label, used, onClick }) {
  return (
    <button
      disabled={used}
      onClick={onClick}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        padding: "8px 4px", borderRadius: 8,
        border: `1px solid ${used ? COLORS.line : COLORS.purple}`,
        background: used ? COLORS.surfaceRaised : COLORS.purple + "22",
        color: used ? COLORS.muted : COLORS.purple,
        fontSize: 10, fontWeight: 700, cursor: used ? "not-allowed" : "pointer", opacity: used ? 0.5 : 1,
      }}
    >
      {used ? <Ban size={14} /> : icon}
      {label}
    </button>
  );
});
