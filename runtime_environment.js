class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.System = {
      puts(address) {
        const memory = new Uint8Array(self.js.memory.buffer);
        const message = Wasm.decodeString(memory, address);
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