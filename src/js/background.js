import * as utils from './lib.mjs';

function onError(error) {
  console.error(`Error: ${error}`);
}

var eventQueueTimer = setInterval(utils.sendUserEvents, utils.EVENT_QUEUE_PROCESS_FREQ);

chrome.browserAction.onClicked.addListener(function(){
  console.log('onClicked.addListener being executed');
  chrome.tabs.query({active : true, lastFocusedWindow : true}, function (tabs) {
    var CurrTab = tabs[0];
    chrome.tabs.sendMessage(CurrTab.id, 'run');
  })
})

chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {
    if (request.message.type === "syncDB") {
      console.log('Starting a background sync');
      chrome.storage.local.get({
        username: '',
        password: '',
        baseUrl: '',
        glossing: ''
      }, (items) => {

        utils.setUsername(items.username);
        utils.setPassword(items.password);
        utils.setBaseUrl(items.baseUrl + (items.baseUrl.endsWith('/') ? '' : '/'));
        utils.setGlossing(items.glossing);

        utils.fetchWithNewToken().then(() => {
          utils.syncDB();
        });
        sendResponse({message: "launched a sync"});
      });
    } else if (request.message.type === "getWordFromDBs") {
      utils.getWordFromDBs(request.message.val).then((values) => {
        sendResponse({message: values});
      });
    } else if (request.message.type === "getNoteWords") {
      utils.getNoteWords().then((values) => {
        sendResponse({message: values});
      });
    } else if (request.message.type === "submitUserEvent") {
      utils.submitUserEvent(request.message.val).then((something) => {
        console.log(request.message);
        sendResponse({message: 'Event submitted'});
      });
    }
    return true;
  }
);
