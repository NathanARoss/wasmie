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
const dragMenuContainer = document.getElementById("drag-menu-container");
const dragMenu = document.getElementById("drag-menu");
const viewCodeButton = document.getElementById("view-code");

dragMenuContainer.classList.add("smooth-slide");

const firstTouch = {
	identifier: null,
	initialY: 0,
	moved: false,
}

playButton.addEventListener("touchstart", function (event) {
	event.stopPropagation();
	event.preventDefault();

	const touch = event.changedTouches[0];
	if (firstTouch.identifier === null) {
		firstTouch.identifier = touch.identifier;
		firstTouch.initialY = touch.pageY;
		firstTouch.moved = false;
		dragMenuContainer.classList.remove("smooth-slide");
	}
});

function existingTouchHandler(event) {
	event.stopPropagation();
	event.preventDefault();

	for (const touch of event.changedTouches) {
		if (touch.identifier === firstTouch.identifier) {
			const delta = firstTouch.initialY - touch.pageY;
			switch (event.type) {
				case "touchmove":
					firstTouch.moved = true;
					if (delta < 0) {
						firstTouch.initialY = touch.pageY;
					} else {
						dragMenuContainer.style.bottom = `calc(-100% + ${delta}px )`;
					}
					break;

				case "touchend":
				case "touchcancel":
					if (delta > 10) {
						//open menu if the user drags upward and releases
						openActionMenu();
					} else if (delta < 10) {
						//close menu if the user drags downward and releases
						closeActionMenu();
					}

					dragMenuContainer.classList.add("smooth-slide");

					firstTouch.identifier = null;
					if (!firstTouch.moved) {
						event.target.onclick();
					}
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


editor.style.height = "10000000px";
let firstLoadedPosition = Math.max(0, Math.floor(window.scrollY / lineHeight) - bufferCount);

const itemPool = [];
let selectedItem;
let selRow = -1;
let selCol = -1;

const ACTIVE_PROJECT_KEY = "TouchScript-active-project-id";
let script;
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
}

function StopLongTapTimer(event) {
	event.preventDefault();

	if (this.longTapTimer !== undefined) {
		clearTimeout(this.longTapTimer);
		this.longTapTimer = undefined;

		//forward the touchstart event to the right click handler
		//it has a preventDefault() and a target property
		this.onclick(event);
	}
}

function enrollElementInLongTapListening(element) {
	element.addEventListener("touchstart", startLongTapTimer);
	element.addEventListener("touchmove", StopLongTapTimer);
	element.addEventListener("touchend", StopLongTapTimer);
	element.addEventListener("touchcancel", StopLongTapTimer);
}


function getWasmBinary() {
	try {
		return script.getWasm();
	} catch (error) {
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
closeActionMenu();

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

	localStorage.removeItem(ACTIVE_PROJECT_KEY);
	dbAction("readonly", "date-created", createNewScript);
	closeMenu();
};

viewCodeButton.onclick = function (event) {
	event.stopPropagation();
	closeActionMenu();

	history.pushState({ action: "disassemble" }, "TouchScript Disassembly");
	window.onpopstate();
};

viewCodeButton.oncontextmenu = function (event) {
	event.preventDefault();
	// saveActiveScriptAsWasm();
	closeActionMenu();
	return false;
};

enrollElementInLongTapListening(viewCodeButton);


menu.childNodes[1].onclick = function () {
	document.onkeydown({ key: "Enter", preventDefault: () => { } });
};

menu.childNodes[2].onclick = function () {
	document.onkeydown({ key: "Backspace", preventDefault: () => { } });
};

menu.childNodes[2].oncontextmenu = function (event) {
	document.onkeydown({ key: "Delete", preventDefault: () => { } });

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
			} catch (error) {
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
		const oldActiveProject = localStorage.getItem(ACTIVE_PROJECT_KEY);

		if (projectID !== oldActiveProject) {
			deSelectActiveProject();
			event.target.classList.add("open");

			localStorage.setItem(ACTIVE_PROJECT_KEY, projectID);
			script = new Script(projectID, true, commitDateCreated, writeLinesInDB, deleteLinesFromDB, dbAction, scriptLoaded);
		}
		closeMenu();
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
		} else {
			const { text, style = "" } = option;
			menuItem = getItem(text, "menu-item " + style);
			menuItem.onclick = function (event) {
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
			} else {
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
					script = new Script(activeProjectId | 0, true, commitDateCreated, writeLinesInDB, deleteLinesFromDB, dbAction, scriptLoaded);
				} else {
					console.log("Project " + activeProjectId + " no longer exists");
					localStorage.removeItem(ACTIVE_PROJECT_KEY);
					createNewScript.apply(objStore);
				}
			}
		} else {
			createNewScript.apply(objStore);
		}

		loadExistingProjectsIntoMenu();
	};
}

/**
 * assumes the objectstore "date-created" is bound to this
 */
function createNewScript() {
	this.getAllKeys().onsuccess = function (event) {
		//find a gap in the IDs, or grab the one after last
		const projectIds = event.target.result;
		let id = projectIds.findIndex((id, index) => id !== index);
		if (id === -1) {
			id = projectIds.length;
		}
		//project IDs must fit within an unsigned byte because the first byte of every
		//line key is the project ID
		let isEixstingProject = false;
		if (id > 255) {
			//load project 255 rather than creatng a new project
			id = 255;
			isEixstingProject = true;
		}

		script = new Script(id, isEixstingProject, commitDateCreated, writeLinesInDB, deleteLinesFromDB, dbAction, scriptLoaded);
	};
}

function saveActiveScriptAsWasm() {
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

	dbAction("readonly", "name", function (id) {
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
	dbAction("readwrite", "last-modified", IDBObjectStore.prototype.put, [new Date(), id]);

	dbAction("readwrite", "lines", function (lines) {
		for (const line of lines) {
			const serialized = {};
			if (line.items.length > 0) {
				serialized.items = line.items.map(item => item.serialize());
			}
			if (line.indent) {
				serialized.indent = line.indent;
			}
			this.put(serialized, line.key);
		}
	}, [script.lines.slice(row, row + count)]);
}

function deleteLinesFromDB(id, lowKey, highKey) {
	dbAction("readwrite", "last-modified", IDBObjectStore.prototype.put, [new Date(), id]);

	const keyRange = IDBKeyRange.bound(lowKey, highKey);
	dbAction("readwrite", "lines", IDBObjectStore.prototype.delete, [keyRange]);
}

function commitDateCreated(id) {
	localStorage.setItem(ACTIVE_PROJECT_KEY, id);
	dbAction("readwrite", "date-created", IDBObjectStore.prototype.add, [new Date(), id]);
	insertProjectListing(id, "Project" + id, true);
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
			year: "numeric", month: "numeric", day: "numeric",
			hour: "numeric", minute: "2-digit"
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
			} else {
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
			} else {
				if (--remaining === 0) {
					assembleProjectMetaData()
				}
			}
		}
	}

	dbAction("readonly", "name", readKeysAndVals, [projectNames]);
	dbAction("readonly", "date-created", readKeysAndVals, [projectDateCreated]);
}