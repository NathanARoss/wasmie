class Script {
  constructor() {
    this.lines = [];
    this.OPEN_PROJECT_KEY = "open-touchscript-project-id";
    this.projectID = localStorage.getItem(this.OPEN_PROJECT_KEY) | 0;
    this.queuedDBwrites = {scope: new Set(), actions: []};

    const parent = this;
    class MetadataContainer {
      constructor(storeName, builtIns, mask) {
        this.storeName = storeName;
        this.data = builtIns;
        this.builtinCount = builtIns.length;
        this.mask = mask;
        this.gaps = [];
        this.initialNames = new Map();
      }

      delete(id) {
        //console.log(this.storeName, "delete", id);
        if (this.isUserDefined(id)) {
          this.data[id + this.builtinCount] = undefined;
          this.gaps.push(id);
          parent.modifyObjStore(this.storeName, IDBObjectStore.prototype.delete, id);
        }
      }
    
      get(id) {
        const index = (id + this.builtinCount) & this.mask;
        const output = this.data[index];

        if (output === undefined) {
          console.log(this.storeName, ".get(", id, ") === ", this.storeName, "[", index, "] === undefined");
        }
        
        return output;
      }
    
      set(id, val) {
        //console.log(this.storeName, ".set(", id, ",", val, ") ->", this.storeName, "[", (id + this.builtinCount) & this.mask, "] =", val);
        if (this.isUserDefined(id)) {
          this.data[(id + this.builtinCount) & this.mask] = val;
          parent.modifyObjStore(this.storeName, IDBObjectStore.prototype.put, typeof val === "string" ? val : val.name, id);
        }
      }
    
      nextId() {
        return (this.gaps.length > 0) ? this.gaps.shift() : this.data.length - this.builtinCount;
      }
    
      *getIDs() {
        for (let i = 0; i < this.data.length; ++i) {
          if (!this.data[i])
            continue;
          
          yield (i - this.builtinCount) & this.mask;
        }
      }

      isUserDefined(id) {
        return id <= this.data.length - this.builtinCount;
      }
    }


    const {classes, variables, functions, symbols, keywords} = getBuiltIns();
    this.symbols = symbols;
    this.keywords = keywords;

    const makeKeyword = text => 
      Script.makeItem({format: Script.KEYWORD, value: this.keywords.findIndex(element => element.name === text)});

    const makeSymbol = text => 
      Script.makeItem({format: Script.SYMBOL, value: this.symbols.indexOf(text)});

    const literals = [];
    const makeLiteral = (text, type) => {
      literals.unshift(text);
      return Script.makeItem({format: Script.LITERAL, meta: type, value: -literals.length});
    }

    this.ITEMS = {};
    this.ITEMS.FUNC     = makeKeyword("func");
    this.ITEMS.LET      = makeKeyword("let");
    this.ITEMS.VAR      = makeKeyword("var");
    this.ITEMS.SWITCH   = makeKeyword("switch");
    this.ITEMS.CASE     = makeKeyword("case");
    this.ITEMS.DEFAULT  = makeKeyword("default");
    this.ITEMS.IF       = makeKeyword("if");
    this.ITEMS.FOR      = makeKeyword("for");
    this.ITEMS.IN       = makeKeyword("in");
    this.ITEMS.WHILE    = makeKeyword("while");
    this.ITEMS.UNTIL    = makeKeyword("until");
    this.ITEMS.RETURN   = makeKeyword("return");
    this.toggles = [this.ITEMS.VAR, this.ITEMS.LET, this.ITEMS.WHILE, this.ITEMS.UNTIL, makeKeyword("continue"), makeKeyword("break")];

    this.ITEMS.EQUALS            = makeSymbol("=");
    this.ITEMS.START_PARENTHESIS = makeSymbol("(");
    this.ITEMS.END_PARENTHESIS   = makeSymbol(")");
    this.ITEMS.COMMA             = makeSymbol(",");
    this.ITEMS.BLANK             = makeSymbol("_____");

    this.ITEMS.FALSE = makeLiteral("false", 0);
    this.ITEMS.TRUE  = makeLiteral("true", 0);

    this.variables = new MetadataContainer("variables", variables, 0xFFFF);
    this.functions = new MetadataContainer("functions", functions, 0xFFFF);
    this.classes = new MetadataContainer("classes", classes, 0x3FF);
    this.literals = new MetadataContainer("literals", literals, 0xFFFF);
    this.lines.storeName = "lines";

    this.FUNCS = {STRIDE: -1 & this.functions.mask};
    this.CLASSES = {VOID: -1 & this.classes.mask};

    performActionOnProjectListDatabase("readonly", (objStore, transaction) => {
      objStore.get(this.projectID).onsuccess = (event) => {
        if (!event.target.result) {
          console.log("The previously opened project no longer exists");
          this.projectID = 0;
          localStorage.removeItem(this.OPEN_PROJECT_KEY);
        } else {
          let remainingStores = {count: 5};

          let actions = [];
          for (const container of [this.variables, this.functions, this.classes, this.literals]) {
            actions.push({storeName: container.storeName, arguments: [container, remainingStores], function: function(container, remainingStores) {
              let request = this.openCursor();
              request.onsuccess = function(event) {
                let cursor = event.target.result;
                if (cursor) {
                  container.initialNames.set(cursor.key, cursor.value);
                  cursor.continue();
                } else if (--remainingStores.count === 0) {
                  parent.bindMetadata();
                }
              };
            }});
          }
          actions.push({storeName: this.lines.storeName, arguments: [this.lines, this.variables, this.functions, this.classes, this.literals, remainingStores],
          function: function(lines, variables, functions, classes, literals, remainingStores) {
            this.openCursor().onsuccess = function(event) {
              let cursor = event.target.result;
              if (cursor) {
                let func;

                const items = Array.from(new Uint32Array(cursor.value));
                lines.push({key: cursor.key, items});
                for (const item of items) {
                  const data = Script.getItemData(item);
                  switch (data.format) {
                    case Script.VARIABLE_DEFINITION: {
                      const index = (data.value + variables.builtinCount) & variables.mask;
                      variables.data[index] = {name: "", type: data.meta, scope: parent.CLASSES.VOID};
                      if (func) {
                        func.parameters.push(variables.data[index]);
                      }
                    }
                    break;

                    case Script.FUNCTION_DEFINITION: {
                      const index = (data.value + functions.builtinCount) & functions.mask;
                      functions.data[index] = {name: "", returnType: data.meta, scope: parent.CLASSES.VOID, parameters: []};
                      func = functions.data[index];
                    }
                    break;

                    case Script.LITERAL:
                      if (literals.isUserDefined(data.value)) {
                        const index = (data.value + literals.builtinCount) & literals.mask;
                        literals.data[index] = null;
                      }
                    break;
                  }
                }
                cursor.continue();
              } else if (--remainingStores.count === 0) {
                parent.bindMetadata();
              }
            };
          }});

          this.performTransaction(new Set(["variables", "functions", "classes", "literals", "lines"]), "readonly", actions);
        }
      }
    });

    let payloads = Script.makeItem({format: Script.KEYWORD, value: -1});
    this.PAYLOADS = {};
    this.PAYLOADS.VAR_OPTIONS = payloads--;
    this.PAYLOADS.FUNCTION_REFERENCE = payloads--;
    this.PAYLOADS.FUNCTION_REFERENCE_WITH_RETURN = payloads--;
    this.PAYLOADS.LITERAL_INPUT = payloads--;
    this.PAYLOADS.RENAME = payloads--;
    this.PAYLOADS.PARENTHESIS_PAIR = payloads--;
    this.PAYLOADS.DELETE_ITEM = payloads--;
    this.PAYLOADS.REMOVE_PARENTHESIS_PAIR = payloads--;


    class Operator {
      constructor(start, end) {
        this.start = Script.makeItem({format: Script.SYMBOL, value: start});
        this.end = Script.makeItem({format: Script.SYMBOL, value: end});
      }

      includes(item) {
        return item >= this.start && item < this.end;
      }

      *getMenuItems() {
        for (let payload = this.start; payload < this.end; ++payload) {
          yield {text: symbols[payload & 0xFFFF], style: "", payload};
        }
      }
    }

    this.ASSIGNMENT_OPERATORS = new Operator(0, 9);
    this.BINARY_OPERATORS = new Operator(9, 27);
    this.UNARY_OPERATORS = new Operator(27, 30);
  }

  static makeItem({format = 0, flag = 0, flag2 = 0, meta = 0, value = 0}) {
    return (format & 0xF) << 28 | (flag & 1) << 27 | (flag2 & 1) << 26 | (meta & 0x3FF) << 16 | (value & 0xFFFF);
  }

  static getItemData(item) {
    return {format: item >>> 28, flag: item >>> 27 & 1, flag2: item >>> 26 & 1, meta: item >>> 16 & 0x3FF, value: item & 0xFFFF};
  }

  bindMetadata() {
    for (const container of [this.variables, this.functions, this.classes, this.literals]) {
      for (let index = container.builtinCount; index < container.data.length; ++index) {
        const id = (index - container.builtinCount) & container.mask;
        if (container.data[index] === undefined) {
          container.gaps.push(id);
          if (container.initialNames.has(id)) {
            console.log("removing '", container.initialNames.get(id), "' from ", container.storeName);
            this.modifyObjStore(container.storeName, IDBObjectStore.prototype.delete, id);
          }
        } else {
          const name = container.initialNames.get(id);
          if (container === this.literals) {
            container.data[index] = name;
          } else {
            container.data[index].name = name;
          }
        }
      }
      delete container.initialNames;

      if (container.gaps.length) {
        console.log(container.storeName, "has gaps", container.gaps);
      }
    }

    reloadAllRowsInPlace();
  }

  itemClicked(row, col) {
    if (col === -1) {
      let options = this.appendClicked(row);
      if (options)
        return options;
      
      col = this.getItemCount(row);
    }

    const [item = 0xFFFFFFFF] = [this.getItem(row, col)];
    const data = Script.getItemData(item);
    

    if (data.format === Script.KEYWORD) {
      if (item !== this.ITEMS.VAR || this.getItem(row, 3) === this.ITEMS.EQUALS) {
        const i = this.toggles.indexOf(item);
        if (i !== -1) {
          this.setItem(row, col, this.toggles[i ^ 1]);
          let newKeyword = this.keywords[this.getData(row, col).value].name;
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
      let options = [{text: "", style: "delete", payload: this.PAYLOADS.DELETE_ITEM}];
      if (this.getData(row, beginParenthesis - 1).format !== Script.FUNCTION_REFERENCE) {
        options.push({text: "", style: "delete-outline", payload: this.PAYLOADS.REMOVE_PARENTHESIS_PAIR});

        if (item === this.ITEMS.START_PARENTHESIS)
          options.push(...this.UNARY_OPERATORS.getMenuItems());
      }

      if (item === this.ITEMS.END_PARENTHESIS)
        options.push(...this.BINARY_OPERATORS.getMenuItems());

      return options;
    }

    let options = [];

    if (((data.format === Script.VARIABLE_REFERENCE || data.format === Script.VARIABLE_DEFINITION) && data.value < this.variables.mask - this.variables.builtinCount)
    || ((data.format === Script.FUNCTION_REFERENCE || data.format === Script.FUNCTION_DEFINITION) && data.value < this.functions.mask - this.functions.builtinCount)) {
      options.push({text: "", style: "rename", payload: this.PAYLOADS.RENAME});
    }

    if (col === 1) {
      if (data.format === Script.VARIABLE_REFERENCE)
        options.push(...this.getVisibleVariables(row, true));
      else if (data.format === Script.FUNCTION_REFERENCE)
        options.push({text: "", style: "delete", payload: this.PAYLOADS.DELETE_ITEM}, ...this.getFunctionList(false));
    } else {
      //don't allow the user to delete the item if it is a binary operator followed by anything meaningful
      if (data.format !== Script.VARIABLE_DEFINITION && data.format !== Script.FUNCTION_DEFINITION) {
        if (!this.BINARY_OPERATORS.includes(item)
        || (this.getItem(row, col + 1) === undefined || this.getItem(row, col + 1) === this.ITEMS.BLANK))
          options.push({text: "", style: "delete", payload: this.PAYLOADS.DELETE_ITEM});
      }

      if (data.format === Script.VARIABLE_REFERENCE
      || data.format === Script.FUNCTION_REFERENCE
      || data.format === Script.LITERAL) {
        options.push( {text: "( )", style: "", payload: this.PAYLOADS.PARENTHESIS_PAIR} );

        if (data.format !== Script.FUNCTION_REFERENCE)
          options.push(...this.BINARY_OPERATORS.getMenuItems());
      }

      if (data.format === Script.VARIABLE_DEFINITION || data.format === Script.FUNCTION_DEFINITION) {
        //list types for a variable to be or for a function to return
        if (data.format === Script.FUNCTION_DEFINITION || this.findItem(row, this.ITEMS.FUNC) < 1) {
          let option = {text: "", style: "comment", payload: Script.makeItem({format: Script.FUNCTION_DEFINITION, meta: this.CLASSES.VOID})};
          option.text = (data.format === Script.FUNCTION_DEFINITION) ? "void" : "auto";
          options.push(option);
        }
            
        for (const id of this.classes.getIDs()) {
          const c = this.classes.get(id);
          if (c.size > 0)
            options.push({text: c.name, style: "keyword", payload: Script.makeItem({format: Script.FUNCTION_DEFINITION, flag: 1, meta: id})});
        }
      }
      
      const prevItem = this.getItem(row, col - 1);
      const prevData = this.getData(row, col - 1);

      if (prevData.format === Script.VARIABLE_REFERENCE
      || prevData.format === Script.LITERAL
      || prevItem === this.ITEMS.END_PARENTHESIS) {
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

    if (this.getData(row, 1).format === Script.FUNCTION_REFERENCE) {
      return [];
    }

    const index = this.findItem(row, this.ITEMS.FUNC);
    if (index > 0) {
      let options = [];

      for (const id of this.classes.getIDs()) {
        const c = this.classes.get(id);
        if (c.size > 0)
          options.push({text: c.name, style: "keyword", payload: Script.makeItem({format: Script.ARGUMENT_HINT, meta: id})});
      }

      return options;
    }

    return null;
  }

  //0 -> no change, 1 -> click item changed, 2-> row changed, 3 -> row(s) inserted
  menuItemClicked(row, col, payload) {
    if (col === -1)
      col = row < this.getRowCount() ? this.getItemCount(row) : 0;

    switch (payload) {
      case this.ITEMS.CASE:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        this.pushItems(row, payload, this.ITEMS.BLANK);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;

      case this.ITEMS.DEFAULT:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        this.pushItems(row, payload);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;
      
      case this.ITEMS.LET:
      case this.ITEMS.VAR: {
        const varId = this.variables.nextId();
        const name = prompt("Enter variable name:", `var${varId}`);
        if (name) {
          this.appendRowsUpTo(row);
          this.variables.set(varId, {name, type: this.CLASSES.VOID, scope: this.CLASSES.VOID});
          this.pushItems(row, payload, Script.makeItem({format: Script.VARIABLE_DEFINITION, meta: this.CLASSES.VOID, value: varId}), this.ITEMS.EQUALS, this.ITEMS.BLANK);
          return Script.RESPONSE.ROW_UPDATED;
        } else {
          return Script.RESPONSE.NO_CHANGE;
        }
      }

      case this.PAYLOADS.VAR_OPTIONS: {
        let options = [{text: "= expression", style: "comment", payload: this.ITEMS.VAR}];

        for (const id of this.classes.getIDs()) {
          const c = this.classes.get(id);
          if (c.size > 0)
            options.push({text: c.name, style: "keyword", payload: Script.makeItem({format: Script.VARIABLE_DEFINITION, meta: id})});
        }

        return options;
      }
      
      case this.ITEMS.IF:
      case this.ITEMS.WHILE:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        this.pushItems(row, payload, this.ITEMS.BLANK);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;

      case this.ITEMS.FOR:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        let varId = this.variables.nextId();
        this.variables.set(varId, {name: "i", type: this.CLASSES.VOID, scope: this.CLASSES.VOID});

        this.pushItems(row, payload, Script.makeItem({format: Script.VARIABLE_DEFINITION, meta: this.CLASSES.VOID, value: varId}), this.ITEMS.IN,
          Script.makeItem({format: Script.FUNCTION_REFERENCE, meta: this.CLASSES.VOID, value: this.FUNCS.STRIDE}),
          this.ITEMS.START_PARENTHESIS,
          Script.makeItem({format: Script.ARGUMENT_HINT, meta: 0, value: this.FUNCS.STRIDE}),
          this.ITEMS.COMMA,
          Script.makeItem({format: Script.ARGUMENT_HINT, meta: 1, value: this.FUNCS.STRIDE}),
          this.ITEMS.COMMA,
          Script.makeItem({format: Script.ARGUMENT_HINT, meta: 2, value: this.FUNCS.STRIDE}),
          this.ITEMS.END_PARENTHESIS);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;

      case this.ITEMS.SWITCH:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        this.pushItems(row, payload, this.ITEMS.BLANK);
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;
      
      case this.ITEMS.RETURN: {
        this.appendRowsUpTo(row);
        let returnType = 0;
        for (let r = row - 1; r >= 0; --r) {
          if (this.getItem(r, 1) === this.ITEMS.FUNC) {
            returnType = this.getData(r, 2).meta;
            break;
          }
        }

        this.pushItems(row, payload);
        if (returnType > 0)
          this.pushItems(row, this.ITEMS.BLANK);
        
        return Script.RESPONSE.ROW_UPDATED;
      }

      case this.ITEMS.FUNC: {
        let options = [{text: "none", style: "comment", payload: Script.makeItem({format: Script.LITERAL, meta: 0})}];

        for (const id of this.classes.getIDs()) {
          const c = this.classes.get(id);
          if (c.size > 0)
            options.push({text: c.name, style: "keyword", payload: Script.makeItem({format: Script.LITERAL, meta: id})});
        }

        return options;
      }

      case this.ITEMS.EQUALS:
        this.pushItems(row, this.ITEMS.EQUALS, this.ITEMS.BLANK);
        return Script.RESPONSE.ROW_UPDATED;

      case this.ITEMS.COMMA: {
        let varId = this.variables.nextId();
        const name = prompt("Enter variable name:", `var${varId}`);
        if (name) {
          let type = this.getData(row, this.getItemCount(row) - 1).meta;
          this.variables.set(varId, {name, type, scope: this.CLASSES.VOID});
          this.pushItems(row, this.ITEMS.COMMA, Script.makeItem({format: Script.VARIABLE_DEFINITION, meta: type, value: varId}));
          return Script.RESPONSE.ROW_UPDATED;
        } else {
          return Script.RESPONSE.NO_CHANGE;
        }
      }

      case this.PAYLOADS.LITERAL_INPUT: {
        let hint = "";

        const data = this.getData(row, col);
        if (data.format == Script.LITERAL) {
          hint = this.literals.get(data.value);
        }

        let input = prompt("Enter a string or a number:", hint);
        if (input === null)
          return Script.RESPONSE.NO_CHANGE;

        let payload;
        
        if (input === "true") {
          payload = this.ITEMS.TRUE;
        } else if (input === "false") {
          payload = this.ITEMS.FALSE;
        } else {
          const id = this.literals.nextId();

          if (input.trim().length !== 0 && !isNaN(input)) {
            input = input.trim();
            payload = Script.makeItem({format: Script.LITERAL, meta: 2, value: id});
          } else {
            if (!input.startsWith('"'))
              input = '"' + input;
            
            if (!input.endsWith('"'))
              input = input + '"';

            payload = Script.makeItem({format: Script.LITERAL, meta: 1, value: id});
          }
          
          this.literals.set(id, input);
        }

        const [start, end] = this.getExpressionBounds(row, col);
        this.spliceRow(row, start, end - start + 1, payload);
        return Script.RESPONSE.ROW_UPDATED;
      }

      case this.PAYLOADS.RENAME: {
        const data = this.getData(row, col);
        let container;

        switch (data.format) {
          case Script.VARIABLE_DEFINITION:
          case Script.VARIABLE_REFERENCE:
            container = this.variables;
            break;

          case Script.FUNCTION_DEFINITION:
          case Script.FUNCTION_REFERENCE:
            container = this.functions;
            break;
        }

        let metadata = container.get(data.value);
        let input = prompt("Enter new name:", metadata.name);

        if (input === null)
          return Script.RESPONSE.NO_CHANGE;
        else {
          metadata.name = input;
          container.set(data.value, metadata);
          return Script.RESPONSE.SCRIPT_CHANGED;
        }
      }

      case this.PAYLOADS.DELETE_ITEM: {
        const item = this.getItem(row, col);

        if (this.UNARY_OPERATORS.includes(item)) {
          this.spliceRow(row, col, 1);
        }
        else if (this.BINARY_OPERATORS.includes(item)) {
          this.spliceRow(row, col, 2);
        }
        else if (item === this.ITEMS.BLANK && this.BINARY_OPERATORS.includes(this.getItem(row, col - 1))) {
          this.spliceRow(row, col - 1, 2);
        }
        else {
          const [start, end] = this.getExpressionBounds(row, col);

          //assumes any selection that reaches the first item spans the whole line
          if (start === 1) {
            if (this.getIndentation(row) === 0 && row + 1 === this.getRowCount()) {
              return Script.RESPONSE.ROW_DELETED;
            } else {
              this.spliceRow(row, start, end - start + 1);
            }
          } else {
            this.spliceRow(row, start, end - start + 1, this.ITEMS.BLANK);
          }
        }

        return Script.RESPONSE.ROW_UPDATED;
      }

      case this.PAYLOADS.REMOVE_PARENTHESIS_PAIR: {
        const [start, end] = this.getExpressionBounds(row, col);
        this.spliceRow(row, end, 1);
        this.spliceRow(row, start, 1);
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

    const payloadData = Script.getItemData(payload);

    //if a specific variable reference is provided
    if (payloadData.format === Script.VARIABLE_REFERENCE) {
      let varId = payloadData.value;
      const variable = this.variables.get(varId);
      
      this.appendRowsUpTo(row);
      if (this.getItemCount(row) === 1) {
        this.pushItems(row,
          Script.makeItem({format: Script.VARIABLE_REFERENCE, meta: variable.scope, value: varId}),
          this.ITEMS.EQUALS,
          this.ITEMS.BLANK
        );
        return Script.RESPONSE.ROW_UPDATED;
      }

      const [start, end] = this.getExpressionBounds(row, col);
      this.spliceRow(row, start, end - start + 1, payload);

      return Script.RESPONSE.ROW_UPDATED;
    }

    //user chose a type for a variable declaration
    if (payloadData.format === Script.VARIABLE_DEFINITION) {
      const varId = this.variables.nextId();
      const name = prompt("Enter variable name:", `var${varId}`);
      if (name) {
        const type = payloadData.meta;
        this.appendRowsUpTo(row);
        this.variables.set(varId, {name, type, flag: 1, scope: this.CLASSES.VOID});
        this.pushItems(row, this.ITEMS.VAR, Script.makeItem({format: Script.VARIABLE_DEFINITION, flag: 1, meta: type, value: varId}));
        return Script.RESPONSE.ROW_UPDATED;
      } else {
        return Script.RESPONSE.NO_CHANGE;
      }
    }

    //user chose a type for a function declaration
    if (payloadData.format === Script.LITERAL) {
      let funcId = this.functions.nextId();
      const returnType = payloadData.meta;
      const name = prompt(`Enter function name`, `f${funcId}`);
      if (name) {
        let newFunc = {name, returnType, scope: this.CLASSES.VOID, parameters: []};
        this.appendRowsUpTo(row);
        this.functions.set(funcId, newFunc);
        this.setIsStartingScope(row, true);
        this.pushItems(row, this.ITEMS.FUNC, Script.makeItem({format: Script.FUNCTION_DEFINITION, meta: returnType, value: funcId}));
        return Script.RESPONSE.ROW_UPDATED | Script.RESPONSE.ROWS_INSERTED;
      } else {
        return Script.RESPONSE.NO_CHANGE;
      }
    }

    //user chose a specific function call
    if (payloadData.format === Script.FUNCTION_REFERENCE) {
      const func = this.functions.get(payloadData.value);
      let replacementItems = [payload];

      for (let i = 0; i < func.parameters.length; ++i) {
        replacementItems.push(this.ITEMS.COMMA);
        replacementItems.push(Script.makeItem({format: Script.ARGUMENT_HINT, meta: i, value: payloadData.value}));
      }

      replacementItems[1] = this.ITEMS.START_PARENTHESIS;
      replacementItems.push(this.ITEMS.END_PARENTHESIS);

      this.appendRowsUpTo(row);
      const [start, end] = col === 0 ? [1,1] : this.getExpressionBounds(row, col);
      this.spliceRow(row, start, end - start + 1, ...replacementItems);
      
      return Script.RESPONSE.ROW_UPDATED;
    }

    //appending additional parameters
    if (payloadData.format === Script.ARGUMENT_HINT) {
      let varId = this.variables.nextId();
      let type = payloadData.meta;
      const name = prompt(`Enter name for ${this.classes.get(type).name} parameter:`, `var${varId}`);

      if (name) {
        this.variables.set(varId, {name, type, scope: this.CLASSES.VOID});
        this.pushItems(row, Script.makeItem({format: Script.VARIABLE_DEFINITION, flag: 1, meta: type, value: varId}));

        const index = this.findItem(row, this.ITEMS.FUNC);
        const funcId = this.getData(row, index + 1).value;
        const func = this.functions.get(funcId);
        func.parameters.push({name, type})
        this.functions.set(funcId, func);

        return Script.RESPONSE.ROW_UPDATED;
      } else {
        return Script.RESPONSE.NO_CHANGE;
      }
    }

    //user chose a symbol to insert into the script
    if (payloadData.format === Script.SYMBOL) {
      const item = this.getItem(row, col);
      if (this.UNARY_OPERATORS.includes(item) || this.BINARY_OPERATORS.includes(item)) {
        this.setItem(row, col, payload);
      } else {
        if (this.UNARY_OPERATORS.includes(payload))
          this.spliceRow(row, col, 0, payload);
        else
          this.spliceRow(row, col + 1, 0, payload, this.ITEMS.BLANK);
      }
      
      return Script.RESPONSE.ROW_UPDATED;
    }

    //user updated the type annotation of a variable or function
    if (payloadData.format === Script.FUNCTION_DEFINITION) {
      const {format, value} = this.getData(row, col);
      const {flag, meta} = payloadData;
      const newItem = Script.makeItem({format, flag, meta, value});
      this.setItem(row, col, newItem);

      if (format === Script.FUNCTION_DEFINITION) {
        const hasReturn = payloadData.meta !== this.CLASSES.VOID;

        let indentation = this.getIndentation(row);
        for (let r = row + 1; r < this.getRowCount(); ++r) {
          if (this.getIndentation(r) === indentation)
            break;
          
          if (this.getItem(r, 1) === this.ITEMS.RETURN) {
            let replacementItems = hasReturn ? [this.ITEMS.BLANK] : [];
            this.spliceRow(r, 2, this.getItemCount(r) - 2, ...replacementItems);
          }
        }

        const func = this.functions.get(value);
        func.returnType = payloadData.meta;
        this.functions.set(value, func);

        return Script.RESPONSE.SCRIPT_CHANGED;
      } else {
        const v = this.variables.get(value);
        v.type = payloadData.meta;
        this.variables.set(value, v);
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
            if (this.getData(r, col).format === Script.VARIABLE_DEFINITION) {
              let varId = this.getData(r, col).value;
              const v = this.variables.get(varId);
              const type = this.classes.get(v.type);
              const scope = this.classes.get(v.scope);
              const text = (v.type === this.CLASSES.VOID ? "undeclared" : type.name) + (v.scope === this.CLASSES.VOID ? "" : " " + scope.name) + "\n" + v.name;
              options.push({text, style: "keyword-declaration", payload: Script.makeItem({format: Script.VARIABLE_REFERENCE, meta: v.type, value: varId})});
            }
          }
        }
      }
    }

    if (!requiresMutable) {
      for (let i = -this.variables.builtinCount; i <= -1; ++i) {
        const v = this.variables.get(i);
        const text = this.classes.get(v.type).name + " " + this.classes.get(v.scope).name + "\n" + v.name;
        options.push({text, style: "keyword-declaration", payload: Script.makeItem({format: Script.VARIABLE_REFERENCE, meta: v.scope, value: i})});
      }
    }

    return options;
  }

  getFunctionList(requireReturn) {
    let options = [];

    for (const id of this.functions.getIDs()) {
      let func = this.functions.get(id);
      if (!requireReturn || func.returnType !== 0) {
        const returnType = this.classes.get(func.returnType);
        const scope = this.classes.get(func.scope);
        if (func.name === "dot")
          console.log(func);
        options.push({text: returnType.name + (func.scope === this.CLASSES.VOID ? "" : " " + scope.name) + "\n" + func.name, style: "keyword-call", payload: Script.makeItem({format: Script.FUNCTION_REFERENCE, meta: func.scope, value: id})});
      }
    }

    return options;
  }

  /**
   * Finds the bounds of the smallest expression that contains the item position
   * @param {Number} row
   * @param {Number} col
   * @return {[Number, Number]} [startItem, endItem] 
   */
  getExpressionBounds(row, col) {
    let start = col;
    let end = col;

    const item = this.getItem(row, col);
    const data = Script.getItemData(item);

    if (data.format === Script.FUNCTION_REFERENCE || item === this.ITEMS.START_PARENTHESIS) {
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

    if (item === this.ITEMS.END_PARENTHESIS) {
      let depth = 0;
      while (start > 1) {
        if (this.getItem(row, start) === this.ITEMS.END_PARENTHESIS) {
          ++depth;
        }

        if (this.getItem(row, start) === this.ITEMS.START_PARENTHESIS) {
          --depth;
          if (depth === 0)
            break;
        }

        --start;
      }
    }

    if (this.getData(row, start - 1).format === Script.FUNCTION_REFERENCE)
      --start;

    if (this.UNARY_OPERATORS.includes(this.getItem(row, start - 1)))
      --start;

    return [start, end];
  }

  appendRowsUpTo(row) {
    let oldLength = this.getRowCount();
    let inserted = 0;

    let key = this.lines.length === 0 ? new ArrayBuffer(1) : this.lines[this.lines.length - 1].key;
    const header = Script.makeItem({format: 0xF});
    while (row >= this.getRowCount()) {
      key = Script.incrementKey(key);
      this.lines.push({key, items: [header]});
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
        const lowKey = this.lines[this.lines.length - 1].key;
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
        const lowKey = (i > 0) ? this.lines[i - 1].key : new ArrayBuffer(1);
        const highKey = this.lines[i].key;
        const testKey = Script.averageKeys(lowKey, highKey);
        const last = testKey.byteLength - 1;
        const score = last * 256 + (new Uint8Array(lowKey)[last] || 0) - new Uint8Array(testKey)[last];

        if (score < bestScore) {
          row = i;
          key = testKey;
          bestScore = score;
        }
      }
    }

    const header = Script.makeItem({format: 0xF, value: indentation});
    this.lines.splice(row, 0, {key, items: [header]});
    this.saveRow(row);
    return row;
  }

  deleteRow(row) {
    let count = 1;
    let startRow = row;

    const indentation = this.getIndentation(row);
    let r = row;
    do {
      this.lines[r].items.forEach(this.recycleItem, this);
      ++r;
    } while (r < this.getRowCount() && this.getIndentation(r) !== indentation);

    count += r - row - 1;

    //trim whitespace off the bottom of the script
    if (row + count === this.getRowCount()) {
      while (startRow > 0 && this.getIndentation(startRow - 1) === 0 && this.getItemCount(startRow - 1) === 1) {
        --startRow;
      }

      count += row - startRow;
    }

    const keyRange = IDBKeyRange.bound(this.lines[startRow].key, this.lines[startRow + count - 1].key);
    this.modifyObjStore(this.lines.storeName, IDBObjectStore.prototype.delete, keyRange);

    this.lines.splice(startRow, count);
    return [startRow, count];
  }

  saveRow(row, count = 1) {
    this.modifyObjStore(this.lines.storeName, function(lines, row, count) {
      for (let i = row; i < row + count; ++i) {
        this.put(Uint32Array.from(lines[i].items).buffer, lines[i].key);
      }
    }, this.lines, row, count);
  }

  /**
   * creates a new key that sorts after key
   * @param {ArrayBuffer} key 
   * @returns {ArrayBuffer} succeeding key
   */
  static incrementKey(key) {
    let arrKey = Array.from(new Uint8Array(key));
    let incremented = false;

    for (let i = 0; i < arrKey.length; ++i) {
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
    
    return (new Uint8Array(arrKey)).buffer;
  }

  /**
   * creates a new key that sorts between lowKey and highKey
   * @param {ArrayBuffer} lowKey 
   * @param {ArrayBuffer} highKey
   * @return {ArrayBuffer} midway key
   */
  static averageKeys(lowKey, highKey) {
    let arrKey = [];
    const lowKeyArr = new Uint8Array(lowKey);
    const highKeyArr = new Uint8Array(highKey);

    for (let i = 0, end = Math.max(lowKeyArr.length, highKeyArr.length) + 1; i < end; ++i) {
      let low = (i < lowKeyArr.length) ? lowKeyArr[i] : 0;
      let high = (i < highKeyArr.length) ? highKeyArr[i] : 256;

      if (low + 1 < high) {
        arrKey[i] = (low + high) >>> 1;
        break;
      }
      else {
        arrKey.push(low);
      }
    }

    return (new Uint8Array(arrKey)).buffer;
  }

  getRowCount() {
    return this.lines.length;
  }

  getItemCount(row) {
    return this.lines[row].items.length;
  }

  /**
   * Check the item for variable, function, class, or string resources to recycle before overwriting
   * @param {Number} oldItem item that is being discarded
   * @param {Number} newItem replacement item, if it exists
   */
  recycleItem(oldItem, newItem = 0xFFFFFFFF) {
    const oldData = Script.getItemData(oldItem);
    const newData = Script.getItemData(newItem);

    if (newData.format !== oldData.format || newData.value !== oldData.value) {
      switch (oldData.format) {
        case Script.VARIABLE_DEFINITION:
          this.variables.delete(oldData.value);
        break;
  
        case Script.FUNCTION_DEFINITION:
          this.functions.delete(oldData.value);
        break;
        
        case Script.LITERAL:
          this.literals.delete(oldData.value);
        break;
      }
    }
  }

  getItem(row, col) {
    return this.lines[row].items[col];
  }

  getData(row, col) {
    return Script.getItemData(this.getItem(row, col));
  }

  setItem(row, col, val) {
    this.recycleItem(this.lines[row].items[col], val);
    this.lines[row].items[col] = val;
    this.saveRow(row);
  }

  spliceRow(row, col, count, ...items) {
    this.lines[row].items.splice(col, count, ...items).forEach(this.recycleItem, this);
    this.saveRow(row);
  }

  pushItems(row, ...items) {
    this.lines[row].items.push(...items);
    this.saveRow(row);
  }

  findItem(row, item) {
    return this.lines[row].items.indexOf(item);
  }

  getIndentation(row) {
    return this.getData(row, 0).value;
  }

  isStartingScope(row) {
    return this.getData(row, 0).flag;
  }
  
  setIsStartingScope(row, isStartingScope) {
    const header = this.getData(row, 0);
    header.flag = isStartingScope & 1;
    const item = Script.makeItem(header);
    this.setItem(row, 0, item);
  }

  getItemDisplay(row, col) {
    const {format, flag, meta, value} = this.getData(row, col);

    switch (format) {
      case Script.VARIABLE_DEFINITION:
      {
        let name = this.variables.get(value).name;
        if (!flag)
          return [name, "declaration"];
        else
          return [this.classes.get(meta).name + '\n' + name, "keyword-declaration"];
      }

      case Script.VARIABLE_REFERENCE:
      {
        let name = this.variables.get(value).name;
        if (meta === this.CLASSES.VOID)
          return [name, ""];
        else
          return [this.classes.get(meta).name + '\n' + name, "keyword"];
      }

      case Script.FUNCTION_DEFINITION:
        if (meta === this.CLASSES.VOID)
          return [this.functions.get(value).name, "function-definition"];
        else
          return [this.classes.get(meta).name + '\n' + this.functions.get(value).name, "keyword-def"];

      case Script.FUNCTION_REFERENCE:
        if (meta === this.CLASSES.VOID)
          return [this.functions.get(value).name, "function-call"];
        else
          return [this.classes.get(meta).name + '\n' + this.functions.get(value).name, "keyword-call"];

      case Script.ARGUMENT_HINT:
        return [this.functions.get(value).parameters[meta].name, "comment"];

      case Script.SYMBOL:
        return [this.symbols[value], ""];

      case Script.KEYWORD:
        return [this.keywords[value].name, "keyword"];

      case Script.LITERAL:
        return [this.literals.get(value), "literal"];

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
      db.createObjectStore("literals");
      db.createObjectStore("lines");
      db.createObjectStore("save-data");
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
              console.log("Successfully created new project listing.  ID is", event.target.result);
              this.projectID = event.target.result;
              localStorage.setItem(this.OPEN_PROJECT_KEY, event.target.result);
      
              this.queuedDBwrites = {scope: new Set(), actions: []};

              function saveAllMetadata(container) {
                for (let id = container.builtinCount; id < container.data.length; ++id) {
                  const meta = container.data[id];
                  if (meta) {
                    this.put(typeof meta === "string" ? meta : meta.name, id - container.builtinCount);
                  }
                }
              };

              for (let container of [this.variables, this.classes, this.functions, this.literals]) {
                this.queuedDBwrites.scope.add(container.storeName);
                this.queuedDBwrites.actions.push({storeName: container.storeName, arguments: [container], function: saveAllMetadata});
              }

              this.queuedDBwrites.scope.add(this.lines.storeName);
              this.queuedDBwrites.actions.push({storeName: this.lines.storeName, arguments: [this.lines], function: function(lines) {
                for (const line of lines) {
                  this.put(Uint32Array.from(line.items).buffer, line.key);
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
      const firstData = this.getData(row, 1);
      if (firstItem === this.ITEMS.CASE || firstItem === this.ITEMS.DEFAULT) {
        needsEndColon = true;
      } else if (firstData.format === Script.KEYWORD) {
        if (this.keywords[firstData.value].js.endsWith("(")) {
          needsEndParenthesis = true;
        }
      }

      for (let col = 1, end = this.getItemCount(row); col < end; ++col) {
        const {format, value} = this.getData(row, col);

        //append an end parenthesis to the end of the line
        switch (format) {
          case Script.VARIABLE_DEFINITION:
          case Script.VARIABLE_REFERENCE:
            if ("js" in this.variables.get(value)) {
              js += this.variables.get(value).js;
            } else {
              js += `v${value}`;
            }
            
            js += (needsCommas) ? ", " : " ";
            break;

          case Script.FUNCTION_DEFINITION:
          {
            let func = this.functions.get(value);

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
            let func = this.functions.get(value);
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

          case Script.LITERAL:
            js += `${this.literals.get(value)} `;
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
  Script.VARIABLE_DEFINITION = i++;
  Script.VARIABLE_REFERENCE  = i++;
  Script.FUNCTION_DEFINITION = i++;
  Script.FUNCTION_REFERENCE  = i++;
  Script.ARGUMENT_HINT       = i++;
  Script.SYMBOL              = i++;
  Script.KEYWORD             = i++;
  Script.LITERAL             = i++;
}

Script.RESPONSE = {};
Script.RESPONSE.NO_CHANGE      = 0;
Script.RESPONSE.ROW_UPDATED    = 1;
Script.RESPONSE.ROW_DELETED    = 2;
Script.RESPONSE.ROWS_INSERTED  = 4;
Script.RESPONSE.SCRIPT_CHANGED = 8;