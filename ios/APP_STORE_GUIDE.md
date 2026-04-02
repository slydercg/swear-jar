# Swear Jar - App Store Submission Guide

## Prerequisites

1. **Apple Developer Account** ($99/year) - https://developer.apple.com/programs/enroll/
2. **Mac with Xcode 15+** installed
3. **App icons**: 1024x1024px PNG (no alpha/transparency)
4. **Screenshots**: At minimum iPhone 6.7" (1290x2796) and iPad 12.9" (2048x2732)

## Step 1: Set Up the Xcode Project

Since the `.xcodeproj` included is a scaffold, the easiest path is to create a fresh project in Xcode:

1. Open Xcode > **File > New > Project**
2. Choose **iOS > App**
3. Settings:
   - Product Name: `SwearJar`
   - Team: Your Apple Developer team
   - Organization Identifier: `com.yourcompany` (e.g., `com.slyder`)
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Storage: **None**
4. Save into the `ios/` directory
5. Copy the Swift files from `ios/SwearJar/SwearJar/` into your new project:
   - `ContentView.swift` (replace the generated one)
   - `SwearJarApp.swift` (replace the generated one)
   - `Info.plist`

## Step 2: Bundle the Web App

1. Run the build script to copy web files:
   ```bash
   cd ios
   ./build-webapp.sh
   ```

2. In Xcode, right-click the `SwearJar` group > **Add Files to "SwearJar"**
3. Select the `WebApp` folder
4. Make sure **"Create folder references"** is selected (blue folder icon)
5. Check "Add to targets: SwearJar"

## Step 3: Configure the Project

### Bundle Identifier
- In Xcode, select the project > **General** tab
- Bundle Identifier: `com.slyder.swearjar` (or your own)
- Display Name: `Swear Jar`
- Version: `2.0.0`
- Build: `1`

### Deployment Target
- Set to **iOS 16.0** minimum

### Device Orientation
- Portrait only (recommended for this app)

### App Icon
- Open **Assets.xcassets > AppIcon**
- Drag your 1024x1024 app icon PNG into the slot
- Xcode 15+ auto-generates all sizes from the single icon

### Privacy Descriptions (Info.plist)
If using notifications, add to Info.plist:
```xml
<key>NSUserNotificationsUsageDescription</key>
<string>Get notified when someone logs a swear for you</string>
```

## Step 4: Test Locally

1. Connect an iPhone or use the Simulator
2. Select your device in the toolbar
3. Press **Cmd+R** to build and run
4. Test all features: login, charge, history, reports, settings
5. Test on multiple screen sizes (iPhone SE, iPhone 15 Pro Max, iPad)

## Step 5: Create App Store Connect Listing

1. Go to https://appstoreconnect.apple.com
2. **My Apps > + New App**
3. Fill in:
   - Platform: iOS
   - Name: `Swear Jar - Family Challenge`
   - Primary Language: English (U.S.)
   - Bundle ID: Select your bundle ID
   - SKU: `swearjar-v2`

### App Information
- **Category**: Lifestyle (Primary), Entertainment (Secondary)
- **Content Rights**: Does not contain third-party content
- **Age Rating**: 4+ (no objectionable content)

### Pricing
- **Price**: Choose your price tier (e.g., $1.99, $2.99, or Free with IAP)
- Or set up In-App Purchases if using a freemium model

### App Description (suggested)
```
Track your family's language with Swear Jar! Set a monthly budget,
divide it equally among participants, and watch their balance go
down with every slip-up. The person who keeps the most money at
month's end wins!

Features:
- Fixed monthly pot divided equally among all participants
- Three severity levels: Mild, Moderate, and Severe
- Real-time sync across all family devices
- Streak tracking with milestone badges
- Beautiful charts and monthly reports
- Export data to CSV
- Admin PIN protection
- Works with Alexa voice commands
- Dark and light mode

Set budgets up to 12 months in advance. If someone goes over
their share, the overflow carries as a penalty to next month -
a real consequence for repeat offenders!
```

### Keywords (100 characters max)
```
swear jar,family,challenge,language,kids,parenting,budget,tracker,gamify,behavior
```

### Screenshots
Take screenshots on Simulator:
1. **Cmd+Shift+4** in Simulator to save to Desktop
2. Required sizes: 6.7" (iPhone 15 Pro Max), 6.5" (iPhone 14 Plus)
3. Take 3-5 screenshots showing: Tracker, Kid Cards, History, Reports, Settings

## Step 6: Archive and Upload

1. In Xcode, set the device to **Any iOS Device (arm64)**
2. **Product > Archive**
3. When the archive completes, the Organizer opens
4. Click **Distribute App**
5. Choose **App Store Connect**
6. Follow the prompts (automatic signing is easiest)
7. Upload!

## Step 7: Submit for Review

1. In App Store Connect, go to your app
2. Select the build you just uploaded
3. Fill in all required fields:
   - Review notes: "Family-friendly app for tracking language challenges. No real money is exchanged - the 'pot' is a gamified point system."
   - Demo account: Provide a test account (if using Firebase auth)
4. Click **Submit for Review**

### Common Review Rejection Reasons and How to Avoid Them

| Reason | Solution |
|--------|----------|
| WKWebView wrapper only | Our app has native integration (SwiftUI chrome, local storage) |
| Missing privacy policy | Add a privacy policy URL to App Store Connect |
| Crashes on launch | Test thoroughly on physical device before submitting |
| "More like a website" | Ensure offline functionality works, mention PWA features |
| IAP issues | If selling, ensure IAP is properly configured |

## Step 8: Privacy Policy

You need a privacy policy URL. Create one that covers:
- Data collected: names, swear counts (no personal financial data)
- Firebase: data synced to Google Firebase for cross-device access
- No data sold to third parties
- Contact information

Host it on GitHub Pages or your website.

## Updating the App

When you make changes to the web app:

1. Make your changes to `index.html`, `css/`, `js/`
2. Run `ios/build-webapp.sh` to copy updated files
3. Bump the version number in Xcode (General > Version)
4. Bump the build number (must be higher than previous)
5. Archive and upload again
6. Submit update in App Store Connect

## Project Structure

```
ios/
├── build-webapp.sh              # Copies web files into Xcode bundle
├── APP_STORE_GUIDE.md           # This file
└── SwearJar/
    ├── SwearJar.xcodeproj/      # Xcode project
    └── SwearJar/
        ├── SwearJarApp.swift    # App entry point
        ├── ContentView.swift    # WKWebView wrapper
        ├── Info.plist           # App configuration
        ├── Assets.xcassets/     # App icons, colors
        └── WebApp/              # Copied web files (from build script)
            ├── index.html
            ├── css/styles.css
            ├── js/app.js
            ├── js/core.js
            └── manifest.json
```

## Customizing for Resale

To white-label this app for other families:

1. **Change the branding**: Update `<title>` in index.html, app name in Info.plist
2. **Change the Firebase project**: Create a new Firebase project, update `BUILT_IN_FB_CONFIG` in app.js
3. **Change bundle ID**: Use a unique identifier per customer (e.g., `com.yourco.swearjar.smith`)
4. **Change default participants**: Update `DEFAULT_KIDS` in app.js
5. **Change app icon**: Replace in Assets.xcassets
6. **Adjust pricing**: Set per-customer pricing in App Store Connect
