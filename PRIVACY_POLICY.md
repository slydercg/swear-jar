# Privacy Policy — Swear Jar App

**Last updated:** May 1, 2026

## Overview

Swear Jar ("the App") is a family challenge app that tracks language habits using a monthly budget system. This policy describes how we collect, use, and protect your information.

## Information We Collect

### Data You Provide
- **Names**: Participant names and app user names (first names only)
- **Charge records**: When a charge is logged (timestamp, amount, severity, who recorded it)
- **Monthly results**: Winner, budget, and per-person statistics
- **Payment info** (optional): Venmo handles, PayPal usernames, Zelle phone/email for peer payment convenience
- **Avatar photos** (optional): Profile pictures, compressed and stored as small thumbnails

### Data Collected Automatically
- **Device identifiers**: Anonymous Firebase authentication IDs (no personal identity)
- **App usage**: Theme preference, notification settings

## How We Store Data

- **Firebase Realtime Database**: Charge history, settings, and monthly results are synced via Google Firebase for cross-device access
- **Local storage**: App state is cached on your device for offline access
- **No external servers**: We do not operate any servers beyond Google Firebase

## Data We Do NOT Collect

- Email addresses
- Phone numbers (unless voluntarily entered as payment info)
- Location data
- Browsing history
- Contacts
- Advertising identifiers

## Children's Privacy (COPPA)

This App is designed for family use. Children under 13 may use the App under parental supervision. We do not knowingly collect personal information from children beyond first names entered by a parent or guardian. Parents can delete all child data at any time via Settings > Delete My Data.

## Data Sharing

We do **not** sell, trade, or share your data with any third parties. Your data is only accessible to:
- Members of your family who have access to the App
- Google Firebase (data processor) under their [privacy policy](https://firebase.google.com/support/privacy)

## Your Rights

### Access & Export
You can export all your data as a CSV file from the Reports tab at any time.

### Deletion
You can delete all your data from Settings > Delete My Data. This removes:
- All charge history
- All monthly results
- All participant data
- All payment information
- All avatar images

Data is permanently deleted from both your device and Firebase.

### Portability
CSV export provides all historical data in a standard format.

## Security

- All data in transit is encrypted via HTTPS/TLS
- Firebase security rules require authentication for all reads and writes
- Admin access is protected by a PIN with rate limiting and lockout
- Payment information is obfuscated before storage
- State integrity is verified via HMAC signatures

## Data Retention

Data is retained until you delete it. If you uninstall the App:
- Local data is removed automatically
- Firebase data persists until manually deleted via the App or by contacting us

## Changes to This Policy

We may update this policy periodically. Changes will be posted within the App and on our website.

## Contact

For privacy concerns or data deletion requests, contact:
- Email: privacy@swearjarapp.com
- GitHub: https://github.com/slydercg/swear-jar/issues

## Jurisdiction

This App is operated from the United States. By using the App, you consent to data processing in the United States.
