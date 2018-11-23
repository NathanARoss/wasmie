"use strict";

class VarDef {
  constructor(name, type, scope) {
    this.name = name;
    this.type = type;
    this.scope = scope;
  }

  getDisplay() {
    return [this.type.text + '\n' + this.name, "keyword vardef"];
  }
}

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
  constructor(signature, ...wasmCodeSegments) {
    this.signature = signature;
    this.wasmCodeSegments = wasmCodeSegments;
  }

  getDisplay() {
    return [this.signature.name, "funcdef"];
  }
}

class MacroFunction {
  constructor(signature, ...wasmCodeSegments) {
    this.signature = signature;
    this.wasmCodeSegments = wasmCodeSegments;
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
}

class TypeDefinition {
  constructor(text, size) {
    this.text = text;
    this.size = size;
  }
}

class ArgHint {
  constructor(signature, argIndex) {
    this.signature = signature;
    this.argIndex = argIndex;
  }

  getDisplay() {
    return [this.signature.parameters[this.argIndex].name, "comment"];
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

function BuiltIns() {
  this.TYPES = [
    this.VOID = new TypeDefinition("void", 0),
    this.ANY = new TypeDefinition("Any", 0),
    this.BOOL = new TypeDefinition("bool", 4),
    this.I32 = new TypeDefinition("int", 4),
    this.U32 = new TypeDefinition("uint", 4),
    this.I64 = new TypeDefinition("long", 8),
    this.U64 = new TypeDefinition("ulong", 8),
    this.F32 = new TypeDefinition("float", 4),
    this.F64 = new TypeDefinition("double", 8),
    this.STRING = new TypeDefinition("string", 4),
    this.SYSTEM = new TypeDefinition("System", 0),
    this.MATH = new TypeDefinition("Math", 0),
    this.ITERABLE = new TypeDefinition("iterable", 0),
  ];

  this.PRINT = new ImportedFunc(
    new FuncSig(this.SYSTEM, "print", this.VOID, [this.Any, "item"]),
    "System", "print"
  );

  const PRINT_U64 = new PredefinedFunc(
    new FuncSig(this.SYSTEM, "print", this.VOID, [this.U64, "item"]),
    [
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
    ],
    this.PRINT,
    [
      Wasm.end,
    ]
  );

  const PRINT_I64 = new PredefinedFunc(
    new FuncSig(this.SYSTEM, "print", this.VOID, [this.I64, "item"]),
    [
      0,
      Wasm.get_local, 0,
      Wasm.i64_const, 0,
      Wasm.i64_lt_s,
      Wasm.if, Wasm.types.i64,     //if val < 0
        Wasm.i32_const, 6,         //print('-')   ('-' is located after "false")
    ],
    this.PRINT,
    [
        Wasm.i64_const, 0,         //val = -val
        Wasm.get_local, 0,
        Wasm.i64_sub,
      Wasm.else,
        Wasm.get_local, 0,
      Wasm.end,
    ],
    PRINT_U64,
    [
      Wasm.end,
    ]
  );

  this.functions = [
    this.PRINT,
    new ImportedFunc(
      new FuncSig(this.System, "print", this.Void, [this.F32, "item"]),
      "System", "printNum"
    ),
    new ImportedFunc(
      new FuncSig(this.System, "print", this.Void, [this.F64, "item"]),
      "System", "printNum"
    ),
    PRINT_U64,
    PRINT_I64,
    new MacroFunction(
      new FuncSig(this.System, "print", this.Void, [this.U32, "item"]),
      [Wasm.i64_extend_u_from_i32],
      PRINT_U64,
    ),
    new MacroFunction(
      new FuncSig(this.System, "print", this.Void, [this.I32, "item"]),
      [Wasm.i64_extend_s_from_i32],
      PRINT_I64,
    ),
    new MacroFunction(
      new FuncSig(this.System, "print", this.Void, [this.BOOL, "item"]),
      [
        Wasm.i32_const, 8,
        Wasm.i32_shl
      ],
      this.PRINT,
    ),
    new ImportedFunc(
      new FuncSig(this.System, "input", this.F64, [this.F64, "default", 0], [this.F64, "min", -Infinity], [this.F64, "max", Infinity]),
      "System", "input"
    ),
    // parseFunction(this.MATH, "rotateLeft",
    //   [{afterArguments: [Wasm.i32_rotl]}, this.I32, this.I32, "num", undefined, this.I32, "shiftCount", 0],
    //   [{afterArguments: [Wasm.i64_rotl]}, this.I64, this.I64, "num", undefined, this.I64, "shiftCount", 0],
    // ),
    // parseFunction(this.MATH, "rotateRight",
    //   [{afterArguments: [Wasm.i32_rotr]}, this.I32, this.I32, "num", undefined, this.I32, "shiftCount", 0],
    //   [{afterArguments: [Wasm.i64_rotr]}, this.I64, this.I64, "num", undefined, this.I64, "shiftCount", 0],
    // ),
    // parseFunction(this.MATH, "abs",
    //   [{afterArguments: [Wasm.f32_abs]}, this.F32, this.F32, "num"],
    //   [{afterArguments: [Wasm.f64_abs]}, this.F64, this.F64, "num"],
    // ),
    // parseFunction(this.MATH, "ceil",
    //   [{afterArguments: [Wasm.f32_ceil]}, this.F32, this.F32, "num"],
    //   [{afterArguments: [Wasm.f64_ceil]}, this.F64, this.F64, "num"],
    // ),
    // parseFunction(this.MATH, "floor",
    //   [{afterArguments: [Wasm.f32_floor]}, this.F32, this.F32, "num"],
    //   [{afterArguments: [Wasm.f64_floor]}, this.F64, this.F64, "num"],
    // ),
    // parseFunction(this.MATH, "trunc",
    //   [{afterArguments: [Wasm.f32_trunc]}, this.F32, this.F32, "num"],
    //   [{afterArguments: [Wasm.f64_trunc]}, this.F64, this.F64, "num"],
    // ),
    // parseFunction(this.MATH, "nearest",
    //   [{afterArguments: [Wasm.f32_nearest]}, this.F32, this.F32, "num"],
    //   [{afterArguments: [Wasm.f64_nearest]}, this.F64, this.F64, "num"],
    // ),
    // parseFunction(this.MATH, "sqrt",
    //   [{afterArguments: [Wasm.f32_sqrt]}, this.F32, this.F32, "num"],
    //   [{afterArguments: [Wasm.f64_sqrt]}, this.F64, this.F64, "num"],
    // ),
    // parseFunction(this.MATH, "min",
    //   [{afterArguments: [Wasm.f32_min]}, this.F32, this.F32, "num1", undefined, this.F32, "num2", 0],
    //   [{afterArguments: [Wasm.f64_min]}, this.F64, this.F64, "num1", undefined, this.F64, "num2", 0],
    // ),
    // parseFunction(this.MATH, "max",
    //   [{afterArguments: [Wasm.f32_max]}, this.F32, this.F32, "num1", undefined, this.F32, "num2", 0],
    //   [{afterArguments: [Wasm.f64_max]}, this.F64, this.F64, "num1", undefined, this.F64, "num2", 0],
    // ),
    // parseFunction(this.MATH, "copysign",
    //   [{afterArguments: [Wasm.f32_copysign]}, this.F32, this.F32, "magNum", 1, this.F32, "signNum", undefined],
    //   [{afterArguments: [Wasm.f64_copysign]}, this.F64, this.F64, "magNum", 1, this.F64, "signNum", undefined],
    // ),
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
    this.ADDITION = new Symbol("+", 8, {arithmetic: true},
      [this.I32, this.I32, Wasm.i32_add],
      [this.U32, this.U32, Wasm.i32_add],
      [this.I64, this.I64, Wasm.i64_add],
      [this.U64, this.U64, Wasm.i64_add],
      [this.F32, this.F32, Wasm.f32_add],
      [this.F64, this.F64, Wasm.f64_add],
    ),
    this.SUBTRACTION = new Symbol("-", 8, {arithmetic: true},
      [this.I32, this.I32, Wasm.i32_sub],
      [this.U32, this.U32, Wasm.i32_sub],
      [this.I64, this.I64, Wasm.i64_sub],
      [this.U64, this.U64, Wasm.i64_sub],
      [this.F32, this.F32, Wasm.f32_sub],
      [this.F64, this.F64, Wasm.f64_sub],
    ),
    this.MULTIPLICATION = new Symbol("*", 9, {arithmetic: true},
      [this.I32, this.I32, Wasm.i32_mul],
      [this.U32, this.U32, Wasm.i32_mul],
      [this.I64, this.I64, Wasm.i64_mul],
      [this.U64, this.U64, Wasm.i64_mul],
      [this.F32, this.F32, Wasm.f32_mul],
      [this.F64, this.F64, Wasm.f64_mul],
    ),
    this.DIVISION = new Symbol("/", 9, {arithmetic: true},
      [this.I32, this.I32, Wasm.i32_div_s],
      [this.U32, this.U32, Wasm.i32_div_u],
      [this.I64, this.I64, Wasm.i64_div_s],
      [this.U64, this.U64, Wasm.i64_div_u],
      [this.F32, this.F32, Wasm.f32_div_s],
      [this.F64, this.F64, Wasm.f64_div_u],
    ),
    this.MODULUS = new Symbol("%", 9, {arithmetic: true},
      [this.I32, this.I32, Wasm.i32_rem_s],
      [this.U32, this.U32, Wasm.i32_rem_u],
      [this.I64, this.I64, Wasm.i64_rem_s],
      [this.U64, this.U64, Wasm.i64_rem_u],
    ),
    this.BITWISE_AND = new Symbol("&", 6, {arithmetic: true},
      [this.I32, this.I32, Wasm.i32_and],
      [this.U32, this.U32, Wasm.i32_and],
      [this.I64, this.I64, Wasm.i64_and],
      [this.U64, this.U64, Wasm.i64_and],
    ),
    this.BITWISE_OR = new Symbol("|", 4, {arithmetic: true},
      [this.I32, this.I32, Wasm.i32_or],
      [this.U32, this.U32, Wasm.i32_or],
      [this.I64, this.I64, Wasm.i64_or],
      [this.U64, this.U64, Wasm.i64_or],
    ),
    this.BITWISE_XOR = new Symbol("^", 5, {arithmetic: true},
      [this.I32, this.I32, Wasm.i32_xor],
      [this.U32, this.U32, Wasm.i32_xor],
      [this.I64, this.I64, Wasm.i64_xor],
      [this.U64, this.U64, Wasm.i64_xor],
    ),
    this.LEFT_SHIFT = new Symbol("<<", 7, {arithmetic: true},
      [this.I32, this.I32, Wasm.i32_shl],
      [this.U32, this.U32, Wasm.i32_shl],
      [this.I64, this.I64, Wasm.i64_shl],
      [this.U64, this.U64, Wasm.i64_shl],
    ),
    this.RIGHT_SHIFT = new Symbol(">>", 7, {arithmetic: true},
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
    this.VAL_EQUALITY   = new Symbol("=", 3, {comparisson: true},
      [this.BOOL, this.I32, Wasm.i32_eq],
      [this.BOOL, this.U32, Wasm.i32_eq],
      [this.BOOL, this.I64, Wasm.i64_eq],
      [this.BOOL, this.U64, Wasm.i64_eq],
    ),
    this.VAL_INEQUALITY = new Symbol("≠", 3, {comparisson: true},
      [this.BOOL, this.I32, Wasm.i32_eq, Wasm.i32_eqz],
      [this.BOOL, this.U32, Wasm.i32_eq, Wasm.i32_eqz],
      [this.BOOL, this.I64, Wasm.i64_eq, Wasm.i64_eqz],
      [this.BOOL, this.U64, Wasm.i64_eq, Wasm.i64_eqz],
    ),
    this.GREATER = new Symbol(">", 3, {comparisson: true},
      [this.BOOL, this.I32, Wasm.i32_gt_s],
      [this.BOOL, this.U32, Wasm.i32_gt_u],
      [this.BOOL, this.I64, Wasm.i64_gt_s],
      [this.BOOL, this.U64, Wasm.i64_gt_u],
    ),
    this.LESS = new Symbol("<", 3, {comparisson: true},
      [this.BOOL, this.I32, Wasm.i32_lt_s],
      [this.BOOL, this.U32, Wasm.i32_lt_u],
      [this.BOOL, this.I64, Wasm.i64_lt_s],
      [this.BOOL, this.U64, Wasm.i64_lt_u],
    ),
    this.GREATER_EQUAL = new Symbol("≥", 3, {comparisson: true},
      [this.BOOL, this.I32, Wasm.i32_ge_s],
      [this.BOOL, this.U32, Wasm.i32_ge_u],
      [this.BOOL, this.I64, Wasm.i64_ge_s],
      [this.BOOL, this.U64, Wasm.i64_ge_u],
    ),
    this.LESS_EQUAL = new Symbol("≤", 3, {comparisson: true},
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
  this.IN = new Keyword("in");
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