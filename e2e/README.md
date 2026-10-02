# Browser tests

End-to-end tests with [Playwright](https://playwright.dev) against the
whole app: this frontend, the API from
[drawdb-server](https://github.com/dzungnait/drawdb-server) and Postgres.
They cover accounts, the diagram list, version history, sharing with
people and teams, view/edit links and live editing.

Each run signs up new accounts, so they need no clean database and can run
side by side.

## Running

The stack is `drawdb-server/compose.e2e.yaml`, with both repos checked out
side by side (`drawdb/` and `drawdb-server/`):

```bash
# in drawdb-server: start the app on http://localhost:8088
docker compose -f compose.e2e.yaml up -d --build --wait

# in drawdb: run the tests
npx playwright install chromium   # once; or E2E_CHANNEL=chrome to use Chrome
npm run test:e2e

# in drawdb-server: stop and throw away the data
docker compose -f compose.e2e.yaml down
```

After changing the frontend or the server, rebuild with `up --build` again.

- `E2E_BASE_URL` points the tests at another running stack. It needs
  `RATE_LIMIT=false` (the tests sign up many accounts) and
  `VERSION_INTERVAL_MINUTES=0` (a version per save).
- `npx playwright test e2e/teams.spec.js` runs one file; `--ui` or
  `--headed` to watch.
- A failed test keeps a trace in `test-results/`:
  `npx playwright show-trace test-results/<test>/trace.zip`.
