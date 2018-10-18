class Wasm {
    static *varint(value) {
        let more = true;
        
        while(more) {
            let byte = value & 0x7F;
            value >>= 7;
        
            /* sign bit of byte is second high order bit (0x40) */
            if ((value === 0 && (byte & 0x40) === 0) || (value === -1 && (byte & 0x40) !== 0)) {
                more = false;
            } else {
                byte |= 0x80;
            }
            
            yield byte;
        }
    }
    
    static *varuint(value) {
        do {
            let byte = value & 0x7F;
            value >>= 7;
            if (value !== 0) /* more bytes to come */
            byte |= 0x80;
            
            yield byte;
        } while (value !== 0);
    }

    static decodeVarint(bytes, offset) {
        let result = 0;
        let shift = 0;
        const size = 32;
        let bytesRead = 0;
        let byte;
        do {
          byte = bytes[offset + bytesRead];
          ++bytesRead;

          result |= (byte & 0x7F) << shift;
          shift += 7;
        } while((byte & 0x80) != 0);
        
        /* sign bit of byte is second high order bit (0x40) */
        if ((shift < size) && (byte & 0x40))
          /* sign extend */
          result |= (~0 << shift);

        return [result, bytesRead];
    }

    static decodeVaruint(bytes, offset) {
        let result = 0;
        let shift = 0;
        let bytesRead = 0;
        while(true) {
            let byte = bytes[offset + bytesRead];
            ++bytesRead;

            result |= (byte & 0x7F) << shift;
            if ((byte & 0x80) == 0)
                break;
            shift += 7;
        }

        return [result, bytesRead];
    }

    //converts a string into an array of UTF-8 bytes
    //the array is prepended by the size of the coded string encoded as a varuint
    //TODO support full UTF-8 rather than just ASCII
    static stringToUTF8(string) {
      return string.split('').map(a => a.charCodeAt());
    }

    static getStringBytesAndData(string) {
        const encoding = Wasm.stringToUTF8(string);
        return [...Wasm.varuint(encoding.length), ...encoding];
    }

    static UTF8toString(ubytes) {
        return String.fromCharCode.apply(String, ubytes);
    }

    static f32ToBytes(num) {
        return new Uint8Array(Float32Array.of(num).buffer);
    }

    static f64ToBytes(num) {
        return new Uint8Array(Float64Array.of(num).buffer);
    }
}

Wasm.section = {
    Type: 1,
    Import: 2,
    Function: 3,
    Table: 4,
    Memory: 5,
    Global: 6,
    Export: 7,
    Start: 8,
    Element: 9,
    Code: 10,
    Data: 11,
}

Wasm.sectionNames = [
    "User-defined",
    "Type",
    "Import",
    "Function",
    "Table",
    "Memory",
    "Global",
    "Export",
    "Start",
    "Element",
    "Code",
    "Data",
]

Wasm.types = {
    i32: 0x7F,
    i64: 0x7E,
    f32: 0x7D,
    f64: 0x7C,
    func: 0x60,
}

Wasm.typeNames = [];
Wasm.typeNames[0x7F] = "i32";
Wasm.typeNames[0x7E] = "i64";
Wasm.typeNames[0x7D] = "f32";
Wasm.typeNames[0x7C] = "f64";
Wasm.typeNames[0x60] = "func";

Wasm.externalKind = {
    Function: 0,
    Table: 1,
    Memory: 2,
    Global: 3,
}

Wasm.externalKindNames = [
    "Function",
    "Table",
    "Memory",
    "Global",
]

Wasm.opcodes = {
    i32: {
        load: 0x28,
        load8_s: 0x2c,
        load8_u: 0x2d,
        load16_s: 0x2e,
        load16_u: 0x2f,
        store: 0x36,
        store8: 0x3a,
        store16: 0x3b,
        const: 0x41,
    },
    i64: {
        const: 0x42,
    },
    f32: {
        const: 0x43,
    },
    f64: {
        const: 0x44,
    },
    call: 0x10,
    drop: 0x1A,
    end: 0x0b,
    get_local: 0x20,
    set_local: 0x21,
    tee_local: 0x22,
    get_global: 0x23,
    set_global: 0x24,
}

Wasm.opcodeNames = [];
Wasm.opcodeNames[0x28] = "i32.load";
Wasm.opcodeNames[0x2c] = "i32.load8_s";
Wasm.opcodeNames[0x2d] = "i32.load8_u";
Wasm.opcodeNames[0x2e] = "i32.load16_s";
Wasm.opcodeNames[0x2f] = "i32.load16_u";
Wasm.opcodeNames[0x36] = "i32.store";
Wasm.opcodeNames[0x3a] = "i32.store8";
Wasm.opcodeNames[0x3b] = "i32.store16";
Wasm.opcodeNames[0x41] = "i32.const";
Wasm.opcodeNames[0x42] = "i64.const";
Wasm.opcodeNames[0x43] = "f32.const";
Wasm.opcodeNames[0x44] = "f64.const";
Wasm.opcodeNames[0x10] = "call";
Wasm.opcodeNames[0x1A] = "drop";
Wasm.opcodeNames[0x0b] = "end";
Wasm.opcodeNames[0x20] = "get_local";
Wasm.opcodeNames[0x21] = "set_local";
Wasm.opcodeNames[0x22] = "tee_local";
Wasm.opcodeNames[0x23] = "get_global";
Wasm.opcodeNames[0x24] = "set_global";