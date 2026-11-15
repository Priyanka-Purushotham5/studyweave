# StudyNova

StudyNova combines a study workspace and browser capture extension with an API and an AI service. The browser talks to the API; only the internal AI service talks to Gemini. The checked-in fake mode needs no external AI key.

## Run locally

Prerequisites: Docker with Compose, Node 22 for the web app/tests, Python 3.11 for standalone AI tests, and Chrome for the extension.

```sh
# Isolated MongoDB, fake AI service, and API. This is not your Atlas database.
docker compose -p studynova-local -f deploy/docker-compose.test.yml up --build -d
# Seed only that isolated local database.
curl -X POST http://127.0.0.1:3000/api/dev/seed
# In another terminal:
npm --prefix web ci
npm --prefix web run dev
```

Open the Vite URL printed by the last command. For a frontend-only fixture demo, use `VITE_MOCK=1 npm --prefix web run dev` instead. See [web setup](web/README.md), [API setup](api/README.md), and [extension setup](extension/README.md). The unpacked extension defaults to the hosted origin; for local testing, choose `http://127.0.0.1:3000` under its API connection setting and leave an API-origin browser tab open. Do not expose that local endpoint publicly.

## Verify

```sh
npm --prefix api ci
npm --prefix api run build
npm --prefix api test
npm --prefix web ci
npm --prefix web test
VITE_MOCK=1 npm --prefix web run build
cd web && npx playwright install chromium && npm run test:browser
```

For Python AI tests, install `ai-service/requirements.txt` in a Python 3.11 environment and run `FAKE_GEMINI=1 pytest -q ai-service`. Real Gemini tests require an explicit opt-in as described in [AI service setup](ai-service/README.md). The [specification audit](docs/SPECIFICATION_AUDIT.md) lists implemented and outstanding requirements.

Production setup and its credential/approval requirements are in [deployment documentation](deploy/TEAM_WORKING_APP.md). Never commit `.env` files or credentials. Existing `studyweave` storage, package and schema identifiers intentionally remain for compatibility.
