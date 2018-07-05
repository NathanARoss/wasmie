Array.prototype.peek = function() {
  return this[this.length - 1];
}

class Script {
  constructor() {
    this.strings = [];
    this.lines = [];
    this.OPEN_PROJECT_KEY = "open-touchscript-project-id";
    this.projectID = Number(localStorage.getItem(this.OPEN_PROJECT_KEY));
    this.queuedDBwrites = {scope: new Set(), actions: []};

    const {classes, variables, functions, SYMBOLS, SYMBOL_MAP, KEYWORDS, KEYWORD_MAP} = getBuiltIns();
    this.classes = classes;
    this.variables = variables;
    this.functions = functions;
    this.symbols = SYMBOLS;
    this.keywords = KEYWORDS;

    this.variables.gaps = [];
    this.functions.gaps = [];
    this.classes.gaps = [];
    this.strings.gaps = [];
    
    this.variables.name = "variables";
    this.functions.name = "functions";
    this.classes.name = "classes";
    this.strings.name = "strings";
    this.lines.name = "lines";

    this.variables.mask = 0xFFFF;
    this.functions.mask = 0xFFFF;
    this.classes.mask = 0xFFF;
    this.strings.mask = 0x0FFFFFFF;

    const makeCommentItem = (text) => {
      this.strings.unshift(text);
      return Script.makeItem(Script.COMMENT, (-this.strings.length) & this.strings.mask);
    }

    this.HINTS = {};
    this.HINTS.ITEM = makeCommentItem("item");
    this.HINTS.COLLECTION = makeCommentItem("collection");
    this.HINTS.VALUE = makeCommentItem("value");
    this.HINTS.CONDITION = makeCommentItem("condition");
    this.HINTS.EXPRESSION = makeCommentItem("expression");
    this.HINTS.CONTROL_EXPRESSION = makeCommentItem("control expression");
    this.FUNCS = {stride: (-1) & this.functions.mask};

    this.variables.builtinCount = this.variables.length;
    this.functions.builtinCount = this.functions.length;
    this.classes.builtinCount = this.classes.length;
    this.strings.builtinCount = this.strings.length;

    performActionOnProjectListDatabase("readonly", (objStore, transaction) => {
      objStore.get(this.projectID).onsuccess = (event) => {
        if (!event.target.result) {
          console.log("The previously opened project no longer exists.  Resetting");
          this.projectID = 0;
          localStorage.removeItem(this.OPEN_PROJECT_KEY);
        } else {
          let remainingStores = {count: 5};

          let actions = [];
          for (const arr of [this.variables, this.functions, this.classes, this.strings]) {
            actions.push({storeName: arr.name, function: Script.readEntries, arguments: [arr, remainingStores]});
          }
          actions.push({storeName: this.lines.name, arguments: [this.lines, remainingStores], function: function(lines, remainingStores) {
            this.openCursor().onsuccess = function(event) {
              let cursor = event.target.result;
              if (cursor) {
                lines.push({key: new Uint8Array(cursor.key), items: cursor.value});
                cursor.continue();
              } else {
                if (--remainingStores.count === 0) {
                  reloadAllRowsInPlace();
                }
              }
            };
          }});

          this.performTransaction(new Set(["variables", "functions", "classes", "strings", "lines"]), "readonly", actions);
        }
      }
    });

    this.ITEMS = {};
    this.ITEMS.FUNC     = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("func"));
    this.ITEMS.LET      = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("let"));
    this.ITEMS.VAR      = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("var"));
    this.ITEMS.SWITCH   = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("switch"));
    this.ITEMS.CASE     = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("case"));
    this.ITEMS.DEFAULT  = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("default"));
    this.ITEMS.BREAK    = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("break"));
    this.ITEMS.CONTINUE = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("continue"));
    this.ITEMS.IF       = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("if"));
    this.ITEMS.FOR      = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("for"));
    this.ITEMS.IN       = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("in"));
    this.ITEMS.WHILE    = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("while"));
    this.ITEMS.UNTIL    = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("until"));
    this.ITEMS.RETURN   = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("return"));
    this.ITEMS.TRUE     = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("true"));
    this.ITEMS.FALSE    = Script.makeItem(Script.KEYWORD, KEYWORD_MAP.get("false"));
    this.toggles = [this.ITEMS.VAR, this.ITEMS.LET, this.ITEMS.WHILE, this.ITEMS.UNTIL, this.ITEMS.CONTINUE, this.ITEMS.BREAK];

    this.ITEMS.EQUALS            = Script.makeItem(Script.SYMBOL, SYMBOL_MAP.get("="));
    this.ITEMS.START_PARENTHESIS = Script.makeItem(Script.SYMBOL, SYMBOL_MAP.get("("));
    this.ITEMS.END_PARENTHESIS   = Script.makeItem(Script.SYMBOL, SYMBOL_MAP.get(")"));
    this.ITEMS.START_BRACKET     = Script.makeItem(Script.SYMBOL, SYMBOL_MAP.get("["));
    this.ITEMS.END_BRACKET       = Script.makeItem(Script.SYMBOL, SYMBOL_MAP.get("]"));
    this.ITEMS.DOT               = Script.makeItem(Script.SYMBOL, SYMBOL_MAP.get("."));
    this.ITEMS.COMMA             = Script.makeItem(Script.SYMBOL, SYMBOL_MAP.get(","));

    let payloads = Script.makeItem(Script.KEYWORD, 0x0FFFFFFF);
    this.PAYLOADS = {};
    this.PAYLOADS.VAR_OPTIONS = payloads--;
    this.PAYLOADS.FUNCTION_REFERENCE = payloads--;
    this.PAYLOADS.FUNCTION_REFERENCE_WITH_RETURN = payloads--;
    this.PAYLOADS.LITERAL_INPUT = payloads--;
    this.PAYLOADS.PARENTHESIS_PAIR = payloads--;
    this.PAYLOADS.RENAME = payloads--;
    this.PAYLOADS.DELETE_ITEM = payloads--;
    this.PAYLOADS.DELETE_SUBEXPRESSION = payloads--;
    this.PAYLOADS.REMOVE_PARENTHESIS_PAIR = payloads--;

    class Operator {
      constructor(start, end) {
        this.start = Script.makeItem(Script.SYMBOL, start);
        this.end = Script.makeItem(Script.SYMBOL, end);
      }

      includes(item) {
        return item >= this.start && item < this.end;
      }

      * getMenuItems() {
        for (let payload = this.start; payload < this.end; ++payload) {
          yield {text: SYMBOLS[payload & 0xFFFFFF], style: "", payload};
        }
      }
    }

    this.ASSIGNMENT_OPERATORS = new Operator(0, 9);
    this.BINARY_OPERATORS = new Operator(9, 27);
    this.UNARY_OPERATORS = new Operator(27, 30);
  }

  static readEntries(arr, remainingStores) {
    const offset = arr.builtinCount;

    let request = this.openCursor();
    request.onsuccess = function(event) {
      let cursor = event.target.result;
      if (cursor) {
        while (arr.length - offset < cursor.key) {
          arr.gaps.push(arr.length - offset);
          arr.push(undefined);
        }
        arr.push(cursor.value);
        cursor.continue();
      } else {
        remainingStores.count--;
        if (arr.gaps.length)
          console.log(arr.name, "has gaps ", arr.gaps);
        if (remainingStores.count === 0) {
          reloadAllRowsInPlace();
        }
      }
    };
  }

  static makeItemWithMeta(format, meta, value) {
    format &= 0xF;
    meta &= 0xFFF;
    value &= 0xFFFF;
    return format << 28 | meta << 16 | value;
  }

  static makeItem(format, value) {
    format &= 0xF;
    value &= 0x0FFFFFFF;
    return format << 28 | value;
  }

  itemClicked(row, col) {
    if (col === -1) {
      let options = this.appendClicked(row);
      if (options)
        return options;
      
      col = this.getItemCount(row);
    }

    let options = [];
    const item = this.getItem(row, col) || 0xFFFFFFFF;
    const format = item >>> 28;
    const data = item & 0xFFFFFFF;
    const meta = data >>> 16;
    const value = item & 0xFFFF;
    

    if (format === Script.KEYWORD) {
      if (item !== this.ITEMS.VAR || this.getItem(row, 3) === this.ITEMS.EQUALS) {
        const i = this.toggles.indexOf(item);
        if (i !== -1) {
          this.setItem(row, col, this.toggles[i ^ 1]);
          let newKeyword = this.keywords[this.getItem(row, col) & 0xFFFFFF].name;
          return {text: newKeyword, style: "keyword"};
        }
      }
    }

    if (this.ASSIGNMENT_OPERATORS.includes(item)) {
      return this.ASSIGNMENT_OPERATORS.getMenuItems();
    }

    let beginParenthesis = col;
    let depth = 0;
    if (item === this.ITEMS.END_PARENTHESIS) {
      while (beginParenthesis > 1) {
        if (this.getItem(row, beginParenthesis) === this.ITEMS.END_PARENTHESIS) {
          --depth;
        }

        if (this.getItem(row, beginParenthesis) === this.ITEMS.START_PARENTHESIS) {
          ++depth;
          if (depth === 0)
            break;
        }

        --beginParenthesis;
      }
    }

    if (item === this.ITEMS.START_PARENTHESIS || item === this.ITEMS.END_PARENTHESIS) {
      let options;
      if (this.getItem(row, beginParenthesis - 1) >>> 28 === Script.FUNCTION_REFERENCE) {
        //don't allow removal operations if the parenthesis belongs to a function call that sits alone in a line
        if (beginParenthesis === 2 && this.getItem(row, 1) >>> 28 === Script.FUNCTION_REFERENCE)
          return [];
        
        options = [{text: "", style: "delete", payload: this.PAYLOADS.DELETE_SUBEXPRESSION}];
      } else {
        options = [
          {text: "", style: "delete", payload: this.PAYLOADS.DELETE_SUBEXPRESSION},
          {text: "", style: "delete-outline", payload: this.PAYLOADS.REMOVE_PARENTHESIS_PAIR}
        ];
      }

      if (item === this.ITEMS.END_PARENTHESIS)
        options.push(...this.BINARY_OPERATORS.getMenuItems());
      return options;
    }

    if (((format === Script.VARIABLE_REFERENCE || format === Script.VARIABLE_DEFINITION) && value < this.variables.mask - this.variables.builtinCount)
    || ((format === Script.FUNCTION_REFERENCE || format === Script.FUNCTION_DEFINITION) && value < this.functions.mask - this.functions.builtinCount)) {
      options.push({text: "", style: "rename", payload: this.PAYLOADS.RENAME});
    }

    if (col === 1) {
      if (format === Script.VARIABLE_REFERENCE)
        options.push(...this.getVisibleVariables(row, true));
      else if (format === Script.FUNCTION_REFERENCE)
        options.push(...this.getFunctionList(false));
    } else {
      //don't allow the user to delete the item if it is a binary operator followed by anything meaningful
      if (format !== Script.VARIABLE_DEFINITION && format !== Script.FUNCTION_DEFINITION) {
        if (!this.BINARY_OPERATORS.includes(item)
        || (this.getItem(row, col + 1) === undefined || this.getItem(row, col + 1) === this.HINTS.EXPRESSION))
          options.push( {text: "", style: "delete", payload: this.PAYLOADS.DELETE_ITEM} );
      }

      if (format === Script.VARIABLE_REFERENCE
      || format === Script.FUNCTION_REFERENCE
      || format === Script.NUMERIC_LITERAL
      || format === Script.STRING_LITERAL
      || item === this.ITEMS.TRUE
      || item === this.ITEMS.FALSE) {
        options.push( {text: "( )", style: "", payload: this.PAYLOADS.PARENTHESIS_PAIR} );
        options.push(...this.BINARY_OPERATORS.getMenuItems());
      }

      if (format === Script.VARIABLE_DEFINITION || format === Script.FUNCTION_DEFINITION) {
        //list types for a variable to be or for a function to return
        let option = {text: "", style: "comment", payload: Script.makeItemWithMeta(Script.COMMENT, 0, 0)};
        option.text = (format === Script.FUNCTION_DEFINITION) ? "none" : "auto";
        options.push(option);
            
        for (const id of Script.getMetadataIDs(this.classes)) {
          const c = this.getMetadata(this.classes, id);
          if (c.size > 0)
            options.push({text: c.name, style: "keyword", payload: Script.makeItemWithMeta(Script.COMMENT, id, 0)});
        }
      }
      
      const prevItem = this.getItem(row, col - 1);
      const prevFormat = prevItem >>> 28;
      const prevData = prevItem & 0xFFFFFFF;
      const prevMeta = prevData >>> 16;
      const prevValue = prevItem & 0xFFFF;

      if (prevFormat === Script.VARIABLE_REFERENCE
      || prevFormat === Script.NUMERIC_LITERAL
      || prevFormat === Script.STRING_LITERAL
      || prevItem === this.ITEMS.TRUE || prevItem === this.ITEMS.FALSE
      || prevItem === this.ITEMS.END_PARENTHESIS
      || prevItem === this.ITEMS.TRUE || prevItem === this.ITEMS.FALSE) {
        options.push(...this.BINARY_OPERATORS.getMenuItems());
      }

      if (this.BINARY_OPERATORS.includes(prevItem) || this.UNARY_OPERATORS.includes(prevItem) || this.ASSIGNMENT_OPERATORS.includes(prevItem)
      || prevItem === this.ITEMS.WHILE || prevItem === this.ITEMS.IF || prevItem === this.ITEMS.START_PARENTHESIS || prevItem === this.ITEMS.COMMA || prevItem === this.ITEMS.IN || prevItem === this.ITEMS.RETURN) {
        if (!this.UNARY_OPERATORS.includes(prevItem)) {
          options.push(...this.UNARY_OPERATORS.getMenuItems());
        }

        options.push( {text: "f(x)", style: "function-call", payload: this.PAYLOADS.FUNCTION_REFERENCE_WITH_RETURN} );
        options.push( {text: "", style: "text-input", payload: this.PAYLOADS.LITERAL_INPUT} );
        options.push(...this.getVisibleVariables(row, false));
      }
    }

    return options;
  }

  appendClicked(row) {
    const rowCount = this.getRowCount();
    const itemCount = (row < rowCount) ? this.getItemCount(row) : 1;

    if (itemCount === 1) {
      const indentation = (row < rowCount) ? this.getIndentation(row) : 0;
      let options = [];

      let enclosingScopeType = 0;
      for (let r = Math.min(rowCount, row) - 1; r >= 0; --r) {
        if (this.getIndentation(r) === indentation - 1) {
          enclosingScopeType = this.getItem(r, 1);
          break;
        }
      }

      if (enclosingScopeType === this.ITEMS.SWITCH) {
        options = [
          {text: "case", style: "keyword", payload: this.ITEMS.CASE},
          {text: "default", style: "keyword", payload: this.ITEMS.DEFAULT}
        ];
      } else {
        options = [
          {text: "f(x)", style: "function-call", payload: this.PAYLOADS.FUNCTION_REFERENCE},
          {text: "func", style: "keyword", payload: this.ITEMS.FUNC},
          {text: "let", style: "keyword", payload: this.ITEMS.LET},
          {text: "var", style: "keyword", payload: this.PAYLOADS.VAR_OPTIONS},
          {text: "if", style: "keyword", payload: this.ITEMS.IF},
          {text: "for", style: "keyword", payload: this.ITEMS.FOR},
          {text: "while", style: "keyword", payload: this.ITEMS.WHILE},
          {text: "switch", style: "keyword", payload: this.ITEMS.SWITCH},
          {text: "return", style: "keyword", payload: this.ITEMS.RETURN}
        ];

        options.push(...this.getVisibleVariables(Math.min(this.getRowCount(), row), true));
      }

      return options;
    }

    if (this.getItem(row, 1) === this.ITEMS.VAR) {
      if (itemCount === 3) {
        return [
          {text: "=", style: "", payload: this.ITEMS.EQUALS},
          {text: ",", style: "", payload: this.ITEMS.COMMA}
        ];
      }

      if (this.getItem(row, 3) === this.ITEMS.COMMA) {
        return [
          {text: ",", style: "", payload: this.ITEMS.COMMA}
        ];
      }
    }

    if (this.getItem(row, 1) >>> 28 === Script.FUNCTION_REFERENCE) {
      return [];
    }

    const index = this.findItem(row, this.ITEMS.FUNC);
    if (index > 0) {
      let options = [];

      for (const id of Script.getMetadataIDs(this.classes)) {
        const c = this.getMetadata(this.classes, id);
        if (c.size > 0)
          options.push({text: c.name, style: "keyword", payload: Script.makeItemWithMeta(Script.ARGUMENT_HINT, id, 0)});
      }

      return options;
    }

    return null;
  }

  //0 -> no change, 1 -> click item changed, 2-> row changed, 3 -> row(s) inserted
  menuItemClicked(row, col, payload) {
    let isValue = false;
    if (col === -1)
      col = row < this.getRowCount() ? this.getItemCount(row) : 0;
    else {
      const item = this.getItem(row, col);
      const format = item >>> 28;
      if (format === Script.VARIABLE_REFERENCE
      || format === Script.NUMERIC_LITERAL
      || format === Script.STRING_LITERAL
      || item === this.ITEMS.TRUE || item === this.ITEMS.FALSE
      || item === this.ITEMS.END_PARENTHESIS) {
        isValue = true;
      }
    }

    switch (payload) {
      case this.ITEMS.CASE:
      this.appendRowsUpTo(row);
        this.setItem(row, 0, this.getItem(row, 0) | 1 << 31);
        this.pushItems(row, payload, this.HINTS.VALUE);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;

      case this.ITEMS.DEFAULT:
        this.appendRowsUpTo(row);
        this.setItem(row, 0, this.getItem(row, 0) | 1 << 31);
        this.pushItems(row, payload);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;
      
      case this.ITEMS.LET:
      case this.ITEMS.VAR: {
        const varId = this.getNextMetadataID(this.variables);
        const name = prompt("Enter variable name:", `var${varId}`);
        if (name) {
          this.appendRowsUpTo(row);
          this.saveMetadata(this.variables, varId, {name, type: 0, scope: 0});
          this.pushItems(row, payload, Script.makeItem(Script.VARIABLE_DEFINITION, varId), this.ITEMS.EQUALS, this.HINTS.EXPRESSION);
          return Script.RESPONSE.ROW_UPDATED;
        } else {
          return Script.RESPONSE.NO_CHANGE;
        }
      }

      case this.PAYLOADS.VAR_OPTIONS: {
        let options = [{text: "= expression", style: "comment", payload: this.ITEMS.VAR}];

        for (const id of Script.getMetadataIDs(this.classes)) {
          const c = this.getMetadata(this.classes, id);
          if (c.size > 0)
            options.push({text: c.name, style: "keyword", payload: Script.makeItemWithMeta(Script.VARIABLE_DEFINITION, id, 0)});
        }

        return options;
      }
      
      case this.ITEMS.IF:
      case this.ITEMS.WHILE:
        this.appendRowsUpTo(row);
        this.setItem(row, 0, this.getItem(row, 0) | 1 << 31);
        this.pushItems(row, payload, this.HINTS.CONDITION);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;

      case this.ITEMS.FOR:
        this.appendRowsUpTo(row);
        this.setItem(row, 0, this.getItem(row, 0) | 1 << 31);

        let varId = this.getNextMetadataID(this.variables);
        this.saveMetadata(this.variables, varId, {name: "i", type: 0, scope: 0});

        this.pushItems(row, payload, Script.makeItemWithMeta(Script.VARIABLE_DEFINITION, 0, varId), this.ITEMS.IN,
          Script.makeItem(Script.FUNCTION_REFERENCE, this.FUNCS.stride),
          this.ITEMS.START_PARENTHESIS,
          Script.makeItemWithMeta(Script.ARGUMENT_HINT, 0, this.FUNCS.stride),
          this.ITEMS.COMMA,
          Script.makeItemWithMeta(Script.ARGUMENT_HINT, 1, this.FUNCS.stride),
          this.ITEMS.COMMA,
          Script.makeItemWithMeta(Script.ARGUMENT_HINT, 2, this.FUNCS.stride),
          this.ITEMS.END_PARENTHESIS);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;

      case this.ITEMS.SWITCH:
        this.appendRowsUpTo(row);
        this.setItem(row, 0, this.getItem(row, 0) | 1 << 31);
        this.pushItems(row, payload, this.HINTS.CONTROL_EXPRESSION);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;
      
      case this.ITEMS.RETURN: {
        this.appendRowsUpTo(row);
        let returnType = 0;
        for (let r = row - 1; r >= 0; --r) {
          if (this.getItem(r, 1) === this.ITEMS.FUNC) {
            returnType = (this.getItem(r, 2) >>> 16) & 0x0FFF;
            break;
          }
        }

        this.pushItems(row, payload);
        if (returnType > 0)
          this.pushItems(row, this.HINTS.EXPRESSION);
        
        return Script.RESPONSE.ROW_UPDATED;
      }

      case this.ITEMS.FUNC: {
        let options = [{text: "none", style: "comment", payload: Script.makeItemWithMeta(Script.NUMERIC_LITERAL, 0, 0)}];

        for (const id of Script.getMetadataIDs(this.classes)) {
          const c = this.getMetadata(this.classes, id);
          if (c.size > 0)
            options.push({text: c.name, style: "keyword", payload: Script.makeItemWithMeta(Script.NUMERIC_LITERAL, id, 0)});
        }

        return options;
      }

      case this.ITEMS.EQUALS:
        this.pushItems(row, this.ITEMS.EQUALS, this.HINTS.EXPRESSION);
        return Script.RESPONSE.ROW_UPDATED;

      case this.ITEMS.COMMA: {
        let varId = this.getNextMetadataID(this.variables);
        const name = prompt("Enter variable name:", `var${varId}`);
        if (name) {
          let type = (this.getItem(row, this.getItemCount(row) - 1) >>> 16) & 0x0FFF;
          this.saveMetadata(this.variables, varId, {name, type, scope: 0});
          this.pushItems(row, this.ITEMS.COMMA, Script.makeItemWithMeta(Script.VARIABLE_DEFINITION, type, varId));
          return Script.RESPONSE.ROW_UPDATED;
        } else {
          return Script.RESPONSE.NO_CHANGE;
        }
      }

      case this.PAYLOADS.LITERAL_INPUT: {
        let hint = "";

        const item = this.getItem(row, col);
        const format = item >>> 28;
        if (format === Script.NUMERIC_LITERAL) {
          hint = this.getMetadata(this.strings, item & 0x00FFFFFF);
        } else if (format === Script.STRING_LITERAL) {
          hint = '"' + this.getMetadata(this.strings, item & 0x00FFFFFF) + '"';
        } else if (format === Script.KEYWORD) {
          hint = this.keywords[item & 0x00FFFFFF].name;
        }

        let input = prompt("Enter a string or a number:", hint);
        if (input === null)
          return Script.RESPONSE.NO_CHANGE;
        
        if (input === "true" || input === "false") {
          if (input === "true") {
            this.setItem(row, col, this.ITEMS.TRUE);
          } else {
            this.setItem(row, col, this.ITEMS.FALSE);
          }
        }
        else {
          const id = this.getNextMetadataID(this.strings);

          if (input.trim().length !== 0 && !isNaN(input)) {
            this.setItem(row, col, Script.makeItem(Script.NUMERIC_LITERAL, id));
          } else {
            if (input.startsWith('"')) {
              if (input.endsWith('"')) {
                input = input.substring(1, input.length - 1);
              } else {
                input = input.substring(1);
              }
            }

            this.setItem(row, col, Script.makeItem(Script.STRING_LITERAL, id));
          }
          
          this.saveMetadata(this.strings, id, input);
        }

        return Script.RESPONSE.ROW_UPDATED;
      }

      case this.PAYLOADS.RENAME: {
        const data = this.getItem(row, col);
        const id = data & 0xFFFF;
        let format = data >>> 28;

        let metadataContainer;

        switch (format) {
          case Script.VARIABLE_DEFINITION:
          case Script.VARIABLE_REFERENCE:
            metadataContainer = this.variables;
            break;

          case Script.FUNCTION_DEFINITION:
          case Script.FUNCTION_REFERENCE:
            metadataContainer = this.functions;
            break;
        }

        let metadata = this.getMetadata(metadataContainer, id);
        let input = prompt("Enter new name:", metadata.name);

        if (input === null)
          return Script.RESPONSE.NO_CHANGE;
        else {
          metadata.name = input;
          this.saveMetadata(metadataContainer, id, metadata);
          return Script.RESPONSE.SCRIPT_CHANGED;
        }
      }

      case this.PAYLOADS.DELETE_ITEM: {
        const item = this.getItem(row, col);
        const format = item >>> 28;
        const data = item & 0xFFFFFF;

        if (this.UNARY_OPERATORS.includes(item)) {
          this.spliceRow(row, col, 1);
        }
        if (this.BINARY_OPERATORS.includes(item)) {
          this.spliceRow(row, col, 2);
        }
        if (item === this.HINTS.EXPRESSION && this.BINARY_OPERATORS.includes(this.getItem(row, col - 1))) {
          this.spliceRow(row, col - 1, 2);
        }

        if (format === Script.VARIABLE_REFERENCE
        || format === Script.NUMERIC_LITERAL
        || format === Script.STRING_LITERAL
        || item === this.ITEMS.TRUE || item === this.ITEMS.FALSE) {
          this.spliceRow(row, col, 1, this.HINTS.EXPRESSION);
        }

        if (format === Script.FUNCTION_REFERENCE) {
          let end = col + 2;
          while (end < this.getItemCount(row)) {
            if (this.getItem(row, end) === this.ITEMS.END_PARENTHESIS)
              break;
            
            ++end;
          }

          this.spliceRow(row, col, end - col + 1, this.HINTS.EXPRESSION);
        }

        return Script.RESPONSE.ROW_UPDATED;
      }

      case this.PAYLOADS.DELETE_SUBEXPRESSION:
      case this.PAYLOADS.REMOVE_PARENTHESIS_PAIR: {
        const item = this.getItem(row, col);
        let matchingParenthesis = col;
        let depth = 0;

        if (item === this.ITEMS.END_PARENTHESIS) {
          while (matchingParenthesis > 1) {
            if (this.getItem(row, matchingParenthesis) === this.ITEMS.END_PARENTHESIS) {
              --depth;
            }

            if (this.getItem(row, matchingParenthesis) === this.ITEMS.START_PARENTHESIS) {
              ++depth;
              if (depth === 0)
                break;
            }

            --matchingParenthesis;
          }
        }

        if (item === this.ITEMS.START_PARENTHESIS) {
          while (matchingParenthesis < this.getItemCount(row)) {
            if (this.getItem(row, matchingParenthesis) === this.ITEMS.START_PARENTHESIS) {
              --depth;
            }

            if (this.getItem(row, matchingParenthesis) === this.ITEMS.END_PARENTHESIS) {
              ++depth;
              if (depth === 0)
                break;
            }

            ++matchingParenthesis;
          }
        }

        let start = Math.min(col, matchingParenthesis);
        const end = Math.max(col, matchingParenthesis);
        
        if (payload === this.PAYLOADS.DELETE_SUBEXPRESSION) {
          if (this.getItem(row, start - 1) >>> 28 === Script.FUNCTION_REFERENCE)
            --start;

          this.spliceRow(row, start, end - start + 1, this.HINTS.EXPRESSION);
        } else {
          this.spliceRow(row, end, 1);
          this.spliceRow(row, start, 1);
        }

        return Script.RESPONSE.ROW_UPDATED;
      }

      case this.PAYLOADS.FUNCTION_REFERENCE:
      case this.PAYLOADS.FUNCTION_REFERENCE_WITH_RETURN: {
        const requireReturn = payload === this.PAYLOADS.FUNCTION_REFERENCE_WITH_RETURN;
        return this.getFunctionList(requireReturn);
      }

      case this.PAYLOADS.PARENTHESIS_PAIR: {
        const [start, end] = this.getExpressionBounds(row, col);

        this.spliceRow(row, end + 1, 0, this.ITEMS.END_PARENTHESIS);
        this.spliceRow(row, start, 0, this.ITEMS.START_PARENTHESIS);

        return Script.RESPONSE.ROW_UPDATED;
      }
    }

    let format = payload >>> 28;
    let meta = (payload >>> 16) & 0x0FFF;
    let value = payload & 0xFFFF;

    //if a specific variable reference is provided
    if (format === Script.VARIABLE_REFERENCE) {
      let varId = payload & 0xFFFF;
      const variable = this.getMetadata(this.variables, varId);
      
      this.appendRowsUpTo(row);
      if (this.getItemCount(row) === 1) {
        this.pushItems(row,
          Script.makeItemWithMeta(Script.VARIABLE_REFERENCE, variable.type, varId),
          this.ITEMS.EQUALS,
          this.HINTS.EXPRESSION
        );
        return Script.RESPONSE.ROW_UPDATED;
      }

      const [start, end] = this.getExpressionBounds(row, col);
      this.spliceRow(row, start, end - start + 1, payload);

      return Script.RESPONSE.ROW_UPDATED;
    }

    //user chose a type for a variable declaration
    if (format === Script.VARIABLE_DEFINITION) {
      const varId = this.getNextMetadataID(this.variables);
      const name = prompt("Enter variable name:", `var${varId}`);
      if (name) {
        const type = meta;
        this.appendRowsUpTo(row);
        this.saveMetadata(this.variables, varId, {name, type, scope: 0});
        this.pushItems(row, this.ITEMS.VAR, Script.makeItemWithMeta(Script.VARIABLE_DEFINITION, type, varId));
        return Script.RESPONSE.ROW_UPDATED;
      } else {
        return Script.RESPONSE.NO_CHANGE;
      }
    }

    //user chose a type for a function declaration
    if (format === Script.NUMERIC_LITERAL) {
      let funcId = this.getNextMetadataID(this.functions);
      const returnType = meta;
      const name = prompt(`Enter function name`, `f${funcId}`);
      if (name) {
        let newFunc = {name, returnType, scope: 0, parameters: []};
        this.appendRowsUpTo(row);
        this.saveMetadata(this.functions, funcId, newFunc);
        this.setItem(row, 0, this.getItem(row, 0) | 1 << 31);
        this.pushItems(row, this.ITEMS.FUNC, Script.makeItemWithMeta(Script.FUNCTION_DEFINITION, returnType, funcId));
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;
      } else {
        return Script.RESPONSE.NO_CHANGE;
      }
    }

    //user chose a specific function call
    if (format === Script.FUNCTION_REFERENCE) {
      const func = this.getMetadata(this.functions, value);
      let replacementItems = [payload];

      for (let i = 0; i < func.parameters.length; ++i) {
        replacementItems.push(this.ITEMS.COMMA);
        replacementItems.push(Script.makeItemWithMeta(Script.ARGUMENT_HINT, i, value));
      }

      replacementItems[1] = this.ITEMS.START_PARENTHESIS;
      replacementItems.push(this.ITEMS.END_PARENTHESIS);

      this.appendRowsUpTo(row);
      const [start, end] = col === 0 ? [1,1] : this.getExpressionBounds(row, col);
      this.spliceRow(row, start, end - start + 1, ...replacementItems);
      
      return Script.RESPONSE.ROW_UPDATED;
    }

    //appending additional parameters
    if (format === Script.ARGUMENT_HINT) {
      let varId = this.getNextMetadataID(this.variables);
      let type = meta;
      const name = prompt(`Enter name for ${this.getMetadata(this.classes, type).name} parameter:`, `var${varId}`);

      if (name) {
        this.saveMetadata(this.variables, varId, {name, type, scope: 0});
        this.pushItems(row, Script.makeItemWithMeta(Script.VARIABLE_DEFINITION, type, varId));

        const index = this.findItem(row, this.ITEMS.FUNC);
        const funcId = this.getItem(row, index + 1) & 0xFFFF;
        const func = this.getMetadata(this.functions, funcId);
        func.parameters.push({name, type})
        this.saveMetadata(this.functions, funcId, func);

        return Script.RESPONSE.ROW_UPDATED;
      } else {
        return Script.RESPONSE.NO_CHANGE;
      }
    }

    //user chose a symbol to insert into the script
    if (format === Script.SYMBOL) {
      if (isValue || this.getItem(row, col) >>> 28 === Script.FUNCTION_REFERENCE) {
        if (this.UNARY_OPERATORS.includes(payload))
          this.spliceRow(row, col, 0, payload);
        else
          this.spliceRow(row, col + 1, 0, payload, this.HINTS.EXPRESSION);
      } else {
        this.setItem(row, col, payload);
      }
      return Script.RESPONSE.ROW_UPDATED;
    }

    //user updated the type annotation of a variable or function
    if (format === Script.COMMENT) {
      this.setItem(row, col, this.getItem(row, col) & 0xF000FFFF | meta << 16);

      if (this.getItem(row, col) >>> 28 === Script.FUNCTION_DEFINITION) {
        const hasReturn = meta !== 0;

        let indentation = this.getIndentation(row);
        for (let r = row + 1; r < this.getRowCount(); ++r) {
          if (this.getIndentation(r) === indentation)
            break;
          
          if (this.getItem(r, 1) === this.ITEMS.RETURN) {
            if (hasReturn) {
              this.setItem(r, 2, this.HINTS.EXPRESSION);
              this.setItemCount(r, 3);
            } else {
              this.setItemCount(r, 2);
            }
          }
        }

        const funcId = this.getItem(row, col) & 0xFFFF;
        const func = this.getMetadata(this.functions, funcId);
        func.returnType = meta;
        this.saveMetadata(this.functions, funcId, func);

        return Script.RESPONSE.SCRIPT_CHANGED;
      } else {
        const varId = this.getItem(row, col) & 0xFFFF;
        const v = this.getMetadata(this.variables, varId);
        v.type = meta;
        this.saveMetadata(this.variables, varId, v);
      }
      
      return Script.RESPONSE.ROW_UPDATED;
    }

    return Script.RESPONSE.NO_CHANGE;
  }

  getVisibleVariables(row, requiresMutable) {
    let options = [];

    let indentation = (row < this.getRowCount()) ? this.getIndentation(row) : 0;

    for (let r = row - 1; r >= 0; --r) {
      let lineIndentation = this.getIndentation(r);
      if (lineIndentation + this.isStartingScope(r) <= indentation && this.getItemCount(r) > 1) {
        indentation = Math.min(indentation, lineIndentation);
        if (!requiresMutable || this.getItem(r, 1) === this.ITEMS.VAR) {
          let itemCount = this.getItemCount(r);
          for (let col = 1; col < itemCount; ++col) {
            if (this.getItem(r, col) >>> 28 === Script.VARIABLE_DEFINITION) {
              let varId = this.getItem(r, col) & 0xFFFF;
              const v = this.getMetadata(this.variables, varId);
              const type = this.getMetadata(this.classes, v.type);
              const scope = this.getMetadata(this.classes, v.scope);
              if (type || scope) {
                const text = (type && type.name || "") + " " + (scope && scope.name || "") + "\n" + v.name;
                options.push({text, style: "keyword-declaration", payload: (Script.VARIABLE_REFERENCE << 28) | varId});
              } else {
                options.push({text: v.name, style: "declaration", payload: (Script.VARIABLE_REFERENCE << 28) | varId});
              }
            }
          }
        }
      }
    }

    if (!requiresMutable) {
      for (let i = -this.variables.builtinCount; i <= -1; ++i) {
        const v = this.getMetadata(this.variables, i);
        const text = this.getMetadata(this.classes, v.type).name + " " + this.getMetadata(this.classes, v.scope).name + "\n" + v.name;
        options.push({text, style: "keyword-declaration", payload: Script.makeItemWithMeta(Script.VARIABLE_REFERENCE, v.scope, i & 0xFFFF)});
      }
    }

    return options;
  }

  getFunctionList(requireReturn) {
    let options = [];

    for (const id of Script.getMetadataIDs(this.functions)) {
      let func = this.getMetadata(this.functions, id);
      if (!requireReturn || func.returnType !== 0) {
        const scope = this.getMetadata(this.classes, func.scope);
        if (scope) {
          options.push({text: scope.name + "\n" + func.name, style: "keyword-call", payload: Script.makeItemWithMeta(Script.FUNCTION_REFERENCE, func.scope, id)});
        } else {
          options.push({text: func.name, style: "function-call", payload: Script.makeItemWithMeta(Script.FUNCTION_REFERENCE, 0, id)});
        }
      }
    }

    return options;
  }

  //return an array marking the first and last item that belongs to the selected expression
  getExpressionBounds(row, col) {
    let start = col;
    let end = col;

    if (this.UNARY_OPERATORS.includes(this.getItem(row, col - 1))) {
      --start;
    }

    if (this.getItem(row, col) >>> 28 === Script.FUNCTION_REFERENCE) {
      let depth = 0;
      while (end < this.getItemCount(row)) {
        if (this.getItem(row, end) === this.ITEMS.START_PARENTHESIS) {
          ++depth;
        }

        if (this.getItem(row, end) === this.ITEMS.END_PARENTHESIS) {
          --depth;
          if (depth === 0)
            break;
        }

        ++end;
      }
    }

    return [start, end];
  }

  appendRowsUpTo(row) {
    let oldLength = this.getRowCount();
    let inserted = 0;

    let key = this.lines.length === 0 ? new Uint8Array(1) : this.lines.peek().key;
    while (row >= this.getRowCount()) {
      key = Script.incrementKey(key);
      this.lines.push({key, items: [0]});
      ++inserted;
    }
    this.saveRow(oldLength, inserted);
  }

  insertRow(row) {
    let indentation = row === 0 ? 0 : this.getIndentation(row - 1) + this.isStartingScope(row - 1);
    if (row > 0 && this.getItemCount(row - 1) === 1) {
      indentation = Math.max(indentation - 1, row < this.getRowCount() ? this.getIndentation(row) : 0);
    }
    let key;

    //find the best place to insert a row to minimize key size
    //moving the row insertion higher or lower within the same indentation level is unnoticable
    let endScope = row;
    while (true) {
      if (endScope >= this.getRowCount()) {
        if (indentation === 0)
          return -1;

        //the indentation is not 0, so it's not whitespace.  Append the rows
        const lowKey = this.lines.peek().key;
        key = Script.incrementKey(lowKey);
        row = endScope;
        break;
      }
      
      if (this.getIndentation(endScope) === indentation && this.getItemCount(endScope) === 1) {
        ++endScope;
      } else {
        break;
      }
    }

    if (!key) {
      let startScope = row;
      while (startScope > 0 && this.getIndentation(startScope - 1) === indentation && this.getItemCount(startScope - 1) === 1) {
        --startScope;
      }

      let bestScore = 0xFFFFFFF;
      for (let i = startScope; i <= endScope; ++i) {
        const lowKey = (i > 0) ? this.lines[i - 1].key : new Uint8Array(1);
        const highKey = this.lines[i].key;
        const testKey = Script.averageKeys(lowKey, highKey);
        const last = testKey.length - 1;
        const score = last * 256 + (lowKey[last] || 0) - testKey[last];

        if (score < bestScore) {
          row = i;
          key = testKey;
          bestScore = score;
        }
      }
    }

    this.lines.splice(row, 0, {key, items: [indentation]});
    this.saveRow(row);
    return row;
  }

  deleteRow(row) {
    let count = 1;
    let startRow = row;

    //trim whitespace off the bottom of the script
    if (row + 1 === this.getRowCount()) {
      while (startRow > 0 && this.getIndentation(startRow - 1) === 0 && this.getItemCount(startRow - 1) === 1) {
        --startRow;
      }

      count = row - startRow + 1;
    }

    if (this.getItemCount(row) >= 3) {
      const item = this.getItem(row, 2);
      switch (item >>> 28) {
        case Script.VARIABLE_DEFINITION:
          this.variables.gaps.push(item & 0xFFFF);
          this.deleteMetadata(this.variables, item & 0xFFFF);
        break;

        case Script.FUNCTION_DEFINITION: {
          this.functions.gaps.push(item & 0xFFFF);
          this.deleteMetadata(this.functions, item & 0xFFFF);
          //TODO remove body of function
        break;
        }
      }
    }

    const keyRange = IDBKeyRange.bound(this.lines[startRow].key, this.lines[startRow + count - 1].key);
    this.modifyObjStore(this.lines.name, IDBObjectStore.prototype.delete, keyRange);

    this.lines.splice(startRow, count);
    return [startRow, count];
  }

  saveRow(row, count = 1) {
    this.modifyObjStore(this.lines.name, function(lines, row, count) {
      for (let i = row; i < row + count; ++i) {
        this.put(lines[i].items, lines[i].key);
      }
    }, this.lines, row, count);
  }

  deleteMetadata(arr, id) {
    arr[id + arr.builtinCount] = undefined;
    this.modifyObjStore(arr.name, IDBObjectStore.prototype.delete, id);
  }

  getMetadata(arr, id) {
    //console.log("getMetadata(", arr.name, ", ", id, ") === ", arr.name, "[", (id + arr.builtinCount) & arr.mask, "] === ", arr[(id + arr.builtinCount) & arr.mask]);
    return arr[(id + arr.builtinCount) & arr.mask];
  }

  saveMetadata(arr, id, val) {
    if (id < arr.mask - arr.builtinCount) {
      arr[(id + arr.builtinCount) & arr.mask] = val;
      this.modifyObjStore(arr.name, IDBObjectStore.prototype.put, val, id);
    }
  }

  getNextMetadataID(arr) {
    return (arr.gaps.length > 0) ? arr.gaps.shift() : arr.length - arr.builtinCount;
  }

  static *getMetadataIDs(arr) {
    for (let i = 0; i < arr.length; ++i) {
      if (!arr[i])
        continue;
      
      yield (i - arr.builtinCount) & arr.mask;;
    }
  }

  static incrementKey(key) {
    let arrKey = Array.from(key);
    let incremented = false;

    for (let i = 0; i < key.length; ++i) {
      if (arrKey[i] < 255) {
        arrKey[i]++;
        arrKey.length = i + 1;
        incremented = true;
        break;
      }
    }

    if (!incremented) {
      arrKey.push(1);
    }
    
    let newKey = new Uint8Array(arrKey);
    return newKey;
  }

  static averageKeys(lowKey, highKey) {
    let arrKey = [];

    for (let i = 0, end = Math.max(lowKey.length, highKey.length) + 1; i < end; ++i) {
      let low = (i < lowKey.length) ? lowKey[i] : 0;
      let high = (i < highKey.length) ? highKey[i] : 256;

      if (low + 1 < high) {
        arrKey[i] = (low + high) >>> 1;
        break;
      }
      else {
        arrKey.push(low);
      }
    }

    return new Uint8Array(arrKey);
  }

  getRowCount() {
    return this.lines.length;
  }

  getItemCount(row) {
    return this.lines[row].items.length;
  }

  getItem(row, col) {
    return this.lines[row].items[col];
  }

  setItem(row, col, val) {
    switch (this.lines[row].items[col] >>> 28) {
      case Script.NUMERIC_LITERAL:
      case Script.STRING_LITERAL:
      case Script.COMMENT: {
        let id = this.lines[row].items[col] & this.strings.mask;
        if (id < this.strings.mask - this.strings.builtinCount) {
          this.deleteMetadata(this.strings, id);
          this.strings.gaps.push(id);
        }
      }
    }

    this.lines[row].items[col] = val;
    this.saveRow(row);
  }

  pushItems(row, ...items) {
    this.lines[row].items.push(...items);
    this.saveRow(row);
  }

  findItem(row, item) {
    return this.lines[row].items.lastIndexOf(item);
  }

  spliceRow(row, col, count, ...items) {
    this.lines[row].items.splice(col, count, ...items);
    this.saveRow(row);
  }

  getIndentation(row) {
    return this.getItem(row, 0) & 0xFFFF;
  }

  isStartingScope(row) {
    return this.getItem(row, 0) >>> 31;
  }

  getItemDisplay(row, col) {
    const item = this.getItem(row, col);
    const format = item >>> 28; //4 bits
    const data = item & 0x0FFFFFFF; //28 bits
    const meta = data >>> 16; //12 bits
    const value = item & 0xFFFF; //16 bits

    switch (format) {
      case Script.VARIABLE_DEFINITION:
      {
        let name = this.getMetadata(this.variables, value).name || `var${value}`;
        if (meta === 0)
          return [name, "declaration"];
        else
          return [this.getMetadata(this.classes, meta).name + '\n' + name, "keyword-declaration"];
      }

      case Script.VARIABLE_REFERENCE:
      {
        let name = this.getMetadata(this.variables, value).name || `var${value}`;
        if (meta === 0)
          return [name, ""];
        else
          return [this.getMetadata(this.classes, meta).name + '\n' + name, "keyword"];
      }

      case Script.FUNCTION_DEFINITION:
        if (meta === 0)
          return [this.getMetadata(this.functions, value).name, "function-definition"];
        else
          return [this.getMetadata(this.classes, meta).name + '\n' + this.getMetadata(this.functions, value).name, "keyword-def"];

      case Script.FUNCTION_REFERENCE:
        if (meta === 0)
          return [this.getMetadata(this.functions, value).name, "function-call"];
        else
          return [this.getMetadata(this.classes, meta).name + '\n' + this.getMetadata(this.functions, value).name, "keyword-call"];

      case Script.ARGUMENT_HINT:
        return [this.getMetadata(this.functions, value).parameters[meta].name, "comment"];

      case Script.SYMBOL:
        return [this.symbols[data], ""];

      case Script.KEYWORD:
        return [this.keywords[data].name, "keyword"];

      case Script.NUMERIC_LITERAL:
        return [this.getMetadata(this.strings, data), "numeric"];

      case Script.STRING_LITERAL:
        return [this.getMetadata(this.strings, data), "string"];

      case Script.COMMENT:
        return [this.getMetadata(this.strings, data), "comment"];

      default:
        return [`format\n${format}`, "error"];
    }
  }

  performTransaction(scope, mode, actions) {
    let openRequest = indexedDB.open(this.projectID, 1);
  
    openRequest.onerror = function(event) {
      alert("Failed to open project data database. Error code " + event.errorCode);
    };
    openRequest.onupgradeneeded = function(event) {
      console.log("upgrading project data database");
      let db = event.target.result;
      db.createObjectStore("variables");
      db.createObjectStore("functions");
      db.createObjectStore("classes");
      db.createObjectStore("strings");
      db.createObjectStore("lines");
    };
    openRequest.onsuccess = function(event) {
      let db = event.target.result;
  
      db.onerror = function(event) {
        alert("Database error: " + event.target.errorCode);
      };

      let transaction = db.transaction(scope, mode);
      scope.clear();
      
      while (actions.length) {
        const action = actions.shift();
        //console.log("performing", mode, "transaction on store", action.storeName);
        action.function.apply(transaction.objectStore(action.storeName), action.arguments);
      }
    };
  }

  /**
   * Opens a transaction with the given scope and mode and performs the action on it.  If the project did not already exist, creates it.
   * @param {String[]} storeName name of object stores to modify data
   * @param {Function} action function that takes an object store and additional parameters
   * @param {*[]} args remainder of arguments are sent to the action function
   */
  modifyObjStore(storeName, action, ...args) {
    this.queuedDBwrites.scope.add(storeName);
    this.queuedDBwrites.actions.push({storeName, arguments: args, function: action});

    if (this.queuedDBwrites.actions.length === 1) {
      performActionOnProjectListDatabase("readwrite", (objStore, transaction) => {
        objStore.get(this.projectID).onsuccess = (event) => {
          if (event.target.result) {
            //console.log("Updating edit date of project listing " + this.projectID);
            let projectListing = event.target.result;
            projectListing.lastModified = new Date();
            objStore.put(projectListing);
            this.performTransaction(this.queuedDBwrites.scope, "readwrite", this.queuedDBwrites.actions);
          } else {
            const now = new Date();
            const newProject = {name: getDateString(now), created: now, lastModified: now};
      
            objStore.add(newProject).onsuccess = (event) => {
              console.log("Successfully created new project listing.  ID is", event.target.result, ". Saving all project data");
              this.projectID = event.target.result;
              localStorage.setItem(this.OPEN_PROJECT_KEY, event.target.result);
      
              this.queuedDBwrites = {scope: new Set(), actions: []};

              function saveAllMetadata(arr) {
                for (let id = arr.builtinCount; id < arr.length; ++id) {
                  if (arr[id]) {
                    this.put(arr[id], id - arr.builtinCount);
                  }
                }
              };

              for (let arr of [this.variables, this.classes, this.functions, this.strings]) {
                this.queuedDBwrites.scope.add(arr.name);
                this.queuedDBwrites.actions.push({storeName: arr.name, arguments: [arr], function: saveAllMetadata});
              }

              this.queuedDBwrites.scope.add(this.lines.name);
              this.queuedDBwrites.actions.push({storeName: this.lines.name, arguments: [this.lines], function: function(lines) {
                for (const line of lines) {
                  this.put(line.items, line.key);
                }
              }});

              this.performTransaction(this.queuedDBwrites.scope, "readwrite", this.queuedDBwrites.actions);
            }
          }
        }
      });
    }
  }

  /*
  Generates a Function object from the binary script.
  Run the function with an object argument to attach .initialize(), .onResize(), and .onDraw() to the object
  */
  getJavaScript() {
    let js = "";
    for (let row = 0; row < this.getRowCount(); ++row) {
      let indentation = this.getIndentation(row);
      js += " ".repeat(indentation);

      let needsEndParenthesis = false;
      let needsEndColon = false;
      let needsCommas = false;

      //check the first symbol
      let firstItem = this.getItem(row, 1);
      if (firstItem === this.ITEMS.CASE || firstItem === this.ITEMS.DEFAULT) {
        needsEndColon = true;
      } else if ((firstItem >>> 28) === Script.KEYWORD) {
        if (this.keywords[firstItem & 0xFFFF].js.endsWith("(")) {
          needsEndParenthesis = true;
        }
      }

      for (let col = 1, end = this.getItemCount(row); col < end; ++col) {
        let item = this.getItem(row, col);
        let format = item >>> 28;
        let value = item & 0xFFFF; //least sig 16 bits

        //append an end parenthesis to the end of the line
        switch (format) {
          case Script.VARIABLE_DEFINITION:
          case Script.VARIABLE_REFERENCE:
            if ("js" in this.getMetadata(this.variables, value)) {
              js += this.getMetadata(this.variables, value).js;
            } else {
              js += `v${value}`;
            }
            
            js += (needsCommas) ? ", " : " ";
            break;

          case Script.FUNCTION_DEFINITION:
          {
            let func = this.getMetadata(this.functions, value);

            if ("js" in func) {
              js += `${func.js} = function ( `;
            }
            else {
              js += `function f${value} (`;
            }

            needsEndParenthesis = true;
            needsCommas = true;
            break;
          }

          case Script.FUNCTION_REFERENCE:
          {
            let func = this.getMetadata(this.functions, value);
            let funcName;
            if ("js" in func) {
              funcName = func.js;
            }
            else {
              funcName = `f${value}`;
            }
            js += `${funcName} `;
            break;
          }

          case Script.ARGUMENT_HINT:
            return `/*argument hint*/ `;

          case Script.SYMBOL:
            js += `${this.symbols[value]} `;
            break;

          case Script.KEYWORD:
            js += `${this.keywords[value].js} `;
            break;

          case Script.NUMERIC_LITERAL:
            js += `${this.getMetadata(this.strings, value)} `;
            break;

          case Script.STRING_LITERAL:
            js += `"${this.getMetadata(this.strings, value)}" `;
            break;

          case Script.COMMENT:
            js += `/*${this.getMetadata(this.strings, value)}*/ `;
            break;

          default:
            js += `/*format ${format}*/ `;
        }
      }

      if (needsEndParenthesis)
        js += ") ";

      if (needsEndColon)
        js += ": ";

      if (this.isStartingScope(row))
        js += "{ ";

      if (row < this.getRowCount() - 1) {
        let nextIndentation = this.getIndentation(row + 1);
        let expectedIndentation = indentation + this.isStartingScope(row);
        if (nextIndentation < expectedIndentation) {
          js += "}".repeat(expectedIndentation - nextIndentation);
        }
      }

      js += "\n";
    }

    if (this.getRowCount() > 0) {
      let lastIndentation = this.getIndentation(this.getRowCount() - 1);
      if (lastIndentation > 0)
        js += "}".repeat(lastIndentation);
    }

    return js;
  }
}

/* Static constants  */
{
  let i = 0;
  Script.VARIABLE_DEFINITION  = i++;
  Script.VARIABLE_REFERENCE   = i++;
  Script.FUNCTION_DEFINITION  = i++;
  Script.FUNCTION_REFERENCE   = i++;
  Script.ARGUMENT_HINT        = i++;
  Script.SYMBOL               = i++;
  Script.KEYWORD              = i++;
  Script.NUMERIC_LITERAL      = i++;
  Script.STRING_LITERAL       = i++;
  Script.COMMENT              = i++;
}

Script.RESPONSE = {};
Script.RESPONSE.NO_CHANGE      = 0;
Script.RESPONSE.ROW_UPDATED    = 1;
Script.RESPONSE.ROWS_INSERTED  = 2;
Script.RESPONSE.SCRIPT_CHANGED = 4;