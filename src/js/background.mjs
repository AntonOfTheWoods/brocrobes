'use strict';

function onError(error) {
  console.error(`Error: ${error}`);
}

chrome.browserAction.onClicked.addListener(function(){
  console.log('addListener being executed');
  chrome.tabs.query({active : true, lastFocusedWindow : true}, function (tabs) {
    var CurrTab = tabs[0];
    chrome.tabs.sendMessage(CurrTab.id, 'run');
  })
})

