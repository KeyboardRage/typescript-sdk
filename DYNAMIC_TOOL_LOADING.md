# Dynamic Tool Loading Feature

## Overview

This implementation adds the ability to dynamically load, modify, and remove tools during multi-turn conversations. Tools can now:
1. **See** which other tools are available via `TurnContext`
2. **Modify** the available tools for subsequent turns via `nextTurnParams`

## Problem Solved

Previously, all tools had to be defined upfront when calling `callModel()`. There was no way to:
- Add new tools based on execution results
- Remove tools to restrict capabilities
- Inspect which tools were available during execution

## Solution

### 1. Tool Access via TurnContext

Tools can now access the current list of available tools through the `context.tools` field:

```typescript
const inspectorTool = tool({
  name: 'inspect',
  execute: async (params, context?: TurnContext) => {
    const availableTools = context?.tools?.map(t => t.function.name) ?? [];
    console.log('Available tools:', availableTools);
    // Make decisions based on available tools
  }
});
```

### 2. Dynamic Tool Modification via nextTurnParams

Tools can modify the list of available tools using the `nextTurnParams.tools` function:

```typescript
const loaderTool = tool({
  name: 'load_tools',
  nextTurnParams: {
    tools: (params, context) => {
      if (params.needCalculator) {
        // Add a calculator tool
        return [...context.tools, calculatorTool];
      }
      // Or remove tools
      return context.tools.filter(t => t.function.name !== 'restricted');
    }
  },
  execute: async (params) => {
    return { loaded: true };
  }
});
```

## Implementation Details

### Type System Changes

1. **TurnContext** (`src/lib/tool-types.ts`)
   - Added `tools?: readonly Tool[]` field
   - Provides read-only access to current tools

2. **NextTurnParamsContext** (`src/lib/tool-types.ts`)
   - Added `tools: readonly Tool[]` field
   - Allows tools to be modified via nextTurnParams

### Core Changes

1. **buildTurnContext** (`src/lib/turn-context.ts`)
   - Now accepts `tools` parameter
   - Passes tools to the context

2. **buildNextTurnParamsContext** (`src/lib/next-turn-params.ts`)
   - Now accepts and includes `tools` parameter
   - Tools are part of the context for nextTurnParams functions

3. **applyNextTurnParamsToRequest** (`src/lib/next-turn-params.ts`)
   - Filters out `tools` field before applying to request
   - Tools field is not part of the API request

4. **Tool Orchestration** (`src/lib/tool-orchestrator.ts`)
   - Tracks `currentTools` that can change between turns
   - Updates `currentApiTools` when tools are modified
   - Passes tools to `buildTurnContext`

5. **Model Result** (`src/lib/model-result.ts`)
   - Tracks `currentTools` separately from `options.tools`
   - Uses `getCurrentTools()` helper for consistency
   - Updates `currentTools` when modified via nextTurnParams

## Usage Examples

### Example 1: Tool Discovery

```typescript
const discoveryTool = tool({
  name: 'discover',
  execute: async (params, context?: TurnContext) => {
    const tools = context?.tools?.map(t => t.function.name) ?? [];
    return { availableTools: tools };
  }
});
```

### Example 2: Dynamic Tool Loading

```typescript
const loaderTool = tool({
  name: 'loader',
  nextTurnParams: {
    tools: (params, context) => {
      // Add new tools based on params
      if (params.loadMath) {
        return [...context.tools, calculatorTool, mathTool];
      }
      return context.tools;
    }
  },
  execute: async (params) => ({ loaded: true })
});
```

### Example 3: Tool Restriction

```typescript
const securityTool = tool({
  name: 'security',
  nextTurnParams: {
    tools: (params, context) => {
      // Keep only safe tools
      return context.tools.filter(t => 
        params.allowedTools.includes(t.function.name)
      );
    }
  },
  execute: async (params) => ({ restricted: true })
});
```

## Testing

### Unit Tests (`tests/e2e/dynamic-tools.test.ts`)
- Tool access in TurnContext
- Dynamic tool modification via nextTurnParams
- Tool removal/filtering
- Tool discovery
- Type safety verification

### Integration Tests (`tests/e2e/dynamic-tools-integration.test.ts`)
- End-to-end with real API calls
- Multi-turn conversations with tool modifications
- Tool additions during execution

### Example Code (`examples/dynamic-tools.example.ts`)
- Complete working examples
- Multiple use cases demonstrated
- Best practices shown

## API Surface

### Added to TurnContext
```typescript
interface TurnContext {
  tools?: readonly Tool[];  // NEW: Current available tools
  // ... existing fields
}
```

### Added to NextTurnParamsContext
```typescript
type NextTurnParamsContext = {
  tools: readonly Tool[];  // NEW: Current tools
  // ... existing fields
}
```

### Added to NextTurnParamsFunctions
```typescript
type NextTurnParamsFunctions<TInput> = {
  tools?: (params: TInput, context: NextTurnParamsContext) 
    => readonly Tool[] | Promise<readonly Tool[]>;  // NEW
  // ... existing functions
}
```

## Backward Compatibility

✅ **Fully backward compatible**

- All changes are additive
- `tools` fields are optional
- Existing code works without changes
- No breaking changes to existing APIs

## Performance Considerations

- Minimal overhead: tools array is passed by reference
- No deep cloning unless tools are modified
- Tool modifications only applied when nextTurnParams returns different array

## Security Considerations

- Tools array is readonly to prevent accidental mutations
- Each turn gets a fresh context
- Tool modifications are isolated per request
- No shared state between requests

## Future Enhancements

Potential future improvements:
1. Tool versioning/lifecycle management
2. Tool dependency resolution
3. Tool permission/capability system
4. Tool marketplace/registry
5. Hot-reloading of tools

## Files Changed

1. `src/lib/tool-types.ts` - Type definitions
2. `src/lib/turn-context.ts` - Context building
3. `src/lib/next-turn-params.ts` - Parameter handling
4. `src/lib/tool-orchestrator.ts` - Orchestration logic
5. `src/lib/model-result.ts` - Result handling
6. `tests/e2e/dynamic-tools.test.ts` - Unit tests
7. `tests/e2e/dynamic-tools-integration.test.ts` - Integration tests
8. `examples/dynamic-tools.example.ts` - Example code
9. `CLAUDE.md` - Documentation

## Documentation

- Architecture docs in `CLAUDE.md`
- Example code in `examples/`
- Inline JSDoc comments
- Comprehensive test coverage
