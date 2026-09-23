# Architecture

1. Browser microphone input feeds Silero VAD v5 through an AudioWorklet and ONNX Runtime. All model, script and WASM assets are served from pinned local dependencies. Room mode disables echo cancellation, noise suppression and automatic gain; direct mode enables them. Acoustic performance still depends on the room and hardware.
2. A selected pause of 300–1200 ms ends a phrase. Short utterances are supported. After 12 seconds, a short quiet gap can finish a long segment; 30 seconds forces a split. Audio is mono 16 kHz WAV. Pausing flushes the final phrase. Local microphone testing uses the same capture machinery without enqueueing audio.
3. `POST /api/transcribe` sends the segment to the selected provider or custom adapter. Transcription is sequential. Failed segments remain in memory for Retry; eight queued segments pause capture. Queue depth and request timing are visible.
4. Each transcript revision schedules three independent requests: `assessment` (summary, observations, differential, history, physical), `plan` (management), and `answer` (latest direct question only). Previous displayed content is supplied to each. While busy, a lane coalesces pending revisions to the newest complete transcript.
5. The provider returns schema-constrained JSON. Server validators check size, shape, state and transcript references before rendering. These checks do not establish semantic correctness. Gemini uses generateContent; OpenAI uses Responses with strict structured output and `store:false` (which does not imply zero provider retention).
6. The browser preserves item order by explicit ID within history, physical and management, retaining unchanged DOM nodes. Differential ranking may change. Changed wording, doses, states and removals apply immediately. There is no fuzzy matching or clinical suppression rule. Model identity stability and reasoning remain evaluation concerns.
7. A new encounter increments generations, aborts requests and clears queued speech. Late responses are ignored. Changing models cancels old analysis, keeps the previous clinical context and reanalyzes with the new choices. The old display remains readable during a failed update.

## Configuration and isolation

`lib/settings.mjs` owns defaults and validation. `lib/prompts.mjs` owns shared continuity, specificity and clinical-role instructions. `lib/providers.mjs` holds schemas and provider adapters. `public/connections.js` manages user choices; `public/presentation.js` owns item placement and structured emphasis.

Provider keys entered through the UI are verified via the provider model catalog, then held in that browser's server session. They are never returned in status. Explicit Remember key opt-in stores an unencrypted copy in browser local storage, outside the download; it reconnects on page load. Forget removes the selected saved key and disconnects its current session. Session cookies are random, HttpOnly and SameSite=Strict; HTTPS sessions are Secure. Sessions expire after eight hours or restart. Environment keys are server defaults copied into each new session; disconnecting affects the current session only.

Local operation accepts loopback hosts and same-origin requests. Hosting requires explicit `PUBLIC_ORIGIN` and an access code. The origin is matched exactly, APIs are gated, and login attempts are bounded. Health checks allocate no session. This is a private workspace, not a public multi-tenant platform; see hosting.md.

## Persistence and limits

Encounter text, audio queues and responses remain in browser/request memory. There are no server encounter logs or database. Display, voice and model preferences use browser local storage. Credentials use it only after explicit opt-in. Encounter content is never included in preferences. Active provider choices and keys also reside in the browser’s server session. Cloud providers still receive submitted content under their terms and account policies; there is no automatic identifier removal.

Transcript limits: 500 utterances / 250,000 characters. Request limit: 8 MiB. Provider calls time out; incomplete/invalid results retain the old section with an error. Inputs are never silently clipped to fit. Generated text is HTML-escaped. Credentials, raw provider errors and subprocess stderr are not returned to the browser.

Vital arrows are model-provided high/low interpretations with a short reason available on hover. They are not a deterministic monitoring alarm, validated severity score, or a guarantee that an unflagged value is normal. Corrections replace the flag together with the value.
