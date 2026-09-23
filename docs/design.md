# Design

The input is conversation. Starting the microphone is the main interaction. The useful output is relevant clinical material that can be scanned together while the conversation continues.

## The sheet

Management occupies the left column. A compact differential sits above history in the center. Physical assessment and one direct answer share the right column. Observations occupy a short strip above the sheet, rather than large cards. No section has a fixed height or a clipped list.

Category labels carry the organization: HPI, ASSOC, PMH, MEDS, ALLERGY, SOCIAL, COLLAT, RISK; pertinent physical systems; RESUS, MED, PROC, LABS, IMG, MON, CONSULT, DISPO and COMM. The model supplies relevant clinical content within those groups. It is not a row of generic labels with empty fields to fill.

The default differential shows names. Its distinguishing cues can be displayed in the same box. Inline labels reclaim the category gutter; aligned labels remain available. Essential content never requires selecting a card.

The answer is for an actual spoken question. A later question replaces it; additional speech can revise the answer. There are no automatically generated question cards competing with it.

## Density and emphasis

Default text is 13 CSS pixels with 1.24 line height and 3-pixel row padding. Dense uses 11.5 / 1.18 / 1.5; Larger uses 15 / 1.4 / 5. The individual controls range beyond these presets. Column spacing, thin dividers and differential cues are separate choices. These are design starting points, not claims about universal reading comfort or eye-tracking performance.

Dark body text carries content. Color accents mark clinical categories and a limited amount of priority. The state symbols also carry text alternatives: unmarked suggested checks, solid dot for reported information, arrow for a request, check for completion/result. Color alone does not carry those distinctions.

Desktop sections stay in fixed columns as the model updates. Category and item elements have stable identities. Unchanged DOM nodes are retained. Existing cues keep their relative positions by explicit ID; new cues append. The application displays every returned correction; it never suppresses a revision using string similarity or a text heuristic. The model controls clinical relevance and item identity, while CSS controls presentation.

## Secondary controls

The transcript, provider setup and display controls are disclosures. The optional transcript text field is for testing or corrections. Display and microphone preferences persist; clinical data does not. Separate provider/model controls are available for speech, assessment, management and direct answers. A small elapsed listening timer can be enabled, without a countdown or automatic layout switch.
