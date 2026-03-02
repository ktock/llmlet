// An example file of function definitions and calling.

// Definition of functions in a similar schema as used by OpenAI.
// https://platform.openai.com/docs/guides/function-calling#defining-functions

var get_date_tool = {
    func: (resCB, arg, opts) => {
        var d = (new Date).toISOString();
        opts.output("(get_date) Date: " + d + "\n");
        resCB(d);
    },
    description: {
        type: "function",
        name: "get_date",
        description: "Returns the current time as a ISO 8601 format string",
        parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false
        },
        strict: true
    },
};

var display_tool = {
    func: (resCB, arg, opts) => {
        opts.output("(display) Writing output\n");
        document.getElementById("display-from-model").innerHTML = arg.target_string;
        resCB("true");
    },
    description: {
        type: "function",
        name: "display",
        description: "Receives a string and displays it. HTML syntax is allowed. When it succeeded, this function returns true",
        parameters: {
            type: "object",
            properties: {
                "target_string": {
                    "type": "string",
                    "description": "String to display. HTML syntax is allowed."
                },
            },
            required: ["target_string"],
            additionalProperties: false
        },
        strict: true
    },
};

var function_tools = [display_tool, get_date_tool];

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

var callTools = {
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
}
