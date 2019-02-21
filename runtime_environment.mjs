export default function(printCallback) {
	const wasmMemory = new WebAssembly.Memory({initial: 1});
	const memoryUbytes = new Uint8Array(wasmMemory.buffer);
	const UTF8Decoder = new TextDecoder("utf-8");

	this.env = {
		memory: wasmMemory,
		puts(address, size) {
			const data = memoryUbytes.subarray(address, address + size);
			const message = UTF8Decoder.decode(data);
			printCallback(message);
		},
		put(char) {
			const message = String.fromCharCode(char);
			printCallback(message);
		},
		putbool(value) {
			const message = String(!!value);
			printCallback(message);
		},
		putnum(num) {
			const message = String(num);
			printCallback(message);
		},
		putu32(u32Num) {
			if (u32Num < 0) {
				u32Num += 1**32;
			}
			const message = String(u32Num);
			printCallback(message);
		}
	}
	this.Math = Math;
}