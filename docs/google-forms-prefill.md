# Google Forms tournament entry preparation

TT Players can prepare a public Google Form using one of the account's private tournament entrant profiles.

## Flow

1. Event ingestion discovers the tournament's `entry_url`.
2. The worker recognises a public `forms.gle` or `docs.google.com/forms` responder link.
3. As a post-ingestion enrichment step, the worker downloads only the blank form page and extracts question IDs, labels, types, required flags, and choice options.
4. The blank schema, status, fingerprint, and inspection time are cached in `tournament_sources` with `source_type = entry_form`.
5. On the tournament page, the user selects a saved entrant and reviews which values will be inserted.
6. The app builds a Google pre-filled link in the browser and opens it for the user to review and submit.

TT Players never submits the form.

## No click-time inspection

The browser never asks TT Players to inspect a form when the user clicks Enter. It reads only the cached inspection associated with the tournament.

- A ready cached schema enables the preparation flow.
- A missing or failed cached schema shows that automatic preparation is unavailable and offers the original form.
- A changed `entry_url` is inspected during the next ingestion run.
- Failed inspections are stored and are not retried from the user flow.
- Operators can run `pnpm --filter @tt-players/worker tte:backfill-entry-forms` for a one-off backfill of current tournament entry links.

## Privacy and security

- Inspection happens in the worker and contains only blank form structure.
- Both ingestion and the client strip query parameters and fragments from Google Form links.
- The worker permits only HTTPS links on `forms.gle` and public `docs.google.com/forms` responder paths.
- Redirects are followed manually and rejected if they leave the allowed Google Forms hosts.
- Responses are size-limited.
- Entrant values are never stored in the cached form inspection and are not sent to the TT Players API during preparation.
- Entrant values are added to the pre-filled URL in the browser and reach Google only after the user opens that link.

## Automatically mapped fields

The deterministic mapper recognises common labels for:

- entrant name
- date of birth
- entrant email and phone
- Table Tennis England membership number
- club and county
- parent, guardian, coach, or manager name, email, and phone

Choice questions, event selections, doubles partners, declarations, signatures, medical questions, and unknown labels remain manual.

## Limitations

Google does not expose a stable public API for inspecting arbitrary forms owned by other organisers. The worker reads Google's public responder-page data and must therefore fail safely when that structure changes. The original form remains available.

An LLM-based semantic mapper may be added later for labels that deterministic rules cannot classify. Blank form labels may be sent for classification, but entrant values must not be sent to the model.
