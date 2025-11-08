BUILD_DIR ?= $(CURDIR)/build/
EMDAWNWEBGPU_DIR ?= $(CURDIR)/build/emdawnwebgpu_pkg

LLAMA_CPP_LIBS=$(BUILD_DIR)/src/libllama.a $(BUILD_DIR)/common/libcommon.a $(BUILD_DIR)/ggml/src/libggml.a $(BUILD_DIR)/ggml/src/libggml-base.a $(BUILD_DIR)/ggml/src/libggml-cpu.a $(BUILD_DIR)/ggml/src/ggml-webgpu/libggml-webgpu.a $(BUILD_DIR)/ggml/src/ggml-rpc/libggml-rpc.a

EMCC_COMMON_CFLAGS=-g -O3 -pthread -sMEMORY64=2 -mno-simd128

llmlet-mod.js: $(LLAMA_CPP_LIBS)
	em++ $(EMCC_COMMON_CFLAGS) -sPROXY_TO_PTHREAD -sASYNCIFY=1 -sFORCE_FILESYSTEM=1 -sEXPORT_ES6=1 -sEXPORTED_FUNCTIONS=_main,_emscripten_force_exit -sEXIT_RUNTIME=1 -sEXPORTED_RUNTIME_METHODS=FS,PThread,ENV,release_conn -sNO_DISABLE_EXCEPTION_CATCHING -sABORTING_MALLOC=0 -sALLOW_MEMORY_GROWTH=1 \
	-o $(BUILD_DIR)/llmlet-mod.js \
	-I ./llama.cpp/ggml/include/ -I./llama.cpp/include/ -I./llama.cpp/common/ \
	-L$(BUILD_DIR)/src/ -lllama \
	-L$(BUILD_DIR)/common/ -lcommon \
	-L$(BUILD_DIR)/ggml/src/ -lggml -lggml-base -lggml-cpu \
	-L$(BUILD_DIR)/ggml/src/ggml-webgpu/ -lggml-webgpu \
	-L$(BUILD_DIR)/ggml/src/ggml-rpc/ -lggml-rpc \
	-L./ -lllmlet.js \
	--use-port=$(EMDAWNWEBGPU_DIR)/emdawnwebgpu.port.py \
	./main.cpp

llama.cpp/build: export EMCC_CFLAGS = $(EMCC_COMMON_CFLAGS)

llama.cpp/build:
	cd ./llama.cpp && \
        emcmake cmake -B $(BUILD_DIR) -DGGML_WEBGPU=ON \
                                      -DEMDAWNWEBGPU_DIR=$(EMDAWNWEBGPU_DIR) \
                                      -DLLAMA_CURL=OFF \
                                      -DLLAMA_BUILD_TESTS=OFF \
                                      -DLLAMA_BUILD_TOOLS=OFF \
                                      -DLLAMA_BUILD_EXAMPLES=OFF \
                                      -DLLAMA_BUILD_SERVER=OFF \
                                      -DGGML_RPC=ON && \
        cmake --build $(BUILD_DIR) --config Release -j$(nproc)

$(LLAMA_CPP_LIBS): llama.cpp/build
