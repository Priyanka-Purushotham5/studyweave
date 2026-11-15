import type React from "react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Captions, ChevronRight, CircleHelp, FileStack, FolderOpen,
  GraduationCap, LayoutGrid, Network, Plus, RefreshCw, Settings2, Sparkles, Target, X, Zap,
} from "lucide-react";
import type { AnswerResponse, AttemptResponse, Concept, Edge, Evidence, Graph, Resource, RevisionPlan, Trace, Tree } from "../../contracts/types";
import { api, apiUrl, waitForJob } from "./api/client";
import { Citation, Dialog, ErrorBanner } from "./components/Common";
import { Lectures } from "./components/Lectures";
import { Readiness, StudyMap } from "./components/Map";
import { Capture, SourceList } from "./components/Materials";
import { Practice } from "./components/Practice";
import { bestEvidence, readSaved, resourceUrl } from "./lib/study";

const tabs = [
  { id: "map", name: "Study map", Icon: Network },
  { id: "quiz", name: "Practice quiz", Icon: CircleHelp },
  { id: "battle", name: "Boss battle", Icon: Zap },
  { id: "captions", name: "Lecture captions", Icon: Captions },
  { id: "plan", name: "Revision plan", Icon: CalendarDays },
] as const;
type Screen = typeof tabs[number]["id"];
type Detail = { concept: Concept } | { edge: Edge } | { evidence: Evidence } | { resource: Resource };
const demo = import.meta.env.VITE_MOCK === "1";
const publicDemo = import.meta.env.VITE_PUBLIC_DEMO === "1";
const initialPrefs = { readable: false, contrast: false, motion: false };
const emptyGraph: Graph = { nodes: [], edges: [] };

export default function App() {
  const [tree, setTree] = useState<Tree>({ subjects: [] });
  const [graph, setGraph] = useState<Graph>(emptyGraph);
  const [subjectId, setSubject] = useState("");
  const [examId, setExam] = useState("");
  const [moduleId, setModule] = useState("");
  const [graphSubject, setGraphSubject] = useState("");
  const [practiceModes, setPracticeModes] = useState<("quiz" | "battle")[]>([]);
  const [screen, setScreen] = useState<Screen>("map");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [review, setReview] = useState<Awaited<ReturnType<typeof api.path>>>();
  const [detail, setDetail] = useState<Detail>();
  const [seekTime, setSeekTime] = useState<number>();
  const [modal, setModal] = useState<"capture" | "settings" | "create" | "ask">();
  const [error, setError] = useState<{ value: unknown; retry?: () => void }>();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [preferences, setPreferences] = useState(() => readSaved("studyweave-preferences", initialPrefs));
  const [cleared, setCleared] = useState<string[]>(() => readSaved("studyweave-cleared", []));
  const [xp, setXp] = useState(() => readSaved("studyweave-xp", 0));
  const [minutes, setMinutes] = useState(30);
  const [plan, setPlan] = useState<RevisionPlan>();
  const [createKind, setCreateKind] = useState<"subjects" | "exams" | "modules">("subjects");
  const [askValue, setAskValue] = useState("");
  const [answer, setAnswer] = useState<AnswerResponse>();
  const lock = useRef(false);
  const graphVersion = useRef(0);

  const subject = tree.subjects.find(item => item.id === subjectId) ?? tree.subjects[0];
  const exam = subject?.exams.find(item => item.id === examId) ?? subject?.exams[0];
  const mod = exam?.modules.find(item => item.id === moduleId) ?? exam?.modules[0];
  const currentGraph = graphSubject === subject?.id ? graph : emptyGraph;
  const concepts = currentGraph.nodes.filter(item => item.moduleId === mod?.id);
  const resources = tree.subjects.flatMap(item => item.exams.flatMap(test => test.modules.flatMap(module => module.resources)));
  const readiness = concepts.flatMap(concept => concept.readiness == null ? [] : [concept.readiness]);
  const average = readiness.length ? Math.round(readiness.reduce((sum, value) => sum + value, 0) / readiness.length) : null;
  const examHasAttempts = currentGraph.nodes.some(node => node.readiness != null && exam?.modules.some(module => module.id === node.moduleId));
  const isCleared = !!mod && cleared.includes(mod.id);
  const source = detail && ("resource" in detail ? detail.resource : "evidence" in detail ? resources.find(item => item.id === detail.evidence.resourceId) : undefined);

  const run = useCallback(async function perform(action: () => Promise<void>, retry = true) {
    if (lock.current) return;
    lock.current = true;
    setError(undefined);
    setBusy(true);
    try { await action(); }
    catch (value) { setError({ value, retry: retry ? () => void perform(action) : undefined }); }
    finally { lock.current = false; setBusy(false); }
  }, []);

  const refresh = useCallback(async () => {
    const result = await api.tree();
    setTree(result);
    setLoaded(true);
  }, []);

  const refreshGraph = useCallback(async (id: string) => {
    const version = ++graphVersion.current;
    const result = await api.graph(id);
    if (version !== graphVersion.current) return;
    setGraph(result);
    setGraphSubject(id);
  }, []);

  useEffect(() => { void run(refresh); }, [refresh, run]);
  useEffect(() => {
    if (!subject?.id) return;
    const id = subject.id;
    let active = true;
    const load = () => void refreshGraph(id).catch(value => {
      if (active) setError({ value, retry: load });
    });
    load();
    return () => { active = false; graphVersion.current++; };
  }, [refreshGraph, subject?.id]);

  useEffect(() => {
    if (screen !== "plan" || !exam?.id) return;
    let active = true;
    const examId = exam.id;
    setPlan(undefined);
    const load = () => void api.plan(examId, minutes).then(result => {
      if (active) setPlan(result);
    }).catch(value => {
      if (active) setError({ value, retry: load });
    });
    load();
    return () => { active = false; };
  }, [screen, exam?.id, minutes]);

  useEffect(() => {
    localStorage.setItem("studyweave-preferences", JSON.stringify(preferences));
    document.documentElement.dataset.readable = String(preferences.readable);
    document.documentElement.dataset.contrast = String(preferences.contrast);
    document.documentElement.dataset.motion = String(preferences.motion);
  }, [preferences]);
  useEffect(() => { localStorage.setItem("studyweave-cleared", JSON.stringify(cleared)); }, [cleared]);
  useEffect(() => { localStorage.setItem("studyweave-xp", JSON.stringify(xp)); }, [xp]);

  function showScreen(next: Screen) {
    setSeekTime(undefined);
    if (next === "quiz" || next === "battle") {
      setPracticeModes(previous => previous.includes(next) ? previous : [...previous, next]);
    }
    setScreen(next);
  }

  function selectModule(id: string, nextScreen: Screen = "map") {
    setSeekTime(undefined);
    for (const course of tree.subjects) {
      const parent = course.exams.find(test => test.modules.some(item => item.id === id));
      if (!parent) continue;
      if (id !== mod?.id) { setTrace(null); setReview(undefined); }
      setSubject(course.id); setExam(parent.id); setModule(id); setScreen(nextScreen);
      return;
    }
  }

  function openResource(resource?: Resource) {
    if (!resource) return;
    if (resource.url && (!publicDemo || !resource.url.startsWith("/api/"))) {
      const link = resourceUrl(resource, apiUrl);
      if (link) { window.open(link, "_blank", "noopener,noreferrer"); return; }
    }
    if (!demo && !publicDemo && !resource.pages?.length && (resource.type === "pdf" || resource.type === "pptx")) {
      const link = resourceUrl(resource, apiUrl);
      if (link) { window.open(link, "_blank", "noopener,noreferrer"); return; }
    }
    setDetail({ resource });
  }

  function onAttempt(result: AttemptResponse) {
    setGraph(previous => ({ ...previous, nodes: previous.nodes.map(node => node.id in result.readiness ? { ...node, readiness: result.readiness[node.id] } : node) }));
    setXp(previous => previous + result.xp);
    setTrace(result.trace);
    setReview(undefined);
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const date = data.get("date");
    const body = { name, ...(createKind === "exams" ? { subjectId: data.get("parent"), ...(date ? { date } : {}) } : createKind === "modules" ? { examId: data.get("parent") } : {}) };
    void run(async () => {
      const newItem = await api.create(createKind, body);
      await refresh();
      if (createKind === "subjects") { setSubject(newItem.id); setExam(""); setModule(""); }
      if (createKind === "exams") { setSubject(String(data.get("parent"))); setExam(newItem.id); setModule(""); }
      if (createKind === "modules") {
        setSubject(tree.subjects.find(item => item.exams.some(exam => exam.id === data.get("parent")))?.id ?? "");
        setExam(String(data.get("parent"))); setModule(newItem.id);
      }
      setScreen("map"); setTrace(null); setReview(undefined); setModal(undefined);
    }, false);
  }

  function removeSource(resource: Resource) {
    void run(async () => {
      await api.remove(resource.id);
      if (source?.id === resource.id) setDetail(undefined);
      setTrace(null);
      await refresh();
      if (subject) await refreshGraph(subject.id);
      setNotice(`Deleted ${resource.title}.`);
    }, false);
  }

  function build() {
    if (!mod || !subject) return;
    let jobId = "";
    void run(async () => {
      jobId ||= (await api.build(mod.id)).jobId;
      await waitForJob(() => api.job(jobId), () => { jobId = ""; });
      await refreshGraph(subject.id);
      setNotice("Concept web is ready.");
    });
  }

  function ask(prompt: { question: string } | { kind: "formula_sheet" }) {
    if (!mod) return;
    void run(async () => setAnswer(await api.ask(mod.id, prompt)));
  }

  const Gap = trace && <section className="panel gap-panel" aria-labelledby="gap-title">
    <div className="panel-head"><div className="panel-title"><span className="tile-icon gap-icon"><Target size={17}/></span><div><h2 id="gap-title">{trace.status === "likely" ? "Likely gap" : "Possible gap"}: {currentGraph.nodes.find(item => item.id === trace.rootConceptId)?.name ?? trace.rootConceptId}</h2><p>{trace.path.map(id => currentGraph.nodes.find(item => item.id === id)?.name ?? id).join(" → ")}</p></div></div>
    <button className="icon-button" title="Dismiss learning gap" aria-label="Dismiss learning gap" onClick={() => { setTrace(null); setReview(undefined); }}><X size={17}/></button></div>
    <div className="panel-body workspace-form"><blockquote>“{trace.evidence.quote}”</blockquote><Citation evidence={trace.evidence} resources={resources} open={item => setDetail({ evidence: item })}/>
    {!publicDemo && (!review ? <button className="button compact" disabled={busy} onClick={() => void run(async () => setReview(await api.path(trace.path[0] ?? trace.rootConceptId)))}>See revision path <ArrowRight size={15}/></button> :
      <ol className="revision-path">{review.map((item, index) => <li key={index}>{({ review: "Review", practice: "Practice", retry: "Retry" })[item.kind]} {currentGraph.nodes.find(node => node.id === item.conceptId)?.name ?? item.conceptId}</li>)}</ol>)}</div>
  </section>;

  const gapCitations = (items: Evidence[]) => <div className="workspace-form">{items.map((item, index) => <div className="quote-card" key={index}><blockquote>“{item.quote}”</blockquote><Citation evidence={item} resources={resources} open={evidence => setDetail({ evidence })}/></div>)}</div>;

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <aside className="sidebar" aria-label="Study workspace">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setScreen("map"); }}><span className="brand-icon"><Sparkles size={20}/></span><span>StudyNova</span></a>
      <div className="sidebar-body">
        <div className="sidebar-label">Workspace</div>
        <nav aria-label="Workspace">
          {tabs.filter(({ id }) => !publicDemo || (id !== "captions" && id !== "plan")).map(({ id, name, Icon }) => <button key={id} type="button" aria-current={screen === id ? "page" : undefined} onClick={() => showScreen(id)}><Icon size={18}/><span>{name}</span>{screen === id && <span className="nav-indicator"/>}</button>)}
        </nav>
        <div className="sidebar-label courses-label"><span>Courses</span>{!publicDemo && <button className="icon-button" aria-label="Create course, exam, or module" title="Create course, exam, or module" onClick={() => { setCreateKind(subject ? "modules" : "subjects"); setModal("create"); }}><Plus size={17}/></button>}</div>
        <nav className="course-nav" aria-label="Courses">{tree.subjects.map(course => <div key={course.id}>
          <button onClick={() => { setSubject(course.id); setExam(""); setModule(""); setTrace(null); setReview(undefined); setScreen("map"); }}><span className="course-icon"><GraduationCap size={15}/></span><span>{course.name}</span></button>
          {subject?.id === course.id && course.exams.map(test => <div className="course-exam" key={test.id}>
            <button onClick={() => { setExam(test.id); setModule(""); setTrace(null); setReview(undefined); setScreen("map"); }}><ChevronRight size={13}/><span>{test.name}</span></button>
            {exam?.id === test.id && test.modules.map(item => <button key={item.id} className="course-module" aria-current={mod?.id === item.id ? "location" : undefined} onClick={() => selectModule(item.id)}><span className="course-dot"/><span>{item.name}</span></button>)}
          </div>)}
        </div>)}</nav>
      </div>
      <div className="sidebar-foot"><button onClick={() => setModal("settings")}><Settings2 size={18}/> <span>Accessibility</span></button></div>
    </aside>
    <div className="content">
      <header className="topbar">
        <div className="breadcrumbs"><LayoutGrid size={17}/><span>Workspace</span>{subject && <><ChevronRight size={14}/><span>{subject.name}</span></>}{exam && <><ChevronRight size={14}/><strong>{exam.name}</strong></>}</div>
        <div className="actions">
          {demo && <span className="demo-badge"><span/> Demo</span>}
          {import.meta.env.VITE_SESSION_AUTH === "1" && <form method="post" action="/auth/logout"><button className="button" type="submit">Sign out</button></form>}
          <button className="icon-button" aria-label="Refresh workspace" title="Refresh workspace" disabled={busy} onClick={() => void run(async () => { await refresh(); if (subject) await refreshGraph(subject.id); })}><RefreshCw size={17}/></button>
          {!publicDemo && <button className="button primary top-add" disabled={!mod || busy} onClick={() => setModal("capture")}><Plus size={17}/> Add material</button>}
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {error && !modal && <ErrorBanner error={error.value} retry={error.retry} dismiss={() => setError(undefined)}/>}
        <span className="sr-only" role="status">{busy ? "Working…" : notice}</span>
        {mod ? <>
          <section className="hero" aria-labelledby="module-title">
            <div className="hero-pattern" aria-hidden="true"/>
            <div className="hero-content"><div className="eyebrow"><FolderOpen size={15}/> Study module {isCleared && <Readiness cleared/>}</div>
              <h1 id="module-title">{mod.name}</h1><p>{subject?.name} <span>·</span> {exam?.name}</p>
              <div className="hero-actions">
                <button className="button hero-primary" disabled={busy} onClick={() => showScreen("quiz")}><Zap size={16}/> Start practice <ArrowRight size={16}/></button>
                {!publicDemo && <button className="button hero-secondary" disabled={busy} onClick={() => { setAskValue(""); setAnswer(undefined); setModal("ask"); }}><Sparkles size={16}/> Ask materials</button>}
              </div>
            </div>
            <svg className="hero-constellation" viewBox="0 0 220 150" aria-hidden="true">
              <polyline points="18,112 64,76 108,94 150,40 200,58" />
              <polyline points="108,94 132,132" />
              {[[18,112],[64,76],[108,94],[150,40],[200,58],[132,132]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 3 ? 4.5 : 3} style={{ "--i": i } as React.CSSProperties}/>)}
            </svg>
          </section>
          <div className="stats">
            <div className="stat"><span className="tile-icon"><Network size={19}/></span><div><span>Concepts</span><strong>{concepts.length}</strong></div></div>
            <div className="stat"><span className="tile-icon blue"><FileStack size={18}/></span><div><span>Materials</span><strong>{mod.resources.length}</strong></div></div>
            <div className="stat"><span className="tile-icon amber"><Target size={19}/></span><div><span>Readiness</span><strong>{average == null ? "—" : `${average}%`}</strong></div></div>
            <div className="stat"><span className="tile-icon violet"><Zap size={18}/></span><div><span>Earned XP</span><strong>{xp}</strong></div></div>
          </div>
          <div className="workspace-grid">
            <div className="workspace-main">
              {screen === "map" && <>
                {Gap}
                <StudyMap tree={tree} graph={currentGraph} moduleId={mod.id} trace={trace} cleared={isCleared}
                  onModule={selectModule} onResource={openResource} onConcept={concept => setDetail({ concept })} onEdge={edge => setDetail({ edge })}/>
              </>}
              {practiceModes.map(mode => <div key={`${mode}-${mod.id}`} hidden={screen !== mode}><Practice mode={mode} moduleId={mod.id} concepts={concepts} resources={resources} findConceptModule={id => currentGraph.nodes.find(node => node.id === id)?.moduleId} run={run} busy={busy} onAttempt={onAttempt}
                onClear={() => setCleared(previous => previous.includes(mod.id) ? previous : [...previous, mod.id])}
                onEvidence={evidence => setDetail({ evidence })} onTrace={item => { setTrace(item); setScreen("map"); }}/></div>)}
              {screen === "captions" && <Lectures key={mod.id} mod={mod} concepts={concepts} run={run} busy={busy} seekTime={seekTime} onSeek={() => setSeekTime(undefined)}/>}
              {screen === "plan" && <section className="panel work-panel" aria-labelledby="plan-title">
                <div className="panel-head"><div className="panel-title"><span className="tile-icon"><CalendarDays size={18}/></span><div><h2 id="plan-title">Revision plan</h2><p>{exam?.name}{exam?.date ? ` · ${new Date(`${exam.date}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}` : " · Exam date not set"}</p></div></div></div>
                <div className="panel-body workspace-form"><label>Minutes per day<select value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[5, 15, 20, 30, 45, 60, 90, 120].map(value => <option key={value}>{value}</option>)}</select></label>
                  {!plan ? <p role="status">Loading revision plan…</p> : !plan.length || !examHasAttempts ? <p className="empty">No revision items yet. Build your concepts and complete a practice question.</p> :
                    <ol className="plan-list">{plan.map((item, index) => <li key={item.conceptId} style={{ "--i": index, "--share": `${Math.round(item.minutes / Math.max(...plan.map(entry => entry.minutes)) * 100)}%` } as React.CSSProperties}><button onClick={() => {
                      const concept = currentGraph.nodes.find(node => node.id === item.conceptId);
                      if (concept) setDetail({ concept });
                    }}><strong>{item.name}</strong><span className="plan-bar" aria-hidden="true"/><span>{item.minutes} min <ArrowUpRight size={14}/></span></button></li>)}</ol>}
                </div>
              </section>}
            </div>
            <div className="workspace-side">
              <section className="panel materials-panel" aria-labelledby="materials-title">
                <div className="panel-head"><div className="panel-title"><span className="tile-icon blue"><BookOpen size={17}/></span><div><h2 id="materials-title">Materials</h2><p>{mod.resources.length} {mod.resources.length === 1 ? "source" : "sources"} in this module</p></div></div>
                  {!publicDemo && <button className="icon-button" aria-label="Add a source" title="Add a source" disabled={busy} onClick={() => setModal("capture")}><Plus size={19}/></button>}
                </div>
                <SourceList resources={mod.resources} open={openResource} busy={busy} remove={publicDemo ? undefined : removeSource}/>
                {!publicDemo && <div className="panel-footer"><button className="button wide" disabled={busy || !mod.resources.some(item => item.extractionStatus === "done")} onClick={build}><Sparkles size={16}/> Build concept web</button></div>}
              </section>
              {!publicDemo && screen !== "plan" && <section className="plan-card" aria-labelledby="next-title"><span className="tile-icon"><CalendarDays size={19}/></span><div><h2 id="next-title">Plan your revision</h2><p>Set a daily study budget for {exam?.name?.toLowerCase() ?? "your exam"}.</p><button onClick={() => setScreen("plan")}>View plan <ArrowRight size={15}/></button></div></section>}
            </div>
          </div>
        </> : <section className="panel empty start-empty"><BookOpen size={32}/><h1>{loaded ? "Set up your study workspace" : "StudyNova"}</h1>
          <p>{loaded ? "Create a course, exam, and module to start collecting materials." : error ? "Retry the connection to load your courses." : "Loading your workspace…"}</p>
          {loaded && !publicDemo && <button className="button primary" onClick={() => { setCreateKind(subject ? exam ? "modules" : "exams" : "subjects"); setModal("create"); }}><Plus size={17}/> {subject ? exam ? "Create module" : "Create exam" : "Create course"}</button>}
        </section>}
      </main>
    </div>
    {modal && <Dialog title={{ capture: "Add study material", settings: "Accessibility", create: "Create a study space", ask: "Ask your materials" }[modal]} close={() => { setModal(undefined); setError(undefined); }}>
      {error && <ErrorBanner error={error.value} retry={error.retry} dismiss={() => setError(undefined)}/>}
      {modal === "capture" && mod && <Capture mod={mod} run={run} busy={busy} refresh={refresh} done={() => { setModal(undefined); setNotice("Material added."); }}/>}
      {modal === "settings" && <div className="workspace-form">
        {([{ key: "readable", title: "Reading font", desc: "Use Atkinson Hyperlegible Next for clearer letter shapes." }, { key: "contrast", title: "High contrast", desc: "Increase contrast across text, borders and controls." }, { key: "motion", title: "Reduce motion", desc: "Turn off interface transitions and animations." }] as const).map(item =>
          <label key={item.key} className="setting"><span><strong>{item.title}</strong><small>{item.desc}</small></span><input type="checkbox" checked={preferences[item.key]} onChange={event => setPreferences(previous => ({ ...previous, [item.key]: event.target.checked }))}/></label>)}
      </div>}
      {modal === "create" && <form className="workspace-form" onSubmit={create}>
        <label>Type<select value={createKind} onChange={event => setCreateKind(event.target.value as typeof createKind)}>
          <option value="subjects">Course</option><option value="exams" disabled={!tree.subjects.length}>Exam</option><option value="modules" disabled={!tree.subjects.some(item => item.exams.length)}>Module</option>
        </select></label>
        {createKind !== "subjects" && <label>{createKind === "exams" ? "Course" : "Exam"}<select name="parent" key={createKind} defaultValue={createKind === "exams" ? subject?.id : exam?.id} required>
          {createKind === "exams" ? tree.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>) :
            tree.subjects.flatMap(item => item.exams.map(exam => <option key={exam.id} value={exam.id}>{item.name} · {exam.name}</option>))}
        </select></label>}
        <label>Name<input name="name" autoComplete="off" required maxLength={120}/></label>
        {createKind === "exams" && <label>Exam date <small>(optional)</small><input type="date" name="date"/></label>}
        <button className="button primary" disabled={busy}>Create {createKind === "subjects" ? "course" : createKind === "exams" ? "exam" : "module"}</button>
      </form>}
      {modal === "ask" && <div className="workspace-form"><form className="workspace-form" onSubmit={event => { event.preventDefault(); if (askValue.trim()) ask({ question: askValue.trim() }); }}>
        <label>Question<input maxLength={2000} value={askValue} onChange={event => setAskValue(event.target.value)} placeholder="What does the chain rule let us compute?" required/></label>
        <div className="actions"><button className="button primary" disabled={busy || !askValue.trim()}><Sparkles size={16}/> Ask question</button><button type="button" className="button" disabled={busy} onClick={() => ask({ kind: "formula_sheet" })}>Create formula sheet</button></div>
      </form>{answer && ("refused" in answer ? <p className="feedback negative" role="status">Not in your materials.</p> : <><p className="answer-text">{answer.answer}</p>{gapCitations(answer.citations)}</>)}</div>}
    </Dialog>}
    {detail && <Dialog title={"concept" in detail ? detail.concept.name : "edge" in detail ? "Concept connection" : source?.title ?? "Source evidence"} close={() => setDetail(undefined)}>
      {"concept" in detail && <div className="workspace-form">
        <Readiness value={detail.concept.readiness} cleared={cleared.includes(detail.concept.moduleId)}/><p>{detail.concept.definition}</p>
        {"speechSynthesis" in window && <button className="button" onClick={() => { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${detail.concept.name}. ${detail.concept.definition}`)); }}>Read concept aloud</button>}
        {gapCitations(detail.concept.evidence)}
        {!publicDemo && bestEvidence(detail.concept)?.startSec != null && <button className="button" onClick={() => { selectModule(detail.concept.moduleId, "captions"); setSeekTime(bestEvidence(detail.concept)?.startSec); setDetail(undefined); }}>Open lecture captions <ArrowRight size={16}/></button>}
      </div>}
      {"edge" in detail && <div className="workspace-form"><span className="tag">{{ prerequisite: "Prerequisite", extends: "Builds on", contrasts: "Contrasts with" }[detail.edge.type]}</span>
        <h3>{currentGraph.nodes.find(item => item.id === detail.edge.from)?.name} → {currentGraph.nodes.find(item => item.id === detail.edge.to)?.name}</h3>
        <p>{detail.edge.reason}</p>{gapCitations([detail.edge.evidence.from, detail.edge.evidence.to])}
      </div>}
      {("evidence" in detail || "resource" in detail) && <SourceDetail source={source} evidence={"evidence" in detail ? detail.evidence : undefined}/>}
    </Dialog>}
  </div>;
}

function SourceDetail({ source, evidence }: {source?: Resource; evidence?: Evidence}) {
  const [file, setFile] = useState<string>();
  useEffect(() => {
    if (!demo || !source) return;
    void import("./mocks/fixtures").then(module => {
      setFile(module.demoFile(source.id));
    });
  }, [source]);
  const pages = source?.pages ?? [];
  const [page, setPage] = useState(evidence?.page ?? pages[0]?.n);
  useEffect(() => { setPage(evidence?.page ?? pages[0]?.n); }, [evidence?.page, source?.id]);
  const selected = pages.find(item => item.n === page);
  const locator = page == null ? evidence : { resourceId: source?.id ?? "", page, quote: "", startSec: page === evidence?.page ? evidence.startSec : selected?.startSec };
  const link = source && source.url && (!publicDemo || !source.url.startsWith("/api/")) ? resourceUrl(source, apiUrl, locator) : file && source?.type === "pdf" && page ? `${file}#page=${page}` : file;
  return <div className="workspace-form">
    {evidence && <><span className="tag">Page {evidence.page}</span><blockquote>“{evidence.quote}”</blockquote></>}
    {pages.length > 1 && <label>Source page<select value={page} onChange={event => setPage(Number(event.target.value))}>{pages.map(item => <option key={item.n} value={item.n}>{item.n}</option>)}</select></label>}
    {selected && <p className="source-text">{selected.text}</p>}
    {source?.type === "youtube" && <p className="muted">YouTube timestamps are approximate.</p>}
    {link && <a className="button" href={link} target="_blank" rel="noreferrer">Open original <ArrowUpRight size={16}/></a>}
    {!selected && !link && <p className="muted">No text or original file is available for this source.</p>}
  </div>;
}
