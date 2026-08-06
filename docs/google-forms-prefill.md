# Google Forms prefill trial

TT Players can prepare a public Google Form using one of the account's private tournament entrant profiles.

## Flow

1. The signed-in user chooses a saved entrant.
2. The user pastes a public `forms.gle` or `docs.google.com/forms` link.
3. The API downloads only the blank Google Form page and extracts question IDs, labels, types, required flags, and choice options.
4. The mobile app maps common tournament labels to the selected entrant profile.
5. The user reviews which values will be inserted and which questions remain manual.
6. The app builds a Google pre-filled link in the browser and opens it for the user to review and submit.

TT Players never submits the form.

## Privacy and security

- Form inspection requires an authenticated TT Players account.
- The form URL is sent in a JSON request body rather than the request URL, reducing accidental logging of any query parameters.
- Both client and server strip query parameters and fragments before inspection.
- The server permits only HTTPS links on `forms.gle` and public `docs.google.com/forms` responder paths.
- Redirects are followed manually and rejected if they leave the allowed Google Forms hosts.
- Responses are size-limited and returned with `Cache-Control: private, no-store`.
- Entrant values are not sent to the TT Players form-inspection endpoint. They are added to the pre-filled URL in the browser and reach Google only after the user opens that link.

## Automatically mapped fields

The initial deterministic mapper recognises common labels for:

- entrant name
- date of birth
- entrant email and phone
- Table Tennis England membership number
- club and county
- parent, guardian, coach, or manager name, email, and phone

Choice questions, event selections, doubles partners, declarations, signatures, medical questions, and unknown labels remain manual.

## Limitations

Google does not expose a stable public API for inspecting arbitrary forms owned by other organisers. The inspector reads Google's public responder-page data and must therefore fail safely when that structure changes. The original form is always available as a fallback.

An LLM-based semantic mapper may be added later for labels that deterministic rules cannot classify. Blank form labels may be sent for classification, but entrant values must not be sent to the model.
