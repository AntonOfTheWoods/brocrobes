import * as utils from './lib.mjs';

// Saves options to chrome.storage
function save_options() {
  utils.setUsername(document.getElementById("username").value);
  utils.setPassword(document.getElementById("password").value);
  let baseUrl = document.getElementById("base-url").value;
  utils.setBaseUrl(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  utils.setGlossing(document.getElementById("glossing").value);

  chrome.storage.local.set({
    username: utils.username,
    password: utils.password,
    baseUrl: utils.baseUrl,
    glossing: utils.glossing
  }, () => {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);

    utils.fetchWithNewToken().then((data) => {
      console.log(utils.storeVersions);
      if (!(utils.authToken)) {
        status.textContent = 'There was an error starting the initial synchronisation. ' +
          'While this should sort itself our later, the first time you use Brocrobes it will ' +
          'likely take a few minutes, depending on your internet connection.';
        utils.onError('Something bad happened, couldnt get an authToken to start a syncDB()');
      } else {
        status.textContent = 'A synchronisation with the server has started. ' +
          'It may take a minute or two depending on your connection.';
        utils.syncDB();
      }
    });
  });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  chrome.storage.local.get({
    username: '',
    password: '',
    baseUrl: '',
    glossing: ''
  }, (items) => {
    document.getElementById('username').value = items.username;
    document.getElementById('password').value = items.password;
    document.getElementById('base-url').value = items.baseUrl;
    document.getElementById('glossing').value = items.glossing;
  });
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click',
  save_options);
