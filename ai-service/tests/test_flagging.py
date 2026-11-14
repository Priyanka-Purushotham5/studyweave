import pytest

from app.flagging import flag


def words(text: str) -> list[dict]:
    return [{"w": w, "startSec": i * 0.5, "endSec": i * 0.5 + 0.4} for i, w in enumerate(text.split())]


GLOSSARY = ["backpropagation", "gradient descent", "chain rule", "ReLU", "softmax"]


def test_split_term_is_flagged_with_the_glossary_spelling():
    flags, fixed = flag(words("we apply back propagation here"), GLOSSARY)
    assert fixed == []
    assert len(flags) == 1
    f = flags[0]
    assert (f["startIdx"], f["endIdx"]) == (2, 4)
    assert f["heard"] == "back propagation"
    assert f["suggestion"] == "backpropagation"
    assert f["score"] >= 85
    assert f["id"] == "f1"


def test_exact_glossary_term_is_not_flagged():
    flags, fixed = flag(words("we use gradient descent and the chain rule"), GLOSSARY)
    assert flags == [] and fixed == []


def test_exact_term_protects_neighbouring_words_from_fuzzy_flag():
    # "the gradient descent" is a fuzzy near-match of "gradient descent" but the exact span wins.
    flags, _ = flag(words("the gradient descent step"), GLOSSARY)
    assert flags == []


def test_misheard_single_word_is_flagged():
    flags, _ = flag(words("then the softmaxx layer"), GLOSSARY)
    assert [f["suggestion"] for f in flags] == ["softmax"]


def test_windows_under_four_characters_are_skipped():
    # "rel" scores 86 against "relu" but is only 3 characters, so it must be skipped.
    flags, _ = flag(words("so rel is"), ["ReLU"])
    assert flags == []


def test_unrelated_words_are_not_flagged():
    flags, _ = flag(words("today we will talk about homework deadlines"), GLOSSARY)
    assert flags == []


def test_overlapping_candidates_keep_only_the_best():
    flags, _ = flag(words("back propagation propagation"), ["backpropagation"])
    spans = [(f["startIdx"], f["endIdx"]) for f in flags]
    for i, a in enumerate(spans):
        for b in spans[i + 1 :]:
            assert a[1] <= b[0] or b[1] <= a[0]
    assert len(flags) >= 1


@pytest.mark.parametrize(
    "text",
    [
        "back propagation and gradient decent and chain roll",
        "softmaxx relu back propagation propagation",
        "",
        "single",
    ],
)
def test_flags_never_overlap_and_indexes_stay_inside_words(text):
    w = words(text)
    flags, fixed = flag(w, GLOSSARY)
    spans = sorted([(f["startIdx"], f["endIdx"]) for f in flags] + [(x["startIdx"], x["endIdx"]) for x in fixed])
    for s, e in spans:
        assert 0 <= s < e <= len(w)
    for (_, e1), (s2, _) in zip(spans, spans[1:]):
        assert e1 <= s2


def test_correction_seen_twice_is_auto_fixed_and_not_flagged():
    corrections = [{"heard": "back prop", "correct": "backpropagation", "count": 2}]
    flags, fixed = flag(words("we use back prop today"), GLOSSARY, corrections)
    assert fixed == [{"startIdx": 2, "endIdx": 4, "to": "backpropagation"}]
    assert flags == []


def test_correction_seen_once_is_not_auto_fixed():
    corrections = [{"heard": "back prop", "correct": "backpropagation", "count": 1}]
    _, fixed = flag(words("we use back prop today"), GLOSSARY, corrections)
    assert fixed == []


def test_threshold_is_adjustable():
    w = words("then the softmaxx layer")
    assert flag(w, GLOSSARY, threshold=99)[0] == []
    assert len(flag(w, GLOSSARY, threshold=80)[0]) == 1


def test_flag_ids_follow_transcript_order():
    flags, _ = flag(words("back propagation then softmaxx"), GLOSSARY)
    assert [f["id"] for f in flags] == ["f1", "f2"]
    assert flags[0]["startIdx"] < flags[1]["startIdx"]
