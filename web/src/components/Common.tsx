import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, TriangleAlert, X } from "lucide-react";
import type { Evidence, Resource } from "../../../contracts/types";
import { ApiError } from "../api/client";
import { timestamp } from "../lib/study";

export function ErrorBanner({ error, retry, dismiss }: { error: unknown; retry?: () => void; dismiss: () => void }) {
  const canRetry = !(error instanceof ApiError) || ["ai_unavailable", "offline", "rate_limited", "internal"].includes(error.code);
  return <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error instanceof Error ? error.message : "Something went wrong."}</span>
    {canRetry && retry && <button className="button compact" onClick={retry}>Retry</button>}
    <button className="icon-button" aria-label="Dismiss error" onClick={dismiss}><X size={17}/></button>
  </div>;
}

export function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);
  return <dialog className="dialog" ref={dialog} aria-labelledby={titleId} onClose={close}>
    <div className="dialog-head"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={20}/></button></div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}

export function Citation({ evidence, resources, open }: {
  evidence: Evidence; resources: Resource[]; open: (evidence: Evidence) => void;
}) {
  const resource = resources.find(item => item.id === evidence.resourceId);
  return <button className="citation" onClick={() => open(evidence)}>
    <BookOpen size={15}/><span>{resource?.title ?? "Source"} · Page {evidence.page}{evidence.startSec != null ? ` · ~${timestamp(evidence.startSec)}` : ""}</span><ArrowUpRight size={15}/>
  </button>;
}
