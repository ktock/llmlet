// An example file of function definitions and calling.

// Definition of functions in a similar schema as used by OpenAI.
// https://platform.openai.com/docs/guides/function-calling#defining-functions

var systemInput;

function registerSystemInput(f) {
    systemInput = f;
}

var system_tool = {
    func: (resCB, arg, opts) => {
        if (systemInput) {
            opts.output("(system tool) Running: " + arg.command + "\n");
            return systemInput((res) => {
                opts.output("(system tool) Output:\n" + res + "\n");
                resCB(res);
            }, arg.command);
        }
    },
    description: {
        type: "function",
        name: "system",
        description: "Runs a shell command and returns the output.",
        parameters: {
            type: "object",
            properties: {
                "command": {
                    "type": "string",
                    "description": "Shell command to run."
                },
            },
            required: ["command"],
            additionalProperties: false
        },
        strict: true
    },
};

var function_tools = [system_tool];

const functionSchema = `{
  "type": "object",
  "properties": {
    "thinking": {
      "type": "string"
    },
    "response": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["call", "message"]
        },
        "data": {
          "oneOf": [
            {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "arguments": { "type": "object" }
              },
              "required": ["name", "arguments"],
              "additionalProperties": false
            },
            {
              "type": "string"
            }
          ]
        }
      },
      "required": ["type", "data"],
      "additionalProperties": false
    }
  },
  "required": ["thinking", "response"],
  "additionalProperties": false
}`;

// An example system promt to enable function calling from the model.
function createToolsSystemPrompt() {
    var prompt = `
You may call functions following the user's prompt.

You MUST respond ONLY using the JSON format defined as the following JSON schema.
`;

    prompt += functionSchema;

    prompt += `
You MAY use the "thinking" field for your own thinking and the "response" field for the response to the user.

When you tell a message to the user using natural language using the "response" field, you MUST specify "message" in the "type" field and contain your reply as a string in the "data" field.

When you call a function using the "response" field, you MUST specify "call" in the "type" field, the function name in the "data.name" field and the arguments in the "data.arguments" field.
You MUST NOT wrap or embed one function call inside the arguments of another.
After you call a function, the result from the function will be provided as the next input.
`
    
    prompt += `
Available functions: [`;

    for (const k in function_tools) {
        prompt += JSON.stringify(function_tools[k].description);
        prompt += ',';
    }
    
    prompt += `]`
    return prompt;
}

var callSystem = {
    // A function to hook output data from the model and invoke the specified function.
    handle: (data, resCB, opts) => {
        var output;
        try {
            output = JSON.parse(data.replace(/<think>[\s\S]*?<\/think>/g, ""));
        } catch (e) {
            console.log("this is not a JSON output " + e);
            return "";
        }
        var ok = false;
        if ((output.response.type == "call") && (output.response.data.name != "")) {
            var targetname = output.response.data.name;
            for (const k in function_tools) {
                if (function_tools[k].description.name == targetname) {
                    function_tools[k].func(resCB, output.response.data.arguments, opts);
                    ok = true;
                }
            }
        } else if ((output.response.type == "message") && (output.response.data != "")) {
            opts.output(output.response.data + "\n");
        }
        return ok;
    }
};
