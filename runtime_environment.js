class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.imports = {
      print(begin, end) {
        self.print(begin, end)
      },
      printF64(doubleNum) {
        self.printDouble(doubleNum)
      },
      inputF64(defaultVal, min, max) {
        return self.inputDouble(defaultVal, min, max);
      },

      memory: new WebAssembly.Memory({initial: 1}),
    }
  }
  
  print(begin, end) {
    const bytes = this.imports.memory.buffer.slice(begin, end);
    const message = Wasm.UTF8toString(new Uint8Array(bytes));
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