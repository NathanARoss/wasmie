"use strict";

const rowHeight = 40;
const bufferCount = 10;
const forwardBufferCount = 4;
let loadedCount = 0;
let firstLoadedPosition = 0;

const list = document.getElementById("list");
const spacer = document.getElementById("spacer");
const debug = document.getElementById("debug");
const canvas = document.getElementById("canvas");
const editor = document.getElementById("editor_div");
const modal = document.getElementById("modal");
const menuButton = document.getElementById("menu-button");
const viewCodeButton = document.getElementById("view-code-button");
const fabMenu = document.getElementById("FAB-menu");
const runtime = document.getElementById("runtime");
const context = canvas.getContext("2d", { alpha: false });

let buttonPool = [];

let renderLoop = 0;
let error = null;
let eventHandlers = new Object(null);

const script = new Script();

menuButton.addEventListener("click", function(event) {
  console.log(this);
  if (fabMenu.offsetHeight > 60) {
    window.location.hash = "#run";
  }
}, {passive: true});

viewCodeButton.addEventListener("click", function(event) {
  window.location.hash = "#debug";
}, {passive: true});

modal.addEventListener("click", modalContainerClicked);

canvas.addEventListener("contextmenu", preventDefault);

canvas.addEventListener("touchstart", function(event) {
  if (eventHandlers.ontouchstart) {
    for (const touch of event.changedTouches)
      eventHandlers.ontouchstart(touch.pageX * window.devicePixelRatio, touch.pageY * window.devicePixelRatio, touch.identifier);
  }
}, {passive: true});

canvas.addEventListener("touchmove", function(event) {
  if (eventHandlers.ontouchmove) {
    for (const touch of event.changedTouches)
      eventHandlers.ontouchmove(touch.pageX * window.devicePixelRatio, touch.pageY * window.devicePixelRatio, touch.identifier);
  }
}, {passive: true});

canvas.addEventListener("touchend", function(event) {
  if (eventHandlers.ontouchend) {
    for (const touch of event.changedTouches)
      eventHandlers.ontouchend(touch.pageX * window.devicePixelRatio, touch.pageY * window.devicePixelRatio, touch.identifier);
  }

  event.preventDefault();
}, {passive: false});

canvas.addEventListener("mousedown", function(event) {
  if (eventHandlers.onmousedown) {
    eventHandlers.onmousedown(event.x * window.devicePixelRatio, event.y * window.devicePixelRatio, event.button);
  }
}, {passive: true});

canvas.addEventListener("mousemove", function(event) {
  if (eventHandlers.onmousemove) {
    eventHandlers.onmousemove(event.x * window.devicePixelRatio, event.y * window.devicePixelRatio, event.movementX * window.devicePixelRatio, event.movementY * window.devicePixelRatio);
  }
}, {passive: true});

canvas.addEventListener("mouseup", function(event) {
  if (eventHandlers.onmouseup) {
    eventHandlers.onmouseup(event.x * window.devicePixelRatio, event.y * window.devicePixelRatio, event.button);
  }

  event.preventDefault;
}, {passive: false});



document.body.onresize = function () {
  let newLoadedCount = Math.ceil(window.innerHeight / rowHeight) + bufferCount;
  let diff = newLoadedCount - loadedCount;
  loadedCount = newLoadedCount;
  
  //allow the viewport to scroll past the currently loaded rows
  if (window.location.hash === "")
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

  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
  
  if (eventHandlers.onresize)
    eventHandlers.onresize(canvas.width, canvas.height);
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



document.body.onhashchange = function() {
  if (window.location.hash === "") {
    editor.style.display = "";
    runtime.style.display = "none";

    if (renderLoop !== 0) {
      window.cancelAnimationFrame(renderLoop)
      renderLoop = 0;
    }

    if (error !== null) {
      alert(error);
      error = null;
    }
    
    eventHandlers = new Object(null);
    document.body.style.height = getRowCount() * rowHeight + "px";
  }
  else if (window.location.hash === "#debug") {
    const js = script.getJavaScript();
    alert(js);
    window.location.hash = "";
  }
  
  else {
    context.clearRect(0, 0, canvas.width, canvas.height);
    editor.style.display = "none";
    runtime.style.display = "";
    
    try {
      const js = script.getJavaScript();
      (new Function(js)) ();
    } catch (e) {
      //error = e;
      console.log(e);
      window.location.hash = "";
    }
    
    if (renderLoop === 0 && eventHandlers.ondraw)
      renderLoop = window.requestAnimationFrame(draw);
    
    document.body.style.height = "auto";
  }
};
document.body.onhashchange();



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
  script.insertRow(position);

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
  script.deleteRow(position);

  let rowIndex = position - firstLoadedPosition;
  let node = list.childNodes[rowIndex];
  
  let newPosition = firstLoadedPosition + loadedCount - 1;
  loadRow(newPosition, node);
  list.appendChild(node);
  
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



function loadRow(position, rowDiv, movedPosition = true) {
  let innerRow = rowDiv.childNodes[1];
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
      const [text, style] = script.getItem(position, col);
      
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
      rowDiv.classList.add("selected");
      button.classList.add("selected");
      innerRow.scrollLeft = button.offsetLeft - window.innerWidth / 2;
    } else {
      rowDiv.classList.remove("selected");
      if (button)
        button.classList.remove("selected");
    }
  }
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
      insertRow(modal.row + 2);
    }

    if (response === Script.RESPONSE.SCRIPT_CHANGED) {
      for (const outerRow of list.childNodes) {
        loadRow(outerRow.childNodes[1].position, outerRow, false);
      }
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
  if (position < script.getRowCount()) {
    switch (event.button) {
      case 0:
        insertRow(position + 1);
        break;
      
      case 2:
        deleteRow(position);
        break;
    }
  }
}

function rowClickHandler(event) {
  if (fabMenu.offsetHeight < 200) {
    let row = this.position|0;
    let col = event.target.position|0;
    let options = script.itemClicked(row, col);

    if (Array.isArray(options)) {
      // if (options.length === 1) {
      //   modal.row = row;
      //   modal.col = col;
      //   menuItemClicked(options[0].payload);
      // } else if (options.length > 1) {
        modal.row = row;
        modal.col = col;
        configureModal(options);
        document.body.classList.add("selected");
        this.parentElement.classList.add("selected");
        event.target.classList.add("selected");
      //}
    }
    else {
      event.target.firstChild.nodeValue = options.text;
      event.target.className = "item " + options.style;
    }
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
    if (position < script.getRowCount()) {
      let travel = touch.pageX - outerRow.touchStartX;
      
      if (travel > 200) {
        deleteRow(position);
      } else if (travel > 80) {
        insertRow(position + 1);
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


function stride(start, end, by) {
  let iterable = {start, end, by};
  iterable[Symbol.iterator] = function* () {
    for (let i = this.start; i != this.end; i += this.by) {
      yield i;
    }
  };

  return iterable;
}

function drawCircle(x, y, r, color) {
  r = Math.abs(r);

  context.beginPath();
  context.fillStyle = color;
  context.arc(x,y,r, 0,2*Math.PI);
  context.fill();
}

function drawRectangle(x, y, w, h, color) {
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
}

function drawText(x, y, size, color, text) {
  context.textBaseline = "top";
  context.font = size + "px Monospace";
  context.fillStyle = color;
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; ++i) {
    context.fillText(lines[i], x, y + i * size); 
  }
}

function draw(timestamp) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  eventHandlers.ondraw(timestamp);
  renderLoop = window.requestAnimationFrame(draw);
}