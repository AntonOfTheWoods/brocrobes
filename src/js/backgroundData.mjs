
import { fetchWithNewToken, fetchPlus } from './utils.mjs';

// Helper functions
function parseJwt (token) {
  // TODO: this will apparently not do unicode properly. For the moment we don't care.
  var base64Url = token.split('.')[1];
  var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(window.atob(base64));
};

let authToken = '';
let refreshToken = '';
let fromLang = '';
let known_words = 0;
let unknown_words = 0;
const DEFAULT_RETRIES = 3;

const HSK_STORE = 'hsk';
const SUBTLEX_STORE = 'sub';
const DEFINITION_STORE = 'def';
const NOTE_STORE = 'not';

const username = 'user5';
const password = 'titititi';
const items = {
  username: username,
  password: password
};

const storeVersions = {
  [`${HSK_STORE}`]: 1,
  [`${SUBTLEX_STORE}`]: 1,
  [`${DEFINITION_STORE}`]: 1,
  [`${NOTE_STORE}`]: 1
};

const dbVersion = 0;

const baseUrl = 'http://localhost:8002/';

const TC_DB = "transcrobes";
const TC_DB_VERSION = 1;

function updateDb(db, dbName, maxdate) {
  console.log('stg here' + maxdate);
  const fetchInfo = {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ version: dbVersion, maxdate: maxdate }),
    headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Bearer " + authToken
    },
  };
  return fetchPlus(baseUrl + `enrich/${dbName}_db`, fetchInfo, DEFAULT_RETRIES).then((data) => {
    const tx = db.transaction(dbName, "readwrite");
    const store = tx.objectStore(dbName);
    for (const entry of data) {
      console.log(entry);
      store.put(entry);
    }
    tx.oncomplete = function() {
      console.log(`updated db ${dbName}`);
      // All requests have succeeded and the transaction has committed.
    };
  });
}

function initDB() {
  const request = indexedDB.open(TC_DB, TC_DB_VERSION);
  request.onupgradeneeded = () => {
    db = request.result;
    // const refStores = [HSK_STORE, SUBTLEX_STORE];  // HSK, SUBTLEX
    // const stores = refStores.concat([DEFINITION_STORE, NOTE_STORE]);  // for merged dictionary defs and user notes
    if (event.oldVersion < 1) {
      for (const storeName of Object.keys(storeVersions)) {
        console.log(`Creating store ${storeName}`);
        const store = db.createObjectStore(storeName, {keyPath: "w"});
        const dateIndex = store.createIndex("by_date", "ts");
      }
      db.createObjectStore("eventQueue", { autoIncrement : true });
    }
    db.onversionchange = () => {
      // First, save any unsaved data:
      saveUnsavedData().then(function() { });
    };
  }
  request.onsuccess = function() {
    let db = request.result;
    console.log(`got an onsuccess`);
    for (const [storeName, storeVersion] of Object.entries(storeVersions)) {
      console.log(storeName, storeVersion);
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const index = store.index("by_date");
      const openCursorRequest = index.openCursor(null, 'prev');
      let maxRevisionObject = null;

      openCursorRequest.onsuccess = function (event) {
        if (event.target.result) {
          maxRevisionObject = event.target.result.value; //the object with max revision
        }
      };
      tx.oncomplete = function (event) {
        console.log(maxRevisionObject);
        let max_db_date = (maxRevisionObject == null) ? 0 : maxRevisionObject.ts;
        console.log(`max local ${storeName} ` + max_db_date);
        console.log(`max remote ${storeName} ` + storeVersions[storeName]);
        if (max_db_date < storeVersions[storeName]) {
          updateDb(db, storeName, max_db_date).then(() => {
            //db.close();
          });
        }
      };
    }
  };

  function saveUnsavedData() {
    // How you do this depends on your app.
  }

  function displayMessage(message) {
    // Show a non-modal message to the user.
    // FIXME: put this in the warning banner!
    document.getElementById("message").textContent = message;
  }
}

export function runInit() {
  console.log('starting runInit');
  fetchWithNewToken('').then(() => {
    initDB();
  });
}
