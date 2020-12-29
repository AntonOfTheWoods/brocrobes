
const USER_STATS_MODE = {
  IGNORE: -1,
  UNMODIFIED: 0,
  NO_GLOSS: 2,  // wo
  L2_SIMPLIFIED: 4,
  TRANSLITERATION: 6,
  L1: 8  // English
}

// const USER_STATS_MODE_IGNORE = -1
// const USER_STATS_MODE_UNMODIFIED = 0
// const USER_STATS_MODE_NO_GLOSS = 2  // word-segmented
// const USER_STATS_MODE_L2_SIMPLIFIED = 4  // Simpler synonym, not yet implemented
// const USER_STATS_MODE_TRANSLITERATION = 6  // Pinyin
// const USER_STATS_MODE_L1 = 8  // English

const DEFAULT_RETRIES = 3;

const oldfetchPlus = (url, options = {}, retries) =>
  fetch(url, options)
    .then(res => {
      if (res.ok) {
        return res.json();
      }
      if (res.status == 401) {
        const fetchInfo = {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({ refresh: refreshToken }),
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
        };
        fetch(baseUrl + 'api/token/refresh/', fetchInfo)
          .then(res => {
            if (res.ok) {
              return res.json();
            }
            throw new Error(res.status);
          })
          .then(data => {
            if (data.access) {
              authToken = data.access;
              options.headers.Authorization = "Bearer " + authToken;
              return fetchPlus(url, options, retries - 1);
            }
          }).catch((err) => {
            console.log(err);
          });
      }

      if (retries > 0) {
        return fetchPlus(url, options, retries - 1)
      }
      throw new Error(res.status)
    })
    .catch(error => console.error(error.message));

async function tokensFromCredentials(items) {
  baseUrl = items.baseUrl + (items.baseUrl.endsWith('/') ? '' : '/');
  glossing = items.glossing;
  const fetchInfo = {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ username: items.username, password: items.password }),
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
  };
  return await fetch(baseUrl + 'api/token/', fetchInfo)
    .then(res => {
      if (res.ok)
        return res.json();

      message = "Unable to get tokens for credentials";
      console.log(message);
      throw message;
    })
    .then(data => {
      return {
        access: data.access,
        refresh: data.refresh,
        baseUrl: baseUrl,
        glossing: glossing
      };

    }).catch((err) => {
      console.log(err);
      throw "Unable to get tokens for credentials";
    });
}

function toEnrich(charstr, fromLang) {
  // TODO: find out why the results are different if these consts are global...
  const zhReg = /[\u4e00-\u9fa5]+/gi;
  const enReg = /[[A-z]+/gi;

  switch (fromLang) {
    case 'en':
      return enReg.test(charstr);
    case 'zh-Hans':
      return zhReg.test(charstr);
    default:
      return false;
  }
};

// Helper functions
function parseJwt (token) {
    // TODO: this will apparently not do unicode properly. For the moment we don't care.
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
};

function textNodes(node) {
  return walkNodeTree(node, {
    inspect: n => !['STYLE', 'SCRIPT'].includes(n.nodeName),
    collect: n => (n.nodeType === 3) && n.nodeValue && n.nodeValue.match(/\S/),
    //callback: n => console.log(n.nodeName, n),
  });
}

function walkNodeTree(root, options) {
  options = options || {};
  const inspect = options.inspect || (n => true),
    collect = options.collect || (n => true);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ALL,
    {
      acceptNode: function (node) {
        if (!inspect(node)) { return NodeFilter.FILTER_REJECT; }
        if (!collect(node)) { return NodeFilter.FILTER_SKIP; }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodes = []; let n;
  while (n = walker.nextNode()) {
    options.callback && options.callback(n);
    nodes.push(n);
  }

  return nodes;
}

function onError(e) {
    console.error(e);
};

function fetchWithNewToken(url, options = {}, retries) {
  console.log('starting fetchWithNewToken');
  const fetchInfo = {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ username: items.username, password: items.password }),
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
  };
  return fetch(baseUrl + 'api/token/', fetchInfo)
    .then(res => {
      if (res.ok) {
        return res.json();
      }
      throw new Error(res.status);
    })
    .then(data => {
      if (data.access) {
        authToken = data.access;
        refreshToken = data.refresh;
        let tokenValues = parseJwt(authToken)
        console.log(tokenValues)
        const fromLang = tokenValues['lang_pair'].split(':')[0];
        const maxDates = tokenValues['db_versions'];

        if (Object.keys(options).length === 0 && options.constructor === Object) {
          // we just wanted to get the token
          return Promise.resolve({
            authToken: data.access,
            refreshToken: data.refresh,
            fromLang: fromLang,
            maxDates: maxDates
          });
        } else {
          options.headers.Authorization = "Bearer " + authToken;
          return fetchPlus(url, options, retries - 1);
        }
      }
    }).catch((err) => {
      console.log(err);
    });
}

function fetchPlus(url, options = {}, retries) {
  return fetch(url, options)
    .then(res => {
      if (res.ok) {
        return res.json()
      }
      if (res.status == 401) {
        return fetchWithNewToken(url, options, retries);
      }

      if (retries > 0) {
        return fetchPlus(url, options, retries - 1)
      }

      if (res.status == 401)
        apiUnavailable("Please make sure your username and password are correct");
      else
        apiUnavailable("Please make sure you have the latest browser extension, or try again later");

      throw new Error(res.status)
    })
    .catch(error => console.error(error.message));
}
/*
export {
  DEFAULT_RETRIES,
  tokensFromCredentials,
  fetchPlus,
  toEnrich,
  parseJwt,
  onError,
  textNodes,
  USER_STATS_MODE,
  fetchWithNewToken
}
*/
