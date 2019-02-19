const consoleOutput = document.getElementById("console-output");

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
			print(message);
		},
		putc(char) {
			const message = String.fromCharCode(char);
			print(message);
		},
		putnum(value) {
			const message = String(value);
			print(message);
		},
		logputs(ptr, size) {
			const ubytes = new Uint8Array(instance.exports.memory.buffer).subarray(ptr, ptr + size);
			const message = UTF8Decoder.decode(ubytes);
			console.log(message);
		},
	}
};

fetch('backend.wasm')
.then(response => response.arrayBuffer())
.then(bytes => WebAssembly.instantiate(bytes, imports))
.then(results => {
	instance = results.instance;
	instance.exports.start(0);
	instance.exports.start(1);
});