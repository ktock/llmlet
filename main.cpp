// This is a patched version of llama.cpp's simple-chat example for the browser usage.
// https://github.com/ggml-org/llama.cpp/blob/10e9780154365b191fb43ca4830659ef12def80f/examples/simple-chat/simple-chat.cpp

#include "ggml-rpc.h"
#include "ggml-webgpu.h"
#include "common.h"
#include "log.h"
#include "llama.h"
#include "json-schema-to-grammar.h"
#include "sampling.h"
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <unistd.h>
#include <thread>
#include <iostream>
#include <fstream>

#include <nlohmann/json.hpp>
using json = nlohmann::ordered_json;

extern "C" {
  int get_next_prompt(char*, int);
  int get_system_prompt(char*, int);
}

#include <emscripten.h>
int wait_next_prompt(char* user, int len) {
    int res = 0;
    while (true) {
        res = get_next_prompt(user, len);
        if (res < 0) {
            return 0;
        } else if (res > 0) {
            break;
        }
        emscripten_sleep(0);
    }
    return res;
}

#include <emscripten.h>
EM_ASYNC_JS(int, webgpu_available, (), {
    if (!('gpu' in navigator)) {
      return 0;
    }
    const a = await navigator.gpu.requestAdapter();
    console.log(a);
    if (a == null) {
      return 0;
    }
    return 1;
});

static int start_backend(std::vector<ggml_backend_dev_t> devices) {  
    const char * cache_dir = nullptr;

    ggml_backend_reg_t reg = ggml_backend_reg_by_name("RPC");
    if (!reg) {
        fprintf(stderr, "Failed to find RPC backend\n");
        return 1;
    }

    auto start_server_fn = (decltype(ggml_backend_rpc_start_server)*) ggml_backend_reg_get_proc_address(reg, "ggml_backend_rpc_start_server");
    if (!start_server_fn) {
        fprintf(stderr, "Failed to obtain RPC backend start server function\n");
        return 1;
    }

    int n_threads   = std::max(1U, std::thread::hardware_concurrency()/2);
    start_server_fn("", cache_dir, n_threads, devices.size(), devices.data());

    return 0;
}

int main(int argc, char ** argv) {
    // path to the model gguf file
    std::string model_path;
    // number of layers to offload to the GPU
    int ngl = -1;
    // context size
    int n_ctx = 4096;

    bool debug = false;

    std::vector<std::string> rpc_servers;
    
    bool rpcbackend = false;

    std::string schemafile;

    // parse command line arguments

    {
        int i = 1;
        for (; i < argc; i++) {
            if (strcmp(argv[i], "-m") == 0) {
                if (i + 1 < argc) {
                    model_path = argv[++i];
                } else {
                    return 1;
                }
            } else if (strcmp(argv[i], "-c") == 0) {
                if (i + 1 < argc) {
                    try {
                        n_ctx = std::stoi(argv[++i]);
                    } catch (...) {
                        return 1;
                    }
                } else {
                    return 1;
                }
            } else if (strcmp(argv[i], "-ngl") == 0) {
                if (i + 1 < argc) {
                    try {
                        ngl = std::stoi(argv[++i]);
                    } catch (...) {
                        return 1;
                    }
                } else {
                    return 1;
                }
            } else if (strcmp(argv[i], "-d") == 0) {
                debug = true;
            } else if (strcmp(argv[i], "-rpcbackend") == 0) {
                rpcbackend = true;
            } else if (strcmp(argv[i], "-rpc") == 0) {
                if (i + 1 < argc) {
                    rpc_servers.push_back(argv[++i]);
                } else {
                    return 1;
                }
            } else if (strcmp(argv[i], "-j") == 0) {
                if (i + 1 < argc) {
                    schemafile = argv[++i];
                } else {
                    return 1;
                }
            } else {
                // prompt starts here
                break;
            }
        }
    }

    if (debug) {
      common_log_set_verbosity_thold(LOG_DEFAULT_DEBUG);
    } else {
      common_log_set_verbosity_thold(LOG_DEFAULT_LLAMA);
    }
    common_init();

    ggml_backend_load_all();

    std::vector<ggml_backend_dev_t> devices;
    // Try non-CPU devices first
    if (webgpu_available()) {
        ggml_backend_dev_t dev = ggml_backend_dev_by_name(GGML_WEBGPU_NAME);
        if (dev) {
            devices.push_back(dev);
        }
    } else {
        fprintf(stderr, "WebGPU is not available. Trying to fallback to CPU\n");
    }

    if (rpcbackend) {
      // If there are no accelerators, fallback to CPU device
      if (devices.empty()) {
        ggml_backend_dev_t dev = ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU);
        if (dev) {
          devices.push_back(dev);
        }
      }

      if (devices.empty()) {
        fprintf(stderr, "No devices found on this node\n");
        return 1;
      }

      return start_backend(devices);
    }

    if (model_path.empty()) {
        return 1;
    }

    if (!rpc_servers.empty()) {
        ggml_backend_reg_t rpc_reg = ggml_backend_reg_by_name("RPC");
        if (!rpc_reg) {
            throw std::invalid_argument("failed to find RPC backend");
            return 1;
        }
        typedef ggml_backend_reg_t (*ggml_backend_rpc_add_server_t)(const char * endpoint);
        ggml_backend_rpc_add_server_t ggml_backend_rpc_add_server_fn = (ggml_backend_rpc_add_server_t) ggml_backend_reg_get_proc_address(rpc_reg, "ggml_backend_rpc_add_server");
        if (!ggml_backend_rpc_add_server_fn) {
            throw std::invalid_argument("failed to find RPC add server function");
        }
        for (const auto & server : rpc_servers) {
            auto reg = ggml_backend_rpc_add_server_fn(server.c_str());
            ggml_backend_register(reg);
        }
    }
    for (size_t i = 0; i < ggml_backend_dev_count(); ++i) {
        ggml_backend_dev_t dev = ggml_backend_dev_get(i);
        ggml_backend_reg_t reg = ggml_backend_dev_backend_reg(dev);
        if (ggml_backend_reg_name(reg) == std::string("RPC")) {
            devices.push_back(dev);
        }
    }

    // If there are no accelerators, fallback to CPU device
    if (devices.empty()) {
      ggml_backend_dev_t dev = ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU);
      if (dev) {
        devices.push_back(dev);
      }
    }

    if (devices.empty()) {
      fprintf(stderr, "No devices found on this node\n");
      return 1;
    }

    llama_model_params model_params = llama_model_default_params();
    if (ngl != -1) {
        model_params.n_gpu_layers = ngl;
    }
    model_params.use_mmap = false;
    devices.push_back(nullptr);
    model_params.devices = devices.data();

    llama_model * model = llama_model_load_from_file(model_path.c_str(), model_params);

    if (model == NULL) {
        fprintf(stderr , "%s: error: unable to load model\n" , __func__);
        return 1;
    }

    const llama_vocab * vocab = llama_model_get_vocab(model);

    // initialize the context

    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = n_ctx;

    llama_context * ctx = llama_init_from_model(model, ctx_params);

    if (ctx == NULL) {
        fprintf(stderr , "%s: error: failed to create the llama_context\n" , __func__);
        return 1;
    }

    struct common_params_sampling smpl_params;
    const bool enable_schema = !schemafile.empty();
    if (enable_schema) {
      std::ifstream sf(schemafile);
      smpl_params.grammar = json_schema_to_grammar(json::parse(sf));
      fprintf(stderr, "%s\n", smpl_params.grammar.c_str());
    }

    // helper function to evaluate a prompt and generate a response
    auto generate = [&](const std::string & prompt) {
        std::string response;

        const bool is_first = llama_memory_seq_pos_max(llama_get_memory(ctx), 0) == -1;

        // tokenize the prompt
        const int n_prompt_tokens = -llama_tokenize(vocab, prompt.c_str(), prompt.size(), NULL, 0, is_first, true);
        std::vector<llama_token> prompt_tokens(n_prompt_tokens);
        if (llama_tokenize(vocab, prompt.c_str(), prompt.size(), prompt_tokens.data(), prompt_tokens.size(), is_first, true) < 0) {
            GGML_ABORT("failed to tokenize the prompt\n");
        }

        common_sampler * smpl = common_sampler_init(model, smpl_params);

        // prepare a batch for the prompt
        llama_batch batch = llama_batch_get_one(prompt_tokens.data(), prompt_tokens.size());
        llama_token new_token_id;
        while (true) {
            // check if we have enough space in the context to evaluate this batch
            int n_ctx = llama_n_ctx(ctx);
            int n_ctx_used = llama_memory_seq_pos_max(llama_get_memory(ctx), 0) + 1;
            if (n_ctx_used + batch.n_tokens > n_ctx) {
                fprintf(stderr, "context size exceeded\n");
                exit(0);
            }

            int ret = llama_decode(ctx, batch);
            if (ret != 0) {
                GGML_ABORT("failed to decode, ret = %d\n", ret);
            }

            // sample the next token
            new_token_id = common_sampler_sample(smpl, ctx, -1);

            if (enable_schema) {
                common_sampler_accept(smpl, new_token_id, /* accept_grammar= */ true);
            }

            // is it an end of generation?
            if (llama_vocab_is_eog(vocab, new_token_id)) {
                break;
            }

            // convert the token to a string, print it and add it to the response
            char buf[256];
            int n = llama_token_to_piece(vocab, new_token_id, buf, sizeof(buf), 0, true);
            if (n < 0) {
                GGML_ABORT("failed to convert token to piece\n");
            }
            std::string piece(buf, n);
            printf("%s", piece.c_str());
            fflush(stdout);
            response += piece;

            // prepare the next batch with the sampled token
            batch = llama_batch_get_one(&new_token_id, 1);
        }

        common_sampler_free(smpl);

        return response;
    };

    std::vector<llama_chat_message> messages;
    std::vector<char> formatted(llama_n_ctx(ctx));

    char *system = (char *)malloc(n_ctx);
    size_t len = get_system_prompt(system, n_ctx);
    if (len > 0) {
      messages.push_back({"system", strdup(system)});
      fprintf(stderr, "%s\n", system);
    }
    
    int prev_len = 0;
    char *user = (char *)malloc(n_ctx);
    while (true) {
        size_t len = get_next_prompt(user, n_ctx);

        if (len == 0) {
            break;
        }

        const char * tmpl = llama_model_chat_template(model, /* name */ nullptr);

        // add the user input to the message list and format it
        messages.push_back({"user", strdup(user)});
        int new_len = llama_chat_apply_template(tmpl, messages.data(), messages.size(), true, formatted.data(), formatted.size());
        if (new_len > (int)formatted.size()) {
            formatted.resize(new_len);
            new_len = llama_chat_apply_template(tmpl, messages.data(), messages.size(), true, formatted.data(), formatted.size());
        }
        if (new_len < 0) {
            fprintf(stderr, "failed to apply the chat template\n");
            return 1;
        }

        // remove previous messages to obtain the prompt to generate the response
        std::string prompt(formatted.begin() + prev_len, formatted.begin() + new_len);

        // generate a response
        std::string response = generate(prompt);
        printf("\n");

        // add the response to the messages
        messages.push_back({"assistant", strdup(response.c_str())});
        prev_len = llama_chat_apply_template(tmpl, messages.data(), messages.size(), false, nullptr, 0);
        if (prev_len < 0) {
            fprintf(stderr, "failed to apply the chat template\n");
            return 1;
        }
    }

    // free resources
    for (auto & msg : messages) {
        free(const_cast<char *>(msg.content));
    }
    llama_free(ctx);
    llama_model_free(model);

    return 0;
}
