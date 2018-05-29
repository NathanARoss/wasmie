"use strict";

function getBuiltIns() {
  let CLASSES = [
    {name: "", size: 0},
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
    {name: "Function", size: 0},
  ];
  
  let CLASS_MAP = new Map();
  for (let i = 0; i < CLASSES.length; ++i) {
    CLASS_MAP.set(CLASSES[i].name, i);
  }
  
  
  //static variables of classes only.  no instance variables
  let VARIABLES = [
    {name: "width", type: CLASS_MAP.get("Int32"), scope: CLASS_MAP.get("Canvas"), js: "canvas.width"},
    {name: "height", type: CLASS_MAP.get("Int32"), scope: CLASS_MAP.get("Canvas"), js: "canvas.height"},
    {name: "E", type: CLASS_MAP.get("Double"), scope: CLASS_MAP.get("Math"), js: "Math.E"},
    {name: "PI", type: CLASS_MAP.get("Double"), scope: CLASS_MAP.get("Math"), js: "Math.PI"},
    {name: "SQRT(2)", type: CLASS_MAP.get("Double"), scope: CLASS_MAP.get("Math"), js: "Math.SQRT2"},
    {name: "SQRT(1/2)", type: CLASS_MAP.get("Double"), scope: CLASS_MAP.get("Math"), js: "Math.SQRT1_2"},
    {name: "LN(2)", type: CLASS_MAP.get("Double"), scope: CLASS_MAP.get("Math"), js: "Math.LN2"},
    {name: "LN(10)", type: CLASS_MAP.get("Double"), scope: CLASS_MAP.get("Math"), js: "Math.LN10"},
    {name: "LOG₂(E)", type: CLASS_MAP.get("Double"), scope: CLASS_MAP.get("Math"), js: "Math.LOG2E"},
    {name: "LOG₁₀(E)", type: CLASS_MAP.get("Double"), scope: CLASS_MAP.get("Math"), js: "Math.LOG10E"},
  ];
  
  
  function parseFunction(source, js) {
    if (!source.includes("->")) {
      source += "->global";
    }
    
    let tokens = source.match(/[\w]+/g);
    let newFunc = {};

    if (!source.includes(".")) {
      tokens.unshift(0);
      newFunc.scope = 0;
    } else {
      newFunc.scope = CLASS_MAP.get(tokens[0]);
    }
    
    newFunc.name = tokens[1];
    newFunc.returnType = CLASS_MAP.get(tokens[tokens.length - 1]);
    
    if (js)
      newFunc.js = js;
    
    newFunc.parameters = [];
    
    for (let i = 2; i < tokens.length - 1; i += 2) {
      newFunc.parameters.push({name: tokens[i], type: CLASS_MAP.get(tokens[i + 1])});
    }
    
    return newFunc;
  }
  
  /* The .js property prepresents the equivalent javascript function to use when translating. */
  let FUNCTIONS = [
    // parseFunction("Int8.Int8(toConvert:Any) -> Int8", "Number"),
    // parseFunction("UInt8.UInt8(toConvert:Any) -> UInt8", "Number"),
    // parseFunction("Int16.Int16(toConvert:Any) -> Int16", "Number"),
    // parseFunction("UInt16.UInt16(toConvert:Any) -> UInt16", "Number"),
    // parseFunction("Int32.Int32(toConvert:Any) -> Int32", "Number"),
    // parseFunction("UInt32.UInt32(toConvert:Any) -> UInt32", "Number"),
    // parseFunction("Int64.Int64(toConvert:Any) -> Int64", "Number"),
    // parseFunction("UInt64.UInt64(toConvert:Any) -> UInt64", "Number"),
      
    parseFunction("stride(start:Int32, end:Int32, by:Int32)", "stride"),
    parseFunction("Canvas.drawText(x:Double, y:Double, size:Double, item:Any)", "drawText"),
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
  ]
  
  let FUNCTION_MAP = new Map();
  for (let i = 0; i < FUNCTIONS.length; ++i) {
    let scope = CLASSES[FUNCTIONS[i].scope].name;
    let key = FUNCTIONS[i].name;
    if (scope)
      key = `${scope}.${key}`;
    
    FUNCTION_MAP.set(key, i);
  }
  
  
  
  
  const SYMBOLS = [
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
    "*", //binary operator
    "/", //binary operator
    "%", //binary operator
    "^", //binary operator
    "&", //binary operator
    "|", //binary operator
    "&&", //binary operator
    "||", //binary operator
    "-", //binary operator
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
  
  const SYMBOL_MAP = new Map();
  for (let i = 0; i < SYMBOLS.length; ++i) {
    SYMBOL_MAP.set(SYMBOLS[i], i);
  }
  
  
  
  const KEYWORDS = [
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
  
  const KEYWORD_MAP = new Map();
  for (let i = 0; i < KEYWORDS.length; ++i) {
    KEYWORD_MAP.set(KEYWORDS[i].name, i);
  }
  
  
  
  let sampleScript =
  `var minDim, radius, x, y, vX, vY
  
  
  func resize {
    minDim = Math.min( System.Screen.width, System.Screen.height ) / 3
    radius = minDim / 16
  }

  func tap tapX:Double tapY:Double id:Int32 {
    vX += Math.random() * 10 - 5
    vY += Math.random() * 10 - 20
  }

  func draw time:Double {
    vY += 1
    x += vX
    y += vY

    if x > System.Screen.width - radius {
      x = System.Screen.width - radius
      vX = -vX * 0.9
    }
    if x <  radius {
      x = radius
      vX = -vX * 0.9
    }

    if y > System.Screen.height - radius {
      y = System.Screen.height - radius
      vY = -vY * 0.9
      vX = Math.max(0, Math.abs(vX * 0.99) - 0.1) * Math.sign(vX)
    }
    if y <  radius {
      y = radius
      vY = -vY * 0.9
      vX = Math.max(0, Math.abs(vX * 0.99) - 0.1) * Math.sign(vX)
    }

    //Canvas.drawCircle(x, y, radius, "white")
    Canvas.drawRect(x - radius, y - radius, radius * 2, radius * 2, "yellow")
  }

  resize()

  x = System.Screen.width / 2
  y = System.Screen.height / 2
  vX = 0
  vY = 0
  
  System.Event.ondraw = draw
  System.Event.onresize = resize
  System.Event.ontouchstart = tap
  System.Event.onmousedown = tap`;



  let pong =
  `var paddleX:Double, paddleWidth:Double, paddleHeight:Double
  var ballX:Double, ballY:Double, vX:Double, vY:Double, ballSize:Double
  
  
  func resize {
    paddleWidth = System.Screen.width * 0.33
  }

  func touchMoved __x:Double __y:Double id:Int32 {
    let x = Math.max(paddleWidth / 2, Math.min( System.Screen.width - paddleWidth / 2, __x))
    paddleX = x - paddleWidth / 2
  }

  func cursorMoved _x:Double _y:Double prevX:Double prevY:Double {
    touchMoved(_x, _y, 0)
  }

  func draw time:Double {
    ballX += vX
    ballY += vY

    if ballX < 0 {
      ballX = -ballX
      vX = -vX
    }
    if ballX > System.Screen.width - ballSize {
      ballX = 2 * (System.Screen.width - ballSize) - ballX
      vX = -vX
    }

    if ballY < ballSize {
      ballY = 2 * ballSize - ballY
      vY = -vY
    }
    if ballY > System.Screen.height - 2 * ballSize {
      ballY = 2 * (System.Screen.height - 2 * ballSize) - ballY
      vY = -vY
    }

    Canvas.drawRect(ballX, ballY, ballSize, ballSize, "yellow")
    Canvas.drawRect(paddleX, 0, paddleWidth, ballSize, "white")
    Canvas.drawRect(paddleX, System.Screen.height - ballSize, paddleWidth, ballSize, "white")
  }

  resize()

  ballX = System.Screen.width / 2
  ballY = System.Screen.height / 2
  ballSize = 20
  vX = 10
  vY = 10
  
  System.Event.ondraw = draw
  System.Event.onresize = resize
  System.Event.onmousemove = cursorMoved
  System.Event.ontouchmove = touchMoved
  
  let cond = 1
  switch cond {
    case 1 {
      break
    }
    case 2 {
      break
    }
    default {
      break
    }
  }`;

  const counter =
`var a = 1 
var b = 1 
var text = "1\\n1\\n"

for i in stride(0, 50, 1) { 
 let temp = a + b 
 a = b 
 b = temp 
 
 text += temp + "\\n"
}

Canvas.drawText ( 0, 0, 20, "white", text ) `;
  
  return [CLASSES, CLASS_MAP, VARIABLES, FUNCTIONS, FUNCTION_MAP, SYMBOLS, SYMBOL_MAP, KEYWORDS, KEYWORD_MAP, counter];
}