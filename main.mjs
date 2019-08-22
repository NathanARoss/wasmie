const consoleOutput = document.getElementById("console-output");
const editor = document.getElementById("editor");
const playButton = document.getElementById("play-button");
const playButtonAnchor = document.getElementById("play-button-anchor");
const dragMenuContainer = document.getElementById("drag-menu-container");

editor.style.display = "initial";
dragMenuContainer.classList.add("smooth-slide");

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
			console.log(message);
		},
		putc(char) {
			const message = String.fromCharCode(char);
			console.log(message);
		},
		putnum(value) {
			const message = String(value);
			console.log(message);
		},
	}
};

fetch('backend.wasm')
	.then(response => response.arrayBuffer())
	.then(bytes => WebAssembly.instantiate(bytes, imports))
	.then(results => {
		instance = results.instance;
		const exports = instance.exports;

		exports.main(exports.__heap_base);
	});


const firstTouch = {
	identifier: null,
	initialY: 0,
}

playButton.addEventListener("touchstart", function (event) {
	const touch = event.changedTouches[0];
	if (firstTouch.identifier === null) {
		firstTouch.identifier = touch.identifier;
		firstTouch.initialY = touch.pageY;
		dragMenuContainer.classList.remove("smooth-slide");
	}
});

function existingTouchHandler(event) {
	for (const touch of event.changedTouches) {
		if (touch.identifier === firstTouch.identifier) {
			const delta = firstTouch.initialY - touch.pageY;
			switch (event.type) {
				case "touchmove":
					if (delta < 0) {
						firstTouch.initialY = touch.pageY;
					} else {
						dragMenuContainer.style.bottom = `calc(-100vh + ${delta}px )`;
					}
					break;

				case "touchend":
				case "touchcancel":
					firstTouch.identifier = null;
					if (delta > 5) {
						//open menu if the user drags upward and releases
						dragMenuContainer.style.bottom = "0";
					} else if (delta < 5) {
						//close menu if the user drags downward and releases
						dragMenuContainer.style.bottom = "";
					}

					dragMenuContainer.classList.add("smooth-slide");
					break;
			}
		}
	}
}

playButton.addEventListener("touchmove", existingTouchHandler);
playButton.addEventListener("touchend", existingTouchHandler);
playButton.addEventListener("touchcancel", existingTouchHandler);

playButtonAnchor.addEventListener("click", function (event) {
	dragMenuContainer.style.bottom = "0";
});