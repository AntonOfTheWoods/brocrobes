
var utils = require('./utils');
var popup = require('./popup');

let glossing = utils.USER_STATS_MODE.IGNORE;
let baseUrl = '';
let authToken = '';
let refreshToken = '';
let fromLang = '';
let pops;

let observer;


function manageElement(el) {
    el.childNodes.forEach(function(item) {
        if (item.nodeType == 3) {
          const fetchInfo = {
            method: "POST",
            cache: "no-store",
            body: JSON.stringify({ data: item.nodeValue, userStatsMode: glossing }),
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": "Bearer " + authToken
            },
          };

          utils.fetchPlus(baseUrl + 'enrich/enrich_json', fetchInfo, utils.DEFAULT_RETRIES)
            .then(data => {
              popup.enrichElement(item, data, pops, fromLang);
              el.dataset.tced = true;
            }).catch((err) => {
              console.log(err);
            });
       }
     });
}

// the callback function that will be fired when the element apears in the viewport
function onEntry(entry) {
  entry.forEach((change) => {
    if (!change.isIntersecting) return;
    if (change.target.dataset && change.target.dataset.tced) return;
    manageElement(change.target);
  });
}

function apiUnavailable(message) {
  // close the popup if it's open
  popups = document.getElementsByClassName("tcrobe-def-popup");  // why are there more than one again? ¯_(ツ)_/¯
  for (var i = 0; i < popups.length; i++) {
    popups[i].style.display = "none";
  }
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

function cleanupAfterNoteUpdate(addNew, simplified) {
      //remove existing defs if we are setting is_known = true
      if (!addNew) {
        const eqDefs = document.getElementsByClassName("tcrobe-def");
        for (var i = 0; i < eqDefs.length; i++) {
          const deft = eqDefs[i];
          if (deft.dataset.tcrobeDefId == simplified) {
            deft.parentElement.removeChild(deft);
          }
        }
      }
      // This will remove addition after an add, but what if you chose wrong and want to update?
      // the only option left will be to set to "known", which is not necessarily true
      // const plusImgs = document.getElementsByClassName("tcrobe-def-plus");
      // while (plusImgs.length > 0) plusImgs[0].remove();
}

function sendNoteToApi(apiVerb, note, addNew, target, previousImg) {
  const fetchInfo = {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify(note),
    headers: { "Accept": "application/json", "Content-Type": "application/json", 'Authorization': 'Bearer ' + authToken },
  };

  utils.fetchPlus(baseUrl + 'notes/' + apiVerb, fetchInfo, utils.DEFAULT_RETRIES)
    .then(res => {
      const msg = document.getElementsByClassName('tcrobe-def-messages')[0];
      msg.style.display = "block";
      target.src = previousImg;
      if (res.status != "ok") {
        msg.innerHTML = "Update failed. Please try again later.";
      } else {
        note['Is_Known'] = 1;  // FIXME: does this do anything?
        cleanupAfterNoteUpdate(addNew, note.Simplified);
        msg.innerHTML = "Update succeeded";
        setTimeout(() => msg.style.display = "none", 3000);
      }
    }).catch((err) => {
      console.log(err);
      apiUnavailable();
    });
}

function addOrUpdateNote(event, token, source, addNew) {
  const apiVerb = addNew ? 'add_note_chromecrobes' : 'set_word_known';
  const note = { "Simplified": token['word'], "Pinyin": token['pinyin'].join("") };

  let meaning = '';
  const sourceDef = token['definitions'][source];
  for (var provider in sourceDef) {
    meaning += " (" + provider + "). ";
    const means = []
    for (var pos in sourceDef[provider]) {
      means.push(sourceDef[provider][pos]['normalizedTarget']);
    }
    meaning += means.join(', ');
  }
  note['Meaning'] = meaning;
  const previousImg = event.target.src;
  event.target.src = chrome.runtime.getURL('/img/load.gif');
  refreshTokenAndRun(() => sendNoteToApi(apiVerb, note, addNew, event.target, previousImg), () => true );
  event.stopPropagation();
}

function submitUserEvent(eventType, eventData) {
  const fetchInfo = {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ type: eventType, data: eventData, userStatsMode: glossing }),
    headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Bearer " + authToken
    },
  };

  utils.fetchPlus(baseUrl + 'user_event/', fetchInfo, utils.DEFAULT_RETRIES);
  console.log(eventType);
  console.log(eventData);

}

function enrichTextNode(el) {
  var promises = [];
  if (el.nodeType == 3) {
    const fetchInfo = {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ data: el.nodeValue, userStatsMode: glossing }),
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Bearer " + authToken
      },
    };

    promises.push(utils.fetchPlus(baseUrl + 'enrich/enrich_json', fetchInfo, utils.DEFAULT_RETRIES)
      .then(data => {

        return popup.enrichElement(el, data, pops, fromLang);
      }).catch((err) => {
        console.log(err);
        return Promise.resolve({access: null});
      }));
    console.log(JSON.stringify(el));
    //el.dataset.tced = true;
  }
  return Promise.all(promises);
}

async function enrichDocument(batch) {
  var promises = [];
  utils.textNodes(document.body).forEach(function (el) {
    if (!utils.toEnrich(el.nodeValue, fromLang)) {
      console.log("Not enriching: " + el.nodeValue);
      return Promise.resolve({access: null});
    }
    if (batch){
      promises.push(enrichTextNode(el));
    } else {
      observer.observe(el.parentElement);
    }
  });

  document.addEventListener('click', () => {
    popups = document.getElementsByClassName("tcrobe-def-popup");  // why are there more than one again? ¯_(ツ)_/¯
    for (var i = 0; i < popups.length; i++) {
      popups[i].style.display = "none";
    }
  });
  return Promise.all(promises);
}

const runWithCredentials = function (items, callback) {
  baseUrl = items.baseUrl + (items.baseUrl.endsWith('/') ? '' : '/');
  glossing = items.glossing;
  const fetchInfo = {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ username: items.username, password: items.password }),
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
  };
  return fetch(baseUrl + 'api/token/', fetchInfo)
    .then(res => {
      console.log(' but again not ehere do i not get here?');
      if (res.ok)
        return res.json();

      console.log(' or maybe ?');
      if (res.status == 401)
        apiUnavailable("Please make sure your username and password are correct");
      else
        apiUnavailable("Please make sure you have the latest browser extension, or try again later");

      return Promise.resolve({access: null});
    })
    .then(data => {
      if (data.access) {
        authToken = data.access;
        refreshToken = data.refresh;
        fromLang = utils.parseJwt(authToken)['lang_pair'].split(':')[0];
        return callback();
      }
    }).catch((err) => {
      console.log(err);
      apiUnavailable("Make sure the server name is correct, or try again later");
      return Promise.resolve({access: null});
    });
}

function refreshTokenAndRun(callback, canRunCallback) {
  if (!(canRunCallback())) {
    alert('Please refresh the page before attempting this action again');
    return;  // TODO: offer to reload from here
  }
  pops = popup.initPage();
  observer = new IntersectionObserver(onEntry, { threshold: [0.9] })
  chrome.storage.local.get({
    username: '',
    password: '',
    baseUrl: '',
    glossing: ''
  }, function (items) {
    runWithCredentials(items, callback)
  });
}

async function syncRunAndReturnHTMLasString(auth) {
  pops = popup.initPage();

  var items = ("username" in auth) ? await utils.tokensFromCredentials(auth) : auth;

  authToken = items.access;
  refreshToken = items.refresh;
  fromLang = utils.parseJwt(authToken)['lang_pair'].split(':')[0];
  baseUrl = items.baseUrl;

  var waitit = await enrichDocument(true);

  return `<!DOCTYPE html><html>${document.getElementsByTagName("html")[0].innerHTML}</html>`;
}

module.exports = {
  syncRunAndReturnHTMLasString,
  enrichDocument,
  refreshTokenAndRun,
  authToken
}
