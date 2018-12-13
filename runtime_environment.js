class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.System = {
      print(location) {
        self.print(location)
      },
    }
    this.js = {
      memory: new WebAssembly.Memory({initial: 1}),
    }
    this.Math = Math;
  }
  
  print(location) {
    const memory = new Uint8Array(this.js.memory.buffer);
    const [sizeOfString, bytesRead] = Wasm.decodeVaruint(memory, location);
    location += bytesRead;
    const bytes = memory.slice(location, location + sizeOfString);
    const message = Wasm.UTF8toString(bytes);
    print(message);
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