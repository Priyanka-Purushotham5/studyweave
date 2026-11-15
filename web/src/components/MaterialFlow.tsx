import { useState } from "react";
import { ReactFlow, type Edge, type Node } from "@xyflow/react";
import { BookOpen, ChevronDown, ChevronRight, FileText, Folder, GraduationCap } from "lucide-react";
import type { Branch } from "../lib/study";
import "@xyflow/react/dist/style.css";

const icons = { subject: BookOpen, exam: GraduationCap, module: Folder, resource: FileText };

/** Hierarchy mind map; the parallel outline remains the keyboard-first view. */
export function MaterialFlow({ branches, collapsed, open, toggle, zoom, setZoom }: {
  branches: Branch[];
  collapsed: ReadonlySet<string>;
  open: (branch: Branch) => void;
  toggle: (id: string) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
}) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const offsets = [0, 0, 0, 0];
  const nodes: Node[] = branches.map(branch => {
    const Icon = icons[branch.kind];
    const Chevron = collapsed.has(branch.id) ? ChevronRight : ChevronDown;
    return {
      id: branch.id,
      position: { x: (branch.depth - 1) * 211 + 30, y: offsets[branch.depth - 1]++ * 76 + 54 },
      className: "material-flow-node",
      ariaRole: "group",
      data: { label: <div className="flow-branch">
        <button onClick={() => open(branch)} aria-label={branch.name}><Icon size={16}/><span>{branch.name}</span></button>
        {branch.children && <button className="icon-button" aria-label={`${collapsed.has(branch.id) ? "Expand" : "Collapse"} ${branch.name}`} aria-expanded={!collapsed.has(branch.id)} onClick={() => toggle(branch.id)}><Chevron size={15}/></button>}
      </div> },
    };
  });
  const edges: Edge[] = branches.flatMap(branch => branch.parent ? [{ id: `${branch.parent}-${branch.id}`, source: branch.parent, target: branch.id, type: "smoothstep" }] : []);
  return <div className="material-flow" aria-label="Material map canvas">
    <ReactFlow nodes={nodes} edges={edges} nodesDraggable={false} nodesConnectable={false} nodesFocusable={false}
      edgesFocusable={false} minZoom={0.6} maxZoom={1.6} viewport={{ ...pan, zoom }}
      onViewportChange={viewport => { setPan({ x: viewport.x, y: viewport.y }); setZoom(viewport.zoom); }} />
  </div>;
}
