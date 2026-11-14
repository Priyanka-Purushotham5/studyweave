import pathlib

from tests.helpers import make_pdf, make_pptx

FILES = pathlib.Path(__file__).resolve().parents[2] / "fixtures" / "files"


def post(client, name, data, ctype="application/octet-stream"):
    return client.post("/v1/parse", files={"file": (name, data, ctype)})


def test_three_page_pdf_gives_three_pages_with_source_numbers(client):
    r = post(client, "a.pdf", make_pdf(["alpha text", "beta text", "gamma text"]))
    assert r.status_code == 200
    pages = r.json()["pages"]
    assert [p["n"] for p in pages] == [1, 2, 3]
    assert "beta text" in pages[1]["text"]


def test_blank_middle_page_keeps_numbering(client):
    pages = post(client, "a.pdf", make_pdf(["one", "", "three"])).json()["pages"]
    assert [p["n"] for p in pages] == [1, 2, 3] and pages[1]["text"] == ""


def test_two_slide_pptx_gives_text_and_speaker_notes(client):
    data = make_pptx([("Intro", "Gradient descent", "Say it slowly"), ("Next", "Chain rule", "")])
    pages = post(client, "s.pptx", data).json()["pages"]
    assert [p["n"] for p in pages] == [1, 2]
    assert "Gradient descent" in pages[0]["text"] and "Say it slowly" in pages[0]["text"]


def test_image_only_pdf_returns_422_scanned_pdf(client):
    r = post(client, "scan.pdf", make_pdf(["", ""]))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "scanned_pdf" and "scanned" in r.json()["error"]["message"]


def test_unsupported_type_and_empty_and_corrupt_files(client):
    assert post(client, "a.txt", b"hello").json()["error"]["code"] == "bad_request"
    assert post(client, "a.pdf", b"").status_code == 400
    assert post(client, "a.pdf", b"%PDF-1.4 garbage").json()["error"]["code"] == "bad_request"


def test_type_is_sniffed_when_the_filename_lies(client):
    assert post(client, "lecture", make_pdf(["sniffed"])).status_code == 200


def test_shared_fixture_files_behave(client):
    ok = post(client, "sample.pdf", (FILES / "sample.pdf").read_bytes())
    assert ok.status_code == 200 and len(ok.json()["pages"]) == 3
    assert "chain rule" in ok.json()["pages"][1]["text"].lower()
    assert post(client, "scanned.pdf", (FILES / "scanned.pdf").read_bytes()).status_code == 422
    assert len(post(client, "sample.pptx", (FILES / "sample.pptx").read_bytes()).json()["pages"]) == 2
