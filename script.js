class Script {
  constructor() {
    this.projectID = localStorage.getItem(ACTIVE_PROJECT_KEY) | 0;
    this.queuedDBwrites = {scope: new Set(), actions: []};

    const parent = this;
    class MetadataContainer {
      constructor(storeName, initialData, mask) {
        this.storeName = storeName;
        this.data = initialData.data;
        this.builtinCount = initialData.data.length;
        this.builtins = initialData.builtinNameMapping;
        this.mask = mask;
        this.gaps = [];
        this.dbMap = new Map();
      }

      delete(id) {
        //console.log(this.storeName, "delete", id);
        if (this.isUserDefined(id)) {
          this.data[id + this.builtinCount] = undefined;
          this.gaps.push(id);
          this.gaps.sort();
          parent.modifyObjStore(this.storeName, IDBObjectStore.prototype.delete, id);
        }
      }
    
      get(id) {
        if (id === undefined) {
          throw "cannot find property " + this.storeName + "[undefined]";
        }
        const index = (id + this.builtinCount) & this.mask;
        const output = this.data[index];

        if (output === undefined) {
          return {name: "id " + id};
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


    const {types, variables, functions, symbols, keywords} = new BuiltIns();
    this.symbols = symbols;
    this.keywords = keywords;

    const makeKeyword = text =>
      Script.makeItem({format: Script.KEYWORD, value: this.keywords.findIndex(element => element.name === text)});

    const makeSymbol = text =>
      Script.makeItem({format: Script.SYMBOL, value: this.symbols.findIndex(sym => sym.appearance === text)});

    const literals = {data: [], builtinNameMapping: {}};
    const makeLiteral = (text, type) => {
      literals.data.unshift(text);
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
    this.ITEMS.ELSE     = makeKeyword("else");
    this.ITEMS.FOR      = makeKeyword("for");
    this.ITEMS.IN       = makeKeyword("in");
    this.ITEMS.WHILE    = makeKeyword("while");
    this.ITEMS.DO_WHILE = makeKeyword("do while");
    this.ITEMS.RETURN   = makeKeyword("return");
    this.toggles = [this.ITEMS.VAR, this.ITEMS.LET, this.ITEMS.WHILE, this.ITEMS.DO_WHILE, makeKeyword("continue"), makeKeyword("break")];

    this.ITEMS.EQUALS              = makeSymbol("=");
    this.ITEMS.START_SUBEXPRESSION = makeSymbol("(");
    this.ITEMS.START_ARGUMENTS     = this.ITEMS.START_SUBEXPRESSION + 1;
    this.ITEMS.END_SUBEXPRESSION   = makeSymbol(")");
    this.ITEMS.END_ARGUMENTS       = this.ITEMS.END_SUBEXPRESSION + 1;
    this.ITEMS.COMMA               = makeSymbol(",");
    this.ITEMS.UNDERSCORE          = makeSymbol("____");

    this.ITEMS.FALSE = makeLiteral("false", 0);
    this.ITEMS.TRUE  = makeLiteral("true", 0);

    this.vars = new MetadataContainer("variables", variables, 0xFFFF);
    this.funcs = new MetadataContainer("functions", functions, 0xFFFF);
    this.types = new MetadataContainer("classes", types, 0x3FF);
    this.literals = new MetadataContainer("literals", literals, 0xFFFF);
    
    this.funcs.findOverloadId = function(funcId, ...argumentTypes) {
      const {name, scope} = parent.funcs.get(funcId);
      const index = this.data.findIndex(func => {
        return func.scope === scope
               && func.name === name
               && func.parameters.length === argumentTypes.length
               && func.parameters.every((param, index) => {
                 return param.type === argumentTypes[index];
               });
      });
      
      if (index === -1) {
        return undefined;
      } else {
        return index - this.builtinCount;
      }
    }

    this.lines = [];
    this.lineKeys = [];

    performActionOnProjectListDatabase("readonly", (objStore, transaction) => {
      objStore.get(this.projectID).onsuccess = (event) => {
        if (!event.target.result) {
          console.log("The previously opened project no longer exists");
          this.projectID = 0;
          localStorage.removeItem(ACTIVE_PROJECT_KEY);
          parent.assembleMetadata();
        } else {
          let remainingStores = {count: 6};
          let actions = [];

          for (const container of [this.vars, this.funcs, this.types, this.literals]) {
            actions.push({storeName: container.storeName, arguments: [container, remainingStores], function: function(container, remainingStores) {
              this.openCursor().onsuccess = function(event) {
                let cursor = event.target.result;
                if (cursor) {
                  container.dbMap.set(cursor.key, cursor.value);
                  cursor.continue();
                } else if (--remainingStores.count === 0) {
                  parent.assembleMetadata();
                }
              };
            }});
          }

          actions.push({storeName: "lines", arguments: [this, remainingStores], function: function(script, remainingStores) {
            this.getAllKeys().onsuccess = function(event) {
              script.lineKeys = event.target.result;
              if (--remainingStores.count === 0) {
                script.assembleMetadata();
              }
            };

            this.getAll().onsuccess = function(event) {
              script.lines = event.target.result;
              if (--remainingStores.count === 0) {
                script.assembleMetadata();
              }
            };
          }});

          this.performTransaction(new Set(["variables", "functions", "classes", "literals", "lines"]), "readonly", actions);
        }
      }
    });

    let payloads = Script.makeItem({value: -1});
    this.PAYLOADS = {};
    this.PAYLOADS.VAR_OPTIONS = payloads--;
    this.PAYLOADS.FUNCTIONS = payloads--;
    this.PAYLOADS.FUNCTIONS_WITH_RETURN = payloads--;
    this.PAYLOADS.LITERAL_INPUT = payloads--;
    this.PAYLOADS.RENAME = payloads--;
    this.PAYLOADS.WRAP_IN_PARENTHESIS = payloads--;
    this.PAYLOADS.DELETE_ITEM = payloads--;
    this.PAYLOADS.UNWRAP_PARENTHESIS = payloads--;
    this.PAYLOADS.APPEND_IF = payloads--;
    this.PAYLOADS.INSERT_ELSE = payloads--;
    this.PAYLOADS.ELSE_IF = payloads--;
    this.PAYLOADS.TYPED_VARIABLE_DEFINITION = payloads--;
    this.PAYLOADS.FUNCTION_DEFINITION = payloads--;
    this.PAYLOADS.APPEND_PARAMETER = payloads--;
    this.PAYLOADS.CHANGE_TYPE = payloads--;
    this.PAYLOADS.ASSIGN_VALUE = payloads--;
    this.PAYLOADS.DEFINE_ANOTHER_VAR = payloads--;
    this.PAYLOADS.APPEND_ARGUMENT = payloads--;


    class Operator {
      constructor(start, end) {
        this.start = Script.makeItem({format: Script.SYMBOL, value: start});
        this.end = Script.makeItem({format: Script.SYMBOL, value: end});
        this.postfix = "";
      }

      includes(item) {
        return item >= this.start && item < this.end;
      }

      *getMenuItems() {
        for (let payload = this.start; payload < this.end; ++payload) {
          yield {text: symbols[payload & 0xFFFF].appearance + this.postfix, style: "", payload};
        }
      }
    }

    this.ASSIGNMENT_OPERATORS = new Operator(0, 11);
    this.BINARY_OPERATORS = new Operator(11, 31);
    this.UNARY_OPERATORS = new Operator(33, 35);
    this.ARITHMETIC_OPERATORS = new Operator(11, 23);
    this.COMPARRISON_OPERATORS = new Operator(25, 31);
    this.START_BRACKETS = new Operator(38, 40);
    this.END_BRACKETS = new Operator(40, 42);
    this.OPERATORS = new Operator(0, 35);

    this.UNARY_OPERATORS.postfix = " ____"
  }

  static makeItem({format = 0, flag = 0, flag2 = 0, meta = 0, value = 0}) {
    return (format & 0xF) << 28 | (flag & 1) << 27 | (flag2 & 1) << 26 | (meta & 0x3FF) << 16 | (value & 0xFFFF);
  }

  static getItemData(item) {
    return {format: item >>> 28, flag: item >>> 27 & 1, flag2: item >>> 26 & 1, meta: item >>> 16 & 0x3FF, value: item & 0xFFFF};
  }

  assembleMetadata() {
    function getAndRemove(container, id) {
      const entry = container.dbMap.get(id);
      container.dbMap.delete(id);
      const [name = id + " not found"] = [entry];

      return name;
    }

    for (const line of this.lines) {
      let func;
      for (const item of line) {
        const data = Script.getItemData(item);
        switch (data.format) {
          case Script.VARIABLE_DEFINITION: {
            const index = (data.value + this.vars.builtinCount) & this.vars.mask;
            const name = getAndRemove(this.vars, data.value);
            this.vars.data[index] = {name, type: data.meta, scope: this.types.builtins.void};
            if (func) {
              func.parameters.push(this.vars.data[index]);
            }
          }
          break;

          case Script.FUNCTION_DEFINITION: {
            const index = (data.value + this.funcs.builtinCount) & this.funcs.mask;
            const name = getAndRemove(this.funcs, data.value);
            this.funcs.data[index] = {name, returnType: data.meta, scope: this.types.builtins.void, parameters: []};
            func = this.funcs.data[index];
          }
          break;

          case Script.LITERAL:
            const index = (data.value + this.literals.builtinCount) & this.literals.mask;
            const name = getAndRemove(this.literals, data.value);
            this.literals.data[index] = name;
          break;
        }
      }
    }

    for (const container of [this.vars, this.funcs, this.types, this.literals]) {
      for (let index = container.builtinCount; index < container.data.length; ++index) {
        if (container.data[index] === undefined) {
          const id = (index - container.builtinCount) & container.mask;
          container.gaps.push(id);
        }
      }

      for (const [id, name] of container.dbMap) {
        console.log(`removing ${container.storeName}[${id}] === ${name}`);
        this.modifyObjStore(container.storeName, IDBObjectStore.prototype.delete, id);
      }

      delete container.dbMap;

      if (container.gaps.length) {
        console.log(container.storeName, "has gaps", container.gaps);
      }
    }

    scriptLoaded();
  }

  itemClicked(row, col) {
    if (col === 0) {
      let options = this.appendClicked(row);
      if (options) {
        if (row < this.getRowCount())
          options.unshift({text: "", style: "delete", payload: this.PAYLOADS.DELETE_ITEM});
        return options;
      }
      
      col = this.getItemCount(row);

      if (this.getItem(row, col - 1) === this.ITEMS.UNDERSCORE) {
        --col;
      }
    }

    const [item = 0xFFFFFFFF] = [this.getItem(row, col)];
    const data = Script.getItemData(item);

    if (data.format === Script.KEYWORD) {
      if (item !== this.ITEMS.VAR || this.getItem(row, 3) === this.ITEMS.EQUALS) {
        const i = this.toggles.indexOf(item);
        if (i !== -1) {
          const replacement = Script.getItemData(this.toggles[i ^ 1]).value;
          const newKeyword = this.keywords[replacement].name;
          return [
            {text: "", style: "delete", payload: this.PAYLOADS.DELETE_ITEM},
            {text: newKeyword, style: "keyword", payload: Script.makeItem({format: 15, value: replacement})}
          ];
        }
      }
    }

    if (col === 2 && this.ASSIGNMENT_OPERATORS.includes(item)) {
      return this.ASSIGNMENT_OPERATORS.getMenuItems();
    }

    let options = [{text: "", style: "delete", payload: this.PAYLOADS.DELETE_ITEM}];

    if (((data.format === Script.VARIABLE_REFERENCE || data.format === Script.VARIABLE_DEFINITION) && this.vars.isUserDefined(data.value))
    || ((data.format === Script.FUNCTION_REFERENCE || data.format === Script.FUNCTION_DEFINITION) && this.funcs.isUserDefined(data.value))) {
      options.push({text: "", style: "rename", payload: this.PAYLOADS.RENAME});
    }

    if (col === 1) {
      if (data.format === Script.VARIABLE_REFERENCE)
        options.push(...this.getVisibleVariables(row, true));
      else if (data.format === Script.FUNCTION_REFERENCE) {
        options.push(...this.getFunctionList(false));
      }
      else if (item === this.ITEMS.IF) {
        const indentation = this.getIndentation(row);
        for (let r = row - 1; r >= 0; --r) {
          if (this.getIndentation(r) < indentation)
            break;

          if (this.getItemCount(r) !== 1) {
            if (this.getItem(r, 1) === this.ITEMS.IF
            || this.getItem(r, 2) === this.ITEMS.IF) {
              options.push({text: "else", style: "keyword", payload: this.PAYLOADS.INSERT_ELSE});
              break;
            }
          }
        }
      }
    } else {
      if (item === this.ITEMS.START_SUBEXPRESSION
      || item === this.ITEMS.END_SUBEXPRESSION) {
        options.push({text: "", style: "delete-outline", payload: this.PAYLOADS.UNWRAP_PARENTHESIS});
      }

      if (this.getItem(row, col + 1) === this.ITEMS.END_ARGUMENTS || this.getItem(row, col + 1) === this.ITEMS.COMMA) {
        options.push({text: ",", payload: this.PAYLOADS.APPEND_ARGUMENT});
      }

      if (data.format === Script.FUNCTION_REFERENCE
      || item === this.ITEMS.START_SUBEXPRESSION
      || item === this.ITEMS.START_ARGUMENTS)
        options.push( {text: "( )", style: "", payload: this.PAYLOADS.WRAP_IN_PARENTHESIS} );

      if (data.format === Script.FUNCTION_DEFINITION) {
        options.push({text: "void", style: "comment", payload: Script.makeItem({meta: this.types.builtins.void, value: this.PAYLOADS.CHANGE_TYPE})});
        options.push(...this.getSizedClasses(0, this.PAYLOADS.CHANGE_TYPE));
      }

      if (data.format === Script.VARIABLE_DEFINITION) {
        if (this.getItem(row, 3) === this.ITEMS.EQUALS) {
          options.push({text: "auto", style: "comment", payload: Script.makeItem({meta: this.types.builtins.void, value: this.PAYLOADS.CHANGE_TYPE})});
        }

        options.push(...this.getSizedClasses(1, this.PAYLOADS.CHANGE_TYPE));
      }

      const prevItem = this.getItem(row, col - 1);
      const prevData = Script.getItemData(prevItem);

      if (item !== this.ITEMS.END_SUBEXPRESSION
      && item !== this.ITEMS.END_ARGUMENTS
      && (this.OPERATORS.includes(prevItem)
      || prevItem === this.ITEMS.WHILE
      || prevItem === this.ITEMS.DO_WHILE
      || prevItem === this.ITEMS.SWITCH
      || prevItem === this.ITEMS.CASE
      || prevItem === this.ITEMS.IF
      || prevItem === this.ITEMS.START_SUBEXPRESSION
      || prevItem === this.ITEMS.START_ARGUMENTS
      || prevItem === this.ITEMS.COMMA
      || prevItem === this.ITEMS.IN
      || (prevItem === this.ITEMS.RETURN && this.getReturnType(row) !== this.types.builtins.void))) {
        options.push( {text: "", style: "text-input", payload: this.PAYLOADS.LITERAL_INPUT} );
        options.push( {text: "f(x)", style: "function-definition", payload: this.PAYLOADS.FUNCTIONS_WITH_RETURN} );

        if (!this.UNARY_OPERATORS.includes(prevItem)) {
          options.push(...this.UNARY_OPERATORS.getMenuItems());
        }

        options.push(...this.getVisibleVariables(row, false));
      }

      if (data.format === Script.VARIABLE_REFERENCE
      || data.format === Script.LITERAL
      || item === this.ITEMS.END_SUBEXPRESSION
      || item === this.ITEMS.END_ARGUMENTS) {
        options.push( {text: "( )", style: "", payload: this.PAYLOADS.WRAP_IN_PARENTHESIS} );
        options.push(...this.ARITHMETIC_OPERATORS.getMenuItems());
        options.push(...this.COMPARRISON_OPERATORS.getMenuItems());
      }
      else if (prevData.format === Script.VARIABLE_REFERENCE
      || prevData.format === Script.LITERAL
      || prevItem === this.ITEMS.END_SUBEXPRESSION
      || prevItem === this.ITEMS.END_ARGUMENTS) {
        options.push(...this.ARITHMETIC_OPERATORS.getMenuItems());
        options.push(...this.COMPARRISON_OPERATORS.getMenuItems());
      }

      if (item !== this.ITEMS.IF && prevItem === this.ITEMS.ELSE) {
        options.push({text: "if", style: "keyword", payload: this.PAYLOADS.APPEND_IF});
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
          {text: "f(x)", style: "function-definition", payload: this.PAYLOADS.FUNCTIONS},
          {text: "print", style: "function-definition", payload: Script.makeItem({
            format: Script.FUNCTION_REFERENCE,
            meta: this.funcs.get(this.funcs.builtins.System_print).scope,
            value: this.funcs.builtins.System_print})
          },
          {text: "func", style: "keyword", payload: this.ITEMS.FUNC},
          {text: "let", style: "keyword", payload: this.ITEMS.LET},
          {text: "var", style: "keyword", payload: this.PAYLOADS.VAR_OPTIONS},
          {text: "if", style: "keyword", payload: this.ITEMS.IF}];

        for (let r = Math.min(rowCount, row) - 1; r >= 0; --r) {
          if (this.getIndentation(r) < indentation)
            break;
          
          if (this.getIndentation(r) === indentation && this.getItemCount(r) !== 1) {
            if (this.getItem(r, 1) === this.ITEMS.IF
            || this.getItem(r, 2) === this.ITEMS.IF) {
              let preceedsElse = false;
              for (let r = row + 1; r < rowCount; ++r) {
                if (this.getIndentation(r) < indentation)
                  break;

                if (this.getIndentation(r) === indentation && this.getItemCount(r) !== 1) {
                  if (this.getItem(r, 1) === this.ITEMS.ELSE) {
                    preceedsElse = true;
                  }
                  break;
                }
              }

              if (preceedsElse) {
                return [{text: "else if", style: "keyword", payload: this.PAYLOADS.ELSE_IF}];
              } else {
                options.push({text: "else", style: "keyword", payload: this.ITEMS.ELSE});
                break;
              }
            }
            break;
          }
        }

        options.push(
          {text: "for", style: "keyword", payload: this.ITEMS.FOR},
          {text: "while", style: "keyword", payload: this.ITEMS.WHILE},
          {text: "switch", style: "keyword", payload: this.ITEMS.SWITCH},
          {text: "return", style: "keyword", payload: this.ITEMS.RETURN}
        );

        options.push(...this.getVisibleVariables(Math.min(this.getRowCount(), row), true));
      }

      return options;
    }

    if (this.getItem(row, 1) === this.ITEMS.VAR) {
      const previousType = this.getData(row, itemCount - 1).meta;
      const ditto = {text: "ditto", style: "comment", payload: Script.makeItem({flag: 1, meta: previousType, value: this.PAYLOADS.DEFINE_ANOTHER_VAR})};

      if (itemCount === 3) {
        return [
          {text: "=", style: "", payload: this.PAYLOADS.ASSIGN_VALUE},
          ditto,
          ...this.getSizedClasses(1, this.PAYLOADS.DEFINE_ANOTHER_VAR)
        ];
      }

      if (this.getData(row, itemCount - 1).format === Script.VARIABLE_DEFINITION) {
        return [
          ditto,
          ...this.getSizedClasses(1, this.PAYLOADS.DEFINE_ANOTHER_VAR)
        ];
      }
    }

    if (this.getData(row, 1).format === Script.FUNCTION_REFERENCE) {
      return null;
    }

    if (this.getItem(row, 1) === this.ITEMS.FUNC) {
      return this.getSizedClasses(0, this.PAYLOADS.APPEND_PARAMETER);
    }

    return null;
  }

  //0 -> no change, 1 -> click item changed, 2-> row changed, 3 -> row(s) inserted
  menuItemClicked(row, col, payload) {
    let isAppending = false;

    if (row < this.getRowCount()) {
      const itemCount = this.getItemCount(row);
      if (col === 0) {
        isAppending = true;
        col = itemCount;
        if (this.getItem(row, col - 1) === this.ITEMS.UNDERSCORE) {
          --col;
        }
      } else if (col === itemCount - 1 && this.getItem(row, col) === this.ITEMS.UNDERSCORE) {
        isAppending = true;
      }
    }

    const payloadData = Script.getItemData(payload);

    //replacement rules
    if (payloadData.format === 15) {
      payloadData.format = Script.KEYWORD;
      this.setItem(row, col, Script.makeItem(payloadData));
      return {rowUpdated: true};
    }

    if (payloadData.format === Script.VARIABLE_REFERENCE) {
      this.appendRowsUpTo(row);
      if (this.getItemCount(row) === 1) {
        this.pushItems(row, payload, this.ITEMS.EQUALS);
        return {rowUpdated: true, rowsInserted: 1};
      } else {
        const [start, end] = this.getExpressionBounds(row, col);
        this.spliceRow(row, start, end - start + 1, payload);
        return {rowUpdated: true, selectedCol: isAppending ? 0 : start};
      }
    }

    if (payloadData.format === Script.FUNCTION_REFERENCE) {
      const func = this.funcs.get(payloadData.value);
      let replacementItems = [payload];

      for (let i = 0; i < func.parameters.length; ++i) {
        replacementItems.push(this.ITEMS.COMMA);
        replacementItems.push(Script.makeItem({format: Script.ARGUMENT_HINT, meta: i, value: payloadData.value}));
      }

      replacementItems[1] = this.ITEMS.START_ARGUMENTS;
      replacementItems.push(this.ITEMS.END_ARGUMENTS);

      this.appendRowsUpTo(row);
      const oldItemCount = this.getItemCount(row);
      const [start, end] = col === 0 ? [1,1] : this.getExpressionBounds(row, col);
      this.spliceRow(row, start, end - start + 1, ...replacementItems);
      
      if (oldItemCount === 1)
        return {rowUpdated: true, rowsInserted: 1, selectedCol: start + 2};
      else
        return {rowUpdated: true, selectedCol: start + 2};
    }

    if (payloadData.format === Script.SYMBOL) {
      const item = this.getItem(row, col);
      if (this.OPERATORS.includes(item)) {
        this.setItem(row, col, payload);
        return {rowUpdated: true};
      } else {
        if (this.UNARY_OPERATORS.includes(payload)) {
          this.spliceRow(row, col, 0, payload);
          return {rowUpdated: true, selectedCol: isAppending ? 0 : col + 1};
        } else {
          if (col + 1 < this.getItemCount(row)) {
            this.spliceRow(row, col + 1, 0, payload, this.ITEMS.UNDERSCORE);
            return {rowUpdated: true, selectedCol: isAppending ? 0 : col + 2};
          } else {
            this.pushItems(row, payload);
            return {rowUpdated: true, selectedCol: 0};
          }
        }
      }
    }

    switch (payloadData.value) {
      case this.ITEMS.CASE & 0xFFFF:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        this.pushItems(row, payload, this.ITEMS.UNDERSCORE);
        return {rowUpdated: true, rowsInserted: 2, selectedCol: 2};

      case this.ITEMS.DEFAULT & 0xFFFF:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        this.pushItems(row, payload);
        return {rowUpdated: true, rowsInserted: 2, selectNextRow: true};
      
      case this.ITEMS.LET & 0xFFFF:
      case this.ITEMS.VAR & 0xFFFF: {
        const varId = this.vars.nextId();
        const name = prompt("Enter variable name:", `var${varId}`);
        if (name) {
          this.appendRowsUpTo(row);
          this.vars.set(varId, {name, type: this.types.builtins.void, scope: this.types.builtins.void});
          this.pushItems(row, payload, Script.makeItem({format: Script.VARIABLE_DEFINITION, meta: this.types.builtins.void, value: varId}), this.ITEMS.EQUALS);
          return {rowUpdated: true, rowsInserted: 1};
        } else {
          return {};
        }
      }

      case this.PAYLOADS.VAR_OPTIONS: {
        let options = [{text: "= expression", style: "comment", payload: this.ITEMS.VAR}];
        options.push(...this.getSizedClasses(0, this.PAYLOADS.TYPED_VARIABLE_DEFINITION));
        return options;
      }
      
      case this.ITEMS.IF & 0xFFFF:
      case this.ITEMS.WHILE & 0xFFFF:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        this.pushItems(row, payload, this.ITEMS.UNDERSCORE);
        return {rowUpdated: true, rowsInserted: 2, selectedCol: 2};
      
      case this.ITEMS.ELSE & 0xFFFF:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        this.pushItems(row, payload);
        return {rowUpdated: true, rowsInserted: 2};

      case this.PAYLOADS.ELSE_IF:
        this.setIsStartingScope(row, true);
        this.pushItems(row, this.ITEMS.ELSE, this.ITEMS.IF);
        return {rowUpdated: true, rowsInserted: 2};
      
      case this.PAYLOADS.APPEND_IF:
        this.pushItems(row, this.ITEMS.IF);
        return {rowUpdated: true};
      
      case this.PAYLOADS.INSERT_ELSE:
        this.spliceRow(row, col, 0, this.ITEMS.ELSE);
        return {rowUpdated: true};

      case this.ITEMS.FOR & 0xFFFF: {
        //TODO
        return {};
      }

      case this.ITEMS.SWITCH & 0xFFFF:
        this.appendRowsUpTo(row);
        this.setIsStartingScope(row, true);
        this.pushItems(row, payload, this.ITEMS.UNDERSCORE);
        return {rowUpdated: true, rowsInserted: 2, selectedCol: 2};
      
      case this.ITEMS.RETURN & 0xFFFF: {
        this.appendRowsUpTo(row);
        const returnType = this.getReturnType(row);

        if (returnType === this.types.builtins.void) {
          this.pushItems(row, payload);
          return {rowUpdated: true, selectedCol: 1};
        } else {
          this.pushItems(row, payload, this.ITEMS.UNDERSCORE);
          return {rowUpdated: true, selectedCol: 2};
        }
      }

      case this.ITEMS.FUNC & 0xFFFF: {
        let options = [{text: "none", style: "comment", payload: Script.makeItem({meta: this.types.builtins.void, value: this.PAYLOADS.FUNCTION_DEFINITION})}];
        options.push(...this.getSizedClasses(0, this.PAYLOADS.FUNCTION_DEFINITION));
        return options;
      }

      case this.PAYLOADS.ASSIGN_VALUE:
        this.pushItems(row, this.ITEMS.EQUALS);
        return {rowUpdated: true};

      case this.PAYLOADS.DEFINE_ANOTHER_VAR: {
        let varId = this.vars.nextId();
        const name = prompt("Enter variable name:", `var${varId}`);
        if (name) {
          let type = payloadData.meta;
          this.vars.set(varId, {name, type, scope: this.types.builtins.void});
          this.pushItems(row, Script.makeItem({format: Script.VARIABLE_DEFINITION, flag: 1, meta: type, value: varId}));
          return {rowUpdated: true};
        } else {
          return {};
        }
      }

      case this.PAYLOADS.APPEND_ARGUMENT: {
        if (this.getItem(row, col) !== this.ITEMS.END_ARGUMENTS) {
          ++col;
        }
        this.spliceRow(row, col, 0, this.ITEMS.COMMA, this.ITEMS.UNDERSCORE);
        return {rowUpdated: true, selectedCol: col + 1};
      }

      case this.PAYLOADS.LITERAL_INPUT: {
        let hint = "";

        const data = this.getData(row, col);
        if (data.format == Script.LITERAL) {
          hint = this.literals.get(data.value);

          if (data.meta === 1) {
            if (hint === "true" || hint === "false" || !isNaN(hint)) {
              hint = '"' + hint + '"';
            }
          }
        }

        let input = prompt("Enter a string, number, or boolean:", hint);
        if (input === null)
          return {};

        let payload;
        
        if (input.toLowerCase() === "true") {
          payload = this.ITEMS.TRUE;
        } else if (input.toLowerCase() === "false") {
          payload = this.ITEMS.FALSE;
        } else {
          const id = this.literals.nextId();

          if (input.trim().length !== 0 && !isNaN(input)) {
            input = input.trim();
            payload = Script.makeItem({format: Script.LITERAL, meta: 2, value: id});
          } else {
            if (input.startsWith('"'))
              input = input.substring(1);
            
            if (input.endsWith('"'))
              input = input.substring(0, input.length - 1);

            payload = Script.makeItem({format: Script.LITERAL, meta: 1, value: id});
          }
          
          this.literals.set(id, input);
        }

        const [start, end] = this.getExpressionBounds(row, col);
        this.spliceRow(row, start, end - start + 1, payload);
        return {rowUpdated: true, selectedCol: isAppending ? 0 : start};
      }

      case this.PAYLOADS.RENAME: {
        const data = this.getData(row, col);
        let container;

        switch (data.format) {
          case Script.VARIABLE_DEFINITION:
          case Script.VARIABLE_REFERENCE:
            container = this.vars;
            break;

          case Script.FUNCTION_DEFINITION:
          case Script.FUNCTION_REFERENCE:
            container = this.funcs;
            break;
        }

        let metadata = container.get(data.value);
        let input = prompt("Enter new name:", metadata.name);

        if (input) {
          metadata.name = input;
          container.set(data.value, metadata);
          return {scriptChanged: true};
        } else {
          return {};
        }
      }

      case this.PAYLOADS.DELETE_ITEM: {
        if (this.getItemCount(row) === 1) {
          return {rowDeleted: true};
        }

        if (isAppending) {
          col = row < this.getRowCount() ? this.getItemCount(row) - 1 : 0;
        }

        const item = this.getItem(row, col);
        const data = Script.getItemData(item);

        if ((col === 1 && item !== this.ITEMS.ELSE)
        || (col > 1 && data.format === Script.KEYWORD && item !== this.ITEMS.IF)
        || data.format === Script.FUNCTION_DEFINITION
        || this.ASSIGNMENT_OPERATORS.includes(item)
        || (data.format === Script.VARIABLE_DEFINITION && this.ASSIGNMENT_OPERATORS.includes(this.getItem(row, col + 1)))) {
          this.spliceRow(row, 1, this.getItemCount(row) - 1);
          const oldRowCount = this.getRowCount();
          this.deleteRow(row, true);

          return this.getRowCount() === oldRowCount ? {rowUpdated: true, selectedCol: 0} : {scriptChanged: true};
        }

        if (this.UNARY_OPERATORS.includes(item)
        || (col === this.getItemCount(row) - 1 && item === this.ITEMS.UNDERSCORE)
        || data.format === Script.VARIABLE_DEFINITION) {
          this.spliceRow(row, col, 1);
          return {rowUpdated: true, selectedCol: isAppending ? 0 : col - 1};
        }
        else if (this.BINARY_OPERATORS.includes(item)) {
          this.spliceRow(row, col, 2);
          return {rowUpdated: true, selectedCol: isAppending ? 0 : col - 1};
        }
        else if (item === this.ITEMS.UNDERSCORE) {
          if (this.BINARY_OPERATORS.includes(this.getItem(row, col - 1))) {
            this.spliceRow(row, col - 1, 2);
            return {rowUpdated: true, selectedCol: col - 2};
          } else if (this.UNARY_OPERATORS.includes(this.getItem(row, col - 1))) {
            this.spliceRow(row, col - 1, 1);
            return {rowUpdated: true, selectedCol: col - 1};
          }
        }
        else if (item === this.ITEMS.IF) {
          this.spliceRow(row, col, this.getItemCount(row) - col);
          return {rowUpdated: true, selectedCol: 0};
        }
        else {
          const [start, end] = this.getExpressionBounds(row, col);

          //assumes any selection that reaches the first item spans the whole line
          if (start === 1) {
            if (this.getIndentation(row) === 0 && row + 1 === this.getRowCount()) {
              return {rowDeleted: true};
            } else {
              this.spliceRow(row, start, end - start + 1);
            }
          } else {
            let paramIndex = 0;
            let funcID = -1;

            const nextItem = this.getItem(row, end + 1);
            const prevItem = this.getItem(row, start - 1);
            if ((nextItem === this.ITEMS.COMMA || nextItem === this.ITEMS.END_ARGUMENTS)
            && (prevItem === this.ITEMS.COMMA || prevItem === this.ITEMS.START_ARGUMENTS)) {
              for (let c = start - 1; c > 0; --c) {
                const data = this.getData(row, c);
                if (data.format === Script.FUNCTION_REFERENCE) {
                  funcID = data.value;
                  break;
                }
  
                if (this.getItem(row, c) === this.ITEMS.COMMA) {
                  ++paramIndex;
                }
              }
            }

            if (funcID > -1) {
              if (funcID === this.funcs.builtins.System_print) {
                paramIndex = 0;
              }
              this.spliceRow(row, start, end - start + 1, Script.makeItem({format: Script.ARGUMENT_HINT, meta: paramIndex, value: funcID}));
            } else {
              if (end + 1 === this.getItemCount(row)) {
                this.spliceRow(row, start, end - start + 1);
                return {rowUpdated: true, selectedCol: 0};
              } else {
                this.spliceRow(row, start, end - start + 1, this.ITEMS.UNDERSCORE);
              }
            }
          }
          return {rowUpdated: true, selectedCol: isAppending ? 0 : start};
        }
      }

      case this.PAYLOADS.UNWRAP_PARENTHESIS: {
        const [start, end] = this.getExpressionBounds(row, col);
        let removeFromBeginning = 1;
        if (this.UNARY_OPERATORS.includes(this.getItem(row, start)))
          ++removeFromBeginning;
        
        this.spliceRow(row, end, 1);
        this.spliceRow(row, start, removeFromBeginning);
        return {rowUpdated: true, selectedCol: col === start ? col : col - 2};
      }

      case this.PAYLOADS.FUNCTIONS:
        return this.getFunctionList(false);

      case this.PAYLOADS.FUNCTIONS_WITH_RETURN:
        return this.getFunctionList(true);

      case this.PAYLOADS.WRAP_IN_PARENTHESIS: {
        const [start, end] = this.getExpressionBounds(row, col);
        this.spliceRow(row, end + 1, 0, this.ITEMS.END_SUBEXPRESSION);
        this.spliceRow(row, start, 0, this.ITEMS.START_SUBEXPRESSION);
        return {rowUpdated: true, selectedCol: col + 1};
      }

      case this.PAYLOADS.TYPED_VARIABLE_DEFINITION: {
        const varId = this.vars.nextId();
        const name = prompt("Enter variable name:", `var${varId}`);

        if (name) {
          const type = payloadData.meta;
          this.appendRowsUpTo(row);
          this.vars.set(varId, {name, type, flag: 1, scope: this.types.builtins.void});
          this.pushItems(row, this.ITEMS.VAR, Script.makeItem({format: Script.VARIABLE_DEFINITION, flag: 1, meta: type, value: varId}));

          return {rowUpdated: true, rowsInserted: 1};
        } else {
          return {};
        }
      }

      case this.PAYLOADS.FUNCTION_DEFINITION: {
        let funcId = this.funcs.nextId();
        const name = prompt(`Enter function name`, `f${funcId}`);

        if (name) {
          const returnType = payloadData.meta;
          this.funcs.set(funcId, {name, returnType, scope: this.types.builtins.void, parameters: []});
          this.appendRowsUpTo(row);
          this.setIsStartingScope(row, true);
          this.pushItems(row, this.ITEMS.FUNC, Script.makeItem({format: Script.FUNCTION_DEFINITION, meta: returnType, value: funcId}));

          return {rowUpdated: true, rowsInserted: 2};
        } else {
          return {};
        }
      }

      case this.PAYLOADS.APPEND_PARAMETER: {
        let varId = this.vars.nextId();
        let type = payloadData.meta;
        const name = prompt(`Enter name for ${this.types.get(type).name} parameter:`, `var${varId}`);
  
        if (name) {
          const varMeta = {name, type, scope: this.types.builtins.void};
          this.vars.set(varId, varMeta);
          this.pushItems(row, Script.makeItem({format: Script.VARIABLE_DEFINITION, flag: 1, meta: type, value: varId}));
          const funcId = this.getData(row, 2).value;
          const func = this.funcs.get(funcId);
          func.parameters.push(varMeta)

          return {rowUpdated: true};
        } else {
          return {};
        }
      }

      case this.PAYLOADS.CHANGE_TYPE: {
        const {format, value} = this.getData(row, col);
        const {flag, meta} = payloadData;
        const newItem = Script.makeItem({format, flag, meta, value});
        this.setItem(row, col, newItem, true);

        if (format === Script.FUNCTION_DEFINITION) {
          const func = this.funcs.get(value);
          func.returnType = payloadData.meta;
          this.funcs.set(value, func);
        } else {
          const v = this.vars.get(value);
          v.type = payloadData.meta;
          this.vars.set(value, v);
        }

        return {rowUpdated: true};
      }

      default:
        return {};
    }
  }

  getReturnType(row) {
    for (let r = row - 1; r >= 0; --r) {
      if (this.getItem(r, 1) === this.ITEMS.FUNC) {
        return this.getData(r, 2).meta;
      }
    }

    return this.types.builtins.void;
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
              const v = this.vars.get(varId);
              options.push({text: v.name, style: "declaration", payload: Script.makeItem({format: Script.VARIABLE_REFERENCE, meta: v.scope, value: varId})});
            }
          }
        }
      }
    }

    if (!requiresMutable) {
      for (let i = -this.vars.builtinCount; i <= -1; ++i) {
        const v = this.vars.get(i);
        options.push({text: v.name, style: "declaration", payload: Script.makeItem({format: Script.VARIABLE_REFERENCE, meta: v.scope, value: i})});
      }
    }

    options.sort((a, b) => a.text.localeCompare(b.text));
    return options;
  }

  getFunctionList(requireReturn) {
    let options = [];

    for (const id of this.funcs.getIDs()) {
      let func = this.funcs.get(id);
      if (!requireReturn || func.returnType !== this.types.builtins.void) {
        options.push({text: func.name, style: "function-definition", payload: Script.makeItem({format: Script.FUNCTION_REFERENCE, meta: func.scope, value: id})});
      }
    }

    options.sort((a, b) => a.text.localeCompare(b.text));
    return options;
  }

  getSizedClasses(flag, value) {
    const options = [];

    for (const id of this.types.getIDs()) {
      const c = this.types.get(id);
      if (c.size > 0)
        options.push({text: c.name, style: "keyword", payload: Script.makeItem({flag, meta: id, value})});
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

    if (this.getData(row, col).format === Script.FUNCTION_REFERENCE) {
      ++end;
    }

    let step = 0;
    let symbol = this.getItem(row, end);
    let matchingSymbol = symbol;

    if (this.START_BRACKETS.includes(symbol)) {
      step = 1;
      matchingSymbol = symbol + 5;
    } else if (this.END_BRACKETS.includes(symbol)) {
      step = -1;
      matchingSymbol = symbol - 5;
    }

    if (step !== 0) {
      let matchingIndex = end;
      let depth = 0;
      while (matchingIndex > 1 && matchingIndex < this.getItemCount(row)) {
        if (this.getItem(row, matchingIndex) === symbol) {
          ++depth;
        }

        if (this.getItem(row, matchingIndex) === matchingSymbol) {
          --depth;
          if (depth === 0)
            break;
        }

        matchingIndex += step;
      }

      if (step < 0) {
        start = matchingIndex;
      } else {
        end = matchingIndex;
      }
    }

    if (this.getData(row, start - 1).format === Script.FUNCTION_REFERENCE)
      --start;

    return [start, end];
  }

  appendRowsUpTo(row) {
    let oldLength = this.getRowCount();

    let key = this.lines.length === 0 ? new ArrayBuffer(1) : this.lineKeys[this.lines.length - 1];
    const header = Script.makeItem({format: 0xF});
    while (row >= this.getRowCount()) {
      key = Script.incrementKey(key);
      this.lines.push([header]);
      this.lineKeys.push(key);
    }

    this.saveRow(this.lines.slice(oldLength), this.lineKeys.slice(oldLength));
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
        const lowKey = this.lineKeys[this.lines.length - 1];
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
        const lowKey = (i > 0) ? this.lineKeys[i - 1] : new ArrayBuffer(1);
        const highKey = this.lineKeys[i];
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
    this.lines.splice(row, 0, [header]);
    this.lineKeys.splice(row, 0, key);
    this.saveRow([[header]], [key]);
    return row;
  }

  deleteRow(row, keepIfNotLastRow = false) {
    const indentation = this.getIndentation(row);
    let r = row;
    do {
      this.lines[r].forEach(this.recycleItem, this);
      ++r;
    } while (r < this.getRowCount() && this.getIndentation(r) > indentation);
    let count = r - row;

    //manage orphaned else and else if structures
    if (this.getItem(row, 1) === this.ITEMS.IF
    || this.getItem(row, 2) === this.ITEMS.IF) {
      while (r < this.getRowCount() && !this.isStartingScope(r)) {
        ++r;
      }
      if (r < this.getRowCount()) {
        if (this.getItem(row, 1) === this.ITEMS.IF) {
          if (this.getItem(r, 2) === this.ITEMS.IF) {
            this.spliceRow(r, 1, 1);
          }
          else if (this.getItem(r, 1) === this.ITEMS.ELSE) {
            this.spliceRow(r, 1, 1, this.ITEMS.IF, this.ITEMS.TRUE);
          }
        }
      }
    }

    //trim whitespace off the bottom of the script
    let startRow = row;
    if (row + count === this.getRowCount()) {
      while (startRow > 0 && this.getIndentation(startRow - 1) === 0 && this.getItemCount(startRow - 1) === 1) {
        --startRow;
      }
      count = r - startRow;
    }

    //if a scope starter is cleared, delete its body.  However, if the line and its body aren't at the end
    //of the script, clear the line but don't delete it.  Otherwise, one too many lines would be deleted
    if ((indentation > 0 || startRow + count !== this.getRowCount()) && keepIfNotLastRow) {
      this.setIsStartingScope(startRow, false);
      ++startRow;
      --count;
    }

    if (count > 0) {
      const keyRange = IDBKeyRange.bound(this.lineKeys[startRow], this.lineKeys[startRow + count - 1]);
      this.modifyObjStore("lines", IDBObjectStore.prototype.delete, keyRange);
  
      this.lines.splice(startRow, count);
      this.lineKeys.splice(startRow, count);
    }

    return startRow;
  }

  saveRow(lines, lineKeys) {
    this.modifyObjStore("lines", function(lines, lineKeys) {
      for (let i = 0; i < lineKeys.length; ++i) {
        this.put(lines[i], lineKeys[i]);
      }
    }, lines, lineKeys);
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
    return this.lines[row].length;
  }

  /**
   * Check the item for variable, function, class, or string resources to recycle before overwriting
   * @param {Number} oldItem item that is being discarded
   * @param {Number} newItem replacement item, if it exists
   */
  recycleItem(oldItem) {
    const oldData = Script.getItemData(oldItem);

    switch (oldData.format) {
      case Script.VARIABLE_DEFINITION:
        this.vars.delete(oldData.value);
      break;

      case Script.FUNCTION_DEFINITION:
        this.funcs.delete(oldData.value);
      break;
      
      case Script.LITERAL:
        this.literals.delete(oldData.value);
      break;
    }
  }

  getItem(row, col) {
    return this.lines[row][col];
  }

  getData(row, col) {
    return Script.getItemData(this.getItem(row, col));
  }

  setItem(row, col, val, skipRecycling = false) {
    if (!skipRecycling) {
      this.recycleItem(this.lines[row][col]);
    }
    this.lines[row][col] = val;
    this.saveRow([this.lines[row]], [this.lineKeys[row]]);
  }

  spliceRow(row, col, count, ...items) {
    this.lines[row].splice(col, count, ...items).forEach(this.recycleItem, this);
    this.saveRow([this.lines[row]], [this.lineKeys[row]]);
  }

  pushItems(row, ...items) {
    this.lines[row].push(...items);
    this.saveRow([this.lines[row]], [this.lineKeys[row]]);
  }

  findItem(row, item) {
    return this.lines[row].indexOf(item);
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
    this.setItem(row, 0, item, true);
  }

  getItemDisplay(row, col) {
    const {format, flag, meta, value} = this.getData(row, col);

    switch (format) {
      case Script.VARIABLE_DEFINITION:
      {
        let name = this.vars.get(value).name;
        if (false)//!flag)
          return [name, "declaration"];
        else
          return [this.types.get(meta).name + '\n' + name, "keyword-declaration"];
      }

      case Script.VARIABLE_REFERENCE:
      {
        let name = this.vars.get(value).name;
        if (meta === this.types.builtins.void)
          return [name, ""];
        else
          return [this.types.get(meta).name + '\n' + name, "keyword"];
      }

      case Script.FUNCTION_DEFINITION:
        if (meta === this.types.builtins.void)
          return [this.funcs.get(value).name, "function-definition"];
        else
          return [this.types.get(meta).name + '\n' + this.funcs.get(value).name, "keyword-def"];

      case Script.FUNCTION_REFERENCE:
        if (meta === this.types.builtins.void)
          return [this.funcs.get(value).name, "function-call"];
        else
          return [this.types.get(meta).name + '\n' + this.funcs.get(value).name, "keyword-call"];

      case Script.ARGUMENT_HINT:
        return [this.funcs.get(value).parameters[meta].name, "comment"];

      case Script.SYMBOL:
        return [this.symbols[value].appearance, ""];

      case Script.KEYWORD:
        return [this.keywords[value].name, "keyword"];

      case Script.LITERAL: {
        if (meta === 1)
        return [`"${this.literals.get(value)}"`, "string-literal"];
        else
          return [this.literals.get(value), "literal"];
      }

      default:
        return [`format\n${format}`, "error"];
    }
  }

  performTransaction(scope, mode, actions) {
    let openRequest = indexedDB.open("TouchScript-" + this.projectID, 1);
  
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
            objStore.getAllKeys().onsuccess = (event) => {
              let id = 1;
              while (event.target.result[id - 1] === id) {
                ++id;
              }

              const now = new Date();
              const newProject = {id, name: `Project ${id}`, created: now, lastModified: now};
        
              objStore.put(newProject).onsuccess = (event) => {
                console.log("Successfully created new project listing.  ID is", event.target.result);
                this.projectID = event.target.result;
                localStorage.setItem(ACTIVE_PROJECT_KEY, event.target.result);

                function saveAllMetadata(container) {
                  for (let id = container.builtinCount; id < container.data.length; ++id) {
                    const meta = container.data[id];
                    if (meta) {
                      this.put(typeof meta === "string" ? meta : meta.name, id - container.builtinCount);
                    }
                  }
                };

                this.queuedDBwrites = {scope: new Set(), actions: []};

                for (let container of [this.vars, this.types, this.funcs, this.literals]) {
                  this.queuedDBwrites.scope.add(container.storeName);
                  this.queuedDBwrites.actions.push({storeName: container.storeName, arguments: [container], function: saveAllMetadata});
                }

                this.queuedDBwrites.scope.add("lines");
                this.queuedDBwrites.actions.push({storeName: "lines", arguments: [this.lines, this.lineKeys], function: function(lines, lineKeys) {
                  for (let i = 0; i < lines.length; ++i) {
                    this.put(lines[i], lineKeys[i]);
                  }
                }});

                this.performTransaction(this.queuedDBwrites.scope, "readwrite", this.queuedDBwrites.actions);
              }
            }
          }
        }
      });
    }
  }

  /*
  Generates a Wasm binary from the script contents
  */
  getWasm() {
    let typeSection = [
      ...Wasm.varuint(6), //count of type entries
    
      Wasm.types.func, //the form of the type
      0, //parameters
      0, //return count (0 or 1)
    
      Wasm.types.func,
      1, Wasm.types.i32,
      0,

      Wasm.types.func,
      1, Wasm.types.i64,
      0,
    
      Wasm.types.func,
      1, Wasm.types.f32,
      0,
    
      Wasm.types.func,
      1, Wasm.types.f64,
      0,

      Wasm.types.func,
      3, Wasm.types.f64, Wasm.types.f64, Wasm.types.f64,
      1, Wasm.types.f64,
    ];

    const importedFunctionsCount = 6;
    let importSection = [
      ...Wasm.varuint(importedFunctionsCount + 1), //count of things to import

      ...Wasm.getStringBytesAndData("js"),
      ...Wasm.getStringBytesAndData("memory"),
      Wasm.externalKind.Memory,
      0, //flag that max pages is not specified
      ...Wasm.varuint(1), //initially 1 page allocated

      ...Wasm.getStringBytesAndData("System"),
      ...Wasm.getStringBytesAndData("print"),
      Wasm.externalKind.Function, //import type
      ...Wasm.varuint(1), //type index (func signiture)

      ...Wasm.getStringBytesAndData("System"),
      ...Wasm.getStringBytesAndData("printU32"),
      Wasm.externalKind.Function,
      ...Wasm.varuint(1),

      ...Wasm.getStringBytesAndData("System"),
      ...Wasm.getStringBytesAndData("printI32"),
      Wasm.externalKind.Function,
      ...Wasm.varuint(1),

      ...Wasm.getStringBytesAndData("System"),
      ...Wasm.getStringBytesAndData("printF32"),
      Wasm.externalKind.Function,
      ...Wasm.varuint(3),

      ...Wasm.getStringBytesAndData("System"),
      ...Wasm.getStringBytesAndData("printF64"),
      Wasm.externalKind.Function,
      ...Wasm.varuint(4),

      ...Wasm.getStringBytesAndData("System"),
      ...Wasm.getStringBytesAndData("inputF64"),
      Wasm.externalKind.Function,
      ...Wasm.varuint(5),
    ];

    let functionSection = [
      ...Wasm.varuint(3), //count of function bodies defined later
      ...Wasm.varuint(0), //type indicies (func signitures)
      ...Wasm.varuint(2),
      ...Wasm.varuint(2),
    ];

    // let exportSection = [
    //   ...Wasm.varuint(0), //count of exports

    //   ...Wasm.getStringBytesAndData("init"), //length and bytes of function name
    //   Wasm.externalKind.Function, //export type
    //   ...Wasm.varuint(importedFunctionsCount), //exporting entry point function
    // ];
    
    const parent = this;
    class NumericLiteral {
      constructor(rawString) {
        this.value = +rawString;
        this.hasDecimalPoint = String(rawString).includes(".");
      }
      
      performUnaryOp(unaryOp) {
        switch (unaryOp) {
        case "!":
          this.value = ~this.value;
          break;
        case "-":
          this.value = -this.value;
          break;
        default:
          throw "unrecognized unary operator " + unaryOp;
        }
      }
      
      performBinaryOp(binOp, operand) {
        switch (binOp) {
          case "+":
            this.value += operand.value;
            break;
          case "-":
            this.value -= operand.value;
            break;
          case "*":
            this.value *= operand.value;
            break;
          case "/":
            this.value /= operand.value;
            break;
          case "%":
            this.value %= operand.value;
            break;
          case "|":
            this.value |= operand.value;
            break;
          case "^":
            this.value ^= operand.value;
            break;
          case "&":
            this.value &= operand.value;
            break;
          case "<<":
            this.value <<= operand.value;
            break;
          case ">>":
            this.value >>= operand.value;
            break;
          default:
            throw "unrecognized binary operator: " + binOp;
        }
        
        this.hasDecimalPoint = this.hasDecimalPoint || operand.hasDecimalPoint;
        if (!this.hasDecimalPoint) {
          this.value = Math.trunc(this.value);
        }
      }
      
      getWasmCode(expectedType) {
        const outputType = this.getType(expectedType);
        switch (outputType) {
          case parent.types.builtins.i32:
          case parent.types.builtins.u32:
            return [Wasm.opcodes.i32_const, ...Wasm.varint(this.value)];
          case parent.types.builtins.i64:
          case parent.types.builtins.u64:
            return [Wasm.opcodes.i64_const, ...Wasm.varint(this.value)];
          case parent.types.builtins.f32:
            return [Wasm.opcodes.f32_const, ...Wasm.f32ToBytes(this.value)];
          case parent.types.builtins.f64:
            return [Wasm.opcodes.f64_const, ...Wasm.f64ToBytes(this.value)];
          default:
            console.trace();
            throw "unrecognized type for numeric literal: " + parent.types.get(expectedType).name;
        }
      }

      getType(expectedType) {
        if (expectedType !== parent.types.builtins.Any) {
          return expectedType;
        }

        if (this.hasDecimalPoint) {
          return parent.types.builtins.f32;
        } else {
          return parent.types.builtins.i32;
        }
      }
    }
    
    class StringLiteral {
      constructor(address) {
        this.address = address;
      }
      
      getType() {
        return parent.types.builtins.string;
      }
      
      getWasmCode() {
        return [Wasm.opcodes.i32_const, ...Wasm.varint(this.address)];
      }
    }
    
    class LocalVarReference {
      constructor(index, variable) {
        this.index = index;
        this.variable = variable;
      }
      
      getType() {
        return this.variable.type;
      }
      
      getWasmCode() {
        return [Wasm.opcodes.get_local, ...Wasm.varuint(this.index)];
      }
    }
    
    class TypePlaceholder {
      constructor(type) {
        this.t = type;
      }
      
      getType() {
        return this.t;
      }
      
      getWasmCode() {
        return [];
      }
    }
    
    function compileExpression(expression, expectedType) {
      //constant folding pass
      look_for_next_operator:
      for (let i = 0; i < expression.length; ++i) {
        const operator = expression[i];
        if (operator.constructor === TSSymbol) {
          //make sure that this operator has a higher precedence than its neighbors
          for (let j = Math.max(0, i - 2); j < Math.min(expression.length, i + 3); ++j) {
            if (expression[j].constructor === TSSymbol) {
              if (expression[j].precedence > operator.precedence) {
                continue look_for_next_operator;
              }
            }
          }
          
          if (operator.isUnary && expression[i+1].constructor === NumericLiteral) {
            expression[i+1].performUnaryOp(operator.appearance);
            expression.splice(i, 1);
            i = Math.max(i - 2, 0);
          } else if (expression[i-1].constructor === NumericLiteral && expression[i+1].constructor === NumericLiteral) {
            expression[i-1].performBinaryOp(operator.appearance, expression[i+1]);
            expression.splice(i, 2);
            i = Math.max(i - 3, 0);
          }
        }
      }

      //code generation pass
      const operators = [];
      const operands = [];
      const wasmCode = [];

      expression.push(new TSSymbol("term", -1)); //terminate expression
      for (let i = 0; i < expression.length; ++i) {
        const item = expression[i];
        if (item.constructor === TSSymbol) {
          //check if the previous operators have a higher precedence than the one that is about to be pushed
          while (operators.length > 0 && operators[operators.length - 1].precedence >= item.precedence) {
            const operator = operators.pop();
            const rightOperand = operands.pop();
            let operationWasmCode;
            if (operator.isUnary) {
              operationWasmCode = operator.uses.get(rightOperand.getType());
              wasmCode.push(...rightOperand.getWasmCode());
            } else {
              const leftOperand = operands.pop();
              const type = rightOperand.getType(leftOperand.getType());
              operationWasmCode = operator.uses.get(type);
              wasmCode.push(...leftOperand.getWasmCode(type));
              wasmCode.push(...rightOperand.getWasmCode(type));
            }
            wasmCode.push(...operationWasmCode);
            operands.push(new TypePlaceholder(rightOperand.type));
          }
          
          operators.push(item);
        } else {
          operands.push(item);
        }
      }
      
      //console.log("remaining operands", ...operands, "remaining operators", ...operators)
      const expressionType = operands[0].getType(expectedType);
      wasmCode.push(...(operands.pop().getWasmCode(expectedType)));
      
      return [expressionType, wasmCode];
    }

    let initFunction = [];

    const functionsBeingCalled = [];
    const expression = [];
    const localVarMap = []; //maps local vars to varIDs
    let localVarLValue;
    const linearMemoryInitialValues = [];

    for (let row = 0, endRow = this.getRowCount(); row < endRow; ++row) {
      localVarLValue = -1;

      for (let col = 1, endCol = this.getItemCount(row); col < endCol; ++col) {
        const item = this.getItem(row, col);
        const {format, meta, value} = Script.getItemData(item);

        switch (format) {
          case Script.VARIABLE_DEFINITION:
            expression.push(new LocalVarReference(localVarMap.length, this.vars.get(value)));
            localVarMap.push({id: value, type: meta});
            break;
          
          case Script.VARIABLE_REFERENCE:
            const localIndex = localVarMap.findIndex(localVar => localVar.id === value);
            if (localIndex === -1) {
              throw "var" + value + " is referenced before it is declared";
            }
            
            expression.push(new LocalVarReference(localIndex, localVarMap[localIndex]));
            break;
          
          case Script.FUNCTION_REFERENCE:
            functionsBeingCalled.push(value);
            break;

          case Script.ARGUMENT_HINT: {
            const param = this.funcs.get(value).parameters[meta];
            if (param.type === this.types.builtins.string) {
              expression.push(new StringLiteral(param.default));
            } else {
              expression.push(new NumericLiteral(param.default));
            }
          } break;

          case Script.SYMBOL: {
            const funcId = functionsBeingCalled[functionsBeingCalled.length - 1];
            
            if (this.ASSIGNMENT_OPERATORS.includes(item)) {
              const localVar = expression.pop();
              localVarLValue = localVar.index;
              
              if (item !== this.ITEMS.EQUALS) {
                  //TODO insert a reference to the variable then the first part of the combined operator here
              }
            }

            let expressionType = this.types.builtins.void;
            if (item === this.ITEMS.COMMA || item === this.ITEMS.END_ARGUMENTS) {
              //find argument type
              let expectedType = this.types.builtins.Any;
              let funcCallDepth = 0;
              let argumentIndex = 0;
              for (let j = col - 1; j > 0; --j) {
                const item = this.getItem(row, j);
                if (item === this.ITEMS.END_ARGUMENTS) {
                  ++funcCallDepth;
                }
                if (item === this.ITEMS.COMMA && funcCallDepth === 0) {
                  ++argumentIndex;
                }
                if (item === this.ITEMS.START_ARGUMENTS) {
                  if (funcCallDepth === 0) {
                    const funcId = this.getData(row, j - 1).value;
                    const func = this.funcs.get(funcId);
                    if (funcId === this.funcs.builtins.System_print) {
                      argumentIndex = 0;
                    }
                    const argumentType = func.parameters[argumentIndex].type;
                    //console.log(expression, "is argument ", argumentIndex, "to ", func.name, "argument type is", this.types.get(argumentType).name);
                    expectedType = argumentType;
                    break;
                  }
                  
                  --funcCallDepth;
                }
              }
              
              let wasmCode;
              [expressionType, wasmCode] = compileExpression(expression, expectedType);
              expression.length = 0;
              initFunction.push(...wasmCode);
            }

            //print() takes an arbitrary count of Any arguments and overloads for each argument in order
            if ((item === this.ITEMS.COMMA || item === this.ITEMS.END_ARGUMENTS) && funcId == this.funcs.builtins.System_print) {
              const overload = this.funcs.findOverloadId(funcId, expressionType);
              if (overload === undefined) {
                throw `implementation of ${this.funcs.get(funcId).name}(${this.types.get(expressionType).name}) not found`;
              }
              const overloadedFunc = this.funcs.get(overload);
              initFunction.push(Wasm.opcodes.call, overloadedFunc.importedFuncIndex);
            }
            else if (item === this.ITEMS.END_ARGUMENTS) {
              const func = this.funcs.get(functionsBeingCalled.pop());
              initFunction.push(Wasm.opcodes.call, func.importedFuncIndex);
              if (func.returnType !== this.types.builtins.void) {
                expression.push(new TypePlaceholder(func.returnType));
              }
            }
            
            if (![this.ITEMS.COMMA, this.ITEMS.START_ARGUMENTS, this.ITEMS.END_ARGUMENTS].includes(item) && !this.ASSIGNMENT_OPERATORS.includes(item)) {
              expression.push(this.symbols[value]);
            }
          } break;

          case Script.LITERAL:
            if (meta === 1) { //string
              expression.push(new StringLiteral(linearMemoryInitialValues.length));

              const stringLiteral = this.literals.get(value).replace(/\\n/g, "\n");
              const bytes = Wasm.stringToUTF8(stringLiteral);
              linearMemoryInitialValues.push(...Wasm.varuint(bytes.length), ...bytes);
            } else if (meta === 2) { //number
              const literal = this.literals.get(value);
              expression.push(new NumericLiteral(literal));
            } break;
        }
      }

      //end of line delimits expression
      if (expression.length > 0) {
        let expectedType = this.types.builtins.void;

        if (localVarLValue !== -1) {
          expectedType = localVarMap[localVarLValue].type;
        }

        const [expressionType, wasmCode] = compileExpression(expression, expectedType);

        expression.length = 0;
        initFunction.push(...wasmCode);

        if (localVarLValue === -1) {
          initFunction.push(Wasm.opcodes.drop);
        } else {
          initFunction.push(Wasm.opcodes.set_local, localVarLValue);
        }
      }
    }

    const localVarDefinition = [
      ...Wasm.varuint(localVarMap.length), //count of local entries (count and type pairs, not total locals)
    ];

    //at the moment, I make no attempt to collapse repeating types into a single type description
    for (let local of localVarMap) {
      let type = 0;
      switch (local.type) {
        case this.types.builtins.i32:
        case this.types.builtins.u32:
          type = Wasm.types.i32;
          break;
        case this.types.builtins.i64:
        case this.types.builtins.u64:
          type = Wasm.types.i64;
          break;
        case this.types.builtins.f32:
          type = Wasm.types.f32;
          break;
        case this.types.builtins.f64:
          type = Wasm.types.f64;
          break;
        default:
          throw "cannot find Wasm type of " + this.types.get(local.type).name;
      }

      localVarDefinition.push(1, type);
    }

    initFunction = [...localVarDefinition, ...initFunction, Wasm.opcodes.end];

    const printU64 = [ // print(val: u64)
      1, 1, Wasm.types.i32,
      Wasm.opcodes.get_global, 0, //address = top of stack + 16
      Wasm.opcodes.i32_const, 16,
      Wasm.opcodes.i32_add,
      Wasm.opcodes.set_local, 1,

      Wasm.opcodes.loop, Wasm.types.void, //do
        Wasm.opcodes.get_local, 1, //address

        Wasm.opcodes.get_local, 0,
        Wasm.opcodes.i64_const, 10,
        Wasm.opcodes.i64_rem_u,
        Wasm.opcodes.i32_wrap_from_i64,
        Wasm.opcodes.i32_const, ...Wasm.varint('0'.charCodeAt(0)),
        Wasm.opcodes.i32_add, //value = val % 10 + '0'

        Wasm.opcodes.i32_store8, 0, 0, //store value at address

        Wasm.opcodes.get_local, 1, //address--
        Wasm.opcodes.i32_const, 1,
        Wasm.opcodes.i32_sub,
        Wasm.opcodes.set_local, 1,

        Wasm.opcodes.get_local, 0, //val /= 10
        Wasm.opcodes.i64_const, 10,
        Wasm.opcodes.i64_div_u,
        Wasm.opcodes.tee_local, 0,
        Wasm.opcodes.i64_const, 0,
        Wasm.opcodes.i64_gt_u,
      Wasm.opcodes.br_if, 0, //while val > 0
      Wasm.opcodes.end,

      Wasm.opcodes.get_local, 1, //address of string length

      Wasm.opcodes.i32_const, 16, //length = 16 - address + top of stack
      Wasm.opcodes.get_local, 1,
      Wasm.opcodes.i32_sub,
      Wasm.opcodes.get_global, 0,
      Wasm.opcodes.i32_add,

      Wasm.opcodes.i32_store8, 0, 0, //store length of string at address
      
      Wasm.opcodes.get_local, 1, //print string we just created
      Wasm.opcodes.call, 0,

      Wasm.opcodes.end,
    ];
    
    const printU64Id = this.funcs.get(this.funcs.findOverloadId(this.funcs.builtins.System_print, this.types.builtins.u64)).importedFuncIndex;
    const printString = this.funcs.get(this.funcs.findOverloadId(this.funcs.builtins.System_print, this.types.builtins.string)).importedFuncIndex;
    
    const printI64 = [ // print(val: i64)
      0,
      Wasm.opcodes.get_local, 0,
      Wasm.opcodes.i64_const, 0,
      Wasm.opcodes.i64_lt_s,
      Wasm.opcodes.if, Wasm.types.i64, //if val < 0
        Wasm.opcodes.i64_const, 0,
        Wasm.opcodes.get_local, 0,
        Wasm.opcodes.i64_sub, //val = -val
        Wasm.opcodes.get_global, 0, //print('-')
        Wasm.opcodes.i32_const, ...Wasm.varint(1 + '-'.charCodeAt() * 256),
        Wasm.opcodes.i32_store16, 0, 0,
        Wasm.opcodes.get_global, 0,
        Wasm.opcodes.call, printString,
      Wasm.opcodes.else,
        Wasm.opcodes.get_local, 0,
      Wasm.opcodes.end,
      
      Wasm.opcodes.call, printU64Id, //print(u64(abs(val)))
      Wasm.opcodes.end,
    ]


    let codeSection = [
      ...Wasm.varuint(3), //count of functions to define
      ...Wasm.varuint(initFunction.length),
      ...initFunction,
      ...Wasm.varuint(printU64.length),
      ...printU64,
      ...Wasm.varuint(printI64.length),
      ...printI64,
    ];

    let dataSection = [
      ...Wasm.varuint(1), //1 data segment

      0, //memory index 0
      Wasm.opcodes.i32_const, Wasm.varint(0), Wasm.opcodes.end, //place memory at address 0
      ...Wasm.varuint(linearMemoryInitialValues.length), //count of bytes to fill in
      ...linearMemoryInitialValues,
    ];

    const globalSection = [
      ...Wasm.varuint(1),
      Wasm.types.i32, 1,
      Wasm.opcodes.i32_const, ...Wasm.varuint(linearMemoryInitialValues.length),
      Wasm.opcodes.end,
    ];

    let wasm = [
      0x00, 0x61, 0x73, 0x6d, //magic numbers
      0x01, 0x00, 0x00, 0x00, //binary version
  
      Wasm.section.Type,
      ...Wasm.varuint(typeSection.length), //size in bytes of section
      ...typeSection,
  
      Wasm.section.Import,
      ...Wasm.varuint(importSection.length),
      ...importSection,
  
      Wasm.section.Function,
      ...Wasm.varuint(functionSection.length),
      ...functionSection,

      Wasm.section.Global,
      ...Wasm.varuint(globalSection.length),
      ...globalSection,
  
      // Wasm.section.Export,
      // ...Wasm.varuint(exportSection.length),
      // ...exportSection,

      Wasm.section.Start,
      [...Wasm.varuint(importedFunctionsCount)].length,
      ...Wasm.varuint(importedFunctionsCount), //the start function is the first function after the imports
  
      Wasm.section.Code,
      ...Wasm.varuint(codeSection.length),
      ...codeSection,

      Wasm.section.Data,
      ...Wasm.varuint(dataSection.length),
      ...dataSection,
    ];

    return (new Uint8Array(wasm)).buffer;
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