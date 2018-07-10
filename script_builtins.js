"use strict";

function getBuiltIns() {
  let classes = [
    {name: "void", size: 0},
    {name: "Any", size: 0},
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
    {name: "System", size: 0},
    {name: "Math", size: 0},
    {name: "Canvas", size: 0},
    {name: "Iterable", size: 0},
  ].reverse();

  const classMap = new Map();
  for (let i = 0; i < classes.length; ++i) {
    classMap.set(classes[i].name, (-classes.length + i) & 0x7FF);
  }
  
  //static variables of classes only.  no instance variables
  let variables = [
    {name: "width",    type: classMap.get("Int32"),  scope: classMap.get("Canvas"), js: "canvas.width"},
    {name: "height",   type: classMap.get("Int32"),  scope: classMap.get("Canvas"), js: "canvas.height"},
    {name: "E",        type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.E"},
    {name: "PI",       type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.PI"},
    {name: "SQRT 2",   type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.SQRT2"},
    {name: "SQRT 1/2", type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.SQRT1_2"},
    {name: "LN 2",     type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.LN2"},
    {name: "LN 10",    type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.LN10"},
    {name: "LOG₂E",    type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.LOG2E"},
    {name: "LOG₁₀E",   type: classMap.get("Double"), scope: classMap.get("Math"), js: "Math.LOG10E"},
  ].reverse();
  
  function parseFunction(source, js) {
    if (!source.includes("->")) {
      source += "->void";
    }
    
    let tokens = source.match(/[\w\/]+/g);
    let newFunc = {};

    if (!source.includes(".")) {
      tokens.unshift(0);
      newFunc.scope = -1 & 0x7FF;
    } else {
      newFunc.scope = classMap.get(tokens[0]);
    }
    
    newFunc.name = tokens[1];
    newFunc.returnType = classMap.get(tokens[tokens.length - 1]);
    
    if (js)
      newFunc.js = js;
    
    newFunc.parameters = [];
    
    for (let i = 2; i < tokens.length - 1; i += 2) {
      newFunc.parameters.push({name: tokens[i], type: classMap.get(tokens[i + 1])});
    }
    
    return newFunc;
  }
  
  /* The .js property prepresents the equivalent javascript function to use when translating. */
  let functions = [
    // parseFunction("Int8.Int8(toConvert:Any) -> Int8", "Number"),
    // parseFunction("UInt8.UInt8(toConvert:Any) -> UInt8", "Number"),
    // parseFunction("Int16.Int16(toConvert:Any) -> Int16", "Number"),
    // parseFunction("UInt16.UInt16(toConvert:Any) -> UInt16", "Number"),
    // parseFunction("Int32.Int32(toConvert:Any) -> Int32", "Number"),
    // parseFunction("UInt32.UInt32(toConvert:Any) -> UInt32", "Number"),
    // parseFunction("Int64.Int64(toConvert:Any) -> Int64", "Number"),
    // parseFunction("UInt64.UInt64(toConvert:Any) -> UInt64", "Number"),
      
    parseFunction("Iterable.stride(start:Int32, end:Int32, by:Int32)->Iterable", "stride"),
    parseFunction("Canvas.drawText(x:Double, y:Double, size:Double, color:String, item:Any)", "drawText"),
    parseFunction("Canvas.drawCircle(x:Double, y:Double, r:Double, color:String)", "drawCircle"),
    parseFunction("Canvas.drawRect(x:Double, y:Double, w:Double, h:Double, color:String)", "drawRectangle"),
    parseFunction("Math.cos(angle:Double) -> Double", "Math.cos"),
    parseFunction("Math.sin(angle:Double) -> Double", "Math.sin"),
    parseFunction("Math.tan(angle:Double) -> Double", "Math.tan"),
    parseFunction("Math.acos(x/r:Double) -> Double", "Math.acos"),
    parseFunction("Math.asin(y/r:Double) -> Double", "Math.asin"),
    parseFunction("Math.atan(y/x:Double) -> Double", "Math.atan"),
    parseFunction("Math.atan2(y:Double, x:Double) -> Double", "Math.atan2"),
    parseFunction("Math.min(a:Double, b:Double) -> Double", "Math.min"),
    parseFunction("Math.max(a:Double, b:Double) -> Double", "Math.max"),
    parseFunction("Math.random() -> Double", "Math.random"),
    parseFunction("Math.abs(number:Double) -> Double", "Math.abs"),
    parseFunction("Math.sign(number:Double) -> Double", "Math.sign"),
    parseFunction("Math.sqrt(number:Double) -> Double", "Math.sqrt"),
    parseFunction("Math.power(base:Double, exponent:Double) -> Double", "Math.power"),
    parseFunction("Math.exp(exponent:Double) -> Double", "Math.exp"),
    parseFunction("Math.log(number:Double) -> Double", "Math.log"),
    parseFunction("Math.round(number:Double) -> Double", "Math.round"),
    parseFunction("Math.floor(number:Double) -> Double", "Math.floor"),
    parseFunction("Math.ceil(number:Double) -> Double", "Math.ceil"),
  ].reverse();
  
  
  
  const symbols = [
    "=", //asignment
    "+=", //asignment
    "-=", //asignment
    "*=", //asignment
    "/=", //asignment
    "%=", //asignment
    "^=", //asignment
    "&=", //asignment
    "|=", //asignment
    "==", //comparison
    "!=", //comparison
    "===", //comparison
    "!==", //comparison
    ">", //comparison
    ">=", //comparison
    "<", //comparison
    "<=", //comparison
    "+", //binary operator
    "-", //binary operator
    "*", //binary operator
    "/", //binary operator
    "%", //binary operator
    "^", //binary operator
    "&", //binary operator
    "|", //binary operator
    "&&", //binary operator
    "||", //binary operator
    "-", //unary operator
    "!", //unary operator
    "~", //unary operator
    "(",
    ")",
    "[",
    "]",
    ".",
    ",",
  ];
  
  
  
  const keywords = [
    {name: "func",     js: ""},
    {name: "let",      js: "const"},
    {name: "var",      js: "let"},
    {name: "if",       js: "if ("},
    {name: "for",      js: "for ("},
    {name: "in",       js: "of"},
    {name: "while",    js: "while ("},
    {name: "until",    js: "until ("},
    {name: "switch",   js: "switch ("},
    {name: "case",     js: "case"},
    {name: "default",  js: "default"},
    {name: "return",   js: "return"},
    {name: "break",    js: "break"},
    {name: "continue", js: "continue"},
    {name: "true",     js: "true"},
    {name: "false",    js: "false"}
  ]
  
  
  return {classes, variables, functions, symbols, keywords};
}