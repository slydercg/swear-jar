# Swear Jar – Alexa Skill Setup

Connect your Alexa to the Swear Jar so you can say:

> **"Alexa, tell swear jar to charge Delaney"**

---

## What you'll need

- An Amazon Developer account (free) at [developer.amazon.com](https://developer.amazon.com)
- Your Alexa device linked to the same Amazon account
- About 10 minutes

---

## Step-by-Step Setup

### 1 — Create the Alexa Skill

1. Go to [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask) and sign in.
2. Click **Create Skill**.
3. Fill in:
   - **Skill name**: `Swear Jar`
   - **Primary locale**: English (US)
   - **Model**: Custom
   - **Hosting**: Alexa-hosted (Node.js)
4. Click **Create skill**.
5. Choose **Start from scratch** template → **Continue with template**.

---

### 2 — Set the Invocation Name

1. In the left sidebar, click **Invocations → Skill Invocation Name**.
2. Set it to: `swear jar`
3. Click **Save Model**.

---

### 3 — Upload the Interaction Model

1. In the left sidebar, click **JSON Editor** (under Interaction Model).
2. Delete all existing content.
3. Copy and paste the entire contents of **`interaction-model.json`** from this folder.
4. Click **Save Model**, then **Build Model** (wait ~30 seconds for the build to finish).

---

### 4 — Add the Lambda Code

1. Click the **Code** tab at the top of the page.
2. Click on `index.js` in the file tree (left side).
3. Delete all existing content.
4. Copy and paste the entire contents of **`index.js`** from this folder.
5. **Important**: Find this line near the top and update it with your Firebase URL:
   ```js
   const FIREBASE_DB_URL = 'https://swear-jar-ef967-default-rtdb.firebaseio.com';
   ```
   *(It's already pre-filled with the correct URL — just double-check it matches what's in your Firebase console.)*
6. Click **Save** (top right), then **Deploy** (next to Save).

---

### 5 — Copy your Skill ID into the App

1. Click the **Build** tab at the top.
2. In the left sidebar, click **Invocations → Skill Invocation Name**.
3. Look at the browser URL — it contains your Skill ID:
   ```
   https://developer.amazon.com/alexa/console/ask/build/custom/amzn1.ask.skill.XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX/...
   ```
4. Copy the `amzn1.ask.skill.XXXX...` portion.
5. Open the **Swear Jar** app on your phone/browser.
6. Go to **Settings** (bottom bar) and log in as **admin**.
7. Scroll to **Alexa Integration** and paste your Skill ID.
8. Tap **Save Settings**.

---

### 6 — Test It

Say to your Alexa device:

| What you say | What happens |
|---|---|
| "Alexa, tell swear jar to charge Delaney" | Delaney +$1 |
| "Alexa, tell swear jar to charge Grant a dollar" | Grant +$1 |
| "Alexa, ask swear jar to add one to Hadley" | Hadley +$1 |
| "Alexa, tell swear jar to charge Emerson" | Emerson +$1 |

The app will update in real time — you'll see the entry appear in Recent Activity with **addedBy: Alexa**.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Alexa says "I couldn't find a skill named swear jar" | Make sure the skill is **Enabled** in your Alexa app (Alexa App → More → Skills & Games → Your Skills) |
| Skill responds but nothing appears in the app | Check that `FIREBASE_DB_URL` in index.js matches your Firebase project |
| Alexa doesn't recognize the kid's name | Re-build the interaction model; add nicknames as synonyms in interaction-model.json |
| "I had trouble saving" error | Your Firebase rules may have expired — check Firebase Console → Realtime Database → Rules |

---

## File Reference

| File | Purpose |
|---|---|
| `index.js` | The Lambda function (paste into Alexa Console → Code tab) |
| `interaction-model.json` | Alexa skill model (paste into Alexa Console → JSON Editor) |
| `README.md` | This guide |
