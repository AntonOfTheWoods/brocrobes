const USER_STATS_MODE_IGNORE = -1
const USER_STATS_MODE_UNMODIFIED = 0
const USER_STATS_MODE_NO_GLOSS = 2  // word-segmented
const USER_STATS_MODE_L2_SIMPLIFIED = 4  // Simpler synonym, not yet implemented
const USER_STATS_MODE_TRANSLITERATION = 6  // Pinyin
const USER_STATS_MODE_L1 = 8  // English

let glossing = USER_STATS_MODE_IGNORE;

let baseUrl = '';
let authToken = '';
let refreshToken = '';
let fromLang = '';
let known_words = 0;
let unknown_words = 0;

const DEFAULT_RETRIES = 3;

const fetchPlus = (url, options = {}, retries) =>
  fetch(url, options)
    .then(res => {
      if (res.ok) {
        return res.json()
      }
      if (res.status == 401) {
        const fetchInfo = {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({ refresh: refreshToken }),
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
        };
        fetch(baseUrl + 'api/token/refresh/', fetchInfo)
          .then(res => {
            if (res.ok) {
              return res.json();
            }
            throw new Error(res.status);
          })
          .then(data => {
            if (data.access) {
              authToken = data.access;
              options.headers.Authorization = "Bearer " + authToken;
              return fetchPlus(url, options, retries - 1);
            }
          }).catch((err) => {
            console.log(err);
          });
      }

      if (retries > 0) {
        return fetchPlus(url, options, retries - 1)
      }
      throw new Error(res.status)
    })
    .catch(error => console.error(error.message));


// the callback function that will be fired when the element apears in the viewport
function onEntry(entry) {
  entry.forEach((change) => {
    if (!change.isIntersecting) return;
    if (change.target.dataset && change.target.dataset.tced) return;

    change.target.childNodes.forEach(function(item) {
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

          fetchPlus(baseUrl + 'enrich/enrich_json', fetchInfo, DEFAULT_RETRIES)
            .then(data => {
              enrichElement(item, data, pops);
              change.target.dataset.tced = true;
            }).catch((err) => {
              console.log(err);
            });
       }
     });
  });
}

let observer = new IntersectionObserver(onEntry, { threshold: [0.9] });

// FIXME: this should not be here but rather in an external CSS
// that is horrible for development though, so this is being used for the moment
//
// Style for elements
const tcrobeEntry = 'padding-left: 6px; position: relative; cursor: pointer; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;';
// FIXME: now we have only one floating popup, this needs to be revisited
const tcrobeDefPopup = 'all: initial; * { all: unset; box-sizing: border-box; } height: 400px; background-color: #555; color: #fff; text-align: center; border-radius: 6px; padding: 3px 0; position: absolute; z-index: 1000; top: 120%; right: 50%; margin-right: -80px; display: none; width: 350px;';
const tcrobeDefContainer = 'text-align: left;';
const tcrobeDefSource = 'margin-left: 6px; padding: 5px 0;';
const tcrobeDefSourceHeader = 'box-sizing: border-box;';
const tcrobeDefSourceName = 'box-sizing: border-box; float: left; text-align: left; width: 50%;';
const tcrobeDefIcons = 'box-sizing: border-box; float: left; text-align: right; width: 50%;';
const tcrobeDefSourcePos = 'margin-left: 12px;';
const tcrobeDefSourcePosDefs = 'margin-left: 18px; padding: 0 0 0 5px;';
const tcrobeDefHeader = 'box-sizing: border-box; display: flex;';
const tcrobeDefPinyin = 'box-sizing: border-box; float: left; width: 20%; padding: 2px;';
const tcrobeDefBest = 'box-sizing: border-box; float: left; width: 60%; padding: 2px;';
const tcrobeDefSentbutton = 'box-sizing: border-box; float: left; width: 50%; padding: 2px;';
const tcrobeStats = 'margin-left: 6px; padding: 5px 0;';
// End style for elements

const pops = doCreateElement('span', 'tcrobe-def-popup', null, [['style', tcrobeDefPopup]], document.body);
pops.attributes.id = 'dapopsicle';

function toEnrich(charstr) {
  // TODO: find out why the results are different if these consts are global...
  const zhReg = /[\u4e00-\u9fa5]+/gi;
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

  fetchPlus(baseUrl + 'notes/' + apiVerb, fetchInfo, DEFAULT_RETRIES)
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

function popupDefinitions(token, popupContainer) {
  const defs = token['definitions'];
  for (var source in defs) {
    const sources = defs[source];
    // this MUST be assigned to a const or something weird happens and the ref changes to the last item in the loop for all
    // addEventListener events
    const fixedSource = source;
    popupContainer.appendChild(doCreateElement('hr', 'tcrobe-def-hr', null, null));
    const defSource = doCreateElement('div', 'tcrobe-def-source', null, [['style', tcrobeDefSource]], popupContainer);
    const defSourceHeader = doCreateElement('div', 'tcrobe-def-source-header', null, [['style', tcrobeDefSourceHeader]], defSource);
    defSourceHeader.appendChild(doCreateElement('div', 'tcrobe-def-source-name', source, [['style', tcrobeDefSourceName]]));
    const defSourceIcons = doCreateElement('div', 'tcrobe-def-icons', null, [['style', tcrobeDefIcons]], defSourceHeader);

    if (!(token['ankrobes_entry']) || !(token['ankrobes_entry'].length)) {
      // add add note button
      doCreateElement('img', "tcrobe-def-plus", null, [["src", chrome.runtime.getURL('/img/plus.png')],
        ['style', 'display: inline; width:32px; height:32px; padding:3px;']], defSourceIcons).addEventListener("click",
          (event) => addOrUpdateNote(event, token, fixedSource, true)
        );
    }
    // add update note button
    doCreateElement('img', "tcrobe-def-good", null, [["src", chrome.runtime.getURL('/img/good.png')],
      ['style', 'display: inline; width:32px; height:32px; padding:3px;']], defSourceIcons).addEventListener("click",
          (event) => addOrUpdateNote(event, token, fixedSource, false)
      );

    for (var pos_def in sources) {
      const actual_defs = sources[pos_def];
      defSource.appendChild(doCreateElement('div', 'tcrobe-def-source-pos', pos_def, [['style', tcrobeDefSourcePos]]));
      const defSourcePosDefs = doCreateElement('div', 'tcrobe-def-source-pos-defs', null, [['style', tcrobeDefSourcePosDefs]], defSource);
      for (var def in actual_defs) {
        let sep = "";
        if (def > 0) { sep = ", "; }
        defSourcePosDefs.appendChild(doCreateElement('span', 'tcrobe-def-source-pos-def', sep + actual_defs[def]['normalizedTarget'], null));
      }
    }
  }
}

function printInfos(info, parentDiv) {
  const infoDiv = doCreateElement('div', 'tc-stats', null, [['style', tcrobeStats]], parentDiv);
  info.forEach(function(e) {
    doCreateElement('hr', null, null, null, infoDiv);
    if (!!(e['metas'])) {
      const infoElem = doCreateElement('div', 'tc-' + e['name'] + 's', null, null, infoDiv);
      doCreateElement('div', 'tc-' + e['name'], e['metas'], null, infoElem);
    } else {
      doCreateElement('div', 'tc-' + e['name'], 'No ' + e['name'] + ' found', null, infoDiv);
    }
  } );
}

function printSynonyms(synonyms, parentDiv) {
  // maybe show that there are none?
  if (!(synonyms) || !(synonyms.length > 0)){ return; }

  const synonymsDiv = doCreateElement('div', 'tc-synonyms', null, [['style', tcrobeStats]], parentDiv);

  doCreateElement('hr', null, null, null, synonymsDiv);
  doCreateElement('div', 'tc-synonym-list', synonyms.join(', '), null, synonymsDiv);
}

function doCreateElement(elType, elClass, elInnerText, elAttrs, elParent) {
    if (!(elType)) { throw "eltype must be an element name"; };
    const el = document.createElement(elType);
    if (!!(elClass)) {
        el.classList.add(elClass);
    }
    if (!!(elInnerText)) {
        el.textContent = elInnerText;
    }
    if (!!(elAttrs)) {
        for (let attr of elAttrs) {
            el.setAttribute(attr[0], attr[1]);
        }
    }
    if (!!(elParent)) {
        elParent.appendChild(el);
    }
    return el;
}

function initPopup(event, popup) {
  event.stopPropagation();
  // this allows to have the popup on links and if click again then the link will activate
  // FIXME: this should be more intelligent! Currently it considers that a click on *another*
  // link text also means you want to follow, which is patently not true, so it should detect
  // and prevent following when the new click is not on the same word
  if (popup.style.display == "none") event.preventDefault();

  // place the popup just under the clicked item
  const width = parseInt(popup.style.width, 10);
  if (event.pageX < (width / 2)) {
    popup.style.left = '0px';
  } else {
    popup.style.left = (event.pageX - (width / 2)) + 'px';
  }

  popup.style.top = (event.pageY + 20) + 'px';
  popup.style.display = "block";
  popup.innerHTML = '';
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

  fetchPlus(baseUrl + 'user_event/', fetchInfo, DEFAULT_RETRIES);
  console.log(eventType);
  console.log(eventData);

}

function toggleSentenceVisible(event, pop) {
  if (pop.style.display == "block") {
    pop.style.display = "none";
  } else {
    pop.style.display = "block";

    submitUserEvent('bc_sentence_lookup',
      {
        target_word: event.target.parentElement.dataset.word,
        target_sentence: event.target.parentElement.dataset.sentCleaned
      }
    );
  }

  event.stopPropagation();
}

function populatePopup(event, popup, token) {
  initPopup(event, popup);

  submitUserEvent('bc_word_lookup',
    {
      target_word: JSON.parse(event.target.parentElement.dataset.tcrobeEntry).word,
      target_sentence: event.target.parentElement.parentElement.dataset.sentCleaned
    }
  );

  const defHeader = doCreateElement('div', 'tcrobe-def-header', null, [["style", tcrobeDefHeader]], popup)
  defHeader.appendChild(doCreateElement('div', 'tcrobe-def-pinyin', token['pinyin'].join(""), [['style', tcrobeDefPinyin]]));
  defHeader.appendChild(doCreateElement('div', 'tcrobe-def-best', !!(token['best_guess']) ? token['best_guess']['normalizedTarget'].split(",")[0].split(";")[0] : '', [['style', tcrobeDefBest]]));

  const sentButton = doCreateElement('div', 'tcrobe-def-sentbutton', null, [["style", tcrobeDefSentbutton]], defHeader);
  const sent = event.target.closest('.tcrobe-sent');
  sentButton.dataset.sentCleaned = sent.dataset.sentCleaned;

  sentButton.dataset.word = token['word'];

  const sentTrans = sent.dataset.sentTrans;
  const popupExtras = doCreateElement('div', 'tcrobe-def-extras', null, null, popup);
  const popupSentence = doCreateElement('div', 'tcrobe-def-sentence', sentTrans, null, popupExtras);
  popupExtras.style.display = 'none';
  const popupMessages = doCreateElement('div', 'tcrobe-def-messages', null, null, popup);
  popupMessages.style.display = 'none';

  doCreateElement('img', 'tcrobe-def-sentbutton-img', null, [["src", chrome.runtime.getURL('/img/plus.png')]], sentButton)
    .addEventListener("click", (event) => { toggleSentenceVisible(event, popupExtras); });

  const popupContainer = doCreateElement('div', 'tcrobe-def-container', null, [['style', tcrobeDefContainer]], popup);
  printInfos(token['stats'], popupContainer);
  printSynonyms(token['synonyms'], popupContainer);
  popupDefinitions(token, popupContainer);
}

function enrichElement(element, data, pops) {
  const sents = doCreateElement('span', 'tcrobe-sents', null, null);
  for (var sindex in data['sentences']) {
    const s = data['sentences'][sindex];
    const sent = doCreateElement('span', 'tcrobe-sent', null, null);
    sent.dataset.sentCleaned = s['cleaned'];
    sent.dataset.sentTrans = s['translation'];
    for (var tindex in s['tokens']) {
      const t = s['tokens'][tindex];
      const w = t['word'];
      if ('ankrobes_entry' in t) {
        const entry = doCreateElement('span', 'tcrobe-entry', null, [['style', tcrobeEntry]]);
        entry.dataset.tcrobeEntry = JSON.stringify(t);
        const popie = doCreateElement('span', 'tcrobe-def-popup', null, [['style', tcrobeDefPopup]]);
        entry.appendChild(popie);
        entry.addEventListener("click", function (event) { populatePopup(event, pops, t); });
        entry.appendChild(doCreateElement('span', 'tcrobe-word', t['word'], null));
        if (!(t['ankrobes_entry']) || !(t['ankrobes_entry'].length) || t['ankrobes_entry'][0]['Is_Known'] == 0) {
          let gloss = null;
          if (glossing == USER_STATS_MODE_L1) {
            gloss = t['best_guess']['normalizedTarget'].split(",")[0].split(";")[0];
          } else if (glossing == USER_STATS_MODE_TRANSLITERATION) {
            gloss = t['pinyin'].join("");
          } else if (glossing == USER_STATS_MODE_L2_SIMPLIFIED) {
            if (('user_synonyms' in t) && (t['user_synonyms'].length > 0)) {
              gloss = t['user_synonyms'][0];
            } else {
              gloss = t['best_guess']['normalizedTarget'].split(",")[0].split(";")[0];
            }
          }
          if (gloss) {
            const defin = doCreateElement('span', 'tcrobe-def', '(' + gloss + ')', null);
            defin.dataset.tcrobeDef = gloss;
            // was previously defin.dataset.tcrobeDef = t['best_guess']['normalizedTarget'].split(",")[0].split(";")[0];
            defin.dataset.tcrobeDefId = t['word'];
            entry.appendChild(defin);
          }
          unknown_words++;
          console.log("Document contains " + known_words + " and " + unknown_words + ", or "
            + (known_words / (known_words + unknown_words)) * 100 + '% known');
        } else {
          known_words++;
          console.log("Document contains " + known_words + " and " + unknown_words + ", or "
            + (known_words / (known_words + unknown_words)) * 100 + '% known');
        };
        sent.appendChild(entry);
      } else {
        sent.appendChild(document.createTextNode(!(toEnrich(w)) ? " " + w : w));
      }
      sents.appendChild(sent);
    }
    element.replaceWith(sents);
  }
}

function enrichDocument() {
  textNodes(document.body).forEach(function (el) {
    if (!toEnrich(el.nodeValue)) {
      console.log("Not enriching: " + el.nodeValue);
      return;
    }
    observer.observe(el.parentElement);
  });

  document.addEventListener('click', () => {
    popups = document.getElementsByClassName("tcrobe-def-popup");  // why are there more than one again? ¯_(ツ)_/¯
    for (var i = 0; i < popups.length; i++) {
      popups[i].style.display = "none";
    }
  });
}

function refreshTokenAndRun(callback, canRunCallback) {
  if (!(canRunCallback())) {
    alert('Please refresh the page before attempting this action again');
    return;  // TODO: offer to reload from here
  }
  chrome.storage.local.get({
    username: '',
    password: '',
    baseUrl: '',
    glossing: ''
  }, function (items) {
    baseUrl = items.baseUrl + (items.baseUrl.endsWith('/') ? '' : '/');
    glossing = items.glossing;
    const fetchInfo = {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ username: items.username, password: items.password }),
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
    };

    fetch(baseUrl + 'api/token/', fetchInfo)
      .then(res => {
        if (res.ok)
          return res.json();

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
          fromLang = parseJwt(authToken)['lang_pair'].split(':')[0];
          callback();
        }
      }).catch((err) => {
        console.log(err);
        apiUnavailable("Make sure the server name is correct, or try again later");
      });
  });
}

chrome.runtime.onMessage.addListener(request => {
  refreshTokenAndRun(enrichDocument, () => !(authToken));
  return Promise.resolve({ response: "Sending response" });
});
