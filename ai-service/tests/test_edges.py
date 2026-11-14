import copy

from app.gemini import FakeGemini


def concept(graph, cid):
    return next(n for n in graph["nodes"] if n["id"] == cid)


def pairs(graph):
    c = lambda i: concept(graph, i)
    return [
        {"a": c("c_chain_rule"), "b": c("c_backpropagation")},
        {"a": c("c_gradient_descent"), "b": c("c_backpropagation")},
        {"a": c("c_activation_functions"), "b": c("c_gradient_descent")},
    ]


def call(client, graph, pages, prs=None):
    return client.post("/v1/edges/type", json={"pairs": pairs(graph) if prs is None else prs, "pages": pages}).json()["edges"]


def test_fixture_edges_match_graph_json_and_no_edge_becomes_null(client, graph, pages):
    edges = call(client, graph, pages)
    assert edges[:2] == graph["edges"]
    assert edges[2] is None  # model said "none"


def test_reversed_pair_with_from_is_b(make_client, graph, pages):
    ev = graph["edges"][0]["evidence"]
    raw = {"edges": [{"pair": 0, "type": "prerequisite", "from_is": "b", "reason": "applies it",
                      "evidence_a": ev["to"], "evidence_b": ev["from"]}]}
    c = make_client(FakeGemini(overrides={"edges_type": raw}))
    swapped = [{"a": concept(graph, "c_backpropagation"), "b": concept(graph, "c_chain_rule")}]
    edge = call(c, graph, pages, swapped)[0]
    assert (edge["from"], edge["to"]) == ("c_chain_rule", "c_backpropagation")
    assert edge["evidence"]["from"] == ev["from"] and edge["evidence"]["to"] == ev["to"]


def test_unknown_type_is_rejected(make_client, graph, pages):
    raw = copy.deepcopy(FakeGemini().generate_json("edges_type", {}))
    raw["edges"][0]["type"] = "applies"
    c = make_client(FakeGemini(overrides={"edges_type": raw}))
    assert call(c, graph, pages)[0] is None


def test_edge_with_one_unverified_quote_becomes_null(make_client, graph, pages):
    raw = copy.deepcopy(FakeGemini().generate_json("edges_type", {}))
    raw["edges"][0]["evidence_b"]["quote"] = "a sentence that is not on the page"
    c = make_client(FakeGemini(overrides={"edges_type": raw}))
    edges = call(c, graph, pages)
    assert edges[0] is None and edges[1] is not None


def test_missing_reason_or_direction_becomes_null(make_client, graph, pages):
    raw = copy.deepcopy(FakeGemini().generate_json("edges_type", {}))
    raw["edges"][0]["reason"] = " "
    del raw["edges"][1]["from_is"]
    c = make_client(FakeGemini(overrides={"edges_type": raw}))
    assert call(c, graph, pages)[:2] == [None, None]


def test_output_has_one_entry_per_pair_in_order(client, graph, pages):
    assert len(call(client, graph, pages)) == 3
    assert call(client, graph, pages, []) == []


def test_all_three_edge_types_are_accepted(make_client, graph, pages):
    for t in ("prerequisite", "extends", "contrasts"):
        raw = copy.deepcopy(FakeGemini().generate_json("edges_type", {}))
        raw["edges"][0]["type"] = t
        c = make_client(FakeGemini(overrides={"edges_type": raw}))
        assert call(c, graph, pages)[0]["type"] == t
