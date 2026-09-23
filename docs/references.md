# References and evidence status

The respiratory walkthrough is an original synthetic example for interface and state-transition testing. Its model-independent outputs are authored fixtures. It is not a treatment protocol.

Clinical context reviewed (2026-09-22):

- [NICE NG253: Suspected sepsis in people aged 16 or over](https://www.nice.org.uk/guidance/ng253), including [managing suspected sepsis](https://www.nice.org.uk/guidance/ng253/chapter/managing-suspected-sepsis). UK adult guidance; interpretation and local applicability require clinical judgment. The example emphasizes reassessment, microbiology timing and context-dependent management rather than a universal regimen.

- [UCSF IDMP: Community-acquired pneumonia](https://idmp.ucsf.edu/content/community-acquired-pneumonia-0), [ceftriaxone](https://idmp.ucsf.edu/content/ceftriaxone) and [azithromycin](https://idmp.ucsf.edu/content/azithromycin). These informed the named CAP options in the synthetic sample. UCSF distinguishes ward and ICU regimens; the sample is not a universal antibiotic rule and includes an unresolved allergy dependency.

Implementation references:

- [VAD browser guide](https://docs.vad.ricky0123.com/user-guide/browser/): custom streams, local model/runtime assets and callbacks. Package versions are pinned in the lockfile.
- [OpenAI audio transcription reference](https://developers.openai.com/api/reference/cli/resources/audio/subresources/transcriptions/methods/create): audio upload and transcript response.
- [Gemini generateContent API](https://ai.google.dev/api/generate-content): structured output, audio input and generation configuration.
- [Gemini audio documentation](https://ai.google.dev/gemini-api/docs/audio): speech transcription support.

Live analysis currently uses model knowledge and the transcript. It does not browse these references, retrieve updated evidence, or attach verified citations to its claims. Adding retrieval requires a separate source identity, version, applicability and claim-support contract.

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [model catalog](https://developers.openai.com/api/reference/resources/models/methods/list).
- [Gemini model catalog](https://ai.google.dev/api/models) and [thinking levels](https://ai.google.dev/gemini-api/docs/thinking). Low thinking is an adjustable latency choice, not evidence of clinical equivalence.

- [NHS adult fever](https://www.nhs.uk/symptoms/fever-in-adults/): context for the synthetic adult temperature high flag; this is not a general vital-sign alarm rule.
