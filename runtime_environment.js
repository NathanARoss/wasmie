class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.environment = {
      print(begin, end) {
        self.print(begin, end)
      },
      printDouble(doubleNum) {
        self.printDouble(doubleNum)
      },

      memory: new WebAssembly.Memory({initial: 1}),
    }
  }
  
  print(begin, end) {
    const bytes = this.environment.memory.buffer.slice(begin, end);
    const message = String.fromCharCode.apply(String, new Uint8Array(bytes));
    print(message);
  }

  printDouble(doubleNum) {
    print(String(doubleNum));
  }
}