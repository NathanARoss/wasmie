import RuntimeEnvironment from "./runtime_environment.mjs";
import Script from "./script.mjs";

const lineHeight = 40;
const bufferCount = 10;
const forwardBufferCount = 4;
let loadedCount = 0;

const editor = document.getElementById("editor");
const menu = document.getElementById("menu");
const runtime = document.getElementById("runtime");
const consoleOutput = document.getElementById("console-output");
const playButton = document.getElementById("play-button");
const playButtonAnchor = document.getElementById("play-button-anchor");
const closeActionMenuButton = document.getElementById("close-action-menu");
const dragMenuContainer = document.getElementById("drag-menu-container");
const dragMenu = document.getElementById("drag-menu");
const viewCodeButton = document.getElementById("view-code");
const exportButton = document.getElementById("export-project");
const importButton = document.getElementById("import-project");

dragMenuContainer.classList.add("smooth-slide");

function doNothing() { }

playButton.activeTouch = {
    identifier: null,
    initialX: 0,
    initialY: 0,
    prevY: 0,
    moved: false,
    direction: 0, //whether the user is draging it upward or downward
};

playButton.addEventListener("touchstart", function (event) {
    event.stopPropagation();
    event.preventDefault();

    const touch = event.changedTouches[0];
    if (this.activeTouch.identifier === null) {
        this.activeTouch.identifier = touch.identifier;
        this.activeTouch.initialY = touch.pageY;
        this.activeTouch.initialX = touch.pageX;
        this.activeTouch.prevY = touch.pageY;
        this.activeTouch.moved = false;
        dragMenuContainer.classList.remove("smooth-slide");
    }
});

function existingTouchHandler(event) {
    event.stopPropagation();
    event.preventDefault();

    for (const touch of event.changedTouches) {
        if (touch.identifier === this.activeTouch.identifier) {
            switch (event.type) {
                case "touchmove":
                    const upwardDistance = this.activeTouch.initialY - touch.pageY;
                    if (upwardDistance < 0) {
                        this.activeTouch.initialY = touch.pageY;
                    }
                    else {
                        dragMenuContainer.style.bottom = `calc(-100% + ${upwardDistance}px )`;
                    }

                    const deltaY = touch.pageY - this.activeTouch.prevY;
                    this.activeTouch.direction += deltaY;
                    this.activeTouch.direction = Math.min(Math.max(this.activeTouch.direction, -10), 10);

                    //detect when the user's finger moves a certain distance
                    const dx = touch.pageX - this.activeTouch.initialX;
                    const dy = touch.pageY - this.activeTouch.initialY;
                    const dot = dx * dx + dy * dy;

                    //say that a touch moved if it travels further than the button's radius
                    if (dot > 25 * 25) {
                        this.activeTouch.moved = true;
                    }

                    this.activeTouch.prevY = touch.pageY;
                    break;

                case "touchend":
                    if (!this.activeTouch.moved) {
                        event.target.onclick(event);
                    }
                    else if (this.activeTouch.direction < 0) {
                        //open menu if the user drags upward and releases
                        openActionMenu();
                    }
                    else if (this.activeTouch.direction >= 0) {
                        //close menu if the user drags downward and releases
                        closeActionMenu();
                    }

                    dragMenuContainer.classList.add("smooth-slide");

                    this.activeTouch.identifier = null;
                    playButton.style.backgroundColor = "";
                    break;

                case "touchcancel":
                    closeActionMenu();
                    playButton.style.backgroundColor = "";
                    break;
            }
        }
    }
}

playButton.addEventListener("touchmove", existingTouchHandler);
playButton.addEventListener("touchend", existingTouchHandler);
playButton.addEventListener("touchcancel", existingTouchHandler);

playButtonAnchor.onclick = function (event) {
    openActionMenu();
};

closeActionMenuButton.onclick = function (event) {
    closeActionMenu();
}


editor.style.height = "10000000px";
let firstLoadedPosition = Math.max(0, Math.floor(window.scrollY / lineHeight) - bufferCount);

const itemPool = [];
let selectedItem;
let selRow = -1;
let selCol = -1;

const ACTIVE_PROJECT_KEY = "TouchScript-active-project-id";
let script;
let scriptHasPreviousSaveData = false;
const samplePrimeProgram = String.raw`{"4,1":{"items":[{"funcDef":-2},{"symbol":41},{"strLit":"Simple Prime Number Generator"},{"symbol":43}]},"4,2":{},"4,3":{"items":[{"funcDef":-2},{"symbol":41},{"strLit":"2\\n3"},{"symbol":43}]},"4,4":{},"4,5":{"items":[{"keyword":4},{"name":"number","type":-13,"id":0,"typeAnnotated":true},{"keyword":5},{"numLit":"5"},{"symbol":31},{"numLit":"1000"},{"keyword":11},{"numLit":"2"}]},"4,6":{"items":[{"keyword":0},{"name":"root","type":-13,"id":1,"typeAnnotated":true},{"symbol":0},{"funcDef":-21},{"symbol":41},{"varDef":0},{"symbol":43}],"indent":1},"4,7":{"items":[{"keyword":4},{"name":"factor","type":-13,"id":2,"typeAnnotated":true},{"keyword":5},{"numLit":"3"},{"symbol":32},{"varDef":1},{"keyword":11},{"numLit":"2"}],"indent":1},"4,8":{"items":[{"keyword":2},{"varDef":0},{"symbol":15},{"varDef":2},{"symbol":25},{"numLit":"0"}],"indent":2},"4,9":{"items":[{"keyword":9},{"loopLayers":2}],"indent":3},"4,11,128":{"indent":1},"4,12":{"items":[{"funcDef":-2},{"symbol":41},{"varDef":0},{"symbol":43}],"indent":1}}`;
const runtimeEnvironment = new RuntimeEnvironment(print);

function longTapHandler(event) {
    event.target.longTapTimer = undefined;
    event.target.oncontextmenu(event);
}

function startLongTapTimer(event) {
    event.preventDefault();

    //forward the touchstart event to the right click handler
    //it has a preventDefault() and a target property
    this.longTapTimer = setTimeout(longTapHandler, 500, event);

    const touch = event.changedTouches[0];
}

//remove the long tap timer if the finger moves too much
function longTapMovementListener(event) {

}

function stopLongTapTimer(event) {
    event.preventDefault();

    if (this.longTapTimer !== undefined) {
        clearTimeout(this.longTapTimer);
        this.longTapTimer = undefined;

        //forward the touchstart event to the right click handler
        //it has a preventDefault() and a target property
        this.onclick(event);
    }
}

function cancelLongTapTimer(event) {
    if (this.longTapTimer !== undefined) {
        clearTimeout(this.longTapTimer);
        this.longTapTimer = undefined;
    }
}

function enrollElementInLongTapListening(element) {
    element.addEventListener("touchstart", startLongTapTimer);
    element.addEventListener("touchmove", longTapMovementListener);
    element.addEventListener("touchend", stopLongTapTimer);
    element.addEventListener("touchcancel", cancelLongTapTimer);
}


function getWasmBinary() {
    try {
        return script.getWasm();
    }
    catch (error) {
        console.error(error);
        print(error);
    }
}

function openActionMenu() {
    dragMenuContainer.style.bottom = "0";
}

function closeActionMenu() {
    dragMenuContainer.style.bottom = "";
}

function deSelectActiveProject() {
    const activeProject = document.querySelector(".project-list-entry.open");
    if (activeProject) {
        activeProject.classList.remove("open");
    }
}

playButton.onclick = function (event) {
    event.stopPropagation();
    closeActionMenu();

    history.pushState({ action: "run" }, "TouchScript Runtime");
    window.onpopstate();
};

document.getElementById("new-project").onclick = function (event) {
    event.stopPropagation();
    deSelectActiveProject();
    closeActionMenu();
    closeMenu();

    if (db) {
        dbAction("readonly", "date-created", createNewScript);
    } else {
        script = new Script(0, doNothing, doNothing, doNothing, scriptLoaded, "{}");
    }
};

viewCodeButton.onclick = function (event) {
    event.stopPropagation();
    closeActionMenu();

    history.pushState({ action: "disassemble" }, "TouchScript Disassembly");
    window.onpopstate();

    // viewCodeButton.style.backgroundColor = "yellow";

    // setTimeout(() => viewCodeButton.style.backgroundColor = "", 100);
};

viewCodeButton.oncontextmenu = function (event) {
    event.preventDefault();
    closeActionMenu();

    const wasm = getWasmBinary();
    if (wasm) {
        saveContentAsActiveProgramName(".wasm", wasm);
    }

    // viewCodeButton.style.backgroundColor = "green";

    return false;
};

enrollElementInLongTapListening(viewCodeButton);

exportButton.onclick = function (event) {
    const serializedLines = {};

    for (const line of script.lines) {
        const serialized = {};
        if (line.items.length) {
            serialized.items = line.items.map(item => item.serialize());
        }
        if (line.indent) {
            serialized.indent = line.indent;
        }

        const key = new Uint8Array(line.key.slice(1));
        serializedLines[key] = serialized;
    }

    const programAsAString = JSON.stringify(serializedLines);

    //replace every occurance of `\n` with `\\n` so it is processed correctly by JSON.parse()
    programAsAString.replace(/\\n/g, String.raw`\\n`);
    console.log(programAsAString);
    saveContentAsActiveProgramName(".proj", programAsAString);
    closeActionMenu();
}

importButton.addEventListener("change", function () {
    deSelectActiveProject();
    closeActionMenu();
    closeMenu();
    const input = this.files[0];
    this.value = null;

    var reader = new FileReader();
    reader.onload = function () {
        scriptHasPreviousSaveData = false;

        if (db) {
            dbAction("readonly", "date-created", createNewScript, [{ requestedSampleProgram: reader.result, forceSampleProgram: true }]);
        } else {
            script = new Script(0, doNothing, doNothing, doNothing, scriptLoaded, reader.result);
        }
    };
    reader.readAsText(input);
}, false);


menu.childNodes[1].onclick = function () {
    document.onkeydown({ key: "Enter", preventDefault: doNothing });
};

menu.childNodes[2].onclick = function () {
    document.onkeydown({ key: "Backspace", preventDefault: doNothing });
};

menu.childNodes[2].oncontextmenu = function (event) {
    document.onkeydown({ key: "Delete", preventDefault: doNothing });

    event.preventDefault();
    event.stopPropagation();
};

document.body.onresize = function () {
    const potentialLoadedCount = Math.ceil(window.innerHeight / lineHeight) + bufferCount;

    if (potentialLoadedCount > loadedCount) {
        for (; loadedCount < potentialLoadedCount; ++loadedCount) {
            const newLine = createLine();
            editor.insertBefore(newLine, editor.firstChild);
        }

        reloadAllLines();

        //allow the viewport to scroll past the currently loaded lines
        editor.style.height = getLineCount() * lineHeight + "px";
    }
};


window.onpopstate = function (event) {
    if (!event) {
        event = { state: history.state };
    }

    editor.style.display = "";
    runtime.style.display = "";

    if (!event.state) {
        document.title = "TouchScript"

        consoleOutput.innerHTML = "";
        editor.style.display = "initial";
    }
    else if (event.state.action === "run") {
        document.title = "TouchScript Runtime";

        const wasm = getWasmBinary();

        if (wasm !== undefined) {
            try {
                WebAssembly.instantiate(wasm, runtimeEnvironment)
            }
            catch (error) {
                print(error);
            }
        }

        runtime.style.display = "initial";
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
        runtime.style.display = "initial";
    }
}

function scriptLoaded() {
    document.body.onresize();
    window.onpopstate();
    reloadAllLines();

    //detect when items need to be loaded in the direction of scroll
    //take nodes from the back to add to the front
    window.onscroll = function () {
        const firstVisiblePosition = Math.floor(window.scrollY / lineHeight);

        //keep a number of lines prepared for both direction
        while ((firstVisiblePosition - bufferCount + forwardBufferCount > firstLoadedPosition) &&
            (firstLoadedPosition + loadedCount < getLineCount())) {
            const position = firstLoadedPosition + loadedCount;
            const line = editor.childNodes[position % loadedCount];
            loadLine(position, line);
            ++firstLoadedPosition;
        }

        while ((firstVisiblePosition - forwardBufferCount < firstLoadedPosition) &&
            (firstLoadedPosition > 0)) {
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
        const oldActiveProject = localStorage.getItem(ACTIVE_PROJECT_KEY);

        if (projectID !== oldActiveProject) {
            deSelectActiveProject();
            event.target.classList.add("open");

            localStorage.setItem(ACTIVE_PROJECT_KEY, projectID);
            scriptHasPreviousSaveData = true;
            script = new Script(projectID, writeLinesInDB, deleteLinesFromDB, dbAction, scriptLoaded);
        }
        closeMenu();
    }
}

function deleteProject(event) {
    const entry = this.parentElement;
    const id = entry.projectId;

    if (script.id === id) {
        dbAction("readonly", "date-created", createNewScript);
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
    lineDiv.onclick = lineClickHandler;
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
    }
    else {
        const itemCount = script.getItemCount(position);

        for (let col = 0; col < itemCount; ++col) {
            const [text, style] = script.getItem(position, col).getDisplay();
            const node = getItem(text, "item " + style, col);

            line.appendChild(node);
        }

        const indent = script.getIndent(position);
        if (indent > 0) {
            line.style.setProperty("--x", indent);
        }
        else {
            line.style.removeProperty("--x");
        }
        line.classList.toggle("half-x", script.isStartingScope(position));
    }

    if (line.position !== position) {
        line.style.transition = "none";
        const isShiftedDown = selRow !== -1 && position > selRow;
        line.style.setProperty("--y", position + visualShift + isShiftedDown | 0);
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
            menuItem.onfocus = closeActionMenu;
            menuItem.oninput = option.oninput;
            menuItem.onkeydown = (event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                    event.preventDefault();
                    menuItem.onsubmit();
                }
            };
        }
        else {
            const { text, style = "" } = option;
            menuItem = getItem(text, "menu-item " + style);
            menuItem.onclick = function (event) {
                const response = option.action.apply(script, option.args || []);

                if (Array.isArray(response) && response.length > 0) {
                    configureMenu(response);
                }
                else {
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
        menu.style.setProperty("--y", selRow + 1 - isShiftedUp | 0);

        menu.offsetHeight;
        menu.style.transition = "";
    }

    const insertPosition = selRow + (selCol !== 0 && selRow !== script.lineCount) | 0;

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
        line.style.setProperty("--y", line.position + (line.position > selRow) | 0);
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

    closeActionMenu();
}


document.onkeydown = function (event) {
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
            }
            else {
                selCol = -1;
                ++selRow;
                response = script.insertLine(selRow);
            }

            if ("lineInserted" in response) {
                script.saveLines(response.lineInserted | 0);
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
        const position = response.removeLinesPosition | 0;
        const count = response.removeLinesCount | 0;
        removeLines(position, count);
        selCol = -1;
    }

    if ("lineUpdated" in response) {
        loadLine(selRow, editor.childNodes[selRow % loadedCount]);
        editor.style.height = getLineCount() * lineHeight + "px";
    }

    if ("lineInserted" in response) {
        insertLine(response.lineInserted | 0);
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
    // if (actionMenu.scrollTop > 0) {
    closeActionMenu();
    // }

    if (event.target.nodeName === "BUTTON") {
        const row = this.position | 0;
        const col = event.target.position | 0;
        if (row === selRow && col === selCol) {
            closeMenu();
        }
        else {
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
    }
    else {
        consoleOutput.lastChild.nodeValue += value;
    }
}

let db; {
    const openRequest = indexedDB.open("TouchScript", 1);
    openRequest.onerror = (event) => {
        console.log("Error opening database: " + event.message + "\nCannot save programs");
        script = new Script(0, doNothing, doNothing, doNothing, scriptLoaded, samplePrimeProgram);
        db = null;
    }

    openRequest.onupgradeneeded = function (event) {
        console.log("upgrading database");
        db = event.target.result;
        db.createObjectStore("name");
        db.createObjectStore("last-modified");
        db.createObjectStore("date-created");
        db.createObjectStore("lines");
        db.createObjectStore("save-data");
    };
    openRequest.onsuccess = function (event) {
        db = event.target.result;
        db.onerror = event => console.dir(event.target.error);

        const transaction = db.transaction("date-created", "readonly");
        const objStore = transaction.objectStore("date-created");

        const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY);
        if (activeProjectId !== null) {
            objStore.get(activeProjectId | 0).onsuccess = function (event) {
                if (event.target.result !== undefined) {
                    scriptHasPreviousSaveData = true;
                    script = new Script(activeProjectId | 0, writeLinesInDB, deleteLinesFromDB, dbAction, scriptLoaded);
                }
                else {
                    console.log("Project " + activeProjectId + " no longer exists");
                    createNewScript.apply(objStore, [{ requestedSampleProgram: samplePrimeProgram, isInitialPageLoad: true }]);
                }
            }
        }
        else {
            createNewScript.apply(objStore, [{ requestedSampleProgram: samplePrimeProgram, isInitialPageLoad: true }]);
        }

        loadExistingProjectsIntoMenu();
    };
}

/**
 * assumes the objectstore "date-created" is bound to this
 *
 * Either open an empty script with an unused ID, or open project 255
 */
function createNewScript(options) {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);

    this.getAllKeys().onsuccess = function (event) {
        //find a gap in the IDs, or grab the one after last
        const projectIds = event.target.result;
        let id = projectIds.findIndex((id, index) => id !== index);
        if (id === -1) {
            id = projectIds.length;
        }
        //project IDs must fit within an unsigned byte because the first byte of every
        //line key is the project ID
        scriptHasPreviousSaveData = false;
        if (id > 255) {
            //load project 255 rather than creatng a new project
            id = 255;
            scriptHasPreviousSaveData = true;
            alert("256 programs exist, so you're editing program 255 rather than a new one");
        }

        let sampleProgram = null;
        if (!scriptHasPreviousSaveData && options && options.requestedSampleProgram && (
            options.isInitialPageLoad && projectIds.length === 0 || options.forceSampleProgram
        )) {
            //give new users a sample program to edit.
            //pressing the new script button will just give a blank program
            //pressing the import button will load the uploaded file unless all 256 programs are taken up
            sampleProgram = options.requestedSampleProgram;
        }

        script = new Script(id, writeLinesInDB, deleteLinesFromDB, dbAction, scriptLoaded, sampleProgram);
    };
}

function saveFile(filename, content) {
    var a = document.createElement('a');
    a.href = window.URL.createObjectURL(new File([content], filename));
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    window.URL.revokeObjectURL(a.href);
}

function saveContentAsActiveProgramName(extension, content) {
    if (!db) {
        saveFile("temp" + extension, content);
    } else {
        dbAction("readonly", "name", function (id) {
            const request = this.get(id);
            request.onsuccess = (event) => {
                if (event.target.result) {
                    saveFile(event.target.result + extension, content);
                }
                else {
                    saveFile("Project " + id + extension, content);
                }
            };
            request.onerror = (event) => {
                console.log("Error getting project name: ", event.target.error);
                saveFile("temp" + extension, content);
            };
        }, [script.id]);
    }

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
function writeLinesInDB(id, row, count) {
    let linesToSave;

    if (!scriptHasPreviousSaveData) {
        localStorage.setItem(ACTIVE_PROJECT_KEY, id);
        dbAction("readwrite", "date-created", IDBObjectStore.prototype.add, [new Date(), id]);
        insertProjectListing(id, "Project" + id, true);

        scriptHasPreviousSaveData = true;
        linesToSave = script.lines;
    } else {
        linesToSave = script.lines.slice(row, row + count);
    }

    dbAction("readwrite", "last-modified", IDBObjectStore.prototype.put, [new Date(), id]);

    dbAction("readwrite", "lines", function (lines) {
        for (const line of lines) {
            const serialized = {};
            if (line.items.length) {
                serialized.items = line.items.map(item => item.serialize());
            }
            if (line.indent) {
                serialized.indent = line.indent;
            }
            this.put(serialized, line.key);
        }
    }, [linesToSave]);
}

function deleteLinesFromDB(id, lowKey, highKey) {
    if (!scriptHasPreviousSaveData) {
        writeLinesInDB(id, 0, script.lines.length);
    } else {
        dbAction("readwrite", "last-modified", IDBObjectStore.prototype.put, [new Date(), id]);

        const keyRange = IDBKeyRange.bound(lowKey, highKey);
        dbAction("readwrite", "lines", IDBObjectStore.prototype.delete, [keyRange]);
    }
}

function getLineKeyRangeForProject(id) {
    return IDBKeyRange.bound(Uint8Array.of(id), Uint8Array.of(id + 1), false, true);
}

function insertProjectListing(id, name, isSelected) {
    const label = document.createElement("p");
    label.textContent = name;

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete delete-project-button";
    deleteButton.onclick = deleteProject;

    const entry = document.createElement("div");
    entry.className = "project-list-entry";
    entry.appendChild(label);
    entry.appendChild(deleteButton);
    entry.onclick = selectProject;

    if (isSelected) {
        entry.classList.add("open");
    }

    entry.projectId = id;
    dragMenu.appendChild(entry);
}

function loadExistingProjectsIntoMenu() {
    function getDateString(date) {
        return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    //read all the project metadata into RAM before building the DOM
    const projectNames = new Map();
    const projectDateCreated = new Map();

    function assembleProjectMetaData() {
        for (const id of projectDateCreated.keys()) {
            let name;
            const isSelected = (script.id === id);

            if (projectNames.has(id)) {
                name = projectNames.get(id);
            }
            else {
                name = "Project " + id;
            }

            insertProjectListing(id, name, isSelected);
        }
    }

    let remaining = 2;

    function readKeysAndVals(map) {
        this.openCursor().onsuccess = function (event) {
            const cursor = event.target.result;
            if (cursor) {
                map.set(cursor.primaryKey, cursor.value);
                cursor.continue();
            }
            else {
                if (--remaining === 0) {
                    assembleProjectMetaData()
                }
            }
        }
    }

    dbAction("readonly", "name", readKeysAndVals, [projectNames]);
    dbAction("readonly", "date-created", readKeysAndVals, [projectDateCreated]);
}