"use strict";

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
const fabMenu = document.getElementById("FAB-menu");
const runtime = document.getElementById("runtime");
const consoleOutput = document.getElementById("console-output");
const programList = document.getElementById("program-list");

editor.style.height = "10000000px";
firstLoadedPosition = Math.max(0, Math.floor(window.scrollY / lineHeight) - bufferCount);

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
  reloadAllLines();
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
  const newLoadedCount = Math.ceil(window.innerHeight / lineHeight) + bufferCount;
  const diff = newLoadedCount - loadedCount;

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

    function readVaruintAndPrint(beginComment = "", endComment = "") {
      const [val, bytesRead] = Wasm.decodeVaruint(wasm, offset);
      printDisassembly(bytesRead, beginComment + val + endComment);
      return val;
    }

    printDisassembly(4, 'Wasm magic number: "\\0asm"');
    printDisassembly(4, "Wasm version: 1");

    const typeDescription = [];

    while (offset < wasm.length) {
      consoleOutput.appendChild(document.createElement("BR"));

      const sectionCode = wasm[offset];
      printDisassembly(1, "section " + Wasm.sectionNames[sectionCode] + " ("+sectionCode+")");

      const payloadLength = readVaruintAndPrint("size: ", " bytes");
      const end = offset + payloadLength;

      let firstItemLabel = sectionCode === Wasm.section.Start ? "entry point: " : "count: ";
      readVaruintAndPrint(firstItemLabel);

      while (offset < end) {
        switch (sectionCode) {
          case Wasm.section.Type: {
            if (wasm[offset] === Wasm.types.func) {
              let bytesRead = 1;
              let [count, LEBbytes] = Wasm.decodeVaruint(wasm, offset + bytesRead);
              bytesRead += LEBbytes;
              
              const paramTypes = Array.from(wasm.slice(offset + bytesRead, offset + bytesRead + count));
              let comment = "func (";
              comment += paramTypes.map(t => Wasm.typeNames[t & 0x7F]).join(", ");
              comment += ") -> ";
              bytesRead += count;

              [count, LEBbytes] = Wasm.decodeVaruint(wasm, offset + bytesRead);
              bytesRead += LEBbytes;

              if (count === 0) {
                comment += "void";
              } else {
                const returnTypes = wasm.slice(offset + bytesRead, offset + bytesRead + count);
                comment += Array.map.call(returnTypes, t => Wasm.typeNames[t & 0x7F]).join(", ");
                bytesRead += count;
              }

              typeDescription.push(comment);

              //print the comment on the first line of bytes up to 8 bytes
              //print the remaining bytes in groups of 8
              do {
                const count = Math.min(8, bytesRead);
                printDisassembly(count, comment);
                bytesRead -= count;
                comment = "";
              } while (bytesRead > 0)
            } else {
              throw "unrecognized Wasm type " + Wasm.typeNames[type] || type;
            }
          } break;
          
          case Wasm.section.Import: {
            for (const description of ['module: "', 'field:  "']) {
              const [stringLength, LEBbytes] = Wasm.decodeVaruint(wasm, offset);
              const end = offset + stringLength + LEBbytes;
      
              const str = Wasm.UTF8toString(wasm.slice(offset + LEBbytes, end));
              const sanitizedStr = str.replace(/\n/g, "\\n").replace(/\0/g, "\\0");
              let comment = description + sanitizedStr + '"';
        
              do {
                const count = Math.min(8, end - offset);
                printDisassembly(count, comment);
                comment = "";
              } while (offset < end);
            }

            const exportType = wasm[offset];
            if (exportType === Wasm.externalKind.Memory) {
              //print memory description
              printDisassembly(1, "external " + Wasm.externalKindNames[exportType]);
              const maxPagesSpecifiedFlag = wasm[offset];
              printDisassembly(1, maxPagesSpecifiedFlag ? "limit" : "no limit");
              readVaruintAndPrint("initial pages: ");

              if (maxPagesSpecifiedFlag) {
                readVaruintAndPrint("max allocation: ", " pages");
              }
            } else if (exportType === Wasm.externalKind.Function) {
              //print imported function's signature
              const [type, LEBbytes] = Wasm.decodeVaruint(wasm, offset + 1);
              const comment = "external " + typeDescription[type];
              printDisassembly(LEBbytes + 1, comment);
            }
          } break;
          
          case Wasm.section.Function: {
            const [type, LEBbytes] = Wasm.decodeVaruint(wasm, offset);
            const comment = typeDescription[type];
            printDisassembly(LEBbytes, comment);
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
              const asText = Wasm.UTF8toString(slice).replace(/[^ -~]/g, '.'); //remove non-ASCII characters
              printDisassembly(count, asText);
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
  document.body.onresize();
  window.onpopstate();

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
      script = new Script();
      reloadAllLines();
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
        reloadAllLines();
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
      console.log(event.target);
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
  script.insertLine(position);
  
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
      line.style.setProperty("--position", i + 1);
      line.childNodes[1].textContent = i;
    }
  }

  editor.style.height = getLineCount() * lineHeight + "px";
}

function deleteLine(position) {
  let deletedCount = script.deleteLine(position);
  deletedCount = Math.min(deletedCount, loadedCount - (position - firstLoadedPosition));

  const selectedIndex = position % loadedCount;
  const lastLineIndex = (firstLoadedPosition + loadedCount - 1) % loadedCount;
  
  for (let i = 0; i < deletedCount; ++i) {
    const selectedLine = editor.childNodes[selectedIndex];
    const lastLine = editor.childNodes[lastLineIndex];

    editor.insertBefore(selectedLine, lastLine.nextSibling);

    if (lastLineIndex < selectedIndex) {
      editor.insertBefore(editor.firstChild, editor.childNodes[loadedCount]);
    }

    const newPosition = firstLoadedPosition + loadedCount - deletedCount + i;
    loadLine(newPosition, selectedLine);
  }

  //shift the remaining lines down
  for (let i = position; i < firstLoadedPosition + loadedCount - deletedCount; ++i) {
    const line = editor.childNodes[i % loadedCount];    
    line.position = i;
    line.style.setProperty("--position", 1);
    line.childNodes[1].textContent = i;
  }

  editor.style.height = getLineCount() * lineHeight + "px";
}



function loadLine(position, line, visualShift = 0) {
  while (line.childNodes.length > 2) {
    itemPool.push(line.removeChild(line.lastChild));
  }

  if (position >= script.lineCount) {
    line.style.removeProperty("--indent");
    line.classList.remove("half-indent");
  } else {
    const itemCount = script.getItemCount(position);

    for (let col = 0; col < itemCount; ++col) {
      const [text, style] = script.getItem(position, col).getDisplay();
      const node = getItem(text, "item " + style, col);
      line.appendChild(node);
    }
    
    const indent = script.getIndent(position);
    if (indent > 0) {
      line.style.setProperty("--indent", script.getIndent(position));
    } else {
      line.style.removeProperty("--indent");
    }
    line.classList.toggle("half-indent", script.isStartingScope(position));
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

  const insertPosition = selRow + (selCol !== 0 && selRow !== script.lineCount)|0;

  menu.classList.toggle("delete-button-shown", selRow < script.lineCount);
  menu.classList.toggle("insert-button-shown", script.canInsert(insertPosition));
  menu.style.setProperty("--position", selRow + 1);
  menu.style.setProperty("--indent", script.getInsertIndent(selRow + 1));
  
  //make room for the menu to slot below the selected line
  if (prevRow === -1) {
    prevRow = selRow;
  }
  for (let i = Math.min(selRow, prevRow); i < loadedCount + firstLoadedPosition; ++i) {
    const line = editor.childNodes[i % loadedCount];
    line.style.setProperty("--position", line.position + (line.position > selRow)|0);
  }
}

function closeMenu() {
  menu.style.setProperty("--position", selRow);
  menu.classList.remove("revealed");
  if (selRow !== -1) {
    for (let i = selRow; i < loadedCount + firstLoadedPosition; ++i) {
      const line = editor.childNodes[i % loadedCount];
      line.style.setProperty("--position", line.position);
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
      deleteLine(selRow);
      const teleport = script.getItemCount(selRow) > 0;
      itemClicked(selRow, -1, teleport);

      event.preventDefault();
    }

    if (event.key === "Backspace") {
      handleMenuItemResponse(script.deleteItem(selRow, selCol));
      event.preventDefault();
    }

    if (event.key === "Enter") {
      if (selCol === 0 || selRow === script.lineCount) {
        ++selRow;
        insertLine(selRow - 1);
      } else {
        selCol = -1;
        ++selRow;
        insertLine(selRow);
      }
      itemClicked(selRow, selCol, false);
      event.preventDefault();
    }
  }
};

function handleMenuItemResponse(response) {
  if ("lineUpdated" in response) {
    loadLine(selRow, editor.childNodes[selRow % loadedCount]);
    editor.style.height = getLineCount() * lineHeight + "px";
  }

  if ("lineInserted" in response) {
    insertLine(selRow + 1);
  }

  if ("selectedCol" in response) {
    selCol = response.selectedCol;
  }

  if ("lineDeleted" in response) {
    deleteLine(selRow);
    if (selRow > 0) {
      selRow = selRow - 1;
    }
    selCol = -1;
  }

  if ("scriptChanged" in response) {
    reloadAllLines();
    selCol = -1;
  }

  if (selCol >= script.getItemCount(selRow)) {
    selCol = -1;
  }

  //move selected item into view
  const line = editor.childNodes[selRow % loadedCount];
  const item = line.childNodes[2 + selCol];
  const leftBound = item.offsetLeft - 40;
  const rightBound = leftBound + 80 + item.offsetWidth - editor.offsetWidth;
  line.scrollLeft = Math.max(Math.min(leftBound, line.scrollLeft), rightBound);

  itemClicked(selRow, selCol, false);
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
      itemClicked(row, col);
      editor.classList.add("selected");
    }
  }
}

function itemClicked(row, col, teleport = true) {
  if (row !== undefined && col !== undefined) {
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
}

function clickPreviousLine() {
  itemClicked(Math.max(0, selRow - 1), -1);
}

function print(value) {
  if (consoleOutput.childNodes.length == 0 || consoleOutput.lastChild.nodeValue.length > 512) {
    const textNode = document.createTextNode(value);
    consoleOutput.appendChild(textNode);
  } else {
    consoleOutput.lastChild.nodeValue += value;
  }
}