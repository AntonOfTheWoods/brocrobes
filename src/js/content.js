import * as utils from './lib.mjs';

var currentPoppedUpElement = null;

let knownWordsCount = 0;
let unknownWordsCount = 0;
let allNotes;
let knownNotes;
var eventQueueTimer;

// the callback function that will be fired when the element apears in the viewport
function onEntry(entry) {
  entry.forEach((change) => {
    if (!change.isIntersecting) return;
    if (change.target.dataset && change.target.dataset.tced) return;

    change.target.childNodes.forEach(function(item) {
      if (item.nodeType == 3) {
        utils.fetchPlus(utils.baseUrl + 'enrich/aenrich_json', { data: item.nodeValue, userStatsMode: utils.glossing },
          utils.DEFAULT_RETRIES)
          .then(data => {
            //enrichElement(item, data, pops);
            fillEntry(item, data, updateWordForEntry)
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
const tcrobeDefPopup = 'all: initial; * { all: unset; box-sizing: border-box; } height: 400px; background-color: #555; color: #fff; text-align: center; border-radius: 6px; padding: 3px 0; position: absolute; z-index: 99999; top: 120%; right: 50%; margin-right: -80px; display: none; width: 350px;';
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

// there was a global one - was this just js imcompetence?
// const pops = doCreateElement('span', 'tcrobe-def-popup', null, [['style', tcrobeDefPopup]], document.body);
// pops.attributes.id = 'dapopsicle';

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

// moved to lib.mjs, so can happen from background.js
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

function addOrUpdateNote(event, definitions, token, source, addNew) {
  console.log(`in source ${source} adOr ${JSON.stringify(token)}`);
  // const apiVerb = addNew ? 'add_note_chromecrobes' : 'set_word_known';
  const note = { "Simplified": token['lemma'], "Pinyin": token['pinyin'].join("") };

  let meaning = '';
  const sourceDef = definitions[source];
  // console.log(`he definitions is ${JSON.stringify(definitions)}`);
  // console.log(`hde source is ${JSON.stringify(source)}`);

  for (const pos in sourceDef) {
    // console.log(`hde pos is ${JSON.stringify(pos)}`);
    meaning += " (" + pos + "). ";
    const means = []
    for (const entry of sourceDef[pos]) {
      // console.log(`hde entry is ${JSON.stringify(entry)}`);
      means.push(entry['nt']);
    }
    meaning += means.join(', ');
  }
  // console.log(`hde meaning is ${JSON.stringify(meaning)}`);
  note['Meaning'] = meaning;
  const previousImg = event.target.src;
  event.target.src = chrome.runtime.getURL('/img/load.gif');

  const userEvent = {
    type: addNew ? 'add_note_chromecrobes' : 'set_word_known',
    data: {
      note: note,
    }, };

  chrome.runtime.sendMessage({message: { type: "submitUserEvent", val: userEvent } }, (response) => {
    const msg = document.getElementsByClassName('tcrobe-def-messages')[0];
    msg.style.display = "block";
    msg.innerHTML = "Update submitted";
    setTimeout(() => { msg.style.display = "none"; event.target.src = previousImg }, 3000);
    cleanupAfterNoteUpdate(addNew, note.Simplified);
    console.log(response);
  });
  event.stopPropagation();
}

function popupDefinitions(wordInfo, token, popupContainer) {
  // console.log(`my wordInfo is ${JSON.stringify(wordInfo)}`);
  for (var source in wordInfo.def.defs) {
    const sources = wordInfo.def.defs[source];
    // this MUST be assigned to a const or something weird happens and the ref changes to the last item in the loop for all
    // addEventListener events
    const fixedSource = source;
    popupContainer.appendChild(doCreateElement('hr', 'tcrobe-def-hr', null, null));
    const defSource = doCreateElement('div', 'tcrobe-def-source', null, [['style', tcrobeDefSource]], popupContainer);
    const defSourceHeader = doCreateElement('div', 'tcrobe-def-source-header', null, [['style', tcrobeDefSourceHeader]], defSource);
    defSourceHeader.appendChild(doCreateElement('div', 'tcrobe-def-source-name', source, [['style', tcrobeDefSourceName]]));
    const defSourceIcons = doCreateElement('div', 'tcrobe-def-icons', null, [['style', tcrobeDefIcons]], defSourceHeader);

    if (!(allNotes.includes(wordInfo.def['w']))) {
    //if (!(token['ankrobes_entry']) || !(token['ankrobes_entry'].length)) {
      // add add note button
      doCreateElement('img', "tcrobe-def-plus", null, [["src", chrome.runtime.getURL('/img/plus.png')],
        ['style', 'display: inline; width:32px; height:32px; padding:3px;']], defSourceIcons).addEventListener("click",
          (event) => addOrUpdateNote(event, wordInfo.def.defs, token, fixedSource, true)  // FIXME: defSet was token, and this won't work
        );
    }
    // add update note button
    doCreateElement('img', "tcrobe-def-good", null, [["src", chrome.runtime.getURL('/img/good.png')],
      ['style', 'display: inline; width:32px; height:32px; padding:3px;']], defSourceIcons).addEventListener("click",
          (event) => addOrUpdateNote(event, wordInfo.def.defs, token, fixedSource, false)  // FIXME: defSet was token, and this won't work
      );

    for (var pos_def in sources) {
      const actual_defs = sources[pos_def];
      defSource.appendChild(doCreateElement('div', 'tcrobe-def-source-pos', pos_def, [['style', tcrobeDefSourcePos]]));
      const defSourcePosDefs = doCreateElement('div', 'tcrobe-def-source-pos-defs', null, [['style', tcrobeDefSourcePosDefs]], defSource);
      for (var def in actual_defs) {
        let sep = "";
        if (def > 0) { sep = ", "; }
        defSourcePosDefs.appendChild(doCreateElement('span', 'tcrobe-def-source-pos-def', sep + actual_defs[def]['nt'], null));
      }
    }
  }
}

function printInfos(metas, parentDiv) {
  const infoDiv = doCreateElement('div', 'tc-stats', null, [['style', tcrobeStats]], parentDiv);
  // FIXME: this is no longer generic, and will need rewriting... later
  for (const [meta, metaValue] of Object.entries(metas)) {
    doCreateElement('hr', null, null, null, infoDiv);
    if (!!(metaValue)) {
      const infoElem = doCreateElement('div', 'tc-' + meta + 's', null, null, infoDiv);
      doCreateElement('div', 'tc-' + meta, metaValue, null, infoElem);
    } else {
      doCreateElement('div', 'tc-' + meta, 'No ' + meta + ' found', null, infoDiv);
    }
  }
}

function printSynonyms(syns, parentDiv) {
  // TODO: maybe show that there are none?
  if (!(syns) || !(syns.length > 0)) { return; }

  const synonymsDiv = doCreateElement('div', 'tc-synonyms', null, [['style', tcrobeStats]], parentDiv);

  doCreateElement('hr', null, null, null, synonymsDiv);
  doCreateElement('div', 'tc-synonym-list', syns.join(', '), null, synonymsDiv);
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

function initPopup(event) {
  // clear any existing popups
  // const oldPopup = document.querySelectorAll(".tcrobe-def-popup");
  // if (oldPopup.length > 0 &&
  //   (oldPopup[0].parentElement == event.target.parentElement || oldPopup[0].parentElement.parentElement == event.target.parentElement)) {
  //   // We clicked on the same element twice, it's probably a link, so we shouldn't try and do any more
  //   return oldPopup;
  // }

  // We clicked on the same element twice, it's probably a link, so we shouldn't try and do any more
  if (currentPoppedUpElement == event.target.parentElement) {
    currentPoppedUpElement = null;
    return null;
    // return document.querySelectorAll(".tcrobe-def-popup")[0];
  }
  //console.log(event.target.parentElement.getBoundingClientRect());
  document.querySelectorAll(".tcrobe-def-popup").forEach(el => el.remove());

  currentPoppedUpElement = event.target.parentElement;

  //const popup = doCreateElement('span', 'tcrobe-def-popup', null, [['style', tcrobeDefPopup]], event.target);
  const popup = doCreateElement('span', 'tcrobe-def-popup', null, [['style', tcrobeDefPopup]], document.body);
  popup.attributes.id = 'dapopsicle';

  event.stopPropagation();
  // this allows to have the popup on links and if click again then the link will activate
  // FIXME: this should be more intelligent! Currently it considers that a click on *another*
  // link text also means you want to follow, which is patently not true, so it should detect
  // and prevent following only when the new click is not on the same word
  // FIXME: WAS
  // if (popup.style.display == "none") event.preventDefault();
  event.preventDefault();

  // place the popup just under the clicked item
  const width = parseInt(popup.style.width, 10);
  // console.log(`width is ${width}`);
  // console.log(`pageX is ${event.pageX}`);
  if (event.pageX < (width / 2)) {
    popup.style.left = '0px';
  } else {
    popup.style.left = (event.pageX - (width / 2)) + 'px';
  }
  popup.style.top = (event.pageY + 20) + 'px';

  // // place the popup just under the clicked item
  // popup.style.left = '0px';
  // //popup.style.top = '0px';
  // popup.style.top = event.target.parentElement.getBoundingClientRect().height + 'px';

  popup.style.display = "block";
  return popup
}

function toggleSentenceVisible(event, pop) {
  if (pop.style.display == "block") {
    pop.style.display = "none";
  } else {
    pop.style.display = "block";
    const userEvent = {
      type: 'bc_sentence_lookup',
      data: {
        target_word: event.target.parentElement.dataset.word,
        target_sentence: event.target.parentElement.dataset.sentCleaned
      },
      userStatsMode: utils.glossing
    };
    chrome.runtime.sendMessage({message: { type: "submitUserEvent", val: userEvent } }, (response) => {
      console.log(response);
    });
  }

  event.stopPropagation();
}

function localDBsToWordInfo(dbValues) {
  let wordInfo = {};
  wordInfo.metas = {};
  for (const dbInfo of dbValues) {
    if (dbInfo.db == utils.SUBTLEX_STORE) {
      let val = '';
      if (!!(dbInfo.val)) {
        let subt = dbInfo.val.v[0];
        val = `Freq: ${subt.wcpm} : ${subt.wcdp} : ${subt.pos} : ${subt.pos_freq}`;
      }
      wordInfo.metas[dbInfo.db] = val;
    } else if (dbInfo.db == utils.HSK_STORE) {
      let val = '';
      if (!!(dbInfo.val)) {
        val = `HSK: ${dbInfo.val.v[0].hsk}`;
      }
      wordInfo.metas[dbInfo.db] = val;
    } else if (dbInfo.db == utils.DEFINITION_STORE) {
      wordInfo.def = dbInfo.val;
    } else if (dbInfo.db == utils.NOTE_STORE) {
      wordInfo.not = dbInfo.val;
    }
  }
  return wordInfo;
}

function populatePopup(event, token) {
  const popup = initPopup(event);
  if (!(popup)) return;  // closing the popup, we don't want to trace the event further

  // const toto = JSON.parse(event.target.parentElement.dataset.tcrobeEntry).lemma;
  // const tata = event.target.parentElement.parentElement.dataset.sentCleaned;
  // console.log(`my toto ${toto}`);
  // console.log(`my tata ${tata}`);
  const userEvent = {
    type: 'bc_word_lookup',
    data: {
      target_word: JSON.parse(event.target.parentElement.dataset.tcrobeEntry).lemma,
      target_sentence: event.target.parentElement.parentElement.dataset.sentCleaned,
    },
    userStatsMode: utils.glossing };
  // console.log(`the event is ${JSON.stringify(userEvent)}`);
  chrome.runtime.sendMessage({message: { type: "submitUserEvent", val: userEvent } }, (response) => {
    console.log(response);
  });

  chrome.runtime.sendMessage({message: { type: "getWordFromDBs", val: token['lemma'] } }, (response) => {
    let wordInfo = localDBsToWordInfo(response.message);

    const defHeader = doCreateElement('div', 'tcrobe-def-header', null, [["style", tcrobeDefHeader]], popup)
    defHeader.appendChild(doCreateElement('div', 'tcrobe-def-pinyin', token['pinyin'].join(""), [['style', tcrobeDefPinyin]]));
    defHeader.appendChild(doCreateElement('div', 'tcrobe-def-best', !!(token['bg']) ? token['bg']['nt'].split(",")[0].split(";")[0] : '', [['style', tcrobeDefBest]]));

    const sentButton = doCreateElement('div', 'tcrobe-def-sentbutton', null, [["style", tcrobeDefSentbutton]], defHeader);
    const sent = event.target.closest('.tcrobe-sent');
    sentButton.dataset.sentCleaned = sent.dataset.sentCleaned;
    sentButton.dataset.word = token['lemma'];

    const sentTrans = sent.dataset.sentTrans;
    const popupExtras = doCreateElement('div', 'tcrobe-def-extras', null, null, popup);
    const popupSentence = doCreateElement('div', 'tcrobe-def-sentence', sentTrans, null, popupExtras);
    popupExtras.style.display = 'none';
    const popupMessages = doCreateElement('div', 'tcrobe-def-messages', null, null, popup);
    popupMessages.style.display = 'none';

    doCreateElement('img', 'tcrobe-def-sentbutton-img', null, [["src", chrome.runtime.getURL('/img/plus.png')]], sentButton)
      .addEventListener("click", (event) => { toggleSentenceVisible(event, popupExtras); });

    const popupContainer = doCreateElement('div', 'tcrobe-def-container', null, [['style', tcrobeDefContainer]], popup);
    printInfos(wordInfo.metas, popupContainer);
    // console.log(`da verd infos is ${JSON.stringify(wordInfo)}`);
    // console.log(`da token is ${JSON.stringify(token)}`);
    printSynonyms(wordInfo.def.syns[token.np], popupContainer);

    popupDefinitions(wordInfo, token, popupContainer);
  });
}

// function populatePopupOld(event, popup, token) {
//   initPopup(event, popup);
//   submitUserEvent(
//     { type: 'bc_word_lookup',
//       data: {
//         target_word: JSON.parse(event.target.parentElement.dataset.tcrobeEntry).word,
//         target_sentence: event.target.parentElement.parentElement.dataset.sentCleaned
//       },
//       userStatsMode: glossing });
//
//   chrome.runtime.sendMessage({message: { type: "getWordFromDBs", val: token['lemma'] } }, (response) => {
//     let wordInfo = localDBsToWordInfo(response.message);
//
//     const defHeader = doCreateElement('div', 'tcrobe-def-header', null, [["style", tcrobeDefHeader]], popup)
//     defHeader.appendChild(doCreateElement('div', 'tcrobe-def-pinyin', token['pinyin'].join(""), [['style', tcrobeDefPinyin]]));
//     defHeader.appendChild(doCreateElement('div', 'tcrobe-def-best', !!(token['bg']) ? token['bg']['nt'].split(",")[0].split(";")[0] : '', [['style', tcrobeDefBest]]));
//
//     const sentButton = doCreateElement('div', 'tcrobe-def-sentbutton', null, [["style", tcrobeDefSentbutton]], defHeader);
//     const sent = event.target.closest('.tcrobe-sent');
//     sentButton.dataset.sentCleaned = sent.dataset.sentCleaned;
//     sentButton.dataset.word = token['lemma'];
//
//     const sentTrans = sent.dataset.sentTrans;
//     const popupExtras = doCreateElement('div', 'tcrobe-def-extras', null, null, popup);
//     const popupSentence = doCreateElement('div', 'tcrobe-def-sentence', sentTrans, null, popupExtras);
//     popupExtras.style.display = 'none';
//     const popupMessages = doCreateElement('div', 'tcrobe-def-messages', null, null, popup);
//     popupMessages.style.display = 'none';
//
//     doCreateElement('img', 'tcrobe-def-sentbutton-img', null, [["src", chrome.runtime.getURL('/img/plus.png')]], sentButton)
//       .addEventListener("click", (event) => { toggleSentenceVisible(event, popupExtras); });
//
//     const popupContainer = doCreateElement('div', 'tcrobe-def-container', null, [['style', tcrobeDefContainer]], popup);
//     printInfos(wordInfo.metas, popupContainer);
//     // console.log(`da verd infos is ${JSON.stringify(wordInfo)}`);
//     // console.log(`da token is ${JSON.stringify(token)}`);
//     printSynonyms(wordInfo.def.syns[token.np], popupContainer);
//
//     popupDefinitions(wordInfo, token, popupContainer);
//   });
// }

function updateWordForEntry(entry, glossing, tokenData, knownNotes) {
  var token = tokenData || JSON.parse(entry.dataset.tcrobeEntry);
  let glossElement = entry.querySelector('.tcrobe-def');

  entry.appendChild(doCreateElement('span', 'tcrobe-word', token['lemma'], null));
  entry.addEventListener("click", (event) => { populatePopup(event, token); });

  if (!(knownNotes.includes(token['lemma']))) {
    // if (!(t['ankrobes_entry']) || !(t['ankrobes_entry'].length) || t['ankrobes_entry'][0]['Is_Known'] == 0) {
    let gloss = null;
    if (glossing == utils.USER_STATS_MODE.L1) {
      gloss = token['bg']['nt'].split(",")[0].split(";")[0];
    } else if (glossing == utils.USER_STATS_MODE.TRANSLITERATION) {
      gloss = token['pinyin'].join("");
    } else if (glossing == utils.USER_STATS_MODE.L2_SIMPLIFIED) {
      if (('us' in token) && (token['us'].length > 0)) {
        gloss = token['us'][0];
      } else {  //fall back to L1
        gloss = token['bg']['nt'].split(",")[0].split(";")[0];
      }
    }
    if (gloss) {
      if (!glossElement) {
        glossElement = doCreateElement('span', 'tcrobe-def', null, null);
        entry.appendChild(glossElement);
      }
      glossElement.textContent = '(' + gloss + ')';
      glossElement.dataset.tcrobeDef = gloss;
      glossElement.dataset.tcrobeDefId = token['lemma'];
    } else {
      if (glossElement) {
        entry.removeChild(glossElement);  // we don't want a supported gloss (even though we apparently don't know it)
      }
    }
  } else {
    if (glossElement) {
      entry.removeChild(glossElement);  // it's known, we don't want a gloss
    }
  }
}

function fillEntry(element, data, updateWordCallback) {
  const sents = doCreateElement('span', 'tcrobe-sents', null, null);
  for (var sindex in data) {
    const sentence = data[sindex];
    const sent = doCreateElement('span', 'tcrobe-sent', null, null);
    // FIXME: will need to put back "os" in if we really want this
    sent.dataset.sentCleaned = sentence['os'];

    sent.dataset.sentTrans = sentence['l1'];
    for (var tindex in sentence['tokens']) {
      const token = sentence['tokens'][tindex];
      const word = token['lemma'];
      if ('bg' in token) {  // if there is a Best Guess key (even if empty) then we might want to look it up
        const entry = doCreateElement('span', 'tcrobe-entry', null, [['style', tcrobeEntry]]);
        entry.dataset.tcrobeEntry = JSON.stringify(token);
        if (updateWordCallback) {
          updateWordCallback(entry, utils.glossing, token, knownNotes);
        }
        sent.appendChild(entry);
      } else {
        sent.appendChild(document.createTextNode(!(utils.toEnrich(word)) ? " " + word : word));
      }
      sents.appendChild(sent);
    }
  }
  element.replaceWith(sents);
}

// function enrichElement(element, data, pops) {
//   // FIXME:
//   // FIXME: make this NOT assign a gloss but rather to make sure the info is available and then go through all nodes
//   // FIXME: to do the adding  of the gloss AFTER all the information has been added.
//   // FIXME:
//   const sents = doCreateElement('span', 'tcrobe-sents', null, null);
//   for (var sindex in data) {
//     const sentence = data[sindex];
//     const sent = doCreateElement('span', 'tcrobe-sent', null, null);
//     // FIXME: will need to put back "os" in if we really want this
//     //sent.dataset.sentCleaned = s['os'];
//
//     sent.dataset.sentTrans = sentence['l1'];
//     for (var tindex in sentence['tokens']) {
//       const token = sentence['tokens'][tindex];
//       const word = token['lemma'];
//       if ('bg' in token) {  // if there is a Best Guess key (even if empty) then we might want to look it up
//         const entry = doCreateElement('span', 'tcrobe-entry', null, [['style', tcrobeEntry]]);
//         entry.dataset.tcrobeEntry = JSON.stringify(token);
//         const popie = doCreateElement('span', 'tcrobe-def-popup', null, [['style', tcrobeDefPopup]]);
//         entry.appendChild(popie);
//         entry.addEventListener("click", (event) => { populatePopup(event, pops, token); });
//         entry.appendChild(doCreateElement('span', 'tcrobe-word', word, null));
//
//         if (!(knownNotes.includes(token['lemma']))) {
//         // if (!(t['ankrobes_entry']) || !(t['ankrobes_entry'].length) || t['ankrobes_entry'][0]['Is_Known'] == 0) {
//           let gloss = null;
//           if (glossing == USER_STATS_MODE.L1) {
//             gloss = token['bg']['nt'].split(",")[0].split(";")[0];
//           } else if (glossing == USER_STATS_MODE.TRANSLITERATION) {
//             gloss = token['pinyin'].join("");
//           } else if (glossing == USER_STATS_MODE.L2_SIMPLIFIED) {
//             if (('us' in token) && (token['us'].length > 0)) {
//               gloss = token['us'][0];
//             } else {
//               gloss = token['bg']['nt'].split(",")[0].split(";")[0];
//             }
//           }
//           if (gloss) {
//             const defin = doCreateElement('span', 'tcrobe-def', '(' + gloss + ')', null);
//             defin.dataset.tcrobeDef = gloss;
//             // was previously defin.dataset.tcrobeDef = t['best_guess']['normalizedTarget'].split(",")[0].split(";")[0];
//             defin.dataset.tcrobeDefId = token['lemma'];
//             entry.appendChild(defin);
//           }
//           unknownWordsCount++;
//           console.log("Document contains " + knownWordsCount + " and " + unknownWordsCount + ", or "
//             + (knownWordsCount / (knownWordsCount + unknownWordsCount)) * 100 + '% known');
//         } else {
//           knownWordsCount++;
//           console.log("Document contains " + knownWordsCount + " and " + unknownWordsCount + ", or "
//             + (knownWordsCount / (knownWordsCount + unknownWordsCount)) * 100 + '% known');
//         };
//         sent.appendChild(entry);
//       } else {
//         sent.appendChild(document.createTextNode(!(toEnrich(word)) ? " " + word : word));
//       }
//       sents.appendChild(sent);
//     }
//     element.replaceWith(sents);
//   }
// }

function enrichDocument() {
  utils.textNodes(document.body).forEach((textNode) => {
    if (!utils.toEnrich(textNode.nodeValue)) {
      console.log("Not enriching: " + textNode.nodeValue);
      return;
    }
    observer.observe(textNode.parentElement);
  });

  document.addEventListener('click', () => {
    document.querySelectorAll(".tcrobe-def-popup").forEach(el => el.remove());
    // WAS, the above might not work...
    // popups = document.getElementsByClassName("tcrobe-def-popup");  // why are there more than one again? ¯_(ツ)_/¯
    // for (var i = 0; i < popups.length; i++) {
    //   popups[i].style.display = "none";
    // }
  });
}

chrome.runtime.onMessage.addListener(request => {
   chrome.runtime.sendMessage({message: { type: "syncDB", val: '' } }, (response) => {
    console.log(response.message);
  });

  if (!!(utils.authToken)) {
    alert('Please refresh the page before attempting this action again');
    return;  // TODO: offer to reload from here
  }
  // FIXME: Actually we should probably wait for the the note_db sync in the syncDB above
  // - otherwise this call might return an incomplete list, and we may gloss words we shouldn't
  chrome.runtime.sendMessage({message: { type: 'getNoteWords', val: '' } }, (response) => {
    knownNotes = response.message[0];
    allNotes = response.message[1];

    chrome.storage.local.get({
      username: '',
      password: '',
      baseUrl: '',
      glossing: ''
    }, function (items) {

      utils.setUsername(items.username);
      utils.setPassword(items.password);
      utils.setBaseUrl(items.baseUrl + (items.baseUrl.endsWith('/') ? '' : '/'));
      utils.setGlossing(items.glossing);

      utils.fetchWithNewToken().then( () => {
        if (!(utils.authToken)) {
          alert('Something is wrong, we could not authenticate. '+
            'Please refresh the page before attempting this action again');
          return;  // TODO: offer to reload from here
        } else {
          enrichDocument();
        }
      });
      return Promise.resolve({ response: 'Running enrich' });
    });
  });
});
