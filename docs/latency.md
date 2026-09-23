# Continuous speech and latency

The working loop is: microphone → 100 ms audio frames → streaming recognition → three independent clinical requests → validated changes in stable positions. Capture, recognition and clinical generation overlap. The microphone does not wait for the model.

## Where time goes

| Stage | Implemented behavior | Remaining cost |
|---|---|---|
| Capture | AudioWorklet; browser resamples to 16 kHz; 100 ms PCM frames | Device buffering, permissions and browser scheduling |
| Connection | One persistent authenticated stream; explicit model defaults | Initial provider handshake and network |
| Recognition | Interim text updates while speech continues | Recognition revisions and ambiguity; a partial number is not a complete observation |
| Clinical scheduling | Independent assessment, management and answer; latest complete pending snapshot per section | One in-flight call per section; provider/account rate limits |
| Final recognition | Same source ID replaced; finalized text can supersede a pending draft | The first substantial assessment is allowed to finish so frequent phrases cannot starve it |
| Generation | Complete first section; explicit changes thereafter; Low Gemini thinking default | Context processing and generation remain model-dependent |
| Rendering | Validate reconstructed section; preserve explicit identities and unchanged DOM | Large initial sections and actual content growth |
| Renewal | Finalize old stream, buffer new PCM, connect replacement, forward in order | Brief recognition delay during handoff |

Recognition drafts and sections built from them are visibly marked. No regular expression, similarity score or arbitrary clinical word threshold decides which facts survive. Exact duplicate transcript hypotheses do not trigger another request. The model receives the revised source text, provisional source IDs, changed source IDs and previous section. Partial recognition can still be wrong, and model output can still make unsupported clinical inferences; neither schema validation nor a final transcript establishes correctness.

The full transcript is still supplied. Long-encounter context growth is not solved by delta output. The app does not currently use a separate verified case-memory compactor or provider cache. Streaming can also increase request count because it exposes recognition revisions; bounded concurrency prevents an unlimited job backlog but is not a token budget or rate-limit guarantee.

## Measured checks, 2026-09-23

Browser AudioContext → production AudioWorklet → local WebSocket bridge → real Gemini Transcribe Live → three real Gemini 3.8 Flash lanes, using an 11.46-second synthetic spoken case with a BP correction and a question:

- First provisional transcript: **1.056 s after audio start**. This is not word-level transcription latency.
- First substantive management: **7.818 s after audio start**, while speech continued.
- First substantive assessment: **10.933 s after audio start**, while speech continued. Its request took **5.956 s**. Large initial generation remains a bottleneck.
- Audio ended at **11.481 s**; final recognition arrived at **11.986 s**.
- Final corrected assessment: **13.351 s**, or **1.365 s after final recognition**.
- Final direct answer: **13.544 s**, or **1.558 s after final recognition**.
- Final management: **13.640 s**, or **1.654 s after final recognition**.

The actual app journey separately showed the corrected BP, one complete answer, stable clinical sections, and timing disclosures. Its final recognized-text-to-section times were approximately 1.3 s assessment, 1.3 s management and 2.8 s answer. Variation between runs is real.

A real-provider renewal was forced six seconds into continuous audio: renewal began at 6.210 s, the old final arrived at 6.527 s, and the new connection was ready at 6.733 s. Both portions retained the spoken correction and question. This tests the handoff mechanism, not a full ten-minute or multi-hour encounter.

One paired full-output versus incremental-output provider experiment measured assessment at 7.868 s versus 1.734 s and management at 4.851 s versus 1.424 s. Answer was **slower** in that pair: 1.619 s versus 3.403 s. These are isolated request comparisons, not a controlled benchmark or an accuracy-equivalence finding.

Tests cover PCM continuity, final partial-frame flushing, ordered clip commits, explicit deltas, stale-response rejection, finalization preemption, initial-assessment starvation prevention, stream authentication/origins, renewal buffering, backpressure and capture cancellation. Real room acoustics, overlapping speakers, accents, sustained account quotas and clinical accuracy remain unvalidated.

## Configuration and fallback

New Gemini installs use `gemini-3.5-transcribe-live` for speech and `gemini-3.8-flash` for the three clinical roles. Existing saved choices are preserved; **Use Gemini defaults** switches to the new setup. Models and speech transport remain configurable. OpenAI and custom transcription adapters use the explicit Phrase clips path. No provider fallback occurs silently.

Phrase clips retain local Silero detection, selected pause timing and a default eight-second continuous clip ceiling. Two requests can overlap while commits stay in spoken order. These controls do not govern continuous streaming. Failed clips remain available for Retry; a broken stream stops and identifies the unfinished draft rather than claiming recoverable audio exists.

The provider documents interim/final recognition and a ten-minute session limit in [Gemini Live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe). The bridge renews at nine minutes. Browser and server queues are bounded; a failed renewal or persistent backlog stops listening explicitly.
