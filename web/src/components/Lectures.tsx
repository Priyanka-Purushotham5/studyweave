import { useEffect, useRef, useState, type FormEvent } from "react";
import { Captions, Check, Clock, Mic, Pencil, Play } from "lucide-react";
import type { Concept, CorrectionRequest, Flag, Lecture, Module } from "../../../contracts/types";
import { api, apiUrl, waitForJob } from "../api/client";
import { readSaved, timestamp } from "../lib/study";
import { maxUpload } from "./Materials";

type Run = (action: () => Promise<void>, retry?: boolean) => Promise<void>;
const isDemo = import.meta.env.VITE_MOCK === "1";

export function Lectures({ mod, concepts, run, busy, seekTime, onSeek }: {
  mod: Module; concepts: Concept[]; run: Run; busy: boolean; seekTime?: number; onSeek: () => void;
}) {
  const savedKey = `studyweave-lecture-${mod.id}`;
  const [lectureId, setLectureId] = useState(() => readSaved(savedKey, isDemo && mod.id === "m_backprop" ? "demo" : ""));
  const [lecture, setLecture] = useState<Lecture>();
  const [audioUrl, setAudioUrl] = useState(lectureId === "demo" ? "/demo-lecture.mp3" : "");
  const [file, setFile] = useState<File>();
  const slides = mod.resources.filter(resource => (resource.type === "pdf" || resource.type === "pptx") && resource.extractionStatus === "done");
  const [slide, setSlide] = useState("");
  const [edit, setEdit] = useState<Flag>();
  const [replacement, setReplacement] = useState("");
  const [notice, setNotice] = useState("");
  const [job, setJob] = useState<{ lectureId: string; jobId: string }>();
  const player = useRef<HTMLAudioElement>(null);
  const loadedId = useRef("");
  const objectUrl = useRef<string | undefined>(undefined);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  const slidesId = slides.some(resource => resource.id === slide) ? slide : slides[0]?.id ?? "";

  useEffect(() => {
    if (!lectureId || loadedId.current === lectureId) return;
    if (isDemo && lectureId !== "demo") return;
    loadedId.current = lectureId;
    void run(async () => {
      setLecture(await api.lecture(lectureId));
      if (!isDemo) setAudioUrl(apiUrl(`/lectures/${encodeURIComponent(lectureId)}/audio`));
    });
  }, [lectureId, run]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !slidesId) return;
    if (file.size > maxUpload) {
      setNotice("Audio files must be 20 MB or smaller.");
      return;
    }
    void run(async () => {
      const result = job ?? await api.transcribe(file, mod.id, slidesId);
      setJob(result);
      await waitForJob(() => api.job(result.jobId), () => setJob(undefined));
      const updated = await api.lecture(result.lectureId);
      loadedId.current = result.lectureId;
      setLectureId(result.lectureId);
      if (!isDemo) localStorage.setItem(savedKey, JSON.stringify(result.lectureId));
      if (isDemo) {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(file);
      }
      setAudioUrl(objectUrl.current ?? apiUrl(`/lectures/${encodeURIComponent(result.lectureId)}/audio`));
      setLecture(updated);
      setFile(undefined);
      setJob(undefined);
      setNotice("Transcript is ready.");
    }, false);
  }

  function save(body: CorrectionRequest) {
    void run(async () => {
      const result = await api.correction(lectureId, body);
      setLecture(previous => previous ? { ...previous, ...result } : previous);
      setEdit(undefined);
      setNotice("Caption updated.");
    }, false);
  }

  useEffect(() => {
    if (seekTime == null || !lecture || !player.current) return;
    seek(seekTime);
    onSeek();
  }, [seekTime, lecture, onSeek]);

  function seek(seconds: number) {
    if (!player.current) return;
    player.current.currentTime = seconds;
    player.current.focus();
    setNotice(`Player moved to ${timestamp(seconds)}.`);
  }

  return <section className="panel work-panel" aria-labelledby="captions-title">
    <div className="panel-head"><div className="panel-title"><span className="tile-icon"><Captions size={18}/></span><div><h2 id="captions-title">Lecture captions</h2><p>Review technical terms against your lecture slides.</p></div></div></div>
    <div className="panel-body workspace-form">
      {lecture && <>
        {audioUrl && <audio controls ref={player} src={audioUrl} tabIndex={0} aria-label="Lecture audio"/>}
        {!!concepts.some(node => node.evidence.some(item => item.startSec != null)) && <div className="actions">{concepts.flatMap(node => {
          const time = node.evidence.find(item => item.startSec != null)?.startSec;
          return time == null ? [] : [<button className="button compact" key={node.id} onClick={() => seek(time)}><Play size={14}/> {node.name} · {timestamp(time)}</button>];
        })}</div>}
        <div className="transcript" aria-label="Transcript">{lecture.words.map((word, index) => {
          const flag = lecture.flags.find(item => item.startIdx <= index && item.endIdx > index);
          if (flag && flag.startIdx !== index) return null;
          return flag ? <mark key={index}>{flag.heard}</mark> : <span key={index}>{word.w}</span>;
        })}</div>
        <div className="corrections">
          {lecture.flags.map(flag => <div className="correction" key={flag.id}>
            <div><strong>{flag.heard} → {flag.suggestion}</strong><small><Clock size={13}/> {timestamp(lecture.words[flag.startIdx]?.startSec ?? 0)} · {flag.reason}</small></div>
            <div className="actions">
              <button className="button compact" disabled={busy} onClick={() => seek(lecture.words[flag.startIdx]?.startSec ?? 0)} aria-label={`Seek to ${flag.heard}`}><Play size={14}/></button>
              <button className="button compact" disabled={busy} onClick={() => { setEdit(flag); setReplacement(flag.suggestion); }} aria-label={`Edit ${flag.heard}`}><Pencil size={14}/></button>
              <button className="button primary compact" disabled={busy} onClick={() => save({ flagId: flag.id })} aria-label={`Fix ${flag.heard}`}><Check size={15}/> Fix</button>
            </div>
          </div>)}
          {!lecture.flags.length && <p className="muted">All flagged captions have been reviewed.</p>}
        </div>
        {edit && <form className="workspace-form edit-caption" onSubmit={event => {
          event.preventDefault();
          save({ startIdx: edit.startIdx, endIdx: edit.endIdx, to: replacement });
        }}>
          <label htmlFor="caption-replacement">Replace “{edit.heard}”</label>
          <input id="caption-replacement" maxLength={1000} value={replacement} onChange={event => setReplacement(event.target.value)} required autoFocus/>
          <div className="actions"><button type="button" className="button" onClick={() => setEdit(undefined)}>Cancel</button><button className="button primary" disabled={busy || !replacement.trim()}>Save correction</button></div>
        </form>}
      </>}
      <form className="workspace-form" onSubmit={submit}>
        <h3>{lecture ? "Transcribe another lecture" : "Transcribe a lecture"}</h3>
        {slides.length ? <>
          <label>Lecture audio<input type="file" disabled={busy} accept="audio/*" onChange={event => { setJob(undefined); setFile(event.target.files?.[0]); }}/></label>
          <label>Reference slides<select disabled={busy} value={slidesId} onChange={event => { setJob(undefined); setSlide(event.target.value); }}>{slides.map(resource => <option value={resource.id} key={resource.id}>{resource.title}</option>)}</select></label>
          <button className="button primary" disabled={!file || busy}><Mic size={16}/> {busy ? "Processing…" : job ? "Check transcription" : "Transcribe audio"}</button>
        </> : <p className="muted">Add a text-based PDF or PPTX to use as a vocabulary reference.</p>}
      </form>
      <span className="muted" role="status">{notice}</span>
    </div>
  </section>;
}
