export function varint(value) {
	const bytes = [];
	let byte;
	
	do {
		byte = value & 0x7F;
		value = Math.floor(value / 128);
	
		/* sign bit of byte is second high order bit (0x40) */
		if ((value !== 0 && (byte & 0x40) === 0) || (value !== -1 && (byte & 0x40) !== 0)) {
			byte |= 0x80;
		}
		
		bytes.push(byte);
	} while (byte > 0x7F);

	return bytes;
}
  
export function varuint(value) {
	const bytes = [];
	
	do {
		let byte = value & 0x7F;
		value = Math.floor(value / 128);

		if (value !== 0) {/* more bytes to come */
			byte |= 0x80;
		}
		
		bytes.push(byte);
	} while (value !== 0);

	return bytes;
}

const UTF8Encoder = new TextEncoder("utf-8");
export function encodeString(str) {
	return UTF8Encoder.encode(str);
}
export function encodePrefixedString(str) {
	return [...varuint(str.length), ...encodeString(str)];
}

export const section = {
	Type: 1,
	Import: 2,
	Function: 3,
	Table: 4,
	Memory: 5,
	Global: 6,
	Export: 7,
	Start: 8,
	Element: 9,
	Code: 10,
	Data: 11,
}

export const types = {
	i32: 0x7F,
	i64: 0x7E,
	f32: 0x7D,
	f64: 0x7C,
	anyFunc: 0x70,
	func: 0x60,
	void: 0x40,
}

export const externalKind = {
	Function: 0,
	Table: 1,
	Memory: 2,
	Global: 3,
}

const wasmOpcodes = [
	"unreachable",
	"nop",
	"block",
	"loop",
	"if",
	"else",
	undefined,
	undefined,
	undefined,
	undefined,
	undefined,
	"end",
	"br",
	"br_if",
	"br_table",
	"return",
	"call", //0x10
	"call_indirect",
	undefined,
	undefined,
	undefined,
	undefined,
	undefined,
	undefined,
	undefined,
	undefined,
	"drop",
	"select",
	undefined,
	undefined,
	undefined,
	undefined,
	"get_local", //0x20
	"set_local",
	"tee_local",
	"get_global",
	"set_global",
	undefined,
	undefined,
	undefined,
	"i32.load",
	"i64.load",
	"f32.load",
	"f64.load",
	"i32.load8_s",
	"i32.load8_u",
	"i32.load16_s",
	"i32.load16_u",
	"i64.load8_s", //0x30
	"i64.load8_u",
	"i64.load16_s",
	"i64.load16_u",
	"i64.load32_s",
	"i64.load32_u",
	"i32.store",
	"i64.store",
	"f32.store",
	"f64.store",
	"i32.store8",
	"i32.store16",
	"i64.store8",
	"i64.store16",
	"i64.store32",
	"memory.size",
	"memory.grow", //0x40
	"i32.const",
	"i64.const",
	"f32.const",
	"f64.const",
	"i32.eqz",
	"i32.eq",
	"i32.ne",
	"i32.lt_s",
	"i32.lt_u",
	"i32.gt_s",
	"i32.gt_u",
	"i32.le_s",
	"i32.le_u",
	"i32.ge_s",
	"i32.ge_u",
	"i64.eqz", //0x50
	"i64.eq",
	"i64.ne",
	"i64.lt_s",
	"i64.lt_u",
	"i64.gt_s",
	"i64.gt_u",
	"i64.le_s",
	"i64.le_u",
	"i64.ge_s",
	"i64.ge_u",
	"f32.eq",
	"f32.ne",
	"f32.lt",
	"f32.gt",
	"f32.le",
	"f32.ge", //0x60
	"f64.eq",
	"f64.ne",
	"f64.lt",
	"f64.gt",
	"f64.le",
	"f64.ge",
	"i32.clz",
	"i32.ctz",
	"i32.popcnt",
	"i32.add",
	"i32.sub",
	"i32.mul",
	"i32.div_s",
	"i32.div_u",
	"i32.rem_s",
	"i32.rem_u", //0x70
	"i32.and",
	"i32.or",
	"i32.xor",
	"i32.shl",
	"i32.shr_s",
	"i32.shr_u",
	"i32.rotl",
	"i32.rotr",
	"i64.clz",
	"i64.ctz",
	"i64.popcnt",
	"i64.add",
	"i64.sub",
	"i64.mul",
	"i64.div_s",
	"i64.div_u", //0x80
	"i64.rem_s",
	"i64.rem_u",
	"i64.and",
	"i64.or",
	"i64.xor",
	"i64.shl",
	"i64.shr_s",
	"i64.shr_u",
	"i64.rotl",
	"i64.rotr",
	"f32.abs",
	"f32.neg",
	"f32.ceil",
	"f32.floor",
	"f32.trunc",
	"f32.nearest", //0x90
	"f32.sqrt",
	"f32.add",
	"f32.sub",
	"f32.mul",
	"f32.div",
	"f32.min",
	"f32.max",
	"f32.copysign",
	"f64.abs",
	"f64.neg",
	"f64.ceil",
	"f64.floor",
	"f64.trunc",
	"f64.nearest",
	"f64.sqrt",
	"f64.add", //0xa0
	"f64.sub",
	"f64.mul",
	"f64.div",
	"f64.min",
	"f64.max",
	"f64.copysign",
	"i32.wrap/i64",
	"i32.trunc_s/f32",
	"i32.trunc_u/f32",
	"i32.trunc_s/f64",
	"i32.trunc_u/f64",
	"i64.extend_s/i32",
	"i64.extend_u/i32",
	"i64.trunc_s/f32",
	"i64.trunc_u/f32",
	"i64.trunc_s/f64", //0xb0
	"i64.trunc_u/f64",
	"f32.convert_s/i32",
	"f32.convert_u/i32",
	"f32.convert_s/i64",
	"f32.convert_u/i64",
	"f32.demote/f64",
	"f64.convert_s/i32",
	"f64.convert_u/i32",
	"f64.convert_s/i64",
	"f64.convert_u/i64",
	"f64.promote/f32",
	"i32.reinterpret/f32",
	"i64.reinterpret/f64",
	"f32.reinterpret/i32",
	"f64.reinterpret/i64",
];

const opcodeNameToIDMapping = {};

for (let i = 0; i < wasmOpcodes.length; ++i) {
	if (wasmOpcodes[i] !== undefined) {
		const propName = wasmOpcodes[i].replace(/\./, "_").replace(/\//, "_from_");
		opcodeNameToIDMapping[propName] = i;
	}
}

export default opcodeNameToIDMapping;