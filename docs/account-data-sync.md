# Account Data Sync

TT Players keeps user data available for guests and offline use through local storage. When a Supabase-authenticated session is available, the same data is synchronised to the TT Players API.

## Conflict rule

The first request after login is an atomic bootstrap:

1. The browser sends its current local snapshot.
2. If the account has no server snapshot, the local snapshot creates it.
3. If a server snapshot already exists, the server snapshot is returned unchanged.
4. The browser applies the returned snapshot. Therefore existing server data always overrides conflicting local data.

After bootstrap, local changes are uploaded as a complete versioned snapshot. Signing out leaves the current local copy available for guest/offline use.

## Synced data

- selected leagues
- league onboarding completion
- favourite players
- favourite teams
- favourite tournaments
- saved H2H comparisons
- light/dark theme
- My TT claimed player identity
- My TT editable profile information
- private tournament entry profiles for the account owner's own, child, coached, or otherwise managed players
- private match journal

The claimed player identity and editable My TT profile use separate storage entries. The identity links an account to one indexed public player; the editable profile stores user-provided playing style, characteristics, equipment, and biography without modifying indexed player or match data.

Tournament entry profiles are also separate from indexed public players. A profile may link to the account owner's claimed player or to a followed player, but its date of birth, contact details, membership number, club, county, and guardian/manager contact are account-private and are never written back to public player records. Following a player does not automatically create a private entry profile.

Temporary UI state such as the currently selected H2H picker players and PWA-install dismissal remains device-local.

## Storage and security

- Server records live in `user_sync_states`, keyed by the authenticated Supabase user UUID.
- The API validates the bearer access token with Supabase Auth before reading or writing a record.
- Clients cannot supply or choose the server-side user ID.
- Responses use `Cache-Control: private, no-store`.
- Snapshot version 1 accepts only the documented storage keys and is limited to 900 KB.
- Tournament entry storage includes the owning Supabase user ID. It is omitted from uploads and removed from the active device when the signed-in account does not match, preventing one account's entrant details from being bootstrapped into another account.
- Tournament entry profiles are excluded from the generic session backup used by the PWA install flow.
- Account-private means the data is not exposed through public player or tournament APIs. The current sync format is not end-to-end encrypted, so especially sensitive medical information, declarations, and payment details must not be stored in tournament entry profiles.

## API environment

The API requires:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

The VPS deployment workflow populates these values from the public repository
Variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. They are
embedded in the frontend bundle and are not treated as confidential
credentials; Supabase service-role keys must never be used here.
