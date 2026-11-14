# Contracts

`schemas.json` is the single source of truth for every JSON shape that crosses a module boundary.
`types.ts` mirrors it for TypeScript. If they disagree, `schemas.json` wins.

- Reference a shape as `schemas.json#/$defs/<Name>` (Ajv in B: `ajv.addSchema(schemas); ajv.getSchema("https://studyweave.local/contracts/schemas.json#/$defs/Graph")`).
- `fixtures.map.json` says which schema each file in `fixtures/` must satisfy.
- `python contracts/validate.py` checks both that the fixtures match the schemas and that every quote in them is really on the cited page. CI runs it on every pull request.
- A change here is a pull request that the person it affects approves, and the fixtures change in the same pull request.

Conventions: concept id = `c_` + snake_case(name). Edge id = `e_<from>__<to>`. `startIdx` inclusive, `endIdx` exclusive. `readiness: null` means no attempts yet.
Three edge types only: `prerequisite`, `extends`, `contrasts`.
