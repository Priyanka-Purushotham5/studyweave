"""One command that exercises the whole AI service on real material and prints the pitch numbers.

  PowerShell, from ai-service with the venv active:
    $env:GEMINI_API_KEY="..."          # plus GEMINI_MODEL / GEMINI_EMBED_MODEL if the defaults are not on your key
    python -m eval.live_report --slides "C:\\path\\to\\lecture.pptx"
    python -m eval.live_report --dry-run          # no key: uses the fake, checks the script itself

It calls the real endpoints (through FastAPI's test client, so the same code and the same citation checks run),
then prints: concepts kept/dropped, embedding size, typed edges, questions served/dropped per kind, the
double-solve agreement for numerical questions, an answer and a refusal, and the overall citation pass rate.
It writes everything to eval_out/ (live_report.json, graph.json, edge_sheet.csv) for the rating sheet.
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import pathlib
import sys
import time

from fastapi.testclient import TestClient

from app.common import slug
from app.gemini import FakeGemini, GeminiClient, RealGemini, get_gemini
from app.main import app
from eval.citation_rate import citation_rate
from eval.edge_sheet import make_sheet

MODULE_ID = "m_demo"


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


class Caller:
    """POSTs to the app and waits out free-tier rate limits."""

    def __init__(self, client: TestClient, patience: int = 4, wait: float = 20.0):
        self.client, self.patience, self.wait = client, patience, wait
        self.errors: list[str] = []

    def post(self, path: str, body: dict) -> dict | None:
        for attempt in range(self.patience):
            r = self.client.post(path, json=body)
            if r.status_code == 429 and attempt < self.patience - 1:
                time.sleep(self.wait)
                continue
            if r.status_code != 200:
                err = r.json().get("error", {})
                self.errors.append(f"{path}: {r.status_code} {err.get('code')}: {err.get('message')}")
                return None
            return r.json()
        return None


def run_report(gem: GeminiClient, pages: list[dict], out_dir: pathlib.Path, max_concepts: int = 6,
               max_pairs: int = 20, wait: float = 20.0) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    app.dependency_overrides[get_gemini] = lambda: gem
    try:
        call = Caller(TestClient(app, raise_server_exceptions=False), wait=wait)
        rep: dict = {"errors": call.errors}

        # 1. concepts
        ex = call.post("/v1/concepts/extract", {"moduleId": MODULE_ID, "pages": pages}) or {"concepts": [], "dropped": 0}
        concepts = []
        for c in ex["concepts"]:
            concepts.append({"id": f"c_{slug(c['name'])}", "moduleId": MODULE_ID, "name": c["name"],
                             "definition": c["definition"], "evidence": c["evidence"]})
        rep["concepts"] = {"kept": len(concepts), "dropped": ex["dropped"], "sample": [c["name"] for c in concepts[:8]]}

        # 2. glossary
        gl = call.post("/v1/glossary", {"pages": [{"n": p["n"], "text": p["text"]} for p in pages]}) or {"terms": []}
        rep["glossary"] = {"terms": len(gl["terms"]), "sample": [t["term"] for t in gl["terms"][:8]]}

        # 3. embeddings and nearest pairs
        edge_responses, edges = [], []
        if concepts:
            emb = call.post("/v1/embed", {"texts": [f"{c['name']}: {c['definition']}" for c in concepts]})
            vectors = emb["vectors"] if emb else []
            rep["embed"] = {"count": len(vectors), "dimension": len(vectors[0]) if vectors else 0}
            if len(vectors) == len(concepts) and len(concepts) > 1:
                ranked = sorted(itertools.combinations(range(len(concepts)), 2),
                                key=lambda ij: -_cosine(vectors[ij[0]], vectors[ij[1]]))[:max_pairs]
                pairs = [{"a": concepts[i], "b": concepts[j]} for i, j in ranked]
                er = call.post("/v1/edges/type", {"pairs": pairs, "pages": pages})
                if er:
                    edges = [e for e in er["edges"] if e]
                    types: dict[str, int] = {}
                    for e in edges:
                        types[e["type"]] = types.get(e["type"], 0) + 1
                    rep["edges"] = {"pairs_sent": len(pairs), "kept": len(edges), "by_type": types,
                                    "sample": [f"{e['from']} -> {e['to']} ({e['type']}): {e['reason']}" for e in edges[:3]]}
        graph = {"nodes": concepts, "edges": edges}
        (out_dir / "graph.json").write_text(json.dumps(graph, indent=2, ensure_ascii=False), encoding="utf-8")
        if edges:
            make_sheet(graph, str(out_dir / "edge_sheet.csv"))

        # 4. questions per kind on the first few concepts
        q_report: dict = {}
        q_responses = []
        for kind, n in (("mcq", 3), ("conceptual", 2), ("numerical", 2), ("past_paper", 2)):
            served = dropped = refused = level1 = 0
            for c in concepts[:max_concepts]:
                r = call.post("/v1/questions/generate", {"concept": c, "pages": pages, "kind": kind, "n": n})
                if not r:
                    continue
                q_responses.append(r)
                served += len(r["questions"])
                dropped += r["dropped"]
                refused += 1 if r.get("refused") else 0
                level1 += sum(1 for q in r["questions"] if q["difficulty"] == 1)
            q_report[kind] = {"served": served, "dropped": dropped, "refused_concepts": refused, "level1": level1}
        rep["questions"] = q_report
        num = q_report["numerical"]
        rep["double_solve_agreement"] = (num["served"] / (num["served"] + num["dropped"])) if (num["served"] + num["dropped"]) else None

        # 5. answer and refusal
        if concepts:
            inside = call.post("/v1/answer", {"question": f"Explain {concepts[0]['name']}.", "pages": pages})
            rep["answer_in_material"] = {"refused": bool(inside and inside.get("refused")), "has_citations": bool(inside and inside.get("citations"))}
        outside = call.post("/v1/answer", {"question": "Who won the 1998 FIFA World Cup?", "pages": pages})
        rep["answer_out_of_material_refused"] = bool(outside and outside.get("refused"))

        # 6. overall citation pass rate: everything A kept vs everything A dropped for a bad quote
        rep["citation_rate"] = citation_rate([ex] + q_responses)
        rep["model"] = getattr(gem, "last_model", None) or type(gem).__name__
        (out_dir / "live_report.json").write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding="utf-8")
        return rep
    finally:
        app.dependency_overrides.pop(get_gemini, None)


def _print(rep: dict) -> None:
    c, q = rep["concepts"], rep["questions"]
    print(f"Model that answered last: {rep.get('model')}")
    print(f"\nConcepts: kept {c['kept']}, dropped {c['dropped']} (bad quote).  e.g. {', '.join(c['sample'])}")
    print(f"Glossary terms: {rep['glossary']['terms']}  e.g. {', '.join(rep['glossary']['sample'])}")
    if "embed" in rep:
        print(f"Embeddings: {rep['embed']['count']} vectors of {rep['embed']['dimension']} numbers (want 768)")
    if "edges" in rep:
        e = rep["edges"]
        print(f"Edges: {e['kept']} kept of {e['pairs_sent']} pairs, by type {e['by_type']}")
        for s in e["sample"]:
            print("   ", s)
    for kind, v in q.items():
        print(f"Questions {kind:10}: served {v['served']}, dropped {v['dropped']}, concepts refused {v['refused_concepts']}, level-1 {v['level1']}")
    ds = rep["double_solve_agreement"]
    print("Double-solve agreement:", "n/a (no numerical questions)" if ds is None else f"{ds:.0%}")
    print("Answer inside the material refused?", rep.get("answer_in_material", {}).get("refused"), "(want False)")
    print("Question outside the material refused?", rep["answer_out_of_material_refused"], "(want True)")
    cr = rep["citation_rate"]
    rate = "n/a" if cr["pass_rate"] is None else f"{cr['pass_rate']:.1%}"
    print(f"Citation pass rate: {rate}  ({cr['passed']} served, {cr['dropped']} dropped, total {cr['total']})")
    if rep["errors"]:
        print("\nERRORS (send these to Claude):")
        for e in rep["errors"]:
            print("  ", e)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--slides", help=".pptx or .pdf to use (default: the demo pages in fixtures/)")
    ap.add_argument("--out", default="eval_out")
    ap.add_argument("--dry-run", action="store_true", help="use the fake instead of Gemini")
    args = ap.parse_args(argv[1:])

    if args.dry_run:
        gem: GeminiClient = FakeGemini()
    else:
        gem = RealGemini()
        if not gem.api_key:
            print("Set GEMINI_API_KEY first (or use --dry-run).")
            return 2

    if args.slides:
        from eval.wer_gate import slide_pages
        pages = [{"resourceId": "slides", **p} for p in slide_pages(pathlib.Path(args.slides))]
    else:
        fixtures = pathlib.Path(__file__).resolve().parents[2] / "fixtures" / "pages.json"
        pages = json.loads(fixtures.read_text(encoding="utf-8"))["pages"]

    rep = run_report(gem, pages, pathlib.Path(args.out), wait=0 if args.dry_run else 20.0)
    _print(rep)
    print(f"\nFiles written to {args.out}/ (live_report.json, graph.json, edge_sheet.csv)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
