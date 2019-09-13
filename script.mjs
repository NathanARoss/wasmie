import BuiltIns, {
	VarDef, VarRef, FuncSig, ImportedFunc, PredefinedFunc, Macro, FuncRef, ArgHint, Symbol,
	Keyword, NumericLiteral, BooleanLiteral, StringLiteral, LoopLabel
} from "./script_builtins.mjs"

import Wasm, {
	types as WasmTypes,
	varuint, varint,
	encodeString, encodePrefixedString,
	encodeF32, encodeF64,
	section, externalKind
} from "./wasm_definitions.mjs";

export default class Script {
	constructor(id, isSaved,
		firstWriteCallback, writeCallback, deleteCallback,
		genericDBActionCallback, scriptLoadedCallback
	) {
		this.id = id;
		this.isSaved = isSaved;
		this.writeCallback = writeCallback;
		this.deleteCallback = deleteCallback;
		this.firstWriteCallback = firstWriteCallback;

		this.lines = [];

		function decodeData(script) {
			const varDefs = new Map();
			let highestVarId = -1;

			const range = IDBKeyRange.bound(Uint8Array.of(id), Uint8Array.of(id + 1), false, true);
			this.openCursor(range).onsuccess = function(event) {
				const cursor = event.target.result;
				if (!cursor) {
					VarDef.nextId = highestVarId + 1;
					scriptLoadedCallback();
					return;
				}

				const lineKey = cursor.primaryKey;
				const lineData = cursor.value;
				const items = [];

				for (const data of lineData.items || []) {
					if ("type" in data) {
						const type = BuiltIns.TYPES.find(type => type.id === data.type);
						const scope = BuiltIns.VOID;
						const id = data.id;
						highestVarId = Math.max(id, highestVarId);
						const typeAnnotated = data.typeAnnotated;
						const varDef = new VarDef(data.name, type, {scope, id, typeAnnotated});
						items.push(varDef);
						varDefs.set(data.id, varDef);
					} else if ("varDef" in data) {
						const varDef = varDefs.get(data.varDef);
						if (varDef) {
							const currentscope = BuiltIns.VOID;
							items.push(new VarRef(varDef, currentscope));
						} else {
							items.push(BuiltIns.PLACEHOLDER);
						}
					} else if ("argIndex" in data) {
						const funcDef = BuiltIns.FUNCTIONS[-1 - data.funcDef];
						items.push(new ArgHint(funcDef, data.argIndex));
					} else if ("funcDef" in data) {
						const funcDef = BuiltIns.FUNCTIONS[-1 - data.funcDef];
						const currentscope = BuiltIns.VOID;
						items.push(new FuncRef(funcDef, currentscope));
					} else if ("symbol" in data) {
						items.push(BuiltIns.SYMBOLS[data.symbol]);
					} else if ("keyword" in data) {
						items.push(BuiltIns.KEYWORDS[data.keyword]);
					} else if ("numLit" in data) {
						items.push(new NumericLiteral(data.numLit));
					} else if ("boolLit" in data) {
						items.push(data.boolLit ? BuiltIns.TRUE : BuiltIns.FALSE);
					} else if ("strLit" in data) {
						items.push(new StringLiteral(data.strLit));
					} else if ("loopLayers" in data) {
						items.push(new LoopLabel(data.loopLayers));
					} else {
						console.log(data, "not recognized during loading")
					}
				}

				script.lines.push({
					key: lineKey,
					indent: lineData.indent|0,
					items,
				});

				cursor.continue();
			}
		}

		genericDBActionCallback("readonly", "lines", decodeData, [this]);
	}

	appendPushAndSave(row, items, response) {
		const oldLength = this.lineCount;

		this.appendLinesUpTo(row);
		this.pushItems(row, ...items);

		if ("lineInserted" in response) {
			this.insertLine(response.lineInserted|0);
		}

		if (oldLength !== this.lineCount) {
			this.saveLines(oldLength, this.lineCount - oldLength);
		} else {
			this.saveLines(row);
		}

		response.lineUpdated = true;
		return response;
	}

	insertFuncCall(row, col, funcDef) {
		const items = [new FuncRef(funcDef, BuiltIns.VOID)];
		for (let i = 0; i < funcDef.signature.parameters.length; ++i) {
			items.push(BuiltIns.ARG_SEPARATOR, new ArgHint(funcDef, i));
		}
		items[1] = BuiltIns.BEGIN_ARGS;
		items.push(BuiltIns.END_ARGS);

		const oldLength = this.lineCount;

		if (row < this.lineCount && col < this.getItemCount(row)) {
			const [start, end] = this.getExpressionBounds(row, col);
			const count = end - col;
			this.spliceLine(row, col, count, ...items);
		} else {
			this.appendLinesUpTo(row);
			this.pushItems(row, ...items);
		}
		
		this.runTypeInference(row);

		if (oldLength !== this.lineCount) {
			this.saveLines(oldLength, this.lineCount - oldLength);
		} else {
			this.saveLines(row);
		}
		return {lineUpdated: true, selectedCol: col + 2};
	}

	itemClicked(row, col) {
		if (col < 0) {
			const options = this.appendClicked(row);
			if (options) {
				return options;
			}
			col = this.getItemCount(row);
		}

		const options = [];

		const item = this.getItem(row, col) || {};
		const nextItem = this.getItem(row, col + 1) || {};

		const replace = (col, item) => {
			this.setItem(row, col, item);
			this.runTypeInference(row);
			this.saveLines(row);
			return {lineUpdated: true};
		};

		const insert = (col, ...items) => {
			this.spliceLine(row, col, 0, ...items);
			this.runTypeInference(row);
			this.saveLines(row);
			return {lineUpdated: true, selectedCol: col + 1};
		};

		const setVarRef = (varDef) => {
			return replace(col, new VarRef(varDef, BuiltIns.VOID));
		};

		if (item.suggestion) {
			const isAssignment = this.getItemCount(row) > 2 && this.getItem(row, 2).isAssignment;
			if (item !== BuiltIns.VAR || isAssignment) {
				const [text, style] = item.suggestion.getDisplay();
				options.push({text, style, action: replace, args: [col, item.suggestion]});
			}
		}

		if (col === 1 && item.isAssignment) {
			for (const op of BuiltIns.SYMBOLS.filter(sym => sym.isAssignment)) {
				const [text, style] = op.getDisplay();
				options.push({text, style, action: replace, args: [col, op]});
			}
		}

		if (item.isRange) {
			for (const op of BuiltIns.SYMBOLS.filter(sym => sym.isRange)) {
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
				const scopes = new Set(BuiltIns.FUNCTIONS.map(func => func.signature.scope));
				const style = "keyword";
				const action = this.getVisibleFuncs;
				for (const scope of scopes) {
					options.push({text: scope.text, style, action, args: [row, 0, scope, BuiltIns.ANY]});
				}
			} else if (item === BuiltIns.IF) {
				const indent = this.getIndent(row);
				for (let r = row - 1; r >= 0; --r) {
					if (this.getIndent(r) < indent)
						break;

					if (this.getItem(r, 0) === BuiltIns.IF
					|| this.getItem(r, 1) === BuiltIns.IF) {
						options.push({text: "else", style: "keyword",
							action: insert, args: [col, BuiltIns.ELSE]
						});
						break;
					}
				}
			}
		} else {
			if (item === BuiltIns.BEGIN_EXPRESSION
			|| item === BuiltIns.END_EXPRESSION) {
				options.push({text: "", style: "delete-outline", action: () => {
					const [start, end] = this.getExpressionBounds(row, col);
					this.spliceLine(row, end - 1, 1);
					this.spliceLine(row, start, 1);
					this.saveLines(row);
					return {lineUpdated: true, selectedCol: col === start ? col : col - 2};
				}});
			}

			//allow the user to enter additional arguments for variadic functions
			if ([BuiltIns.ARG_SEPARATOR, BuiltIns.END_ARGS].includes(nextItem)) {
				//find signiture of function this argument belongs to
				let depth = 0;
				for (let i = col - 1; i >= 0; --i) {
					const item = this.getItem(row, i);
					if (item === BuiltIns.END_ARGS) {
						++depth;
					} else if (item === BuiltIns.BEGIN_ARGS) {
						--depth;
						if (depth === -1) {
							const funcDef = this.getItem(row, i - 1).funcDef;
							//TODO make sure function is actually variadic
							options.push({text: ",", action: insert,
								args: [col + 1, BuiltIns.ARG_SEPARATOR, new ArgHint(funcDef, 0)]
							});
						}
					}
				}
			}
			
			const wrapInParens = {
				text: "( )", action: () => {
				const [start, end] = this.getExpressionBounds(row, col);
				this.spliceLine(row, end, 0, BuiltIns.END_EXPRESSION);
				this.spliceLine(row, start, 0, BuiltIns.BEGIN_EXPRESSION);
				this.saveLines(row);
				return {lineUpdated: true, selectedCol: col + 1};
			}};

			if (item.constructor === FuncRef
			|| item.direction === 1) {
				options.push(wrapInParens);
			}
			
			if (item.constructor === FuncSig) {
				const setReturnType = (type, item) => {
					item.returnType = type;
					this.saveLines(row);
					return {lineUpdated: true};
				};
				
				options.push({text: "void", style: "comment",
					action: setReturnType, args: [item, BuiltIns.ANY]
				});
				
				options.push(...this.getSizedTypes(setReturnType, item));
			}

			if (item.constructor === VarDef) {
				const setType = (type, item) => {
					if (type === BuiltIns.ANY) {
						item.typeAnnotated = false;
						this.runTypeInference(row);
					} else {
						item.typeAnnotated = true;
						item.type = type;
					}
					this.saveLines(row);
					
					return {lineUpdated: true};
				}
				
				if (nextItem.isAssignment || nextItem === BuiltIns.IN) {
					options.push({text: "auto", style: "comment",
						action: setType, args: [BuiltIns.ANY, item]
					});
				}

				//indicate what the current type is within the type options
				const typeOptions = this.getSizedTypes(setType, item);
				const index = typeOptions.findIndex(op => op.args[0] === item.type);
				if (index !== -1) {
					typeOptions[index].isSelected = true;
				}
				options.push(...typeOptions);
			}

			const prevItem = this.getItem(row, col - 1);
			
			if (prevItem === BuiltIns.CONTINUE || prevItem === BuiltIns.BREAK) {
				//count the number of nested loops this statement is inside
				let loopStructureCount = 0;

				let indent = this.getIndent(row);
				for (let r = row - 1; r >= 0; --r) {
					const lineIndent = this.getIndent(r);
					if (lineIndent < indent) {
						indent = lineIndent;
						const firstItem = this.getItem(r, 0);
						if (firstItem === BuiltIns.WHILE
						|| firstItem === BuiltIns.DO_WHILE
						|| firstItem === BuiltIns.FOR) {
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

			let firstItem, secondItem;

			const itemCount = this.getItemCount(row);
			if (itemCount > 0) {
				firstItem = this.getItem(row, 0);
				if (itemCount > 1) {
					secondItem = this.getItem(row, 1);
				} else {
					secondItem = {};
				}
			} else {
				firstItem = secondItem = {};
			}

			if (prevItem.preceedsExpression
			|| prevItem === BuiltIns.RETURN && this.getReturnType(row)) {
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
					options.push(
						{text, isInput: true, style, hint: "literal", onsubmit: (text) => {
							let newItem;

							if (text.toLowerCase() === "true") {
								newItem = BuiltIns.TRUE;
							} else if (text.toLowerCase() === "false") {
								newItem = BuiltIns.FALSE;
							} else if (text.trim().length !== 0 && !isNaN(text)) {
								newItem = new NumericLiteral(text.trim());
							} else {
								if (text.startsWith('"'))
									text = text.substring(1);
								
								if (text.endsWith('"'))
									text = text.substring(0, text.length - 1);

								newItem = new StringLiteral(text);
							}

							return replace(col, newItem);
						}, oninput: (event) => {
							const inputNode = event.target;
							inputNode.classList.remove("keyword", "number", "string");
							let style;
							if (/^(true|false)$/i.test(inputNode.value)) {
								style = "keyword";
							} else if (!isNaN(inputNode.value)) {
								style = "number";
							} else {
								style = "string"
							}
							inputNode.classList.add(style);
						}},
					);
				}

				if (!prevItem.isUnary) {
					const action = (item.constructor === Symbol && item !== BuiltIns.PLACEHOLDER) ? replace : insert;
					for (const op of BuiltIns.SYMBOLS.filter(sym => sym.isUnary)) {
						options.push({text: op.text + " ___", action, args: [col, op]});
					}
				}

				options.push(...this.getVisibleVars(row, false, setVarRef));

				let type = BuiltIns.ANY;
				if (firstItem.constructor === VarRef) {
					type = firstItem.varDef.type;
				} else if (secondItem.constructor === VarDef) {
					type = secondItem.type;
				}

				let funcs = BuiltIns.FUNCTIONS;
				if (type !== BuiltIns.ANY) {
					funcs = funcs.filter(func => {
						return func.signature.returnType === type
						|| type.casts && type.casts.get(func.signature.returnType);
					});
				}
				const scopes = new Set(funcs.map(func => func.signature.scope));
					
				const style = "keyword";
				const action = this.getVisibleFuncs;

				for (const scope of scopes) {
					options.push({text: scope.text, style, action, args: [row, col, scope, type]});
				}
			}

			let binOps = BuiltIns.SYMBOLS.filter(sym => sym.isBinary);
			if (secondItem === BuiltIns.IF
			|| [BuiltIns.IF, BuiltIns.WHILE, BuiltIns.DO_WHILE].includes(firstItem)) {
				//TODO generalize this to when a boolean return type, argument, or variable type is expected
				binOps = [...binOps.filter(op => op.isBool), ...binOps.filter(op => !op.isBool)];
			}
			
			if (item.constructor === VarRef
			|| item.constructor === NumericLiteral
			|| item === BuiltIns.END_EXPRESSION
			|| item === BuiltIns.END_ARGS) {
				options.push(wrapInParens);
				const isAppending = (col === this.getItemCount(row) - 1);

				for (const op of binOps) {
					const args = [col + 1, op];
					if (!isAppending) {
						args.push(BuiltIns.PLACEHOLDER);
					}

					options.push({text: op.text, action: insert, args});
				};
			}
			
			if (prevItem.constructor === VarRef
			|| prevItem.constructor === NumericLiteral
			|| prevItem === BuiltIns.END_EXPRESSION
			|| prevItem === BuiltIns.END_ARGS) {
				for (const op of binOps) {
					options.push({text: op.text, action: replace, args: [col, op]});
				}
			}

			if (item !== BuiltIns.IF && prevItem === BuiltIns.ELSE) {
				options.push({text: "if", style: "keyword", action: () => {
					this.pushItems(row, BuiltIns.IF);
					this.saveLines(row);
					return {lineUpdated: true};
				}});
			}
		}

		return options;
	}

	appendClicked(row) {
		const rowCount = this.lineCount;
		const itemCount = (row < rowCount) ? this.getItemCount(row) : 0;

		if (itemCount === 0) {
			let indent = (row < rowCount) ? this.getIndent(row) : 0;

			const options = [
				{
					text: BuiltIns.PRINTLN.signature.name,
					style: "funcdef", action: this.insertFuncCall,
					args: [row, 0, BuiltIns.PRINTLN]
				},

				// {text: "fn", style: "keyword", action: () => {
				//   const func = new FuncSig(BuiltIns.VOID, "myFunc", BuiltIns.VOID);
				//   this.appendRowsUpTo(row);
				//   this.pushItems(row, BuiltIns.FUNC, func);
				//   return {lineUpdated: true, lineInserted: row+1, selectedCol: 1};
				// }},

				{
					text: "var", style: "keyword", action: function(row, response) {
						const items = [BuiltIns.VAR, new VarDef(null, BuiltIns.ANY), BuiltIns.ASSIGN];
						return this.appendPushAndSave(row, items, response);
					},
					args: [row, {selectedCol: 1}]
				},

				{text: "if", style: "keyword", action: this.appendPushAndSave,
				args: [row, [BuiltIns.IF], {lineInserted: row+1}]},
			];

			//scan backward looking for an if block at the same indent level
			for (let r = Math.min(rowCount, row) - 1; r >= 0; --r) {
				if (this.getIndent(r) < indent)
					break;

				if (this.getIndent(r) === indent) {
					if (this.getItem(r, 0) === BuiltIns.IF
					|| this.getItem(r, 1) === BuiltIns.IF) {
						//scan forward for an else block at the same indent
						for (let r = row + 1; r < rowCount; ++r) {
							if (this.getIndent(r) < indent)
								break;

							if (this.getIndent(r) === indent) {
								if (this.getItem(r, 0) === BuiltIns.ELSE) {
									return [
										{text: "else if", style: "keyword", action: this.appendClicked,
										args: [
											[BuiltIns.ELSE, BuiltIns.IF], {lineInserted: row+1}
										]}
									];
								}
							}
						}

						//if no succeeding else block is found, allow the user to create one
						options.push(
							{text: "else", style: "keyword", action: this.appendPushAndSave,
							args: [row, [BuiltIns.ELSE], {lineInserted: row+1}]}
						);
						break;
					} else if (this.getItemCount(r) !== 0) {
						break;
					}
				}
			}

			options.push(
				{text: "for", style: "keyword", action: function(row) {
					const items = [
						BuiltIns.FOR,
						new VarDef("index", BuiltIns.I32),
						BuiltIns.IN,
						new NumericLiteral("0"),
						BuiltIns.HALF_OPEN_RANGE
					];

					return this.appendPushAndSave(row, items, {lineInserted: row+1});
				}, args: [row]},

				{text: "while", style: "keyword", action: this.appendPushAndSave,
				args: [row, [BuiltIns.WHILE], {lineInserted: row+1}]},
			);

			for (let r = Math.min(rowCount, row) - 1; r >= 0; --r) {
				const lineIndent = this.getIndent(r);
				if (lineIndent < indent) {
					indent = lineIndent;
					const firstItem = this.getItem(r, 0);
					if (firstItem === BuiltIns.WHILE
					|| firstItem === BuiltIns.DO_WHILE
					|| firstItem === BuiltIns.FOR) {
						options.push(
							{text: "break", style: "keyword", action: () => {
								this.pushItems(row, BuiltIns.BREAK);
								this.saveLines(row);
								return {lineUpdated: true};
							}},
							{text: "continue", style: "keyword", action: () => {
								this.pushItems(row, BuiltIns.CONTINUE);
								this.saveLines(row);
								return {lineUpdated: true};
							}},
						);
						break;
					}
				}
			}
			
			const callback = (varDef) => {
				const items = [
					new VarRef(varDef, BuiltIns.VOID),
					BuiltIns.ASSIGN
				];

				return this.appendPushAndSave(row, items, {});
			};
			options.push(...this.getVisibleVars(row, true, callback));

			const scopes = new Set(BuiltIns.FUNCTIONS.map(func => func.signature.scope));
			const style = "keyword";
			const action = this.getVisibleFuncs;
			for (const scope of scopes) {
				options.push({text: scope.text, style, action, args: [row, 0, scope, BuiltIns.ANY]});
			}

			return options;
		}

		const firstItem = this.getItem(row, 0);
		const lastItem = this.getItem(row, itemCount - 1);
		
		const defineVar = (type) => {
			const newVar = new VarDef(null, type);
			this.pushItems(row, newVar);
			this.saveLines(row);
			return {lineUpdated: true};
		}

		if (firstItem === BuiltIns.VAR) {
			if (itemCount === 2) {
				return [
					{text: "=", action: () => {
						this.pushItems(row, BuiltIns.ASSIGN);
						this.saveLines(row);
						return {lineUpdated: true};
					}},
					...this.getSizedTypes(defineVar)
				];
			}

			if (lastItem.constructor === VarDef) {
				return this.getSizedTypes(defineVar);
			}
		}

		if (firstItem === BuiltIns.FOR) {
			if (lastItem.constructor !== Symbol && !this.lines[row].items.includes(BuiltIns.STEP)) {
				return [{text: "step", style: "keyword", action: () => {
					this.pushItems(row, BuiltIns.STEP);
					this.saveLines(row);
					return {lineUpdated: true};
				}}];
			}
		}

		if (firstItem === BuiltIns.FUNC) {
			return this.getSizedTypes(defineVar);
		}

		return null;
	}

	getReturnType(row) {
		for (let r = row - 1; r >= 0; --r) {
			if (this.getItem(r, 0) === BuiltIns.FUNC) {
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
				const item = this.getItem(row, matchingIndex);
				if (item === symbol) {
					++depth;
				}
				else if (item === matchingSymbol) {
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

		++end; //end is one past the last item
		return [start, end];
	}

	getInsertIndent(row) {
		let indent = 0;
		if (row > 0 && row <= this.lineCount) {
			indent = this.getIndent(row - 1) + this.isStartingScope(row - 1);
			if (this.getItemCount(row - 1) === 0) {
				indent = Math.max(indent - 1, this.getIndent(row));
			}
		}
		return indent;
	}

	canInsert(row) {
		return row < this.lineCount || this.getInsertIndent(row) > 0;
	}

	insertLine(row) {
		if (!this.canInsert(row)) {
			return {};
		}
		const response = {lineInserted: row};

		const indent = this.getInsertIndent(row);
		let key;

		//find the best place to insert a line to minimize key size
		//moving the insertion within equally indented blank lines is unnoticable
		for (let end = row ;; ++end) {
			if (end >= this.lineCount) {
				//end of script found, append a line instead
				if (indent === 0) {
					//don't allow trailing whitespace
					return -1;
				}

				const lowKey = new Uint8Array(this.lines[end - 1].key);
				key = getNextKey(lowKey);
				row = end;
				break;
			}
			
			if (this.getIndent(end) !== indent || this.getItemCount(end) !== 0) {
				let begin = row;
				while (begin > 0
					&& this.getIndent(begin - 1) === indent
					&& this.getItemCount(begin - 1) === 0) {
					--begin;
				}
	
				let bestScore = 0x7FFFFFFF;
				for (let i = begin; i <= end; ++i) {
					const lowKey = new Uint8Array((i > 0) ? this.lines[i - 1].key : 1);
					const highKey = new Uint8Array(this.lines[i].key);
					const avgKey = getAvgKey(lowKey, highKey);
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
			indent
		};
		this.lines.splice(row, 0, line);
		this.writeCallback(this.id, row, 1);
		return response;
	}

	deleteLine(row, keepLine = false) {
		if (row >= this.lineCount) {
			return {removeLinesPosition: row, removeLinesCount: 1};
		}

		const response = {};

		const indent = this.getIndent(row);
		let count;
		{
			let r = row;
			do {
				++r;
			} while (r < this.lineCount && this.getIndent(r) > indent);
			count = r - row;
			
			//manage orphaned else and else if structures
			if (this.getItem(row, 0) === BuiltIns.IF) {
				while (r + 1 < this.lineCount && this.getItemCount(r) === 0) {
					++r;
				}
				
				if (this.getItem(r, 0) === BuiltIns.ELSE) {
					this.spliceLine(r, 0, this.getItemCount(r), BuiltIns.IF, BuiltIns.TRUE);
					this.saveLines(row);
					response.lineUpdated = true;
					count = r - row;
				}
			}
		}
		
		if (row + count === this.lineCount && indent === 0) {
			//trim whitespace off the bottom of the script
			response.removeLinesPosition = row
			response.removeLinesCount = count;

			while (row > 0 && this.getIndent(row - 1) === 0 && this.getItemCount(row - 1) === 0) {
				--row;
				++count;
			}
		} else {
			//Pressing backspace on a scope starter clears the line and its body, but keeps the line
			if (keepLine && !response.lineUpdated) {
				this.spliceLine(row, 0, this.getItemCount(row));
				this.saveLines(row);
				++row;
				--count;
			}

			response.removeLinesPosition = row
			response.removeLinesCount = count;
		}

		if (count > 0) {
			if (!this.isSaved) {
				this.firstWriteCallback(this.id);
				this.isSaved = true;
			}
			this.deleteCallback(this.id, this.lines[row].key, this.lines[row + count - 1].key)
	
			this.lines.splice(row, count);
		} else {
			response.lineUpdated = true;
		}

		return response;
	}

	deleteItem(row, col) {
		if (this.getItemCount(row) === 0) {
			return this.deleteLine(row);
		}

		let selCol = col;
		if (col === -1) {
			if (row < this.lineCount) {
				selCol = this.getItemCount(row);
				col = selCol - 1;
			} else {
				col = selCol = 0;
			}
		}
		const prevItem = this.getItem(row, col - 1) || {};
		const item = this.getItem(row, col) || {};
		const nextItem = this.getItem(row, col + 1) || {};

		if ((col === 0 && item !== BuiltIns.ELSE)
		|| (col > 0 && item.constructor === Keyword && item !== BuiltIns.IF && item !== BuiltIns.STEP)
		|| item.constructor === FuncSig
		|| item.isAssignment && this.getItem(row, 0) === BuiltIns.LET
		|| (item.constructor === VarDef && nextItem.isAssignment)
		//|| this.getItemCount(row) === 2 //this deletes small if statements
		) {
			return this.deleteLine(row, true);
		}

		if (item.isUnary
		|| (col === this.getItemCount(row) - 1 && item === BuiltIns.PLACEHOLDER)
		|| item.constructor === VarDef) {
			this.spliceLine(row, col, 1);
			this.saveLines(row);
			return {lineUpdated: true, selectedCol: selCol - 1};
		}
		else if (item.isBinary) {
			const delCount = 2 + (nextItem.isUnary|0);
			this.spliceLine(row, col, delCount);
			this.saveLines(row);
			return {lineUpdated: true, selectedCol: selCol - 1};
		}
		else if (item === BuiltIns.PLACEHOLDER) {
			if (prevItem.isBinary) {
				this.spliceLine(row, col - 1, 2);
				this.saveLines(row);
				return {lineUpdated: true, selectedCol: selCol - 2};
			} else if (prevItem.isUnary) {
				this.spliceLine(row, col - 1, 1);
				this.saveLines(row);
				return {lineUpdated: true, selectedCol: selCol - 1};
			} else if (prevItem === BuiltIns.ARG_SEPARATOR) {
				this.spliceLine(row, col - 1, 2);
				this.saveLines(row);
				return {lineUpdated: true, selectedCol: selCol - 1};
			}
			console.error("unhandled placeholder delection");
			throw "unhandled placeholder delection";
		}
		else if (item === BuiltIns.IF) {
			this.spliceLine(row, col, this.getItemCount(row) - col);
			this.saveLines(row);
			return {lineUpdated: true, selectedCol: 0};
		}
		else {
			const [start, end] = this.getExpressionBounds(row, col);

			//assumes any selection that reaches the first item spans the whole line
			if (start === 0) {
				if (this.getIndent(row) === 0 && row + 1 === this.lineCount) {
					return this.deleteLine(row);;
				} else {
					this.spliceLine(row, start, end - start);
					this.saveLines(row);
				}
			} else {
				let paramIndex = 0;
				let func;

				const nextItem = this.getItem(row, end);
				const prevItem = this.getItem(row, start - 1);
				if ((nextItem === BuiltIns.ARG_SEPARATOR || nextItem === BuiltIns.END_ARGS)
				&& (prevItem === BuiltIns.ARG_SEPARATOR || prevItem === BuiltIns.BEGIN_ARGS)) {
					for (let c = start - 1; c >= 0; --c) {
						//TODO take into account function calls used as function arguments
						const item = this.getItem(row, c);
						if (item.constructor === FuncRef) {
							func = item;
							break;
						}

						if (item === BuiltIns.ARG_SEPARATOR) {
							++paramIndex;
						}
					}
				}

				if (func) {
					if (func === BuiltIns.PRINT) {
						//when removing an argument to print, just delete the argument since it's just an Any[] paramater
						if (paramIndex > 0) {
							this.spliceLine(row, col - 1, 2);
							this.saveLines(row);
							return {lineUpdated: true, selectedCol: selCol - 2};
						}
						if (paramIndex === 0 && this.getItem(row, col + 1) === BuiltIns.ARG_SEPARATOR) {
							this.spliceLine(row, col, 2);
							this.saveLines(row);
							return {lineUpdated: true};
						}
					}
					this.spliceLine(row, start, end - start, new ArgHint(func.funcDef, paramIndex));
					this.saveLines(row);
				} else {
					if (end === this.getItemCount(row)) {
						this.spliceLine(row, start, end - start);
						this.saveLines(row);
						return {lineUpdated: true, selectedCol: 0x7FFFFFFF};
					} else {
						this.spliceLine(row, start, end - start, BuiltIns.PLACEHOLDER);
						this.saveLines(row);
					}
				}
			}
			return {lineUpdated: true, selectedCol: start};
		}

		console.error("Reached bottom of DELETE_ITEM without hitting a case");
	}

	saveLines(position, count = 1) {
		if (!this.isSaved) {
			this.firstWriteCallback(this.id);
			this.isSaved = true;
		}
		this.writeCallback(this.id, position, count);
	}
	
	getSizedTypes(action, ...args) {
		const options = [];

		for (const type of BuiltIns.TYPES.filter(t => t.size > 0)) {
			options.push({text: type.text, style: "keyword", action, args: [type, ...args]});
		}

		return options;
	}
	
	getVisibleVars(row, requiresMutable, action, ...args) {
		const options = [];

		let indent = this.getIndent(row);

		for (let r = Math.min(this.lineCount, row) - 1; r >= 0; --r) {
			const lineIndent = this.getIndent(r);
			if (lineIndent + this.isStartingScope(r) <= indent) {
				indent = lineIndent;
				if (!requiresMutable || this.getItem(r, 0) === BuiltIns.VAR) {
					for (const item of this.lines[r].items.filter(item => item.constructor === VarDef)) {
						options.push({text: item.name, style: "vardef", action, args: [...args, item]});
					}
				}
			}
		}

		options.sort((a, b) => a.text.localeCompare(b.text));
		return options;
	}

	getVisibleFuncs(row, col, scope, expectedType = BuiltIns.ANY) {
		//grab only the ones belonging to the scope
		let funcs = BuiltIns.FUNCTIONS.filter(func => func.signature.scope === scope);

		//prioritize functions that return the right type or who's return type express every
		//value the lvalue type can (i.e. double -> int)
		if (expectedType !== BuiltIns.ANY) {
			const perfect = funcs.filter(func => {
				return func.signature.returnType === expectedType;
			});

			const lossLess = funcs.filter(func => {
				return func.signature.returnType.size >= expectedType.size
					&& expectedType.casts
					&& expectedType.casts.get(func.signature.returnType)
					&& expectedType.casts.get(func.signature.returnType).preferred;
			});

			const lossy = funcs.filter(func => {
				return func.signature.returnType.size >= expectedType.size
					&& expectedType.casts
					&& expectedType.casts.get(func.signature.returnType);
			});

			const lossier = funcs.filter(func => {
				return expectedType.casts
				&& expectedType.casts.get(func.signature.returnType)
			});

			funcs = [...perfect, ...lossLess, ...lossy, ...lossier];
		}
		
		//keep only the first function with a given name (rely on overloading)
		funcs = funcs.filter((v, i, a) => {
			return a.findIndex(func => func.signature.name === v.signature.name) === i;
		});

		const options = [];
		for (const func of funcs) {
			options.push({
				text: func.signature.name, style: "funcdef",
				action: this.insertFuncCall, args: [row, col, func]
			});
		}

		return options;
	}

	getExpressionType(row, start, end) {
		//TODO handle detecting non-primative types
		const promotions = [
			BuiltIns.U32, BuiltIns.I32, BuiltIns.U64,
			BuiltIns.I64, BuiltIns.F32, BuiltIns.F64,
			BuiltIns.STRING, BuiltIns.BOOL
		];
		
		let status = -1;
		
		const items = this.lines[row].items.slice(start, end);
		for (const item of items) {
			if (item.isUnary) {
				status = Math.max(status, 1); //assume I32
			}

			if (item.getType) {
				status = Math.max(status, promotions.indexOf(item.getType()));
			}
		}

		let rvalueType = BuiltIns.VOID;
		if (status !== -1) {
			rvalueType = promotions[status];
		}

		//this makes the assumption that any expression with a bool op is a bool expression
		if (items.some(item => item.constructor === Symbol && item.isBool)) {
			rvalueType = BuiltIns.BOOL;
		}

		return rvalueType;
	}

	runTypeInference(row) {
		const itemCount = this.getItemCount(row);
		if (itemCount < 2) {
			return;
		}

		const item = this.getItem(row, 1);
		if (item.constructor !== VarDef) {
			return;
		}

		if (item.typeAnnotated === true) {
			return;
		}

		item.type = this.getExpressionType(row, 2, itemCount);
	}

	get lineCount() {
		return this.lines.length;
	}

	getItemCount(row) {
		return row < this.lines.length ? this.lines[row].items.length : 0;
	}

	getItem(row, col) {
		return row < this.lines.length ? this.lines[row].items[col] : {};
	}

	setItem(row, col, item) {
		this.lines[row].items[col] = item;
	}

	spliceLine(row, col, count, ...items) {
		this.lines[row].items.splice(col, count, ...items);
	}

	pushItems(row, ...items) {
		this.lines[row].items.push(...items);
	}

	appendLinesUpTo(row) {
		let key;
		if (this.lines.length > 0) {
			key = new Uint8Array(this.lines[this.lines.length - 1].key);
		} else {
			key = Uint8Array.of(this.id, 0);
		}

		while (row >= this.lineCount) {
			key = getNextKey(key);
			this.lines.push({
				items: [],
				key: key.buffer,
				indent: 0
			});
		}
	}

	getIndent(row) {
		return row < this.lines.length ? this.lines[row].indent : 0;
	}

	isStartingScope(row) {
		return [
			BuiltIns.IF, BuiltIns.ELSE, BuiltIns.WHILE,
			BuiltIns.DO_WHILE, BuiltIns.FOR, BuiltIns.FUNC
		].includes(this.lines[row].items[0]);
	}

	/*
	Generates a Wasm binary from the script contents
	*/
	getWasm() {
		//identify every predefined and imported function before compiling begins
		const importedFuncs = [];
		const predefinedFuncs = [];

		function noticePredefinedFunc(func) {
			if (!predefinedFuncs.includes(func)) {
				predefinedFuncs.push(func);
				
				for (const dependency of func.dependencies) {
					if (dependency.constructor === ImportedFunc) {
						if (!importedFuncs.includes(dependency)) {
							importedFuncs.push(dependency);
						}
					} else {
						//this assumes that dependencies are not recursive
						if (!predefinedFuncs.includes(dependency)) {
							predefinedFuncs.push(dependency);
						}
					}
				}
			}
		}

		for (let row = 0; row < this.lineCount; ++row) {
			for (const item of this.lines[row].items) {
				if (item.constructor === FuncRef) {
					if (item.funcDef.constructor === ImportedFunc) {
						let func = item.funcDef;
						if (func === BuiltIns.PRINTLN) {
							if (!importedFuncs.includes(BuiltIns.PRINT_CHAR)) {
								importedFuncs.push(BuiltIns.PRINT_CHAR);
							}
							func = BuiltIns.PRINT;
						}
	
						if (func !== BuiltIns.PRINT) {
							if (!importedFuncs.includes(func)) {
								importedFuncs.push(func);
							}
						} else {
							//assume PRINT call appears as the first item in a line
							const itemCount = this.getItemCount(row);
							for (let col = 2; col < itemCount; ++col) {
								const [start, end] = this.getExpressionBounds(row, col);
								const argType = this.getExpressionType(row, start, end);
								const implementation = getPrintImplementation(argType);

								if (implementation.constructor === ImportedFunc) {
									if (!importedFuncs.includes(implementation)) {
										importedFuncs.push(implementation);
									}
								} else {
									noticePredefinedFunc(implementation);
								}

								col = end;
								if (this.getItem(row, col) === BuiltIns.ARG_SEPARATOR) {
									if (!importedFuncs.includes(BuiltIns.PRINT_CHAR)) {
										importedFuncs.push(BuiltIns.PRINT_CHAR);
									}
								}
							}
						}
					}
					else if (item.funcDef.constructor === PredefinedFunc) {
						noticePredefinedFunc(func);
					}
				}
			}
		}

		let mainFunc = [];

		const callStack = [];
		const expression = [];
		const localVarMapping = []; //maps local var indexes to TouchScript vars
		let lvalueType, lvalueLocalIndex;
		const endOfLineInstructions = [];
		const endOfScopeData = [];

		function insertPrecondition(wasmCode) {
			//The wasmCode array has code that produces a start value and an end value on the
			//operand stack, then a comparison opcode, then an increment opcode (typed add or sub).
			//Backup the comparison opcode for the break condition and the increment opcode for
			//the end of the loop body, then the start and stop values.;
			const lvar = localVarMapping[lvalueLocalIndex];

			//create a new local var with the same type as the looping var to hold the end value
			const endValLocalIndex = localVarMapping.length;
			localVarMapping.push(new VarDef("inc", lvar.type, {id: -1}));

			const comparisonOpcode = wasmCode.pop();

			mainFunc.push(...wasmCode);
			endOfLineInstructions.push(Wasm.set_local, endValLocalIndex);
			endOfLineInstructions.push(Wasm.set_local, lvalueLocalIndex);

			endOfLineInstructions.push(Wasm.block, WasmTypes.void);
			endOfLineInstructions.push(Wasm.loop, WasmTypes.void);

			endOfLineInstructions.push(Wasm.get_local, lvalueLocalIndex);
			endOfLineInstructions.push(Wasm.get_local, endValLocalIndex);
			endOfLineInstructions.push(comparisonOpcode, Wasm.i32_eqz);
			endOfLineInstructions.push(Wasm.br_if, 1);
		}

		const topOfStack = 2**15;
		const initialData = [];

		for (let row = 0, endRow = this.lineCount; row < endRow; ++row) {
			lvalueType = BuiltIns.VOID;
			lvalueLocalIndex = -1;
			
			if (row > 0) {
				let scopeDrop = this.getIndent(row - 1) - this.getIndent(row);
				if (this.getItem(row, 0) === BuiltIns.ELSE) {
					--scopeDrop;
				}
				for (let i = 0; i < scopeDrop; ++i) {
					const scopeData = endOfScopeData.pop();
					mainFunc.push(...scopeData.wasmCode);
					mainFunc.push(...Array(scopeData.blockCount).fill(Wasm.end));
				}
			}

			for (let col = 0, endCol = this.getItemCount(row); col < endCol; ++col) {
				const item = this.getItem(row, col);

				switch (item.constructor) {
					case VarDef: {
						expression.push(new LocalVarReference(localVarMapping.length, item));
						localVarMapping.push(item);
					} break;
					
					case VarRef: {
						const localIndex = localVarMapping.findIndex(localVar => localVar === item.varDef);
						if (localIndex === -1) {
							throw "var" + value + " is referenced before it is declared";
						}
						
						expression.push(new LocalVarReference(localIndex, localVarMapping[localIndex]));
					} break;
					
					case FuncRef:
						callStack.push(item.funcDef);
						break;

					case ArgHint: {
						const param = item.funcDef.signature.parameters[item.argIndex];
						if (param.default) {
							if (param.type === BuiltIns.STRING || param.type === BuiltIns.ANY) {
								const bytes = encodePrefixedString(param.default);
								const operand = new InternalStringLiteral(initialData.length + topOfStack, bytes.length);
								expression.push(operand);
								initialData.push(...bytes);
							} else {
								expression.push(new InternalNumericLiteral(param.default));
							}
						}
					} break;

					case Symbol: {
						const func = callStack[callStack.length - 1];
						
						if (item.isAssignment) {
							const localVar = expression.pop();
							lvalueType = localVar.getType();
							lvalueLocalIndex = localVar.index;
							
							if (item !== BuiltIns.ASSIGN) {
								mainFunc.push(Wasm.get_local, ...varint(localVar.index));
								const {wasmCode, resultType} = item.uses.get(lvalueType);
								endOfLineInstructions.push(...wasmCode);
							}
							
							endOfLineInstructions.push(Wasm.set_local, localVar.index);
						}

						let wasmCode = [];
						let expressionType;
						if ((item === BuiltIns.ARG_SEPARATOR || item === BuiltIns.END_ARGS)
						&& func.signature.parameters.length > 0) {
							//find argument type
							let expectedType = BuiltIns.ANY;
							let funcCallDepth = 0;
							let argumentIndex = 0;
							for (let j = col - 1; j > 0; --j) {
								const item = this.getItem(row, j);
								if (item === BuiltIns.END_ARGS) {
									++funcCallDepth;
								}
								if (item === BuiltIns.ARG_SEPARATOR && funcCallDepth === 0) {
									++argumentIndex;
								}
								if (item === BuiltIns.BEGIN_ARGS) {
									if (funcCallDepth === 0) {
										const func = this.getItem(row, j - 1).funcDef;
										if (func === BuiltIns.PRINT || func === BuiltIns.PRINTLN) {
											expectedType = BuiltIns.ANY;
										} else {
											const argumentType = func.signature.parameters[argumentIndex].type;
											expectedType = argumentType;
										}
										break;
									}
									
									--funcCallDepth;
								}
							}

							[expressionType, wasmCode] = compileExpression(expression, expectedType);
							expression.length = 0;
						}

						mainFunc.push(...wasmCode);

						//println and print call system print function on each argument separately
						if (func === BuiltIns.PRINT || func === BuiltIns.PRINTLN) {
							if (item === BuiltIns.END_ARGS || item === BuiltIns.ARG_SEPARATOR) {
								//use specialized printing functions
								let funcIndex;
								const implementation = getPrintImplementation(expressionType);

								if (implementation.constructor === ImportedFunc) {
									funcIndex = importedFuncs.indexOf(implementation);
								} else {
									funcIndex = predefinedFuncs.indexOf(implementation) + importedFuncs.length + 1;
								}

								mainFunc.push(Wasm.call, ...varuint(funcIndex));
							}
							
							if (item === BuiltIns.ARG_SEPARATOR) {
								//print ' '
								mainFunc.push(
									Wasm.i32_const, ' '.charCodeAt(),
									Wasm.call, ...varuint(importedFuncs.indexOf(BuiltIns.PRINT_CHAR)),
								);
							}
							else if (item === BuiltIns.END_ARGS && func === BuiltIns.PRINTLN) {
								//print '\n'
								mainFunc.push(
									Wasm.i32_const, '\n'.charCodeAt(),
									Wasm.call, ...varuint(importedFuncs.indexOf(BuiltIns.PRINT_CHAR)),
								);
							}
						}

						//any other function
						else if (item === BuiltIns.END_ARGS) {
							if (func.constructor === Macro) {
								mainFunc.push(...func.wasmCode);
							}
							if (func.constructor === PredefinedFunc) {
								const index = predefinedFuncs.indexOf(func);
								mainFunc.push(Wasm.call, ...varuint(index + importedFuncs.length + 1));
							}
							if (func.constructor === ImportedFunc) {
								const index = importedFuncs.indexOf(func);
								mainFunc.push(Wasm.call, ...varuint(index));
							}
							if (func.signature.returnType !== BuiltIns.VOID) {
								expression.push(new Placeholder(func.signature.returnType)); //TODO place wasm code of function call as 2nd argument
							}
						}

						if (item === BuiltIns.END_ARGS) {
							callStack.pop()
						}
						
						if (![BuiltIns.ARG_SEPARATOR, BuiltIns.BEGIN_ARGS, BuiltIns.END_ARGS].includes(item) && !item.isAssignment) {
							expression.push(item);
						}
					} break;
					
					case Keyword: {
						switch (item) {
							case BuiltIns.IF: {
								lvalueType = BuiltIns.BOOL;
								endOfLineInstructions.push(Wasm.if, WasmTypes.void);
								endOfScopeData.push({wasmCode: []});
							} break;
							case BuiltIns.ELSE: {
								endOfLineInstructions.push(Wasm.else);
							} break;
							case BuiltIns.WHILE: {
								lvalueType = BuiltIns.BOOL;
								mainFunc.push(Wasm.block, WasmTypes.void, Wasm.loop, WasmTypes.void);
								endOfLineInstructions.push(Wasm.i32_eqz, Wasm.br_if, 1);
								endOfScopeData.push({wasmCode: [Wasm.br, 0], isBranchable: true, blockCount: 2});
							} break;
							case BuiltIns.DO_WHILE: {
								lvalueType = BuiltIns.BOOL;
								mainFunc.push(Wasm.block, WasmTypes.void, Wasm.loop, WasmTypes.void);
								endOfScopeData.push({wasmCode: [Wasm.br_if, 0], isBranchable: true, blockCount: 2});
							} break;
							case BuiltIns.BREAK: {
								let requestedDepth = 1;

								if (this.getItemCount(row) >= 2) {
									const {value} = this.getData(row, col + 1);
									requestedDepth = +this.literals.get(value);
								}

								//branch depth must be 1 over the depth of the loop to break out rather than repeat
								let depthTraveled = 1;
								for (let i = endOfScopeData.length - 1; i >= 0; --i) {
									if (endOfScopeData[i].isBranchable && --requestedDepth <= 0) {
										mainFunc.push(Wasm.br, depthTraveled);
										break;
									}

									++depthTraveled;
									if (endOfScopeData[i].isBranchable) {
										++depthTraveled;
									}
								}
								col = 1000; //do not attempt to write any expression using the rest of this line
							} break;
							case BuiltIns.CONTINUE: {
								let requestedDepth = 1;

								if (this.getItemCount(row) >= 2) {
									requestedDepth = this.getItem(row, 1).loopLayers;
								}

								let depthTraveled = 0;
								//work backward through the scopes until we find one that is branchable
								for (let i = endOfScopeData.length - 1; i >= 0; --i) {
									const scopeData = endOfScopeData[i];
									if (scopeData.isBranchable && --requestedDepth <= 0) {
										//slice off the depth of the branch instruction and use our own
										mainFunc.push(...scopeData.wasmCode.slice(0, -1), depthTraveled);
										break;
									}

									++depthTraveled;
									if (scopeData.isBranchable) {
										++depthTraveled;
									}
								}
								col = 1000; //do not attempt to write any expression using the rest of this line
							} break;
							case BuiltIns.IN: {
								const localVar = expression.pop(); //consume the looping variable reference
								lvalueType = localVar.getType();
								lvalueLocalIndex = localVar.index;
							} break;
							case BuiltIns.STEP: { //part of a for loop
								const [, wasmCode] = compileExpression(expression, lvalueType);
								expression.length = 0;
								const incrementOpcode = wasmCode.pop();

								const lvar = localVarMapping[lvalueLocalIndex];
								const stepSizeLocalIndex = localVarMapping.length;
								localVarMapping.push(new VarDef("inc", lvar.type, {id: -1}));

								endOfLineInstructions.push(Wasm.set_local, stepSizeLocalIndex);

								endOfScopeData.push({wasmCode: [
									Wasm.get_local, lvalueLocalIndex,
									Wasm.get_local, stepSizeLocalIndex,
									incrementOpcode,
									Wasm.set_local, lvalueLocalIndex,
									Wasm.br, 0,
								], isBranchable: true, blockCount: 2});

								insertPrecondition(wasmCode);
							} break;
						}
					} break;

					case BooleanLiteral:
						expression.push(new Placeholder(BuiltIns.BOOL, Wasm.i32_const, item.value|0));
					break;
					
					case StringLiteral:
						const stringLiteral = item.text.replace(/\\n/g, "\n");
						const bytes = encodeString(stringLiteral);
						const operand = new InternalStringLiteral(initialData.length + topOfStack, bytes.length);
						expression.push(operand);
						initialData.push(...bytes);
					break;

					case NumericLiteral:
						expression.push(new InternalNumericLiteral(item.text));
					break;
				}
			}

			//end of line delimits expression
			if (expression.length > 0) {
				const [, wasmCode] = compileExpression(expression, lvalueType);
				expression.length = 0;
				const firstItem = this.getItem(row, 0);

				if (firstItem === BuiltIns.DO_WHILE) {
					//move the expression to right before the conditional loop branch
					endOfScopeData[endOfScopeData.length - 1].wasmCode.unshift(...wasmCode);
				} else if (firstItem === BuiltIns.FOR) {
					if (!this.lines[row].items.includes(BuiltIns.STEP)) {
						const incrementOpcode = wasmCode.pop();
						insertPrecondition(wasmCode)

						//if the step size is not specified, use the numeric literal "1"
						const constStep = (new InternalNumericLiteral("1")).getWasmCode(lvalueType);

						endOfScopeData.push({wasmCode: [
							Wasm.get_local, lvalueLocalIndex,
							...constStep,
							incrementOpcode,
							Wasm.set_local, lvalueLocalIndex,
							Wasm.br, 0,
						], isBranchable: true, blockCount: 2});
					} else {
						mainFunc.push(...wasmCode);
					}
				} else {
					mainFunc.push(...wasmCode);
					if (endOfLineInstructions.length === 0) {
						mainFunc.push(Wasm.drop);
					}
				}
			}
			
			if (endOfLineInstructions.length > 0) {
				mainFunc.push(...endOfLineInstructions);
				endOfLineInstructions.length = 0;
			}
		}
		
		while (endOfScopeData.length > 0) {
			const scopeData = endOfScopeData.pop();
			mainFunc.push(...scopeData.wasmCode);
			mainFunc.push(...Array(scopeData.blockCount).fill(Wasm.end));
		}

		const localVarDefinition = [];

		//collapses paramaters of the same type that are next to each other
		let localEntriesCount = 0;
		for (let i = 0; i < localVarMapping.length;) {
			const local = localVarMapping[i];
			const types = getWasmTypes(local.type);
			const type = types[0];
			let count = 0;
			while (i < localVarMapping.length && getWasmTypes(localVarMapping[i].type)[0] === type) {
				count += types.length;
				++i;
			}
			localVarDefinition.push(count, type);
			++localEntriesCount;
		}

		localVarDefinition.unshift(
			...varuint(localEntriesCount), //count of local entries (count and type pairs, not total locals)
		)

		mainFunc = [...localVarDefinition, ...mainFunc, Wasm.end];

		//figure out which function signatures we need to define
		const signatures = [{
			returnType: WasmTypes.void,
			parameterTypes: [],
		}];

		function getSignature(func) {
			const paramTypes = [];

			for (const param of func.signature.parameters) {
				paramTypes.push(...getWasmTypes(param.type))
			}

			return {
				returnType: getWasmTypes(func.signature.returnType)[0], //TODO support String return types
				parameterTypes: paramTypes,
			};
		}

		/**
		 * Return true if the parameter signature matches the signature bound to this
		 * @param signature Current wasm signature being tested
		 */
		function findCallack(signature) {
			if (signature.returnType !== this.returnType) {
				return false;
			}

			if (signature.parameterTypes.length !== this.parameterTypes.length) {
				return false;
			}

			for (let i = 0; i < signature.parameterTypes.length; ++i) {
				if (signature.parameterTypes[i] !== this.parameterTypes[i]) {
					return false;
				}
			}

			return true;
		};

		for (const func of [...importedFuncs, ...predefinedFuncs]) {
			const signature = getSignature(func);

			if (!signatures.find(findCallack, signature)) {
				signatures.push(signature);
			}
		}

		const getTypeIndex = (func) => {
			const signature = getSignature(func);
			return signatures.findIndex(findCallack, signature);
		}


		const typeSection = [
			...varuint(signatures.length), //count of type entries
		];
		for (const signature of signatures) {
			const wasmReturnTypes = [];
			if (signature.returnType !== WasmTypes.void) {
				wasmReturnTypes.push(signature.returnType);
			}

			typeSection.push(WasmTypes.func);
			typeSection.push(signature.parameterTypes.length, ...signature.parameterTypes);
			typeSection.push(wasmReturnTypes.length, ...wasmReturnTypes);
		}
	 
		let importSection = [
			...varuint(importedFuncs.length + 1), //count of things to import

			...encodePrefixedString("env"),
			...encodePrefixedString("memory"),
			externalKind.Memory,
			0, //flag that max pages is not specified
			...varuint(1), //initially 1 page allocated
		]

		for (const func of importedFuncs) {
			importSection.push(
				...encodePrefixedString(func.moduleName),
				...encodePrefixedString(func.fieldName),
				externalKind.Function,
				...varuint(getTypeIndex(func)),
			);
		}

		let functionSection = [
			...varuint(predefinedFuncs.length + 1), //count of function bodies defined later
			...varuint(0), //type indicies (func signitures)
		];

		for (const func of predefinedFuncs) {
			functionSection.push(getTypeIndex(func));
		}

		// let exportSection = [
		//   ...varuint(0), //count of exports

		//   ...wasm.getStringBytesAndData("init"), //length and bytes of function name
		//   externalKind.Function, //export type
		//   ...varuint(importedFunctionsCount), //exporting entry point function
		// ];

		let codeSection = [
			...varuint(predefinedFuncs.length + 1), //count of functions to define
			...varuint(mainFunc.length),
			...mainFunc,
		];

		for (const func of predefinedFuncs) {
			//replace references to dependencies with the index assigned to that function
			const compiledCode = [];
			for (const item of func.wasmCode) {
				if (item.constructor === ImportedFunc) {
					const funcIndex = importedFuncs.indexOf(item);
					compiledCode.push(...varuint(funcIndex));
				}
				else if (item.constructor === PredefinedFunc) {
					const funcIndex = importedFuncs.length + 1 + predefinedFuncs.indexOf(item);
					compiledCode.push(...varuint(funcIndex));
				}
				else {
					compiledCode.push(item);
				}
			}
			codeSection.push(
				...varuint(compiledCode.length),
				...compiledCode
			);
		}

		const globalSection = [
			1, //1 global
			WasmTypes.i32, 1, //1 global of type i32
			Wasm.i32_const, ...varuint(topOfStack), Wasm.end, //initialized to stop of stack
		];

		const wasmModule = [
			0x00, 0x61, 0x73, 0x6d, //magic numbers
			0x01, 0x00, 0x00, 0x00, //wasm version
	
			section.Type,
			...varuint(typeSection.length), //size in bytes of section
			...typeSection,
	
			section.Import,
			...varuint(importSection.length),
			...importSection,
	
			section.Function,
			...varuint(functionSection.length),
			...functionSection,

			section.Global,
			...varuint(globalSection.length),
			...globalSection,
	
			// section.Export,
			// ...varuint(exportSection.length),
			// ...exportSection,

			section.Start,
			[...varuint(importedFuncs.length)].length,
			...varuint(importedFuncs.length), //the start function is the first function after the imports
	
			section.Code,
			...varuint(codeSection.length),
			...codeSection,
		];

		if (initialData.length > 0) {
			const dataSection = [
				1, //1 data segment
	
				0, //memory index 0
				Wasm.i32_const, ...varuint(topOfStack), Wasm.end, //fill memory after stack
				...varuint(initialData.length), //count of bytes to fill in
				...initialData,
			];

			wasmModule.push(
				section.Data,
				...varuint(dataSection.length),
				...dataSection,
			)
		}

		return (new Uint8Array(wasmModule)).buffer;
	}
}

/**
 * gets shortest key that sorts immediately after a key
 * @param {Uint8Array} key
 * @returns {Uint8Array} succeeding key
 */
function getNextKey(key) {
	for (let i = 1; i < key.length; ++i) {
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
function getAvgKey(lowKey, highKey) {
	let diff = 0;
	for (let i = 1; i < Math.max(lowKey.length, highKey.length) + 1; ++i) {
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

function getWasmTypes(type) {
	switch (type) {
		case BuiltIns.I32:
		case BuiltIns.U32:
		case BuiltIns.BOOL:
			return [WasmTypes.i32];

		case BuiltIns.STRING:
			return [WasmTypes.i32, WasmTypes.i32]

		case BuiltIns.I64:
		case BuiltIns.U64:
			return [WasmTypes.i64];

		case BuiltIns.F32:
			return [WasmTypes.f32];

		case BuiltIns.F64:
			return [WasmTypes.f64];
		
		case BuiltIns.VOID:
			return [WasmTypes.void];

		default:
			console.error(type);
			throw "cannot find Wasm type of " + type;
	}
}

function getPrintImplementation(type) {
	switch (type) {
		case BuiltIns.STRING:
			return BuiltIns.PRINT;
		case BuiltIns.I32:
			return BuiltIns.PRINT_I32;
		case BuiltIns.I64:
			return BuiltIns.PRINT_I64;
		case BuiltIns.U32:
			return BuiltIns.PRINT_U32;
		case BuiltIns.U64:
			return BuiltIns.PRINT_U64;
		case BuiltIns.F32:
			return BuiltIns.PRINT_F32;
		case BuiltIns.F64:
			return BuiltIns.PRINT_F64;
		case BuiltIns.BOOL:
			return BuiltIns.PRINT_BOOL;
		default:
			console.error("failed to find implementation to print type", type);
			throw "";
	}
}

class InternalNumericLiteral {
	constructor(rawString) {
		this.value = +rawString;
		this.isFloat = /[\.e]/i.test(rawString);
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
		
		this.isFloat = this.isFloat || operand.hasDecimalPoint;
		if (!this.isFloat) {
			this.value = Math.trunc(this.value);
		}
	}
	
	getWasmCode(expectedType) {
		const outputType = this.getType(expectedType);
		switch (outputType) {
			case BuiltIns.I32:
			case BuiltIns.U32:
			case BuiltIns.BOOL:
				return [Wasm.i32_const, ...varint(this.value)];

			case BuiltIns.I64:
			case BuiltIns.U64:
				return [Wasm.i64_const, ...varint(this.value)];

			case BuiltIns.F32:
				return [Wasm.f32_const, ...encodeF32(this.value)];

			case BuiltIns.F64:
				return [Wasm.f64_const, ...encodeF64(this.value)];
		}
	}

	getType(expectedType = BuiltIns.ANY) {
		if ([BuiltIns.I32, BuiltIns.I64, BuiltIns.U32, BuiltIns.U64,
			BuiltIns.F32, BuiltIns.F64].includes(expectedType)) {
			return expectedType;
		}

		return this.isFloat ? BuiltIns.F32 : BuiltIns.I32;
	}
}

class InternalStringLiteral {
	constructor(address, size) {
		this.address = address;
		this.size = size;
	}
	
	getType() {
		return BuiltIns.STRING;
	}
	
	getWasmCode() {
		return [
			Wasm.i32_const, ...varint(this.address),
			Wasm.i32_const, ...varint(this.size)
		];
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
		return [Wasm.get_local, ...varuint(this.index)];
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

	expression.push(new Symbol("term", -1, -1000, {isFoldable: false})); //terminate expression
	for (let i = 0; i < expression.length; ++i) {
		const item = expression[i];
		if (item.constructor === Symbol) {
			if (item.direction !== 1) {
				//check if the previous operators have a higher precedence than the one that is about to be pushed
				while (operators.length > 0 && operators[operators.length - 1].precedence >= item.precedence) {
					const operator = operators.pop();
					const rightOperand = operands.pop();
					if (operator.isUnary) {
						if (rightOperand.constructor === InternalNumericLiteral) {
							rightOperand.performUnaryOp(operator.appearance);
							operands.push(rightOperand);
						} else {
							const {resultType, wasmCode} = operator.uses.get(rightOperand.getType());
							operands.push(new Placeholder(resultType, ...rightOperand.getWasmCode(), ...wasmCode));
						}
					} else {
						const leftOperand = operands.pop();
						if (operator.isFoldable && leftOperand.constructor === InternalNumericLiteral
						&& rightOperand.constructor === InternalNumericLiteral) {
							leftOperand.performBinaryOp(operator.appearance, rightOperand);
							operands.push(leftOperand);
						} else {
							let type = rightOperand.getType(leftOperand.getType());
							if (operator.isRange) {
								type = expectedType;
							}
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

	if (expectedType !== BuiltIns.ANY && expressionType !== expectedType) {
		const cast = expectedType.casts && expectedType.casts.get(expressionType);
		if (cast) {
			wasmCode.push(...cast.wasmCode);
		} else {
			console.error("cast from", expressionType.text, "to", expectedType.text, "not found");
		}
	}
	
	return [expressionType, wasmCode];
}