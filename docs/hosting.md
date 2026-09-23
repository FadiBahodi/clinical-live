# Distribute or host Clinical Live

## Share the source on GitHub

The clean ZIP produced by `npm run bundle` is the distribution artifact. It contains code, a lockfile, tests and documentation. It excludes Git history, credentials, recordings, encounter data and local QA output.

Create an empty repository in your own GitHub account. Extract the ZIP and upload the contents of its `clinical-live` folder, including `.env.example`, `.gitignore` and `.dockerignore`. Do not upload `node_modules` or a populated `.env`. Alternatively, initialize Git in that clean folder and push it to your chosen empty repository. Recipients clone it, run `npm ci`, then `npm start`, and connect their own providers in Voice & models.

GitHub Pages serves static files. This app also needs a Node server to hold credentials and make provider requests, so Pages alone does not run the live app.

## Run on your own computer

Node.js 22.9+ is sufficient. No build command or database is required. The default `npm start` binds to `127.0.0.1:8840`. Add provider keys in the UI, or copy `.env.example` to `.env` and fill in private settings. Restart after changing the environment. Active UI choices are per-browser server sessions and expire after 8 hours or a server restart. Model choices persist in browser storage; explicitly remembered keys reconnect on page load.

## Local container

With Docker installed, put a private `ACCESS_PASSWORD` of at least 16 characters in `.env`, then:

```sh
docker compose up --build
```

Open `http://127.0.0.1:8840`, enter that access code, and connect your provider in the UI. The compose recipe maps the container only to the local machine. It does not mount a credentials file into the image. It requires no patient data volumes. Docker images intentionally omit the source-download ZIP; distribute the release ZIP from your repository.

## Private HTTPS hosting

Use a container host or a Node host behind a TLS reverse proxy. Configure these environment variables through the host's secret/settings interface:

| Variable | Value |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `PORT` | The port assigned by the host, or `8840` |
| `PUBLIC_ORIGIN` | Exact URL, for example `https://clinical.example.org` |
| `ACCESS_PASSWORD` | A private random access code, at least 16 characters |
| Provider keys | Optional server defaults, or connect per browser in the UI |

Build with the included Dockerfile, or run `npm ci --omit=dev` followed by `npm start`. Preserve the original `Host` header through the reverse proxy and allow requests up to 8 MiB. Use a request timeout of at least 60 seconds. Health endpoint: `GET /healthz`. The app refuses a public bind without an explicit origin; non-local origins must use HTTPS. Microphone access also requires HTTPS or localhost.

The access code gates the workspace. Each browser has a random, HttpOnly, SameSite=Strict cookie (Secure on HTTPS) and separate provider selections/keys in server memory. Entered provider keys are checked and are not returned in API responses. Login attempts are bounded. Server restarts clear sessions. A session lasts 8 hours, including during use: reload/sign in after expiry. Remembered keys reconnect automatically; temporary keys must be re-entered.

This is a small private-workspace deployment, not a public multi-tenant service. People given the access code can consume any server-provided API keys. For distinct billing, let each browser connect its own key and leave server keys unset. Open public signup, organization identity, per-user quotas, auditing, retention policy, institutional approval and clinical validation remain separate work. There is no claim of a certified deployment or clinical readiness.

## What has actually been exercised

HTTP tests cover the access gate, cookies, origin rejection, private per-browser settings and credential non-disclosure. A clean ZIP install is tested separately from the developer folder. Container/runtime hosting requires Docker and a chosen hosting account; see the release notes for the exact checks performed for this version.

## Continuous audio transport

The reverse proxy must forward WebSocket upgrades on `/api/listen` and allow long-lived connections. Use the same HTTPS origin as the app; cross-origin or unauthenticated upgrades are rejected. One stream is allowed per browser session. The server connects outbound to the Google Gemini Live WebSocket endpoint. Provider keys remain server-side. Persistent connections require a long-running Node host; static hosting and request-only serverless functions are insufficient.
