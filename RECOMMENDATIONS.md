# Swear Jar App - Recommendations

## Architecture & Code Organization

### 1. Break Up the Monolithic `index.html` (High Priority)
The entire app lives in a single 2,691-line HTML file containing markup, styles, and JavaScript. This makes it hard to maintain, debug, and collaborate on.

**Recommendation:** Split into separate files:
- `index.html` - markup only
- `css/styles.css` - all styles
- `js/app.js` - core app logic
- `js/firebase-sync.js` - Firebase integration
- `js/charts.js` - reporting/chart rendering
- `js/payments.js` - QR code and payment logic

This also enables bundling, tree-shaking, and cache optimization in the future.

### 2. Add a Lightweight Build Step
With no build process, there's no minification, bundling, or environment variable management.

**Recommendation:** Add Vite as a dev/build tool. It requires minimal config, supports hot reload for development, and produces optimized builds for production. This also opens the door for TypeScript migration if desired.

---

## Security

### 3. Move Firebase Config Out of Source Code (High Priority)
The Firebase database URL and config are hardcoded in `index.html`. Anyone with access to the source can read/write to the database.

**Recommendation:**
- Add Firebase Security Rules that restrict read/write access to authenticated users
- Consider adding Firebase Authentication (even anonymous auth) to prevent unauthorized access
- Store sensitive config in environment variables injected at build time

### 4. Strengthen Admin PIN Security
The admin PIN uses SHA-256 hashing, which is good, but the default PIN (0379) is only 4 digits and trivially brute-forceable client-side.

**Recommendation:**
- Require a minimum 6-digit PIN
- Add rate limiting on PIN attempts (e.g., lockout after 5 failed attempts for 5 minutes)
- Consider moving admin validation server-side via Firebase Cloud Functions

---

## Testing & Quality

### 5. Add Automated Tests (High Priority)
There are currently zero automated tests. All testing is manual.

**Recommendation:**
- Add **unit tests** with Vitest or Jest for core logic (charge calculations, monthly winner determination, payment tracking)
- Add **end-to-end tests** with Playwright for critical user flows (adding a charge, viewing history, making payments)
- Even a small test suite covering the core `addCharge()`, `getMonthlyWinner()`, and `calculatePayments()` functions would catch regressions

### 6. Add a Linter and Formatter
No linting or formatting tools are configured, which can lead to inconsistent code style.

**Recommendation:** Add ESLint + Prettier with a simple config. This catches bugs (unused variables, missing error handling) and keeps code consistent.

---

## Features & UX

### 7. Add Streaks and Gamification
The app tracks charges but doesn't reward good behavior. Adding positive reinforcement could make it more engaging.

**Recommendation:**
- Track "clean streaks" (consecutive days without a charge) per person
- Show streak badges or milestones on the tracker tab
- Add a weekly/monthly "cleanest mouth" award alongside the current "loser" tracking

### 8. Add Charge Categories
Currently every charge is a flat $1 for "swearing." Different infractions could have different severity.

**Recommendation:**
- Allow configurable charge categories (e.g., mild = $0.50, moderate = $1.00, severe = $2.00)
- Track which category each charge falls into for richer analytics
- Show category breakdowns in the Reports tab

### 9. Add Data Export
There's no way to export data for external analysis or backup beyond Firebase.

**Recommendation:**
- Add a "Export to CSV" button in the Reports tab
- Include all charge history with dates, people, amounts, and categories
- Useful for family budget tracking or end-of-year summaries

### 10. Improve Offline Experience
The service worker caches the app shell but doesn't handle offline data writes gracefully.

**Recommendation:**
- Queue charges made while offline and sync when connectivity returns
- Show a visible offline indicator in the UI
- Use Firebase's built-in offline persistence (`enablePersistence()`) for seamless offline/online transitions

---

## Performance & Reliability

### 11. Add Error Monitoring
There is no error tracking. If something breaks in production, there's no way to know unless a user reports it.

**Recommendation:** Add a lightweight error tracking solution like Sentry (free tier) or even a simple Firebase Cloud Function that logs client errors. At minimum, add a global `window.onerror` handler that writes to a Firebase `/errors` path.

### 12. Add a CI/CD Pipeline
There's no automated deployment process.

**Recommendation:**
- Add a GitHub Actions workflow that runs linting and tests on every push
- Auto-deploy to Firebase Hosting (or similar) on merge to main
- This prevents broken code from reaching production

---

## Alexa Integration

### 13. Expand Alexa Skill Capabilities
The Alexa Lambda currently supports adding charges but has limited query abilities.

**Recommendation:**
- Add intents for checking totals: "Alexa, who's winning the swear jar?"
- Add intents for checking streaks: "Alexa, how long has Delaney been clean?"
- Add a daily summary intent: "Alexa, give me the swear jar update"

---

## Summary - Prioritized Action Items

| Priority | Recommendation | Effort | Impact |
|----------|---------------|--------|--------|
| 1 | Add Firebase Security Rules | Low | High |
| 2 | Add basic automated tests | Medium | High |
| 3 | Split monolithic index.html | Medium | High |
| 4 | Add ESLint + Prettier | Low | Medium |
| 5 | Add streaks/gamification | Medium | High |
| 6 | Add CI/CD pipeline | Low | Medium |
| 7 | Add error monitoring | Low | Medium |
| 8 | Improve offline experience | Medium | Medium |
| 9 | Add charge categories | Medium | Medium |
| 10 | Add data export | Low | Low |
| 11 | Strengthen admin PIN | Low | Medium |
| 12 | Add build step (Vite) | Medium | Medium |
| 13 | Expand Alexa capabilities | Medium | Low |
