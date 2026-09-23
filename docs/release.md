# 0.3.1 update

- Adds high/low observation arrows with contextual reasons, restrained category accents, and calmer resuscitation text. Removes the sample medicine’s repeated allergy check; preserves the unknown History cue.
- Adds explicit opt-in browser credential persistence, reconnect on return, Forget/disconnect, saved per-role model choices and one-button Gemini defaults.
- 39 automated tests pass, including storage opt-in/forget, reconnect ordering, failed-key isolation, blocked storage and corrected observation flags.
- Browser inspection at 924 px: full sample, setup controls, clinical-focus persistence across reload, default reset. No actual provider secret was placed in browser storage during this check; credential lifecycle is covered by automated tests, including reconnect after actual HTTP server restart and Forget across another restart.
- Real parallel Gemini calls with the new observation schema: answer 1.34 s, plan 4.32 s, assessment 5.36 s. Fever flagged high; BP 108/64 unflagged. These timings describe one synthetic run, not a latency guarantee.

- The 0.3.1 archive was extracted into a clean directory: dependency installation, all 39 tests and startup without credentials passed.
- Public distribution: https://github.com/FadiBahodi/clinical-live ; versioned source archive accompanies v0.3.1. No hosted clinical service is included.

## Previous 0.3.0 verification

# Release 0.3.0 — verification record

Reviewed 2026-09-22.

## Source and automated checks

- 33 automated tests pass: lane contracts, independent updates, corrections, action states, explicit-ID continuity, changing models during a request, clearing encounters during audio initialization/transcription, retry behavior, model requests, private browser sessions and hosted authentication/origin checks.
- Dependency audit: no reported vulnerabilities in the installed dependency tree at review time.
- Source release scan: no detected private user paths, recognizable provider keys or inherited product branding. A generated ZIP is allowlisted and excludes history, credentials, audio fixtures, local artifacts and dependencies. This scanner is a release check, not proof that arbitrary added content is anonymous.

## Real provider and browser checks

A synthetic respiratory case was sent through the connected Gemini providers, separately from the authored sample. The replay included an incorrect initial BP, an explicit correction, cultures requested then collected, CXR requested then reported, oxygen given without a spoken dose/device, and a new direct question.

- The corrected BP replaced the original value.
- Collected cultures and CXR results updated their existing items.
- Unknown allergy status remained unresolved.
- Oxygen completion did not acquire an invented dose or device in the revised replay.
- The latest direct question replaced the earlier answer.
- A browser text-input journey exercised the actual three independent model requests and rendering. Existing IDs persisted while changed fields updated.
- Account model catalog loaded through the real provider connection.

With Gemini 3.8 Flash at Low thinking, three replay updates measured answer requests at **1.2–1.9 s**, management at **4.2–4.5 s**, and assessment at **6.1–7.8 s**. These are individual request times after transcript input, not complete speech-to-display latency or a performance guarantee. The larger default-thinking comparison was slower in this small sample; no clinical-equivalence claim follows from these timings. A fresh assessment after the final prompt refinement described the presenting features without declaring shock, kept the fever item separate from unspoken symptoms, and left medications and allergies unresolved.

The production VoiceInput + VAD + WAV + Gemini transcription path was exercised with a **22.91-second synthetic audio stream**, without microphone capture. It split the stream and flushed the final phrase on pause. Transcription calls took about **1.6 s** and **1.4 s** and preserved the spoken BP correction. Automated checks additionally verify that the local microphone test never enqueues provider audio.

The actual browser viewport was 924 pixels wide. Sample and generated sheets were visually inspected there, including setup, the corrected case and one complete answer. Responsive CSS is included, but the browser viewport override did not change the actual surface during this pass; narrower breakpoints were not visually certified.

## Distribution

The release ZIP includes the Node app, pinned dependency lockfile, setup guide, Dockerfile, local Compose recipe and private-hosting instructions. A clean extracted ZIP completed `npm ci --omit=dev` and all 33 tests. An unconfigured server served the sample, setup guide and local speech model; Start listening opened the connection dialog without capturing audio. The final package also adds automatic default model selection when the first connected provider fills unconfigured roles, with HTTP coverage. Container execution was not tested because Docker was not available in this environment. No remote host or public GitHub repository was created.

## Limits of these checks

OpenAI request formats and error handling were tested with mocked provider responses; no OpenAI key was available for a live run. Real-room microphone quality, overlapping speakers, long clinical encounters, clinical accuracy and institutional suitability have not been validated. Model output can still overstate an inference or choose an inappropriate recommendation despite valid JSON. Source-aware current-evidence retrieval and image interpretation are not connected.
