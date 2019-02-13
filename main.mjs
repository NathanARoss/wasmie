const editor = document.getElementById("editor");
const menu = document.getElementById("menu");
const menuButton = document.getElementById("menu-button");
const loadButton = document.getElementById("load-button");
const viewCodeButton = document.getElementById("view-code-button");
const fabMenu = document.getElementById("FAB-menu");
const runtime = document.getElementById("runtime");
const consoleOutput = document.getElementById("console-output");
const programList = document.getElementById("program-list");

//temporary code to remove old databases for anyone who visited while the old format was used
indexedDB.deleteDatabase("TouchScript-project-list");
for (let i = 0; i < 256; ++i) {
  indexedDB.deleteDatabase("TouchScript-" + i)
}

const lineHeight = 40;
const bufferCount = 10;
const forwardBufferCount = 4;
let loadedCount = 0;

editor.style.height = "10000000px";
let firstLoadedPosition = Math.max(0, Math.floor(window.scrollY / lineHeight) - bufferCount);
editor.style.height = "";

const itemPool = [];
let selectedItem;
let selRow = -1;
let selCol = -1;

const ACTIVE_PROJECT_KEY = "TouchScript-active-project-id";
let script;
// const runtimeEnvironment = new RuntimeEnvironment();

function print(value) {
    if (consoleOutput.childNodes.length == 0 || consoleOutput.lastChild.nodeValue.length > 512) {
      const textNode = document.createTextNode(value);
      consoleOutput.appendChild(textNode);
    } else {
      consoleOutput.lastChild.nodeValue += value;
    }
  }

const UTF8Decoder = new TextDecoder('utf-8');

let instance;
const imports = {
    env: {
        puts(ptr, size) {
            const ubytes = new Uint8Array(instance.exports.memory.buffer).subarray(ptr, ptr + size);
            const message = UTF8Decoder.decode(ubytes);
            print(message);
        },
        putc(char) {
            const message = String.fromCharCode(char);
            print(message);
        },
        putnum(value) {
            const message = String(value);
            print(message);
        },
        logputs(ptr, size) {
            const ubytes = new Uint8Array(instance.exports.memory.buffer).subarray(ptr, ptr + size);
            const message = UTF8Decoder.decode(ubytes);
            console.log(message);
        },
    }
};

fetch('backend.wasm')
.then(response => response.arrayBuffer())
.then(bytes => WebAssembly.instantiate(bytes, imports))
.then(results => {
    instance = results.instance;
    instance.exports.start();
});