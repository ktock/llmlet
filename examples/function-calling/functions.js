// An example file of function definitions and calling.

// Definition of functions in a similar schema as used by OpenAI.
// https://platform.openai.com/docs/guides/function-calling#defining-functions

var get_date_tool = {
    func: () => (new Date).toISOString(),
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
    func: (arg) => {
        document.getElementById("display-from-model").innerHTML = arg.target_string;
        return true;
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

// An example system promt to enable function calling from the model.
function createToolsSystemPrompt() {
    var prompt = `
You may call functions using this JSON schema:

{
  "type": "object",
  "properties": {
    "function_call": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "arguments": { "type": "object" }
      },
      "required": ["name", "arguments"]
    }
  }
}

Available functions:

[`;

    for (const k in function_tools) {
        prompt += JSON.stringify(function_tools[k].description);
        prompt += ',';
    }
    
    prompt += `]

You can reply using natural language to the user. However, when calling a function, respond ONLY using the JSON format. Then the JSON-formatted result value from the called function will be provided as the next input. Only one function can be called at once.
`
    return prompt;
}

// A function to hook output data from the model and invoke the specified function.
function callTools(data) {
    var output;
    try {
        output = JSON.parse(data.replace(/<think>[\s\S]*?<\/think>/g, ""));
    } catch (e) {
        console.log("this is not a JSON output " + e);
        return "";
    }
    var res;
    var ok;
    if ((output.function_call != null) && (output.function_call.name != "")) {
        var targetname = output.function_call.name;
        for (const k in function_tools) {
            if (function_tools[k].description.name == targetname) {
                res = function_tools[k].func(output.function_call.arguments);
                ok = true;
            }
        }
    }
    if (ok) {
        return JSON.stringify({
            name: output.function_call.name,
            content: res,
        });
    }
    return "";
}
