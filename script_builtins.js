"use strict";

class VarDef {
  constructor(name, type, scope, id = VarDef.nextId++) {
    this.name = name;
    this.type = type;
    this.scope = scope;
    this.id = id;
  }

  getDisplay() {
    return [this.type.text + '\n' + this.name, "keyword vardef"];
  }

  serialize() {
    return {
      name: this.name,
      type: this.type.id,
      id: this.id,
    };
  }
}
VarDef.nextId = 0;

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

  serialize() {
    return {
      varDef: this.varDef.id
    };
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

class Macro {
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

  serialize() {
    //TODO for now I assume every function reference is to a builtin function
    const funcDef = -1 - script.BuiltIns.FUNCTIONS.indexOf(this.funcDef);

    return {
      funcDef
    }
  }
}

class TypeDef {
  constructor(text, size, id = TypeDef.nextId++) {
    this.text = text;
    this.size = size;
    this.id = id;
  }

  // serialize() {
  //   return {
  //     text: this.text,
  //     size: this.size,
  //     id: this.id,
  //   }
  // }
}
TypeDef.nextId = 0;

class ArgHint {
  constructor(funcDef, argIndex) {
    this.funcDef = funcDef;
    this.argIndex = argIndex;
  }

  getDisplay() {
    return [this.funcDef.signature.parameters[this.argIndex].name, "comment"];
  }

  serialize() {
    //TODO for now I assume every function reference is to a builtin function
    const funcDef = -1 - script.BuiltIns.FUNCTIONS.indexOf(this.funcDef);

    return {
      funcDef,
      argIndex: this.argIndex,
    }
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

  serialize() {
    return {symbol: script.BuiltIns.SYMBOLS.indexOf(this)}
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

  serialize() {
    return {keyword: script.BuiltIns.KEYWORDS.indexOf(this)}
  }
}

class NumericLiteral {
  constructor(text) {
    this.text = String(text);
  }

  getDisplay() {
    return [this.text, "number literal"];
  }

  getType(expectedType = script.BuiltIns.ANY) {
    if (expectedType !== script.BuiltIns.ANY) {
      return expectedType;
    }

    if (/[\.e]/i.test(this.text)) {
      return script.BuiltIns.F32;
    } else {
      return script.BuiltIns.I32;
    }
  }

  serialize() {
    return {numLit: this.text};
  }
}

class BooleanLiteral {
  constructor(value) {
    this.value = value;
  }

  getDisplay() {
    return [String(this.value), "keyword literal"];
  }

  serialize() {
    return {boolLit: this.value}
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
    return script.BuiltIns.STRING;
  }

  serialize() {
    return {strLit: this.text};
  }
}

class LoopLabel {
  constructor(layersOutward) {
    this.loopLayers = layersOutward;
  }

  getDisplay() {
    let text = "outer";
    if (this.loopLayers > 2) {
      const num = this.loopLayers;
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

  serialize() {
    return {loopLayers: this.loopLayers};
  }
}

function BuiltIns() {
  this.TYPES = [
    this.VOID = new TypeDef("void", 0, -1),
    this.ANY = new TypeDef("Any", 0, -2),
    this.BOOL = new TypeDef("bool", 4, -3),
    this.I64 = new TypeDef("long", 8, -10),
    this.U64 = new TypeDef("ulong", 8, -11),
    this.I32 = new TypeDef("int", 4, -12),
    this.U32 = new TypeDef("uint", 4, -13),
    this.F64 = new TypeDef("double", 8, -20),
    this.F32 = new TypeDef("float", 4, -21),
    this.STRING = new TypeDef("string", 4, -30),
    this.ITERABLE = new TypeDef("iterable", 0, -31),
    this.SYSTEM = new TypeDef("System", 0, -40),
    this.MATH = new TypeDef("Math", 0, -41),
  ];

  this.PRINT = new ImportedFunc(
    new FuncSig(this.SYSTEM, "print", this.VOID, [this.STRING, "item"]),
    "System", "print"
  );

  const U64_TO_STRING = new PredefinedFunc(
    new FuncSig(this.U64, "toString", this.STRING, [this.U64, "item"]),
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
    
    Wasm.get_local, 1, //return the address of the first byte
    Wasm.end,
  );

  const PRINT_I64 = new PredefinedFunc(
    new FuncSig(this.I64, "toString", this.STRING, [this.I64, "item"]),
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
    U64_TO_STRING,
    Wasm.end,
  );

  this.FUNCTIONS = [
    this.PRINT,
    new Macro(
      new FuncSig(this.BOOL, "toString", this.STRING, [this.BOOL, "item"]),
      Wasm.i32_const, 8,
      Wasm.i32_shl,
    ),
    new PredefinedFunc(
      new FuncSig(this.I64, "toString", this.STRING, [this.I64, "item"]),
      //TODO
    ), 
    new PredefinedFunc(
      new FuncSig(this.U64, "toString", this.STRING, [this.U64, "item"]),
      //TODO
    ), 
    new PredefinedFunc(
      new FuncSig(this.F64, "toString", this.STRING, [this.F64, "item"]),
      //TODO
    ), 
    new ImportedFunc(
      new FuncSig(this.SYSTEM, "input", this.BOOL),
      "System", "inputBool" //TODO
    ),
    new ImportedFunc(
      new FuncSig(this.SYSTEM, "input", this.I32),
      "System", "inputI32" //TODO
    ),
    new ImportedFunc(
      new FuncSig(this.SYSTEM, "input", this.U32),
      "System", "inputU32" //TODO
    ),
    new ImportedFunc(
      new FuncSig(this.SYSTEM, "input", this.F64, [this.F64, "default", 0], [this.F64, "min", -Infinity], [this.F64, "max", Infinity]),
      "System", "input"
    ),
    new Macro(
      new FuncSig(this.MATH, "rotateLeft", this.I32, [this.I32, "num"], [this.I32, "count"]),
      Wasm.i32_rotl
    ),
    new Macro(
      new FuncSig(this.MATH, "rotateLeft", this.I64, [this.I64, "num"], [this.I64, "count"]),
      Wasm.i64_rotl
    ),
    new Macro(
      new FuncSig(this.MATH, "rotateRight", this.I32, [this.I32, "num"], [this.I32, "count"]),
      Wasm.i32_rotr
    ),
    new Macro(
      new FuncSig(this.MATH, "rotateRight", this.I64, [this.I64, "num"], [this.I64, "count"]),
      Wasm.i64_rotr
    ),
    new Macro(
      new FuncSig(this.MATH, "abs", this.F32, [this.F32, "num"]),
      Wasm.f32_abs
    ),
    new Macro(
      new FuncSig(this.MATH, "abs", this.F64, [this.F64, "num"]),
      Wasm.f64_abs
    ),
    new Macro(
      new FuncSig(this.MATH, "ceil", this.F32, [this.F32, "num"]),
      Wasm.f32_ceil
    ),
    new Macro(
      new FuncSig(this.MATH, "ceil", this.F64, [this.F64, "num"]),
      Wasm.f64_ceil
    ),
    new Macro(
      new FuncSig(this.MATH, "floor", this.F32, [this.F32, "num"]),
      Wasm.f32_floor
    ),
    new Macro(
      new FuncSig(this.MATH, "floor", this.F64, [this.F64, "num"]),
      Wasm.f64_floor
    ),
    new Macro(
      new FuncSig(this.MATH, "trunc", this.F32, [this.F32, "num"]),
      Wasm.f32_trunc
    ),
    new Macro(
      new FuncSig(this.MATH, "trunc", this.F64, [this.F64, "num"]),
      Wasm.f64_trunc
    ),
    new Macro(
      new FuncSig(this.MATH, "nearest", this.F32, [this.F32, "num"]),
      Wasm.f32_nearest
    ),
    new Macro(
      new FuncSig(this.MATH, "nearest", this.F64, [this.F64, "num"]),
      Wasm.f64_nearest
    ),
    new Macro(
      new FuncSig(this.MATH, "sqrt", this.F32, [this.F32, "num"]),
      Wasm.f32_sqrt
    ),
    new Macro(
      new FuncSig(this.MATH, "sqrt", this.F64, [this.F64, "num"]),
      Wasm.f64_sqrt
    ),
    new Macro(
      new FuncSig(this.MATH, "min", this.F32, [this.F32, "num1"], [this.F32, "num2"]),
      Wasm.f32_min
    ),
    new Macro(
      new FuncSig(this.MATH, "min", this.F64, [this.F64, "num1"], [this.F64, "num2"]),
      Wasm.f64_min
    ),
    new Macro(
      new FuncSig(this.MATH, "max", this.F32, [this.F32, "num1"], [this.F32, "num2"]),
      Wasm.f32_max
    ),
    new Macro(
      new FuncSig(this.MATH, "max", this.F64, [this.F64, "num1"], [this.F64, "num2"]),
      Wasm.f64_max
    ),
    new Macro(
      new FuncSig(this.MATH, "copysign", this.F32, [this.F32, "magNum", 1], [this.F32, "signNum"]),
      Wasm.f32_copysign
    ),
    new Macro(
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
  
  this.KEYWORDS = [
    this.LET = new Keyword("let"),
    this.VAR = new Keyword("var"),
    this.IF = new Keyword("if", true),
    this.ELSE = new Keyword("else"),
    this.FOR = new Keyword("for"),
    this.IN = new Keyword("in", true),
    this.WHILE = new Keyword("while", true),
    this.DO_WHILE = new Keyword("post while", true),
    this.BREAK = new Keyword("break"),
    this.CONTINUE = new Keyword("continue"),
    this.RETURN = new Keyword("return"),
    this.STEP = new Keyword("step", true),
    this.FUNC = new Keyword("fn"),
  ]

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