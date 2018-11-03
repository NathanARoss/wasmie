class Wasm {
    static *varint(value) {
        let more = true;
        
        while(more) {
            let byte = value & 0x7F;
            value = Math.floor(value / 128);
        
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
            value = Math.floor(value / 128);
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
    
    static decodeArrayOfVaruint(bytes, offset) {
      const output = [];
      
      let [val, bytesRead] = Wasm.decodeVaruint(bytes, offset);
      offset += bytesRead;
      output.push(val, bytesRead);
      
      for (let i = 0; i < val; ++i) {
        [val, bytesRead] = Wasm.decodeVaruint(bytes, offset);
        offset += bytesRead;
        output.push(val, bytesRead);
      }
      
      return output;
    }

    //converts a string into an array of UTF-8 bytes
    //the array is prepended by the size of the coded string encoded as a varuint
    //TODO support full UTF-8 rather than just ASCII
    static stringToUTF8(string) {
      return string.split('').map(a => a.charCodeAt());
    }

    static stringToLenPrefixedUTF8(string) {
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
    
    static decodeF32(bytes, offset) {
      return [(new Float32Array(bytes.slice(offset, offset + 4).buffer))[0], 4];
    }
    
    static decodeF64(bytes, offset) {
      return [(new Float64Array(bytes.slice(offset, offset + 8).buffer))[0], 8];
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
    anyFunc: 0x70,
    func: 0x60,
    void: 0x40,
}

Wasm.typeNames = [];
Wasm.typeNames[0x7F] = "i32";
Wasm.typeNames[0x7E] = "i64";
Wasm.typeNames[0x7D] = "f32";
Wasm.typeNames[0x7C] = "f64";
Wasm.typeNames[0x70] = "anyFunc";
Wasm.typeNames[0x60] = "func";
Wasm.typeNames[0x40] = "void";

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

class OpcodeData {
  constructor(name, ...immediates) {
    this.name = name;
    this.immediates = immediates;
  }
}

Wasm.opcodeData = [
  new OpcodeData("unreachable"),
  new OpcodeData("nop"),
  new OpcodeData("block", Wasm.decodeVaruint), //unsure about the immediate value for branch instructuibs
  new OpcodeData("loop", Wasm.decodeVaruint),
  new OpcodeData("if", Wasm.decodeVaruint),
  new OpcodeData("else"),
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  new OpcodeData("end"),
  new OpcodeData("br", Wasm.decodeVaruint),
  new OpcodeData("br_if", Wasm.decodeVaruint),
  new OpcodeData("br_table", Wasm.decodeArrayOfVaruint),
  new OpcodeData("return"),
  new OpcodeData("call", Wasm.decodeVaruint), //0x10
  new OpcodeData("call_indirect", Wasm.decodeVaruint, Wasm.decodeVaruint),
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  new OpcodeData("drop"),
  new OpcodeData("select"),
  undefined,
  undefined,
  undefined,
  undefined,
  new OpcodeData("get_local", Wasm.decodeVaruint), //0x20
  new OpcodeData("set_local", Wasm.decodeVaruint),
  new OpcodeData("tee_local", Wasm.decodeVaruint),
  new OpcodeData("get_global", Wasm.decodeVaruint),
  new OpcodeData("set_global", Wasm.decodeVaruint),
  undefined,
  undefined,
  undefined,
  new OpcodeData("i32.load", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.load", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("f32.load", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("f64.load", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i32.load8_s", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i32.load8_u", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i32.load16_s", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i32.load16_u", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.load8_s", Wasm.decodeVaruint, Wasm.decodeVaruint), //0x30
  new OpcodeData("i64.load8_u", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.load16_s", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.load16_u", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.load32_s", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.load32_u", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i32.store", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.store", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("f32.store", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("f64.store", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i32.store8", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i32.store16", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.store8", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.store16", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("i64.store32", Wasm.decodeVaruint, Wasm.decodeVaruint),
  new OpcodeData("memory.size", Wasm.decodeVaruint),
  new OpcodeData("memory.grow", Wasm.decodeVaruint), //0x40
  new OpcodeData("i32.const", Wasm.decodeVarint),
  new OpcodeData("i64.const", Wasm.decodeVarint),
  new OpcodeData("f32.const", Wasm.decodeF32),
  new OpcodeData("f64.const", Wasm.decodeF64),
  new OpcodeData("i32.eqz"),
  new OpcodeData("i32.eq"),
  new OpcodeData("i32.ne"),
  new OpcodeData("i32.lt_s"),
  new OpcodeData("i32.lt_u"),
  new OpcodeData("i32.gt_s"),
  new OpcodeData("i32.gt_u"),
  new OpcodeData("i32.le_s"),
  new OpcodeData("i32.le_u"),
  new OpcodeData("i32.ge_s"),
  new OpcodeData("i32.ge_u"),
  new OpcodeData("i64.eqz"), //0x50
  new OpcodeData("i64.eq"),
  new OpcodeData("i64.ne"),
  new OpcodeData("i64.lt_s"),
  new OpcodeData("i64.lt_u"),
  new OpcodeData("i64.gt_s"),
  new OpcodeData("i64.gt_u"),
  new OpcodeData("i64.le_s"),
  new OpcodeData("i64.le_u"),
  new OpcodeData("i64.ge_s"),
  new OpcodeData("i64.ge_u"),
  new OpcodeData("f32.eq"),
  new OpcodeData("f32.ne"),
  new OpcodeData("f32.lt"),
  new OpcodeData("f32.gt"),
  new OpcodeData("f32.le"),
  new OpcodeData("f32.ge"), //0x60
  new OpcodeData("f64.eq"),
  new OpcodeData("f64.ne"),
  new OpcodeData("f64.lt"),
  new OpcodeData("f64.gt"),
  new OpcodeData("f64.le"),
  new OpcodeData("f64.ge"),
  new OpcodeData("i32.clz"),
  new OpcodeData("i32.ctz"),
  new OpcodeData("i32.popcnt"),
  new OpcodeData("i32.add"),
  new OpcodeData("i32.sub"),
  new OpcodeData("i32.mul"),
  new OpcodeData("i32.div_s"),
  new OpcodeData("i32.div_u"),
  new OpcodeData("i32.rem_s"),
  new OpcodeData("i32.rem_u"), //0x70
  new OpcodeData("i32.and"),
  new OpcodeData("i32.or"),
  new OpcodeData("i32.xor"),
  new OpcodeData("i32.shl"),
  new OpcodeData("i32.shr_s"),
  new OpcodeData("i32.shr_u"),
  new OpcodeData("i32.rotl"),
  new OpcodeData("i32.rotr"),
  new OpcodeData("i64.clz"),
  new OpcodeData("i64.ctz"),
  new OpcodeData("i64.popcnt"),
  new OpcodeData("i64.add"),
  new OpcodeData("i64.sub"),
  new OpcodeData("i64.mul"),
  new OpcodeData("i64.div_s"),
  new OpcodeData("i64.div_u"), //0x80
  new OpcodeData("i64.rem_s"),
  new OpcodeData("i64.rem_u"),
  new OpcodeData("i64.and"),
  new OpcodeData("i64.or"),
  new OpcodeData("i64.xor"),
  new OpcodeData("i64.shl"),
  new OpcodeData("i64.shr_s"),
  new OpcodeData("i64.shr_u"),
  new OpcodeData("i64.rotl"),
  new OpcodeData("i64.rotr"),
  new OpcodeData("f32.abs"),
  new OpcodeData("f32.neg"),
  new OpcodeData("f32.ceil"),
  new OpcodeData("f32.floor"),
  new OpcodeData("f32.trunc"),
  new OpcodeData("f32.nearest"), //0x90
  new OpcodeData("f32.sqrt"),
  new OpcodeData("f32.add"),
  new OpcodeData("f32.sub"),
  new OpcodeData("f32.mul"),
  new OpcodeData("f32.div"),
  new OpcodeData("f32.min"),
  new OpcodeData("f32.max"),
  new OpcodeData("f32.copysign"),
  new OpcodeData("f64.abs"),
  new OpcodeData("f64.neg"),
  new OpcodeData("f64.ceil"),
  new OpcodeData("f64.floor"),
  new OpcodeData("f64.trunc"),
  new OpcodeData("f64.nearest"),
  new OpcodeData("f64.sqrt"),
  new OpcodeData("f64.add"), //0xa0
  new OpcodeData("f64.sub"),
  new OpcodeData("f64.mul"),
  new OpcodeData("f64.div"),
  new OpcodeData("f64.min"),
  new OpcodeData("f64.max"),
  new OpcodeData("f64.copysign"),
  new OpcodeData("i32.wrap/i64"),
  new OpcodeData("i32.trunc_s/f32"),
  new OpcodeData("i32.trunc_u/f32"),
  new OpcodeData("i32.trunc_s/f64"),
  new OpcodeData("i32.trunc_u/f64"),
  new OpcodeData("i64.extend_s/i32"),
  new OpcodeData("i64.extend_u/i32"),
  new OpcodeData("i64.trunc_s/f32"),
  new OpcodeData("i64.trunc_u/f32"),
  new OpcodeData("i64.trunc_s/f64"), //0xb0
  new OpcodeData("i64.trunc_u/f64"),
  new OpcodeData("f32.convert_s/i32"),
  new OpcodeData("f32.convert_u/i32"),
  new OpcodeData("f32.convert_s/i64"),
  new OpcodeData("f32.convert_u/i64"),
  new OpcodeData("f32.demote/f64"),
  new OpcodeData("f64.convert_s/i32"),
  new OpcodeData("f64.convert_u/i32"),
  new OpcodeData("f64.convert_s/i64"),
  new OpcodeData("f64.convert_u/i64"),
  new OpcodeData("f64.promote/f32"),
  new OpcodeData("i32.reinterpret/f32"),
  new OpcodeData("i64.reinterpret/f64"),
  new OpcodeData("f32.reinterpret/i32"),
  new OpcodeData("f64.reinterpret/i64"),
];

Wasm.opcodes = {};
for (let i = 0; i < Wasm.opcodeData.length; ++i) {
  if (Wasm.opcodeData[i]) {
    const propName = Wasm.opcodeData[i].name.replace(/\./, "_").replace(/\//, "_from_");
    Wasm.opcodes[propName] = i;
  }
}