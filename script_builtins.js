"use strict";

class VarDef {
  constructor(name, type, scope) {
    this.name = name;
    this.type = type;
    this.scope = scope;
    this.id = VarDef.nextId++;
  }

  getDisplay() {
    return [this.type.text + '\n' + this.name, "keyword vardef"];
  }

  serialized() {
    const data = [0];
    data.push(...Wasm.stringToLenPrefixedUTF8(this.name));
    data.push(...Wasm.varuint(this.type.id));
    data.push(...Wasm.varuint(this.scope.id));
    return data;
  }

  static deSerialize(data, offset) {
    let [val, bytesRead] = Wasm.decodeVaruint(data, offset);
    offset += bytesRead;
    const name = Wasm.UTF8toString(data.slice(offset, offset + val));
    offset += val;

    [val, bytesRead] = Wasm.decodeVaruint(data, offset);
    const type = val;
    offset += bytesRead;
    
    [val, bytesRead] = Wasm.decodeVaruint(data, offset);
    const scope = val;

    return {name, type, scope};
  }
}
VarDef.nextId;

class VarRef {
  constructor(varDef, currentScope) {
    this.varDef = varDef;
    this.displayScope = (this.varDef.scope !== currentScope);
  }

  getDisplay() {
    if (this.displayScope)
      return [this.varDef.scope.text + '\n' + this.varDef.name, "keyword"];
    else
      return [this.varDef.name, ""];
  }

  serialized() {
    const data = [1];
    data.push(...Wasm.varuint(this.varDef.id));
    data.push(...Wasm.varuint(this.currentScope.id));
    return data;
  }

  static deSerialize(data, offset) {
    let [val, bytesRead] = Wasm.decodeVaruint(data, offset);
    const varDef = val;
    offset += bytesRead;

    [val, bytesRead] = Wasm.decodeVaruint(data, offset);
    const currentScope = val;

    return {varDef, currentScope};
  }
}

class FuncSig {
  constructor(scope, name, returnType, ...parameters) {
    this.scope = scope;
    this.name = name;
    this.returnType = returnType;

    this.parameters = [];
    for (const param of parameters) {
      const parameter = {
        type: param[0],
        name: param[1],
        default: param[2],
      };

      if (parameter.default !== undefined) {
        parameter.name += "\n" + parameter.default;
      }

      this.parameters.push(parameter);
    }
  }

  getDisplay() {
    if (this.returnType.size === 0)
      return [this.name, "funcdef"];
    else
      return [this.returnType.text + '\n' + this.name, "keyword funcdef"];
  }
}

class ImportedFunc {
  constructor(signature, moduleName, fieldName) {
    this.signature = signature;
    this.moduleName = moduleName;
    this.fieldName = fieldName;
  }

  getDisplay() {
    return [this.signature.name, "funcdef"];
  }
}

class PredefinedFunc {
  constructor(signature, ...wasmCode) {
    this.signature = signature;
    this.wasmCode = wasmCode;
  }

  getDisplay() {
    return [this.signature.name, "funcdef"];
  }
}

class MacroFunc {
  constructor(signature, ...wasmCode) {
    this.signature = signature;
    this.wasmCode = wasmCode;
  }

  getDisplay() {
    return [this.signature.name, "funcdef"];
  }
}

class FuncRef {
  constructor(funcDef, currentScope) {
    this.funcDef = funcDef;
    this.displayScope = (this.funcDef.signature.scope !== currentScope);
  }

  getDisplay() {
    if (this.displayScope)
      return [this.funcDef.signature.scope.text + '\n' + this.funcDef.signature.name, "keyword call"];
    else
      return [this.funcDef.signature.name, "call"];
  }

  serialized() {
    //TODO for now I assume every function reference is to a builtin function
    const builtinFuncIndex = script.BuiltIns.functions.indexOf(this.funcDef);
    console.log("builtinFuncIndex", builtinFuncIndex);

    const data = [3];
    data.push(...Wasm.varuint(builtinFuncIndex));
    return data;
  }

  static deSerialize(data, offset) {
    //TODO for now I assume every function reference is to a builtin function
    const [builtinFuncIndex, bytesRead] = Wasm.decodeVaruint(data, offset);
    console.log("builtinFuncIndex", builtinFuncIndex);

    return {builtinFuncIndex};
  }
}

class TypeDef {
  constructor(text, size) {
    this.text = text;
    this.size = size;
  }

  serialized() {
    const data = [4];
    data.push(...Wasm.stringToLenPrefixedUTF8(this.text));
    data.push(...Wasm.varuint(this.size));
    return data;
  }

  static deSerialize(data, offset) {
    let [val, bytesRead] = Wasm.decodeVaruint(data, offset);
    offset += bytesRead;
    const text = Wasm.UTF8toString(data.slice(offset, offset + val));
    offset += val;

    [val, bytesRead] = Wasm.decodeVaruint(data, offset);
    const size = val;

    return {text, size};
  }
}

class ArgHint {
  constructor(funcDef, argIndex) {
    this.funcDef = funcDef;
    this.argIndex = argIndex;
  }

  getDisplay() {
    return [this.funcDef.signature.parameters[this.argIndex].name, "comment"];
  }

  serialized() {
    //TODO for now I assume every function reference is to a builtin function
    const builtinFuncIndex = script.BuiltIns.functions.indexOf(this.funcDef);
    console.log("builtinFuncIndex", builtinFuncIndex);

    const data = [5];
    data.push(...Wasm.varuint(builtinFuncIndex));
    return data;
  }

  static deSerialize(data, offset) {
    //TODO for now I assume every function reference is to a builtin function
    const [builtinFuncIndex, bytesRead] = Wasm.decodeVaruint(data, offset);
    console.log("builtinFuncIndex", builtinFuncIndex);

    return {builtinFuncIndex};
  }
}

class Symbol {
  constructor(text, precedence, options, ...uses) {
    this.text = text;
    this.precedence = precedence;
    Object.assign(this, options);
    if (!options || options.preceedsExpression === undefined) {
      this.preceedsExpression = true;
    }
    this.isBinary = this.isArith || this.isBool;
    
    this.uses = new Map();
    for (const use of uses) {
      const [resultType, operandType, ...wasmCode] = use;
      this.uses.set(operandType, {resultType, wasmCode});
    }
  }

  getDisplay() {
    return [this.text, ""];
  }
}

class Keyword {
  constructor(text, preceedsExpression = false) {
    this.text = text;
    this.preceedsExpression = preceedsExpression;
  }

  getDisplay() {
    return [this.text, "keyword"];
  }
}

class NumericLiteral {
  constructor(text) {
    this.text = String(text);
    this.value = +text;
    this.hasDecimalPoint = this.text.includes(".") || this.text.toLowerCase().includes("e");
  }

  getDisplay() {
    return [this.text, "number literal"];
  }

  performUnaryOp(unaryOp) {
    switch (unaryOp) {
    case "!":
      this.value = ~this.value;
      break;
    case "-":
      this.value = -this.value;
      break;
    default:
      throw "unrecognized unary operator " + unaryOp;
    }
  }

  performBinaryOp(binOp, operand) {
    switch (binOp) {
      case "+":
        this.value += operand.value;
        break;
      case "-":
        this.value -= operand.value;
        break;
      case "*":
        this.value *= operand.value;
        break;
      case "/":
        this.value /= operand.value;
        break;
      case "%":
        this.value %= operand.value;
        break;
      case "|":
        this.value |= operand.value;
        break;
      case "^":
        this.value ^= operand.value;
        break;
      case "&":
        this.value &= operand.value;
        break;
      case "<<":
        this.value <<= operand.value;
        break;
      case ">>":
        this.value >>= operand.value;
        break;
      default:
        throw "unrecognized binary operator: " + binOp;
    }
    
    this.hasDecimalPoint = this.hasDecimalPoint || operand.hasDecimalPoint;
    if (!this.hasDecimalPoint) {
      this.value = Math.trunc(this.value);
    }
  }

  getType(expectedType = parent.types.builtins.Any) {
    if (expectedType !== parent.types.builtins.Any) {
      return expectedType;
    }

    if (this.hasDecimalPoint) {
      return parent.types.builtins.f32;
    } else {
      return parent.types.builtins.i32;
    }
  }

  getWasmCode(outputType) {
    switch (outputType) {
      case parent.types.builtins.i32:
      case parent.types.builtins.u32:
      case parent.this.BOOL:
        return [Wasm.i32_const, ...Wasm.varint(this.value)];
      case parent.types.builtins.i64:
      case parent.types.builtins.u64:
        return [Wasm.i64_const, ...Wasm.varint(this.value)];
      case parent.types.builtins.f32:
        return [Wasm.f32_const, ...Wasm.f32ToBytes(this.value)];
      case parent.types.builtins.f64:
        return [Wasm.f64_const, ...Wasm.f64ToBytes(this.value)];
      default:
        console.trace();
        throw "unrecognized type for numeric literal: " + outputType.name;
    }
  }
}

class BooleanLiteral {
  constructor(value) {
    this.text = String(value);
    this.value = value|0;
  }

  getDisplay() {
    return [this.text, "keyword literal"];
  }
}

class StringLiteral {
  constructor(text) {
    this.text = text;
  }

  getDisplay() {
    return ['"' + this.text + '"', "string literal"];
  }

  getType() {
    return parent.types.builtins.string;
  }

  getWasmCode() {
    console.trace();
    throw "Not implemented";
    return [Wasm.i32_const, ...Wasm.varint(this.address)];
  }
}

class LoopLabel {
  constructor(layersOutward) {
    this.layersOutward = layersOutward;
  }

  getDisplay() {
    let text = "outer";
    if (this.layersOutward > 2) {
      const num = this.layersOutward;
      const lastDigit = num % 10;

      if (lastDigit === 1 && num !== 11) {
        text = num + "st out";
      } else if (lastDigit === 2 && num !== 12) {
        text = num + "nd out"
      } else if (lastDigit === 3 && num !== 13) {
        text = num + "rd out"
      } else {
        text = num + "th out"
      }
    }
    return [text, "call"];
  }
}

function BuiltIns() {
  this.TYPES = [
    this.VOID = new TypeDef("void", 0),
    this.ANY = new TypeDef("Any", 0),
    this.BOOL = new TypeDef("bool", 4),
    this.I32 = new TypeDef("int", 4),
    this.U32 = new TypeDef("uint", 4),
    this.I64 = new TypeDef("long", 8),
    this.U64 = new TypeDef("ulong", 8),
    this.F32 = new TypeDef("float", 4),
    this.F64 = new TypeDef("double", 8),
    this.STRING = new TypeDef("string", 4),
    this.SYSTEM = new TypeDef("System", 0),
    this.MATH = new TypeDef("Math", 0),
    this.ITERABLE = new TypeDef("iterable", 0),
  ];

  this.PRINT = new ImportedFunc(
    new FuncSig(this.SYSTEM, "print", this.VOID, [this.Any, "item"]),
    "System", "print"
  );

  const PRINT_U64 = new PredefinedFunc(
    new FuncSig(this.SYSTEM, "print", this.VOID, [this.U64, "item"]),
    1, 1, Wasm.types.i32,
    Wasm.get_global, 0, //address = top of stack + 20
    Wasm.i32_const, 20,
    Wasm.i32_add,
    Wasm.set_local, 1,

    Wasm.loop, Wasm.types.void, //do
      Wasm.get_local, 1, //address

      Wasm.get_local, 0,
      Wasm.i64_const, 10,
      Wasm.i64_rem_u,
      Wasm.i32_wrap_from_i64,
      Wasm.i32_const, '0'.charCodeAt(),
      Wasm.i32_add, //value = val % 10 + '0'

      Wasm.i32_store8, 0, 0, //store value at address

      Wasm.get_local, 1, //address--
      Wasm.i32_const, 1,
      Wasm.i32_sub,
      Wasm.set_local, 1,

      Wasm.get_local, 0, //val /= 10
      Wasm.i64_const, 10,
      Wasm.i64_div_u,
      Wasm.tee_local, 0,
      Wasm.i64_const, 0,
      Wasm.i64_gt_u,
    Wasm.br_if, 0, //while val > 0
    Wasm.end,

    Wasm.get_local, 1, //address of string length

    Wasm.i32_const, 20, //length = 20 - address + top of stack
    Wasm.get_local, 1,
    Wasm.i32_sub,
    Wasm.get_global, 0,
    Wasm.i32_add,

    Wasm.i32_store8, 0, 0, //store length of string at address
    
    Wasm.get_local, 1, //print string we just created
    this.PRINT,
    Wasm.end,
  );

  const PRINT_I64 = new PredefinedFunc(
    new FuncSig(this.SYSTEM, "print", this.VOID, [this.I64, "item"]),
    0,
    Wasm.get_local, 0,
    Wasm.i64_const, 0,
    Wasm.i64_lt_s,
    Wasm.if, Wasm.types.i64,     //if val < 0
      Wasm.i32_const, 6,         //print('-')   ('-' is located after "false")
      this.PRINT,
      Wasm.i64_const, 0,         //val = -val
      Wasm.get_local, 0,
      Wasm.i64_sub,
    Wasm.else,
      Wasm.get_local, 0,
    Wasm.end,
    PRINT_U64,
    Wasm.end,
  );

  this.functions = [
    this.PRINT,
    new ImportedFunc(
      new FuncSig(this.SYSTEM, "print", this.VOID, [this.F32, "item"]),
      "System", "printNum"
    ),
    new ImportedFunc(
      new FuncSig(this.SYSTEM, "print", this.VOID, [this.F64, "item"]),
      "System", "printNum"
    ),
    PRINT_U64,
    PRINT_I64,
    new MacroFunc(
      new FuncSig(this.SYSTEM, "print", this.VOID, [this.U32, "item"]),
      Wasm.i64_extend_u_from_i32,
      PRINT_U64,
    ),
    new MacroFunc(
      new FuncSig(this.SYSTEM, "print", this.VOID, [this.I32, "item"]),
      Wasm.i64_extend_s_from_i32,
      PRINT_I64,
    ),
    new MacroFunc(
      new FuncSig(this.SYSTEM, "print", this.VOID, [this.BOOL, "item"]),
      Wasm.i32_const, 8,
      Wasm.i32_shl,
      this.PRINT,
    ),
    new ImportedFunc(
      new FuncSig(this.SYSTEM, "input", this.F64, [this.F64, "default", 0], [this.F64, "min", -Infinity], [this.F64, "max", Infinity]),
      "System", "input"
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "rotateLeft", this.I32, [this.I32, "num"], [this.I32, "count"]),
      Wasm.i32_rotl
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "rotateLeft", this.I64, [this.I64, "num"], [this.I64, "count"]),
      Wasm.i64_rotl
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "rotateRight", this.I32, [this.I32, "num"], [this.I32, "count"]),
      Wasm.i32_rotr
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "rotateRight", this.I64, [this.I64, "num"], [this.I64, "count"]),
      Wasm.i64_rotr
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "abs", this.F32, [this.F32, "num"]),
      Wasm.f32_abs
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "abs", this.F64, [this.F64, "num"]),
      Wasm.f64_abs
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "ceil", this.F32, [this.F32, "num"]),
      Wasm.f32_ceil
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "ceil", this.F64, [this.F64, "num"]),
      Wasm.f64_ceil
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "floor", this.F32, [this.F32, "num"]),
      Wasm.f32_floor
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "floor", this.F64, [this.F64, "num"]),
      Wasm.f64_floor
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "trunc", this.F32, [this.F32, "num"]),
      Wasm.f32_trunc
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "trunc", this.F64, [this.F64, "num"]),
      Wasm.f64_trunc
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "nearest", this.F32, [this.F32, "num"]),
      Wasm.f32_nearest
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "nearest", this.F64, [this.F64, "num"]),
      Wasm.f64_nearest
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "sqrt", this.F32, [this.F32, "num"]),
      Wasm.f32_sqrt
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "sqrt", this.F64, [this.F64, "num"]),
      Wasm.f64_sqrt
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "min", this.F32, [this.F32, "num1"], [this.F32, "num2"]),
      Wasm.f32_min
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "min", this.F64, [this.F64, "num1"], [this.F64, "num2"]),
      Wasm.f64_min
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "max", this.F32, [this.F32, "num1"], [this.F32, "num2"]),
      Wasm.f32_max
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "max", this.F64, [this.F64, "num1"], [this.F64, "num2"]),
      Wasm.f64_max
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "copysign", this.F32, [this.F32, "magNum", 1], [this.F32, "signNum"]),
      Wasm.f32_copysign
    ),
    new MacroFunc(
      new FuncSig(this.MATH, "copysign", this.F64, [this.F64, "magNum", 1], [this.F64, "signNum"]),
      Wasm.f64_copysign
    ),
  ];

  this.SYMBOLS = [
    this.ASSIGN     = new Symbol("=", 0, {isAssignment: true}),
    this.ADD_ASSIGN = new Symbol("+=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_add],
      [this.VOID, this.U32, Wasm.i32_add],
      [this.VOID, this.I64, Wasm.i64_add],
      [this.VOID, this.U64, Wasm.i64_add],
      [this.VOID, this.F32, Wasm.f32_add],
      [this.VOID, this.F64, Wasm.f64_add],
    ),
    this.SUB_ASSIGN = new Symbol("-=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_sub],
      [this.VOID, this.U32, Wasm.i32_sub],
      [this.VOID, this.I64, Wasm.i64_sub],
      [this.VOID, this.U64, Wasm.i64_sub],
      [this.VOID, this.F32, Wasm.f32_sub],
      [this.VOID, this.F64, Wasm.f64_sub],
    ),
    this.MUL_ASSIGN = new Symbol("*=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_mul],
      [this.VOID, this.U32, Wasm.i32_mul],
      [this.VOID, this.I64, Wasm.i64_mul],
      [this.VOID, this.U64, Wasm.i64_mul],
      [this.VOID, this.F32, Wasm.f32_mul],
      [this.VOID, this.F64, Wasm.f64_mul],
    ),
    this.DIV_ASSIGN = new Symbol("/=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_div_s],
      [this.VOID, this.U32, Wasm.i32_div_u],
      [this.VOID, this.I64, Wasm.i64_div_s],
      [this.VOID, this.U64, Wasm.i64_div_u],
      [this.VOID, this.F32, Wasm.f32_div_s],
      [this.VOID, this.F64, Wasm.f64_div_u],
    ),
    this.MOD_ASSIGN = new Symbol("%=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_rem_s],
      [this.VOID, this.U32, Wasm.i32_rem_u],
      [this.VOID, this.I64, Wasm.i64_rem_s],
      [this.VOID, this.U64, Wasm.i64_rem_u],
    ),
    this.AND_ASSIGN = new Symbol("&=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_and],
      [this.VOID, this.U32, Wasm.i32_and],
      [this.VOID, this.I64, Wasm.i64_and],
      [this.VOID, this.U64, Wasm.i64_and],
    ),
    this.OR_ASSIGN = new Symbol("|=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_or],
      [this.VOID, this.U32, Wasm.i32_or],
      [this.VOID, this.I64, Wasm.i64_or],
      [this.VOID, this.U64, Wasm.i64_or],
    ),
    this.XOR_ASSIGN = new Symbol("^=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_xor],
      [this.VOID, this.U32, Wasm.i32_xor],
      [this.VOID, this.I64, Wasm.i64_xor],
      [this.VOID, this.U64, Wasm.i64_xor],
    ),
    this.LSH_ASSIGN = new Symbol("<<=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_shl],
      [this.VOID, this.U32, Wasm.i32_shl],
      [this.VOID, this.I64, Wasm.i64_shl],
      [this.VOID, this.U64, Wasm.i64_shl],
    ),
    this.RSH_ASSIGN = new Symbol(">>=", 0, {isAssignment: true},
      [this.VOID, this.I32, Wasm.i32_shr_s],
      [this.VOID, this.U32, Wasm.i32_shr_u],
      [this.VOID, this.I64, Wasm.i64_shr_s],
      [this.VOID, this.U64, Wasm.i64_shr_u],
    ),
    this.ADDITION = new Symbol("+", 8, {isArith: true},
      [this.I32, this.I32, Wasm.i32_add],
      [this.U32, this.U32, Wasm.i32_add],
      [this.I64, this.I64, Wasm.i64_add],
      [this.U64, this.U64, Wasm.i64_add],
      [this.F32, this.F32, Wasm.f32_add],
      [this.F64, this.F64, Wasm.f64_add],
    ),
    this.SUBTRACTION = new Symbol("-", 8, {isArith: true},
      [this.I32, this.I32, Wasm.i32_sub],
      [this.U32, this.U32, Wasm.i32_sub],
      [this.I64, this.I64, Wasm.i64_sub],
      [this.U64, this.U64, Wasm.i64_sub],
      [this.F32, this.F32, Wasm.f32_sub],
      [this.F64, this.F64, Wasm.f64_sub],
    ),
    this.MULTIPLICATION = new Symbol("*", 9, {isArith: true},
      [this.I32, this.I32, Wasm.i32_mul],
      [this.U32, this.U32, Wasm.i32_mul],
      [this.I64, this.I64, Wasm.i64_mul],
      [this.U64, this.U64, Wasm.i64_mul],
      [this.F32, this.F32, Wasm.f32_mul],
      [this.F64, this.F64, Wasm.f64_mul],
    ),
    this.DIVISION = new Symbol("/", 9, {isArith: true},
      [this.I32, this.I32, Wasm.i32_div_s],
      [this.U32, this.U32, Wasm.i32_div_u],
      [this.I64, this.I64, Wasm.i64_div_s],
      [this.U64, this.U64, Wasm.i64_div_u],
      [this.F32, this.F32, Wasm.f32_div_s],
      [this.F64, this.F64, Wasm.f64_div_u],
    ),
    this.MODULUS = new Symbol("%", 9, {isArith: true},
      [this.I32, this.I32, Wasm.i32_rem_s],
      [this.U32, this.U32, Wasm.i32_rem_u],
      [this.I64, this.I64, Wasm.i64_rem_s],
      [this.U64, this.U64, Wasm.i64_rem_u],
    ),
    this.BITWISE_AND = new Symbol("&", 6, {isArith: true},
      [this.I32, this.I32, Wasm.i32_and],
      [this.U32, this.U32, Wasm.i32_and],
      [this.I64, this.I64, Wasm.i64_and],
      [this.U64, this.U64, Wasm.i64_and],
    ),
    this.BITWISE_OR = new Symbol("|", 4, {isArith: true},
      [this.I32, this.I32, Wasm.i32_or],
      [this.U32, this.U32, Wasm.i32_or],
      [this.I64, this.I64, Wasm.i64_or],
      [this.U64, this.U64, Wasm.i64_or],
    ),
    this.BITWISE_XOR = new Symbol("^", 5, {isArith: true},
      [this.I32, this.I32, Wasm.i32_xor],
      [this.U32, this.U32, Wasm.i32_xor],
      [this.I64, this.I64, Wasm.i64_xor],
      [this.U64, this.U64, Wasm.i64_xor],
    ),
    this.LEFT_SHIFT = new Symbol("<<", 7, {isArith: true},
      [this.I32, this.I32, Wasm.i32_shl],
      [this.U32, this.U32, Wasm.i32_shl],
      [this.I64, this.I64, Wasm.i64_shl],
      [this.U64, this.U64, Wasm.i64_shl],
    ),
    this.RIGHT_SHIFT = new Symbol(">>", 7, {isArith: true},
      [this.I32, this.I32, Wasm.i32_shr_s],
      [this.U32, this.U32, Wasm.i32_shr_u],
      [this.I64, this.I64, Wasm.i64_shr_s],
      [this.U64, this.U64, Wasm.i64_shr_u],
    ),
    this.BOOL_AND = new Symbol("&&", 2, undefined,
      [this.BOOL, this.BOOL, Wasm.i32_and],
    ),
    this.BOOL_OR = new Symbol("||", 1, undefined,
      [this.BOOL, this.BOOL, Wasm.i32_or],
    ),
    this.REF_EQUALITY   = new Symbol("===", 3),
    this.REF_INEQUALITY = new Symbol("!==", 3),
    this.VAL_EQUALITY   = new Symbol("=", 3, {isBool: true},
      [this.BOOL, this.I32, Wasm.i32_eq],
      [this.BOOL, this.U32, Wasm.i32_eq],
      [this.BOOL, this.I64, Wasm.i64_eq],
      [this.BOOL, this.U64, Wasm.i64_eq],
    ),
    this.VAL_INEQUALITY = new Symbol("≠", 3, {isBool: true},
      [this.BOOL, this.I32, Wasm.i32_eq, Wasm.i32_eqz],
      [this.BOOL, this.U32, Wasm.i32_eq, Wasm.i32_eqz],
      [this.BOOL, this.I64, Wasm.i64_eq, Wasm.i64_eqz],
      [this.BOOL, this.U64, Wasm.i64_eq, Wasm.i64_eqz],
    ),
    this.GREATER = new Symbol(">", 3, {isBool: true},
      [this.BOOL, this.I32, Wasm.i32_gt_s],
      [this.BOOL, this.U32, Wasm.i32_gt_u],
      [this.BOOL, this.I64, Wasm.i64_gt_s],
      [this.BOOL, this.U64, Wasm.i64_gt_u],
    ),
    this.LESS = new Symbol("<", 3, {isBool: true},
      [this.BOOL, this.I32, Wasm.i32_lt_s],
      [this.BOOL, this.U32, Wasm.i32_lt_u],
      [this.BOOL, this.I64, Wasm.i64_lt_s],
      [this.BOOL, this.U64, Wasm.i64_lt_u],
    ),
    this.GREATER_EQUAL = new Symbol("≥", 3, {isBool: true},
      [this.BOOL, this.I32, Wasm.i32_ge_s],
      [this.BOOL, this.U32, Wasm.i32_ge_u],
      [this.BOOL, this.I64, Wasm.i64_ge_s],
      [this.BOOL, this.U64, Wasm.i64_ge_u],
    ),
    this.LESS_EQUAL = new Symbol("≤", 3, {isBool: true},
      [this.BOOL, this.I32, Wasm.i32_le_s],
      [this.BOOL, this.U32, Wasm.i32_le_u],
      [this.BOOL, this.I64, Wasm.i64_le_s],
      [this.BOOL, this.U64, Wasm.i64_le_u],
    ),
    this.HALF_OPEN_RANGE = new Symbol("..<", 0, {isRange: true},
      [this.ITERABLE, this.I32, Wasm.i32_lt_s, Wasm.i32_add],
      [this.ITERABLE, this.U32, Wasm.i32_lt_u, Wasm.i32_add],
      [this.ITERABLE, this.I64, Wasm.i64_lt_s, Wasm.i64_add],
      [this.ITERABLE, this.U64, Wasm.i64_lt_u, Wasm.i64_add],
      [this.ITERABLE, this.F32, Wasm.f32_lt, Wasm.f32_add],
      [this.ITERABLE, this.F64, Wasm.f64_lt, Wasm.f64_add],
    ),
    this.CLOSED_RANGE = new Symbol("..≤", 0, {isRange: true},
      [this.ITERABLE, this.I32, Wasm.i32_le_s, Wasm.i32_add],
      [this.ITERABLE, this.U32, Wasm.i32_le_u, Wasm.i32_add],
      [this.ITERABLE, this.I64, Wasm.i64_le_s, Wasm.i64_add],
      [this.ITERABLE, this.U64, Wasm.i64_le_u, Wasm.i64_add],
      [this.ITERABLE, this.F32, Wasm.f32_le, Wasm.f32_add],
      [this.ITERABLE, this.F64, Wasm.f64_le, Wasm.f64_add],
    ),
    this.BACKWARDS_HALF_OPEN_RANGE = new Symbol("..>", 0, {isRange: true},
      [this.ITERABLE, this.I32, Wasm.i32_gt_s, Wasm.i32_sub],
      [this.ITERABLE, this.U32, Wasm.i32_gt_u, Wasm.i32_sub],
      [this.ITERABLE, this.I64, Wasm.i64_gt_s, Wasm.i64_sub],
      [this.ITERABLE, this.U64, Wasm.i64_gt_u, Wasm.i64_sub],
      [this.ITERABLE, this.F32, Wasm.f32_gt, Wasm.f32_sub],
      [this.ITERABLE, this.F64, Wasm.f64_gt, Wasm.f64_sub],
    ),
    this.BACKWARDS_CLOSED_RANGE = new Symbol("..≥", 0, {isRange: true},
      [this.ITERABLE, this.I32, Wasm.i32_ge_s, Wasm.i32_sub],
      [this.ITERABLE, this.U32, Wasm.i32_ge_u, Wasm.i32_sub],
      [this.ITERABLE, this.I64, Wasm.i64_ge_s, Wasm.i64_sub],
      [this.ITERABLE, this.U64, Wasm.i64_ge_u, Wasm.i64_sub],
      [this.ITERABLE, this.F32, Wasm.f32_ge, Wasm.f32_sub],
      [this.ITERABLE, this.F64, Wasm.f64_ge, Wasm.f64_sub],
    ),
    this.TWOS_COMPLEMENT = new Symbol("-", 10, {isUnary: true},
      [this.I32, this.I32, Wasm.i32_const, 0, Wasm.i32_sub],
      [this.U32, this.U32, Wasm.i32_const, 0, Wasm.i32_sub],
      [this.I64, this.I64, Wasm.i64_const, 0, Wasm.i64_sub],
      [this.U64, this.U64, Wasm.i64_const, 0, Wasm.i64_sub],
    ),
    this.ONES_COMPLEMENT = new Symbol("!", 10, {isUnary: true},
      [this.BOOLean, Wasm.i32_eqz],
      [this.I32, this.I32, Wasm.i32_const, ...Wasm.varint(-1), Wasm.i32_xor],
      [this.U32, this.U32, Wasm.i32_const, ...Wasm.varint(-1), Wasm.i32_xor],
      [this.I64, this.I64, Wasm.i64_const, ...Wasm.varint(-1), Wasm.i64_xor],
      [this.U64, this.U64, Wasm.i64_const, ...Wasm.varint(-1), Wasm.i64_xor],
    ),
    this.PLACEHOLDER      = new Symbol("____", 0, {preceedsExpression: false}),
    this.ARG_SEPARATOR    = new Symbol(",", 0),
    this.ACCESSOR         = new Symbol(".", 0, {preceedsExpression: false}),
    this.BEGIN_EXPRESSION = new Symbol("(", -2, {direction: 1, matching: null}),
    this.BEGIN_ARGS       = new Symbol("⟨", -2, {direction: 1, matching: null}),
    this.END_EXPRESSION   = new Symbol(")", -1, {
      direction: -1,
      matching: this.BEGIN_EXPRESSION,
      preceedsExpression: false
    }),
    this.END_ARGS         = new Symbol("⟩", -1, {
      direction: -1,
      matching: this.BEGIN_ARGS,
      preceedsExpression: false
    }),
  ];
  this.BEGIN_EXPRESSION.matching = this.END_EXPRESSION;
  this.BEGIN_ARGS.matching = this.END_ARGS;
  
  this.LET = new Keyword("let");
  this.VAR = new Keyword("var");
  this.IF = new Keyword("if", true);
  this.ELSE = new Keyword("else");
  this.FOR = new Keyword("for");
  this.IN = new Keyword("in", true);
  this.WHILE = new Keyword("while", true);
  this.DO_WHILE = new Keyword("post while", true);
  this.BREAK = new Keyword("break");
  this.CONTINUE = new Keyword("continue");
  this.RETURN = new Keyword("return");
  this.STEP = new Keyword("step", true);
  this.FUNC = new Keyword("fn");

  this.VAR.suggestion = this.LET;
  this.LET.suggestion = this.VAR;
  this.BREAK.suggestion = this.CONTINUE;
  this.WHILE.suggestion = this.DO_WHILE;
  this.DO_WHILE.suggestion = this.WHILE;
  this.CONTINUE.suggestion = this.BREAK;
  this.BREAK.suggestion = this.CONTINUE;
  this.CONTINUE.suggestion = this.BREAK;

  this.FALSE = new BooleanLiteral(false);
  this.TRUE = new BooleanLiteral(true);
}