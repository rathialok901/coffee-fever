/**
 * Coffee Fever — Alexa Skill
 * Alexa-hosted Node.js Lambda
 *
 * Environment variables (set in Alexa Developer Console → Code → Environment Variables):
 *   GITHUB_PAT  — GitHub personal access token with contents:write permission
 *
 * Conversation flow:
 *   Launch / "log a brew"
 *   → Which coffee? (reads in-stock coffees from coffees.json)
 *   → Which brewer?
 *   → Rate it 1–5
 *   → Flavour notes? (or skip)
 *   → Any extra notes? (or skip)
 *   → Confirm → writes to journal.json via GitHub Contents API
 */

const Alexa = require('ask-sdk-core');
const https = require('https');

// ---- CONFIG ----
const GITHUB_OWNER  = 'rathialok901';
const GITHUB_REPO   = 'coffee-fever';
const GITHUB_BRANCH = 'main';

const BREWERS = [
  'V60',
  'French Press',
  'Clever Dripper',
  'Moka Pot',
  'South Indian Filter',
  'Espresso'
];

// ---- GITHUB HELPERS ----

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchPublicJSON(filename) {
  const resp = await httpsRequest({
    hostname: 'raw.githubusercontent.com',
    path: `/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${filename}`,
    method: 'GET',
    headers: { 'User-Agent': 'CoffeeFeverAlexa/1.0' }
  });
  if (resp.status !== 200) throw new Error(`Failed to fetch ${filename}: HTTP ${resp.status}`);
  return Array.isArray(resp.body) ? resp.body : [];
}

async function writeDataFile(filename, updatedArray, commitMessage) {
  const pat = process.env.GITHUB_PAT;
  if (!pat) throw new Error('GITHUB_PAT environment variable not set');

  const headers = {
    'Authorization': `token ${pat}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'CoffeeFeverAlexa/1.0',
    'Content-Type': 'application/json'
  };

  // Step 1: GET the current file to obtain its SHA
  const getResp = await httpsRequest({
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
    method: 'GET',
    headers
  });
  if (getResp.status !== 200) throw new Error(`Could not read ${filename} from GitHub (${getResp.status})`);
  const sha = getResp.body.sha;

  // Step 2: PUT the updated file
  const content = Buffer.from(JSON.stringify(updatedArray, null, 2)).toString('base64');
  const putBody  = JSON.stringify({ message: commitMessage, content, sha, branch: GITHUB_BRANCH });

  const putResp = await httpsRequest({
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`,
    method: 'PUT',
    headers: { ...headers, 'Content-Length': Buffer.byteLength(putBody) }
  }, putBody);

  if (putResp.status !== 200 && putResp.status !== 201) {
    const msg = putResp.body?.message || `HTTP ${putResp.status}`;
    if (putResp.status === 409) throw new Error('Conflict saving entry — wait a moment and try again.');
    throw new Error(`Failed to save: ${msg}`);
  }
}

// ---- UTILITIES ----

function generateId() {
  return `entry-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

// Loose string match: try exact → contains → shared words
function fuzzyMatch(input, items) {
  if (!input || !items.length) return null;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const inp  = norm(input);

  let match = items.find(i => norm(i.name) === inp);
  if (match) return match;

  match = items.find(i => norm(i.name).includes(inp) || inp.includes(norm(i.name)));
  if (match) return match;

  const words = inp.split(/\s+/).filter(w => w.length > 2);
  match = items.find(i => words.some(w => norm(i.name).includes(w)));
  return match || null;
}

// Read whichever slot has a value
function getInput(slots) {
  return (slots.userInput?.value || slots.brewer?.value || slots.rating?.value || '').trim();
}

function buildConfirmSpeech(entry) {
  const tags   = entry.tasteTags?.length ? ` Flavour notes: ${entry.tasteTags.join(', ')}.` : '';
  const extra  = entry.notes ? ` Notes: ${entry.notes}.` : '';
  return `Ready to log: ${entry.beanName} on ${entry.brewMethod}, rated ${entry.overallRating} out of 5.${tags}${extra} Shall I save it?`;
}

// ---- SESSION STATE MACHINE ----
// States: AWAITING_COFFEE → AWAITING_BREWER → AWAITING_RATING
//         → AWAITING_FLAVOUR → AWAITING_EXTRA → AWAITING_CONFIRM

// ---- HANDLERS ----

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    return startLoggingFlow(handlerInput);
  }
};

const LogBrewIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogBrewIntent';
  },
  async handle(handlerInput) {
    return startLoggingFlow(handlerInput);
  }
};

async function startLoggingFlow(handlerInput) {
  const { attributesManager, responseBuilder } = handlerInput;

  let coffees = [];
  let roasters = [];
  try {
    [coffees, roasters] = await Promise.all([
      fetchPublicJSON('coffees.json'),
      fetchPublicJSON('roasters.json')
    ]);
  } catch (e) {
    console.error('Fetch error:', e);
  }

  const inStock = coffees.filter(c => c.status === 'current' || c.status === 'opened');

  if (inStock.length === 0) {
    return responseBuilder
      .speak("Welcome to Coffee Fever. I couldn't find any coffees in stock. Add one via the website first, then come back to log a brew.")
      .withShouldEndSession(true)
      .getResponse();
  }

  const attrs = attributesManager.getSessionAttributes();
  attrs.coffees  = inStock;
  attrs.roasters = roasters;
  attrs.state    = 'AWAITING_COFFEE';
  attrs.entry    = {};
  attributesManager.setSessionAttributes(attrs);

  const list = inStock.map(c => c.name).join(', ');
  const intro = inStock.length === 1
    ? `Welcome to Coffee Fever! I have one coffee in stock: ${inStock[0].name}.`
    : `Welcome to Coffee Fever! I found ${inStock.length} coffees in stock: ${list}.`;

  return responseBuilder
    .speak(`${intro} Which one did you use today? Say "I used" followed by the name.`)
    .reprompt('Say "I used" followed by the coffee name.')
    .getResponse();
}

// Main multi-turn handler — handles all user responses based on session state
const ConversationHandler = {
  canHandle(handlerInput) {
    const type  = Alexa.getRequestType(handlerInput.requestEnvelope);
    const state = handlerInput.attributesManager.getSessionAttributes().state;
    return type === 'IntentRequest' && !!state;
  },
  async handle(handlerInput) {
    const { attributesManager, responseBuilder } = handlerInput;
    const attrs   = attributesManager.getSessionAttributes();
    const { state, coffees = [], roasters = [], entry = {} } = attrs;
    const intent  = Alexa.getIntentName(handlerInput.requestEnvelope);
    const slots   = handlerInput.requestEnvelope.request.intent?.slots || {};
    const input   = getInput(slots);
    const isSkip  = intent === 'SkipIntent' || intent === 'AMAZON.NoIntent';

    // ── AWAITING_COFFEE ──────────────────────────────────────────────
    if (state === 'AWAITING_COFFEE') {
      const match = fuzzyMatch(input, coffees);
      if (!match) {
        const list = coffees.map(c => c.name).join(', ');
        return responseBuilder
          .speak(`Sorry, I didn't catch that. Your coffees in stock are: ${list}. Say "I used" followed by the name.`)
          .reprompt('Say "I used" followed by the coffee name.')
          .getResponse();
      }

      const roaster = roasters.find(r => r.id === match.roasterId);
      attrs.entry = {
        coffeeId:    match.id,
        beanName:    match.name,
        roasterId:   match.roasterId || null,
        roasterName: roaster?.name || match.roasterName || '',
        origin:      match.origin || '',
        roastLevel:  match.roastLevel || '',
        date:        new Date().toISOString().split('T')[0]
      };
      attrs.state = 'AWAITING_BREWER';
      attributesManager.setSessionAttributes(attrs);

      const brewerList = BREWERS.join(', ');
      return responseBuilder
        .speak(`Got it, ${match.name}. Which brewer did you use? ${brewerList}.`)
        .reprompt('Which brewer? Say V60, French Press, Clever Dripper, Moka Pot, South Indian Filter, or Espresso.')
        .getResponse();
    }

    // ── AWAITING_BREWER ──────────────────────────────────────────────
    if (state === 'AWAITING_BREWER') {
      const brewerItems = BREWERS.map(b => ({ name: b }));
      const match = fuzzyMatch(input, brewerItems);
      if (!match) {
        return responseBuilder
          .speak(`I didn't recognise that brewer. Choose from: ${BREWERS.join(', ')}.`)
          .reprompt('Which brewer did you use?')
          .getResponse();
      }

      attrs.entry.brewMethod = match.name;
      attrs.state = 'AWAITING_RATING';
      attributesManager.setSessionAttributes(attrs);

      return responseBuilder
        .speak(`${match.name}. On a scale of 1 to 5, how was the brew?`)
        .reprompt('Give it a rating from 1 to 5.')
        .getResponse();
    }

    // ── AWAITING_RATING ──────────────────────────────────────────────
    if (state === 'AWAITING_RATING') {
      const num = parseFloat(input);
      if (isNaN(num) || num < 1 || num > 5) {
        return responseBuilder
          .speak("Please give a rating between 1 and 5.")
          .reprompt('How would you rate it — 1 being poor, 5 being excellent?')
          .getResponse();
      }

      attrs.entry.overallRating = Math.round(num * 2) / 2; // allow halves
      attrs.state = 'AWAITING_FLAVOUR';
      attributesManager.setSessionAttributes(attrs);

      return responseBuilder
        .speak(`${num} out of 5. Any flavour notes? Say "I taste" followed by your notes, for example "I taste chocolate and cardamom". Or say skip.`)
        .reprompt('Say "I taste" followed by your notes, or say skip.')
        .getResponse();
    }

    // ── AWAITING_FLAVOUR ─────────────────────────────────────────────
    if (state === 'AWAITING_FLAVOUR') {
      if (!isSkip && input) {
        attrs.entry.tasteTags = input
          .split(/,|\band\b/i)
          .map(t => t.trim())
          .filter(Boolean)
          .map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
      } else {
        attrs.entry.tasteTags = [];
      }

      attrs.state = 'AWAITING_EXTRA';
      attributesManager.setSessionAttributes(attrs);

      return responseBuilder
        .speak('Any extra notes? Say "add note" followed by your note, for example "add note slightly over-extracted". Or say skip.')
        .reprompt('Say "add note" followed by your note, or say skip.')
        .getResponse();
    }

    // ── AWAITING_EXTRA ───────────────────────────────────────────────
    if (state === 'AWAITING_EXTRA') {
      attrs.entry.notes = (!isSkip && input) ? input : '';
      attrs.state = 'AWAITING_CONFIRM';
      attributesManager.setSessionAttributes(attrs);

      return responseBuilder
        .speak(buildConfirmSpeech(attrs.entry) + ' Say yes to save, or no to cancel.')
        .reprompt('Say yes to save, or no to cancel.')
        .getResponse();
    }

    // ── AWAITING_CONFIRM ─────────────────────────────────────────────
    if (state === 'AWAITING_CONFIRM') {
      if (intent === 'AMAZON.YesIntent') {
        try {
          const journal = await fetchPublicJSON('journal.json');

          const newEntry = {
            id:           generateId(),
            date:         entry.date,
            coffeeId:     entry.coffeeId || null,
            beanName:     entry.beanName,
            roasterId:    entry.roasterId || null,
            roasterName:  entry.roasterName || '',
            origin:       entry.origin || '',
            roastLevel:   entry.roastLevel || '',
            brewMethod:   entry.brewMethod,
            grindClicks:  null,
            grindLabel:   '',
            dose:         '',
            water:        '',
            ratio:        null,
            waterTemp:    '',
            totalTime:    '',
            scores:       { acidity: 5, body: 5, sweetness: 5, finish: 5 },
            overallRating: entry.overallRating,
            tasteTags:    entry.tasteTags || [],
            notes:        entry.notes || '',
            image:        null
          };

          await writeDataFile(
            'journal.json',
            [newEntry, ...journal],
            `☕ Alexa: log ${newEntry.beanName} on ${newEntry.brewMethod}`
          );

          attrs.state = null;
          attributesManager.setSessionAttributes(attrs);

          return responseBuilder
            .speak(`Done! Your ${entry.beanName} brew has been logged. Enjoy your coffee!`)
            .withShouldEndSession(true)
            .getResponse();

        } catch (err) {
          console.error('Write error:', err);
          return responseBuilder
            .speak(`Sorry, I couldn't save the entry. ${err.message} Please try again.`)
            .withShouldEndSession(true)
            .getResponse();
        }
      } else {
        // AMAZON.NoIntent or anything else — cancel
        attrs.state = null;
        attributesManager.setSessionAttributes(attrs);
        return responseBuilder
          .speak('No problem, brew not logged. Goodbye!')
          .withShouldEndSession(true)
          .getResponse();
      }
    }

    // Unexpected state
    return responseBuilder
      .speak("Something went wrong. Say 'log a brew' to start again.")
      .withShouldEndSession(true)
      .getResponse();
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak("Say 'log a brew' and I'll walk you through it. I'll ask which coffee you used, the brewer, a rating out of 5, and any tasting notes. You can say skip to skip optional questions.")
      .reprompt("Say 'log a brew' to get started.")
      .getResponse();
  }
};

const CancelStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(Alexa.getIntentName(handlerInput.requestEnvelope));
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Goodbye!')
      .withShouldEndSession(true)
      .getResponse();
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log('Session ended:', JSON.stringify(handlerInput.requestEnvelope.request.reason));
    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(handlerInput, error) {
    console.error('Unhandled error:', error);
    return handlerInput.responseBuilder
      .speak('Sorry, something went wrong. Please try again.')
      .reprompt('Please try again.')
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    LogBrewIntentHandler,
    ConversationHandler,
    HelpIntentHandler,
    CancelStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
