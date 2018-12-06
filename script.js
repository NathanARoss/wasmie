class Script {
  constructor() {
    this.projectID = localStorage.getItem(ACTIVE_PROJECT_KEY) | 0;
    this.queuedTransations = [];

    this.BuiltIns = new BuiltIns();

    this.lines = [];

    // performActionOnProjectListDatabase("readonly", (objStore, transaction) => {
    //   objStore.get(this.projectID).onsuccess = (event) => {
    //     if (!event.target.result) {
    //       console.log("The previously opened project no longer exists");
    //       localStorage.removeItem(ACTIVE_PROJECT_KEY);
    //     } else {
    //       let actions = [];

    //       actions = [{
    //         arguments: [this],
    //         function: function(script) {
    //           this.openCursor().onsuccess = function(event) {
    //             const cursor = event.target.result;
    //             if (cursor) {
    //               const lineData = cursor.value;
    //               const line = {
    //                 items: [],
    //                 key: cursor.key,
    //               };
    //               line.key = cursor.key;
    //               //script.lines.push(line);
    //             }
    //           }
    //         }
    //       }];

    //       this.performTransaction("readonly", actions);
    //     }
    //   }
    // });
    setTimeout(scriptLoaded, 1); //TODO load script
  }

  getItemDisplay(row, col) {
    const item = this.lines[row].items[col];
    if (item === undefined) {
      console.log("no item found at row ", row, " col ", col, this.lines[row]);
      console.trace();
    }
    return item.getDisplay();
  }

  itemClicked(row, col) {
    const deleteOption = {style: "delete", action: this.deleteItem, args: [row, col]};

    if (col < 0) {
      const options = this.appendClicked(row);
      if (options) {
        if (row < this.getRowCount()) {
          options.unshift(deleteOption);
        }
        return options;
      }
      col = this.getItemCount(row);
    }

    const options = [deleteOption];

    const item = this.getItem(row, col) || {};
    const nextItem = this.getItem(row, col + 1) || {};

    const replace = (col, item) => {
      this.setItem(row, col, item);
      return {rowUpdated: true};
    };

    const insert = (col, ...items) => {
      this.spliceRow(row, col, 0, ...items);
      return {rowUpdated: true, selectedCol: col + 1};
    };

    const setVarRef = (varDef) => {
      return replace(col, new VarRef(varDef, this.BuiltIns.VOID));
    };

    if (item.suggestion) {
      const isAssignment = this.getItem(row, 2) && this.getItem(row, 2).isAssignment;
      if (item !== this.BuiltIns.VAR || isAssignment) {
        const [text, style] = item.suggestion.getDisplay();
        options.push({text, style, action: replace, args: [col, item.suggestion]});
      }
    }

    if (col === 1 && item.isAssignment) {
      for (const op of this.BuiltIns.SYMBOLS.filter(sym => sym.isAssignment)) {
        const [text, style] = op.getDisplay();
        options.push({text, style, action: replace, args: [col, op]});
      }
    }

    if (item.isRange) {
      for (const op of this.BuiltIns.SYMBOLS.filter(sym => sym.isRange)) {
        const [text, style] = op.getDisplay();
        options.push({text, style, action: replace, args: [col, op]});
      }
      return options;
    }
    
    if (item.constructor === FuncSig || item.constructor === VarDef) {
      const style = (item.constructor === FuncSig) ? "funcdef" : "vardef";
      options.push({
        text: item.name, style, isInput: true, onsubmit: (text) => {
          item.name = text;
          return {scriptChanged: true};
        }
      });
    }

    if (col === 0) {
      if (item.constructor === VarRef) {
        options.push(...this.getVisibleVars(row, true, setVarRef));
      } else if (item.constructor === FuncRef) {
        //options.push(...this.getFunctionList(false));
      } else if (item === this.BuiltIns.IF) {
        const indentation = this.getIndentation(row);
        for (let r = row - 1; r >= 0; --r) {
          if (this.getIndentation(r) < indentation)
            break;

          if (this.getItem(r, 0) === this.BuiltIns.IF
          || this.getItem(r, 1) === this.BuiltIns.IF) {
            options.push({text: "else", style: "keyword",
              action: insert, args: [col, this.BuiltIns.ELSE]
            });
            break;
          }
        }
      }
    } else {
      if (item === this.BuiltIns.BEGIN_EXPRESSION
      || item === this.BuiltIns.END_EXPRESSION) {
        options.push({text: "", style: "delete-outline", action: () => {
          const [start, end] = this.getExpressionBounds(row, col);
          this.spliceRow(row, end, 1);
          this.spliceRow(row, start, 1);
          return {rowUpdated: true, selectedCol: col === start ? col : col - 2};
        }});
      }

      //allow the user to enter additional arguments for variadic functions
      if ([this.BuiltIns.ARG_SEPARATOR, this.BuiltIns.END_ARGS].includes(nextItem)) {
        //find signiture of function this argument belongs to
        let depth = 0;
        for (let i = col - 1; i >= 0; --i) {
          const item = this.getItem(row, i);
          if (item === this.BuiltIns.END_ARGS) {
            ++depth;
          } else if (item === this.BuiltIns.BEGIN_ARGS) {
            --depth;
            if (depth === -1) {
              const sig = this.getItem(row, i - 1).funcDef.signature;
              //TODO make sure function is actually variadic
              options.push({text: ",", action: insert,
                args: [col + 1, this.BuiltIns.ARG_SEPARATOR, new ArgHint(sig, 0)]
              });
            }
          }
        }
      }
      
      const wrapInParens = {
        text: "( )", action: () => {
        const [start, end] = this.getExpressionBounds(row, col);
        this.spliceRow(row, end + 1, 0, this.BuiltIns.END_EXPRESSION);
        this.spliceRow(row, start, 0, this.BuiltIns.BEGIN_EXPRESSION);
        return {rowUpdated: true, selectedCol: col + 1};
      }};

      if (item.constructor === FuncRef
      || item.direction === 1) {
        options.push(wrapInParens);
      }
      
      if (item.constructor === FuncSig) {
        const setReturnType = (item, type) => {
          item.returnType = type;
          return {rowUpdated: true};
        };
        
        options.push({text: "void", style: "comment",
          action: setReturnType, args: [item, this.BuiltIns.ANY]
        });
        
        options.push(...this.getSizedTypes(setReturnType, item));
      }

      if (item.constructor === VarDef) {
        const setType = (item, type) => {
          item.type = type;
          return {rowUpdated: true};
        }
        
        if (this.getItemCount(row) > 2 && this.getItem(row, 2).isAssignment) {
          options.push({text: "auto", style: "comment",
            action: setType, args: [item, this.BuiltIns.ANY]
          });
        }

        options.push(...this.getSizedTypes(setType, item));
      }

      const prevItem = this.getItem(row, col - 1);
      
      if (prevItem === this.BuiltIns.CONTINUE || prevItem === this.BuiltIns.BREAK) {
        //count the number of nested loops this statement is inside
        let loopStructureCount = 0;

        let indentation = this.getIndentation(row);
        for (let r = row - 1; r >= 0; --r) {
          const lineIndentation = this.getIndentation(r);
          if (lineIndentation < indentation) {
            indentation = lineIndentation;
            if (this.getItem(r, 0) === this.BuiltIns.WHILE
            || this.getItem(r, 0) === this.BuiltIns.DO_WHILE
            || this.getItem(r, 0) === this.BuiltIns.FOR) {
              ++loopStructureCount;
            }
          }
        }

        for (let layer = 2; layer <= loopStructureCount; ++layer) {
          const item = new LoopLabel(layer);
          const [text, style] = item.getDisplay();
          options.push({text, style,
            action: replace, args: [col, item]
          });
        }
      }

      if (prevItem.preceedsExpression
      || prevItem === this.BuiltIns.RETURN && this.getReturnType(row)) {
        if (!item.isUnary) {
          let text = "";
          let style = "";
          if ([NumericLiteral, BooleanLiteral].includes(item.constructor)) {
            [text, style] = item.getDisplay();
          }
          if (item.constructor === StringLiteral) {
            [text, style] = [item.text, "string literal"];
            if (text === "true" || text === "false" || !isNaN(text)) {
              text = '"' + text + '"';
            }
          }
          options.unshift(
            {text, isInput: true, style, hint: "literal", onsubmit: (text) => {
              let newItem;

              if (text.toLowerCase() === "true") {
                newItem = this.BuiltIns.TRUE;
              } else if (text.toLowerCase() === "false") {
                newItem = this.BuiltIns.FALSE;
              } else if (text.trim().length !== 0 && !isNaN(text)) {
                newItem = new NumericLiteral(text.trim());
              } else {
                if (text.startsWith('"'))
                  text = text.substring(1);
                
                if (text.endsWith('"'))
                  text = text.substring(0, text.length - 1);

                newItem = new StringLiteral(text);
              }

              this.setItem(row, col, newItem);
              return {rowUpdated: true, selectedCol: col + 1};
            }, oninput: (event) => {
              const inputNode = event.target;
              if (["true", "false"].includes(inputNode.value.toLowerCase())) {
                inputNode.classList = "menu-input keyword literal";
              } else if (!isNaN(inputNode.value)) {
                inputNode.classList = "menu-input number literal";
              } else {
                inputNode.classList = "menu-input string literal";
              }
            }},
          );
        }

        if (!prevItem.isUnary) {
          const action = (item.constructor === Symbol && item !== this.BuiltIns.PLACEHOLDER) ? replace : insert;
          for (const op of this.BuiltIns.SYMBOLS.filter(sym => sym.isUnary)) {
            options.push({text: op.text + " ___", action, args: [col, op]});
          }
        }

        options.push(...this.getVisibleVars(row, false, setVarRef));
      }

      let binOps = this.BuiltIns.SYMBOLS.filter(sym => sym.isBinary);
      if (this.getItem(row, 0) === this.BuiltIns.IF || this.getItem(row, 1) === this.BuiltIns.IF) {
        //move the boolean operations before the arithmetic operations when writing if statements
        //TODO generalize this to when a boolean return type, argument, or variable type is expected
        binOps = [...binOps.filter(op => op.isBool), ...binOps.filter(op => !op.isBool)];
      }
      
      if (item.constructor === VarRef
      || item.constructor === NumericLiteral
      || item === this.BuiltIns.END_EXPRESSION
      || item === this.BuiltIns.END_ARGS) {
        options.push(wrapInParens);
        const isAppending = (col === this.getItemCount(row) - 1);

        for (const op of binOps) {
          const args = [col + 1, op];
          if (!isAppending) {
            args.push(this.BuiltIns.PLACEHOLDER);
          }

          options.push({text: op.text, action: insert, args});
        };
      }
      
      if (prevItem.constructor === VarRef
      || prevItem.constructor === NumericLiteral
      || prevItem === this.BuiltIns.END_EXPRESSION
      || prevItem === this.BuiltIns.END_ARGS) {
        for (const op of binOps) {
          options.push({text: op.text, action: replace, args: [col, op]});
        }
      }

      if (item !== this.BuiltIns.IF && prevItem === this.BuiltIns.ELSE) {
        options.push({text: "if", style: "keyword", action: () => {
          this.pushItems(row, this.BuiltIns.IF);
          return {rowUpdated: true};
        }});
      }
    }

    return options;
  }

  appendClicked(row) {
    const rowCount = this.getRowCount();
    const itemCount = (row < rowCount) ? this.getItemCount(row) : 0;

    if (itemCount === 0) {
      let indentation = (row < rowCount) ? this.getIndentation(row) : 0;

      const options = [
        {text: "f(x)", style: "funcdef", action: this.getFunctionList, args: [false]},

        {text: "print", style: "funcdef", action: () => {
          this.appendRowsUpTo(row);
          this.pushItems(row,
            new FuncRef(this.BuiltIns.PRINT, this.BuiltIns.VOID),
            this.BuiltIns.BEGIN_ARGS,
            new ArgHint(this.BuiltIns.PRINT.signature, 0),
            this.BuiltIns.END_ARGS,
          );
          return {rowUpdated: true, selectedCol: 2};
        }},

        {text: "fn", style: "keyword", action: () => {
          const func = new FuncSig(this.BuiltIns.VOID, "myFunc", this.BuiltIns.VOID);
          this.appendRowsUpTo(row);
          this.setIsStartingScope(row, true);
          this.pushItems(row, this.BuiltIns.FUNC, func);
          return {rowUpdated: true, rowInserted: true, selectedCol: 1};
        }},

        {text: "var", style: "keyword", action: () => {
          this.appendRowsUpTo(row);
          this.pushItems(row,
            this.BuiltIns.VAR,
            new VarDef("myVar", this.BuiltIns.I32, this.BuiltIns.VOID),
            this.BuiltIns.ASSIGN
          );
          return {rowUpdated: true, selectedCol: 1};
        }},

        {text: "if", style: "keyword", action: () => {
          this.appendRowsUpTo(row);
          this.setIsStartingScope(row, true);
          this.pushItems(row, this.BuiltIns.IF);
          return {rowUpdated: true, rowInserted: true};
        }}
      ];

      //scan backward looking for an if block at the same indentation level
      for (let r = Math.min(rowCount, row) - 1; r >= 0; --r) {
        if (this.getIndentation(r) < indentation)
          break;

        if (this.getIndentation(r) === indentation) {
          if (this.getItem(r, 0) === this.BuiltIns.IF
          || this.getItem(r, 1) === this.BuiltIns.IF) {
            //scan forward for an else block at the same indentation
            for (let r = row + 1; r < rowCount; ++r) {
              if (this.getIndentation(r) < indentation)
                break;

              if (this.getIndentation(r) === indentation) {
                if (this.getItem(r, 0) === this.BuiltIns.ELSE) {
                  return [
                    {text: "else if", style: "keyword", action: () => {
                      this.appendRowsUpTo(row);
                      this.setIsStartingScope(row, true);
                      this.pushItems(row, this.BuiltIns.ELSE, this.BuiltIns.IF);
                      return {rowUpdated: true, rowInserted: true};
                    }}
                  ];
                }
              }
            }

            //if no succeeding else block is found, allow the user to create one
            options.push({text: "else", style: "keyword", action: () => {
              this.appendRowsUpTo(row);
              this.setIsStartingScope(row, true);
              this.pushItems(row, this.BuiltIns.ELSE);
              return {rowUpdated: true, rowInserted: true};
            }});
            break;
          }
        }
      }

      options.push(
        {text: "for", style: "keyword", action: () => {
          this.appendRowsUpTo(row);
          this.setIsStartingScope(row, true);
          this.pushItems(row,
            this.BuiltIns.FOR,
            new VarDef("index", this.BuiltIns.I32, this.BuiltIns.VOID),
            this.BuiltIns.IN,
            new NumericLiteral("0"),
            this.BuiltIns.HALF_OPEN_RANGE
          );
          return {rowUpdated: true, rowInserted: true};
        }},

        {text: "while", style: "keyword", action: () => {
          this.appendRowsUpTo(row);
          this.setIsStartingScope(row, true);
          this.pushItems(row, this.BuiltIns.WHILE);
          return {rowUpdated: true, rowInserted: true};
        }},

        {text: "return", style: "keyword", action: () => {
          this.appendRowsUpTo(row);
          this.pushItems(row, this.BuiltIns.RETURN);
          return {rowUpdated: true};
        }}
      );

      for (let r = Math.min(rowCount, row) - 1; r >= 0; --r) {
        const lineIndentation = this.getIndentation(r);
        if (lineIndentation < indentation) {
          indentation = lineIndentation;
          if (this.getItem(r, 0) === this.BuiltIns.WHILE
          || this.getItem(r, 0) === this.BuiltIns.DO_WHILE
          || this.getItem(r, 0) === this.BuiltIns.FOR) {
            options.push(
              {text: "break", style: "keyword", action: () => {
                this.pushItems(row, this.BuiltIns.BREAK);
                return {rowUpdated: true};
              }},
            );
            break;
          }
        }
      }

      options.push(...this.getVisibleVars(row, true, (varDef) => {
        this.appendRowsUpTo(row);
        this.pushItems(row,
          new VarRef(varDef, this.BuiltIns.VOID),
          this.BuiltIns.ASSIGN
        );
        return {rowUpdated: true};
      }));

      return options;
    }
    
    const defineVar = (type) => {
      const newVar = new VarDef("$" + (this.getItemCount(row) - 2), type, this.BuiltIns.VOID);
      this.pushItems(row, newVar);
      return {rowUpdated: true};
    }

    if (this.getItem(row, 0) === this.BuiltIns.VAR) {
      const ditto = {text: "ditto", style: "comment", action: () => {
        const cloneVariable = Object.assign({}, this.getItem(row, itemCount - 1));
        this.pushItems(cloneVariable)
      }}

      if (itemCount === 2) {
        return [
          {text: "=", action: this.pushItems, args: [row, this.BuiltIns.ASSIGN, this.BuiltIns.PLACEHOLDER]},
          ditto,
          ...this.getSizedTypes(defineVar)
        ];
      }

      if (this.getItem(row, itemCount - 1).constructor === VarDef) {
        return [
          ditto,
          ...this.getSizedTypes(defineVar)
        ];
      }
    }

    if (this.getItem(row, 0) === this.BuiltIns.FOR) {
      const lastItem = this.getItem(row, this.getItemCount(row) - 1);
      if (lastItem.constructor !== Symbol && !this.lines[row].items.includes(this.BuiltIns.STEP)) {
        return [{text: "step", style: "keyword", action: this.pushItems, agrs: [row, this.BuiltIns.STEP]}];
      }
    }

    if (this.getItem(row, 0) === this.BuiltIns.FUNC) {
      return this.getSizedTypes(defineVar);
    }

    return null;
  }

  getReturnType(row) {
    for (let r = row - 1; r >= 0; --r) {
      if (this.getItem(r, 0) === this.BuiltIns.FUNC) {
        return this.getItem(r, 1).returnType;
      }
    }

    return undefined;
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

    if (this.getItem(row, col).constructor === FuncRef) {
      ++end;
    }

    const symbol = this.getItem(row, end);
    const matchingSymbol = symbol.matching;
    const step = symbol.direction|0;

    if (step !== 0) {
      let matchingIndex = end;
      let depth = 0;
      while (matchingIndex > 0 && matchingIndex < this.getItemCount(row)) {
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

    if (start > 0 && this.getItem(row, start - 1).constructor === FuncRef) {
      --start;
    }

    return [start, end];
  }

  appendRowsUpTo(row) {
    let oldLength = this.getRowCount();

    let key = new Uint8Array((oldLength > 0) ? this.lines[oldLength - 1].key : 1);
    while (row >= this.getRowCount()) {
      key = Script.getNextKey(key);
      this.lines.push({
        items: [],
        key: key.buffer,
        indentation: 0
      });
    }

    if (oldLength !== this.getRowCount()) {
      this.saveRows(this.lines.slice(oldLength));
    }
  }

  insertRow(row) {
    let indentation = 0;
    if (row > 0) {
      indentation = this.getIndentation(row - 1) + this.isStartingScope(row - 1);
      if (this.getItemCount(row - 1) === 0) {
        const currentIndentation = row < this.getRowCount() ? this.getIndentation(row) : 0;
        indentation = Math.max(indentation - 1, currentIndentation);
      }
    }
    let key;

    //find the best place to insert a line to minimize key size
    //moving the insertion within equally indented blank lines is unnoticable
    for (let end = row ;; ++end) {
      if (end >= this.getRowCount()) {
        //end of script found, append a line instead
        if (indentation === 0) {
          //don't allow trailing whitespace
          return -1;
        }

        const lowKey = new Uint8Array(this.lines[end - 1].key);
        key = Script.getNextKey(lowKey);
        row = end;
        break;
      }
      
      if (this.getIndentation(end) !== indentation || this.getItemCount(end) !== 0) {
        let begin = row;
        while (begin > 0
          && this.getIndentation(begin - 1) === indentation
          && this.getItemCount(begin - 1) === 0) {
          --begin;
        }
  
        let bestScore = 0x7FFFFFFF;
        for (let i = begin; i <= end; ++i) {
          const lowKey = new Uint8Array((i > 0) ? this.lines[i - 1].key : 1);
          const highKey = new Uint8Array(this.lines[i].key);
          const avgKey = Script.getAvgKey(lowKey, highKey);
          const last = avgKey.length - 1;
          const score = last * 256 + (lowKey[last] || 0) - avgKey[last];
  
          if (score < bestScore) {
            row = i;
            key = avgKey;
            bestScore = score;
          }
        }
        break;
      }
    }

    const line = {
      items: [],
      key: key.buffer,
      indentation
    };
    this.lines.splice(row, 0, line);
    this.saveRows([line]);
    return row;
  }

  deleteRow(row, keepRow = false) {
    const indentation = this.getIndentation(row);
    let r = row;
    do {
      ++r;
    } while (r < this.getRowCount() && this.getIndentation(r) > indentation);
    let count = r - row;

    //manage orphaned else and else if structures
    if (this.getItem(row, 0) === this.BuiltIns.IF
    || this.getItem(row, 1) === this.BuiltIns.IF) {
      while (r < this.getRowCount() && !this.isStartingScope(r)) {
        ++r;
      }
      if (r < this.getRowCount()) {
        if (this.getItem(row, 0) === this.BuiltIns.IF) {
          if (this.getItem(r, 1) === this.BuiltIns.IF) {
            this.spliceRow(r, 0, 1);
          }
          else if (this.getItem(r, 0) === this.BuiltIns.ELSE) {
            this.spliceRow(r, 0, 1, this.BuiltIns.IF, this.BuiltIns.TRUE);
          }
        }
      }
    }

    //trim whitespace off the bottom of the script
    let startRow = row;
    if (row + count === this.getRowCount()) {
      while (startRow > 0 && this.getIndentation(startRow - 1) === 0 && this.getItemCount(startRow - 1) === 0) {
        --startRow;
      }
      count = r - startRow;
    }

    //Pressing backspace on a scope starter clears the line and its body, but keeps
    //the line itself.  If it is at the end of the script, it is trimmed as whitespace.
    if ((indentation > 0 || startRow + count !== this.getRowCount()) && keepRow) {
      this.setIsStartingScope(startRow, false);
      this.spliceRow(startRow, 0, this.getItemCount(startRow));
      ++startRow;
      --count;
    }

    if (count > 0) {
      const keyRange = IDBKeyRange.bound(this.lines[startRow].key, this.lines[startRow + count - 1].key);
      this.queueTransation(IDBObjectStore.prototype.delete, keyRange);
  
      this.lines.splice(startRow, count);
    }

    return count - (row - startRow);
  }

  deleteItem(row, col) {
    if (this.getItemCount(row) === 0) {
      return {rowDeleted: true};
    }

    let selCol = col;
    if (col === -1) {
      if (row < this.getRowCount()) {
        selCol = this.getItemCount(row);
        col = selCol - 1;
      } else {
        col = selCol = 0;
      }
    }
    const item = this.getItem(row, col) || {};

    if ((col === 0 && item !== this.BuiltIns.ELSE)
    || (col > 0 && item.constructor === Keyword && item !== this.BuiltIns.IF && item !== this.BuiltIns.STEP)
    || item.constructor === FuncSig
    || item.isAssignment
    || (item === VarDef && this.getItem(row, col + 1).isAssignment)) {
      const oldRowCount = this.getRowCount();
      this.deleteRow(row, true);

      return this.getRowCount() === oldRowCount ? {rowUpdated: true, selectedCol: 0x7FFFFF} : {scriptChanged: true};
    }

    if (item.isUnary
    || (col === this.getItemCount(row) - 1 && item === this.BuiltIns.PLACEHOLDER)
    || item.constructor === VarDef) {
      this.spliceRow(row, col, 1);
      return {rowUpdated: true, selectedCol: selCol - 1};
    }
    else if (item.isBinary) {
      const nextItem = this.getItem(row, col + 1) || {};
      const delCount = 2 + (nextItem.isUnary|0);
      this.spliceRow(row, col, delCount);
      return {rowUpdated: true, selectedCol: selCol - 1};
    }
    else if (item === this.BuiltIns.PLACEHOLDER) {
      const prevItem = this.getItem(row, col - 1);
      if (prevItem.isBinary) {
        this.spliceRow(row, col - 1, 2);
        return {rowUpdated: true, selectedCol: selCol - 2};
      } else if (prevItem.isUnary) {
        this.spliceRow(row, col - 1, 1);
        return {rowUpdated: true, selectedCol: selCol - 1};
      } else if (prevItem === this.BuiltIns.COMMA) {
        this.spliceRow(row, col - 1, 2);
        return {rowUpdated: true, selectedCol: selCol - 1};
      }
      console.trace();
      throw "unhandled placeholder delection";
    }
    else if (item === this.BuiltIns.IF) {
      this.spliceRow(row, col, this.getItemCount(row) - col);
      return {rowUpdated: true, selectedCol: 0};
    }
    else {
      const [start, end] = this.getExpressionBounds(row, col);

      //assumes any selection that reaches the first item spans the whole line
      if (start === 0) {
        if (this.getIndentation(row) === 0 && row + 1 === this.getRowCount()) {
          return {rowDeleted: true};
        } else {
          this.spliceRow(row, start, end - start + 1);
        }
      } else {
        let paramIndex = 0;
        let func;

        const nextItem = this.getItem(row, end + 1);
        const prevItem = this.getItem(row, start - 1);
        if ((nextItem === this.BuiltIns.COMMA || nextItem === this.BuiltIns.END_ARGS)
        && (prevItem === this.BuiltIns.COMMA || prevItem === this.BuiltIns.BEGIN_ARGS)) {
          for (let c = start - 1; c > 0; --c) {
            const item = this.getItem(row, c);
            if (item.constructor === FuncRef) {
              func = item;
              break;
            }

            if (this.getItem(row, c) === this.BuiltIns.COMMA) {
              ++paramIndex;
            }
          }
        }

        if (func) {
          if (func === this.BuiltIns.PRINT) {
            //when removing an argument to print, just delete the argument since it's just an Any[] paramater
            if (paramIndex > 0) {
              this.spliceRow(row, col - 1, 2);
              return {rowUpdated: true, selectedCol: selCol - 2};
            }
            if (paramIndex === 0 && this.getItem(row, col + 1) === this.BuiltIns.COMMA) {
              this.spliceRow(row, col, 2);
              return {rowUpdated: true};
            }
          }
          this.spliceRow(row, start, end - start + 1, new ArgHint(func.signature, paramIndex));
        } else {
          if (end + 1 === this.getItemCount(row)) {
            this.spliceRow(row, start, end - start + 1);
            return {rowUpdated: true, selectedCol: 0x7FFFFFFF};
          } else {
            this.spliceRow(row, start, end - start + 1, this.BuiltIns.PLACEHOLDER);
          }
        }
      }
      return {rowUpdated: true, selectedCol: start};
    }

    console.trace();
    throw "Reached bottom of DELETE_ITEM without hitting a case";
  }

  saveRows(lines) {
    this.queueTransation(function(lines) {
      for (const line of lines) {
        //TODO encode lines
        //this.put(line.items, line.key);
      }
    }, lines);
  }

  /**
   * gets shortest key that sorts immediately after a key
   * @param {Uint8Array} key
   * @returns {Uint8Array} succeeding key
   */
  static getNextKey(key) {
    for (let i = 0; i < key.length; ++i) {
      if (key[i] < 255) {
        const newKey = key.slice(0, i + 1);
        ++newKey[i];
        return newKey;
      }
    }

    return Uint8Array.of(...key, 1);
  }

  /**
   * gets the shortest key that sorts between two keys
   * if lowKey and highKey are identical, returns a clone of lowKey
   * @param {Uint8Array} lowKey
   * @param {Uint8Array} highKey
   * @return {Uint8Array} rounded average key
   */
  static getAvgKey(lowKey, highKey) {
    let diff = 0;
    for (let i = 0; i < Math.max(lowKey.length, highKey.length) + 1; ++i) {
      diff = diff * 256 + (highKey[i]|0) - (lowKey[i]|0);
  
      if (diff > 1) {
        const newKey = new Uint8Array(i + 1);
        newKey.set(lowKey.slice(0, i + 1));
        newKey[i] = (lowKey[i]|0) + (diff >>> 1);
        return newKey;
      }
    }

    return lowKey.slice();
  }
  
  getSizedTypes(action, ...args) {
    const options = [];

    for (const type of this.BuiltIns.TYPES.filter(t => t.size > 0)) {
      options.push({text: type.text, style: "keyword", action, args: [type, ...args]});
    }

    return options;
  }
  
  getVisibleVars(row, requiresMutable, action, ...args) {
    const options = [];

    let indentation = (row < this.getRowCount()) ? this.getIndentation(row) : 0;    

    for (let r = Math.min(this.getRowCount(), row) - 1; r >= 0; --r) {
      const lineIndentation = this.getIndentation(r);
      if (lineIndentation + this.isStartingScope(r) <= indentation) {
        indentation = lineIndentation;
        if (!requiresMutable || this.getItem(r, 0) === this.BuiltIns.VAR) {
          for (const item of this.lines[r].items.filter(item => item.constructor === VarDef)) {
            options.push({text: item.name, style: "vardef", action, args: [...args, item]});
          }
        }
      }
    }

    options.sort((a, b) => a.text.localeCompare(b.text));
    return options;
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
    this.lines[row].items[col] = val;
    this.saveRows([this.lines[row]]);
  }

  spliceRow(row, col, count, ...items) {
    this.lines[row].items.splice(col, count, ...items);
    this.saveRows([this.lines[row]]);
  }

  pushItems(row, ...items) {
    this.lines[row].items.push(...items);
    this.saveRows([this.lines[row]]);
  }

  getIndentation(row) {
    return this.lines[row].indentation;
  }

  isStartingScope(row) {
    return this.lines[row].isStartingScope|0;
  }
  
  setIsStartingScope(row, isStartingScope) {
    this.lines[row].isStartingScope = isStartingScope;
  }

  performTransactions(mode, actions) {
    const openRequest = indexedDB.open("TouchScript-" + this.projectID, 2);
  
    openRequest.onerror = (event) => alert("Open request error: " + event.errorCode);
    openRequest.onupgradeneeded = function(event) {
      console.log("upgrading data database");
      const db = event.target.result;
      db.createObjectStore("lines");
      db.createObjectStore("save-data");
    };
    openRequest.onsuccess = function(event) {
      const db = event.target.result;
      db.onerror = (event) => alert("Database error: " + event.target.errorCode);

      const transaction = db.transaction("lines", mode);
      const linesStore = transaction.objectStore("lines");
      
      for (const action of actions) {
        action.function.apply(linesStore, action.arguments);
      }
      actions.length = 0;
    };
  }

  /**
   * Opens a transaction and performs the action on it.  If the project did not already exist, creates it.
   * @param {Function} action func that expects object store bound to this and additional arguments
   * @param {*[]} args remainder of arguments that are sent to the action function
   */
  queueTransation(action, ...args) {
    // this.queuedTransations.push({arguments: args, function: action});

    // if (this.queuedTransations.length === 1) {
    //   performActionOnProjectListDatabase("readwrite", (objStore, transaction) => {
    //     objStore.get(this.projectID).onsuccess = (event) => {
    //       if (event.target.result) {
    //         //console.log("Updating edit date of project listing " + this.projectID);
    //         const projectListing = event.target.result;
    //         projectListing.lastModified = new Date();
    //         objStore.put(projectListing);
    //         this.performTransactions("readwrite", this.queuedTransations);
    //       } else {
    //         objStore.getAllKeys().onsuccess = (event) => {
    //           const id = event.target.result.findIndex((el, i) => el !== i);
    //           const now = new Date();
    //           const newProject = {id, name: "Project " + id, created: now, lastModified: now};
        
    //           objStore.put(newProject).onsuccess = (event) => {
    //             console.log("Successfully created new project listing.  ID is", event.target.result);
    //             this.projectID = event.target.result;
    //             localStorage.setItem(ACTIVE_PROJECT_KEY, event.target.result);

    //             this.queuedTransations.length = 0;
    //             this.saveRows(this.lines);
    //             this.performTransactions("readwrite", this.queuedTransations);
    //           }
    //         }
    //       }
    //     }
    //   });
    // }
  }

  /*
  Generates a Wasm binary from the script contents
  */
  getWasm() {
    const types = [
      [[], []],
      [[], [Wasm.types.i32]],
      [[], [Wasm.types.i64]],
      [[], [Wasm.types.f32]],
      [[], [Wasm.types.f64]],
      [[Wasm.types.f64], []],
      [[Wasm.types.f64], [Wasm.types.f64]],
      [[Wasm.types.f64], [Wasm.types.f64, Wasm.types.f64]],
      [[Wasm.types.f64], [Wasm.types.f64, Wasm.types.f64, Wasm.types.f64]],
      [[Wasm.types.f32], [Wasm.types.f32]],
      [[Wasm.types.f32], [Wasm.types.f32, Wasm.types.f32]],
      [[Wasm.types.f32], [Wasm.types.f32, Wasm.types.f32, Wasm.types.f32]],
    ];
    const funcSigs = {};

    let typeSection = [
      ...Wasm.varuint(types.length), //count of type entries
    ];
    for (let i = 0; i < types.length; ++i) {
      const [results, params] = types[i];
      typeSection.push(Wasm.types.func);
      typeSection.push(params.length, ...params);
      typeSection.push(results.length, ...results);


      let propName;
      if (results.length === 0) {
        propName = "void";
      } else {
        propName = Wasm.typeNames[results[0]];
      }

      for (const type of params) {
        propName += "_" + Wasm.typeNames[type];
      }

      funcSigs[propName] = i;
    }

    const importedFuncNames = [
      "System", "print", funcSigs.void_i32,
      "System", "printNum", funcSigs.void_f32,
      "System", "printNum", funcSigs.void_f64,
      "System", "inputF64", funcSigs.f64_f64_f64_f64,
      "Math", "cos", funcSigs.f32_f32,
      "Math", "cos", funcSigs.f64_f64,
      "Math", "sin", funcSigs.f32_f32,
      "Math", "sin", funcSigs.f64_f64,
      "Math", "tan", funcSigs.f32_f32,
      "Math", "tan", funcSigs.f64_f64,
      "Math", "acos", funcSigs.f32_f32,
      "Math", "acos", funcSigs.f64_f64,
      "Math", "asin", funcSigs.f32_f32,
      "Math", "asin", funcSigs.f64_f64,
      "Math", "atan", funcSigs.f32_f32,
      "Math", "atan", funcSigs.f64_f64,
      "Math", "atan2", funcSigs.f32_f32_f32,
      "Math", "atan2", funcSigs.f64_f64_f64,
      "Math", "cosh", funcSigs.f32_f32,
      "Math", "cosh", funcSigs.f64_f64,
      "Math", "sinh", funcSigs.f32_f32,
      "Math", "sinh", funcSigs.f64_f64,
      "Math", "tanh", funcSigs.f32_f32,
      "Math", "tanh", funcSigs.f64_f64,
      "Math", "acosh", funcSigs.f32_f32,
      "Math", "acosh", funcSigs.f64_f64,
      "Math", "asinh", funcSigs.f32_f32,
      "Math", "asinh", funcSigs.f64_f64,
      "Math", "atanh", funcSigs.f32_f32,
      "Math", "atanh", funcSigs.f64_f64,
      "Math", "cbrt", funcSigs.f32_f32,
      "Math", "cbrt", funcSigs.f64_f64,
      "Math", "exp", funcSigs.f32_f32,
      "Math", "exp", funcSigs.f64_f64,
      "Math", "log", funcSigs.f32_f32,
      "Math", "log", funcSigs.f64_f64,
      "Math", "log10", funcSigs.f32_f32,
      "Math", "log10", funcSigs.f64_f64,
      "Math", "log2", funcSigs.f32_f32,
      "Math", "log2", funcSigs.f64_f64,
      "Math", "pow", funcSigs.f32_f32_f32,
      "Math", "pow", funcSigs.f64_f64_f64,
      "Math", "random", funcSigs.f64,
      "Math", "sign", funcSigs.f32_f32,
      "Math", "sign", funcSigs.f64_f64,
    ];
    const importedFuncCount = importedFuncNames.length / 3;

    let importSection = [
      ...Wasm.varuint(importedFuncCount + 1), //count of things to import

      ...Wasm.stringToLenPrefixedUTF8("js"),
      ...Wasm.stringToLenPrefixedUTF8("memory"),
      Wasm.externalKind.Memory,
      0, //flag that max pages is not specified
      ...Wasm.varuint(1), //initially 1 page allocated
    ]

    for (let i = 0; i < importedFuncNames.length; i += 3) {
      const [moduleName, name, signiture] = importedFuncNames.slice(i, i + 3);
      importSection.push(
        ...Wasm.stringToLenPrefixedUTF8(moduleName),
        ...Wasm.stringToLenPrefixedUTF8(name),
        Wasm.externalKind.Function,
        ...Wasm.varuint(signiture),
      );
    }

    let functionSection = [
      ...Wasm.varuint(3), //count of function bodies defined later
      ...Wasm.varuint(funcSigs.void), //type indicies (func signitures)
      ...Wasm.varuint(funcSigs.void_i64),
      ...Wasm.varuint(funcSigs.void_i64),
    ];

    // let exportSection = [
    //   ...Wasm.varuint(0), //count of exports

    //   ...Wasm.getStringBytesAndData("init"), //length and bytes of function name
    //   Wasm.externalKind.Function, //export type
    //   ...Wasm.varuint(importedFunctionsCount), //exporting entry point function
    // ];
    
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
    
    class Placeholder {
      constructor(type, ...wasmCode) {
        this.type = type;
        this.wasmCode = wasmCode;
      }
      
      getType() {
        return this.type;
      }
      
      getWasmCode() {
        return this.wasmCode;
      }
    }
    
    function compileExpression(expression, expectedType) {
      const operators = [];
      const operands = [];

      expression.push(new TSSymbol("term", -1000, {isFoldable: false})); //terminate expression
      for (let i = 0; i < expression.length; ++i) {
        const item = expression[i];
        if (item.constructor === TSSymbol) {
          if (!item.direction === 1) {
            //check if the previous operators have a higher precedence than the one that is about to be pushed
            while (operators.length > 0 && operators[operators.length - 1].precedence >= item.precedence) {
              const operator = operators.pop();
              const rightOperand = operands.pop();
              if (operator.isUnary) {
                if (rightOperand.constructor === NumericLiteral) {
                  rightOperand.performUnaryOp(operator.appearance);
                  operands.push(rightOperand);
                } else {
                  const {resultType, wasmCode} = operator.uses.get(rightOperand.getType());
                  operands.push(new Placeholder(resultType, ...rightOperand.getWasmCode(), ...wasmCode));
                }
              } else {
                const leftOperand = operands.pop();
                if (operator.isFoldable && leftOperand.constructor === NumericLiteral && rightOperand.constructor === NumericLiteral) {
                  leftOperand.performBinaryOp(operator.appearance, rightOperand);
                  operands.push(leftOperand);
                } else {
                  const type = rightOperand.getType(leftOperand.getType());
                  const {resultType, wasmCode} = operator.uses.get(type);
                  operands.push(new Placeholder(resultType, ...leftOperand.getWasmCode(type), ...rightOperand.getWasmCode(type), ...wasmCode));
                }
              }
            }
          }

          if (item.direction === -1) {
            operators.pop();
          } else {
            operators.push(item);
          }
        } else {
          operands.push(item);
        }
      }
      
      //console.log("remaining operands", ...operands, "remaining operators", ...operators.slice(0, -1));
      const expressionType = operands[0].getType(expectedType);
      const wasmCode = operands[0].getWasmCode(expectedType);
      
      return [expressionType, wasmCode];
    }

    let initFunction = [];

    const functionsBeingCalled = [];
    const expression = [];
    const localVarMapping = []; //maps local var indexes to TouchScript varIDs
    let lvalueType, lvalueLocalIndex;
    const endOfLineInstructions = [];
    const endOfScopeData = [];

    const initialData = [];
    initialData.push(...Wasm.stringToLenPrefixedUTF8("false")); //address 0
    initialData.push(...Wasm.stringToLenPrefixedUTF8("-"));     //address 6
    initialData.push(...Wasm.stringToLenPrefixedUTF8("true"));  //address 8

    for (let row = 0, endRow = this.getRowCount(); row < endRow; ++row) {
      lvalueType = this.types.builtins.void;
      lvalueLocalIndex = -1;
      
      if (row > 0) {
        let scopeDrop = this.getIndentation(row - 1) - this.getIndentation(row);
        if (this.getItem(row, 1) === this.BuiltIns.ELSE) {
          --scopeDrop;
        }
        for (let i = 0; i < scopeDrop; ++i) {
          const scopeData = endOfScopeData.pop();
          initFunction.push(...scopeData.wasmCode);
          initFunction.push(...Array(scopeData.blockCount).fill(Wasm.opcodes.end));
        }
      }

      for (let col = 1, endCol = this.getItemCount(row); col < endCol; ++col) {
        const item = this.getItem(row, col);
        const {format, meta, value} = Script.getItemData(item);

        switch (format) {
          case Script.VARIABLE_DEFINITION: {
            expression.push(new LocalVarReference(localVarMapping.length, this.vars.get(value)));
            localVarMapping.push({id: value, type: meta});
          } break;
          
          case Script.VARIABLE_REFERENCE: {
            const localIndex = localVarMapping.findIndex(localVar => localVar.id === value);
            if (localIndex === -1) {
              throw "var" + value + " is referenced before it is declared";
            }
            
            expression.push(new LocalVarReference(localIndex, localVarMapping[localIndex]));
          } break;
          
          case Script.FUNCTION_REFERENCE:
            functionsBeingCalled.push(value);
            break;

          case Script.ARGUMENT_HINT: {
            const param = this.funcs.get(value).parameters[meta];
            if (param.type === this.types.builtins.string || param.type === this.types.builtins.Any) {
              expression.push(new StringLiteral(initialData.length));
              initialData.push(...Wasm.stringToLenPrefixedUTF8(param.default));
            } else {
              expression.push(new NumericLiteral(param.default));
            }
          } break;

          case Script.SYMBOL: {
            const funcId = functionsBeingCalled[functionsBeingCalled.length - 1];
            
            if (this.ASSIGNMENT_OPERATORS.includes(item)) {
              const localVar = expression.pop();
              lvalueType = localVar.getType();
              lvalueLocalIndex = localVar.index;
              
              if (item !== this.BuiltIns.ASSIGN) {
                initFunction.push(Wasm.opcodes.get_local, ...Wasm.varint(localVar.index));
                const {wasmCode, resultType} = this.symbols[value].uses.get(lvalueType);
                endOfLineInstructions.push(...wasmCode);
              }
              
              endOfLineInstructions.push(Wasm.opcodes.set_local, localVar.index);
            }

            let expressionType = this.types.builtins.void;
            let wasmCode = [];
            if (item === this.BuiltIns.COMMA || item === this.BuiltIns.END_ARGUMENTS) {
              //find argument type
              let expectedType = this.types.builtins.Any;
              let funcCallDepth = 0;
              let argumentIndex = 0;
              for (let j = col - 1; j > 0; --j) {
                const item = this.getItem(row, j);
                if (item === this.BuiltIns.END_ARGUMENTS) {
                  ++funcCallDepth;
                }
                if (item === this.BuiltIns.COMMA && funcCallDepth === 0) {
                  ++argumentIndex;
                }
                if (item === this.BuiltIns.START_ARGUMENTS) {
                  if (funcCallDepth === 0) {
                    const funcId = this.getData(row, j - 1).value;
                    const func = this.funcs.get(funcId);
                    if (funcId === this.BuiltIns.PRINT) {
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
              
              [expressionType, wasmCode] = compileExpression(expression, expectedType);
              expression.length = 0;
            }

            //print() takes an arbitrary count of Any arguments and overloads for each argument in order
            if (item === this.BuiltIns.END_ARGUMENTS || item === this.BuiltIns.COMMA && funcId == this.BuiltIns.PRINT) {
              const overload = this.funcs.findOverloadId(funcId, expressionType);
              if (overload === undefined) {
                throw `implementation of ${this.funcs.get(funcId).name}(${this.types.get(expressionType).name}) not found`;
              }
              const overloadedFunc = this.funcs.get(overload);
              initFunction.push(...wasmCode);
              if (overloadedFunc.afterArguments !== undefined) {
                initFunction.push(...overloadedFunc.afterArguments);
              }
              if (overloadedFunc.importedFuncIndex !== undefined) {
                initFunction.push(Wasm.opcodes.call, overloadedFunc.importedFuncIndex);
              }
              if (overloadedFunc.returnType !== this.types.builtins.void) {
                expression.push(new Placeholder(overloadedFunc.returnType)); //TODO place wasm code of function call as 2nd argument
              }
            } else {
              initFunction.push(...wasmCode);
            }

            if (item === this.BuiltIns.END_ARGUMENTS) {
              functionsBeingCalled.pop()
            }
            
            if (![this.BuiltIns.COMMA, this.BuiltIns.START_ARGUMENTS, this.BuiltIns.END_ARGUMENTS].includes(item) && !this.ASSIGNMENT_OPERATORS.includes(item)) {
              expression.push(this.symbols[value]);
            }
          } break;
          
          case Script.KEYWORD: {
            switch (item) {
              case this.BuiltIns.IF: {
                lvalueType = this.types.bool;
                endOfLineInstructions.push(Wasm.opcodes.if, Wasm.types.void);
                endOfScopeData.push({wasmCode: []});
              } break;
              case this.BuiltIns.ELSE: {
                endOfLineInstructions.push(Wasm.opcodes.else);
              } break;
              case this.BuiltIns.WHILE: {
                initFunction.push(Wasm.opcodes.block, Wasm.types.void, Wasm.opcodes.loop, Wasm.types.void);
                endOfLineInstructions.push(Wasm.opcodes.i32_eqz, Wasm.opcodes.br_if, 1);
                endOfScopeData.push({wasmCode: [Wasm.opcodes.br, 0], isBranchable: true, blockCount: 2});
              } break;
              case this.BuiltIns.DO_WHILE: {
                initFunction.push(Wasm.opcodes.block, Wasm.types.void, Wasm.opcodes.loop, Wasm.types.void);
                endOfScopeData.push({wasmCode: [Wasm.opcodes.br_if, 0], isBranchable: true, blockCount: 2});
              } break;
              case this.BuiltIns.BREAK: {
                let requestedDepth = 1;

                if (this.getItemCount(row) >= 2) {
                  const {value} = this.getData(row, col + 1);
                  requestedDepth = +this.literals.get(value);
                }

                //branch depth must be 1 over the depth of the loop to break out rather than repeat
                let depthTraveled = 1;
                for (let i = endOfScopeData.length - 1; i >= 0; --i) {
                  if (endOfScopeData[i].isBranchable && --requestedDepth <= 0) {
                    initFunction.push(Wasm.opcodes.br, depthTraveled);
                    break;
                  }

                  ++depthTraveled;
                  if (endOfScopeData[i].isBranchable) {
                    ++depthTraveled;
                  }
                }
                col = 1000; //do not attempt to write any expression using the rest of this line
              } break;
              case this.BuiltIns.CONTINUE: {
                let requestedDepth = 1;

                if (this.getItemCount(row) >= 2) {
                  const {value} = this.getData(row, col + 1);
                  requestedDepth = +this.literals.get(value);
                }

                let depthTraveled = 0;
                //work backward through the scopes until we find one that is branchable
                for (let i = endOfScopeData.length - 1; i >= 0; --i) {
                  const scopeData = endOfScopeData[i];
                  if (scopeData.isBranchable && --requestedDepth <= 0) {
                    //slice off the depth of the branch instruction and use our own
                    initFunction.push(...scopeData.wasmCode.slice(0, -1), depthTraveled);
                    break;
                  }

                  ++depthTraveled;
                  if (scopeData.isBranchable) {
                    ++depthTraveled;
                  }
                }
                col = 1000; //do not attempt to write any expression using the rest of this line
              } break;
              case this.BuiltIns.IN: {
                const localVar = expression.pop(); //consume the looping variable reference
                lvalueType = localVar.getType();
                lvalueLocalIndex = localVar.index;
              } break;
              case this.BuiltIns.STEP: { //part of a for loop
                const [, wasmCode] = compileExpression(expression, lvalueType);
                expression.length = 0;
                const incrementOpcode = wasmCode.pop();

                const lvar = this.vars.get(localVarMapping[lvalueLocalIndex]);
                const stepSizeLocalIndex = localVarMapping.length;
                localVarMapping.push({id: -1, type: lvar.type});

                endOfLineInstructions.push(Wasm.opcodes.set_local, stepSizeLocalIndex);

                endOfScopeData.push({wasmCode: [
                  Wasm.opcodes.get_local, lvalueLocalIndex,
                  Wasm.opcodes.get_local, stepSizeLocalIndex,
                  incrementOpcode,
                  Wasm.opcodes.set_local, lvalueLocalIndex,
                  Wasm.opcodes.br, 0,
                ], isBranchable: true, blockCount: 2});

                insertPrecondition(wasmCode);
              } break;
            }
          } break;

          case Script.LITERAL:
            if (meta === 0) { //bool
              expression.push(new Placeholder(this.types.builtins.bool, Wasm.opcodes.i32_const, this.literals.mask - value));
            } else if (meta === 1) { //string
              expression.push(new StringLiteral(initialData.length));

              const stringLiteral = this.literals.get(value).replace(/\\n/g, "\n");
              initialData.push(...Wasm.stringToLenPrefixedUTF8(stringLiteral));
            } else if (meta === 2) { //number
              const literal = this.literals.get(value);
              expression.push(new NumericLiteral(literal));
            } break;
        }
      }

      //end of line delimits expression
      if (expression.length > 0) {
        const [, wasmCode] = compileExpression(expression, lvalueType);
        expression.length = 0;

        if (this.getItem(row, 1) === this.BuiltIns.DO_WHILE) {
          //move the expression to right before the conditional loop branch
          endOfScopeData[endOfScopeData.length - 1].wasmCode.unshift(...wasmCode);
        } else if (this.getItem(row, 1) === this.BuiltIns.FOR) {
          if (!this.lines[row].includes(this.BuiltIns.STEP)) {
            const incrementOpcode = wasmCode.pop();
            insertPrecondition(wasmCode)

            //if the step size is not specified, use the numeric literal "1"
            const constStep = (new NumericLiteral("1")).getWasmCode(lvalueType);

            endOfScopeData.push({wasmCode: [
              Wasm.opcodes.get_local, lvalueLocalIndex,
              ...constStep,
              incrementOpcode,
              Wasm.opcodes.set_local, lvalueLocalIndex,
              Wasm.opcodes.br, 0,
            ], isBranchable: true, blockCount: 2});
          } else {
            initFunction.push(...wasmCode);
          }
        } else {
          initFunction.push(...wasmCode);
          if (endOfLineInstructions.length === 0) {
            initFunction.push(Wasm.opcodes.drop);
          }
        }
      }
      
      if (endOfLineInstructions.length > 0) {
        initFunction.push(...endOfLineInstructions);
        endOfLineInstructions.length = 0;
      }
    }
    
    while (endOfScopeData.length > 0) {
      const scopeData = endOfScopeData.pop();
      initFunction.push(...scopeData.wasmCode);
      initFunction.push(...Array(scopeData.blockCount).fill(Wasm.opcodes.end));
    }

    const localVarDefinition = [
      ...Wasm.varuint(localVarMapping.length), //count of local entries (count and type pairs, not total locals)
    ];

    //at the moment, I make no attempt to collapse repeating types into a single type description
    for (let local of localVarMapping) {
      let type = 0;
      switch (local.type) {
        case this.types.builtins.i32:
        case this.types.builtins.u32:
        case this.types.builtins.bool:
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
      Wasm.opcodes.i32_const, Wasm.varint(0), Wasm.opcodes.end, //fill memory starting at address 0
      ...Wasm.varuint(initialData.length), //count of bytes to fill in
      ...initialData,
    ];

    const globalSection = [
      ...Wasm.varuint(1),
      Wasm.types.i32, 1,
      Wasm.opcodes.i32_const, ...Wasm.varuint(initialData.length),
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
      [...Wasm.varuint(importedFuncCount)].length,
      ...Wasm.varuint(importedFuncCount), //the start function is the first function after the imports
  
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