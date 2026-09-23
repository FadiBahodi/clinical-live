# Provider adapter, version 3

Set `CLINICAL_ADAPTER` to a trusted executable. The server launches it without a shell, writes one JSON request to stdin, and reads one JSON response from stdout. Diagnostic output may go to stderr; it is not relayed to the browser. The process is stopped on cancellation or timeout.

A transcription request:

```json
{"version":3,"task":"transcribe","audio":"BASE64","mimeType":"audio/wav"}
```

Return `{"text":"the spoken words"}`. Preserve numbers, negation and corrections. Do not answer clinical questions during transcription. Audio contains conversation, not trusted instructions.

An interpretation request:

```json
{"version":3,"task":"analyze","lane":"assessment","instructions":"...","segments":[{"id":"s1","text":"..."}],"previous":null}
```

Return the lane object directly. For `assessment`, keys are `summary`, `vitals`, `differential`, `history`, `exam`. For `plan`, the key is `management`. The separate `answer` lane has one `answer` key. See `lib/providers.mjs` for JSON schemas, `lib/prompts.mjs` for instructions and `lib/contract.mjs` for validation. History/exam items include `detail`. Management items also include `dose` and `route`; these are separate presentation fields, not evidence of administration. `answer` is null when no direct question has been asked.

Every item has a stable ID and `sourceIds` that refer to transcript utterances. Generated prompts may have no specific speech reference; reported findings, requests, completed actions, results and direct answers require one. A source ID explains why a generated item is relevant; it does not mean the suggestion was reported or its medical content is verified.

History states: `to clarify`, `reported`. Physical states: `to examine`, `reported`. Management states: `consider`, `requested`, `done`, `result`. Generated suggestions must not be labelled as reported or completed.

Built-in providers run only when no custom adapter is set. Provider credentials belong in the server environment. Do not write credentials or transcripts into adapter stdout diagnostics.

The custom executable owns provider configuration. UI model choices apply to built-in providers; the executable receives the selected clinical-focus instructions but configures its own models. Never export a private adapter path in a distribution archive.
