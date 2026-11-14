from app.gemini import FakeGemini


def ask(client, pages, **over):
    return client.post("/v1/answer", json={"question": "What is the chain rule?", "pages": pages, **over})


def test_covered_question_gets_cited_answer(client, pages):
    out = ask(client, pages).json()
    assert out["answer"] and out["citations"][0]["page"] == 2


def test_not_covered_question_is_refused(make_client, pages):
    c = make_client(FakeGemini(overrides={"answer": {"refused": True}}))
    assert ask(c, pages, question="Who won the 1998 World Cup?").json() == {"refused": True, "reason": "not_in_materials"}


def test_answer_with_no_verifiable_citation_becomes_refusal(make_client, pages):
    bad = {"answer": "Confident but ungrounded.", "citations": [{"resourceId": "r1", "page": 2, "quote": "not on the page"}]}
    assert ask(make_client(FakeGemini(overrides={"answer": bad})), pages).json()["refused"] is True
    none = {"answer": "No citations at all.", "citations": []}
    assert ask(make_client(FakeGemini(overrides={"answer": none})), pages).json()["refused"] is True


def test_unverified_citations_are_filtered_but_good_ones_kept(make_client, pages):
    mixed = {"answer": "ok", "citations": [{"resourceId": "r1", "page": 2, "quote": "composite function"},
                                            {"resourceId": "r1", "page": 2, "quote": "invented"}]}
    out = ask(make_client(FakeGemini(overrides={"answer": mixed})), pages).json()
    assert len(out["citations"]) == 1


def test_summary_and_formula_sheet_kinds_return_cited_text(client, pages):
    for kind in ("summary", "formula_sheet"):
        r = client.post("/v1/answer", json={"kind": kind, "pages": pages})
        assert r.status_code == 200 and r.json()["citations"]


def test_request_needs_exactly_one_of_question_or_kind(client, pages):
    assert client.post("/v1/answer", json={"pages": pages}).status_code == 400
    assert client.post("/v1/answer", json={"pages": pages, "question": "q", "kind": "summary"}).status_code == 400
    assert client.post("/v1/answer", json={"pages": pages, "question": "  "}).status_code == 400
    assert client.post("/v1/answer", json={"pages": [], "question": "q"}).status_code == 400
