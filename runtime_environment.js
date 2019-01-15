class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.System = {
      print(address) {
        const memory = new Uint8Array(self.js.memory.buffer);
        const [sizeOfString, bytesRead] = Wasm.decodeVaruint(memory, address);
        address += bytesRead;
        const bytes = memory.slice(address, address + sizeOfString);
        const message = Wasm.UTF8toString(bytes);
        print(message);
      },
      printC(char) {
        const message = String.fromCharCode(char);
        print(message);
      }
    }
    this.js = {
      memory: new WebAssembly.Memory({initial: 1}),
    }
    this.Math = Math;
  }

  inputDouble(defaultVal, min, max) {
    let response = prompt(`Enter a value between ${min} and ${max}:`, defaultVal);

    while (true) {
      if (response === null) {
        print(+defaultVal + "\n");
        return defaultVal;
      }
      if (+response < min) {
        response = prompt(`Too small.  Enter a value between ${min} and ${max}:`, defaultVal);
      }
      else if (+response > max) {
        response = prompt(`Too big.  Enter a value between ${min} and ${max}:`, defaultVal);
      }
      else {
        print(+response + "\n");
        return +response;
      }
    }
  }
}