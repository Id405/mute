// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.
const math = require('mathjs');
const { remote } = require("electron");
const Store = require('electron-store');
const fs = require('fs');
const path = require('path');
const Combokeys = require("combokeys");
const { e } = require('mathjs');
var combokeys = new Combokeys(document);
require('combokeys/plugins/global-bind')(combokeys);

const hotkeys = new remote.Menu();

window.addEventListener("DOMContentLoaded", () => {
  const minimizeButton = document.getElementById("minimize-btn");
  const maxUnmaxButton = document.getElementById("max-unmax-btn");
  const closeButton = document.getElementById("close-btn");

  minimizeButton.addEventListener("click", e => {
    window.minimizeWindow();
  });

  maxUnmaxButton.addEventListener("click", e => {
    const icon = maxUnmaxButton.querySelector("i.far");

    window.maxUnmaxWindow();
  });

  closeButton.addEventListener("click", e => {
    window.closeWindow();
  });

  const expressionElement = document.getElementById("expression");
  const answer = document.getElementById("answer");
  const cmd = document.getElementById("cmd");

  expressionElement.addEventListener("input", expressionListener);
  cmd.addEventListener("keydown", commandListener);

  combokeys.bindGlobal(['command+e', 'ctrl+e'], () => {document.getElementById("cmd").focus()});
  combokeys.bindGlobal(['command+d', 'ctrl+d'], () => {document.getElementById("expression").focus()});
  combokeys.bindGlobal(['command+s', 'ctrl+s'], () => {runCmd(["save"])});
  combokeys.bindGlobal(['command+o', 'ctrl+o'], () => {runCmd(["open"])});
});

const store = new Store();
var currentFile = "";
var fileSaved = false;

function save(t) {
  let filename = currentFile.toString();

  if (t.length == 1 && filename === "") {
    filename = remote.dialog.showSaveDialogSync(remote.getCurrentWindow(), {
      filters: [
        { name: 'Plain Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
  } else if(filename === "") {
    filename = t[1];
  }

  filename = path.resolve(filename);
  filename = path.normalize(filename);

  let doc = document.getElementById("expression").value;
  if (typeof doc !== 'undefined') {
    fs.writeFileSync(filename, doc);
    currentFile = filename;
    fileSaved = true;
    updateTitleBar()
  }
}

function open(t) {
  let filename = "";

  if (t.length == 1) {
    filename = remote.dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      filters: [
        { name: 'Plain Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if(typeof(filename) === undefined) {
      return
    }

    filename = filename[0].toString();
  } else {
    filename = path.resolve(t[1].replace(/['"]+/g, '')); //Regex strips double quotes
  }

  filename = path.resolve(filename);
  filename = path.normalize(filename).toString();

  let expr = document.getElementById("expression");
  text = Buffer.from(fs.readFileSync(filename)).toString('utf-8');
  expr.value = text;

  currentFile = filename;
  fileSaved = true;
  updateTitleBar()
}

function commandListener(e) {
  if (e.keyCode === 13) {
    const cmd = document.getElementById("cmd").value;
    let command = cmd.split(/ +(?=(?:(?:[^"]*"){2})*[^"]*$)/g); //Regex splits by spaces except for those in quotes
    runCmd(command);
  }
}

function runCmd(command) {
  commands = {
    "set": {
      f: function (t) { store.set(t[1], t[2]) },
      h: "Set Config Property"
    },
    "save": {
      f: save,
      h: "Save File"
    },
    "open": {
      f: open,
      h: "Open File"
    }
  }

  for (key in commands) {
    if (command[0] == key) {
      commands[key].f(command);
      documentEval();
    }
  }

  cmd.value = "";
}

function updateTitleBar() {
  let titlebar = document.getElementById("menu-bar");
  let menubarPath = document.getElementById("menubar-path");

  menubarPath.innerText = currentFile;

  if(!fileSaved && currentFile != "") {
    menubarPath.innerText = "*" + menubarPath.innerText; //The most important information of a path is on the right, so the paths text is overflowed on the left. To achievee this the text direction is set to rtl which messes with appending in js for some reason?
  }
}

function expressionEvaluate(text) {
  text = text.split("\n", -1);

  let result = [];
  let scope = {};

  for (let i = 0; i < text.length; i++) {
    let n = ""

    try {
      let r = math.evaluate(text[i], scope);
      let precision = 4;

      if (typeof store.get("precision") !== 'undefined') {
        precision = store.get("precision");
      }

      if (typeof scope.precision !== 'undefined') {
        precision = scope.precision;
      }

      n = math.format(r, Math.round(precision));
    }
    catch (error) {
      n = "Syntax Error"
    }
    if (n !== "undefined") {
      result[i] = n;
    } else {
      result[i] = "";
    }
  }

  return result.join("<br>");
}

function algebraEvaluate(text) {
  text = text.split("\n", -1);

  keywords = {
    'solve': 'solve',
    '#': 'solve',
    
    'equation': 'eq',
    'eq': 'eq',
    '!': 'eq',

    'simplify': 'simp',
    'simp': 'simp',
    '@': 'simp',

    'expression': 'exp',
    'exp': 'exp',

    'derive': 'derive',
    'der': 'derive',
    '\\': 'derive',
  }

  result = []
  parsed = []
  scope = {}

  for (let i = 0; i < text.length; i++) {
    let line = text[i];
    let r = "";

    if(line == "") {
      continue;
    }

    let keyword = 'exp'
    for(let key in keywords) {
      if(line.startsWith(key)) {
        keyword = keywords[key];
        line = line.slice(key.length);
        line = line.trim();
        break;
      }
    }

    try {
      if(keyword == "exp") {
        r = math.evaluate(line, scope)
      } else if (keyword == "eq") {

      } else if (keyword == "simp") {
        r = math.simplify(line, scope)
      } else if (keyword == "solve") {

      } else if (keyword == "derive") {
        variable = line.split(' ')[0];
        line = line.split(' ').slice(1).join(' ');

        r = math.derivative(line, variable);
      }
    } catch(e) {
      console.log(e);
      r = "Syntax Error";
    }

    if(r !== "undefined") {
      let precision = 4;

      if (typeof store.get("precision") !== 'undefined') {
        precision = store.get("precision");
      }

      if (typeof scope.precision !== 'undefined') {
        precision = scope.precision;
      }

      r = math.format(r, Math.round(precision));
      
      result[i] = r;
    } else {
      result[i] = "";
    }
  }

  return result.join("<br>");
}

function documentEval() {
  let expressionElement = document.getElementById("expression");
  let answer = document.getElementById("answer");

  updateTitleBar();
  expressionElement.rows = expressionElement.value.split("\n").length + 1;

  //Todo set workspace using scope
  if(store.get("workspace").toLowerCase() == 'alg' || store.get("workspace").toLowerCase() == 'algebra' || store.get("workspace").toLowerCase() == 'algebruh') { //TODO secret algebruh workspace that has seperate functionality
    answer.innerHTML = algebraEvaluate(expressionElement.value);
  } else {
    answer.innerHTML = expressionEvaluate(expressionElement.value);
  }
}

function expressionListener() {
  fileSaved = false;

  documentEval();

}

expressionListener();