# Security Configuration Guide

## GitHub Branch Protection (Recommended)

Enable branch protection on `main` to prevent unauthorized code changes:

1. Go to **Settings > Branches > Add rule**
2. Branch name pattern: `main`
3. Enable:
   - **Require a pull request before merging**
   - **Require status checks to pass** (select `test (18)` and `test (20)`)
   - **Do not allow bypassing the above settings**
4. Click **Create**

The auto-merge workflow will still work — it waits for CI to pass before merging.

## Firebase Security

### Enable Anonymous Auth
1. Go to **Firebase Console > Authentication > Sign-in method**
2. Enable **Anonymous** provider
3. Click **Save**

### Deploy Security Rules
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only database
```

The rules in `database.rules.json` enforce:
- All reads/writes require authentication (`auth != null`)
- Numeric fields have max value caps (prevents abuse)
- String fields have length limits
- `currentMonth` must be exactly 7 characters (YYYY-MM format)

## Admin PIN

- Default PIN: `037900` (6 digits — change this immediately in the app)
- Hashed with SHA-256 before storage
- 5 failed attempts triggers a 5-minute lockout
- Admin sessions use a cryptographic token (not just a name string)

## State Integrity

- localStorage state is signed with HMAC-SHA256
- Signature is verified on load — tampering is logged
- Firebase is the source of truth; localStorage is a cache

## Reporting Security Issues

If you find a security vulnerability, please report it privately via GitHub's
security advisory feature rather than opening a public issue.
