#!/usr/bin/env bash

#set stack size to half a kilobyte.  Rust's default stack size is 2 MB
#specifying "--strip-debug" 
RUSTFLAGS="-C link-arg=--strip-debug -C link-arg=-zstack-size=32768" cargo +nightly build --target wasm32-unknown-unknown --release
if [[ $? != 0 ]]; then
	exit 1
fi

#I do not intend to load more than one module at a time, so these two exports are not necessary
#this command also removes all custom sections by default, namely the producer's section
#Binaryen has no easy way to specify which exports are unwanted, so I wrote this small utility.
#./small-wasm-trimmer --remove-exports "__heap_base" "__data_end" < target/wasm32-unknown-unknown/release/touchscript_backend.wasm > backend.wasm 2>/dev/null

#When debugging, allow myself to inspect the generated wasm file without wasm-opt restructuring it
if [[ $1 != "--skip-wasm-opt" ]]; then
	if [[ -x wasm-opt ]]; then
		#use Binaryen's wasm-opt utility to strip out unused globals, functions, etc
		./wasm-opt backend.wasm -Oz -o backend.wasm
	else
		echo "Please compile the binaryen utility wasm-opt https://github.com/WebAssembly/binaryen and place the binary in this directory."
		echo "Use the argument \"--skip-wasm-opt\" if you want a less optimized wasm module."
	fi
fi