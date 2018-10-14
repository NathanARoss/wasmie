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
    {name: "E",  type: classMap.get("f64"), scope: classMap.get("Math")},
    {name: "PI", type: classMap.get("f64"), scope: classMap.get("Math")},
  ].reverse();
  
  function parseFunction(returnType, scope, name, ...parameters) {
    const formattedParameters = [];
    for (let i = 0; i < parameters.length; i += 3) {
      const param = {
        name: parameters[i + 1],
        type: classMap.get(parameters[i]),
        default: parameters[i + 2]
      };

      if (param.default !== undefined) {
        param.name += "\n= ";

        if (typeof param.default === "string") {
          param.name += `"${param.default.replace("\n", "\\n")}"`;
        } else {
          param.name += param.default;
        }
      }

      formattedParameters.push(param);
    }
    
    return {
      scope: classMap.get(scope),
      returnType: classMap.get(returnType),
      name,
      parameters: formattedParameters
    };
  }
  
  /* The .js property prepresents the equivalent javascript function to use when translating. */
  this.functions = [
    // parseFunction("f64", "Math", "cos", "f64", "angle", undefined),
    // parseFunction("f64", "Math", "sin", "f64", "angle", undefined),
    // parseFunction("f64", "Math", "tan", "f64", "angle", undefined),
    // parseFunction("f64", "Math", "acos", "f64", "x/r", undefined),
    // parseFunction("f64", "Math", "asin", "f64", "y/r", undefined),
    // parseFunction("f64", "Math", "atan", "f64", "y/x", undefined),
    // parseFunction("f64", "Math", "atan2", "f64", "y", undefined, "f64", "x", undefined),
    // parseFunction("f64", "Math", "min", "f64", "a", undefined, "f64", "b", undefined),
    // parseFunction("f64", "Math", "max", "f64", "a", undefined, "f64", "b", undefined),
    // parseFunction("f64", "Math", "random"),
    // parseFunction("f64", "Math", "abs", "f64", "number", undefined),
    // parseFunction("f64", "Math", "sign", "f64", "number", undefined),
    // parseFunction("f64", "Math", "sqrt", "f64", "number", undefined),
    // parseFunction("f64", "Math", "power", "f64", "base", undefined, "f64", "exponent", undefined),
    // parseFunction("f64", "Math", "exp", "f64", "exponent", undefined),
    // parseFunction("f64", "Math", "log", "f64", "number", undefined),
    // parseFunction("f64", "Math", "round", "f64", "number", undefined),
    // parseFunction("f64", "Math", "floor", "f64", "number", undefined),
    // parseFunction("f64", "Math", "ceil", "f64", "number", undefined),
    parseFunction("void", "System", "print", "Any", "item", undefined),
  ].reverse();
  
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
    "+", //unary operators
    "-", //arithmetic negation operator
    "!", //binary negation operator
    "____", //misc
    ",", //argument separator
    ".", //property accessor
    "(", //subexpression start
    "(", //function arguments start
    ")", //subexpression end
    ")", //function arguments end
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