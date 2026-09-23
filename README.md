# Clinical Live

Speak through a clinical case. Keep the differential, relevant history and physical findings, investigations, treatment options and one direct answer together on screen.

Clinical Live is a standalone, voice-first clinical working sheet. It listens, transcribes and updates the visuals. It does not speak back. The compact layout is adjustable; content stays in familiar clinical groups while corrections replace the affected items.

[Download v0.4.0](https://github.com/FadiBahodi/clinical-live/releases/tag/v0.4.0) · [Release verification](docs/release.md)

## Start

Install Node.js **22.9 or newer**, download and extract the source, then run these commands in the extracted folder:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:8840**. The authored sample works without any account. To go live:

1. Open **Voice & models** and connect a Gemini or OpenAI API key.
2. Connecting your first key selects usable defaults for unconnected roles; no model typing is required. You can change the provider and model for speech transcription, assessment, management and direct answers. **Refresh available models** loads the IDs available to your account; a listed model may not support every role.
3. Select your microphone and room/direct mode. Gemini defaults to continuous streaming; Phrase clips remains available as an explicit alternative. **Test microphone** runs locally without sending audio.
4. Press **Start listening**, discuss the case and ask questions naturally.

An optional private `.env` file, copied from `.env.example`, supplies persistent provider defaults. Keys entered through the UI are temporary by default. Select **Remember key on this device** to save that key, unencrypted, in this browser’s local storage. Remembered keys reconnect after reopening the app or restarting its server; model choices are also remembered. **Forget / disconnect** removes the selected provider key from this browser and disconnects the current session. Use remembered keys only on a trusted device. No key is included in the download. API calls and billing use the selected provider account.

## What is on the sheet

- **Management:** concrete options with separate drug names, doses, routes and conditions; requested tests and reported results update in the same place.
- **DDx:** compact names with optional distinguishing cues. The model may change the ranking when the case changes.
- **History and Physical:** pertinent discriminators, unanswered questions, primary survey and focused findings grouped by familiar abbreviations.
- **Answer:** the latest direct clinical question. It updates independently of the larger sections.
- **Observations:** current spoken measurements in a compact strip.

Unmarked items are suggested. A solid dot marks a reported finding; an arrow marks an explicit request; a check and text distinguish done/result. These are model interpretations of speech, not clinical verification. Hover an item to see the supporting transcript entries. The transcript and optional correction field remain accessible without turning the page into a data-entry form.

## Tune the interaction

**Display** offers Compact, Dense and Larger presets plus independent text, line-height, row-gap and column-gap controls. Toggle differential cues, category alignment, dividers, elapsed listening time, and Clinical/Quiet colour. Display and microphone preferences are saved locally; encounters are not.

**Voice & models** selects each provider/model independently. Defaults are Gemini 3.8 Flash for clinical interpretation and Gemini 3.5 Transcribe Live for continuous transcription; if only an OpenAI key is available, interpretation defaults to GPT-4.1 and transcription to GPT-4o Transcribe. When both server keys exist, interpretation defaults to Gemini and transcription to OpenAI. These are editable defaults, not a claim that a particular model is best for every clinical use. Gemini 3 thinking defaults to Low and can be changed to Medium, High or provider default.

**Clinical focus** adjusts instructions for the emergency department, resuscitation or acute medicine. It does not cause a timed layout switch. **New** cancels the encounter and pending work; **Pause** retains the case and finishes the speech already captured. Phrase-clip failures retain audio for Retry. Streaming failures stop capture and flag unfinished speech; they do not silently switch providers or claim that lost audio was recovered.

## How it stays readable

Each model receives the complete transcript, changed source IDs, and its prior displayed section. After the initial response it returns explicit edits; unchanged items remain verbatim. Existing cues retain their relative positions within a clinical group. New cues append; corrections, dose changes, reversals and obsolete items take effect immediately. No string-similarity filter decides whether a clinical correction is allowed through. The renderer retains unchanged DOM nodes.

Microphone audio streams in 100 ms PCM frames over one persistent connection. Recognition drafts can update the board while speech continues. Draft transcript entries and affected sections are marked **Live draft**; they may change. Final recognition replaces the same source entry and preempts unfinished draft analysis. A final transcript is a recognizer result, not proof of what was said or clinical correctness.

The three clinical requests run independently, with at most one active request and one newest pending snapshot per section. Queuing preserves complete case context without accumulating obsolete jobs. Explicit item IDs preserve reading position. The Timing disclosure separates recognized-text-to-section time from the clip fallback's capture/transcription/queue time. It does not pretend provider request time measures mouth-to-screen latency. See [the continuous-speech design and measured limits](docs/latency.md).

## Share or host

The source is MIT licensed. A recipient can clone/download it and run the same two commands above. Build a clean release ZIP with `npm run bundle` (Python 3 is needed only for packaging). It excludes credentials, recordings, local output, dependencies and Git history.

A `Dockerfile`, local `compose.yaml`, access-code login and per-browser server configuration are included. See **[docs/hosting.md](docs/hosting.md)** for GitHub distribution and private HTTPS deployment. GitHub Pages alone cannot run the credential-holding Node server. No remote site or repository is created by starting the app.

## Data and present limits

Continuous mode sends microphone audio to Gemini through the local Node server as you speak, including audio between utterances. The phrase-clip fallback and local microphone test use Silero VAD and ONNX assets served by this app. Audio and transcripts are sent to the selected cloud providers. The app keeps encounters in memory, writes no encounter database or recording files, and has no telemetry or camera access. Cloud retention policies still apply. It does not automatically remove identifiers from input.

This is experimental clinician-facing software. Output has not been clinically validated. It does not retrieve or verify current guidance, interpret images, connect to patient records, order tests or execute treatment. Speech provenance establishes what the model was given; it does not establish medical correctness. The source-reviewed authored sample is documented in [docs/references.md](docs/references.md), separately from live generation.

## Development

```sh
npm test
npm run check:release
npm audit
npm run bundle
```

Tests cover corrections and action states, stable identity, independent requests, model changes, audio cancellation and retry, provider contracts, private sessions, hosted access and origin boundaries. Release checks screen source for private paths, recognizable credentials and legacy branding. They do not replace clinical evaluation or a deployment security review.

See [architecture](docs/architecture.md), [design](docs/design.md), [adapter contract](docs/adapter.md), [product direction](docs/product-direction.md) and [release verification](docs/release.md). Speech detector/runtime dependencies retain their own licenses.
