#!/usr/bin/env bash

if command -v rustup > /dev/null; then
    #use the nightly build of the rust toolchain
    rustup toolchain install nightly
    rustup update
    rustup target add wasm32-unknown-unknown --toolchain nightly
else
    echo "The rust toolchain is missing.  Please install it from https://sh.rustup.rs"
fi

if [ ! -x wasm-opt ]; then
    echo "Please compile the binaryen utility wasm-opt https://github.com/WebAssembly/binaryen and place the binary in this directory."
fi