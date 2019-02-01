class RuntimeEnvironment {
  constructor() {
    const wasmMemory = new WebAssembly.Memory({initial: 1});
    const memoryUbytes = new Uint8Array(wasmMemory.buffer);
    this.env = {
      memory: wasmMemory,
      puts(address) {
        const message = Wasm.decodeString(memoryUbytes, address);
        print(message);
      },
      put(char) {
        const message = String.fromCharCode(char);
        print(message);
      }
    }
    this.Math = Math;
  }
}