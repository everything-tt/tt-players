# Croydon Match Card Fetch Note

Checked on `2026-03-28` for:

- `https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/460955`

What "site shell" means here:

- page header and navigation are present
- Croydon site branding is present
- footer/contact block is present
- secure login panel is present
- the actual match-card body is not present in the fetched HTML

Observed from the fetch:

- visible title area shows `Croydon Table Tennis League`
- secure login section is visible near the bottom
- no `CardSummary`
- no `CardResults`
- no `PublicMatchCardTypeA`
- no `PublicMatchCardTypeB`

Short visible excerpt from the fetched output:

> `Croydon Table Tennis League`

> `(Secure Login)`

> `Sorry, your login attempt was unsuccessful`

Interpretation:

- the route resolves
- the public fetch path reaches the Croydon site wrapper
- but the match-card payload itself is not included in the response I received

