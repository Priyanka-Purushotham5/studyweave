# StudyNova web workspace

Run the workspace from the repository root with Node 22.

```sh
npm --prefix web ci
VITE_MOCK=1 npm --prefix web run dev
```

The demo loads the checked-in course, questions, revision plan and transcript. Open **Practice quiz**, start the quiz and choose **Product rule**. Select **Show learning gap** to see Chain rule highlighted, then open the Page 2 citation. Open **Lecture captions** to hear the short synthetic demo clip and fix its flagged terms.

For real data, start the seeded API using [its setup instructions](../api/README.md), then run `npm --prefix web run dev`. The Vite proxy forwards `/api` to `http://127.0.0.1:3000`; set `STUDYWEAVE_API_TARGET` to change the proxy target. In production, serve `web/dist` and route `/api` to Module B on the same origin. Alternatively, set `VITE_API_URL` to a Module B origin with CORS configured for the frontend, then rebuild. The frontend uses the shared TypeScript contracts.

## Verification

```sh
npm --prefix web test
VITE_MOCK=1 npm --prefix web run build
cd web
npx playwright install chromium
npm run test:browser
```

For the seeded backend golden path, build without `VITE_MOCK` and set `TEST_API_ORIGIN=http://127.0.0.1:3000` when running the browser tests. The suite exercises the map, outline keyboard navigation, cited trace, revision plan, capture, caption corrections, boss battle and responsive layout. The extension setup is in [extension/README.md](../extension/README.md).

The UI uses Instrument Sans and adapts the sidebar and panel arrangement from [shadcn Dashboard Blocks](https://ui.shadcn.com/blocks/dashboard) and the capture form pattern from [Tremor Blocks](https://blocks.tremor.so/blocks).
