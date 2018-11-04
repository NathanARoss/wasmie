"use strict";

class TSSymbol {
  constructor(appearance, precedence, {isUnary, isFoldable} = {isUnary: false, isFoldable: true}, ...uses) {
    this.appearance = appearance;
    this.precedence = precedence;
    this.isUnary = isUnary;
    this.isFoldable = isFoldable;
    
    this.uses = new Map();
    for (const use of uses) {
      const [resultType, operandType, ...wasmCode] = use;
      this.uses.set(operandType, {resultType, wasmCode});
    } 
  }
}

function BuiltIns() {
  this.types = {};
  this.types.data = [
    {name: "void", size: 0},
    {name: "Any", size: 0},
    {name: "bool", size: 4},
    {name: "i8", size: 0}, //smaller ints not supported yet, but I want their IDs reserved
    {name: "u8", size: 0},
    {name: "i16", size: 0},
    {name: "u16", size: 0},
    {name: "i32", size: 4},
    {name: "u32", size: 4},
    {name: "i64", size: 8},
    {name: "u64", size: 8},
    {name: "f32", size: 4},
    {name: "f64", size: 8},
    {name: "string", size: 0}, //DEBUG don't allow the user to create string variables yet
    {name: "System", size: 0},
    {name: "Math", size: 0},
    {name: "Iterable", size: 0},
  ].reverse();


  //short-hand builtin name -> index mapping
  const types = {};

  for (let i = 0; i < this.types.data.length; ++i) {
    types[this.types.data[i].name] = (-this.types.data.length + i) & 0x3FF;
  }
  this.types.builtinNameMapping = types;
  
  //static variables only.  no instance variables
  this.variables = {};
  this.variables.data = [
    // {name: "E",  type: types.f64, scope: clesses.Math},
    // {name: "PI", type: types.f64, scope: types.Math},
  ].reverse();
  this.variables.builtinNameMapping = {};

  function parseFunction(scope, name, ...overloads) {
    const formattedOverloads = [];

    for (const overload of overloads) {
      const formattedOverload = {
        ...overload[0],
        returnType: overload[1],
        parameters: [],
      }

      for (let i = 2; i < overload.length; i += 3) {
        const param = {
          type: overload[i],
          name: overload[i + 1],
          default: overload[i + 2],
        };

        if (param.default !== undefined) {  
          if (typeof param.default === "string") {
            param.name += `\n"${param.default.replace("\n", "\\n")}"`;
          } else {
            param.name += "\n" + param.default;
          }
        }
  
        formattedOverload.parameters.push(param);
      }

      formattedOverloads.push(formattedOverload);
    }
    
    return {
      scope,
      name,
      overloads: formattedOverloads,
    };
  }

  const builtinFunctions = [
    parseFunction(types.System, "print",
      [{}, types.void, types.Any, "item", "\n"],
      [{importedFuncIndex: 0}, types.void, types.string, "item"],
      [{importedFuncIndex: 6,
      afterArguments: [
        Wasm.opcodes.i64_extend_u_from_i32
      ]}, types.void, types.u32, "item"],
      [{importedFuncIndex: 1}, types.void, types.i32, "item"],
      [{importedFuncIndex: 2}, types.void, types.f32, "item"],
      [{importedFuncIndex: 3}, types.void, types.f64, "item"],
      [{importedFuncIndex: 47}, types.void, types.u64, "item"],
      [{importedFuncIndex: 48}, types.void, types.i64, "item"],

      [{importedFuncIndex: 0,
      beforeArguments: [
        Wasm.opcodes.i32_const, 2,
        Wasm.opcodes.i32_const, 8,
      ],
      afterArguments: [
        Wasm.opcodes.select
      ]}, types.void, types.bool, "item", undefined],
    ),
    parseFunction(types.System, "input",
      [{importedFuncIndex: 4}, types.f64, types.f64, "default", 0, types.f64, "min", -Infinity, types.f64, "max", Infinity],
    ),
    parseFunction(types.Math, "rotateLeft",
      [{afterArguments: [Wasm.opcodes.i32_rotl]}, types.i32, types.i32, "num", undefined, types.i32, "shiftCount", 0],
      [{afterArguments: [Wasm.opcodes.i64_rotl]}, types.i64, types.i64, "num", undefined, types.i64, "shiftCount", 0],
    ),
    parseFunction(types.Math, "rotateRight",
      [{afterArguments: [Wasm.opcodes.i32_rotr]}, types.i32, types.i32, "num", undefined, types.i32, "shiftCount", 0],
      [{afterArguments: [Wasm.opcodes.i64_rotr]}, types.i64, types.i64, "num", undefined, types.i64, "shiftCount", 0],
    ),
    parseFunction(types.Math, "abs",
      [{afterArguments: [Wasm.opcodes.f32_abs]}, types.f32, types.f32, "num"],
      [{afterArguments: [Wasm.opcodes.f64_abs]}, types.f64, types.f64, "num"],
    ),
    parseFunction(types.Math, "ceil",
      [{afterArguments: [Wasm.opcodes.f32_ceil]}, types.f32, types.f32, "num"],
      [{afterArguments: [Wasm.opcodes.f64_ceil]}, types.f64, types.f64, "num"],
    ),
    parseFunction(types.Math, "floor",
      [{afterArguments: [Wasm.opcodes.f32_floor]}, types.f32, types.f32, "num"],
      [{afterArguments: [Wasm.opcodes.f64_floor]}, types.f64, types.f64, "num"],
    ),
    parseFunction(types.Math, "trunc",
      [{afterArguments: [Wasm.opcodes.f32_trunc]}, types.f32, types.f32, "num"],
      [{afterArguments: [Wasm.opcodes.f64_trunc]}, types.f64, types.f64, "num"],
    ),
    parseFunction(types.Math, "nearest",
      [{afterArguments: [Wasm.opcodes.f32_nearest]}, types.f32, types.f32, "num"],
      [{afterArguments: [Wasm.opcodes.f64_nearest]}, types.f64, types.f64, "num"],
    ),
    parseFunction(types.Math, "sqrt",
      [{afterArguments: [Wasm.opcodes.f32_sqrt]}, types.f32, types.f32, "num"],
      [{afterArguments: [Wasm.opcodes.f64_sqrt]}, types.f64, types.f64, "num"],
    ),
    parseFunction(types.Math, "min",
      [{afterArguments: [Wasm.opcodes.f32_min]}, types.f32, types.f32, "num1", undefined, types.f32, "num2", 0],
      [{afterArguments: [Wasm.opcodes.f64_min]}, types.f64, types.f64, "num1", undefined, types.f64, "num2", 0],
    ),
    parseFunction(types.Math, "max",
      [{afterArguments: [Wasm.opcodes.f32_max]}, types.f32, types.f32, "num1", undefined, types.f32, "num2", 0],
      [{afterArguments: [Wasm.opcodes.f64_max]}, types.f64, types.f64, "num1", undefined, types.f64, "num2", 0],
    ),
    parseFunction(types.Math, "copysign",
      [{afterArguments: [Wasm.opcodes.f32_copysign]}, types.f32, types.f32, "magNum", 1, types.f32, "signNum", undefined],
      [{afterArguments: [Wasm.opcodes.f64_copysign]}, types.f64, types.f64, "magNum", 1, types.f64, "signNum", undefined],
    ),
    parseFunction(types.System, "cos",
      [{importedFuncIndex: 5}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 6}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "sin",
      [{importedFuncIndex: 7}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 8}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "tan",
      [{importedFuncIndex: 9}, types.f32, types.f32, "y/x", undefined],
      [{importedFuncIndex: 10}, types.f64, types.f64, "y/x", undefined],
    ),
    parseFunction(types.System, "acos",
      [{importedFuncIndex: 11}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 12}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "asin",
      [{importedFuncIndex: 13}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 14}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "atan",
      [{importedFuncIndex: 15}, types.f32, types.f32, "y/x", undefined],
      [{importedFuncIndex: 16}, types.f64, types.f64, "y/x", undefined],
    ),
    parseFunction(types.System, "atan2",
      [{importedFuncIndex: 17}, types.f32, types.f32, "y", undefined, types.f32, "x", undefined],
      [{importedFuncIndex: 18}, types.f64, types.f64, "y", undefined, types.f64, "x", undefined],
    ),
    parseFunction(types.System, "cosh",
      [{importedFuncIndex: 19}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 20}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "sinh",
      [{importedFuncIndex: 21}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 22}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "tanh",
      [{importedFuncIndex: 23}, types.f32, types.f32, "y/x", undefined],
      [{importedFuncIndex: 24}, types.f64, types.f64, "y/x", undefined],
    ),
    parseFunction(types.System, "acosh",
      [{importedFuncIndex: 25}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 26}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "asinh",
      [{importedFuncIndex: 27}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 28}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "atanh",
      [{importedFuncIndex: 29}, types.f32, types.f32, "y/x", undefined],
      [{importedFuncIndex: 30}, types.f64, types.f64, "y/x", undefined],
    ),
    parseFunction(types.System, "cubeRoot",
      [{importedFuncIndex: 31}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 32}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "E^",
      [{importedFuncIndex: 33}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 34}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "log",
      [{importedFuncIndex: 35}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 36}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "log10",
      [{importedFuncIndex: 37}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 38}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "log2",
      [{importedFuncIndex: 39}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 40}, types.f64, types.f64, "num", undefined],
    ),
    parseFunction(types.System, "pow",
      [{importedFuncIndex: 41}, types.f32, types.f32, "base", undefined, types.f32, "power", undefined],
      [{importedFuncIndex: 42}, types.f64, types.f64, "base", undefined, types.f64, "power", undefined],
    ),
    parseFunction(types.System, "random",
      [{importedFuncIndex: 43}, types.f64],
    ),
    parseFunction(types.System, "sign",
      [{importedFuncIndex: 44}, types.f32, types.f32, "num", undefined],
      [{importedFuncIndex: 45}, types.f64, types.f64, "num", undefined],
    ),
  ];

  this.functions = {data: [], builtinNameMapping: {}};
  for (const builtin of builtinFunctions) {
    const scope = this.types.data[(builtin.scope + this.types.data.length) & 0x3FF];
    const identifier = scope.name + "_" + builtin.name;
    this.functions.builtinNameMapping[identifier] = (-this.functions.data.length - 1) & 0xFFFF;

    for (const overload of builtin.overloads) {
      this.functions.data.push({
        name: builtin.name,
        scope: builtin.scope,
        importedFuncIndex: overload.importedFuncIndex,
        beforeArguments: overload.beforeArguments,
        afterArguments: overload.afterArguments,
        returnType: overload.returnType,
        parameters: overload.parameters,
      });
    }
  }
  this.functions.data.reverse();
  
  this.symbols = [
    new TSSymbol("=", 0), //asignment operators
    new TSSymbol("+=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_add],
      [types.u32, types.u32, Wasm.opcodes.i32_add],
      [types.i64, types.i64, Wasm.opcodes.i64_add],
      [types.u64, types.u64, Wasm.opcodes.i64_add],
      [types.f32, types.f32, Wasm.opcodes.f32_add],
      [types.f64, types.f64, Wasm.opcodes.f64_add],
    ),
    new TSSymbol("-=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_sub],
      [types.u32, types.u32, Wasm.opcodes.i32_sub],
      [types.i64, types.i64, Wasm.opcodes.i64_sub],
      [types.u64, types.u64, Wasm.opcodes.i64_sub],
      [types.f32, types.f32, Wasm.opcodes.f32_sub],
      [types.f64, types.f64, Wasm.opcodes.f64_sub],
    ),
    new TSSymbol("*=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_mul],
      [types.u32, types.u32, Wasm.opcodes.i32_mul],
      [types.i64, types.i64, Wasm.opcodes.i64_mul],
      [types.u64, types.u64, Wasm.opcodes.i64_mul],
      [types.f32, types.f32, Wasm.opcodes.f32_mul],
      [types.f64, types.f64, Wasm.opcodes.f64_mul],
    ),
    new TSSymbol("/=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_div_s],
      [types.u32, types.u32, Wasm.opcodes.i32_div_u],
      [types.i64, types.i64, Wasm.opcodes.i64_div_s],
      [types.u64, types.u64, Wasm.opcodes.i64_div_u],
      [types.f32, types.f32, Wasm.opcodes.f32_div_s],
      [types.f64, types.f64, Wasm.opcodes.f64_div_u],
    ),
    new TSSymbol("%=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_rem_s],
      [types.u32, types.u32, Wasm.opcodes.i32_rem_u],
      [types.i64, types.i64, Wasm.opcodes.i64_rem_s],
      [types.u64, types.u64, Wasm.opcodes.i64_rem_u],
    ),
    new TSSymbol("&=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_and],
      [types.u32, types.u32, Wasm.opcodes.i32_and],
      [types.i64, types.i64, Wasm.opcodes.i64_and],
      [types.u64, types.u64, Wasm.opcodes.i64_and],
    ),//integer-specific assignment operators
    new TSSymbol("|=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_or],
      [types.u32, types.u32, Wasm.opcodes.i32_or],
      [types.i64, types.i64, Wasm.opcodes.i64_or],
      [types.u64, types.u64, Wasm.opcodes.i64_or],
    ),
    new TSSymbol("^=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_xor],
      [types.u32, types.u32, Wasm.opcodes.i32_xor],
      [types.i64, types.i64, Wasm.opcodes.i64_xor],
      [types.u64, types.u64, Wasm.opcodes.i64_xor],
    ),
    new TSSymbol("<<=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_shl],
      [types.u32, types.u32, Wasm.opcodes.i32_shl],
      [types.i64, types.i64, Wasm.opcodes.i64_shl],
      [types.u64, types.u64, Wasm.opcodes.i64_shl],
    ),
    new TSSymbol(">>=", 0, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_shr_s],
      [types.u32, types.u32, Wasm.opcodes.i32_shr_u],
      [types.i64, types.i64, Wasm.opcodes.i64_shr_s],
      [types.u64, types.u64, Wasm.opcodes.i64_shr_u],
    ),
    new TSSymbol("+", 8, undefined, //arithmetic operators
      [types.i32, types.i32, Wasm.opcodes.i32_add],
      [types.u32, types.u32, Wasm.opcodes.i32_add],
      [types.i64, types.i64, Wasm.opcodes.i64_add],
      [types.u64, types.u64, Wasm.opcodes.i64_add],
      [types.f32, types.f32, Wasm.opcodes.f32_add],
      [types.f64, types.f64, Wasm.opcodes.f64_add],
    ),
    new TSSymbol("-", 8, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_sub],
      [types.u32, types.u32, Wasm.opcodes.i32_sub],
      [types.i64, types.i64, Wasm.opcodes.i64_sub],
      [types.u64, types.u64, Wasm.opcodes.i64_sub],
      [types.f32, types.f32, Wasm.opcodes.f32_sub],
      [types.f64, types.f64, Wasm.opcodes.f64_sub],
    ),
    new TSSymbol("*", 9, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_mul],
      [types.u32, types.u32, Wasm.opcodes.i32_mul],
      [types.i64, types.i64, Wasm.opcodes.i64_mul],
      [types.u64, types.u64, Wasm.opcodes.i64_mul],
      [types.f32, types.f32, Wasm.opcodes.f32_mul],
      [types.f64, types.f64, Wasm.opcodes.f64_mul],
   ),
    new TSSymbol("/", 9, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_div_s],
      [types.u32, types.u32, Wasm.opcodes.i32_div_u],
      [types.i64, types.i64, Wasm.opcodes.i64_div_s],
      [types.u64, types.u64, Wasm.opcodes.i64_div_u],
      [types.f32, types.f32, Wasm.opcodes.f32_div_s],
      [types.f64, types.f64, Wasm.opcodes.f64_div_u],
   ),
    new TSSymbol("%", 9, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_rem_s],
      [types.u32, types.u32, Wasm.opcodes.i32_rem_u],
      [types.i64, types.i64, Wasm.opcodes.i64_rem_s],
      [types.u64, types.u64, Wasm.opcodes.i64_rem_u],
    ),
    new TSSymbol("&", 6, undefined, //integer-specific operators
      [types.i32, types.i32, Wasm.opcodes.i32_and],
      [types.u32, types.u32, Wasm.opcodes.i32_and],
      [types.i64, types.i64, Wasm.opcodes.i64_and],
      [types.u64, types.u64, Wasm.opcodes.i64_and],
    ),
    new TSSymbol("|", 4, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_or],
      [types.u32, types.u32, Wasm.opcodes.i32_or],
      [types.i64, types.i64, Wasm.opcodes.i64_or],
      [types.u64, types.u64, Wasm.opcodes.i64_or],
    ),
    new TSSymbol("^", 5, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_xor],
      [types.u32, types.u32, Wasm.opcodes.i32_xor],
      [types.i64, types.i64, Wasm.opcodes.i64_xor],
      [types.u64, types.u64, Wasm.opcodes.i64_xor],
    ),
    new TSSymbol("<<", 7, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_shl],
      [types.u32, types.u32, Wasm.opcodes.i32_shl],
      [types.i64, types.i64, Wasm.opcodes.i64_shl],
      [types.u64, types.u64, Wasm.opcodes.i64_shl],
    ),
    new TSSymbol(">>", 7, undefined,
      [types.i32, types.i32, Wasm.opcodes.i32_shr_s],
      [types.u32, types.u32, Wasm.opcodes.i32_shr_u],
      [types.i64, types.i64, Wasm.opcodes.i64_shr_s],
      [types.u64, types.u64, Wasm.opcodes.i64_shr_u],
    ),
    new TSSymbol("&&", 2, undefined, //boolean binary operators
      [types.bool, types.bool, Wasm.opcodes.i32_and],
    ),
    new TSSymbol("||", 1, undefined,
      [types.bool, types.bool, Wasm.opcodes.i32_or],
    ),
    new TSSymbol("===", 3), //reference-specific comparison operators
    new TSSymbol("!==", 3),
    new TSSymbol("==", 3, undefined,
      [types.bool, types.i32, Wasm.opcodes.i32_eq],
      [types.bool, types.u32, Wasm.opcodes.i32_eq],
      [types.bool, types.i64, Wasm.opcodes.i64_eq],
      [types.bool, types.u64, Wasm.opcodes.i64_eq],
    ), //comparison operators
    new TSSymbol("!=", 3, undefined,
      [types.bool, types.i32, Wasm.opcodes.i32_eq, Wasm.opcodes.i32_eqz],
      [types.bool, types.u32, Wasm.opcodes.i32_eq, Wasm.opcodes.i32_eqz],
      [types.bool, types.i64, Wasm.opcodes.i64_eq, Wasm.opcodes.i64_eqz],
      [types.bool, types.u64, Wasm.opcodes.i64_eq, Wasm.opcodes.i64_eqz],
    ),
    new TSSymbol(">", 3, undefined,
      [types.bool, types.i32, Wasm.opcodes.i32_gt_s],
      [types.bool, types.u32, Wasm.opcodes.i32_gt_u],
      [types.bool, types.i64, Wasm.opcodes.i64_gt_s],
      [types.bool, types.u64, Wasm.opcodes.i64_gt_u],
    ),
    new TSSymbol("<", 3, undefined,
      [types.bool, types.i32, Wasm.opcodes.i32_lt_s],
      [types.bool, types.u32, Wasm.opcodes.i32_lt_u],
      [types.bool, types.i64, Wasm.opcodes.i64_lt_s],
      [types.bool, types.u64, Wasm.opcodes.i64_lt_u],
    ),
    new TSSymbol(">=", 3, undefined,
      [types.bool, types.i32, Wasm.opcodes.i32_ge_s],
      [types.bool, types.u32, Wasm.opcodes.i32_ge_u],
      [types.bool, types.i64, Wasm.opcodes.i64_ge_s],
      [types.bool, types.u64, Wasm.opcodes.i64_ge_u],
    ),
    new TSSymbol("<=", 3, undefined,
      [types.bool, types.i32, Wasm.opcodes.i32_le_s],
      [types.bool, types.u32, Wasm.opcodes.i32_le_u],
      [types.bool, types.i64, Wasm.opcodes.i64_le_s],
      [types.bool, types.u64, Wasm.opcodes.i64_le_u],
    ),
    new TSSymbol("..<", 0, {isFoldable: false}, //half-open range operator
      [types.Iterable, types.i32, Wasm.opcodes.i32_lt_s, Wasm.opcodes.i32_add],
      [types.Iterable, types.u32, Wasm.opcodes.i32_lt_u, Wasm.opcodes.i32_add],
      [types.Iterable, types.i64, Wasm.opcodes.i64_lt_s, Wasm.opcodes.i64_add],
      [types.Iterable, types.u64, Wasm.opcodes.i64_lt_u, Wasm.opcodes.i64_add],
      [types.Iterable, types.f32, Wasm.opcodes.f32_lt, Wasm.opcodes.f32_add],
      [types.Iterable, types.f64, Wasm.opcodes.f64_lt, Wasm.opcodes.f64_add],
    ),
    new TSSymbol("..<=", 0, {isFoldable: false}, //closed range operator
      [types.Iterable, types.i32, Wasm.opcodes.i32_le_s, Wasm.opcodes.i32_add],
      [types.Iterable, types.u32, Wasm.opcodes.i32_le_u, Wasm.opcodes.i32_add],
      [types.Iterable, types.i64, Wasm.opcodes.i64_le_s, Wasm.opcodes.i64_add],
      [types.Iterable, types.u64, Wasm.opcodes.i64_le_u, Wasm.opcodes.i64_add],
      [types.Iterable, types.f32, Wasm.opcodes.f32_le, Wasm.opcodes.f32_add],
      [types.Iterable, types.f64, Wasm.opcodes.f64_le, Wasm.opcodes.f64_add],
    ),
    new TSSymbol("..>", 0, {isFoldable: false}, //reversed half-open range operator
      [types.Iterable, types.i32, Wasm.opcodes.i32_gt_s, Wasm.opcodes.i32_sub],
      [types.Iterable, types.u32, Wasm.opcodes.i32_gt_u, Wasm.opcodes.i32_sub],
      [types.Iterable, types.i64, Wasm.opcodes.i64_gt_s, Wasm.opcodes.i64_sub],
      [types.Iterable, types.u64, Wasm.opcodes.i64_gt_u, Wasm.opcodes.i64_sub],
      [types.Iterable, types.f32, Wasm.opcodes.f32_gt, Wasm.opcodes.f32_sub],
      [types.Iterable, types.f64, Wasm.opcodes.f64_gt, Wasm.opcodes.f64_sub],
    ),
    new TSSymbol("..>=", 0, {isFoldable: false}, //reversed closed range operator
      [types.Iterable, types.i32, Wasm.opcodes.i32_ge_s, Wasm.opcodes.i32_sub],
      [types.Iterable, types.u32, Wasm.opcodes.i32_ge_u, Wasm.opcodes.i32_sub],
      [types.Iterable, types.i64, Wasm.opcodes.i64_ge_s, Wasm.opcodes.i64_sub],
      [types.Iterable, types.u64, Wasm.opcodes.i64_ge_u, Wasm.opcodes.i64_sub],
      [types.Iterable, types.f32, Wasm.opcodes.f32_ge, Wasm.opcodes.f32_sub],
      [types.Iterable, types.f64, Wasm.opcodes.f64_ge, Wasm.opcodes.f64_sub],
    ),
    new TSSymbol("-", 10, {isUnary: true}, //arithmetic negation operator
      [types.i32, types.i32, Wasm.opcodes.i32_const, 0, Wasm.opcodes.i32_sub],
      [types.u32, types.u32, Wasm.opcodes.i32_const, 0, Wasm.opcodes.i32_sub],
      [types.i64, types.i64, Wasm.opcodes.i64_const, 0, Wasm.opcodes.i64_sub],
      [types.u64, types.u64, Wasm.opcodes.i64_const, 0, Wasm.opcodes.i64_sub],
    ),
    new TSSymbol("!", 10, {isUnary: true}, //binary or bitwise negation operator
      [types.boolean, Wasm.opcodes.i32_eqz],
      [types.i32, types.i32, Wasm.opcodes.i32_const, ...Wasm.varint(-1), Wasm.opcodes.i32_xor],
      [types.u32, types.u32, Wasm.opcodes.i32_const, ...Wasm.varint(-1), Wasm.opcodes.i32_xor],
      [types.i64, types.i64, Wasm.opcodes.i64_const, ...Wasm.varint(-1), Wasm.opcodes.i64_xor],
      [types.u64, types.u64, Wasm.opcodes.i64_const, ...Wasm.varint(-1), Wasm.opcodes.i64_xor],
    ),
    new TSSymbol("____", 0), //misc
    new TSSymbol(",", 0), //argument separator
    new TSSymbol(".", 0), //property accessor
    new TSSymbol("(", 0), //subexpression start
    new TSSymbol("⟨", 0), //function arguments start
    new TSSymbol(")", 0), //subexpression end
    new TSSymbol("⟩", 0), //function arguments end
  ];
  
  this.keywords = [
    {name: "func"},
    {name: "let"},
    {name: "var"},
    {name: "if"},
    {name: "else"},
    {name: "for"},
    {name: "in"},
    {name: "while"},
    {name: "do while"},
    {name: "switch"},
    {name: "case"},
    {name: "default"},
    {name: "return"},
    {name: "break"},
    {name: "continue"},
    {name: "step"},
  ];
}