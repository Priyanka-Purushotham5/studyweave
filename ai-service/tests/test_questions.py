import copy

from app.gemini import FakeGemini


def concept(graph, cid="c_chain_rule"):
    return next(n for n in graph["nodes"] if n["id"] == cid)


def req(graph, pages, kind="mcq", n=5, cid="c_chain_rule"):
    return {"concept": concept(graph, cid), "pages": pages, "kind": kind, "n": n}


def post(client, body):
    return client.post("/v1/questions/generate", json=body)


def raw_q(**over):
    q = {"text": "Q?", "options": ["a", "b", "c", "d"], "answer": "A", "difficulty": 1,
         "citations": [{"resourceId": "r1", "page": 2, "quote": "composite function"}]}
    q.update(over)
    return q


def with_raw(make_client, *qs, **extra):
    return make_client(FakeGemini(overrides={"questions_generate": {"questions": list(qs), **extra}}))


def test_unverified_question_is_dropped_and_counted(client, graph, pages):
    out = post(client, req(graph, pages)).json()
    assert out["dropped"] == 1 and len(out["questions"]) == 3
    assert all(q["verified"] is True for q in out["questions"])
    assert "not in the pages" not in " ".join(q["text"] for q in out["questions"])


def test_n_is_respected(client, graph, pages):
    assert len(post(client, req(graph, pages, n=2)).json()["questions"]) == 2


def test_every_citation_is_verified_in_served_questions(client, graph, pages):
    from app.citations import verify_quote
    text = {(p["resourceId"], p["n"]): p["text"] for p in pages}
    for q in post(client, req(graph, pages)).json()["questions"]:
        assert q["citations"] and all(verify_quote(c["quote"], text[(c["resourceId"], c["page"])]) for c in q["citations"])


def test_every_question_has_difficulty_and_one_is_level_one(client, graph, pages):
    qs = post(client, req(graph, pages)).json()["questions"]
    assert all(q["difficulty"] in (1, 2, 3) for q in qs) and any(q["difficulty"] == 1 for q in qs)


def test_invalid_difficulty_options_or_answer_letter_are_dropped(make_client, graph, pages):
    c = with_raw(make_client, raw_q(difficulty=4), raw_q(text="b", options=["a", "b"]), raw_q(text="c", answer="E"), raw_q(text="ok"))
    out = post(c, req(graph, pages)).json()
    assert [q["text"] for q in out["questions"]] == ["ok"] and out["dropped"] == 3


def test_pages_do_not_support_the_concept_gives_refusal_path(make_client, graph, pages):
    c = with_raw(make_client, insufficient=True)
    assert post(c, req(graph, pages)).json() == {"questions": [], "dropped": 0, "refused": True}
    c2 = with_raw(make_client)  # model returned nothing at all
    assert post(c2, req(graph, pages)).json()["refused"] is True


def test_all_questions_unverified_is_not_a_refusal_but_all_dropped(make_client, graph, pages):
    bad = raw_q(citations=[{"resourceId": "r1", "page": 2, "quote": "nonsense"}])
    out = post(with_raw(make_client, bad), req(graph, pages)).json()
    assert out == {"questions": [], "dropped": 1}


def test_conceptual_has_no_options_and_needs_an_answer(make_client, graph, pages):
    c = with_raw(make_client, raw_q(options=["x"], answer="A model answer."), raw_q(text="no answer", answer=""))
    out = post(c, req(graph, pages, kind="conceptual")).json()
    assert len(out["questions"]) == 1 and out["questions"][0]["options"] == [] and out["dropped"] == 1


def test_duplicate_question_text_is_served_once(make_client, graph, pages):
    out = post(with_raw(make_client, raw_q(), raw_q()), req(graph, pages)).json()
    assert len(out["questions"]) == 1


def test_ids_are_stable_across_calls(client, graph, pages):
    a = [q["id"] for q in post(client, req(graph, pages)).json()["questions"]]
    b = [q["id"] for q in post(client, req(graph, pages)).json()["questions"]]
    assert a == b and len(set(a)) == len(a)


# ---- A13 double-solve


def num(**over):
    base = dict(options=[], answer="4.8", solveA="4.8", solveB="4.8", citations=[{"resourceId": "r1", "page": 1, "quote": "The learning rate"}])
    return raw_q(**{**base, **over})


def test_two_agreeing_solves_are_served(make_client, graph, pages):
    out = post(with_raw(make_client, num()), req(graph, pages, kind="numerical", cid="c_gradient_descent")).json()
    assert len(out["questions"]) == 1 and out["questions"][0]["answer"] == "4.8" and out["questions"][0]["options"] == []


def test_disagreeing_solves_are_dropped(make_client, graph, pages):
    out = post(with_raw(make_client, num(solveB="5.2")), req(graph, pages, kind="numerical", cid="c_gradient_descent")).json()
    assert out == {"questions": [], "dropped": 1}


def test_unparseable_solve_is_dropped(make_client, graph, pages):
    out = post(with_raw(make_client, num(solveA="about four")), req(graph, pages, kind="numerical", cid="c_gradient_descent")).json()
    assert out["questions"] == [] and out["dropped"] == 1
