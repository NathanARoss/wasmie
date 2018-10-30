"use strict";

class TSSymbol {
  constructor(appearance, precedence, isUnary, ...uses) {
    this.appearance = appearance;
    this.precedence = precedence;
    this.isUnary = isUnary;
    
    this.uses = new Map();
    for (const use of uses) {
      const [type, ...wasmCode] = use;
      this.uses.set(type, wasmCode);
    } 
  }
}

function BuiltIns() {
  this.types = {};
  this.types.data = [
    {name: "void", size: 0},
    {name: "Any", size: 0},
    // {name: "bool", size: 1},
    // {name: "i8", size: 1},
    // {name: "u8", size: 1},
    // {name: "i16", size: 2},
    // {name: "u16", size: 2},
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
        importedFuncIndex: overload[0],
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
          if (param.type === types.string) {
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
      [-1, types.void, types.Any, "item", undefined],
      [0, types.void, types.string, "item", undefined],
      [1, types.void, types.u32, "item", undefined],
      [2, types.void, types.i32, "item", undefined],
      [3, types.void, types.f32, "item", undefined],
      [4, types.void, types.f64, "item", undefined],
      [7, types.void, types.u64, "item", undefined],
      // [8, types.void, types.i64, "item", undefined],
    ),
    parseFunction(types.System, "input",
      [5, types.f64, types.f64, "default", 0, types.f64, "min", -Infinity, types.f64, "max", Infinity],
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
        returnType: overload.returnType,
        parameters: overload.parameters,
      });
    }
  }
  this.functions.data.reverse();
  
  this.symbols = [
    new TSSymbol("=", 0), //asignment operators
    new TSSymbol("+=", 0),
    new TSSymbol("-=", 0),
    new TSSymbol("*=", 0),
    new TSSymbol("/=", 0),
    new TSSymbol("%=", 0),
    new TSSymbol("^=", 0), //integer-specific assignment operators
    new TSSymbol("&=", 0),
    new TSSymbol("|=", 0),
    new TSSymbol("<<=", 0),
    new TSSymbol(">>=", 0),
    new TSSymbol("+", 8, false, //arithmetic operators
      [types.i32, Wasm.opcodes.i32_add],
      [types.u32, Wasm.opcodes.i32_add],
      [types.i64, Wasm.opcodes.i64_add],
      [types.u64, Wasm.opcodes.i64_add],
      [types.f32, Wasm.opcodes.f32_add],
      [types.f64, Wasm.opcodes.f64_add],
    ),
    new TSSymbol("-", 8, false,
      [types.i32, Wasm.opcodes.i32_sub],
      [types.u32, Wasm.opcodes.i32_sub],
      [types.i64, Wasm.opcodes.i64_sub],
      [types.u64, Wasm.opcodes.i64_sub],
      [types.f32, Wasm.opcodes.f32_sub],
      [types.f64, Wasm.opcodes.f64_sub],
    ),
    new TSSymbol("*", 9, false,
     [types.i32, Wasm.opcodes.i32_mul],
     [types.u32, Wasm.opcodes.i32_mul],
     [types.i64, Wasm.opcodes.i64_mul],
     [types.u64, Wasm.opcodes.i64_mul],
     [types.f32, Wasm.opcodes.f32_mul],
     [types.f64, Wasm.opcodes.f64_mul],
   ),
    new TSSymbol("/", 9, false,
     [types.i32, Wasm.opcodes.i32_div_s],
     [types.u32, Wasm.opcodes.i32_div_u],
     [types.i64, Wasm.opcodes.i64_div_s],
     [types.u64, Wasm.opcodes.i64_div_u],
     [types.f32, Wasm.opcodes.f32_div_s],
     [types.f64, Wasm.opcodes.f64_div_u],
   ),
    new TSSymbol("%", 9),
    new TSSymbol("|", 4), //integer-specific operators
    new TSSymbol("^", 5),
    new TSSymbol("&", 6),
    new TSSymbol("<<", 7),
    new TSSymbol(">>", 7),
    new TSSymbol("&&", 2), //boolean binary operators
    new TSSymbol("||", 1),
    new TSSymbol("===", 3), //reference-specific comparison operators
    new TSSymbol("!==", 3),
    new TSSymbol("==", 3), //comparison operators
    new TSSymbol("!=", 3),
    new TSSymbol(">", 3),
    new TSSymbol("<", 3),
    new TSSymbol(">=", 3),
    new TSSymbol("<=", 3),
    new TSSymbol("..", 0), //half-open range operator
    new TSSymbol("..=", 0), //closed range operator
    new TSSymbol("-", 10, true), //arithmetic negation operator
    new TSSymbol("!", 10, true, //binary or bitwise negation operator
      [types.boolean, Wasm.opcodes.i32_eqz],
      [types.i32, Wasm.opcodes.i32_const, ...Wasm.varint(-1), Wasm.opcodes.i32_xor],
      [types.u32, Wasm.opcodes.i32_const, ...Wasm.varint(-1), Wasm.opcodes.i32_xor],
      [types.i64, Wasm.opcodes.i64_const, ...Wasm.varint(-1), Wasm.opcodes.i64_xor],
      [types.u64, Wasm.opcodes.i64_const, ...Wasm.varint(-1), Wasm.opcodes.i64_xor],
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
  ];
}