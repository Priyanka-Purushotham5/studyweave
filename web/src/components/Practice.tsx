import { useState } from "react";
import { ArrowRight, BookOpen, Check, CircleHelp, Heart, Volume2, X, Zap } from "lucide-react";
import type { AttemptResponse, Concept, Evidence, Question, Resource, Trace } from "../../../contracts/types";
import { api } from "../api/client";
import { nextAttack, recordAttack, startBattle, type Attack, type Battle } from "../lib/battleEngine";
import { Citation } from "./Common";

type Run = (action: () => Promise<void>, retry?: boolean) => Promise<void>;

export function Practice({ moduleId, concepts, resources, mode, findConceptModule, run, busy, onAttempt, onClear, onEvidence, onTrace }: {
  moduleId: string; concepts: Concept[]; resources: Resource[]; mode: "quiz" | "battle"; findConceptModule: (id: string) => string | undefined; run: Run; busy: boolean;
  onAttempt: (result: AttemptResponse) => void; onClear: () => void;
  onEvidence: (item: Evidence) => void; onTrace: (trace: Trace) => void;
}) {
  const [session, setBattle] = useState<Battle>();
  const battle = session ?? startBattle(concepts.map(concept => concept.id));
  const [question, setQuestion] = useState<Question>();
  const [attack, setAttack] = useState<Attack>();
  const [answered, setAnswered] = useState<{ correct: boolean; result: AttemptResponse }>();
  const [seen, setSeen] = useState<string[]>([]);
  const [refused, setRefused] = useState(false);
  const [response, setResponse] = useState("");
  const [reveal, setReveal] = useState(false);
  const isBattle = mode === "battle";
  const won = isBattle && !!session && concepts.length > 0 && !battle.remaining.length;
  const lost = isBattle && !battle.hearts;
  const title = isBattle ? "Boss battle" : "Practice quiz";
  const chosen = nextAttack(battle);

  function getQuestion(concept = isBattle ? chosen : undefined) {
    void run(async () => {
      const attackModuleId = concept
        ? findConceptModule(concept.conceptId) ?? moduleId
        : moduleId;
      const { questions } = await api.questions({ moduleId: attackModuleId, n: concept ? 1 : 4, ...(concept ?? {}) });
      // When a concept has verified questions at another level, use the nearest one.
      const options = !questions.length && concept
        ? (await api.questions({ moduleId: attackModuleId, n: 4, conceptId: concept.conceptId })).questions.sort((a, b) => Math.abs(a.difficulty - concept.difficulty) - Math.abs(b.difficulty - concept.difficulty))
        : questions;
      const next = options.find(item => !seen.includes(item.id)) ?? options[0];
      setQuestion(next);
      setAttack(concept && next ? concept : undefined);
      setAnswered(undefined);
      setResponse("");
      setReveal(false);
      setRefused(!next);
    });
  }

  function answer(correct: boolean) {
    if (!question || answered || busy) return;
    const conceptId = attack?.conceptId ?? question.conceptIds[0];
    void run(async () => {
      const result = await api.attempt({ questionId: question.id, conceptId, correct });
      setAnswered({ correct, result });
      setSeen(previous => [...previous, question.id]);
      onAttempt(result);
      if (attack) {
        const updated = recordAttack(battle, attack, correct, result.xp, result.trace?.rootConceptId);
        setBattle(updated);
        if (!updated.remaining.length) onClear();
      }
    });
  }

  const canSpeak = "speechSynthesis" in window;
  function speak(text: string) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  return <section className="panel work-panel" aria-labelledby={`practice-${mode}`}>
    <div className="panel-head"><div className="panel-title"><span className="tile-icon">{isBattle ? <Zap size={18}/> : <CircleHelp size={18}/>}</span>
      <div><h2 id={`practice-${mode}`}>{title}</h2><p>{isBattle ? "Master each concept before you run out of hearts." : "Test your understanding with questions from your materials."}</p></div>
    </div></div>
    <div className="panel-body workspace-form">
      {isBattle && <div className="battle-status">
        <span className="hearts" role="img" aria-label={`${battle.hearts} of 3 hearts`}>{[1, 2, 3].map(number => <Heart key={number} size={21} fill={number <= battle.hearts ? "currentColor" : "none"} aria-hidden="true"/>)}</span>
        <label className="health-bar">Boss health · {battle.remaining.length}/{concepts.length}<progress max={Math.max(1, concepts.length)} value={battle.remaining.length}/></label>
        <span className="tag"><Zap size={15}/> {battle.xp} XP</span>
      </div>}
      {(won || lost) && <div className={`feedback ${won ? "positive" : "negative"}`} role="status">{won ? "Boss defeated. Module cleared!" : "Battle lost. Review your sources and try again."}</div>}
      {!question && !refused && !won && !lost && <button className="button primary" disabled={busy || !concepts.length} onClick={() => getQuestion()}>{isBattle ? "Start battle" : "Start quiz"} <ArrowRight size={16}/></button>}
      {!concepts.length && <p className="muted">Build the concept web before starting practice.</p>}
      {refused && <div className="empty"><BookOpen size={22}/><h3>Not in your materials</h3><p>No verified question is available for this selection.</p>{!isBattle && <button className="button" disabled={busy} onClick={() => getQuestion()}>Try again</button>}</div>}
      {question && <>
        <div className="question-head"><span className="tag">{["", "Basic", "Standard", "Application"][question.difficulty]}</span>
          {canSpeak && <button className="button compact" onClick={() => speak([question.text, ...question.options].join(". "))}><Volume2 size={16}/> Read aloud</button>}
        </div>
        <h3 className="question">{question.text}</h3>
        {question.options.length ? <div className="options">
          {question.options.map((option, index) => {
            const letter = "ABCD"[index];
            return <button className={answered && letter === question.answer ? "correct-option" : ""} key={letter} disabled={busy || !!answered} onClick={() => answer(letter === question.answer)}><span>{letter}</span>{option}</button>;
          })}
        </div> : <><label>Your answer<textarea value={response} disabled={reveal} onChange={event => setResponse(event.target.value)}/></label>
          {!reveal && <button className="button" disabled={!response.trim()} onClick={() => setReveal(true)}>Reveal answer</button>}
          {reveal && <p className="panel-note">{question.answer}</p>}
          {reveal && !answered && <div className="actions"><button className="button" disabled={busy} onClick={() => answer(false)}>I missed it</button><button className="button primary" disabled={busy} onClick={() => answer(true)}>I got it</button></div>}
        </>}
        {answered && <div className={`feedback ${answered.correct ? "positive" : "negative"}`} role="status">{answered.correct ? <Check size={17}/> : <X size={17}/>}
          {answered.correct ? `Correct · +${answered.result.xp} XP` : `Incorrect · Answer: ${question.options.length ? question.options["ABCD".indexOf(question.answer)] : question.answer}`}</div>}
        <div className="citation-list">{question.citations.map((item, index) => <Citation key={index} evidence={item} resources={resources} open={onEvidence}/>)}</div>
        {answered && <div className="actions">
          {answered.result.trace && <button className="button" onClick={() => onTrace(answered.result.trace!)}>Show learning gap</button>}
          {!won && !lost && <button className="button primary" disabled={busy} onClick={() => getQuestion()}>Next question <ArrowRight size={16}/></button>}
        </div>}
      </>}
      {(won || lost || (isBattle && refused)) && <button className="button" onClick={() => { setBattle(undefined); setQuestion(undefined); setAnswered(undefined); setRefused(false); setSeen([]); }}>Restart battle</button>}
    </div>
  </section>;
}
