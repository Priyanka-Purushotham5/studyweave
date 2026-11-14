import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDownRight, ArrowUpRight, BookOpen, ChevronDown, ChevronRight, FileText, Folder, GraduationCap, ListTree, Maximize2, Minus, Network, Plus } from "lucide-react";
import type { Concept, Edge, Graph, Trace, Tree } from "../../../contracts/types";
import { colorFor, treeToNodes, type Branch } from "../lib/study";

const branchIcon = { subject: BookOpen, exam: GraduationCap, module: Folder, resource: FileText };
const edgeLabels = { prerequisite: "Prerequisite", extends: "Builds on", contrasts: "Contrasts with" };

export function Readiness({ value, cleared }: { value?: number | null; cleared?: boolean }) {
  const state = colorFor(value, cleared);
  return <span className={`state ${state.key}`}><span aria-hidden="true">{state.icon}</span> {state.label}</span>;
}

function Outline({ branches, collapsed, toggle, open }: {
  branches: Branch[]; collapsed: Set<string>; toggle: (id: string) => void; open: (branch: Branch) => void;
}) {
  const [focused, setFocused] = useState("");
  const active = branches.some(branch => branch.id === focused) ? focused : branches[0]?.id;
  function handleKey(event: KeyboardEvent<HTMLButtonElement>, branch: Branch, index: number) {
    let next: Branch | undefined;
    switch (event.key) {
      case "ArrowDown": next = branches[index + 1]; break;
      case "ArrowUp": next = branches[index - 1]; break;
      case "Home": next = branches[0]; break;
      case "End": next = branches.at(-1); break;
      case "ArrowLeft":
        if (branch.children && !collapsed.has(branch.id)) toggle(branch.id);
        else next = branches.find(item => item.id === branch.parent);
        break;
      case "ArrowRight":
        if (branch.children && collapsed.has(branch.id)) toggle(branch.id);
        else if (branches[index + 1]?.parent === branch.id) next = branches[index + 1];
        break;
      default: return;
    }
    event.preventDefault();
    if (next) document.getElementById(`outline-${next.id}`)?.focus();
  }
  return <div className="outline" role="tree" aria-label="Course outline">
    {branches.map((branch, index) => {
      const Icon = branchIcon[branch.kind];
      const Chevron = collapsed.has(branch.id) ? ChevronRight : ChevronDown;
      return <button key={branch.id} id={`outline-${branch.id}`} type="button"
        role="treeitem" aria-level={branch.depth} aria-expanded={branch.children ? !collapsed.has(branch.id) : undefined}
        tabIndex={active === branch.id ? 0 : -1} onFocus={() => setFocused(branch.id)}
        style={{ marginInlineStart: (branch.depth - 1) * 22 }}
        onKeyDown={event => handleKey(event, branch, index)} onClick={() => open(branch)}>
        {branch.children ? <Chevron size={14}/> : <span className="outline-indent"/>} <Icon size={16}/> {branch.name}
      </button>;
    })}
  </div>;
}

export function StudyMap({ tree, graph, moduleId, trace, cleared, onModule, onResource, onConcept, onEdge }: {
  tree: Tree; graph: Graph; moduleId: string; trace: Trace | null; cleared: boolean;
  onModule: (id: string) => void; onResource: (resource: Branch["resource"]) => void;
  onConcept: (concept: Concept) => void; onEdge: (edge: Edge) => void;
}) {
  const [view, setView] = useState<"concepts" | "map" | "outline">("concepts");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState(0);
  const mapFrame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = mapFrame.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setViewport(entry.contentRect.width));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [view]);
  const { nodes: branches, edges: links } = treeToNodes(tree, collapsed);
  const nodes = graph.nodes.filter(node => node.moduleId === moduleId || trace?.path.includes(node.id));
  const edges = graph.edges.filter(edge => nodes.some(node => node.id === edge.from) && nodes.some(node => node.id === edge.to));
  const neighbors = view === "concepts" ? edges : links;
  const toggle = (id: string) => setCollapsed(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  function open(branch: Branch) {
    if (branch.kind === "resource") onResource(branch.resource);
    else if (branch.kind === "module") onModule(branch.id);
    else if (branch.children) toggle(branch.id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const compact = view === "concepts" && viewport > 0 && viewport < 540;
  if (view === "concepts") {
    const columns = Math.min(compact ? 2 : 3, Math.max(1, nodes.length - 1));
    const target = nodes.find(node => edges.some(edge => edge.to === node.id));
    const ordered = [...nodes.filter(node => node !== target), ...(target ? [target] : [])];
    ordered.forEach((node, index) => {
      const wide = ordered.length <= 4 && node === target && ordered.length > 1;
      const step = compact ? 198 : 216;
      const startX = compact ? 16 : 34;
      const startY = compact ? 21 : 69;
      const rowHeight = compact ? 103 : 154;
      const row = wide ? Math.ceil(index / columns) : Math.floor(index / columns);
      positions.set(node.id, {
        x: startX + (wide ? (columns - 1) / 2 : index % columns) * step,
        y: startY + row * rowHeight + (wide && !compact ? 21 : 0),
      });
    });
  } else {
    const offsets = [0, 0, 0, 0];
    for (const branch of branches) {
      positions.set(branch.id, { x: (branch.depth - 1) * 211 + 30, y: offsets[branch.depth - 1]++ * 76 + 54 });
    }
  }
  const width = Math.max(compact ? 0 : 690, ...Array.from(positions.values(), p => p.x + (compact ? 196 : 216)));
  const height = Math.max(344, ...Array.from(positions.values(), p => p.y + 100));
  const scale = zoom * (viewport > 0 ? Math.max(0.62, Math.min(1, viewport / width)) : 1);
  const traced = (id: string) => trace?.path.includes(id) ?? false;
  const views = [{ id: "concepts", name: "Concept web", Icon: Network }, { id: "map", name: "Material map", Icon: Folder }, { id: "outline", name: "Outline", Icon: ListTree }] as const;

  return <section className="panel study-map" aria-labelledby="map-title">
    <div className="panel-head">
      <div className="panel-title"><span className="tile-icon"><Network size={17}/></span><div><h2 id="map-title">Study map</h2><p>{view === "concepts" ? "Explore how your concepts connect." : "Browse your subjects, exams and materials."}</p></div></div>
      <div className="segmented" aria-label="Map view">
        {views.map(({ id, name, Icon }) => <button key={id} type="button" aria-pressed={view === id} onClick={() => { setView(id); setZoom(1); }}><Icon size={15}/> {name}</button>)}
      </div>
    </div>
    {trace && view !== "concepts" && <button className="trace-return" onClick={() => setView("concepts")}>Show learning gap on concept web <ArrowDownRight size={15}/></button>}
    {view === "outline" ? <Outline branches={branches} collapsed={collapsed} toggle={toggle} open={branch => {
      if (branch.kind === "module") onModule(branch.id);
      else open(branch);
    }}/> : <div className="map-frame" ref={mapFrame}>
      {view === "concepts" && !nodes.length ? <div className="empty map-empty">Add materials and build this module’s concept web.</div> :
        <div className="map-scroll" tabIndex={0} aria-label={view === "concepts" ? "Concept web canvas" : "Material map canvas"}>
          <div className="map-fit" style={{ width: width * scale, height: height * scale }}>
            <div className="map-inner" style={{ width, height, transform: `scale(${scale})` }}>
              <svg className="map-links" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
                <defs><marker id="link-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="context-stroke" strokeWidth="1.5"/></marker></defs>
                {neighbors.map(link => {
                  const from = positions.get(link.from)!;
                  const to = positions.get(link.to)!;
                  const highlighted = view === "concepts" && trace?.path.some((id, i) => id === link.to && trace.path[i + 1] === link.from);
                  const vertical = view === "concepts";
                  const x1 = from.x + (vertical ? 90 : 177), x2 = to.x + (vertical ? 90 : 0);
                  const reverse = vertical && from.y >= to.y;
                  const y1 = from.y + (vertical ? (reverse ? 0 : 77) : 25), y2 = to.y + (vertical && reverse ? 77 : vertical ? 0 : 25);
                  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
                  const path = vertical ? `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}` : `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
                  return <path key={`${link.from}-${link.to}`} d={path} data-type={"type" in link ? link.type : undefined} className={highlighted ? "trace-edge" : ""} markerEnd="url(#link-arrow)"/>;
                })}
              </svg>
              {view === "concepts" ? nodes.map(node => {
                const position = positions.get(node.id)!;
                const state = colorFor(node.readiness, cleared && node.moduleId === moduleId);
                return <button key={node.id} className={`map-node concept-node ${state.key} ${traced(node.id) ? "trace-node" : ""}`}
                  data-concept-id={node.id} onClick={() => onConcept(node)} style={{ left: position.x, top: position.y }}>
                  <span className="node-name">{node.name}<ArrowUpRight size={13}/></span>
                  <span className="node-caption"><Readiness value={node.readiness} cleared={cleared && node.moduleId === moduleId}/>{node.readiness == null ? "—" : `${node.readiness}%`}</span>
                </button>;
              }) : branches.map(branch => {
                const position = positions.get(branch.id)!;
                const Icon = branchIcon[branch.kind];
                const Chevron = collapsed.has(branch.id) ? ChevronRight : ChevronDown;
                return <div className="map-node branch-node" key={branch.id} style={{ left: position.x, top: position.y }}>
                  <button onClick={() => open(branch)} aria-label={branch.name}><Icon size={16}/><span>{branch.name}</span></button>
                  {branch.children && <button className="icon-button" aria-label={`${collapsed.has(branch.id) ? "Expand" : "Collapse"} ${branch.name}`} aria-expanded={!collapsed.has(branch.id)} onClick={() => toggle(branch.id)}><Chevron size={15}/></button>}
                </div>;
              })}
              {view === "concepts" && edges.map((edge, index) => {
                const from = positions.get(edge.from)!, to = positions.get(edge.to)!;
                const offset = index > 0 ? Math.min(index, 3) * 12 : -10;
                return <button key={edge.id} className="edge-button" style={{ left: (from.x + to.x) / 2 + (compact ? 136 : 90), top: (from.y + to.y) / 2 + 37 + offset }}
                  aria-label={`${graph.nodes.find(n => n.id === edge.from)?.name} to ${graph.nodes.find(n => n.id === edge.to)?.name}: ${edgeLabels[edge.type]}`}
                  onClick={() => onEdge(edge)}>{edgeLabels[edge.type]}</button>;
              })}
            </div>
          </div>
        </div>}
      <div className="zoom" aria-label="Map zoom">
        <button aria-label="Zoom out" disabled={zoom <= 0.6} onClick={() => setZoom(Math.max(0.6, zoom - 0.2))}><Minus size={16}/></button>
        <button aria-label="Reset zoom" onClick={() => setZoom(1)}><Maximize2 size={14}/></button>
        <button aria-label="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom(Math.min(1.6, zoom + 0.2))}><Plus size={16}/></button>
      </div>
    </div>}
    {view === "concepts" && <div className="map-legend" aria-label="Readiness legend">
      <Readiness value={null}/><Readiness value={20}/><Readiness value={50}/><Readiness value={80}/>{cleared && <Readiness cleared/>}
    </div>}
  </section>;
}
