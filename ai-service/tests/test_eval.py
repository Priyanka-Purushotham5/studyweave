import csv
import json
import pathlib

from app.gemini import FakeGemini
from eval.citation_rate import citation_rate
from eval.edge_sheet import make_sheet, sample_edges, tally
from eval.wer_gate import run_gate

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_citation_rate_counts_passed_and_dropped_across_responses():
    r = citation_rate([{"questions": [1, 2, 3], "dropped": 1}, {"concepts": [1, 2, 3, 4], "dropped": 2}])
    assert (r["passed"], r["dropped"], r["total"]) == (7, 3, 10) and r["pass_rate"] == 0.7


def test_citation_rate_of_nothing_is_none():
    assert citation_rate([])["pass_rate"] is None


def test_sample_edges_is_deterministic_and_capped_at_30():
    edges = [{"id": f"e{i}"} for i in range(100)]
    a, b = sample_edges(edges), sample_edges(edges)
    assert a == b and len(a) == 30 and len({e["id"] for e in a}) == 30
    assert sample_edges(edges[:5]) == edges[:5]


def test_make_sheet_and_tally_round_trip(tmp_path):
    graph = json.loads((ROOT / "fixtures" / "graph.json").read_text())
    path = tmp_path / "sheet.csv"
    assert make_sheet(graph, str(path)) == 2
    rows = list(csv.DictReader(open(path, newline="", encoding="utf-8")))
    assert rows[0]["from"] == "Chain rule" and rows[0]["to"] == "Backpropagation"
    rows[0].update(rater1="correct", rater2="correct")
    rows[1].update(rater1="partly", rater2="wrong")
    t = tally(rows)
    assert t["ratings"] == {"correct": 2, "partly": 1, "wrong": 1}
    assert t["precision_strict"] == 0.5 and t["precision_lenient"] == 0.75 and t["raters_agree"] == 0.5


def test_tally_ignores_blank_ratings():
    assert tally([{"rater1": "", "rater2": ""}])["precision_strict"] is None


def test_wer_gate_runs_end_to_end_with_the_fake():
    ref = "so back propagation applies the chain rule and then gradient decent updates the weights"
    out = run_gate(FakeGemini(), b"audio", "audio/mpeg", ref, [{"n": 1, "text": "slides"}])
    assert out["wer_without_hints"] == 0.0 and out["glossary_size"] == 4
    assert set(out) >= {"wer_with_hints", "hints_helped", "without_hints_text", "with_hints_text"}


def test_live_report_runs_end_to_end_on_the_fake(tmp_path):
    from eval.live_report import run_report
    pages = json.loads((ROOT / "fixtures" / "pages.json").read_text())["pages"]
    rep = run_report(FakeGemini(), pages, tmp_path, wait=0)
    assert rep["errors"] == []
    assert rep["concepts"]["kept"] == 4 and rep["concepts"]["dropped"] == 1
    assert rep["embed"]["dimension"] == 768
    assert rep["questions"]["mcq"]["served"] > 0 and rep["citation_rate"]["total"] > 0
    assert (tmp_path / "live_report.json").exists() and (tmp_path / "graph.json").exists()
