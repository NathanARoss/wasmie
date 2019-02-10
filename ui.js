"use strict";

//temporary code to remove old databases for anyone who visited while the old format was used
indexedDB.deleteDatabase("TouchScript-project-list");
for (let i = 0; i < 256; ++i) {
  indexedDB.deleteDatabase("TouchScript-" + i)
}

const lineHeight = 40;
const bufferCount = 10;
const forwardBufferCount = 4;
let loadedCount = 0;
let firstLoadedPosition = 0;

const editor = document.getElementById("editor");
const menu = document.getElementById("menu");
const menuButton = document.getElementById("menu-button");
const createButton = document.getElementById("new-button");
const loadButton = document.getElementById("load-button");
const viewCodeButton = document.getElementById("view-code-button");
const downloadButton = document.getElementById("download-button");
const fabMenu = document.getElementById("FAB-menu");
const runtime = document.getElementById("runtime");
const consoleOutput = document.getElementById("console-output");
const programList = document.getElementById("program-list");

editor.style.height = "10000000px";
firstLoadedPosition = Math.max(0, Math.floor(window.scrollY / lineHeight) - bufferCount);

const itemPool = [];
let selectedItem;
let selRow = -1;
let selCol = -1;

const ACTIVE_PROJECT_KEY = "TouchScript-active-project-id";
let script;
const runtimeEnvironment = new RuntimeEnvironment();

function getWasmBinary() {
  try {
    return script.getWasm();
  } catch (error) {
    console.error(error);
    print(error);
  }
}

function closeFAB() {
  fabMenu.classList.remove("expanded");
  menuButton.toggled = false;
}

menuButton.addEventListener("click", function(event) {
  event.stopPropagation();

  if (menuButton.toggled) {
    history.pushState({action: "run"}, "TouchScript Runtime");
    window.onpopstate();
  }

  fabMenu.classList.toggle("expanded");
  menuButton.toggled = !menuButton.toggled;
});

createButton.addEventListener("click", function(event) {
  event.stopPropagation();
  closeFAB();
  
  localStorage.removeItem(ACTIVE_PROJECT_KEY);
  dbAction("readonly", "date-created", createNewScript);
  closeMenu();
});

loadButton.addEventListener("click", function(event) {
  event.stopPropagation();
  closeFAB();

  history.pushState({action: "load"}, "TouchScript Project Manager");
  window.onpopstate();
});

viewCodeButton.addEventListener("click", function(event) {
  event.stopPropagation();
  closeFAB();

  history.pushState({action: "disassemble"}, "TouchScript Disassembly");
  window.onpopstate();
});

downloadButton.addEventListener("click", function(event) {
  event.stopPropagation();
  
  fabMenu.classList.remove("expanded");
  menuButton.toggled = false;

  function save(filename) {
    const wasm = getWasmBinary();
    if (wasm !== undefined) {
      var a = document.createElement('a');
      a.href = window.URL.createObjectURL(new File([wasm], filename));
      a.download = filename;
    
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  
      window.URL.revokeObjectURL(a.href);
    }
  }

  dbAction("readonly", "name", function(id) {
    const request = this.get(id);
    request.onsuccess = (event) => {
      if (event.target.result) {
        save(event.target.result + ".wasm");
      } else {
        save("Project " + id + ".wasm");
      }
    };
    request.onerror = (event) => {
      console.log("Error getting project name: ", event.target.error);
      save("temp.wasm")
    };
  }, [script.id]);
});

menu.childNodes[1].onclick = function() {
  document.onkeydown({key: "Enter", preventDefault: () => {}});
};

menu.childNodes[2].onclick = function() {
  document.onkeydown({key: "Backspace", preventDefault: () => {}});
};

menu.childNodes[2].oncontextmenu = function(event) {
  document.onkeydown({key: "Delete", preventDefault: () => {}});

  event.preventDefault();
  event.stopPropagation();
};

document.body.onresize = function () {
  const newLoadedCount = Math.ceil(window.innerHeight / lineHeight) + bufferCount;
  const diff = newLoadedCount - loadedCount;
  if (diff === 0) {
    return;
  }

  for (let i = 0; i < diff; ++i) {
    const newLine = createLine();
    editor.insertBefore(newLine, editor.firstChild);
  }
  
  for (let i = diff; i < 0; ++i) {
    const toRemove = editor.firstChild;

    while (toRemove.childNodes.length > 2) {
      itemPool.push(toRemove.removeChild(toRemove.lastChild));
    }

    editor.removeChild(editor.firstChild);
  }

  loadedCount = newLoadedCount;
  reloadAllLines();
  
  //allow the viewport to scroll past the currently loaded lines
  editor.style.height = getLineCount() * lineHeight + "px";
};



window.onpopstate = function(event) {
  if (!event) {
    event = {state: history.state};
  }
  
  editor.style.display = "none";
  runtime.style.display = "none";
  programList.style.display = "none";
  
  if (!event.state) {
    document.title = "TouchScript"
    
    while (programList.childNodes.length > 1) {
      programList.removeChild(programList.lastChild);
    }

    consoleOutput.innerHTML = "";
    editor.style.display = "";
  }
  else if (event.state.action === "run") {
    document.title = "TouchScript Runtime";

    const wasm = getWasmBinary();

    if (wasm !== undefined) {
      try {
        WebAssembly.instantiate(wasm, runtimeEnvironment)
      } catch (error) {
        print(error);
      }
    }
    
    runtime.style.display = "";
  }
  else if (event.state.action === "disassemble") {
    document.title = "TouchScript Disassembly";
    const wasm = getWasmBinary();
    if (wasm !== undefined) {
      import("https://nathanross.me/small-wasm-disassembler/disassembler.min.mjs")
      .then(module => {
        print(module.default(wasm, 9))
      });
    }
    runtime.style.display = "";
  }
  else if (event.state.action === "load") {
    document.title = "TouchScript Project Manager"

    function getDateString(date) {
      return date.toLocaleDateString("en-US", {
        year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "2-digit"
      });
    }

    //read all the project metadata into RAM before building the DOM
    const projectNames = new Map();
    const projectLastModified = new Map();
    const projectDateCreated = new Map();

    function assembleProjectMetaData() {
      for (const [id, dateCreated] of projectDateCreated.entries()) {
        const label = document.createElement("span");
        label.textContent = "Project name: ";

        const projectNameNode = document.createElement("input");
        projectNameNode.type = "text";
        if (projectNames.has(id)) {
          projectNameNode.value = projectNames.get(id);
        } else {
          projectNameNode.placeholder = "Project " + id;
        }
        projectNameNode.addEventListener("change", renameProject);

        const dateCreatedNode = document.createElement("p");
        dateCreatedNode.textContent = "Created: " + getDateString(dateCreated);

        const lastModified = projectLastModified.get(id);
        const lastModifiedNode = document.createElement("p");
        lastModifiedNode.textContent = "Last Modified: " + getDateString(lastModified);

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete delete-project-button";
        deleteButton.addEventListener("click", deleteProject);

        const entry = document.createElement("div");
        entry.className = "project-list-entry";
        entry.appendChild(deleteButton);
        entry.appendChild(label);
        entry.appendChild(projectNameNode);
        entry.appendChild(dateCreatedNode);
        entry.appendChild(lastModifiedNode);
        entry.addEventListener("click", selectProject);

        if (script.id === id) {
          entry.classList.add("open");
        }

        entry.projectId = id;
        programList.appendChild(entry);
      }
    }

    let remaining = 3;
    function readKeysAndVals(map) {
      this.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
          map.set(cursor.primaryKey, cursor.value);
          cursor.continue();
        } else {
          if (--remaining === 0) {
            assembleProjectMetaData()
          }
        }
      }
    }

    dbAction("readonly", "name", readKeysAndVals, [projectNames]);
    dbAction("readonly", "last-modified", readKeysAndVals, [projectLastModified]);
    dbAction("readonly", "date-created", readKeysAndVals, [projectDateCreated]);

    programList.style.display = "";
  }
}

function scriptLoaded() {
  document.body.onresize();
  window.onpopstate();
  reloadAllLines();

  //detect when items need to be loaded in the direction of scroll
  //take nodes from the back to add to the front
  window.onscroll = function() {
    const firstVisiblePosition = Math.floor(window.scrollY / lineHeight);
    
    //keep a number of lines prepared for both direction
    while ((firstVisiblePosition - bufferCount + forwardBufferCount > firstLoadedPosition)
    && (firstLoadedPosition + loadedCount < getLineCount())) {
      const position = firstLoadedPosition + loadedCount;
      const line = editor.childNodes[position % loadedCount];
      loadLine(position, line);
      ++firstLoadedPosition;
    }
    
    while ((firstVisiblePosition - forwardBufferCount < firstLoadedPosition)
    && (firstLoadedPosition > 0)) {
      const position = firstLoadedPosition - 1;
      const line = editor.childNodes[position % loadedCount];
      loadLine(position, line);
      --firstLoadedPosition;
    }
  };
}


function selectProject(event) {
  if (event.target.nodeName !== "BUTTON" && event.target.nodeName !== "INPUT") {
    const projectID = event.currentTarget.projectId;
    const oldActiveProject = localStorage.getItem(ACTIVE_PROJECT_KEY)|0;
    if (projectID !== oldActiveProject) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, projectID);
      script = new Script(projectID, true);
    }
    closeMenu();
    window.history.back();
  }
}

function deleteProject(event) {
  const entry = this.parentElement;
  const id = entry.projectId;

  if (script.id === id) {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    dbAction("readonly", "date-created", createNewScript);
    closeMenu();
  }
  entry.parentElement.removeChild(entry);
  
  dbAction("readwrite", "name", IDBObjectStore.prototype.delete, [id]);
  dbAction("readwrite", "date-created", IDBObjectStore.prototype.delete, [id]);
  dbAction("readwrite", "last-modified", IDBObjectStore.prototype.delete, [id]);
  //performDBAction("readwrite", "save-data", IDBObjectStore.prototype.delete, [id]);

  const range = getLineKeyRangeForProject(id);
  dbAction("readwrite", "lines", IDBObjectStore.prototype.delete, [range]);
}

function renameProject(event) {
  const id = this.parentElement.projectId;
  const name = this.value;
  dbAction("readwrite", "name", IDBObjectStore.prototype.put, [name, id]);
}


function getLineCount() {
  return script.lineCount + loadedCount - bufferCount - 2;
}



function createLine() {
  const append = document.createElement("button");
  append.className = "append";
  append.position = -1;

  const indentation = document.createElement("div");
  indentation.classList.add("indentation");
  
  const lineDiv = document.createElement("div");
  lineDiv.addEventListener("click", lineClickHandler, {passive: true});
  lineDiv.appendChild(indentation);
  lineDiv.appendChild(append);
  
  return lineDiv;
}




function insertLine(position) {
  editor.style.height = getLineCount() * lineHeight + "px";

  if (position < firstLoadedPosition + loadedCount) {
    const selectedIndex = position % loadedCount;
    const selectedLine = editor.childNodes[selectedIndex];

    const lastLineIndex = (firstLoadedPosition + loadedCount - 1) % loadedCount;
    const lastLine = editor.childNodes[lastLineIndex];

    editor.insertBefore(lastLine, selectedLine);
    loadLine(position, lastLine, -1);

    //if the bottom line must go up past the beginning of the array and back around to the
    //end to the new position, then a line must wrap around in the opposite direction
    //to prevent the remaining lines from having an index one too high
    if (lastLineIndex < selectedIndex) {
      editor.insertBefore(editor.childNodes[loadedCount - 1], editor.firstChild);
    }

    //shift existing lines downward
    for (let i = position + 1; i < loadedCount + firstLoadedPosition; ++i) {
      const line = editor.childNodes[i % loadedCount];
      line.position = i;
      line.childNodes[1].textContent = i;
    }
  }
}

function removeLines(position, count) {
  const selectedIndex = position % loadedCount;
  const lastLineIndex = (firstLoadedPosition + loadedCount - 1) % loadedCount;
  const moveLastToTop = lastLineIndex < selectedIndex;
  const bottomPosition = firstLoadedPosition + loadedCount - count;
  
  for (let i = 0; i < count; ++i) {
    const selectedLine = editor.childNodes[selectedIndex];
    const lastLine = editor.childNodes[lastLineIndex];

    editor.insertBefore(selectedLine, lastLine.nextSibling);

    if (moveLastToTop) {
      editor.insertBefore(editor.firstChild, editor.childNodes[loadedCount]);
    }

    const newPosition = bottomPosition + i;
    loadLine(newPosition, selectedLine);
  }

  //shift the remaining lines down
  for (let i = position; i < bottomPosition; ++i) {
    const line = editor.childNodes[i % loadedCount];    
    line.position = i;
    line.style.setProperty("--y", 1);
    line.childNodes[1].textContent = i;
  }

  editor.style.height = getLineCount() * lineHeight + "px";
}



function loadLine(position, line, visualShift = 0) {
  while (line.childNodes.length > 2) {
    itemPool.push(line.removeChild(line.lastChild));
  }

  if (position >= script.lineCount) {
    line.style.removeProperty("--x");
    line.classList.remove("half-x");
  } else {
    const itemCount = script.getItemCount(position);

    for (let col = 0; col < itemCount; ++col) {
      const [text, style] = script.getItem(position, col).getDisplay();
      const node = getItem(text, "item " + style, col);
      line.appendChild(node);
    }
    
    const indent = script.getIndent(position);
    if (indent > 0) {
      line.style.setProperty("--x", indent);
    } else {
      line.style.removeProperty("--x");
    }
    line.classList.toggle("half-x", script.isStartingScope(position));
  }

  if (line.position !== position) {
    line.style.transition = "none";
    const isShiftedDown = selRow !== -1 && position > selRow;
    line.style.setProperty("--y", position + visualShift + isShiftedDown|0);
    line.offsetHeight;
    line.style.transition = "";
    line.childNodes[1].textContent = position;
    line.position = position;
  
    if (selRow === position) {
      const button = line.childNodes[2 + selCol];
      button.classList.add("selected");
      line.scrollLeft = button.offsetLeft - window.innerWidth / 2;
    }
  }
}

function reloadAllLines() {
  editor.style.height = getLineCount() * lineHeight + "px";

  for (let i = 0; i < loadedCount; ++i) {
    const position = firstLoadedPosition + i;
    const line = editor.childNodes[position % loadedCount];
    loadLine(position, line);
  }
}



function getItem(text, className, position) {
  const node = itemPool.pop() || document.createElement("button");
  node.textContent = text;
  node.className = className;
  node.position = position;
  return node;
}



function configureMenu(options, prevRow = selRow, teleport = false) {
  while (menu.childNodes.length > 3) {
    const child = menu.lastChild;
    child.action = undefined;
    child.args = undefined;
    child.onclick = undefined;
    if (child.tagName === "BUTTON") {
      itemPool.push(child);
    }
    menu.removeChild(child);
  }

  for (const option of options) {
    let menuItem;
    if (option.isInput) {
      menuItem = document.createElement("input");
      menuItem.classList = "menu-input " + option.style;
      menuItem.value = option.text;
      menuItem.placeholder = option.hint;
      menuItem.onsubmit = () => {
        handleMenuItemResponse(option.onsubmit(menuItem.value, option.args || []));
      };
      menuItem.onfocus = closeFAB;
      menuItem.oninput = option.oninput;
      menuItem.onkeydown = (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          menuItem.onsubmit();
        }
      };
    } else {
      const {text, style = ""} = option;
      menuItem = getItem(text, "menu-item " + style);
      menuItem.onclick = function(event) {
        const response = option.action.apply(script, option.args || []);
    
        if (Array.isArray(response) && response.length > 0) {
          configureMenu(response);
        } else {
          handleMenuItemResponse(response);
        }
      };
    }
    
    menu.appendChild(menuItem);
  }

  //allow the script to indicate a currently chosen option
  const selectedIndex = options.findIndex(op => op.isSelected);
  if (selectedIndex !== -1) {
    menu.childNodes[selectedIndex + 3].focus();
  }

  //if teleport is requested, skip the smooth transition to the line's position
  if (teleport) {
    menu.style.transition = "none";

    const isShiftedUp = prevRow === -1 || selRow < prevRow;
    menu.style.setProperty("--y", selRow + 1 - isShiftedUp|0);
  
    menu.offsetHeight;
    menu.style.transition = "";
  }

  const insertPosition = selRow + (selCol !== 0 && selRow !== script.lineCount)|0;

  menu.classList.toggle("delete-button-shown", selRow < script.lineCount);
  menu.classList.toggle("insert-button-shown", script.canInsert(insertPosition));
  menu.style.setProperty("--y", selRow + 1);
  menu.style.setProperty("--x", script.getInsertIndent(selRow + 1));
  
  //make room for the menu to slot below the selected line
  if (prevRow === -1) {
    prevRow = selRow;
  }
  for (let i = Math.max(0, Math.min(selRow, prevRow) - 1); i < loadedCount + firstLoadedPosition; ++i) {
    const line = editor.childNodes[i % loadedCount];
    line.style.setProperty("--y", line.position + (line.position > selRow)|0);
  }
}

function closeMenu() {
  menu.style.setProperty("--y", selRow);
  menu.classList.remove("revealed");
  if (selRow !== -1) {
    for (let i = selRow; i < loadedCount + firstLoadedPosition; ++i) {
      const line = editor.childNodes[i % loadedCount];
      line.style.setProperty("--y", line.position);
    }
    selRow = -1;
  }

  editor.classList.remove("selected");
  if (selectedItem) {
    selectedItem.classList.remove("selected");
    selectedItem.blur();
    selectedItem = undefined;
  }

  fabMenu.classList.remove("expanded");
  menuButton.toggled = false;
}



document.onkeydown = function(event) {
  if (history.state) {
    //ignore keyboard commands unless the editor is open
    return;
  }

  if (event.key === "Escape") {
    closeMenu();
  }

  if (selRow !== -1) {
    if (event.key === "Delete") {
      const response = script.deleteLine(selRow);
      handleMenuItemResponse(response);
      itemClicked(selRow, -1);

      event.preventDefault();
    }

    if (event.key === "Backspace") {
      const response = script.deleteItem(selRow, selCol);
      response.moveUpwardIfLineRemoved = true;
      handleMenuItemResponse(response);
      event.preventDefault();
    }

    if (event.key === "Enter") {
      let response = {};
      if (selCol === 0 || selRow === script.lineCount) {
        ++selRow;
        response = script.insertLine(selRow - 1);
      } else {
        selCol = -1;
        ++selRow;
        response = script.insertLine(selRow);
      }
      
      if ("lineInserted" in response) {
        script.saveLines(response.lineInserted|0);
      }
      handleMenuItemResponse(response);
      itemClicked(selRow, selCol);
      event.preventDefault();
    }
  }
};

function handleMenuItemResponse(response) {
  // console.log("handle response:", ...Object.keys(response));
  if ("removeLinesPosition" in response) {
    const position = response.removeLinesPosition|0;
    const count = response.removeLinesCount|0;
    removeLines(position, count);
    selCol = -1;
  }

  if ("lineUpdated" in response) {
    loadLine(selRow, editor.childNodes[selRow % loadedCount]);
    editor.style.height = getLineCount() * lineHeight + "px";
  }

  if ("lineInserted" in response) {
    insertLine(response.lineInserted|0);
  }

  if ("selectedCol" in response) {
    selCol = response.selectedCol;
  }

  if ("scriptChanged" in response) {
    reloadAllLines();
    selCol = -1;
  }

  if (selCol >= script.getItemCount(selRow)) {
    selCol = -1;
  }

  if (selRow > 0 && response.removeLinesCount > 0 && response.moveUpwardIfLineRemoved) {
    selRow -= 1;
  }

  //move selected item into view
  const line = editor.childNodes[selRow % loadedCount];
  const item = line.childNodes[2 + selCol];
  const leftBound = item.offsetLeft - 40;
  const rightBound = leftBound + 80 + item.offsetWidth - editor.offsetWidth;
  line.scrollLeft = Math.max(Math.min(leftBound, line.scrollLeft), rightBound);

  itemClicked(selRow, selCol);
}

function lineClickHandler(event) {
  if (menuButton.toggled) {
    menuButton.toggled = false;
    fabMenu.classList.remove("expanded");
  } else if (event.target.nodeName === "BUTTON") {
    const row = this.position|0;
    const col = event.target.position|0;
    if (row === selRow && col === selCol) {
      closeMenu();
    } else {
      itemClicked(row, col, true);
      editor.classList.add("selected");
    }
  }
}

function itemClicked(row, col, teleport = false) {
  selectedItem && selectedItem.classList.remove("selected");

  selectedItem = editor.childNodes[row % loadedCount].childNodes[2 + col];
  if (selectedItem) {
    selectedItem.classList.add("selected");
    selectedItem.focus();
  }
  
  const prevRow = selRow;
  selRow = row;
  selCol = col;
  
  const options = script.itemClicked(row, col);
  configureMenu(options, prevRow, teleport);
}

function print(value) {
  if (consoleOutput.childNodes.length == 0 || consoleOutput.lastChild.nodeValue.length > 512) {
    const textNode = document.createTextNode(value);
    consoleOutput.appendChild(textNode);
  } else {
    consoleOutput.lastChild.nodeValue += value;
  }
}

let db;
{
  const openRequest = indexedDB.open("TouchScript", 1);
  openRequest.onerror = (event) => alert("Error opening database: " + event.message);
  openRequest.onupgradeneeded = function(event) {
    console.log("upgrading database");
    db = event.target.result;
    db.createObjectStore("name");
    db.createObjectStore("last-modified");
    db.createObjectStore("date-created");
    db.createObjectStore("lines");
    db.createObjectStore("save-data");
  };
  openRequest.onsuccess = function(event) {
    db = event.target.result;
    db.onerror = event => console.dir(event.target.error);

    const transaction = db.transaction("date-created", "readonly");
    const objStore = transaction.objectStore("date-created");

    const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY);
    if (activeProjectId !== null) {
      objStore.get(activeProjectId|0).onsuccess = function(event) {
        if (event.target.result !== undefined) {
          script = new Script(activeProjectId|0, true);
        } else {
          console.log("Project " + activeProjectId + " no longer exists");
          localStorage.removeItem(ACTIVE_PROJECT_KEY);
          createNewScript.apply(objStore);
        }
      }
    } else {
      createNewScript.apply(objStore);
    }
  };
}

/**
 * assumes the objectstore "date-created" is bound to this
 */
function createNewScript() {
  this.getAllKeys().onsuccess = function(event) {
    //find a gap in the IDs, or grab the one after last
    const projectIds = event.target.result;
    let id = projectIds.findIndex((id, index) => id !== index);
    if (id === -1) {
      id = projectIds.length;
    }
    //project IDs must fit within an unsigned byte because the first byte of every
    //line key is the project ID
    if (id > 255) {
      //load project 255 rather than creatng a new project
      script = new Script(255, true);
    } else {
      script = new Script(id, false);
    }
  };
}

function dbAction(mode, store, action, args) {
  const transaction = db.transaction(store, mode);
  const objStore = transaction.objectStore(store);
  action.apply(objStore, args);
}

/**
 * @param {Function} action callback that expects object store bound to this and optional arguments
 * @param {} args arguments that are passed to the callback
 */
function commitScriptEdit(id, action, ...args) {
  dbAction("readwrite", "last-modified", IDBObjectStore.prototype.put, [new Date(), id]);
  dbAction("readwrite", "lines", action, args);
}

function commitDateCreated(id) {
  localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  dbAction("readwrite", "date-created", IDBObjectStore.prototype.add, [new Date(), id]);
}

function getLineKeyRangeForProject(id) {
  return IDBKeyRange.bound(Uint8Array.of(id), Uint8Array.of(id + 1), false, true);
}