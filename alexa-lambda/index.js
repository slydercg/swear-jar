/**
 * Slyder Swear Jar – Alexa Skill Lambda
 * ======================================
 * Alexa-Hosted Node.js (no external npm packages beyond ask-sdk-core).
 * Uses the built-in `https` module to read/write Firebase Realtime Database
 * via the REST API.
 */

const Alexa = require('ask-sdk-core');
const https = require('https');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const FIREBASE_DB_URL = 'https://swear-jar-ef967-default-rtdb.firebaseio.com';
const SWEARJAR_PATH   = '/swearjar';
const STATE_PATH      = SWEARJAR_PATH + '/gameState.json';
const SETTINGS_PATH   = SWEARJAR_PATH + '/jarSettings.json';
const CHARGE_AMOUNT   = 1;

const FALLBACK_KID_NAMES = {
  delaney: 'Delaney',
  hadley:  'Hadley',
  emerson: 'Emerson',
  grant:   'Grant',
};

// ─── FIREBASE HELPERS ──────────────────────────────────────────────────────

function httpsRequest(options, bodyStr) {
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
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function parseDbUrl(url) {
  const match = url.match(/^https?:\/\/([^/]+)(.*)/);
  return { host: match[1], basePath: (match[2] || '').replace(/\/$/, '') };
}

async function fetchKidNames() {
  const { host, basePath } = parseDbUrl(FIREBASE_DB_URL);
  const options = { hostname: host, path: basePath + SETTINGS_PATH, method: 'GET' };
  try {
    const data = await httpsRequest(options);
    if (!data) return FALLBACK_KID_NAMES;
    const arr = Array.isArray(data) ? data : Object.values(data);
    const result = {};
    arr.filter(s => s && s.name).forEach(s => {
      result[s.name.trim().toLowerCase()] = s.name.trim();
    });
    return Object.keys(result).length > 0 ? result : FALLBACK_KID_NAMES;
  } catch(e) {
    console.warn('fetchKidNames fallback:', e.message);
    return FALLBACK_KID_NAMES;
  }
}

async function readState() {
  const { host, basePath } = parseDbUrl(FIREBASE_DB_URL);
  const options = { hostname: host, path: basePath + STATE_PATH, method: 'GET' };
  const data = await httpsRequest(options);
  return data || {};
}

async function patchState(patch) {
  const { host, basePath } = parseDbUrl(FIREBASE_DB_URL);
  const bodyStr = JSON.stringify(patch);
  const options = {
    hostname: host,
    path: basePath + STATE_PATH,
    method: 'PATCH',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    },
  };
  return httpsRequest(options, bodyStr);
}

function fbToArray(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj);
}

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

    const KID_NAMES = await fetchKidNames();
    const kidKey    = KID_NAMES[normalized];

    if (!kidKey) {
      const validNames = Object.values(KID_NAMES).join(', ');
      return handlerInput.responseBuilder
        .speak('I didn\'t recognize "' + rawName + '". You can charge ' + validNames + '. Who should I charge?')
        .reprompt('Who should I charge? You can say ' + validNames + '.')
        .getResponse();
    }

    let state;
    try {
      state = await readState();
    } catch (err) {
      console.error('Firebase read error:', err);
      return handlerInput.responseBuilder
        .speak('Sorry, I had trouble connecting to the swear jar. Please try again.')
        .getResponse();
    }

    const kids = state.kids || {};
    if (!kids[kidKey]) kids[kidKey] = { amount: 0, swears: 0 };
    kids[kidKey].amount = (kids[kidKey].amount || 0) + CHARGE_AMOUNT;
    kids[kidKey].swears = (kids[kidKey].swears || 0) + 1;

    const history  = fbToArray(state.history);
    const now      = new Date().toISOString();
    history.unshift({ kid: kidKey, amount: CHARGE_AMOUNT, ts: now, addedBy: 'Alexa' });
    const trimmed  = history.slice(0, 200);

    try {
      await patchState({ kids, history: arrayToFb(trimmed) });
    } catch (err) {
      console.error('Firebase write error:', err);
      return handlerInput.responseBuilder
        .speak('Sorry, I had trouble saving. Please check the app.')
        .getResponse();
    }

    const newTotal = kids[kidKey].amount;
    const potTotal = Object.values(kids).reduce((sum, k) => sum + (k.amount || 0), 0);
    return handlerInput.responseBuilder
      .speak(kidKey + ' now owes $' + newTotal + '. The pot is up to $' + potTotal + '.')
      .getResponse();
  },
};

// ─── GET BALANCE HANDLER ───────────────────────────────────────────────────

const GetBalanceIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetBalanceIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const rawName = (slots.KidName && slots.KidName.value) || '';
    const normalized = rawName.trim().toLowerCase();

    const KID_NAMES = await fetchKidNames();
    const kidKey = KID_NAMES[normalized];

    if (!kidKey && rawName) {
      const validNames = Object.values(KID_NAMES).join(', ');
      return handlerInput.responseBuilder
        .speak('I didn\'t recognize "' + rawName + '". Valid names are ' + validNames + '. Whose balance do you want?')
        .reprompt('Whose balance do you want to know?')
        .getResponse();
    }

    let state;
    try {
      state = await readState();
    } catch (err) {
      console.error('Firebase read error:', err);
      return handlerInput.responseBuilder
        .speak('Sorry, I had trouble connecting to the swear jar.')
        .getResponse();
    }

    const kids = state.kids || {};

    if (rawName) {
      // Specific person's balance
      const balance = kids[kidKey] ? kids[kidKey].amount : 0;
      return handlerInput.responseBuilder
        .speak(kidKey + ' owes $' + balance + '.')
        .getResponse();
    } else {
      // All balances
      const balances = Object.entries(kids)
        .map(([name, data]) => name + ' owes $' + (data.amount || 0))
        .join(', ');
      const potTotal = Object.values(kids).reduce((sum, k) => sum + (k.amount || 0), 0);
      return handlerInput.responseBuilder
        .speak('The pot is $' + potTotal + '. ' + (balances || 'Everyone owes nothing.'))
        .getResponse();
    }
  },
};

// ─── GET LEADERBOARD HANDLER ───────────────────────────────────────────────

const GetLeaderboardIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetLeaderboardIntent'
    );
  },
  async handle(handlerInput) {
    let state;
    try {
      state = await readState();
    } catch (err) {
      console.error('Firebase read error:', err);
      return handlerInput.responseBuilder
        .speak('Sorry, I had trouble connecting to the swear jar.')
        .getResponse();
    }

    const kids = state.kids || {};
    const sorted = Object.entries(kids)
      .sort((a, b) => (b[1].amount || 0) - (a[1].amount || 0));

    if (sorted.length === 0) {
      return handlerInput.responseBuilder
        .speak('No one is in the jar yet.')
        .getResponse();
    }

    const leaderboard = sorted
      .slice(0, 5)
      .map(([name, data], idx) => (idx + 1) + '. ' + name + ' owes $' + (data.amount || 0))
      .join('. ');

    return handlerInput.responseBuilder
      .speak('Here\'s the leaderboard. ' + leaderboard)
      .getResponse();
  },
};

// ─── GET DAILY SUMMARY HANDLER ────────────────────────────────────────────

const GetDailySummaryIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetDailySummaryIntent'
    );
  },
  async handle(handlerInput) {
    let state;
    try {
      state = await readState();
    } catch (err) {
      console.error('Firebase read error:', err);
      return handlerInput.responseBuilder
        .speak('Sorry, I had trouble connecting to the swear jar.')
        .getResponse();
    }

    const kids = state.kids || {};
    const history = fbToArray(state.history);
    const today = new Date().toISOString().split('T')[0];

    // Count today's swears per kid
    const todayCounts = {};
    history.forEach(entry => {
      if (entry.type === 'deletion' || !entry.ts) return;
      if (entry.ts.startsWith(today)) {
        todayCounts[entry.kid] = (todayCounts[entry.kid] || 0) + 1;
      }
    });

    const totalToday = Object.values(todayCounts).reduce((s, c) => s + c, 0);
    const potTotal = Object.values(kids).reduce((sum, k) => sum + (k.amount || 0), 0);

    // Find who's winning (fewest swears)
    const sorted = Object.entries(kids).sort((a, b) => (a[1].amount || 0) - (b[1].amount || 0));
    const winner = sorted.length > 0 ? sorted[0][0] : 'no one';

    let summary = '';
    if (totalToday === 0) {
      summary = 'Great news! No swears today so far. ';
    } else {
      const details = Object.entries(todayCounts)
        .map(([name, count]) => name + ' had ' + count)
        .join(', ');
      summary = 'Today there ' + (totalToday === 1 ? 'was 1 swear' : 'were ' + totalToday + ' swears') + '. ' + details + '. ';
    }

    summary += 'The pot is at $' + potTotal + '. ';
    summary += winner + ' is currently winning with the fewest swears.';

    return handlerInput.responseBuilder
      .speak(summary)
      .getResponse();
  },
};

// ─── GET STREAK HANDLER ──────────────────────────────────────────────────

const GetStreakIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetStreakIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const rawName = (slots.KidName && slots.KidName.value) || '';
    const normalized = rawName.trim().toLowerCase();

    const KID_NAMES = await fetchKidNames();
    const kidKey = KID_NAMES[normalized];

    if (!kidKey) {
      const validNames = Object.values(KID_NAMES).join(', ');
      return handlerInput.responseBuilder
        .speak('I didn\'t recognize "' + rawName + '". Valid names are ' + validNames + '.')
        .reprompt('Whose streak do you want to check?')
        .getResponse();
    }

    let state;
    try {
      state = await readState();
    } catch (err) {
      return handlerInput.responseBuilder
        .speak('Sorry, I had trouble connecting to the swear jar.')
        .getResponse();
    }

    const history = fbToArray(state.history);
    const today = new Date().toISOString().split('T')[0];

    // Calculate streak
    const swearDays = new Set();
    history.forEach(entry => {
      if (entry.type === 'deletion' || entry.kid !== kidKey || !entry.ts) return;
      swearDays.add(entry.ts.split('T')[0]);
    });

    let streak = 0;
    if (!swearDays.has(today)) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      for (let i = 0; i < 30; i++) {
        const dStr = d.toISOString().split('T')[0];
        if (swearDays.has(dStr)) break;
        streak++;
        d.setDate(d.getDate() - 1);
      }
    }

    const response = streak === 0
      ? kidKey + ' swore today, so their streak is at zero.'
      : kidKey + ' has a ' + streak + '-day clean streak! ' + (streak >= 7 ? 'Impressive!' : 'Keep it up!');

    return handlerInput.responseBuilder
      .speak(response)
      .getResponse();
  },
};

// ─── LAUNCH HANDLER ────────────────────────────────────────────────────────

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const KID_NAMES = await fetchKidNames();
    const names     = Object.values(KID_NAMES);
    return handlerInput.responseBuilder
      .speak('Welcome to Slyder Swear Jar! You can charge someone, ask who\'s winning, get a daily summary, or check streaks. What would you like to do?')
      .reprompt('You can say charge followed by a name, who\'s winning, daily summary, or check streak. Names are ' + names.join(', ') + '.')
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
    const KID_NAMES = await fetchKidNames();
    const names     = Object.values(KID_NAMES).join(', ');
    return handlerInput.responseBuilder
      .speak('You can say: "charge" followed by a name, "who\'s winning", "daily summary", or "check streak for" a name. Valid names are: ' + names + '.')
      .reprompt('What would you like to do?')
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
    return handlerInput.responseBuilder.speak('Goodbye!').getResponse();
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
    console.error('Error:', error.message, error.stack);
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
    GetBalanceIntentHandler,
    GetLeaderboardIntentHandler,
    GetDailySummaryIntentHandler,
    GetStreakIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
