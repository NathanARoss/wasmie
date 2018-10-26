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
  this.classes = [
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



  const classes = {};
  for (let i = 0; i < this.classes.length; ++i) {
    classes[this.classes[i].name] = (-this.classes.length + i) & 0x3FF;
  }
  
  //static variables of classes only.  no instance variables
  this.variables = [
    // {name: "E",  type: classes.f64, scope: clesses.Math},
    // {name: "PI", type: classes.f64, scope: classes.Math},
  ].reverse();

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
          defaultRep: [],
        };

        const defaultVal = overload[i + 2];
        if (defaultVal !== undefined) {
          switch (param.type) {
            case classes.i32:
            case classes.u32:
              param.defaultRep.push(Wasm.opcodes.i32_const, ...Wasm.varint(defaultVal));
              break;
  
            case classes.i64:
            case classes.u64:
              param.defaultRep.push(Wasm.opcodes.i64_const, ...Wasm.varint(defaultVal));
              break;
  
            case classes.f32:
              param.defaultRep.push(Wasm.opcodes.f32_const, ...Wasm.f32ToBytes(defaultVal));
              break;
  
            case classes.f64:
              param.defaultRep.push(Wasm.opcodes.f64_const, ...Wasm.f64ToBytes(defaultVal));
              break;
            
            case classes.string:
              //not supported yet
              throw "encounted default string value for function " + name + " parameter " + param.name;
          }
          
          param.name += "\n";
  
          if (typeof defaultVal === "string") {
            param.name += `"${defaultVal.replace("\n", "\\n")}"`;
          } else {
            param.name += defaultVal;
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
    parseFunction(classes.System, "print",
      [-1, classes.void, classes.Any, "item", undefined],
      [0, classes.void, classes.string, "item", undefined],
      [1, classes.void, classes.i32, "item", undefined],
      [2, classes.void, classes.u32, "item", undefined],
      [3, classes.void, classes.i64, "item", undefined],
      [4, classes.void, classes.u64, "item", undefined],
      [5, classes.void, classes.f32, "item", undefined],
      [6, classes.void, classes.f64, "item", undefined],
    ),
    parseFunction(classes.System, "input",
      [7, classes.f64, classes.f64, "default", 0, classes.f64, "min", -Infinity, classes.f64, "max", Infinity],
    ),
  ];

  this.functions = [];
  for (const builtin of builtinFunctions) {
    for (const overload of builtin.overloads) {
      this.functions.push({
        name: builtin.name,
        scope: builtin.scope,
        importedFuncIndex: overload.importedFuncIndex,
        returnType: overload.returnType,
        parameters: overload.parameters,
      });
    }
  }
  this.functions.reverse();
  
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
      [classes.i32, Wasm.opcodes.i32_add],
      [classes.u32, Wasm.opcodes.i32_add],
      [classes.i64, Wasm.opcodes.i64_add],
      [classes.u64, Wasm.opcodes.i64_add],
      [classes.f32, Wasm.opcodes.f32_add],
      [classes.f64, Wasm.opcodes.f64_add],
    ),
    new TSSymbol("-", 8, false,
      [classes.i32, Wasm.opcodes.i32_sub],
      [classes.u32, Wasm.opcodes.i32_sub],
      [classes.i64, Wasm.opcodes.i64_sub],
      [classes.u64, Wasm.opcodes.i64_sub],
      [classes.f32, Wasm.opcodes.f32_sub],
      [classes.f64, Wasm.opcodes.f64_sub],
    ),
    new TSSymbol("*", 9, false,
     [classes.i32, Wasm.opcodes.i32_mul],
     [classes.u32, Wasm.opcodes.i32_mul],
     [classes.i64, Wasm.opcodes.i64_mul],
     [classes.u64, Wasm.opcodes.i64_mul],
     [classes.f32, Wasm.opcodes.f32_mul],
     [classes.f64, Wasm.opcodes.f64_mul],
   ),
    new TSSymbol("/", 9, false,
     [classes.i32, Wasm.opcodes.i32_div_s],
     [classes.u32, Wasm.opcodes.i32_div_u],
     [classes.i64, Wasm.opcodes.i64_div_s],
     [classes.u64, Wasm.opcodes.i64_div_u],
     [classes.f32, Wasm.opcodes.f32_div_s],
     [classes.f64, Wasm.opcodes.f64_div_u],
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
      [classes.boolean, Wasm.opcodes.i32_eqz],
      [classes.i32, Wasm.opcodes.i32_const, ...Wasm.varint(-1), Wasm.opcodes.i32_xor],
      [classes.u32, Wasm.opcodes.i32_const, ...Wasm.varint(-1), Wasm.opcodes.i32_xor],
      [classes.i64, Wasm.opcodes.i64_const, ...Wasm.varint(-1), Wasm.opcodes.i64_xor],
      [classes.u64, Wasm.opcodes.i64_const, ...Wasm.varint(-1), Wasm.opcodes.i64_xor],
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