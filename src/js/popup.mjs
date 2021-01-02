
let known_words = 0;
let unknown_words = 0;

var utils = require('./lib.mjs');

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


function initPage(rootElement) {
  var popsloc = doCreateElement('span', 'tcrobe-def-popup', null, [['style', tcrobeDefPopup]],
    rootElement);
  popsloc.attributes.id = 'dapopsicle';
  return popsloc
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

function enrichElement(element, data, pops, fromLang) {
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
          if (glossing == utils.USER_STATS_MODE.L1) {
            gloss = t['best_guess']['normalizedTarget'].split(",")[0].split(";")[0];
          } else if (glossing == utils.USER_STATS_MODE.TRANSLITERATION) {
            gloss = t['pinyin'].join("");
          } else if (glossing == utils.USER_STATS_MODE.L2_SIMPLIFIED) {
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
        } else {
          known_words++;
        };
        if ((known_words + unknown_words) % 20 == 0) {
          console.log("Document contains " + known_words + " and " + unknown_words + ", or "
            + (known_words / (known_words + unknown_words)) * 100 + '% known');
        }
        sent.appendChild(entry);
      } else {
        sent.appendChild(document.createTextNode(!(utils.toEnrich(w, fromLang)) ? " " + w : w));
      }
      sents.appendChild(sent);
    }
    element.replaceWith(sents);
  }
}

module.exports = {
  enrichElement,
  initPage
}
