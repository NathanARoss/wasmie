"use strict";

const rowHeight = 40;
const bufferCount = 10;
const forwardBufferCount = 4;
let loadedCount = 0;
let firstLoadedPosition = 0;

const list = document.getElementById("list");
const spacer = document.getElementById("spacer");
const debug = document.getElementById("debug");
const editor = document.getElementById("editor_div");
const modal = document.getElementById("modal");
const menuButton = document.getElementById("menu-button");
const createButton = document.getElementById("new-button");
const loadButton = document.getElementById("load-button");
const viewCodeButton = document.getElementById("view-code-button");
const fabMenu = document.getElementById("FAB-menu");
const runtime = document.getElementById("runtime");
const consoleOutput = document.getElementById("console-output");
const programList = document.getElementById("program-list");

let buttonPool = [];

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
  reloadAllRowsInPlace();
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

  alert(script.getJavaScript());
});



modal.addEventListener("click", modalContainerClicked);



document.body.onresize = function () {
  let newLoadedCount = Math.ceil(window.innerHeight / rowHeight) + bufferCount;
  let diff = newLoadedCount - loadedCount;
  loadedCount = newLoadedCount;
  
  //allow the viewport to scroll past the currently loaded rows
  if (history.state === null)
    document.body.style.height = getRowCount() * rowHeight + "px";
  
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
      buttonPool.push(innerRow.lastChild);
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
    let outerDiv = list.firstChild;
    list.appendChild(outerDiv);
    loadRow(firstLoadedPosition + loadedCount, outerDiv);
    ++firstLoadedPosition;
  }
  
  while ((firstVisiblePosition - forwardBufferCount < firstLoadedPosition) && (firstLoadedPosition > 0)) {
    let outerDiv = list.lastChild;
    list.insertBefore(outerDiv, list.firstChild);
    loadRow(firstLoadedPosition - 1, outerDiv);
    --firstLoadedPosition;
  }
  
  spacer.style.height = firstLoadedPosition * rowHeight + "px";
  list.childNodes.forEach(touchCanceled);

  debug.firstChild.nodeValue = `[${firstLoadedPosition}, ${(firstLoadedPosition + loadedCount - 1)}]`;
};
window.onscroll();

window.onpopstate = function(event) {
  if (!event) {
    event = {state: history.state};
  }

  if (!event.state) {
    editor.style.display = "";
    runtime.style.display = "none";
    programList.style.display = "none";

    while (programList.childNodes.length > 1) {
      programList.removeChild(programList.lastChild);
    }

    consoleOutput.innerHTML = "";
    document.body.style.height = getRowCount() * rowHeight + "px";
    document.title = "TouchScript"
  }
  else if (event.state.action === "run") {    
    try {
      const js = script.getJavaScript();
      (new Function(js)) ();
    } catch (e) {
      //alert(e);
      console.log(e);
      history.back();
      return;
    }
    
    editor.style.display = "none";
    runtime.style.display = "";
    programList.style.display = "none";
    document.body.style.height = "auto";
    document.title = "TouchScript Runtime"
  }
  else if (event.state.action === "load") {
    editor.style.display = "none";
    runtime.style.display = "none";
    programList.style.display = "";
    document.body.style.height = "auto";
    document.title = "TouchScript Project Manager"

    performActionOnProjectListDatabase("readonly", function(objStore, transaction) {
      function projectClicked(event) {
        const projectID = event.currentTarget.projectId;
        const oldActiveProject = localStorage.getItem(ACTIVE_PROJECT_KEY) | 0;
        if (projectID !== oldActiveProject) {
          localStorage.setItem(ACTIVE_PROJECT_KEY, projectID);
          script = new Script();
          reloadAllRowsInPlace();
        }
        window.history.back();
      }

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
          deleteButton.classList.add("delete");
          deleteButton.classList.add("delete-project-button");
          deleteButton.addEventListener("click", deleteProject, {passive: false});

          const entry = document.createElement("div");
          entry.classList.add("project-list-entry");
          entry.appendChild(deleteButton);
          entry.appendChild(label);
          entry.appendChild(projectName);
          entry.appendChild(dateCreated);
          entry.appendChild(dateLastModified);
          entry.addEventListener("click", projectClicked);

          entry.projectId = project.id;
          programList.appendChild(entry);
        }
      }
    });
  }
}
window.onpopstate();


function deleteProject(event) {
  event.stopPropagation();
  
  const entry = this.parentElement;
  const id = entry.projectId;
  
  performActionOnProjectListDatabase("readwrite", function(objStore, transaction) {
    objStore.delete(id).onsuccess = function(event) {
      console.log("Successfully deleted project ID " + id);
      entry.parentElement.removeChild(entry);
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
    db.createObjectStore("project-list", {keyPath: "id", autoIncrement: true});
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
  lineNumberItem.classList.add("slide-menu-item");
  lineNumberItem.classList.add("no-select");
  lineNumberItem.id = "line-number-item";
  lineNumberItem.appendChild(document.createTextNode(""));
  
  let newlineItem = document.createElement("p");
  newlineItem.classList.add("slide-menu-item");
  newlineItem.id = "newline-item";
  
  let deleteLineItem = document.createElement("p");
  deleteLineItem.classList.add("slide-menu-item");
  deleteLineItem.id = "delete-line-item";
  
  let slideMenu = document.createElement("div");
  slideMenu.classList.add("slide-menu");
  slideMenu.classList.add("slow-transition");
  slideMenu.appendChild(lineNumberItem);
  slideMenu.appendChild(newlineItem);
  slideMenu.appendChild(deleteLineItem);
  slideMenu.addEventListener("mousedown", slideMenuClickHandler);
  slideMenu.addEventListener("contextmenu", preventDefault);
  slideMenu.addEventListener("touchstart", preventDefault);

  let append = document.createElement("button");
  append.classList.add("append");
  append.position = -1;
  
  let indentation = document.createElement("button");
  indentation.classList.add("indentation");
  indentation.position = 0;
  
  let innerDiv = document.createElement("div");
  innerDiv.classList.add("inner-row");
  innerDiv.addEventListener("click", rowClickHandler, {passive: true});
  innerDiv.appendChild(append);
  innerDiv.appendChild(indentation);
  
  let outerDiv = document.createElement("div");
  outerDiv.classList.add("outer-row");
  outerDiv.appendChild(slideMenu);
  outerDiv.appendChild(innerDiv);
  
  outerDiv.touchId = -1;
  outerDiv.addEventListener("touchstart", touchStartHandler, {passive: true});
  outerDiv.addEventListener("touchmove", existingTouchHandler, {passive: false});
  outerDiv.addEventListener("touchend", existingTouchHandler, {passive: true});
  outerDiv.addEventListener("touchcancel", existingTouchHandler, {passive: true});
  
  return outerDiv;
}




function insertRow(position) {
  position = script.insertRow(position);
  if (position === -1)
    return;

  let rowIndex = position - firstLoadedPosition;
  if (rowIndex >= 0 && rowIndex < list.childNodes.length) {
    let node = list.lastChild;
    loadRow(position, node);
    list.insertBefore(node, list.childNodes[rowIndex]);
  }
  else if (rowIndex < 0) {
    let node = list.lastChild;
    loadRow(firstLoadedPosition, node);
    list.insertBefore(node, list.firstChild);
  }

  updateLineNumbers(Math.max(0, rowIndex + 1));
  document.body.style.height = getRowCount() * rowHeight + "px";
}



function deleteRow(position) {
  let [pos, count, modifiedRows] = script.deleteRow(position);

  let rowIndex = Math.max(0, pos - firstLoadedPosition);
  const end = Math.min(pos + count, list.childNodes.length + firstLoadedPosition);

  for (; pos < end; ++pos) {
    let node = list.childNodes[rowIndex];
    loadRow(firstLoadedPosition + list.childNodes.length - 1, node);
    list.appendChild(node);
  }

  for (const position of modifiedRows) {
    let index = position - firstLoadedPosition;
    if (index >= 0 && index < list.childNodes.length) {
      loadRow(position, list.childNodes[index], false);
    }
  }
  
  updateLineNumbers(rowIndex);
  document.body.style.height = getRowCount() * rowHeight + "px";
}



function updateLineNumbers(modifiedRow) {
  let count = list.childNodes.length;
  for (let i = modifiedRow; i < count; ++i) {
    let outerRow = list.childNodes[i];
    let position = i + firstLoadedPosition;
    
    outerRow.firstChild.firstChild.firstChild.nodeValue = String(position).padStart(4);
    outerRow.childNodes[1].position = position;
  }
}



function loadRow(position, outerDiv, movedPosition = true) {
  let innerRow = outerDiv.childNodes[1];
  innerRow.position = position;
  
  //update the line number item of the slide menu
  innerRow.previousSibling.firstChild.firstChild.nodeValue = String(position).padStart(4);
  
  while (innerRow.childNodes.length > 2) {
    buttonPool.push(innerRow.lastChild);
    innerRow.removeChild(innerRow.lastChild);
  }

  if (position >= script.getRowCount()) {
    innerRow.childNodes[1].style.display = "none";
  } else {
    let itemCount = script.getItemCount(position);
    for (let col = 1; col < itemCount; ++col) {
      const [text, style] = script.getItemDisplay(position, col);
      
      let node = getItem(text);
      node.className = "item " + style;
      node.position = col;
      innerRow.appendChild(node);
    }
    
    const indentation = script.getIndentation(position);
    innerRow.childNodes[1].style.width = 6 * indentation + "px";
    innerRow.childNodes[1].style.display = (indentation === 0) ? "none" : "";
  }

  if (movedPosition) {
    let button = innerRow.childNodes[1 + modal.col];

    if (modal.row === position) {
      outerDiv.classList.add("selected");
      button.classList.add("selected");
      innerRow.scrollLeft = button.offsetLeft - window.innerWidth / 2;
    } else {
      outerDiv.classList.remove("selected");
      if (button)
        button.classList.remove("selected");
    }
  }
}

function reloadAllRowsInPlace() {
  document.body.style.height = getRowCount() * rowHeight + "px";

  for (const outerRow of list.childNodes) {
    loadRow(outerRow.childNodes[1].position, outerRow, false);
  }

  //console.log("reloaded all rows in place");
}



function getItem(text) {
  if (buttonPool.length !== 0) {
    let node = buttonPool.pop();
    node.firstChild.nodeValue = text;
    return node;
  } else {
    let node = document.createElement("button");
    node.appendChild(document.createTextNode(text));
    return node;
  }
}



function configureModal(options) {
  while (modal.hasChildNodes()) {
    buttonPool.push(modal.lastChild);
    modal.removeChild(modal.lastChild);
  }

  for (const option of options) {
    let button = getItem(option.text);
    button.className = "item modal-item no-select " + option.style;
    button.position = option.payload;
    modal.appendChild(button);
  }
}

function closeModal() {
  while (modal.hasChildNodes()) {
    buttonPool.push(modal.lastChild);
    modal.removeChild(modal.lastChild);
  }

  let outerRow = list.childNodes[modal.row - firstLoadedPosition];
  if (outerRow) {
    outerRow.classList.remove("selected");

    let button = outerRow.childNodes[1].childNodes[1 + modal.col];
    if (button)
      button.classList.remove("selected");
  }

  modal.row = -1;
  document.body.classList.remove("selected");
}

function menuItemClicked(payload) {
  let response = script.menuItemClicked(modal.row, modal.col, payload);

  if (Array.isArray(response) && response.length > 0) {
    configureModal(response);
    return;
  } else if (typeof response === 'number') {
    if ((response & Script.RESPONSE.ROW_UPDATED) !== 0) {
      let outerRow = list.childNodes[modal.row - firstLoadedPosition];
      if (outerRow) {
        loadRow(modal.row, outerRow, false);
        if (modal.col === -1) {
          outerRow.childNodes[1].scrollLeft = 1e10;
        }
      }
    }

    if ((response & Script.RESPONSE.ROWS_INSERTED) !== 0) {
      insertRow(modal.row + 1);
    }
    
    if (response === Script.RESPONSE.ROW_DELETED) {
      deleteRow(modal.row);
    }

    if (response === Script.RESPONSE.SCRIPT_CHANGED) {
      reloadAllRowsInPlace();
    }

    document.body.style.height = getRowCount() * rowHeight + "px";
  }

  closeModal();
}



function preventDefault(event) {
  event.preventDefault();
}

function modalContainerClicked(event) {
  if (event.target !== this) {
    menuItemClicked(event.target.position);
  } else {
    closeModal();
  }
}

function slideMenuClickHandler(event) {
  let position = this.nextSibling.position;
  if (position <= script.getRowCount()) {
    switch (event.button) {
      case 0:
        insertRow(position);
        break;
      
      case 2:
        if (position < script.getRowCount())
          deleteRow(position);
        break;
    }
  }
}

function rowClickHandler(event) {
  if (menuButton.toggled) {
    menuButton.toggled = false;
    fabMenu.classList.remove("expanded");
    return;
  }

  let row = this.position|0;
  let col = event.target.position|0;
  let options = script.itemClicked(row, col);

  if (typeof options[Symbol.iterator] === 'function') {
    modal.row = row;
    modal.col = col;
    configureModal(options);
    document.body.classList.add("selected");
    this.parentElement.classList.add("selected");
    event.target.classList.add("selected");
  }
  else {
    event.target.firstChild.nodeValue = options.text;
    event.target.className = "item " + options.style;
  }
}



function touchStartHandler(event) {
  if (this.touchId === -1) {
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

function touchMoved(outerRow, touch) {
  let travel = touch.pageX - outerRow.touchStartX;
  
  if (!outerRow.touchCaptured && travel > 10) {
    outerRow.touchCaptured = true;
    outerRow.firstChild.classList.remove("slow-transition");
    outerRow.slideMenuStartWidth = outerRow.firstChild.offsetWidth;
    outerRow.touchStartX += 10;
    travel -= 10;
  }
  
  if (outerRow.touchCaptured) {
    outerRow.firstChild.style.width = outerRow.slideMenuStartWidth + Math.max(travel, 0) + "px";
  }
}

function touchEnded(outerRow, touch) {
  if (outerRow.touchCaptured) {
    const position = outerRow.childNodes[1].position;
    if (position <= script.getRowCount()) {
      let travel = touch.pageX - outerRow.touchStartX;
      
      if (travel > 200) {
        if (position < script.getRowCount())
          deleteRow(position);
      } else if (travel > 80) {
        insertRow(position);
      }
    }
  }
  
  touchCanceled(outerRow);
}

function touchCanceled(outerRow) {
  outerRow.touchId = -1;
  if (outerRow.touchCaptured) {
    outerRow.touchCaptured = false;
    outerRow.firstChild.classList.add("slow-transition");
    outerRow.firstChild.style.width = "";
  }
}


function* stride(start, end, by) {
  if (by === 0)
    return;
  
  by = Math.abs(by);

  if (start < end) {
    for (let i = start; i < end; i += by) yield i;
  } else {
    for (let i = start; i > end; i -= by) yield i;
  }
}

function print(value, terminator) {
  const text = document.createTextNode(String(value) + terminator);
  consoleOutput.appendChild(text);
}

// let httpRequest = new XMLHttpRequest();
// httpRequest.open("GET", "https://api.github.com/gists/2e3aa951f6c3bc5e25f62055075fd67b");
// httpRequest.onreadystatechange = function() {
//   if (httpRequest.readyState === XMLHttpRequest.DONE) {
//       if (httpRequest.status === 200) {
//         console.log(httpRequest.responseText);
//       } else {
//           // There was a problem with the request.
//           // For example, the response may have a 404 (Not Found)
//           // or 500 (Internal Server Error) response code.
//       }
//   } else {
//       // Not ready yet.
//   }
// }
// httpRequest.send();



// let postData = {};
// postData.description = "New test gist";
// postData.files = {};
// postData.files["Jeff"] = {content: "A new challenger"};

// let token = localStorage.getItem("access-token");
// if (!token) {
//   token = prompt("Enter GitHub authorization token with gist permission");
// }

// let httpRequest = new XMLHttpRequest();
// httpRequest.open("POST", "https://api.github.com/gists");
// httpRequest.setRequestHeader('Authorization', 'token ' + token);
// httpRequest.onreadystatechange = function() {
//   console.log("readyState: " + httpRequest.readyState);

//   if (httpRequest.readyState === XMLHttpRequest.DONE) {
//     if (httpRequest.status === 200 || httpRequest.status === 201) {
//       console.log("status: " + httpRequest.status + "\n" + JSON.parse(httpRequest.responseText));
//       localStorage.setItem("access-token", token);
//     }

//     else if (httpRequest.status === 401) {
//       localStorage.removeItem("access-token");
//       alert("Acces token is no longer valid.  Forgetting token.");
//     }

//     else {
//       alert("status: " + httpRequest.status + "\n" + httpRequest.responseText);
//     }
//   }
// }
// httpRequest.send(JSON.stringify(postData));