"""Contract check (integration test I1). Run from the repo root:  python contracts/validate.py

1. Every fixture listed in contracts/fixtures.map.json validates against its schema.
2. Every Evidence quote in the fixtures is really on the cited page of fixtures/pages.json.
Needs: pip install jsonschema
"""
import json
import pathlib
import sys

from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ai-service"))
from app.citations import verify_quote  # noqa: E402


def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def validator_for(defs_schema, name):
    wrapper = {"$schema": defs_schema["$schema"], "$defs": defs_schema["$defs"], "$ref": f"#/$defs/{name}"}
    return Draft202012Validator(wrapper)


def walk_evidence(node, found):
    if isinstance(node, dict):
        if {"resourceId", "page", "quote"} <= node.keys():
            found.append(node)
        for v in node.values():
            walk_evidence(v, found)
    elif isinstance(node, list):
        for v in node:
            walk_evidence(v, found)


def main():
    schemas = load("contracts/schemas.json")
    fmap = load("contracts/fixtures.map.json")
    problems = []
    for rel, name in fmap.items():
        errors = sorted(validator_for(schemas, name).iter_errors(load(rel)), key=lambda e: list(e.path))
        for e in errors:
            problems.append(f"{rel} as {name}: {'/'.join(map(str, e.path))}: {e.message}")
    pages = {(p["resourceId"], p["n"]): p["text"] for p in load("fixtures/pages.json")["pages"]}
    paper = load("fixtures/tree.json")  # past-paper page lives in the tree
    for res in paper["subjects"][0]["exams"][0]["modules"][0]["resources"]:
        for p in res.get("pages", []):
            pages.setdefault((res["id"], p["n"]), p["text"])
    for rel in fmap:
        found = []
        walk_evidence(load(rel), found)
        for ev in found:
            if not verify_quote(ev["quote"], pages.get((ev["resourceId"], ev["page"]), "")):
                problems.append(f"{rel}: quote not on {ev['resourceId']} p{ev['page']}: {ev['quote']!r}")
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print(f"contracts ok: {len(fmap)} fixtures valid, all quotes verified")


if __name__ == "__main__":
    main()
