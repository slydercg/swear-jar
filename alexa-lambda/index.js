/**
 * Slyder Swear Jar – Alexa Skill Lambda
 * ======================================
 * Alexa-Hosted Node.js (no external npm packages beyond ask-sdk-core).
 * Uses the built-in `https` module to read/write Firebase Realtime Database
 * via the REST API.
 *
 * SETUP INSTRUCTIONS (see README.md for full walkthrough):
 *   1. Paste your Firebase Database URL into FIREBASE_DB_URL below.
 *   2. Deploy to Alexa-Hosted skill (copy/paste this file into index.js).
 *   3. Build the interaction model from interaction-model.json.
 *
 * VOICE COMMANDS:
 *   "Alexa, tell swear jar to charge Delaney"
 *   "Alexa, tell swear jar to charge Grant a dollar"
 *   "Alexa, tell swear jar to add one to Hadley"
 *   "Alexa, ask swear jar to charge Emerson"
 *
 * DYNAMIC KID SYNC:
 *   Kid names are fetched live from Firebase /swearjar/jarSettings on every
 *   invocation, so Settings changes in the app propagate automatically.
 *   Fallback to hardcoded names if Firebase is unreachable.
 */

const Alexa = require('ask-sdk-core');
const https = require('https');

// ─── CONFIG ────────────────────────────────────────────────────────────────
// Replace with your Firebase Realtime Database URL (no trailing slash)
const FIREBASE_DB_URL = 'https://swear-jar-ef967-default-rtdb.firebaseio.com';

// Firebase base path for the swear jar data
const SWEARJAR_PATH = '/swearjar';

// The path in Firebase where game state is stored (matches the PWA)
const STATE_PATH = `${SWEARJAR_PATH}/gameState.json`;

// The path where jar settings (kid names) are stored
const SETTINGS_PATH = `${SWEARJAR_PATH}/jarSettings.json`;

// Amount charged per swear (in dollars) — must match CHARGE_AMOUNT in the PWA
const CHARGE_AMOUNT = 10;

// Fallback kid names — used only if Firebase settings can't be fetched
const FALLBACK_KID_NAMES = {
  delaney: 'Delaney',
  hadley:  'Hadley',
  emerson: 'Emerson',
  grant:   'Grant',
};

// ─── FIREBASE HELPERS ──────────────────────────────────────────────────────

/**
 * Make an HTTPS request and return the parsed JSON body.
 */
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON: ' + data)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Parse the Firebase DB URL into host + base path.
 */
function parseDbUrl(url) {
  // e.g. https://swear-jar-ef967-default-rtdb.firebaseio.com
  const match = url.match(/^https?:\/\/([^/]+)(.*)/);
  return {
    host: match[1],
    basePath: (match[2] || '').replace(/\/$/, ''),
  };
}

/**
 * Fetch kid names dynamically from Firebase /swearjar/jarSettings.
 * Returns a lowercase-key → display-name map.
 * Falls back to FALLBACK_KID_NAMES if Firebase is unreachable.
 */
async function fetchKidNames() {
  const { host, basePath } = parseDbUrl(FIREBASE_DB_URL);
  const path = basePath + SETTINGS_PATH;
  const options = { hostname: host, path, method: 'GET' };
  try {
    const data = await httpsRequest(options);
    if (!data) return FALLBACK_KID_NAMES;
    // jarSettings is stored as an array or Firebase-keyed object
    const settingsArr = Array.isArray(data)
      ? data
      : Object.values(data);
    const result = {};
    settingsArr
      .filter(s => s && s.name && typeof s.name === 'string')
      .forEach(s => {
        result[s.name.trim().toLowerCase()] = s.name.trim();
      });
    return Object.keys(result).length > 0 ? result : FALLBACK_KID_NAMES;
  } catch(e) {
    console.warn('fetchKidNames fell back to defaults:', e.message);
    return FALLBACK_KID_NAMES;
  }
}

/**
 * Read the full game state from Firebase.
 */
async function readState() {
  const { host, basePath } = parseDbUrl(FIREBASE_DB_URL);
  const path = basePath + STATE_PATH;
  const options = { hostname: host, path, method: 'GET' };
  const data = await httpsRequest(options);
  return data || {};
}

/**
 * Write (PATCH) just the kids object and history array back to Firebase.
 * We use PATCH so we only touch the fields we changed.
 */
async function patchState(patch) {
  const { host, basePath } = parseDbUrl(FIREBASE_DB_URL);
  const path = basePath + STATE_PATH;
  const body = JSON.stringify(patch);
  const options = {
    hostname: host,
    path,
    method: 'PATCH',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };
  return httpsRequest(options, patch);
}

/**
 * Convert a Firebase object-of-objects (keyed by push ID) to an array.
 * Firebase stores arrays as objects with numeric/push-ID keys.
 */
function fbToArray(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj);
}

/**
 * Convert an array to a Firebase-friendly object with numeric string keys.
 * We keep it simple: "0", "1", "2", …
 */
function arrayToFb(arr) {
  const obj = {};
  arr.forEach((item, i) => { obj[String(i)] = item; });
  return obj;
}

// ─── CHARGE KID HANDLER ────────────────────────────────────────────────────

const ChargeKidIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope)  === 'ChargeKidIntent'
    );
  },

  async handle(handlerInput) {
    const slots      = handlerInput.requestEnvelope.request.intent.slots;
    const rawName    = (slots.KidName && slots.KidName.value) || '';
    const normalized = rawName.trim().toLowerCase();

    // ── Fetch kid names dynamically from Firebase ──
    const KID_NAMES = await fetchKidNames();
    const kidKey    = KID_NAMES[normalized];

    // ── Validate kid name ──
    if (!kidKey) {
      const validNames = Object.values(KID_NAMES).join(', ');
      const speechText =
        `I didn't recognize the name "${rawName}". ` +
        `You can charge ${validNames}. Who should I charge?`;
      return handlerInput.responseBuilder
        .speak(speechText)
        .reprompt(`Who should I charge? You can say ${validNames}.`)
        .getResponse();
    }

    // ── Read current state from Firebase ──
    let state;
    try {
      state = await readState();
    } catch (err) {
      console.error('Firebase read error:', err);
      return handlerInput.responseBuilder
        .speak('Sorry, I had trouble connecting to the swear jar. Please try again.')
        .getResponse();
    }

    // ── Update kid's balance (use display name as key, matching the PWA) ──
    const kids = state.kids || {};
    if (!kids[kidKey]) {
      kids[kidKey] = { amount: 0, swears: 0 };
    }
    kids[kidKey].amount = (kids[kidKey].amount || 0) + CHARGE_AMOUNT;
    kids[kidKey].swears = (kids[kidKey].swears || 0) + 1;

    // ── Prepend history entry ──
    const history      = fbToArray(state.history);
    const now          = new Date().toISOString();
    const newEntry     = {
      kid:     kidKey,   // use display name (matches PWA format)
      amount:  CHARGE_AMOUNT,
      ts:      now,      // match PWA field name
      addedBy: 'Alexa',
    };
    history.unshift(newEntry);

    // Keep history to last 200 entries so Firebase doesn't grow unbounded
    const trimmedHistory = history.slice(0, 200);

    // ── Write back to Firebase ──
    try {
      await patchState({
        kids,
        history: arrayToFb(trimmedHistory),
      });
    } catch (err) {
      console.error('Firebase write error:', err);
      return handlerInput.responseBuilder
        .speak('Sorry, I recorded the swear but had trouble saving it. Please check the app.')
        .getResponse();
    }

    // ── Build confirmation response ──
    const newTotal  = kids[kidKey].amount;
    const speechText =
      `Got it! I charged ${kidKey} $${CHARGE_AMOUNT}. ` +
      `${kidKey} now owes $${newTotal} this month.`;

    return handlerInput.responseBuilder
      .speak(speechText)
      .getResponse();
  },
};

// ─── LAUNCH HANDLER ────────────────────────────────────────────────────────

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const KID_NAMES  = await fetchKidNames();
    const names      = Object.values(KID_NAMES);
    const firstName  = names[0] || 'someone';
    const lastName   = names[names.length - 1] || 'someone';
    const speechText =
      'Welcome to Slyder Swear Jar! ' +
      `You can say things like "charge ${firstName}" or "add one to ${lastName}". Who should I charge?`;
    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(`Who should I charge? Say a name like ${names.join(', ')}.`)
      .getResponse();
  },
};

// ─── HELP HANDLER ──────────────────────────────────────────────────────────

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope)  === 'AMAZON.HelpIntent'
    );
  },
  async handle(handlerInput) {
    const KID_NAMES  = await fetchKidNames();
    const names      = Object.values(KID_NAMES).join(', ');
    const firstName  = Object.values(KID_NAMES)[0] || 'Delaney';
    const lastNameEx = Object.values(KID_NAMES)[Object.values(KID_NAMES).length-1] || 'Grant';
    const speechText =
      `Say "charge" followed by a name to add $${CHARGE_AMOUNT}. ` +
      `Valid names are: ${names}. ` +
      `For example, say "charge ${firstName}" or "charge ${lastNameEx}".`;
    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Who should I charge?')
      .getResponse();
  },
};

// ─── CANCEL / STOP HANDLER ─────────────────────────────────────────────────

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      (
        Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
        Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent'
      )
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Goodbye!')
      .getResponse();
  },
};

// ─── SESSION ENDED ─────────────────────────────────────────────────────────

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log('Session ended:', JSON.stringify(handlerInput.requestEnvelope));
    return handlerInput.responseBuilder.getResponse();
  },
};

// ─── ERROR HANDLER ─────────────────────────────────────────────────────────

const ErrorHandler = {
  canHandle() { return true; },
  handle(handlerInput, error) {
    console.error('Error handled:', error.message, error.stack);
    return handlerInput.responseBuilder
      .speak('Sorry, something went wrong. Please try again.')
      .reprompt('Please try again.')
      .getResponse();
  },
};

// ─── SKILL BUILDER ─────────────────────────────────────────────────────────

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    ChargeKidIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
