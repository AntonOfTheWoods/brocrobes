
import * as utils from './lib.mjs';

// var utils = require('./lib.mjs');

function onError(error) {
  console.error(`Error: ${error}`);
}

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
      }, function (items) {
        baseUrl = items.baseUrl + (items.baseUrl.endsWith('/') ? '' : '/');
        glossing = items.glossing;
        username = items.username;
        password = items.password;

        fetchWithNewToken().then(() => {
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
        // console.log(values);
        sendResponse({message: values});
      });
    } else if (request.message.type === "submitUserEvent") {
      utils.submitUserEvent(request.message).then((something) => {
        console.log(request.message);
        sendResponse({message: 'Event submitted'});
      });
    }
    return true;
  }
);
