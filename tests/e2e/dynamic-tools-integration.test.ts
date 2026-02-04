import * as dotenv from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { OpenRouter, tool, stepCountIs } from '../../src/index.js';
import type { TurnContext } from '../../src/lib/tool-types.js';

dotenv.config();

describe('Dynamic Tool Loading E2E', () => {
  let client: OpenRouter;

  beforeAll(() => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    client = new OpenRouter({
      apiKey,
    });
  });

  it('should allow tools to add new tools dynamically via nextTurnParams', async () => {
    let executionLog: string[] = [];
    let toolsSeenInContext: string[] = [];

    // Initial tool that can add more tools
    const controllerTool = tool({
      name: 'controller',
      description: 'Controls the available tools. Call this first with add=true to add the calculator tool.',
      inputSchema: z.object({
        add: z.boolean().describe('Whether to add the calculator tool'),
      }),
      outputSchema: z.object({
        message: z.string(),
        toolCount: z.number(),
      }),
      nextTurnParams: {
        tools: (params, context) => {
          if (params.add) {
            // Add calculator tool dynamically
            const calculatorTool = tool({
              name: 'calculator',
              description: 'Performs basic arithmetic. Add two numbers together.',
              inputSchema: z.object({
                a: z.number().describe('First number'),
                b: z.number().describe('Second number'),
              }),
              outputSchema: z.object({
                result: z.number(),
              }),
              execute: async (params, ctx?: TurnContext) => {
                executionLog.push(`calculator executed with a=${params.a}, b=${params.b}`);
                if (ctx?.tools) {
                  toolsSeenInContext.push(...ctx.tools.map(t => t.function.name));
                }
                return { result: params.a + params.b };
              },
            });

            return [...context.tools, calculatorTool];
          }
          return context.tools;
        },
      },
      execute: async (params, ctx?: TurnContext) => {
        executionLog.push(`controller executed with add=${params.add}`);
        const toolCount = ctx?.tools?.length ?? 0;
        if (ctx?.tools) {
          toolsSeenInContext.push(...ctx.tools.map(t => t.function.name));
        }
        return {
          message: params.add ? 'Added calculator tool' : 'No tools added',
          toolCount,
        };
      },
    });

    // Call the model with just the controller tool initially
    const result = await client.callModel({
      model: 'anthropic/claude-3.5-sonnet',
      input: [
        {
          role: 'user',
          content: 'First call the controller tool with add=true, then use the calculator to add 5 and 3.',
        },
      ],
      tools: [controllerTool],
      stopWhen: stepCountIs(5),
    });

    const text = await result.getText();

    // Verify the flow happened
    expect(executionLog.length).toBeGreaterThan(0);
    expect(executionLog.some(log => log.includes('controller executed'))).toBe(true);
    
    // If the model called the calculator, it should have been added dynamically
    const calculatorWasCalled = executionLog.some(log => log.includes('calculator executed'));
    if (calculatorWasCalled) {
      expect(text).toBeTruthy();
      // The calculator should have seen at least 2 tools (controller + calculator)
      const uniqueTools = [...new Set(toolsSeenInContext)];
      expect(uniqueTools.length).toBeGreaterThanOrEqual(2);
    }

    console.log('Execution log:', executionLog);
    console.log('Tools seen:', toolsSeenInContext);
    console.log('Final response:', text);
  }, 60000); // 60 second timeout for API call

  it('should allow tools to see other available tools in context', async () => {
    let capturedToolNames: string[] = [];

    const inspectorTool = tool({
      name: 'inspector',
      description: 'Inspects which tools are currently available',
      inputSchema: z.object({
        query: z.string(),
      }),
      outputSchema: z.object({
        availableTools: z.array(z.string()),
      }),
      execute: async (params, ctx?: TurnContext) => {
        if (ctx?.tools) {
          capturedToolNames = ctx.tools.map(t => t.function.name);
        }
        return {
          availableTools: capturedToolNames,
        };
      },
    });

    const helperTool = tool({
      name: 'helper',
      description: 'A helper tool',
      inputSchema: z.object({
        value: z.string(),
      }),
      outputSchema: z.object({
        result: z.string(),
      }),
      execute: async (params) => {
        return { result: `Helped with: ${params.value}` };
      },
    });

    const result = await client.callModel({
      model: 'anthropic/claude-3.5-sonnet',
      input: [
        {
          role: 'user',
          content: 'Call the inspector tool to see what tools are available',
        },
      ],
      tools: [inspectorTool, helperTool],
      stopWhen: stepCountIs(2),
    });

    await result.getText();

    // Verify the inspector saw both tools
    expect(capturedToolNames).toContain('inspector');
    expect(capturedToolNames).toContain('helper');
    expect(capturedToolNames.length).toBe(2);

    console.log('Inspector saw these tools:', capturedToolNames);
  }, 60000);
});
