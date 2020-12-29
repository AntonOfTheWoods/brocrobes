

import runInit from "./backgroundData.mjs";
import * as utils from "./utils.mjs";

// Saves options to chrome.storage
function save_options() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const baseUrl = document.getElementById("base-url").value;
  const glossing = document.getElementById("glossing").value;

  chrome.storage.local.set({
    username: username,
    password: password,
    baseUrl: baseUrl,
    glossing: glossing
  }, function() {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);
    runInit();
  });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  // Use default value color = 'red' and likesColor = true.
  chrome.storage.local.get({
    username: '',
    password: '',
    baseUrl: '',
    glossing: ''
  }, function(items) {
    document.getElementById('username').value = items.username;
    document.getElementById('password').value = items.password;
    document.getElementById('base-url').value = items.baseUrl;
    document.getElementById('glossing').value = items.glossing;
  });
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click',
    save_options);
