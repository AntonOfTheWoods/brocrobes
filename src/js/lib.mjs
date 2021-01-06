import { openDB } from 'idb/with-async-ittr.js';

// I am genuinely not intelligent enough to code like a proper human being in js
// It is a horrible language, written by horrible people, for horrible people
// ¯_(ツ)_/¯

const HSK_STORE = 'hsk';
const SUBTLEX_STORE = 'sub';
const DEFINITION_STORE = 'def';
const NOTE_STORE = 'not';
const EVENT_QUEUE = 'eventQueue';

const TC_DB = "transcrobes";
const TC_DB_VERSION = 1;

var storeVersions = {
  v: TC_DB_VERSION,
  dbs: {
    [`${HSK_STORE}`]: 0,
    [`${SUBTLEX_STORE}`]: 0,
    [`${DEFINITION_STORE}`]: 0,
    [`${NOTE_STORE}`]: 0
  }
};

function dbUpgrade(db) {
    console.log(`Starting dbUpdate create stores`);
    for (const storeName of Object.keys(storeVersions.dbs)) {
      console.log(`Creating store ${storeName}`);
      const store = db.createObjectStore(storeName, {keyPath: "w"}).createIndex("by_date", "ts");
    }
    db.createObjectStore(EVENT_QUEUE, { autoIncrement : true });
}

const EVENT_QUEUE_PROCESS_FREQ = 2000; //milliseconds

const DEFAULT_RETRIES = 3;

const USER_STATS_MODE = {
  IGNORE: -1,
  UNMODIFIED: 0,
  NO_GLOSS: 2,
  L2_SIMPLIFIED: 4,  // e.g, using "simple" Chinese characters
  TRANSLITERATION: 6,
  L1: 8  // e.g, English
}

var authToken = '';
var fromLang = '';
var username = '';
var password = '';
var baseUrl = '';
var glossing = -1;
function setAuthToken(value) { username = value; }
function setUsername(value) { username = value; }
function setFromLang(value) { fromLang = value; }
function setPassword(value) { password = value; }
function setBaseUrl(value) { baseUrl = value; }
function setGlossing(value) { glossing = value; }
function setStoreVersions(value) { storeVersions = value; }

function apiUnavailable(message) {
  // close the popup if it's open
  document.querySelectorAll(".tcrobe-def-popup").forEach(el => el.remove());

  const error = document.createElement('div');
  error.appendChild(document.createTextNode(`Transcrobes Server ${baseUrl} Unavailable. ${message}`));
  error.style.position = "fixed";
  error.style.width = "100%";
  error.style.height = "60px";
  error.style.top = "0";
  error.style.backgroundColor = "red";
  error.style.fontSize = "large";
  error.style.textAlign = "center";
  error.style.zIndex = 1000000;
  document.body.prepend(error);
}

function toEnrich(charstr) {
  // TODO: find out why the results are different if these consts are global...
  const zhReg = /[\u4e00-\u9fff]+/gi;
  const enReg = /[[A-z]+/gi;
  switch (fromLang) {
    case 'en':
      return enReg.test(charstr);
    case 'zh-Hans':
      return zhReg.test(charstr);
    default:
      return false;
  }
};

// Helper functions
function parseJwt (token) {
    // TODO: this will apparently not do unicode properly. For the moment we don't care.
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
};

function textNodes(node) {
  return walkNodeTree(node, {
    inspect: n => !['STYLE', 'SCRIPT'].includes(n.nodeName),
    collect: n => (n.nodeType === 3) && n.nodeValue && n.nodeValue.match(/\S/),
    //callback: n => console.log(n.nodeName, n),
  });
}

function walkNodeTree(root, options) {
  options = options || {};
  const inspect = options.inspect || (n => true),
    collect = options.collect || (n => true);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ALL,
    {
      acceptNode: function (node) {
        if (!inspect(node)) { return NodeFilter.FILTER_REJECT; }
        if (!collect(node)) { return NodeFilter.FILTER_SKIP; }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodes = []; let n;
  while (n = walker.nextNode()) {
    options.callback && options.callback(n);
    nodes.push(n);
  }

  return nodes;
}

function onError(e) {
    console.error(e);
};

function localDBsToWordInfo(dbValues) {
  let wordInfo = {};
  wordInfo.metas = {};
  for (const dbInfo of dbValues) {
    if (dbInfo.db == SUBTLEX_STORE) {
      let val = '';
      if (!!(dbInfo.val)) {
        let subt = dbInfo.val.v[0];
        // FIXME: hard-coded nastiness
        val = `Freq: ${subt.wcpm} : ${subt.wcdp} : ${subt.pos} : ${subt.pos_freq}`;
      }
      wordInfo.metas[dbInfo.db] = val;
    } else if (dbInfo.db == HSK_STORE) {
      let val = '';
      if (!!(dbInfo.val)) {
        // FIXME: hard-coded nastiness
        val = `HSK: ${dbInfo.val.v[0].hsk}`;
      }
      wordInfo.metas[dbInfo.db] = val;
    } else if (dbInfo.db == DEFINITION_STORE) {
      wordInfo.def = dbInfo.val;
    } else if (dbInfo.db == NOTE_STORE) {
      wordInfo.not = dbInfo.val;
    }
  }
  return wordInfo;
}

function fetchWithNewToken(url, body = {}, retries, apiUnavailableCallback) {
  const fetchInfo = {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ username: username, password: password }),
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
  };
  return fetch(baseUrl + 'api/token/', fetchInfo)
    .then(res => {
      if (res.ok) {
        return res.json();
      }
      throw new Error(res.status);
    })
    .then(data => {
      if (data.access) {
        authToken = data.access;
        fromLang = parseJwt(authToken)['lang_pair'].split(':')[0];
        storeVersions = parseJwt(authToken)['db_versions'];
        if (Object.keys(body).length === 0 && body.constructor === Object) {
          // we just wanted to get the token
          return Promise.resolve({
            authToken: authToken,
            fromLang: fromLang,
            storeVersions: storeVersions
          });
        } else {
          return fetchPlus(url, body, retries, apiUnavailableCallback);
        }
      }
    }).catch(error => {
      let errorMessage = `${url}: ${JSON.stringify(fetchInfo)}: ${error.message}`
      console.log(errorMessage);
    });
}

function fetchPlus(url, body, retries, apiUnavailableCallback) {
  let options = {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify(body),
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
  };
  options.headers["Authorization"] = "Bearer " + authToken
  // console.log(`${url}: ${JSON.stringify(options)}`);

  return fetch(url, options)
    .then(res => {
      if (res.ok) {
        return res.json()
      } else {
        console.log(`failure inside fetch res is ${JSON.stringify(res)}`);
      }

      if (retries > 0 && res.status == 401) {
        return fetchWithNewToken(url, JSON.parse(options.body), retries - 1, apiUnavailableCallback);
      }
      if (retries > 0) {
        return fetchPlus(url, JSON.parse(options.body), retries - 1, apiUnavailableCallback)
      }

      if (apiUnavailableCallback) {
        if (res.status == 401)
          apiUnavailableCallback("Please make sure your username and password are correct");
        else
          apiUnavailableCallback("Please make sure you have the latest browser extension, or try again later");
      }
      throw new Error(res.status)
    }).catch(error => {
      let errorMessage = `${url}: ${JSON.stringify(options)}: ${error.message}`
      console.log(errorMessage);
    });
}

async function updateDb(db, storeName, dbVersion, maxdate, progressCallback, progressFrequency=1000) {
  return fetchPlus(baseUrl + `enrich/${storeName}_db`, { version: dbVersion, maxdate: maxdate },
    DEFAULT_RETRIES, apiUnavailable).then((data) => {
      const tx = db.transaction(storeName, 'readwrite');
      // console.log(JSON.stringify(data).substring(0, 100));
      let i = 0;
      return Promise.all([...(data.map(entry => {
        if (progressCallback) {
          i++;
          if ((i % progressFrequency) == 0) {
            progressCallback(`Processing record ${i} for database ${dbName}`);
            console.log(`${dbName}: ${i} putting ${JSON.stringify(entry)}`);
          }
        }
        return tx.store.put(entry);
      })), tx.done]);
  });
}

function displayMessage(message) {
  // Show a non-modal message to the user.
  // FIXME: put this in the warning banner!
  if (document.getElementById("tcMessage")) {
    document.getElementById("tcMessage").textContent = message;
  }
  console.log(message);
}

async function syncDB() {
  const db = await openDB(TC_DB, TC_DB_VERSION, { upgrade(db) { dbUpgrade(db); }, });

  for (const [storeName, storeVersion] of Object.entries(storeVersions.dbs)) {
    console.log(storeName, storeVersion);
    // const cursor = await db.transaction(storeName).store.index('by_date').openCursor(null, 'prev');
    await db.transaction(storeName).store.index('by_date').openCursor(null, 'prev').then((cursor) => {
      // console.log(`hello ${storeName}: ${cursor.key} and ${JSON.stringify(cursor.value)}`);
      let maxDbDate = ((!(cursor) || !(cursor.value)) ? 0 : cursor.value.ts);
      console.log(`${storeName}: max local ${maxDbDate}, remote ${storeVersions.dbs[storeName]}`);

      return updateDb(db, storeName, storeVersions.v, maxDbDate, displayMessage).then(() => {
        console.log(`Should have updated the ${storeName} db properly`);
      });
    });
  }
  // FIXME: can/should I close the db here?
  // db.close();
}

async function getWordFromDBs(word) {
  let promises = [];
  const db = await openDB(TC_DB, storeVersions.v);
  for (const storeName of Object.keys(storeVersions.dbs)) {
    promises.push(db.get(storeName, word).then((val) => {
      // console.log(`got ${JSON.stringify(val)} for ${word} from ${storeName}`);
      return { db: storeName, val: val }
    }));
  }
  return await Promise.all(promises);
}

async function getNoteWords() {
  // FIXME: think about adding an index and filtering on the index
  const knownNotes = [];
  const allNotes = [];
  const db = await openDB(TC_DB, storeVersions.v);
  const allNoteObjects = await db.getAll(NOTE_STORE);

  for (const note of allNoteObjects) {
    // console.log(note);
    if (note.n.Is_Known == 1) {
      knownNotes.push(note.w);
    }
    allNotes.push(note.w);
  }
  db.close()
  return [knownNotes, allNotes];
}

async function submitUserEvent(eventData) {
  const db = await openDB(TC_DB, storeVersions.v);
  db.put(EVENT_QUEUE, eventData);
  db.close();
}

async function sendUserEvents() {
  if (!(baseUrl) || !(username) || !(password)) {
    return { 'status': 'uninitialised' };
  }
  const db = await openDB(TC_DB, storeVersions.v);
  const allEvents = [];
  const allEntries = [];
  let cursor = await db.transaction(EVENT_QUEUE).store.openCursor();
  while (cursor) {
    console.log(cursor.key, cursor.value);
    allEntries.push({key: cursor.key, value: cursor.value});
    allEvents.push(cursor.value);
    cursor = await cursor.continue();
  }

  if (!(allEvents.length)) {
    return { 'status': 'empty_queue' };
  }
  fetchPlus(baseUrl + 'user_event/', allEvents, DEFAULT_RETRIES)
    .then(data => {
      if (!(data) || !(data['status']) || !(data['status'] == 'success')) {
        let message = 'user_event update failed due to return status incorrect!';
        throw message;
      } else {
        // remove from queue
        for (const userEvent of allEntries) {
          db.delete(EVENT_QUEUE, userEvent.key);
        }
      }
      db.close()
    }).catch((err) => {
      console.log(err);
      throw 'user_event update failed! That is bad!';
    });
  return { 'status': 'success' };
}

export {
  // variables and constants
  DEFAULT_RETRIES,
  EVENT_QUEUE_PROCESS_FREQ,
  HSK_STORE,
  NOTE_STORE,
  SUBTLEX_STORE,
  DEFINITION_STORE,
  authToken,
  username,
  password,
  baseUrl,
  glossing,
  storeVersions,

  // property setters
  setAuthToken,
  setUsername,
  setPassword,
  setFromLang,
  setBaseUrl,
  setGlossing,
  setStoreVersions,

  // functions
  fetchPlus,
  toEnrich,
  parseJwt,
  onError,
  textNodes,
  USER_STATS_MODE,
  fetchWithNewToken,
  getNoteWords,
  syncDB,
  getWordFromDBs,
  sendUserEvents,
  submitUserEvent,
  localDBsToWordInfo,
}
