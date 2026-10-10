#!/bin/bash
# Compile le moteur Final Touch en WebAssembly (public/engine/tf.js + tf.wasm).
set -e
cd "$(dirname "$0")"
SRC="$HOME/Documents/Touche-Finale/Source"
mkdir -p ../public/engine
em++ web.cpp -I"$SRC" -std=c++17 -O3 -msimd128 -fno-exceptions \
  -sMODULARIZE=1 -sEXPORT_NAME=TFEngine -sENVIRONMENT=worker \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sMAXIMUM_MEMORY=1GB \
  -sEXPORTED_FUNCTIONS=_tf_alloc,_tf_free,_tf_process -sEXPORTED_RUNTIME_METHODS=HEAPF32 \
  -o ../public/engine/tf.js
ls -la ../public/engine
