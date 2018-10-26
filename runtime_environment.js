class RuntimeEnvironment {
  constructor() {
    const self = this;
    this.System = {
      print(location) {
        self.print(location)
      },
      printI32(i32Num) {
        print(String(i32Num));
      },
      printU32(u32Num) {
        if (u32Num < 0) {
          u32Num += 4294967296;
        }
        print(String(u32Num));
      },
      printI64(i64Num) {
        //the num is cast to double
        print(String(i64Num));
      },
      printU64(u64Num) {
        //not supported, printed as double
        print(String(u64Num));
      },
      printF32(f32Num) {
        print(String(f32Num));
      },
      printF64(f64Num) {
        print(String(f64Num));
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