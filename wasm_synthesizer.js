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
            if (value !== 0) {/* more bytes to come */
                byte |= 0x80;
            }
            
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
    
    static decodeBranchTable(bytes, offset) {
      const output = [];
      
      //target_count
      let [val, bytesRead] = Wasm.decodeVaruint(bytes, offset);
      offset += bytesRead;
      output.push(val, bytesRead);
      
      //target_table (has target_count entries)
      for (let i = 0; i < val; ++i) {
        [val, bytesRead] = Wasm.decodeVaruint(bytes, offset);
        offset += bytesRead;
        output.push(val, bytesRead);
      }

      //default_target
      output.push(...Wasm.decodeVaruint(bytes, offset));

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

    static getDisassembly(wasmArrayBuffer) {
      const wasm = new Uint8Array(wasmArrayBuffer);
      const maxOffsetDigits = Math.ceil(Math.log2(wasm.length) / Math.log2(10));
      let offset = 0;
      let output = "";
  
      function printDisassembly(count, comment = "") {
        const bytes = Array.from(wasm.subarray(offset, offset + count));
        const byteText = bytes.map(b => b.toString(16).padStart(2, "0")).join(" ").padEnd(27);
        const addressText = offset.toString().padStart(maxOffsetDigits, '0');
        output += `${byteText} @${addressText}: ${comment}\n`;
        offset += count;
      }
  
      function readVaruintAndPrint(beginComment = "", endComment = "") {
        const [val, bytesRead] = Wasm.decodeVaruint(wasm, offset);
        printDisassembly(bytesRead, beginComment + val + endComment);
        return val;
      }

      function printExpression() {
        const opcodeData = Wasm.opcodeData[wasm[offset]];
        let comment = opcodeData.name;
        let bytesRead = 1;
        
        for (const immediates of opcodeData.immediates) {
          const valsAndBytesRead = immediates(wasm, offset + bytesRead);
          for (let i = 0; i < valsAndBytesRead.length; i += 2) {
            comment += " " + valsAndBytesRead[i];
            bytesRead += valsAndBytesRead[i+1];
          }
        }
        
        printDisassembly(bytesRead, comment);
      }
  
      printDisassembly(4, 'Wasm magic number: "\\0asm"');
      printDisassembly(4, "Wasm version: 1");
  
      const typeDescription = [];
  
      while (offset < wasm.length) {
        output += '\n\n\n';
  
        const sectionCode = wasm[offset];
        printDisassembly(1, "section: " + Wasm.sectionNames[sectionCode] + " ("+sectionCode+")");
  
        const payloadLength = readVaruintAndPrint("size: ", " bytes");
        const end = offset + payloadLength;
  
        let firstItemLabel = sectionCode === Wasm.section.Start ? "entry point: func " : "count: ";
        readVaruintAndPrint(firstItemLabel);
  
        while (offset < end) {
          switch (sectionCode) {
            case Wasm.section.Type: {
              if (wasm[offset] === Wasm.types.func) {
                let bytesRead = 1;

                let comment = "";
                for (const prefix of ["func (", ") -> ("]) {
                  const [count, LEBbytes] = Wasm.decodeVaruint(wasm, offset + bytesRead);
                  bytesRead += LEBbytes;
                  
                  comment += prefix;
                  const types = wasm.slice(offset + bytesRead, offset + bytesRead + count);
                  comment += Array.from(types).map(t => Wasm.typeNames[t & 0x7F]).join(" ");
                  bytesRead += count;
                }
                comment += ')';
  
                typeDescription.push(comment);
  
                //print the comment on the first line. groups bytes in 9s
                do {
                  const count = Math.min(9, bytesRead);
                  printDisassembly(count, comment);
                  bytesRead -= count;
                  comment = "";
                } while (bytesRead > 0)
              } else {
                throw "unrecognized Wasm type " + Wasm.typeNames[type] || type;
              }
            } break;
            
            case Wasm.section.Import: {
              output += '\n';
              for (const description of ['module: "', 'field:  "']) {
                const [stringLength, LEBbytes] = Wasm.decodeVaruint(wasm, offset);
                const end = offset + stringLength + LEBbytes;
        
                const str = Wasm.UTF8toString(wasm.slice(offset + LEBbytes, end));
                const sanitizedStr = str.replace(/\n/g, "\\n").replace(/\0/g, "\\0");
                let comment = description + sanitizedStr + '"';
          
                do {
                  const count = Math.min(9, end - offset);
                  printDisassembly(count, comment);
                  comment = "";
                } while (offset < end);
              }
  
              const exportType = wasm[offset];
              if (exportType === Wasm.externalKind.Memory) {
                //print memory description
                printDisassembly(1, "external " + Wasm.externalKindNames[exportType]);
                const maxPagesSpecifiedFlag = wasm[offset];
                printDisassembly(1, maxPagesSpecifiedFlag ? "limit" : "no limit");
                readVaruintAndPrint("initial pages: ");
  
                if (maxPagesSpecifiedFlag) {
                  readVaruintAndPrint("max allocation: ", " pages");
                }
              } else if (exportType === Wasm.externalKind.Function) {
                //print imported function's signature
                const [type, LEBbytes] = Wasm.decodeVaruint(wasm, offset + 1);
                const comment = "external " + typeDescription[type];
                printDisassembly(LEBbytes + 1, comment);
              }
            } break;
            
            case Wasm.section.Function: {
              const [type, LEBbytes] = Wasm.decodeVaruint(wasm, offset);
              const comment = typeDescription[type];
              printDisassembly(LEBbytes, comment);
            } break;
  
            case Wasm.section.Global: {
              printDisassembly(1, Wasm.typeNames[wasm[offset]]);
              printDisassembly(1, wasm[offset] ? "mutable" : "immutable");
              printExpression(); //expression of propper type
              printExpression(); //Wasm.end
            } break;
            
            case Wasm.section.Code: {
              output += '\n';
              const bodySize = readVaruintAndPrint("func body size: ", " bytes");
              const subEnd = offset + bodySize;
              let [localCount, bytesRead] = Wasm.decodeVaruint(wasm, offset);
              let localVariableComment = "local vars:";
              
              for (let i = 0; i < localCount; ++i) {
                //assumes no more than 127 locals specified at once
                const [count] = Wasm.decodeVaruint(wasm, offset + bytesRead);
                ++bytesRead;
                const type = wasm[offset + bytesRead];
                localVariableComment += (" " + Wasm.typeNames[type]).repeat(count);
                ++bytesRead;
              }
              
              printDisassembly(bytesRead, localVariableComment);
              
              while (offset < subEnd) {
                printExpression();
              }
            } break;
  
            case Wasm.section.Data: {
              readVaruintAndPrint("linear memory index: ");
              printExpression(); //expression of type i32
              printExpression(); //Wasm.end
  
              const dataSize = readVaruintAndPrint("size of data: ", " bytes");
              const subEnd = offset + dataSize;
  
              while (offset < subEnd) {
                //detect printable ASCII characters to display in the comments
                const count = Math.min(9, subEnd - offset);
                const slice = wasm.slice(offset, offset + count);
                const asText = Wasm.UTF8toString(slice).replace(/[^ -~]/g, '.');
                printDisassembly(count, asText);
              }
            } break;
  
            default:
              printDisassembly(1);
          }
        }
  
        //resets the read position to beginning of next section
        offset = end;
      }

      return output;
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
  new OpcodeData("block", Wasm.decodeVaruint), //unsure about the immediate value for branch instructions
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
  new OpcodeData("br_table", Wasm.decodeBranchTable),
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
    Wasm[propName] = i;
  }
}