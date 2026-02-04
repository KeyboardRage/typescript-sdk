/**
 * Dynamic Tool Loading Example
 * 
 * This example demonstrates how to dynamically load and modify tools during execution.
 * You can:
 * 1. Access the list of available tools in the TurnContext
 * 2. Modify the tools list via nextTurnParams
 * 3. Add new tools based on execution results
 * 4. Remove tools to control what's available in subsequent turns
 */

import { OpenRouter } from '@openrouter/sdk';
import { tool, stepCountIs } from '@openrouter/sdk';
import { z } from 'zod/v4';
import type { TurnContext } from '@openrouter/sdk/lib/tool-types';

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// Example 1: Tool that can see other available tools
const inspectorTool = tool({
  name: 'inspect_tools',
  description: 'Shows which tools are currently available',
  inputSchema: z.object({
    query: z.string().describe('What to inspect'),
  }),
  outputSchema: z.object({
    tools: z.array(z.string()),
    count: z.number(),
  }),
  execute: async (params, context?: TurnContext) => {
    const toolNames = context?.tools?.map(t => t.function.name) ?? [];
    console.log('📋 Currently available tools:', toolNames);
    
    return {
      tools: toolNames,
      count: toolNames.length,
    };
  },
});

// Example 2: Tool that dynamically adds new capabilities
const toolLoaderTool = tool({
  name: 'load_tools',
  description: 'Loads additional tools based on what capabilities are needed',
  inputSchema: z.object({
    capability: z.enum(['math', 'text', 'both']).describe('Which capability to load'),
  }),
  outputSchema: z.object({
    loaded: z.array(z.string()),
    message: z.string(),
  }),
  nextTurnParams: {
    tools: (params, context) => {
      const newTools = [...context.tools];
      
      // Add math tools if requested
      if (params.capability === 'math' || params.capability === 'both') {
        const calculatorTool = tool({
          name: 'calculator',
          description: 'Performs arithmetic operations',
          inputSchema: z.object({
            operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
            a: z.number(),
            b: z.number(),
          }),
          outputSchema: z.object({
            result: z.number(),
          }),
          execute: async (params) => {
            let result: number;
            switch (params.operation) {
              case 'add': result = params.a + params.b; break;
              case 'subtract': result = params.a - params.b; break;
              case 'multiply': result = params.a * params.b; break;
              case 'divide': result = params.a / params.b; break;
            }
            console.log(`🔢 Calculator: ${params.a} ${params.operation} ${params.b} = ${result}`);
            return { result };
          },
        });
        
        newTools.push(calculatorTool);
      }
      
      // Add text tools if requested
      if (params.capability === 'text' || params.capability === 'both') {
        const textProcessorTool = tool({
          name: 'text_processor',
          description: 'Processes text (uppercase, lowercase, reverse)',
          inputSchema: z.object({
            text: z.string(),
            operation: z.enum(['uppercase', 'lowercase', 'reverse']),
          }),
          outputSchema: z.object({
            result: z.string(),
          }),
          execute: async (params) => {
            let result: string;
            switch (params.operation) {
              case 'uppercase': result = params.text.toUpperCase(); break;
              case 'lowercase': result = params.text.toLowerCase(); break;
              case 'reverse': result = params.text.split('').reverse().join(''); break;
            }
            console.log(`📝 Text Processor: ${params.operation}("${params.text}") = "${result}"`);
            return { result };
          },
        });
        
        newTools.push(textProcessorTool);
      }
      
      return newTools;
    },
  },
  execute: async (params) => {
    const loaded: string[] = [];
    
    if (params.capability === 'math' || params.capability === 'both') {
      loaded.push('calculator');
    }
    if (params.capability === 'text' || params.capability === 'both') {
      loaded.push('text_processor');
    }
    
    console.log(`🔧 Loading tools: ${loaded.join(', ')}`);
    
    return {
      loaded,
      message: `Loaded ${loaded.length} new tool(s)`,
    };
  },
});

// Example 3: Tool that can restrict available tools
const securityTool = tool({
  name: 'lock_tools',
  description: 'Restricts available tools for security',
  inputSchema: z.object({
    allowedTools: z.array(z.string()).describe('Names of tools that should remain available'),
  }),
  outputSchema: z.object({
    restricted: z.array(z.string()),
    message: z.string(),
  }),
  nextTurnParams: {
    tools: (params, context) => {
      // Keep only the tools specified in allowedTools
      return context.tools.filter(t => 
        params.allowedTools.includes(t.function.name)
      );
    },
  },
  execute: async (params, context?: TurnContext) => {
    const currentTools = context?.tools?.map(t => t.function.name) ?? [];
    const restricted = currentTools.filter(name => !params.allowedTools.includes(name));
    
    console.log(`🔒 Restricting tools. Allowed: ${params.allowedTools.join(', ')}`);
    console.log(`🔒 Restricted: ${restricted.join(', ')}`);
    
    return {
      restricted,
      message: `Restricted ${restricted.length} tool(s)`,
    };
  },
});

// Example usage
async function demonstrateDynamicTools() {
  console.log('\n=== Dynamic Tool Loading Demo ===\n');
  
  // Start with just the basic tools
  const result = await client.callModel({
    model: 'anthropic/claude-3.5-sonnet',
    input: [
      {
        role: 'user',
        content: `Please follow these steps:
1. First, use inspect_tools to see what tools are available
2. Then, use load_tools to load math capabilities
3. Use the calculator tool to multiply 7 by 8
4. Use inspect_tools again to confirm the calculator is now available`,
      },
    ],
    tools: [inspectorTool, toolLoaderTool],
    stopWhen: stepCountIs(10),
  });
  
  const response = await result.getText();
  console.log('\n📤 Final Response:', response);
  
  // Example with security restrictions
  console.log('\n=== Security Restrictions Demo ===\n');
  
  const secureResult = await client.callModel({
    model: 'anthropic/claude-3.5-sonnet',
    input: [
      {
        role: 'user',
        content: `First inspect the available tools, then use lock_tools to keep only the inspect_tools tool available`,
      },
    ],
    tools: [inspectorTool, securityTool, toolLoaderTool],
    stopWhen: stepCountIs(5),
  });
  
  const secureResponse = await secureResult.getText();
  console.log('\n📤 Secure Response:', secureResponse);
}

// Run the examples
demonstrateDynamicTools().catch(console.error);
