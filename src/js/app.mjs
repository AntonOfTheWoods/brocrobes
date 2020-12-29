const express = require('express')
const app = express()
const port = 3000

// https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker/whatToShow
// Cross-browser polyfill for these constants, stolen from:
// https://gist.github.com/radum/d67ffdd595a6c6daf7d125619fa4b9c4
global.NodeFilter = {
  // Constants for acceptNode()
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,

  // Constants for whatToShow
  SHOW_ALL: 0xFFFFFFFF,
  SHOW_ELEMENT: 0x1,
  SHOW_ATTRIBUTE: 0x2, // historical
  SHOW_TEXT: 0x4,
  SHOW_CDATA_SECTION: 0x8, // historical
  SHOW_ENTITY_REFERENCE: 0x10, // historical
  SHOW_ENTITY: 0x20, // historical
  SHOW_PROCESSING_INSTRUCTION: 0x40,
  SHOW_COMMENT: 0x80,
  SHOW_DOCUMENT: 0x100,
  SHOW_DOCUMENT_TYPE: 0x200,
  SHOW_DOCUMENT_FRAGMENT: 0x400,
  SHOW_NOTATION: 0x800 // historical
};


const fileUpload = require('express-fileupload');
app.use(fileUpload());

const jsdom = require("jsdom");
const { JSDOM } = jsdom;

global.fetch = require("node-fetch");

var lib = require('./lib');
app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.post('/', async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }
  const { window } = new JSDOM(req.files.data.data.toString('utf8'));

  global.window = window;
  global.document = window.document;
  var items = {
    username: req.body.username,
    password: req.body.password,
    baseUrl: req.body.baseUrl,
    glossing: -1  // don't log stats
  };
  res.send(await lib.syncRunAndReturnHTMLasString(items));
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
