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
- My TT player identity
- private match journal

Temporary UI state such as the currently selected H2H picker players and PWA-install dismissal remains device-local.

## Storage and security

- Server records live in `user_sync_states`, keyed by the authenticated Supabase user UUID.
- The API validates the bearer access token with Supabase Auth before reading or writing a record.
- Clients cannot supply or choose the server-side user ID.
- Responses use `Cache-Control: private, no-store`.
- Snapshot version 1 accepts only the documented storage keys and is limited to 900 KB.

## API environment

The API requires:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

The VPS deployment workflow populates these values from the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` GitHub secrets.
