import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { tool } from '../../src/index.js';
import type { TurnContext, Tool } from '../../src/lib/tool-types.js';

describe('Dynamic Tool Loading', () => {
  describe('Tool Access in TurnContext', () => {
    it('should provide tools in TurnContext during execution', async () => {
      let capturedTools: readonly Tool[] | undefined;

      const inspectTool = tool({
        name: 'inspect_context',
        description: 'Inspects the turn context',
        inputSchema: z.object({
          query: z.string(),
        }),
        outputSchema: z.object({
          toolCount: z.number(),
        }),
        execute: async (params, context?: TurnContext) => {
          // Capture tools from context
          capturedTools = context?.tools;
          return {
            toolCount: context?.tools?.length ?? 0,
          };
        },
      });

      const helperTool = tool({
        name: 'helper_tool',
        description: 'A helper tool',
        inputSchema: z.object({
          value: z.string(),
        }),
        outputSchema: z.object({
          result: z.string(),
        }),
        execute: async (params) => {
          return { result: params.value };
        },
      });

      // Test with callModel (doesn't actually execute tools, just checks structure)
      expect(inspectTool.function.name).toBe('inspect_context');
      expect(helperTool.function.name).toBe('helper_tool');

      // Verify the tool can be called with context containing tools
      const mockContext: TurnContext = {
        numberOfTurns: 1,
        tools: [inspectTool, helperTool],
      };

      const result = await inspectTool.function.execute({ query: 'test' }, mockContext);
      expect(result.toolCount).toBe(2);
      expect(capturedTools).toBeDefined();
      expect(capturedTools?.length).toBe(2);
    });
  });

  describe('Dynamic Tool Modification via nextTurnParams', () => {
    it('should allow tools to be modified via nextTurnParams', async () => {
      const baseTool = tool({
        name: 'base_tool',
        description: 'Base tool that adds more tools',
        inputSchema: z.object({
          addTools: z.boolean(),
        }),
        outputSchema: z.object({
          message: z.string(),
        }),
        nextTurnParams: {
          tools: (params, context) => {
            if (params.addTools) {
              // Add a new tool to the list
              const newTool = tool({
                name: 'dynamic_tool',
                description: 'Dynamically added tool',
                inputSchema: z.object({
                  value: z.string(),
                }),
                outputSchema: z.object({
                  result: z.string(),
                }),
                execute: async (params) => {
                  return { result: `Dynamic: ${params.value}` };
                },
              });

              return [...context.tools, newTool];
            }
            return context.tools;
          },
        },
        execute: async (params) => {
          return {
            message: params.addTools ? 'Added tools' : 'No tools added',
          };
        },
      });

      // Verify nextTurnParams structure exists
      expect(baseTool.function.nextTurnParams).toBeDefined();
      expect(baseTool.function.nextTurnParams?.tools).toBeDefined();
      expect(typeof baseTool.function.nextTurnParams?.tools).toBe('function');

      // Test the nextTurnParams function
      const mockContext = {
        input: [],
        model: 'test-model',
        models: [],
        temperature: null,
        maxOutputTokens: null,
        topP: null,
        topK: undefined,
        instructions: null,
        tools: [baseTool],
      };

      const toolsFunction = baseTool.function.nextTurnParams?.tools;
      if (toolsFunction) {
        const updatedTools = await toolsFunction({ addTools: true }, mockContext);
        expect(updatedTools.length).toBe(2);
        expect(updatedTools[0].function.name).toBe('base_tool');
        expect(updatedTools[1].function.name).toBe('dynamic_tool');
      }
    });

    it('should support removing tools via nextTurnParams', async () => {
      const controlTool = tool({
        name: 'control_tool',
        description: 'Controls which tools are available',
        inputSchema: z.object({
          keepOnlyThis: z.boolean(),
        }),
        outputSchema: z.object({
          message: z.string(),
        }),
        nextTurnParams: {
          tools: (params, context) => {
            if (params.keepOnlyThis) {
              // Return only this tool
              return context.tools.filter(t => t.function.name === 'control_tool');
            }
            return context.tools;
          },
        },
        execute: async (params) => {
          return {
            message: params.keepOnlyThis ? 'Removed other tools' : 'Kept all tools',
          };
        },
      });

      const otherTool = tool({
        name: 'other_tool',
        description: 'Another tool',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        execute: async () => ({}),
      });

      // Test removing tools
      const mockContext = {
        input: [],
        model: 'test-model',
        models: [],
        temperature: null,
        maxOutputTokens: null,
        topP: null,
        topK: undefined,
        instructions: null,
        tools: [controlTool, otherTool],
      };

      const toolsFunction = controlTool.function.nextTurnParams?.tools;
      if (toolsFunction) {
        const filteredTools = await toolsFunction({ keepOnlyThis: true }, mockContext);
        expect(filteredTools.length).toBe(1);
        expect(filteredTools[0].function.name).toBe('control_tool');
      }
    });
  });

  describe('Tool Discovery', () => {
    it('should allow tools to discover other available tools', async () => {
      let discoveredToolNames: string[] = [];

      const discoveryTool = tool({
        name: 'discovery_tool',
        description: 'Discovers available tools',
        inputSchema: z.object({
          discover: z.boolean(),
        }),
        outputSchema: z.object({
          tools: z.array(z.string()),
        }),
        execute: async (params, context?: TurnContext) => {
          if (params.discover && context?.tools) {
            discoveredToolNames = context.tools.map(t => t.function.name);
            return {
              tools: discoveredToolNames,
            };
          }
          return { tools: [] };
        },
      });

      const tool1 = tool({
        name: 'tool_1',
        description: 'First tool',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        execute: async () => ({}),
      });

      const tool2 = tool({
        name: 'tool_2',
        description: 'Second tool',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        execute: async () => ({}),
      });

      // Test tool discovery
      const mockContext: TurnContext = {
        numberOfTurns: 1,
        tools: [discoveryTool, tool1, tool2],
      };

      const result = await discoveryTool.function.execute({ discover: true }, mockContext);
      expect(result.tools).toEqual(['discovery_tool', 'tool_1', 'tool_2']);
      expect(discoveredToolNames).toEqual(['discovery_tool', 'tool_1', 'tool_2']);
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety with readonly tools array', () => {
      const testTool = tool({
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        execute: async (_params, context?: TurnContext) => {
          // Verify tools is readonly
          if (context?.tools) {
            const toolsCopy = [...context.tools];
            expect(toolsCopy.length).toBe(context.tools.length);
          }
          return {};
        },
      });

      expect(testTool.function.execute).toBeDefined();
    });

    it('should accept readonly array in nextTurnParams tools function', () => {
      const testTool = tool({
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        nextTurnParams: {
          tools: (_params, context) => {
            // Should accept readonly array and return readonly array
            const tools: readonly Tool[] = context.tools;
            return tools;
          },
        },
        execute: async () => ({}),
      });

      expect(testTool.function.nextTurnParams?.tools).toBeDefined();
    });
  });
});
