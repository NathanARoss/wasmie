"use strict";

const rowHeight = 40;
const bufferCount = 10;
const forwardBufferCount = 4;
let loadedCount = 0;
let firstLoadedPosition = 0;

const list = document.getElementById("list");
const editor = document.getElementById("editor");
const menu1 = document.getElementById("menu1");
const menu2 = document.getElementById("menu2");
const menuButton = document.getElementById("menu-button");
const createButton = document.getElementById("new-button");
const loadButton = document.getElementById("load-button");
const viewCodeButton = document.getElementById("view-code-button");
const fabMenu = document.getElementById("FAB-menu");
const runtime = document.getElementById("runtime");
const consoleOutput = document.getElementById("console-output");
const programList = document.getElementById("program-list");

const itemPool = [];
let selectedItem;

const ACTIVE_PROJECT_KEY = "TouchScript-active-project-id";
let script = new Script();

let selectedRow = -1;
let selectedCol = -1;

let menu = menu1;

menuButton.addEventListener("click", function(event) {
  event.stopPropagation();

  if (selectedRow !== -1) {
    closeMenu();
  } else {
    if (menuButton.toggled) {
      history.pushState({action: "run"}, "TouchScript Runtime");
      window.onpopstate();
    }
  
    fabMenu.classList.toggle("expanded");
    menuButton.toggled = !menuButton.toggled;
  }
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

function enterKeyPressed() {
  if (selectedRow <= script.getRowCount()) {
    if (selectedCol === 0 && selectedRow < script.getRowCount() && script.getItemCount(selectedRow) !== 0
    || selectedRow === script.getRowCount()) {
      insertRow(selectedRow);
      ++selectedRow;
      itemClicked(selectedRow, selectedCol);
    } else {
      selectedCol = -1;
      insertRow(selectedRow + 1);
      itemClicked(selectedRow + 1, -1);
    }
  } else {
    itemClicked(selectedRow + 1, -1);
  }
}

menu1.firstChild.onclick = menu2.firstChild.onclick = function() {
  enterKeyPressed();
  return {};
};



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

    let innerDiv = lastChild.firstChild;
  
    while (innerDiv.childNodes.length > 2) {
      itemPool.push(innerDiv.lastChild);
      innerDiv.removeChild(innerDiv.lastChild);
    }
  }
};
document.body.onresize();



//detect when items need to be loaded in the direction of scroll
//take nodes from the back to add to the front
window.onscroll = function() {
  const firstVisiblePosition = Math.floor(window.scrollY / rowHeight);
  
  //keep a number of rows prepared for both direction
  while ((firstVisiblePosition - bufferCount + forwardBufferCount > firstLoadedPosition)
  && (firstLoadedPosition + loadedCount < getRowCount())) {
    const position = firstLoadedPosition + loadedCount;
    const outerDiv = list.childNodes[position % loadedCount];
    loadRow(position, outerDiv);
    ++firstLoadedPosition;
  }
  
  while ((firstVisiblePosition - forwardBufferCount < firstLoadedPosition)
  && (firstLoadedPosition > 0)) {
    const position = firstLoadedPosition - 1;
    const outerDiv = list.childNodes[position % loadedCount];
    loadRow(position, outerDiv);
    --firstLoadedPosition;
  }
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
    document.title = "TouchScript"
    
    while (programList.childNodes.length > 1) {
      programList.removeChild(programList.lastChild);
    }

    consoleOutput.innerHTML = "";
    editor.style.display = "";
  }
  else if (event.state.action === "run") {
    document.title = "TouchScript Runtime";

    let wasm;
    try {
      wasm = script.getWasm();
    } catch (error) {
      console.log(error);
      print(error);
    }

    const environment = new RuntimeEnvironment();
    try {
      WebAssembly.instantiate(wasm, environment)
    } catch (error) {
      print(error);
    }
    
    runtime.style.display = "";
  }
  else if (event.state.action === "disassemble") {
    document.title = "TouchScript Disassembly"

    let wasmBinary;
    try {
      wasmBinary = script.getWasm();
    } catch (error) {
      console.log(error);
      print(error);
      runtime.style.display = "";
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
      byteNode.textContent = Array.from(slice).map(b => b.toString(16).padStart(2, "0"))
                                              .join(" ").padEnd(27);
      byteNode.className = "wasm-data";
      consoleOutput.appendChild(byteNode);

      const commentNode = document.createElement("span");
      commentNode.textContent = comment + "\n";
      commentNode.className = "wasm-comment";func
      consoleOutput.appendChild(commentNode);
    }

    //reads and prints a whole string on the first line
    //remaining bytes spill into later lines
    function printEncodedString(count, beginComment = '"', endComment = '"') {
      const end = offset + count;
      
      const sanitizedStr = escapeControlCodes(Wasm.UTF8toString(wasm.slice(offset, end)));
      printDisassembly(Math.min(8, count), beginComment + sanitizedStr + endComment);

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
      printDisassembly(1, "section " + Wasm.sectionNames[sectionCode] + " ("+sectionCode+")");

      const payloadLength = readVaruintAndPrint("size: ", " bytes");
      const end = offset + payloadLength;

      let firstItemLabel = sectionCode === Wasm.section.Start ? "entry point: " : "count: ";
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
                const begin = offset + bytesRead;
                comment += Array.from(wasm.slice(begin, begin + count))
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
              printDisassembly(1, maxPagesSpecified ? "limit" : "no limit");
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

            //the initial value is assumed to be an i32.const expression
            //TODO should support other constant types
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
              //assumes no more than 127 locals specified at once
              const [count] = Wasm.decodeVaruint(wasm, offset + bytesRead);
              ++bytesRead;
              const type = wasm[offset + bytesRead];
              localVariableComment += (" " + Wasm.typeNames[type]).repeat(count);
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

      //resets the read position to beginning of next section
      offset = end;
    }

    runtime.style.display = "";
  }
  else if (event.state.action === "load") {
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

          const lastModified = document.createElement("p");
          lastModified.textContent = "Last Modified: " + getDateString(project.lastModified);

          const deleteButton = document.createElement("button");
          deleteButton.className = "delete delete-project-button";
          deleteButton.addEventListener("click", deleteProject);

          const entry = document.createElement("div");
          entry.className = "project-list-entry";
          entry.appendChild(deleteButton);
          entry.appendChild(label);
          entry.appendChild(projectName);
          entry.appendChild(dateCreated);
          entry.appendChild(lastModified);
          entry.addEventListener("click", selectProject);

          if (script.projectID === project.id) {
            entry.classList.add("open");
          }

          entry.projectId = project.id;
          programList.appendChild(entry);
        }
      }
    });

    programList.style.display = "";
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
  var options = {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit"
  };
  return date.toLocaleDateString("en-US", options);
}


function getRowCount() {
  return script.getRowCount() + loadedCount - bufferCount - 2;
}



function createRow() {
  const append = document.createElement("button");
  append.className = "append";
  append.position = -1;

  const indentation = document.createElement("div");
  indentation.classList.add("indentation");
  
  const innerDiv = document.createElement("div");
  innerDiv.className = "inner-row";
  innerDiv.addEventListener("click", rowClickHandler, {passive: true});
  innerDiv.appendChild(indentation);
  innerDiv.appendChild(append);
  
  const outerDiv = document.createElement("div");
  outerDiv.className = "outer-row";
  outerDiv.appendChild(innerDiv);
  
  return outerDiv;
}




function insertRow(position) {
  const internalPos = script.insertRow(position);
  
  if (internalPos !== -1 && position < firstLoadedPosition + loadedCount) {
    const selectedIndex = position % loadedCount;
    const selectedOuterDiv = list.childNodes[selectedIndex];

    const lastRowIndex = (firstLoadedPosition + loadedCount - 1) % loadedCount;
    const lastRowOuterDiv = list.childNodes[lastRowIndex];

    list.insertBefore(lastRowOuterDiv, selectedOuterDiv);
    ++selectedRow;
    loadRow(position, lastRowOuterDiv);
    --selectedRow;

    //if the bottom row must go up past the beginning of the array and back around to the
    //end to the new position, then a row must wrap around in the opposite direction
    //to prevent the remaining rows from having an index one too high
    if (lastRowIndex < selectedIndex) {
      list.insertBefore(list.lastChild, list.firstChild);
    }

    //increase the line numbers and positions
    for (let i = position + 1; i < loadedCount + firstLoadedPosition; ++i) {
      const outerDiv = list.childNodes[i % loadedCount];
      let rowPos = outerDiv.firstChild.position;
      if (rowPos >= position) {
        ++rowPos;
        outerDiv.firstChild.position = rowPos;
        const isShiftedDown = rowPos > selectedRow;
        outerDiv.style.setProperty("--position", rowPos + isShiftedDown|0);
        outerDiv.firstChild.childNodes[1].textContent = rowPos;
      }
    }
  }

  list.style.height = getRowCount() * rowHeight + "px";
}

function deleteRow(position) {
  const oldRowCount = script.getRowCount();
  const internalPos = script.deleteRow(position);
  const deletedCount = oldRowCount - script.getRowCount();
  
  for (let i = 0; i < deletedCount; ++i) {
    const selectedIndex = internalPos % loadedCount;
    const selectedOuterDiv = list.childNodes[selectedIndex];

    const lastRowIndex = (firstLoadedPosition + loadedCount - 1) % loadedCount;
    const lastRowOuterDiv = list.childNodes[lastRowIndex];

    if (lastRowOuterDiv.nextSibling) {
      list.insertBefore(selectedOuterDiv, lastRowOuterDiv.nextSibling);
    } else {
      list.appendChild(selectedOuterDiv);
    }

    if (lastRowIndex < selectedIndex) {
      list.appendChild(list.firstChild);
    }

    const newPosition = firstLoadedPosition + loadedCount - deletedCount + i + 1;
    loadRow(newPosition, selectedOuterDiv);
    selectedOuterDiv.firstChild.position = firstLoadedPosition + loadedCount;

    //increase the line numbers and positions
    for (let i = position; i < loadedCount + firstLoadedPosition; ++i) {
      const outerDiv = list.childNodes[i % loadedCount];
      let rowPos = outerDiv.firstChild.position;
      if (rowPos >= position) {
        --rowPos;
        outerDiv.firstChild.position = rowPos;
        const isShiftedDown = rowPos > selectedRow;
        outerDiv.style.setProperty("--position", rowPos + isShiftedDown|0);
        outerDiv.firstChild.childNodes[1].textContent = rowPos;
      }
    }
  }

  list.style.height = getRowCount() * rowHeight + "px";
}



function loadRow(position, outerDiv) {
  let innerDiv = outerDiv.firstChild;
  
  while (innerDiv.childNodes.length > 2) {
    itemPool.push(innerDiv.lastChild);
    innerDiv.removeChild(innerDiv.lastChild);
  }

  if (position >= script.getRowCount()) {
    innerDiv.style.setProperty("--indentation", 0);
    innerDiv.classList.remove("starting-scope");
  } else {
    let itemCount = script.getItemCount(position);

    for (let col = 0; col < itemCount; ++col) {
      const [text, style] = script.getItemDisplay(position, col);
      
      let node = getItem(text, "item " + style, col);
      innerDiv.appendChild(node);
    }
    
    const indentation = script.getIndentation(position);
    innerDiv.style.setProperty("--indentation", indentation);

    if (script.isStartingScope(position)) {
      innerDiv.classList.add("starting-scope");
    } else {
      innerDiv.classList.remove("starting-scope");
    }
  }

  if (innerDiv.position !== position) {
    outerDiv.style.transition = "none";
    const isShiftedDown = selectedRow !== -1 && position > selectedRow;
    outerDiv.style.setProperty("--position", position + isShiftedDown|0);
    outerDiv.offsetHeight;
    outerDiv.style.transition = "";
    innerDiv.childNodes[1].textContent = position;
    innerDiv.position = position;

    if (selectedRow === position) {
      const button = innerDiv.childNodes[2 + selectedCol];
      innerDiv.scrollLeft = button.offsetLeft - window.innerWidth / 2;
    }
  }
}

function reloadAllRows() {
  list.style.height = getRowCount() * rowHeight + "px";

  for (const outerDiv of list.childNodes) {
    loadRow(outerDiv.firstChild.position, outerDiv);
  }
}



function getItem(text, className, position) {
  const node = itemPool.pop() || document.createElement("button");
  node.textContent = text;
  node.className = className;
  node.position = position;
  return node;
}



function configureMenu(options, prevRow = selectedRow) {
  const prevMenu = menu;

  if (menu === menu1) {
    menu = menu2;
  } else {
    menu = menu1;
  }

  while (menu.childNodes.length > 1) {
    const child = menu.lastChild;
    child.action = undefined;
    child.args = undefined;
    if (child.tagName === "BUTTON") {
      child.onclick = undefined;
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

  menu.style.transition = "none";
  prevMenu.classList.remove("revealed");
  menu.classList.remove("revealed");

  menu.classList.add("hide-from-top");
  menu.classList.remove("hide-from-bottom");

  if (prevRow === -1 || selectedRow <= prevRow) {
    menu.style.setProperty("--position", selectedRow);
    if (selectedRow === prevRow) { //rolling update animation
      prevMenu.classList.add("hide-from-bottom");
      prevMenu.classList.remove("hide-from-top");
      prevMenu.style.setProperty("--position", prevRow + 2);
    } else {
      prevMenu.style.setProperty("--position", prevRow + 1);
    }
  } else {
    menu.style.setProperty("--position", selectedRow + 1);
    prevMenu.style.setProperty("--position", prevRow);
  }

  menu.offsetHeight;
  menu.style.transition = "";
  menu.classList.add("revealed");
  menu.style.setProperty("--position", selectedRow + 1);

  const isInsertButtonShown = (selectedRow < script.getRowCount() - 1
  || (selectedRow === script.getRowCount() - 1)
    && (script.getIndentation(selectedRow) > 0
    || (selectedRow > 0 && script.getIndentation(selectedRow - 1) > 1))
    || selectedCol === 0
  );
  menu.classList.toggle("insert-button-shown", isInsertButtonShown);
  
  //make room for the menu to slot below the selected row
  for (const outerDiv of list.childNodes) {
    const position = outerDiv.firstChild.position;
    outerDiv.style.setProperty("--position", position + (position > selectedRow)|0);
  }
}

function closeMenu() {
  menu.style.setProperty("--position", selectedRow);
  menu.classList.remove("revealed");
  selectedRow = -1;
  for (const outerDiv of list.childNodes) {
    outerDiv.style.setProperty("--position", outerDiv.firstChild.position);
  }

  document.body.classList.remove("selected");
  selectedItem && selectedItem.classList.remove("selected");
  selectedItem = undefined;

  fabMenu.classList.remove("expanded");
  menuButton.toggled = false;
}



document.addEventListener("keydown", function(event) {
  if (history.state) {
    //ignore keyboard commands unless the editor is open
    return;
  }

  if (event.key === "Escape") {
    closeMenu();
  }

  if (selectedRow !== -1) {
    if (event.key === "Delete") {
      if (selectedRow < script.getRowCount()) {
        deleteRow(selectedRow);
        itemClicked(selectedRow, -1);
      }

      event.preventDefault();
    }

    if (event.key === "Backspace") {
      if (selectedRow < script.getRowCount()) {
        handleMenuItemResponse(script.deleteItem(selectedRow, selectedCol));
      } else {
        clickPreviousLine();
      }

      event.preventDefault();
    }

    if (event.key === "Enter") {
      enterKeyPressed();      
      event.preventDefault();
    }
  }
});

function handleMenuItemResponse(response) {
  if ("rowUpdated" in response) {
    const outerDiv = list.childNodes[selectedRow % loadedCount];
    loadRow(selectedRow, outerDiv);
    if (response.selectedCol >= script.getItemCount(selectedRow)) {
      response.selectedCol = -1;
    }
    if (selectedCol === -1) {
      outerDiv.firstChild.scrollLeft = 1e10;
    }
    list.style.height = getRowCount() * rowHeight + "px";
  }

  if ("rowInserted" in response) {
    insertRow(selectedRow + 1);
  }

  if ("selectedCol" in response) {
    selectedCol = response.selectedCol;
  }

  if ("rowDeleted" in response) {
    deleteRow(selectedRow);
    selectedCol = -1;
    if (selectedRow > 0) {
      selectedRow = selectedRow - 1;
    }
  }

  if ("scriptChanged" in response) {
    reloadAllRows();
    selectedCol = -1;
  }
  
  itemClicked(selectedRow, selectedCol);
}

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
    selectedItem && selectedItem.classList.remove("selected");

    selectedItem = list.childNodes[row % loadedCount].firstChild.childNodes[2 + col];
    if (selectedItem) {
      selectedItem.classList.add("selected");
      selectedItem.focus();
    }
    
    const prevRow = selectedRow;
    selectedRow = row;
    selectedCol = col;
    
    const options = script.itemClicked(row, col);
    configureMenu(options, prevRow);
  }
}

function clickPreviousLine() {
  itemClicked(Math.max(0, selectedRow - 1), -1);
}

function print(value) {
  const textNode = document.createTextNode(value);
  consoleOutput.appendChild(textNode);
}

function escapeControlCodes(string) {
  return string.replace(/\n/g, "\\n").replace(/\0/g, "\\0");
}