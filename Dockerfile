FROM emscripten/emsdk:5.0.2 AS build-dawn

RUN apt-get update && apt-get install -y pkg-config

ENV EMCC_CFLAGS="-g -O3 -pthread -sMEMORY64=2 -msimd128"

RUN git clone https://dawn.googlesource.com/dawn /dawn && \
    cd /dawn && \
    git checkout 4e424acfe8019629d312cabe7242215d0206b32c && \
    python3 tools/fetch_dawn_dependencies.py && \
    mkdir -p /build /build-dawn && \
    cd /build-dawn && \
    emcmake cmake /dawn && \
    make -j$(nproc) emdawnwebgpu_pkg

FROM emscripten/emsdk:5.0.2 AS build-dev

COPY --from=build-dawn /build-dawn /build-dawn
COPY . /work/
WORKDIR /work/
RUN make -j$(nproc) EMDAWNWEBGPU_DIR=/build-dawn/emdawnwebgpu_pkg

FROM scratch
COPY --from=build-dev /work/build/llmlet-mod.js /
COPY --from=build-dev /work/build/llmlet-mod.wasm /
