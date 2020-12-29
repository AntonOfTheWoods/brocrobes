
// Saves options to chrome.storage
function save_options() {
  username = document.getElementById("username").value;
  password = document.getElementById("password").value;
  baseUrl = document.getElementById("base-url").value;
  baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  glossing = document.getElementById("glossing").value;

  chrome.storage.local.set({
    username: username,
    password: password,
    baseUrl: baseUrl,
    glossing: glossing
  }, function() {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);

    fetchWithNewToken().then( (data) => {
      console.log(authToken);
      console.log(fromLang);
      console.log(storeVersions);
      if (!(authToken)) {
        onError('something bad happened');
      } else {
        initDB();
      }
    });
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
