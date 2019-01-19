class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.System = {
      puts(address) {
        const memory = new Uint8Array(self.js.memory.buffer);
        const [sizeOfString, bytesRead] = Wasm.decodeVaruint(memory, address);
        address += bytesRead;
        const bytes = memory.slice(address, address + sizeOfString);
        const message = Wasm.UTF8toString(bytes);
        print(message);
      },
      put(char) {
        const message = String.fromCharCode(char);
        print(message);
      }
    }
    this.js = {
      memory: new WebAssembly.Memory({initial: 1}),
    }
    this.Math = Math;
  }
}