class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.System = {
      print(location) {
        self.print(location)
      },
      printF64(doubleNum) {
        self.printDouble(doubleNum)
      },
      inputF64(defaultVal, min, max) {
        return self.inputDouble(defaultVal, min, max);
      },
    }
    this.js = {
      memory: new WebAssembly.Memory({initial: 1}),
    }
  }
  
  print(location) {
    const memory = new Uint8Array(this.js.memory.buffer);
    const [sizeOfString, bytesRead] = Wasm.decodeVaruint(memory, location);
    location += bytesRead;
    const message = Wasm.UTF8toString(memory.slice(location, location + sizeOfString));
    print(message);
  }

  printDouble(doubleNum) {
    print(String(doubleNum));
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