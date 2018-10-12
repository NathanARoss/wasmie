class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.debugging = {
      println(begin, end) {self.println(begin, end)}
    }
  }
  
  setMemory(memory) {
    this.memory = memory;
  }
  
  println(begin, end) {
    const bytes = this.memory.buffer.slice(begin, end);
    const message = String.fromCharCode.apply(String, new Uint8Array(bytes));
    print(message + "\n");
  }
}