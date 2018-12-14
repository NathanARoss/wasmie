"use strict";

const rowHeight = 40;
const bufferCount = 10;
const forwardBufferCount = 4;
let loadedCount = 0;
let firstLoadedPosition = 0;

const list = document.getElementById("list");
const editor = document.getElementById("editor");
const menu = document.getElementById("menu");
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

let selRow = -1;
let selCol = -1;

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
  let newLoadedCount = Math.ceil(window.innerHeight / rowHeight) + bufferCount;
  let diff = newLoadedCount - loadedCount;
  loadedCount = newLoadedCount;
  
  //allow the viewport to scroll past the currently loaded rows
  list.style.height = getRowCount() * rowHeight + "px";
  
  //TODO reimplement these to handle the last row not being the last child
  for(let i = 0; i < diff; ++i) {
    let div = createRow();
    let position = list.childNodes.length + firstLoadedPosition;
    loadRow(position, div);
    list.appendChild(div);
  }

  for (let i = diff; i < 0; ++i) {
    let lastLine = list.lastChild;
    list.removeChild(lastLine);
  
    while (lastLine.childNodes.length > 2) {
      itemPool.push(lastLine.lastChild);
      lastLine.removeChild(lastLine.lastChild);
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
    const line = list.childNodes[position % loadedCount];
    loadRow(position, line);
    ++firstLoadedPosition;
  }
  
  while ((firstVisiblePosition - forwardBufferCount < firstLoadedPosition)
  && (firstLoadedPosition > 0)) {
    const position = firstLoadedPosition - 1;
    const line = list.childNodes[position % loadedCount];
    loadRow(position, line);
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
      commentNode.className = "wasm-comment";
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
              printDisassembly(1, maxPagesSpecifiedFlag ? "limit" : "no limit");
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
    const oldActiveProject = localStorage.getItem(ACTIVE_PROJECT_KEY)|0;
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
  return script.rowCount + loadedCount - bufferCount - 2;
}



function createRow() {
  const append = document.createElement("button");
  append.className = "append";
  append.position = -1;

  const indentation = document.createElement("div");
  indentation.classList.add("indentation");
  
  const lineDiv = document.createElement("div");
  lineDiv.addEventListener("click", rowClickHandler, {passive: true});
  lineDiv.appendChild(indentation);
  lineDiv.appendChild(append);
  
  return lineDiv;
}




function insertRow(position) {
  script.insertRow(position);
  
  if (position < firstLoadedPosition + loadedCount) {
    const selectedIndex = position % loadedCount;
    const selectedLine = list.childNodes[selectedIndex];

    const lastRowIndex = (firstLoadedPosition + loadedCount - 1) % loadedCount;
    const lastLine = list.childNodes[lastRowIndex];

    list.insertBefore(lastLine, selectedLine);
    loadRow(position, lastLine, -1);

    //if the bottom row must go up past the beginning of the array and back around to the
    //end to the new position, then a row must wrap around in the opposite direction
    //to prevent the remaining rows from having an index one too high
    if (lastRowIndex < selectedIndex) {
      list.insertBefore(list.lastChild, list.firstChild);
    }

    //shift existing rows downward
    for (let i = position + 1; i < loadedCount + firstLoadedPosition; ++i) {
      const line = list.childNodes[i % loadedCount];
      line.position = i;
      line.style.setProperty("--position", i + 1);
      line.childNodes[1].textContent = i;
    }
  }

  list.style.height = getRowCount() * rowHeight + "px";
}

function deleteRow(position) {
  let deletedCount = script.deleteRow(position);
  deletedCount = Math.min(deletedCount, loadedCount - (position - firstLoadedPosition));

  const selectedIndex = position % loadedCount;
  const lastRowIndex = (firstLoadedPosition + loadedCount - 1) % loadedCount;
  
  for (let i = 0; i < deletedCount; ++i) {
    const selectedLine = list.childNodes[selectedIndex];
    const lastLine = list.childNodes[lastRowIndex];

    if (lastLine.nextSibling) {
      list.insertBefore(selectedLine, lastLine.nextSibling);
    } else {
      list.appendChild(selectedLine);
    }

    if (lastRowIndex < selectedIndex) {
      list.appendChild(list.firstChild);
    }

    const newPosition = firstLoadedPosition + loadedCount - deletedCount + i;
    loadRow(newPosition, selectedLine);
  }

  //shift the remaining lines down
  for (let i = position; i < firstLoadedPosition + loadedCount - deletedCount; ++i) {
    const line = list.childNodes[i % loadedCount];    
    line.position = i;
    line.style.setProperty("--position", 1);
    line.childNodes[1].textContent = i;
  }

  list.style.height = getRowCount() * rowHeight + "px";
}



function loadRow(position, line, visualShift = 0) {  
  while (line.childNodes.length > 2) {
    itemPool.push(line.removeChild(line.lastChild));
  }

  if (position >= script.rowCount) {
    line.style.removeProperty("--indentation");
    line.classList.remove("starting-scope");
  } else {
    const itemCount = script.getItemCount(position);

    for (let col = 0; col < itemCount; ++col) {
      const [text, style] = script.getItem(position, col).getDisplay();
      const node = getItem(text, "item " + style, col);
      line.appendChild(node);
    }
    
    const indent = script.getIndent(position);
    if (indent > 0) {
      line.style.setProperty("--indentation", script.getIndent(position));
    } else {
      line.style.removeProperty("--indentation");
    }
    line.classList.toggle("starting-scope", script.isStartingScope(position));
  }

  if (line.position !== position) {
    line.style.transition = "none";
    const isShiftedDown = selRow !== -1 && position > selRow;
    line.style.setProperty("--position", position + visualShift + isShiftedDown|0);
    line.offsetHeight;
    line.style.transition = "";
    line.childNodes[1].textContent = position;
    line.position = position;

    if (selRow === position) {
      const button = line.childNodes[2 + selCol];
      line.scrollLeft = button.offsetLeft - window.innerWidth / 2;
    }
  }
}

function reloadAllRows() {
  list.style.height = getRowCount() * rowHeight + "px";

  for (const line of list.childNodes) {
    loadRow(line.position, line);
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

  //if teleport is forbidden, smoothly transition menu from previous position
  if (teleport) {
    menu.style.transition = "none";

    const isShiftedUp = prevRow === -1 || selRow < prevRow;
    menu.style.setProperty("--position", selRow + 1 - isShiftedUp|0);
  
    menu.offsetHeight;
    menu.style.transition = "";
  }

  const insertPosition = selRow + (selCol !== 0 && selRow !== script.rowCount)|0;

  menu.classList.toggle("delete-button-shown", selRow < script.rowCount);
  menu.classList.toggle("insert-button-shown", script.canInsert(insertPosition));
  menu.style.setProperty("--position", selRow + 1);
  menu.style.setProperty("--indentation", script.getInsertIndent(selRow + 1));
  
  //make room for the menu to slot below the selected row
  for (const line of list.childNodes) {
    line.style.setProperty("--position", line.position + (line.position > selRow)|0);
  }
}

function closeMenu() {
  menu.style.setProperty("--position", selRow);
  menu.classList.remove("revealed");
  selRow = -1;
  for (const line of list.childNodes) {
    line.style.setProperty("--position", line.position);
  }

  editor.classList.remove("selected");
  selectedItem && selectedItem.classList.remove("selected");
  selectedItem = undefined;

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
      deleteRow(selRow);
      const teleport = script.getItemCount(selRow) > 0;
      itemClicked(selRow, -1, teleport);

      event.preventDefault();
    }

    if (event.key === "Backspace") {
      handleMenuItemResponse(script.deleteItem(selRow, selCol));
      event.preventDefault();
    }

    if (event.key === "Enter") {
      if (selCol === 0 || selRow === script.rowCount) {
        ++selRow;
        insertRow(selRow - 1);
      } else {
        selCol = -1;
        ++selRow;
        insertRow(selRow);
      }
      itemClicked(selRow, selCol, false);
      event.preventDefault();
    }
  }
};

function handleMenuItemResponse(response) {
  if ("rowUpdated" in response) {
    const line = list.childNodes[selRow % loadedCount];
    loadRow(selRow, line);
    if (response.selectedCol >= script.getItemCount(selRow)) {
      response.selectedCol = -1;
    }
    if (selCol === -1) {
      line.scrollLeft = 1e10;
    }
    list.style.height = getRowCount() * rowHeight + "px";
  }

  if ("rowInserted" in response) {
    insertRow(selRow + 1);
  }

  if ("selectedCol" in response) {
    selCol = response.selectedCol;
  }

  if ("rowDeleted" in response) {
    deleteRow(selRow);
    if (selRow > 0) {
      selRow = selRow - 1;
    }
    const teleport = script.getItemCount(selRow) > 0;
    itemClicked(selRow, -1, teleport);
    return;
  }

  if ("scriptChanged" in response) {
    reloadAllRows();
    selCol = -1;
  }
  
  itemClicked(selRow, selCol);
}

function rowClickHandler(event) {
  if (menuButton.toggled) {
    menuButton.toggled = false;
    fabMenu.classList.remove("expanded");
  } else if (event.target.nodeName === "BUTTON") {
    const row = this.position|0;
    const col = event.target.position|0;
    if (row === selRow && col === selCol) {
      closeMenu();
    } else {
      itemClicked(row, col);
      editor.classList.add("selected");
    }
  }
}

function itemClicked(row, col, teleport = true) {
  if (row !== undefined && col !== undefined) {
    selectedItem && selectedItem.classList.remove("selected");

    selectedItem = list.childNodes[row % loadedCount].childNodes[2 + col];
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
}

function clickPreviousLine() {
  itemClicked(Math.max(0, selRow - 1), -1);
}

function print(value) {
  const textNode = document.createTextNode(value);
  consoleOutput.appendChild(textNode);
}

function escapeControlCodes(string) {
  return string.replace(/\n/g, "\\n").replace(/\0/g, "\\0");
}