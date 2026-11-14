def test_one_768_vector_per_text(client):
    vs = client.post("/v1/embed", json={"texts": ["a", "b", "c"]}).json()["vectors"]
    assert len(vs) == 3 and all(len(v) == 768 for v in vs)


def test_empty_list_gives_empty_list_and_no_gemini_call(client, fake):
    assert client.post("/v1/embed", json={"texts": []}).json() == {"vectors": []}
    assert fake.calls == []


def test_over_100_texts_are_batched(client, fake):
    r = client.post("/v1/embed", json={"texts": [f"t{i}" for i in range(250)]})
    assert len(r.json()["vectors"]) == 250
    assert [n for m, n in fake.calls if m == "embed"] == [100, 100, 50]


def test_order_is_preserved(client):
    a = client.post("/v1/embed", json={"texts": ["x", "y"]}).json()["vectors"]
    b = client.post("/v1/embed", json={"texts": ["y", "x"]}).json()["vectors"]
    assert a[0] == b[1] and a[1] == b[0]
