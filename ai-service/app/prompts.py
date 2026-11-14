"""Prompts for every Gemini task. Each states the exact JSON shape the model must return;
that shape is what fixtures/ai_raw/<task>.json shows and what the endpoint code expects.
Evidence quotes must be copied character for character from the page text: the code checks them
and drops anything that is not really on the page."""

_QUOTE_RULE = (
    "Every quote must be copied exactly, character for character, from the page text you are given, "
    "and must be at most 25 words. Never paraphrase inside a quote. If you cannot find a quote, leave the item out."
)

PROMPTS: dict[str, str] = {
    "concepts_extract": (
        "You extract the key concepts a student must learn from study material. "
        "Return JSON: {\"concepts\": [{\"name\": str, \"definition\": str (one sentence), "
        "\"evidence\": [{\"resourceId\": str, \"page\": int, \"quote\": str}]}]}. "
        "Use 5 to 25 concepts, each a noun phrase, no duplicates. " + _QUOTE_RULE
    ),
    "glossary": (
        "List the technical terms in these pages, spelled exactly as written. "
        "Return JSON: {\"terms\": [{\"term\": str, \"definition\": str (short)}]}. Include acronyms and named methods."
    ),
    "edges_type": (
        "For each numbered pair of concepts (a, b) decide whether the source text shows a relationship. "
        "Types: prerequisite (one must be understood before the other), extends (one builds on the other), "
        "contrasts (easily confused). Return JSON: {\"edges\": [{\"pair\": int, \"type\": \"prerequisite\"|\"extends\"|\"contrasts\"|\"none\", "
        "\"from_is\": \"a\"|\"b\" (the prerequisite or the base concept), \"reason\": str (one sentence), "
        "\"evidence_a\": {\"resourceId\": str, \"page\": int, \"quote\": str}, \"evidence_b\": {same}}]}. "
        "Use \"none\" when the text does not support a relationship; do not guess. " + _QUOTE_RULE
    ),
    "questions_generate": (
        "Write study questions about one concept using only the pages given. "
        "Return JSON: {\"questions\": [{\"text\": str, \"options\": [4 strings] for mcq and past_paper, [] otherwise, "
        "\"answer\": \"A\"|\"B\"|\"C\"|\"D\" for mcq and past_paper, a short answer otherwise, "
        "\"difficulty\": 1|2|3 (1 basic recall, 2 standard, 3 application), "
        "\"citations\": [{\"resourceId\": str, \"page\": int, \"quote\": str}], "
        "\"solveA\": str, \"solveB\": str (numerical only: two independent numeric solutions)}]}. "
        "Include at least one difficulty 1 question when the pages allow. "
        "If the pages do not contain enough to ask about the concept, return {\"insufficient\": true, \"questions\": []}. " + _QUOTE_RULE
    ),
    "answer": (
        "Answer the student's question using only the pages given. If the pages do not answer it, "
        "return {\"refused\": true}. Otherwise return {\"answer\": str, \"citations\": [{\"resourceId\": str, \"page\": int, \"quote\": str}]}. "
        "For kind summary or formula_sheet, write that document from the pages with citations. " + _QUOTE_RULE
    ),
    "papers_tag": (
        "These pages are a past exam paper. Split it into its questions and tag each with the concept names it tests, "
        "chosen only from the list given. Return JSON: {\"questions\": [{\"text\": str, \"concepts\": [str]}]}."
    ),
    "video_text": (
        "Transcribe the spoken content of this video into plain text pages of about one minute each. "
        "Return JSON: {\"durationSec\": number, \"pages\": [{\"n\": int, \"text\": str, \"startSec\": number}]}."
    ),
    "suggest_module": (
        "Choose which module a saved web page belongs to. Return JSON: {\"moduleId\": str|null, \"confidence\": number between 0 and 1}. "
        "Use only ids from the list; use null when none fits."
    ),
    "transcribe": (
        "Transcribe this lecture audio verbatim. Use the vocabulary list for the correct spelling of technical terms. "
        "Return JSON: {\"words\": [{\"w\": str, \"startSec\": number, \"endSec\": number}]} with one entry per spoken word, in order."
    ),
}
