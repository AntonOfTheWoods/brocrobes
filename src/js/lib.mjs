import { openDB } from 'idb/with-async-ittr.js';

// I am genuinely not intelligent enough to code like a proper human being in js
// It is a horrible language, written by horrible people, for horrible people

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
      //const dateIndex = store.createIndex("by_date", "ts");
    }
    db.createObjectStore(EVENT_QUEUE, { autoIncrement : true });
}

// const DB_PROMISE = openDB(TC_DB, TC_DB_VERSION, { upgrade(db) { dbUpgrade(db); }, });
//
// const idbKeyval = {
//   async get(key, store='keyval') {
//     return (await DB_PROMISE).get(store, key);
//   },
//   async set(key, val, store='keyval') {
//     return (await DB_PROMISE).put(store, val, key);
//   },
//   async delete(key, store='keyval') {
//     return (await DB_PROMISE).delete(store, key);
//   },
//   async clear(store='keyval') {
//     return (await DB_PROMISE).clear(store);
//   },
//   async keys(store='keyval') {
//     return (await DB_PROMISE).getAllKeys(store);
//   },
// };

const EVENT_QUEUE_PROCESS_FREQ = 2000; //milliseconds

const DEFAULT_RETRIES = 3;

const USER_STATS_MODE = {
  IGNORE: -1,
  UNMODIFIED: 0,
  NO_GLOSS: 2,  // wo
  L2_SIMPLIFIED: 4,
  TRANSLITERATION: 6,
  L1: 8  // English
}

var authToken = '';
//var refreshToken = '';
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


async function tokensFromCredentials(items) {
  baseUrl = items.baseUrl + (items.baseUrl.endsWith('/') ? '' : '/');
  glossing = items.glossing;
  const fetchInfo = {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ username: items.username, password: items.password }),
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
  };
  return await fetch(baseUrl + 'api/token/', fetchInfo)
    .then(res => {
      if (res.ok)
        return res.json();

      message = "Unable to get tokens for credentials";
      console.log(message);
      throw message;
    })
    .then(data => {
      return {
        access: data.access,
        refresh: data.refresh,
        baseUrl: baseUrl,
        glossing: glossing
      };

    }).catch((err) => {
      console.log(err);
      throw "Unable to get tokens for credentials";
    });
}

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
            //refreshToken: data.refresh,
            fromLang: fromLang,
            storeVersions: storeVersions
          });
        } else {
          //options.headers.Authorization = "Bearer " + authToken;
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

    // const tx = db.transaction(dbName, "readwrite");
    // const store = tx.objectStore(dbName);
    // let i = 0;
    // for (const entry of data) {
    //   if (progressCallback) {
    //     i++;
    //     if ((i % progressFrequency) == 0) {
    //       progressCallback(`Processing record ${i} for database ${dbName}`);
    //       console.log(`${dbName}: ${i} putting ${JSON.stringify(entry)}`);
    //     }
    //   }
    //   store.put(entry);
    // }
    // tx.oncomplete = () => {
    //   console.log(`Updated db ${dbName}`);
    //   // All requests have succeeded and the transaction has committed.
    // };
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
  // const request = indexedDB.open(TC_DB, storeVersions.v);
  // FIXME: should already be done now above
  // request.onupgradeneeded = () => {
  //   let db = request.result;
  //   if (event.oldVersion < 1) {
  //     for (const storeName of Object.keys(storeVersions.dbs)) {
  //       console.log(`Creating store ${storeName}`);
  //       const store = db.createObjectStore(storeName, {keyPath: "w"});
  //       const dateIndex = store.createIndex("by_date", "ts");
  //     }
  //     db.createObjectStore(EVENT_QUEUE, { autoIncrement : true });
  //   }
  //   db.onversionchange = () => {
  //     // First, save any unsaved data:
  //     saveUnsavedData().then(() => { });
  //   };
  // }
  const db = await openDB(TC_DB, TC_DB_VERSION, { upgrade(db) { dbUpgrade(db); }, });

  for (const [storeName, storeVersion] of Object.entries(storeVersions.dbs)) {
    console.log(storeName, storeVersion);
    // const cursor = await db.transaction(storeName).store.index('by_date').openCursor(null, 'prev');
    await db.transaction(storeName).store.index('by_date').openCursor(null, 'prev').then((cursor) => {
      // console.log(`hello ${storeName}: ${cursor.key} and ${JSON.stringify(cursor.value)}`);
      let maxDbDate = ((!(cursor) || !(cursor.value)) ? 0 : cursor.value.ts);
      console.log(`${storeName}: max local ${maxDbDate}, remote ${storeVersions.dbs[storeName]}`);

      return updateDb(db, storeName, storeVersions.v, maxDbDate, displayMessage).then(() => {
        //db.close();
        console.log(`Should have updated the ${storeName} db properly`);
      });
    });

    // const tx = db.transaction(storeName, "readonly");
    // const store = tx.objectStore(storeName);
    // const index = store.index("by_date");
    // const openCursorRequest = index.openCursor(null, 'prev');
    // let maxRevisionObject = null;
  }

  // request.onsuccess = () => {
  //   let db = request.result;
  //   // console.log(storeVersions);
  //   for (const [storeName, storeVersion] of Object.entries(storeVersions.dbs)) {
  //     console.log(storeName, storeVersion);

  //     const tx = db.transaction(storeName, "readonly");
  //     const store = tx.objectStore(storeName);
  //     const index = store.index("by_date");
  //     const openCursorRequest = index.openCursor(null, 'prev');
  //     let maxRevisionObject = null;

  //     openCursorRequest.onsuccess = function (event) {
  //       if (event.target.result) {
  //         maxRevisionObject = event.target.result.value; //the object with max revision
  //       }
  //     };
  //     tx.oncomplete = function (event) {
  //       let maxDbDate = (maxRevisionObject == null) ? 0 : maxRevisionObject.ts;
  //       console.log(`${storeName}: max local ${maxDbDate}, remote ${storeVersions.dbs[storeName]}`);
  //       if (maxDbDate < storeVersions.dbs[storeName]) {
  //         console.log(`${storeName}: updating`);
  //         updateDb(db, storeName, storeVersions.v, maxDbDate, displayMessage).then(() => {
  //           //db.close();
  //         });
  //       }
  //     };
  //   }
  // };

  // function saveUnsavedData() {
  //   // How you do this depends on your app.
  // }

}

async function getWordFromDBs(word) {
  let promises = [];
  const db = await openDB(TC_DB, storeVersions.v);
  for (const storeName of Object.keys(storeVersions.dbs)) {
    //promises.push(db.get(storeName, word));

    promises.push(db.get(storeName, word).then((val) => {
      console.log(`got ${JSON.stringify(val)} for ${word} from ${storeName}`);
      return { db: storeName, val: val }
    }));

    // let store = new Store(TC_DB, storeName);
    // promises.push(get(word, store).then((val) => {
    //   console.log(`got ${JSON.stringify(val)} for ${word} from ${storeName}`);
    //   return { db: storeName, val: val }
    // }));
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

  // const request = indexedDB.open(TC_DB, storeVersions.v);
  // request.onsuccess = () => {
  //   let db = request.result;

  //   var transaction = db.transaction(NOTE_STORE, "readonly");
  //   var objectStore = transaction.objectStore(NOTE_STORE);

  //   objectStore.openCursor().onsuccess = (event) => {
  //     var cursor = event.target.result;
  //     if(cursor) {
  //       if (cursor.value.n.Is_Known == 1) {
  //         knownNotes.push(cursor.key);
  //       }
  //       cursor.continue();
  //     }
  //   };
  // }
  // return Promise.all([Promise.resolve(knownNotes), keys(new Store(TC_DB, NOTE_STORE))]);
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
  // const allEvents = await db.getAll(EVENT_QUEUE);
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
    // .then(res => {
    //   if (res.ok) {
    //     console.log(`the res.ok in sendUserEvents is ${JSON.stringify(res)}`);
    //     return res.json();
    //   } else {
    //     console.log(`the res in sendUserEvents is ${JSON.stringify(res)}`);
    //   }

    //   let message = 'user_event update failed due to res.ok not ok!';
    //   console.log(message);
    //   throw message;
    // })
    .then(data => {
      if (!(data) || !(data['status']) || !(data['status'] == 'success')) {
        let message = 'user_event update failed due to return status incorrect!';
        throw message;
      } else {
        // remove from queue
        for (const userEvent of allEntries) {
          // console.log(`trying to delete ${JSON.stringify(userEvent)} from queue`);
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

// function sendNoteToApi(apiVerb, note, addNew, target, previousImg) {
//   fetchPlus(baseUrl + 'notes/' + apiVerb, note, DEFAULT_RETRIES)
//     .then(res => {
//       const msg = document.getElementsByClassName('tcrobe-def-messages')[0];
//       msg.style.display = "block";
//       target.src = previousImg;
//       if (res.status != "ok") {
//         msg.innerHTML = "Update failed. Please try again later.";
//       } else {
//         note['Is_Known'] = 1;  // FIXME: does this do anything?
//         cleanupAfterNoteUpdate(addNew, note.Simplified);
//         msg.innerHTML = "Update succeeded";
//         setTimeout(() => msg.style.display = "none", 3000);
//       }
//     }).catch((err) => {
//       console.log(err);
//       //overkill?
//       //apiUnavailable();
//     });
// }



// function sendUserEvents() {
//   fetchWithNewToken().then(() => {
//     // FIXME: we can get here without an updated token and without a recent successful update
//     // so probably the fetchWithNewToken method needs serious revising, or a new method created
//     const request = indexedDB.open(TC_DB, storeVersions.v);
//
//     request.onsuccess = () => {
//       let db = request.result;
//       const tx = db.transaction(EVENT_QUEUE, "readwrite");
//       const store = tx.objectStore(EVENT_QUEUE);
//
//       store.openCursor().onsuccess = (event) => {
//         const cursor = event.target.result;
//         if (cursor) {
//           var sendStatus = fetchPlus(baseUrl + 'user_event/', cursor.value, DEFAULT_RETRIES);
//           if (!(sendStatus) || !(sendStatus['status']) || !(sendStatus['status'] == 'success')) {
//             tx.abort()
//           }
//           data = {"status": "success"}
//           if (cursor.value.albumTitle === 'A farewell to kings') {
//             const updateData = cursor.value;
//             updateData.year = 2050;
//             const request = cursor.update(updateData);
//             request.onsuccess = () => {
//               console.log('A better album year?');
//             };
//           };
//
//           const listItem = document.createElement('li');
//           listItem.innerHTML = '<strong>' + cursor.value.albumTitle + '</strong>, ' + cursor.value.year;
//           list.appendChild(listItem);
//           cursor.continue();
//         } else {
//           console.log('Entries displayed.');
//         }
//       };
//     };
//   }
// }

export {
  //variables and constants
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

  //functions
  tokensFromCredentials,
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
}
