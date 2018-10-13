class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.debugging = {
      print(begin, end) {
        self.print(begin, end)
      },
      printDouble(doubleNum) {
        self.printDouble(doubleNum)
      },
    }
  }
  
  setMemory(memory) {
    this.memory = memory;
  }
  
  print(begin, end) {
    const bytes = this.memory.buffer.slice(begin, end);
    const message = String.fromCharCode.apply(String, new Uint8Array(bytes));
    print(message);
  }

  printDouble(doubleNum) {
    print(String(doubleNum));
  }
}