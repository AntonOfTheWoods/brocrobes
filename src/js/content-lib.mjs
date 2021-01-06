import * as utils from './lib.mjs';

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

let platformHelper;
function setPlatformHelper(value) { platformHelper = value }

var currentPoppedUpElement = null;

function addOrUpdateNote(event, definitions, token, source, addNew) {
  const note = { "Simplified": token['lemma'], "Pinyin": token['pinyin'].join("") };

  let meaning = '';
  const sourceDef = definitions[source];

  for (const pos in sourceDef) {
    meaning += " (" + pos + "). ";
    const means = []
    for (const entry of sourceDef[pos]) {
      means.push(entry['nt']);
    }
    meaning += means.join(', ');
  }
  note['Meaning'] = meaning;
  const previousImg = event.target.src;
  event.target.src = platformHelper.getURL('/img/load.gif');

  const userEvent = {
    type: addNew ? 'add_note_chromecrobes' : 'set_word_known',
    data: {
      note: note,
    }, };

  platformHelper.sendMessage({message: { type: "submitUserEvent", val: userEvent } }, (response) => {
    const msg = document.getElementsByClassName('tcrobe-def-messages')[0];
    msg.style.display = "block";
    msg.innerHTML = "Update submitted";
    setTimeout(() => { msg.style.display = "none"; event.target.src = previousImg }, 3000);
    cleanupAfterNoteUpdate(addNew, note.Simplified);
    // console.log(response);
  });
  event.stopPropagation();
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

function popupDefinitions(wordInfo, token, popupContainer, allNotes) {
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
      // add add note button
      doCreateElement('img', "tcrobe-def-plus", null, [["src", platformHelper.getURL('/img/plus.png')],
        ['style', 'display: inline; width:32px; height:32px; padding:3px;']], defSourceIcons).addEventListener("click",
          (event) => addOrUpdateNote(event, wordInfo.def.defs, token, fixedSource, true)  // FIXME: defSet was token, and this won't work
        );
    }
    // add update note button
    doCreateElement('img', "tcrobe-def-good", null, [["src", platformHelper.getURL('/img/good.png')],
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

function initPopup(event) {
  // We clicked on the same element twice, it's probably a link, so we shouldn't try and do any more
  // In any case, we close the popup
  if (currentPoppedUpElement == event.target.parentElement) {
    currentPoppedUpElement = null;
    return null;
  }
  // clear any existing popups
  document.querySelectorAll(".tcrobe-def-popup").forEach(el => el.remove());

  currentPoppedUpElement = event.target.parentElement;

  const popup = doCreateElement('span', 'tcrobe-def-popup', null, [['style', tcrobeDefPopup]], document.body);
  popup.attributes.id = 'dapopsicle';

  event.stopPropagation();
  event.preventDefault();

  // place the popup just under the clicked item
  const width = parseInt(popup.style.width, 10);
  if (event.pageX < (width / 2)) {
    popup.style.left = '0px';
  } else {
    popup.style.left = (event.pageX - (width / 2)) + 'px';
  }
  popup.style.top = (event.pageY + 20) + 'px';
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
        target_sentence: event.target.parentElement.dataset.sentCleaned,
      },
      userStatsMode: utils.glossing,
    };
    platformHelper.sendMessage({message: { type: "submitUserEvent", val: userEvent } }, (response) => {
      console.log(response);
    });
  }

  event.stopPropagation();
}

function populatePopup(event, token, allNotes) {
  const popup = initPopup(event);
  if (!(popup)) return;  // closing the popup, we don't want to trace the event further

  const userEvent = {
    type: 'bc_word_lookup',
    data: {
      target_word: JSON.parse(event.target.parentElement.dataset.tcrobeEntry).lemma,
      target_sentence: event.target.parentElement.parentElement.dataset.sentCleaned,
    },
    userStatsMode: utils.glossing };
  platformHelper.sendMessage({message: { type: "submitUserEvent", val: userEvent } }, (response) => {
    console.log(response);
  });

  platformHelper.sendMessage({message: { type: "getWordFromDBs", val: token['lemma'] } }, (response) => {
    let wordInfo = utils.localDBsToWordInfo(response.message);

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

    doCreateElement('img', 'tcrobe-def-sentbutton-img', null, [["src", platformHelper.getURL('/img/plus.png')]], sentButton)
      .addEventListener("click", (event) => { toggleSentenceVisible(event, popupExtras); });

    const popupContainer = doCreateElement('div', 'tcrobe-def-container', null, [['style', tcrobeDefContainer]], popup);
    printInfos(wordInfo.metas, popupContainer);
    printSynonyms(wordInfo.def.syns[token.np], popupContainer);
    popupDefinitions(wordInfo, token, popupContainer, allNotes);
  });
}

function updateWordForEntry(entry, glossing, tokenData, knownNotes, allNotes) {
  var token = tokenData || JSON.parse(entry.dataset.tcrobeEntry);
  let glossElement = entry.querySelector('.tcrobe-def');

  entry.appendChild(doCreateElement('span', 'tcrobe-word', token['lemma'], null));
  entry.addEventListener("click", (event) => { populatePopup(event, token, allNotes); });

  if (!(knownNotes.includes(token['lemma']))) {
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


export {
  // variables and constants
  tcrobeEntry,

  // property setters
  setPlatformHelper,

  // functions
  updateWordForEntry,
  doCreateElement,
}
