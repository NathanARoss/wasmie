"use strict";

function BuiltIns() {
  this.classes = [
    {name: "void", size: 0},
    {name: "Any", size: 0},
    {name: "Boolean", size: 1},
    {name: "Int8", size: 1},
    {name: "UInt8", size: 1},
    {name: "Int16", size: 2},
    {name: "UInt16", size: 2},
    {name: "Int32", size: 4},
    {name: "UInt32", size: 4},
    {name: "Int64", size: 8},
    {name: "UInt64", size: 8},
    {name: "Float", size: 4},
    {name: "Double", size: 8},
    {name: "String", size: 4},
    {name: "System", size: 0},
    {name: "Math", size: 0},
    {name: "removed", size: 0},
    {name: "Iterable", size: 0},
  ].reverse();

  const classMap = new Map();
  for (let i = 0; i < this.classes.length; ++i) {
    classMap.set(this.classes[i].name, (-this.classes.length + i) & 0x3FF);
  }
  
  //static variables of classes only.  no instance variables
  this.variables = [
    {name: "E",        type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.E"},
    {name: "PI",       type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.PI"},
    {name: "non-breaking space", type: classMap.get("String"), scope: classMap.get("System"), js: '"\xa0"'},
  ].reverse();
  
  function parseFunction(js, returnType, scope, name, ...parameters) {
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
      js,
      scope: classMap.get(scope),
      returnType: classMap.get(returnType),
      name,
      parameters: formattedParameters
    };
  }
  
  /* The .js property prepresents the equivalent javascript function to use when translating. */
  this.functions = [
    parseFunction("stride", "Iterable", "Iterable", "range", "Int32", "start", 0, "Int32", "end", undefined, "Int32", "step", 1),
    parseFunction("Math.cos", "Double", "Math", "cos", "Double", "angle", undefined),
    parseFunction("Math.sin", "Double", "Math", "sin", "Double", "angle", undefined),
    parseFunction("Math.tan", "Double", "Math", "tan", "Double", "angle", undefined),
    parseFunction("Math.acos", "Double", "Math", "acos", "Double", "x/r", undefined),
    parseFunction("Math.asin", "Double", "Math", "asin", "Double", "y/r", undefined),
    parseFunction("Math.atan", "Double", "Math", "atan", "Double", "y/x", undefined),
    parseFunction("Math.atan2", "Double", "Math", "atan2", "Double", "y", undefined, "Double", "x", undefined),
    parseFunction("Math.min", "Double", "Math", "min", "Double", "a", undefined, "Double", "b", undefined),
    parseFunction("Math.max", "Double", "Math", "max", "Double", "a", undefined, "Double", "b", undefined),
    parseFunction("Math.random", "Double", "Math", "random"),
    parseFunction("Math.abs", "Double", "Math", "abs", "Double", "number", undefined),
    parseFunction("Math.sign", "Double", "Math", "sign", "Double", "number", undefined),
    parseFunction("Math.sqrt", "Double", "Math", "sqrt", "Double", "number", undefined),
    parseFunction("Math.power", "Double", "Math", "power", "Double", "base", undefined, "Double", "exponent", undefined),
    parseFunction("Math.exp", "Double", "Math", "exp", "Double", "exponent", undefined),
    parseFunction("Math.log", "Double", "Math", "log", "Double", "number", undefined),
    parseFunction("Math.round", "Double", "Math", "round", "Double", "number", undefined),
    parseFunction("Math.floor", "Double", "Math", "floor", "Double", "number", undefined),
    parseFunction("Math.ceil", "Double", "Math", "ceil", "Double", "number", undefined),
    parseFunction("print", "void", "System", "print", "Any", "item", "", "String", "terminator", "\n", "Boolean", "word wrap", false),
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
    "+", //string concatenation
    "*", //string repetition
    "U", //union operator
    "??", //nil-coalescing operator
    "...", //half-open range operator
    "..", //closed range operator
    ":", //range step operator
    "+", //unary operators
    "-",
    "!", //boolean unary operator
    "~", //bitwise unary operator
    "*", //spread operator
    "____", //misc
    ",", //argument separator
    ".", //property accessor
    "?", //first part of ternary conditional operator
    ":", //second part of ternary conditional operator
    "(", //subexpression start
    "⟨", //function arguments start
    "[", //subscript start
    "【", //array literal start
    "{", //dictionary literal start
    ")", //subexpression end
    "⟩", //function arguments end
    "]", //subscript end
    "】", //array literal end
    "}", //dictionary literal end
  ];
  
  this.keywords = [
    {name: "func",     js: ""},
    {name: "let",      js: "const"},
    {name: "var",      js: "let"},
    {name: "if",       js: "if ("},
    {name: "else",     js: "else"},
    {name: "for",      js: "for ("},
    {name: "in",       js: "of"},
    {name: "while",    js: "while ("},
    {name: "do while", js: "do ("},
    {name: "switch",   js: "switch ("},
    {name: "case",     js: "case"},
    {name: "default",  js: "default"},
    {name: "return",   js: "return"},
    {name: "break",    js: "break"},
    {name: "continue", js: "continue"},
  ];
}