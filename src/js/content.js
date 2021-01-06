import * as utils from './lib.mjs';
import * as contentUtils from './content-lib.mjs';

let allNotes;
let knownNotes;

// mirror chrome.runtime, this will allow us to emulate the same thing in the normal web or other
// non-Chrome environments
class PlatformHelper { }
PlatformHelper.getURL = chrome.runtime.getURL;
PlatformHelper.sendMessage = chrome.runtime.sendMessage;
contentUtils.setPlatformHelper(PlatformHelper);

// the callback function that will be fired when the element apears in the viewport
function onEntry(entry) {
  entry.forEach((change) => {
    if (!change.isIntersecting) return;
    if (change.target.dataset && change.target.dataset.tced) return;

    change.target.childNodes.forEach((item) => {
      if (item.nodeType == 3) {
        utils.fetchPlus(utils.baseUrl + 'enrich/aenrich_json', { data: item.nodeValue, userStatsMode: utils.glossing },
          utils.DEFAULT_RETRIES)
          .then(data => {
            //enrichElement(item, data, pops);
            fillEntry(item, data, contentUtils.updateWordForEntry)
            change.target.dataset.tced = true;
          }).catch((err) => {
            console.log(err);
          });
      }
    });
  });
}

let observer = new IntersectionObserver(onEntry, { threshold: [0.9] });

function fillEntry(element, data, updateWordCallback) {
  const sents = contentUtils.doCreateElement('span', 'tcrobe-sents', null, null);
  for (var sindex in data) {
    const sentence = data[sindex];
    const sent = contentUtils.doCreateElement('span', 'tcrobe-sent', null, null);
    // FIXME: will need to put back "os" in if we really want this
    sent.dataset.sentCleaned = sentence['os'];

    sent.dataset.sentTrans = sentence['l1'];
    for (var tindex in sentence['tokens']) {
      const token = sentence['tokens'][tindex];
      const word = token['lemma'];
      if ('bg' in token) {  // if there is a Best Guess key (even if empty) then we might want to look it up
        const entry = contentUtils.doCreateElement('span', 'tcrobe-entry', null, [['style', contentUtils.tcrobeEntry]]);
        entry.dataset.tcrobeEntry = JSON.stringify(token);
        if (updateWordCallback) {
          updateWordCallback(entry, utils.glossing, token, knownNotes, allNotes);
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
