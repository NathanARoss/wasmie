class RuntimeEnvironment {
  constructor() {
    const wasmMemory = new WebAssembly.Memory({initial: 1});
    const memoryUbytes = new Uint8Array(wasmMemory.buffer);
    this.env = {
      memory: wasmMemory,
      puts(address, size) {
        const data = memoryUbytes.subarray(address, address + size);
        const message = UTF8Decoder.decode(data);
        print(message);
      },
      put(char) {
        const message = String.fromCharCode(char);
        print(message);
      },
      putbool(value) {
        const message = String(!!value);
        print(message);
      },
      putnum(num) {
        const message = String(num);
        print(message);
      },
      putu32(u32Num) {
        if (u32Num < 0) {
          u32Num += 1**32;
        }
        const message = String(u32Num);
        print(message);
      }
    }
    this.Math = Math;
  }
}