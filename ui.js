"use strict";

const rowHeight = 40;
const bufferCount = 10;
const forwardBufferCount = 4;
let loadedCount = 0;
let firstLoadedPosition = 0;

const list = document.getElementById("list");
const debug = document.getElementById("debug");
const editor = document.getElementById("editor_div");
const menu = document.getElementById("menu");
const menuButton = document.getElementById("menu-button");
const createButton = document.getElementById("new-button");
const loadButton = document.getElementById("load-button");
const viewCodeButton = document.getElementById("view-code-button");
const fabMenu = document.getElementById("FAB-menu");
const runtime = document.getElementById("runtime");
const consoleOutput = document.getElementById("console-output");
const programList = document.getElementById("program-list");

let itemPool = [];

const ACTIVE_PROJECT_KEY = "TouchScript-active-project-id";
let script = new Script();

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

  fabMenu.classList.remove("expanded");
  menuButton.toggled = false;
  
  localStorage.removeItem(ACTIVE_PROJECT_KEY);
  script = new Script();
  reloadAllRows();
  closeMenu();
});

loadButton.addEventListener("click", function(event) {
  event.stopPropagation();

  fabMenu.classList.remove("expanded");
  menuButton.toggled = false;

  history.pushState({action: "load"}, "TouchScript Project Manager");
  window.onpopstate();
});

viewCodeButton.addEventListener("click", function(event) {
  event.stopPropagation();
  
  fabMenu.classList.remove("expanded");
  menuButton.toggled = false;

  history.pushState({action: "disassemble"}, "TouchScript Disassembly");
  window.onpopstate();
});

menu.addEventListener("touchstart", function(event) {
  if (this.touchId === undefined) {
    const touch = event.changedTouches[0];
    this.touchId = touch.identifier;
    this.touchStartX = touch.pageX;
    this.touchStartY = touch.pageY;
  }
});

menu.addEventListener("touchend", detectMenuCloseGesture);
menu.addEventListener("touchcancel", detectMenuCloseGesture);

function detectMenuCloseGesture(event) {
  for (const touch of event.changedTouches) {
    if (touch.identifier === this.touchId) {
      const travelX = touch.pageX - this.touchStartX;
      const travelY = touch.pageY - this.touchStartY;
  
      if (travelX > 50 && travelX > Math.abs(travelY)) {
        closeMenu();
      }

      this.touchId = undefined;
    }
  }
}



document.body.onresize = function () {
  let newLoadedCount = Math.ceil(window.innerHeight / rowHeight) + bufferCount;
  let diff = newLoadedCount - loadedCount;
  loadedCount = newLoadedCount;
  
  //allow the viewport to scroll past the currently loaded rows
  list.style.height = getRowCount() * rowHeight + "px";
  
  for(let i = 0; i < diff; ++i) {
    let div = createRow();
    let position = list.childNodes.length + firstLoadedPosition;
    loadRow(position, div);
    list.appendChild(div);
  }

  for (let i = diff; i < 0; ++i) {
    let lastChild = list.lastChild;
    list.removeChild(lastChild);

    let innerRow = lastChild.childNodes[1];
  
    while (innerRow.childNodes.length > 2) {
      itemPool.push(innerRow.lastChild);
      innerRow.removeChild(innerRow.lastChild);
    }
  }
};
document.body.onresize();



//detect when items need to be loaded in the direction of scroll, take nodes from the back to add to the front
window.onscroll = function() {
  let firstVisiblePosition = Math.floor(window.scrollY / rowHeight);
  
  //keep a number of rows prepared for both direction
  while ((firstVisiblePosition - bufferCount + forwardBufferCount > firstLoadedPosition) && (firstLoadedPosition + loadedCount < getRowCount())) {
    const position = firstLoadedPosition + loadedCount;
    const outerDiv = list.childNodes[position % loadedCount];
    loadRow(position, outerDiv);
    ++firstLoadedPosition;
  }
  
  while ((firstVisiblePosition - forwardBufferCount < firstLoadedPosition) && (firstLoadedPosition > 0)) {
    const position = firstLoadedPosition - 1;
    const outerDiv = list.childNodes[position % loadedCount];
    loadRow(position, outerDiv);
    --firstLoadedPosition;
  }
  
  list.childNodes.forEach(touchCanceled);

  debug.textContent = `[${firstLoadedPosition}, ${(firstLoadedPosition + loadedCount - 1)}]`;
};
window.onscroll();

window.onpopstate = function(event) {
  if (!event) {
    event = {state: history.state};
  }
  
  editor.style.display = "none";
  runtime.style.display = "none";
  programList.style.display = "none";

  if (!event.state) {
    editor.style.display = "";

    while (programList.childNodes.length > 1) {
      programList.removeChild(programList.lastChild);
    }

    consoleOutput.innerHTML = "";
    document.title = "TouchScript"
  }
  else if (event.state.action === "run") {
    let wasm;
    try {
      wasm = script.getWasm();
    } catch (error) {
      console.log(error);
      history.back();
      return;
    }

    const environment = new RuntimeEnvironment();
    try {
      WebAssembly.instantiate(wasm, environment)
    } catch (error) {
      console.log(error);
      history.back();
      return;
    }
    
    runtime.style.display = "";
    document.title = "TouchScript Runtime"
  }
  else if (event.state.action === "disassemble") {
    let wasmBinary;
    try {
      wasmBinary = script.getWasm();
    } catch (error) {
      console.log(error);
      history.back();
      return;
    }

    const wasm = new Uint8Array(wasmBinary);
    let offset = 0;
    const maxOffsetDigits = Math.ceil(Math.log2(wasm.length) / Math.log2(10));

    function printDisassembly(count, comment = "") {      
      const addressNode = document.createElement("span");
      addressNode.textContent = offset.toString().padStart(maxOffsetDigits) + ": ";
      addressNode.className = "wasm-byte-offset";
      consoleOutput.appendChild(addressNode);

      const slice = wasm.slice(offset, offset + count);
      offset += count;

      const byteNode = document.createElement("span");
      byteNode.textContent = Array.from(slice).map(num => num.toString(16).padStart(2, "0")).join(" ").padEnd(27);
      byteNode.className = "wasm-data";
      consoleOutput.appendChild(byteNode);

      const commentNode = document.createElement("span");
      commentNode.textContent = comment + "\n";
      commentNode.className = "wasm-comment";
      consoleOutput.appendChild(commentNode);
    }

    //reads and prints a whole string on the first line, remaining bytes spill into later lines
    function printEncodedString(count, beginComment = '"', endComment = '"') {
      const end = offset + count;
      
      const sanitizedString = escapeControlCodes(Wasm.UTF8toString(wasm.slice(offset, end)));
      printDisassembly(Math.min(8, count), beginComment + sanitizedString + endComment);

      while (offset < end) {
        const count = Math.min(8, end - begin);
        printDisassembly(count);
      }
    }

    function readVaruintAndPrint(beginComment = "", endComment = "") {
      const [val, bytesRead] = Wasm.decodeVaruint(wasm, offset);
      printDisassembly(bytesRead, beginComment + val + endComment);
      return val;
    }
    
    

    printEncodedString(4, 'Wasm magic number: "');
    printDisassembly(4, "Wasm version");

    while (offset < wasm.length) {
      print("\n");

      const sectionCode = wasm[offset];
      printDisassembly(1, "section " + Wasm.sectionNames[sectionCode] + " (" + sectionCode + ")");

      const payloadLength = readVaruintAndPrint("size: ", " bytes");
      const end = offset + payloadLength;

      let firstItemLabel = sectionCode === Wasm.section.Start ? "entry point func: " : "count: ";
      readVaruintAndPrint(firstItemLabel);

      while (offset < end) {
        switch (sectionCode) {
          case Wasm.section.Type: {
            printDisassembly(1, Wasm.typeNames[wasm[offset]]);
            
            for (let comment of ["params: ", "return: "]) {
              let [typeCount, bytesRead] = Wasm.decodeVaruint(wasm, offset);
              const bytesToRead = bytesRead + typeCount;
              
              while (bytesRead < bytesToRead) {
                const count = Math.min(8, bytesToRead - bytesRead);
                comment += Array.from(wasm.slice(offset + bytesRead, offset + bytesRead + count))
                           .map(type => Wasm.typeNames[type & 0x7F]).join(" ");
                bytesRead += count;
              }
              
              printDisassembly(bytesRead, comment);
            }
          } break;
          
          case Wasm.section.Import: {
            for (const description of ["module", "field"]) {
              const stringLength = readVaruintAndPrint(description + " name: ", " bytes");
              printEncodedString(stringLength);
            }

            const exportType = wasm[offset];
            printDisassembly(1, "external " + Wasm.externalKindNames[exportType]);

            if (exportType === Wasm.externalKind.Memory) {
              const maxPagesSpecifiedFlag = wasm[offset];
              printDisassembly(1, maxPagesSpecifiedFlag ? "allocation limit specified" : "no allocation limit");
              readVaruintAndPrint("initial allocation: ", " pages");

              if (maxPagesSpecifiedFlag) {
                readVaruintAndPrint("max allocation: ", " pages");
              }
            } else if (exportType === Wasm.externalKind.Function) {
              readVaruintAndPrint("signature: type index ");
            }
          } break;
          
          case Wasm.section.Function: {
            readVaruintAndPrint("signature: type index ");
          } break;

          case Wasm.section.Global: {
            printDisassembly(1, Wasm.typeNames[wasm[offset]]);
            printDisassembly(1, wasm[offset] ? "mutable" : "immutable");

            //the initial value is assumed to be an i32.const expression TODO should support other constant types
            const [val, bytesRead] = Wasm.decodeVarint(wasm, offset + 1);
            printDisassembly(1 + bytesRead, Wasm.opcodeData[wasm[offset]].name + " " + val);
            printDisassembly(1, Wasm.opcodeData[wasm[offset]].name);
          } break;
          
          case Wasm.section.Code: {
            consoleOutput.appendChild(document.createElement("br"));
            const bodySize = readVaruintAndPrint("func body size: ", " bytes");
            const subEnd = offset + bodySize;
            let [localCount, bytesRead] = Wasm.decodeVaruint(wasm, offset);
            let localVariableComment = "local vars:";
            
            for (let i = 0; i < localCount; ++i) {
              const [count] = Wasm.decodeVaruint(wasm, offset + bytesRead); //assumes no more than 127 locals specified at once
              ++bytesRead;
              localVariableComment += (" " + Wasm.typeNames[wasm[offset + bytesRead]]).repeat(count);
              ++bytesRead;
            }
            
            printDisassembly(bytesRead, localVariableComment);
            
            while (offset < subEnd) {
              const opcodeData = Wasm.opcodeData[wasm[offset]];
              let comment = opcodeData.name;
              let bytesRead = 1;
              
              for (const immediates of opcodeData.immediates) {
                const valsAndBytesRead = immediates(wasm, offset + bytesRead);
                for (let i = 0; i < valsAndBytesRead.length; i += 2) {
                  comment += " " + valsAndBytesRead[i];
                  bytesRead += valsAndBytesRead[i+1];
                }
              }
              
              printDisassembly(bytesRead, comment);
            }
          } break;

          case Wasm.section.Data: {
            readVaruintAndPrint("linear memory index: ");

            //the memory offset is assumed to be an i32.const expression
            const [val, bytesRead] = Wasm.decodeVarint(wasm, offset + 1);
            printDisassembly(1 + bytesRead, Wasm.opcodeData[wasm[offset]].name + " " + val);
            printDisassembly(1, Wasm.opcodeData[wasm[offset]].name);

            const dataSize = readVaruintAndPrint("size of data: ", " bytes");
            const subEnd = offset + dataSize;

            while (offset < subEnd) {
              const count = Math.min(8, subEnd - offset);
              const slice = wasm.slice(offset, offset + count);
              printDisassembly(count, escapeControlCodes(Wasm.UTF8toString(slice)));
            }
          } break;

          default:
            printDisassembly(1);
        }
      }

      //if for some reason a section is decoded using too many bytes, this resets the read position
      offset = end;
    }

    runtime.style.display = "";
    document.title = "TouchScript Disassembly"
  }
  else if (event.state.action === "load") {
    programList.style.display = "";
    document.title = "TouchScript Project Manager"

    performActionOnProjectListDatabase("readonly", function(objStore, transaction) {
      objStore.getAll().onsuccess = function(event) {
        for (const project of event.target.result) {
          const label = document.createElement("span");
          label.textContent = "Project name: ";

          const projectName = document.createElement("input");
          projectName.type = "text";
          projectName.value = project.name;
          projectName.addEventListener("change", renameProject);

          const dateCreated = document.createElement("p");
          dateCreated.textContent = "Created: " + getDateString(project.created);

          const dateLastModified = document.createElement("p");
          dateLastModified.textContent = "Last Modified: " + getDateString(project.lastModified);

          const deleteButton = document.createElement("button");
          deleteButton.className = "delete delete-project-button";
          deleteButton.addEventListener("click", deleteProject);

          const entry = document.createElement("div");
          entry.className = "project-list-entry";
          entry.appendChild(deleteButton);
          entry.appendChild(label);
          entry.appendChild(projectName);
          entry.appendChild(dateCreated);
          entry.appendChild(dateLastModified);
          entry.addEventListener("click", selectProject);

          if (script.projectID === project.id) {
            entry.classList.add("open");
          }

          entry.projectId = project.id;
          programList.appendChild(entry);
        }
      }
    });
  }
}

function scriptLoaded() {
  reloadAllRows();
  window.onpopstate();
}


function selectProject(event) {
  if (event.target.nodeName !== "BUTTON" && event.target.nodeName !== "INPUT") {
    const projectID = event.currentTarget.projectId;
    const oldActiveProject = localStorage.getItem(ACTIVE_PROJECT_KEY) | 0;
    if (projectID !== oldActiveProject) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, projectID);
      script = new Script();
      reloadAllRows();
    }
    closeMenu();
    window.history.back();
  }
}

function deleteProject(event) {
  const entry = this.parentElement;
  const id = entry.projectId;
  
  performActionOnProjectListDatabase("readwrite", function(objStore, transaction) {
    objStore.delete(id).onsuccess = function(event) {
      console.log("Successfully deleted project ID " + id);
      entry.parentElement.removeChild(entry);

      indexedDB.deleteDatabase("TouchScript-" + id);

      if (script.projectID === id) {
        localStorage.removeItem(ACTIVE_PROJECT_KEY);
        script = new Script();
        reloadAllRows();
        closeMenu();
      }
    }

    objStore.count().onsuccess = function(event) {
      if (event.target.result === 0) {
        window.history.back();
      }
    }
  });
}

function renameProject(event) {
  const id = this.parentElement.projectId;
  const newName = this.value;

  performActionOnProjectListDatabase("readwrite", function(objStore, transaction) {
    objStore.get(id).onsuccess = function(event) {
      let projectData = event.target.result;
      projectData.name = newName;

      objStore.put(projectData).onsuccess = function(event) {
        console.log("Successfully saved modified project ID " + id);
      }
    }
  });
}

function performActionOnProjectListDatabase(mode, action) {
  let openRequest = indexedDB.open("TouchScript-project-list", 1);
  
  openRequest.onerror = function(event) {
    alert("Failed to open project list database. Error code " + event.errorCode);
  };
  openRequest.onupgradeneeded = function(event) {
    console.log("upgrading project list database");
    let db = event.target.result;
    db.createObjectStore("project-list", {keyPath: "id"});
  };
  openRequest.onsuccess = function(event) {
    //console.log("Successfully opened project list database in " + mode + " mode");
    let db = event.target.result;

    db.onerror = function(event) {
      alert("Database error: " + event.target.errorCode);
    };

    let transaction = db.transaction("project-list", mode);
    let objStore = transaction.objectStore("project-list");
    action(objStore, transaction);
  };
}

function getDateString(date) {
  var options = {year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit"};
  return date.toLocaleDateString("en-US", options);
}


function getRowCount() {
  return script.getRowCount() + loadedCount - bufferCount - 2;
}



function createRow() {
  let lineNumberItem = document.createElement("p");
  lineNumberItem.className= "line-number-item slide-menu-item no-select";
  
  let newlineItem = document.createElement("p");
  newlineItem.className = "newline-item slide-menu-item";
  
  let deleteLineItem = document.createElement("p");
  deleteLineItem.className = "delete-line-item slide-menu-item";
  
  let slideMenu = document.createElement("div");
  slideMenu.className = "slide-menu slow-transition";
  slideMenu.appendChild(lineNumberItem);
  slideMenu.appendChild(newlineItem);
  slideMenu.appendChild(deleteLineItem);

  let append = document.createElement("button");
  append.className = "append";
  append.position = 0;

  let indentation = document.createElement("div");
  indentation.classList.add("indentation");
  
  let innerDiv = document.createElement("div");
  innerDiv.className = "inner-row";
  innerDiv.addEventListener("click", rowClickHandler, {passive: true});
  innerDiv.appendChild(indentation);
  innerDiv.appendChild(append);
  
  let outerDiv = document.createElement("div");
  outerDiv.className = "outer-row";
  outerDiv.appendChild(slideMenu);
  outerDiv.appendChild(innerDiv);
  
  outerDiv.addEventListener("touchstart", touchStartHandler, {passive: true});
  outerDiv.addEventListener("touchmove", existingTouchHandler, {passive: false});
  outerDiv.addEventListener("touchend", existingTouchHandler, {passive: true});
  outerDiv.addEventListener("touchcancel", existingTouchHandler, {passive: true});
  
  return outerDiv;
}




function insertRow(position, count = 1) {
  let firstEffectedRow = -1 & 0x7FFFFFFF;
  for (let i = 0; i < count; ++i) {
    firstEffectedRow = Math.min(firstEffectedRow, script.insertRow(position + i) & 0x7FFFFFFF);
  }
  
  if (firstEffectedRow !== -1 & 0x7FFFFFFF)
    refreshRows(firstEffectedRow, script.getRowCount());
}

function deleteRow(position) {
  const oldRowCount = script.getRowCount();
  const pos = script.deleteRow(position);
  refreshRows(pos, oldRowCount);
}

function refreshRows(pos, oldRowCount) {
  const start = Math.max(pos, firstLoadedPosition);
  const end = Math.min(oldRowCount, firstLoadedPosition + loadedCount);
  for (let position = start; position < end; ++position) {
    loadRow(position, list.childNodes[position % loadedCount]);
  }

  list.style.height = getRowCount() * rowHeight + "px";
}



function loadRow(position, outerDiv) {
  let innerRow = outerDiv.childNodes[1];
  
  while (innerRow.childNodes.length > 2) {
    itemPool.push(innerRow.lastChild);
    innerRow.removeChild(innerRow.lastChild);
  }

  if (position >= script.getRowCount()) {
    innerRow.style.setProperty("--indentation", 0);
    innerRow.classList.remove("starting-scope");
  } else {
    let itemCount = script.getItemCount(position);
    for (let col = 1; col < itemCount; ++col) {
      const [text, style] = script.getItemDisplay(position, col);
      
      let node = getItem(text, "item " + style, col);
      innerRow.appendChild(node);
    }
    
    const indentation = script.getIndentation(position);
    innerRow.style.setProperty("--indentation", indentation);

    if (script.isStartingScope(position)) {
      innerRow.classList.add("starting-scope");
    } else {
      innerRow.classList.remove("starting-scope");
    }
  }

  if (innerRow.position !== position) {
    outerDiv.style.transform = "translateY(" + Math.floor(position / loadedCount) * loadedCount * rowHeight + "px)";
    innerRow.position = position;
    innerRow.previousSibling.firstChild.textContent = String(position).padStart(4);

    let button = innerRow.childNodes[1 + menu.col];

    if (menu.row === position) {
      innerRow.scrollLeft = button.offsetLeft - window.innerWidth / 2;
    }
  }
}

function reloadAllRows() {
  list.style.height = getRowCount() * rowHeight + "px";

  for (const outerDiv of list.childNodes) {
    loadRow(outerDiv.childNodes[1].position, outerDiv);
  }
}



function getItem(text, className, position) {
  const node = itemPool.pop() || document.createElement("button");
  node.textContent = text;
  node.className = className;
  node.position = position;
  return node;
}



function configureMenu(options) {
  while (menu.hasChildNodes()) {
    itemPool.push(menu.lastChild);
    menu.removeChild(menu.lastChild);
  }

  for (const option of options) {
    let button = getItem(option.text, "menu-item no-select " + option.style, option.payload);
    menu.appendChild(button);
  }
}

function closeMenu() {
  menu.row = -1;
  document.body.classList.remove("selected");
  document.activeElement.blur();

  fabMenu.classList.remove("expanded");
  menuButton.toggled = false;
}

function menuItemClicked(payload) {
  const oldItemCount = menu.row < script.getRowCount() ? script.getItemCount(menu.row) : 1;
  let response = script.menuItemClicked(menu.row, menu.col, payload);

  if (Array.isArray(response) && response.length > 0) {
    configureMenu(response);
  } else {
    if ("rowUpdated" in response) {
      if (menu.row >= firstLoadedPosition && menu.row < firstLoadedPosition + loadedCount) {
        const outerDiv = list.childNodes[menu.row % loadedCount];
        loadRow(menu.row, outerDiv);
        if (menu.col === 0) {
          outerDiv.childNodes[1].scrollLeft = 1e10;
        }
        const selectedItem = list.childNodes[menu.row % loadedCount].childNodes[1].childNodes[1 + menu.col];
        if (selectedItem)
          selectedItem.focus();
        list.style.height = getRowCount() * rowHeight + "px";
      }
    }

    if ("rowsInserted" in response) {
      insertRow(menu.row + 1, response.rowsInserted);
    }

    if ("selectedCol" in response) {
      itemClicked(menu.row, response.selectedCol);
    }

    if ("rowDeleted" in response) {
      deleteRow(menu.row);
      menu.col = 0;
      if (menu.row > 0) {
        menu.row = menu.row - 1;
      }
    }

    if ("scriptChanged" in response) {
      reloadAllRows();
      menu.col = 0;
    }
    
    itemClicked(menu.row, menu.col);
  }
}



document.addEventListener("keydown", function(event) {
  if (history.state) {
    //ignore keyboard commands when the editor is open
    return;
  }

  if (event.key === "Escape") {
    closeMenu();
  }

  if (menu.row !== -1) {
    if (event.key === "Delete") {
      if (menu.row < script.getRowCount()) {
        deleteRow(menu.row);
        menu.col = 0;
        itemClicked(menu.row, 0);
      }

      event.preventDefault();
    }

    if (event.key === "Backspace") {
      if (menu.row < script.getRowCount()) {
        menuItemClicked(script.PAYLOADS.DELETE_ITEM);
      } else {
        selectPreviousLine();
      }

      event.preventDefault();
    }

    if (event.key === "Enter") {
      if (menu.row <= script.getRowCount()) {
        if (menu.col === 1 || menu.row === script.getRowCount() || script.getItemCount(menu.row) === 1) {
          insertRow(menu.row);
          itemClicked(menu.row + 1, menu.col);
        } else {
          insertRow(menu.row + 1);
          itemClicked(menu.row + 1, 0);
        }
      } else {
        itemClicked(menu.row + 1, 0);
      }
      
      event.preventDefault();
    }
  }
});

menu.addEventListener("click", function (event) {
  if (event.target !== this) {
    menuItemClicked(event.target.position);
  } else {
    closeMenu();
  }
});

function rowClickHandler(event) {
  if (menuButton.toggled) {
    menuButton.toggled = false;
    fabMenu.classList.remove("expanded");
  } else if (event.target.nodeName === "BUTTON") {
    itemClicked(this.position|0, event.target.position|0);
    document.body.classList.add("selected");
  }
}

function itemClicked(row, col) {
  if (row !== undefined && col !== undefined) {
    const selectedItem = list.childNodes[row % loadedCount].childNodes[1].childNodes[1 + col];
    if (selectedItem)
      selectedItem.focus();
    
    menu.row = row;
    menu.col = col;
    
    let options = script.itemClicked(row, col);
    configureMenu(options);
  }
}

function selectPreviousLine() {
  menu.col = 0;
  if (menu.row === 0) {
    itemClicked(0, 0);
  } else {
    itemClicked(menu.row - 1, 0);
  }
}



function touchStartHandler(event) {
  if (this.touchId === undefined) {
    const touch = event.changedTouches[0];
    this.touchId = touch.identifier;
    this.touchStartX = touch.pageX + this.childNodes[1].scrollLeft;
  }
}

function existingTouchHandler(event) {
  for (const touch of event.changedTouches) {
    if (touch.identifier === this.touchId) {
      switch (event.type) {
        case "touchmove":
          touchMoved(this, touch);
          if (this.touchCaptured)
            event.preventDefault();
        break;

        case "touchend":
          touchEnded(this, touch);
        break;

        case "touchcancel":
          touchCanceled(this);
        break;
      }
    }
  }
}

function touchMoved(outerDiv, touch) {
  let travel = touch.pageX - outerDiv.touchStartX;
  
  if (!outerDiv.touchCaptured && travel > 10) {
    outerDiv.touchCaptured = true;
    outerDiv.firstChild.classList.remove("slow-transition");
    outerDiv.slideMenuStartWidth = outerDiv.firstChild.offsetWidth;
    outerDiv.touchStartX += 10;
    travel -= 10;
  }
  
  if (outerDiv.touchCaptured) {
    outerDiv.firstChild.style.width = outerDiv.slideMenuStartWidth + Math.max(travel, 0) + "px";
  }
}

function touchEnded(outerDiv, touch) {
  if (outerDiv.touchCaptured) {
    const position = outerDiv.childNodes[1].position;
    const travel = touch.pageX - outerDiv.touchStartX;
    
    if (travel > 200) {
      if (position < script.getRowCount()) {
        deleteRow(position);
        if (position === menu.row) {
          menu.col = 0;
        } else if (menu.row > position) {
          --menu.row;
        }
        itemClicked(menu.row, menu.col);
      }
    }
    else if (travel > 80) {
      if (position <= script.getRowCount()) {
        insertRow(position);
        if (menu.row >= position) {
          ++menu.row;
        }
        itemClicked(menu.row, menu.col);
      }
    }
  }
  
  touchCanceled(outerDiv);
}

function touchCanceled(outerDiv) {
  outerDiv.touchId = undefined;
  if (outerDiv.touchCaptured) {
    outerDiv.touchCaptured = false;
    outerDiv.firstChild.classList.add("slow-transition");
    outerDiv.firstChild.style.width = "";
  }
}


function print(value) {
  const textNode = document.createTextNode(value);
  consoleOutput.appendChild(textNode);
}

function escapeControlCodes(string) {
  return string.replace(/\n/g, "\\n").replace(/\0/g, "\\0");
}