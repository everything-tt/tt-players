# Google Forms tournament entry preparation

TT Players can prepare a public Google Form using one of the account's private tournament entrant profiles.

## Flow

1. Event ingestion discovers the tournament's `entry_url`.
2. The worker recognises a public `forms.gle` or `docs.google.com/forms` responder link.
3. As a post-ingestion enrichment step, the worker downloads only the blank form page and extracts question IDs, labels, types, required flags, choice options, Google-managed responder fields such as `emailAddress`, and up to 40,000 characters of visible public form text.
4. When semantic analysis is configured, the worker sends only that blank schema, visible public text, and existing public event context to DeepSeek V4 Flash. The model proposes profile-field mappings and evidence-backed event details.
5. The structural schema, semantic analysis, status, fingerprint, and inspection time are cached in `tournament_sources` with `source_type = entry_form`.
6. High-confidence event details fill only missing competition columns; source-scraped values are never overwritten.
7. On the tournament page, the user selects a saved entrant and reviews which values will be inserted.
8. The app builds a Google pre-filled link in the browser and opens it for the user to review and submit.

TT Players never submits the form.

## No click-time inspection

The browser never asks TT Players to inspect a form when the user clicks Enter. It reads only the cached inspection associated with the tournament.

- A ready cached schema enables the preparation flow.
- A missing or failed cached schema shows that automatic preparation is unavailable and offers the original form.
- A changed `entry_url` is inspected during the next ingestion run.
- A changed inspection schema, semantic prompt, or model identifier causes a new one-time analysis.
- The scheduled event scrape may check active tournament rows on every run, but it returns `unchanged` before downloading the form or calling DeepSeek when the normalized URL, inspection version, and semantic-analysis key match.
- Failed inspections and semantic analyses are cached as completed attempts and are not repeatedly retried by the user flow.
- Operators can run `pnpm --filter @tt-players/worker tte:backfill-entry-forms` or the manual GitHub Actions backfill workflow. The backfill uses the same cache guard and skips completed matching analyses unless code explicitly opts into force mode.

Changing from another model to `deepseek-v4-flash` changes the semantic-analysis key, so each existing form is analysed once with the new model and then skipped on later scheduled scrapes and backfills.

## DeepSeek configuration

The production worker uses DeepSeek's OpenAI-compatible Chat Completions API in non-thinking mode.

```dotenv
DEEPSEEK_API_KEY=your-secret-key
ENTRY_FORM_LLM_BASE_URL=https://api.deepseek.com
ENTRY_FORM_LLM_MODEL=deepseek-v4-flash
ENTRY_FORM_LLM_TIMEOUT_MS=30000
```

- `DEEPSEEK_API_KEY` enables semantic analysis and is supplied from the GitHub Actions secret with the same name.
- `ENTRY_FORM_LLM_BASE_URL` defaults to `https://api.deepseek.com` whenever `DEEPSEEK_API_KEY` is present.
- `ENTRY_FORM_LLM_MODEL` defaults to `deepseek-v4-flash`.
- `ENTRY_FORM_LLM_TIMEOUT_MS` is bounded between 5 and 120 seconds.
- `ENTRY_FORM_LLM_API_KEY` remains available as a compatibility fallback for another OpenAI-compatible endpoint, but `DEEPSEEK_API_KEY` takes priority.

The production deploy workflow and the manual tournament-entry-form backfill workflow securely write these values to `/etc/ttp/worker.env`. Scheduled worker jobs and backfill jobs both load that environment file.

The cache key includes the semantic prompt version and model identifier. Changing either causes unchanged forms to be analysed once again during ingestion or backfill.

## Privacy and security

- Structural inspection happens in the worker and contains only the public blank form.
- Semantic analysis receives visible public form text, blank labels, descriptions, choices, and existing public tournament metadata only.
- Saved entrant names, dates of birth, addresses, contact details, and membership numbers are never sent to the model.
- Form text is treated as untrusted input; instructions embedded in public text, labels, descriptions, or choices are explicitly ignored.
- Model output is restricted to allowlisted profile and event fields and validated with Zod.
- Invented field IDs are discarded.
- Every event-detail evidence excerpt must occur in the referenced question text or in the captured public form text; fabricated evidence is discarded.
- Medical, disability, safeguarding, consent, declaration, signature, payment, card, bank-account, sort-code, and BACS content is blocked again in code even if the model proposes it.
- Both ingestion and the client strip query parameters and fragments from Google Form links.
- The worker permits only HTTPS links on `forms.gle` and public `docs.google.com/forms` responder paths.
- Redirects are followed manually and rejected if they leave the allowed Google Forms hosts.
- Responses and captured public text are size-limited.
- Entrant values are never stored in the cached form inspection and are not sent to the TT Players API during preparation.
- Entrant values are added to the pre-filled URL in the browser and reach Google only after the user opens that link.

## Automatically mapped fields

The deterministic mapper recognises common labels for:

- entrant name
- date of birth
- entrant email and phone
- Table Tennis England membership number
- club and county
- full address and national association
- relationship to player and declaration date
- parent, guardian, coach, or manager name, email, and phone

The semantic mapper can improve ambiguous labels using whole-form context. A semantic mapping is used automatically only at confidence `0.85` or above, and only when the deterministic mapping is absent or is a generic name, email, or phone interpretation. Clear deterministic mappings remain authoritative.

Choice questions are filled only when a saved value exactly matches one of the form options. Event selections, doubles partners, declarations, signatures, medical questions, and unknown labels remain manual.

## Event enrichment

The semantic result can extract these public event fields with evidence:

- display name and description
- start date, end date, and entry deadline
- venue name, address, town, and postcode
- organiser name
- category

Values are written to the competition only when confidence is at least `0.90`, the evidence can be verified against the blank form, the value passes format validation, and the existing column is empty. The full value, confidence, evidence excerpt, and supporting form field IDs remain in the cached inspection for auditability.

## Limitations

Google does not expose a stable public API for inspecting arbitrary forms owned by other organisers. The worker reads Google's public responder-page data and must therefore fail safely when that structure changes. The original form remains available.

Semantic analysis improves classification but is not trusted as a source of truth. Users still review every prepared value before opening and submitting the Google Form.
