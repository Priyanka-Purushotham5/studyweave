import { useState, type FormEvent } from "react";
import { ArrowUpRight, FileText, Link2, UploadCloud, Video } from "lucide-react";
import type { Module, Resource } from "../../../contracts/types";
import { api, waitForJob } from "../api/client";

type Run = (action: () => Promise<void>, retry?: boolean) => Promise<void>;
export const maxUpload = 20_000_000;

export function Capture({ mod, run, busy, refresh, done }: {
  mod: Module; run: Run; busy: boolean; refresh: () => Promise<void>; done: () => void;
}) {
  const [kind, setKind] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File>();
  const [url, setUrl] = useState("");
  const [tag, setTag] = useState<NonNullable<Resource["tag"]>>("notes");
  const [issue, setIssue] = useState("");
  const [pending, setPending] = useState("");
  const youtube = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url.trim());

  function selectFile(file?: File) {
    setIssue("");
    if (file && !/\.(pdf|pptx)$/i.test(file.name)) {
      setFile(undefined);
      setIssue("Choose a PDF or PowerPoint (.pptx) file.");
    } else if (file && file.size > maxUpload) {
      setFile(undefined);
      setIssue("Documents must be 20 MB or smaller.");
    } else setFile(file);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (kind === "link") {
      const link = URL.parse(url.trim());
      if (!link || !["http:", "https:"].includes(link.protocol) || link.username || link.password) {
        setIssue("Enter a public HTTP or HTTPS link.");
        return;
      }
    }
    setIssue("");
    void run(async () => {
      const saved = pending ? { id: pending, extractionStatus: "pending" } : kind === "file" && file
        ? await api.upload(file, mod.id, tag)
        : await api.save({ moduleId: mod.id, url: url.trim(), type: youtube ? "youtube" : "web" });
      if (saved.extractionStatus === "pending") {
        setPending(saved.id);
        try { await waitForJob(() => api.extraction(saved.id), () => setPending("")); }
        finally { await refresh(); }
      } else {
        await refresh();
      }
      done();
    }, false);
  }

  return <form className="workspace-form" onSubmit={submit}>
    <p className="muted">Add a source to <strong>{mod.name}</strong>.</p>
    <div className="segmented">
      <button type="button" aria-pressed={kind === "file"} disabled={busy || !!pending} onClick={() => { setKind("file"); setIssue(""); }}><FileText size={15}/> Upload file</button>
      <button type="button" aria-pressed={kind === "link"} disabled={busy || !!pending} onClick={() => { setKind("link"); setIssue(""); }}><Link2 size={15}/> Paste a link</button>
    </div>
    {kind === "file" ? <>
      <label className="dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && !pending) selectFile(event.dataTransfer.files[0]); }}>
        <span className="tile-icon"><UploadCloud size={22}/></span><strong>{file?.name ?? "Choose or drop a file"}</strong><span>PDF or PPTX · Up to 20 MB</span>
        <input aria-label="Choose PDF or PPTX" type="file" accept=".pdf,.pptx" disabled={busy || !!pending} onChange={event => selectFile(event.target.files?.[0])}/>
      </label>
      <label>Material type<select value={tag} disabled={busy || !!pending} onChange={event => setTag(event.target.value as typeof tag)}>
        <option value="notes">Notes</option><option value="lecture">Lecture</option><option value="past_paper">Past paper</option><option value="model_paper">Model paper</option>
      </select></label>
    </> : <label>Web page or YouTube URL<input type="url" placeholder="https://…" value={url} disabled={busy || !!pending} onChange={event => { setIssue(""); setUrl(event.target.value); }} maxLength={4000} required/>
      {youtube && <small>Video timestamps are approximate.</small>}</label>}
    {issue && <p className="feedback negative" role="alert">{issue}</p>}
    <button className="button primary" disabled={busy || (kind === "file" ? !file : !url.trim())}>{busy ? "Processing…" : pending ? "Check extraction" : "Add material"}</button>
  </form>;
}

export function SourceList({ resources, open }: { resources: Resource[]; open: (resource: Resource) => void }) {
  return resources.length ? <div className="source-list">{resources.map(resource => {
    const Icon = resource.type === "youtube" ? Video : resource.type === "web" ? Link2 : FileText;
    return <button key={resource.id} className="source-row" onClick={() => open(resource)}>
      <span className={`source-icon ${resource.type}`}><Icon size={16}/></span>
      <span><strong>{resource.title}</strong><small>{resource.type.toUpperCase()}{resource.type === "youtube" ? " · Approximate timestamps" : ""}{resource.extractionStatus !== "done" ? ` · ${resource.extractionStatus === "pending" ? "Processing" : "Text unavailable"}` : ""}</small></span>
      <ArrowUpRight size={15}/>
    </button>;
  })}</div> : <div className="empty">Add your first study material.</div>;
}
