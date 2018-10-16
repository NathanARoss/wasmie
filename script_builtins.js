"use strict";

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



  const classMap = new Map();
  for (let i = 0; i < this.classes.length; ++i) {
    classMap.set(this.classes[i].name, (-this.classes.length + i) & 0x3FF);
  }
  
  //static variables of classes only.  no instance variables
  this.variables = [
    // {name: "E",  type: classMap.get("f64"), scope: classMap.get("Math")},
    // {name: "PI", type: classMap.get("f64"), scope: classMap.get("Math")},
  ].reverse();
  
  const i32 = classMap.get("i32");
  const i64 = classMap.get("i64");
  const u32 = classMap.get("u32");
  const u64 = classMap.get("u64");
  const f32 = classMap.get("f32");
  const f64 = classMap.get("f64");
  const string = classMap.get("string");

  function parseFunction(scope, name, specializations, ...overloads) {
    const formattedOverloads = [];

    for (const overload of overloads) {
      const formattedOverload = {
        importedFuncIndex: overload[0],
        returnType: classMap.get(overload[1]),
        parameters: [],
      }

      for (let i = 2; i < overload.length; i += 3) {
        const param = {
          type: classMap.get(overload[i]),
          name: overload[i + 1],
          defaultRep: [],
        };

        const defaultVal = overload[i + 2];
        switch (param.type) {
          case i32:
          case u32:
            param.defaultRep.push(Wasm.opcodes.i32.const, ...Wasm.varuint(defaultVal));
            break;

          case i64:
          case u64:
            param.defaultRep.push(Wasm.opcodes.i64.const, ...Wasm.varuint(defaultVal));
            break;

          case f32:
            param.defaultRep.push(Wasm.opcodes.f32.const, ...Wasm.f32ToBytes(defaultVal));
            break;

          case f64:
            param.defaultRep.push(Wasm.opcodes.f64.const, ...Wasm.f64ToBytes(defaultVal));
            break;
          
          case string:
            //not supported yet
            throw "encounted default string value for function " + name + " parameter " + param.name;
        }

        if (defaultVal !== undefined) {
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
      scope: classMap.get(scope),
      name,
      overloads: formattedOverloads,
      specializations,
    };
  }

  const builtinFunctions = [
    parseFunction("System", "print", new Map([[classMap.get("string"), 0], [classMap.get("f64"), 1]]),
      [0, "void", "Any", "item", undefined],
    ),
    parseFunction("System", "input", null,
      [2, "f64", "f64", "default", 0, "f64", "min", -Infinity, "f64", "max", Infinity],
    ),
  ];

  this.functions = [];
  for (const builtin of builtinFunctions) {
    for (const overload of builtin.overloads) {
      this.functions.push({
        name: builtin.name,
        scope: builtin.scope,
        specializations: builtin.specializations,
        funcIndex: overload.importedFuncIndex,
        returnType: overload.returnType,
        parameters: overload.parameters,
      });
    }
  }
  this.functions.reverse();
  
  this.symbols = [
    "=", //asignment operators
    "+=",
    "-=",
    "*=",
    "/=",
    "%=",
    "^=", //integer-specific assignment operators
    "&=",
    "|=",
    "<<=",
    ">>=",
    "+", //arithmetic operators
    "-",
    "*",
    "/",
    "%",
    "^", //integer-specific operators
    "&",
    "|",
    "<<",
    ">>",
    "&&", //boolean binary operators
    "||",
    "===", //reference-specific comparison operators
    "!==",
    "==", //comparison operators
    "!=",
    ">",
    "<",
    ">=",
    "<=",
    "..", //half-open range operator
    "..=", //closed range operator
    "-", //arithmetic negation operator
    "!", //binary or bitwise negation operator
    "____", //misc
    ",", //argument separator
    ".", //property accessor
    "(", //subexpression start
    "⟨", //function arguments start
    ")", //subexpression end
    "⟩", //function arguments end
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