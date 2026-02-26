# FWBO Viewer Architecture

## Overview

The FWBO Viewer uses a **provider pattern** to decouple data source parsing from rendering logic. This allows switching between different input formats (XML, JSON, etc.) without modifying the renderer.

## Architecture Diagram

```
┌─────────────────┐
│  .fwbo File     │ (XML or JSON)
│  .diagram File  │ (Optional)
└────────┬────────┘
         │
         v
┌─────────────────────────────────┐
│ FwboDataProviderFactory         │
│ (Auto-detects format)           │
└────────┬────────────────────────┘
         │
         v
┌─────────────────────────────────┐
│ IFwboDataProvider Interface     │
└────────┬────────────────────────┘
         │
    ┌────┴─────┐
    │          │
    v          v
┌─────────┐  ┌─────────┐
│   XML   │  │  JSON   │
│ Provider│  │ Provider│
└────┬────┘  └────┬────┘
     │            │
     └──────┬─────┘
            │
            v
    ┌───────────────┐
    │  FwboData     │ (Unified Interface)
    │  - entities   │
    │  - services   │
    │  - aliases    │
    │  - diagram    │
    └───────┬───────┘
            │
            v
    ┌───────────────┐
    │   Renderer    │ (media/fwbo.js)
    │   (SVG + UI)  │
    └───────────────┘
```

## Key Components

### 1. **IFwboDataProvider** (Interface)
- **Location**: `src/IFwboDataProvider.ts`
- **Purpose**: Abstract interface for all data providers
- **Contract**: `parse(modelContent: string, diagramContent?: string): FwboData`

### 2. **XmlFwboDataProvider** (Implementation)
- **Location**: `src/XmlFwboDataProvider.ts`
- **Purpose**: Parses XML-formatted .fwbo files (current format)
- **Dependencies**: Uses `FwboParser` internally
- **Status**: ✅ Fully implemented and tested

### 3. **JsonFwboDataProvider** (Implementation)
- **Location**: `src/JsonFwboDataProvider.ts`
- **Purpose**: Parses JSON-formatted FWBO files (future format)
- **Status**: 🚧 Stub implementation ready for JSON schema
- **Usage**: When JSON schema is defined, implement `transformToFwboData()`

### 4. **FwboDataProviderFactory** (Factory)
- **Location**: `src/FwboDataProviderFactory.ts`
- **Purpose**: Creates appropriate provider based on content format
- **Auto-detection**:
  - `{` or `[` → JSON provider
  - Otherwise → XML provider
- **Explicit creation**: `createProviderByFormat('xml' | 'json')`

### 5. **FwboData** (Data Model)
- **Location**: `src/fwboParser.ts`
- **Purpose**: Source-agnostic data structure
- **Structure**:
  ```typescript
  interface FwboData {
      entities: Entity[];
      services: Service[];
      associations: Association[];
      aliases: Alias[];
      diagram: Diagram;
  }
  ```

### 6. **FwboEditorProvider** (VSCode Integration)
- **Location**: `src/FwboEditorProvider.ts`
- **Purpose**: VSCode custom editor provider
- **Usage**: Uses factory to get provider, never directly depends on XML/JSON

### 7. **Renderer** (Frontend)
- **Location**: `media/fwbo.js`, `media/fwbo.css`
- **Purpose**: SVG-based diagram renderer
- **Input**: FwboData JSON (format-agnostic)
- **Features**: Pan, zoom, search, Microsoft Fluent UI styling

## Design Principles

### 1. **Separation of Concerns**
- **Parser Layer**: Handles format-specific parsing (XML/JSON)
- **Data Layer**: Unified FwboData interface
- **Rendering Layer**: Format-agnostic visualization

### 2. **Open/Closed Principle**
- Open for extension: Add new providers (YAML, Binary, etc.)
- Closed for modification: No changes to renderer or core logic

### 3. **Dependency Inversion**
- High-level modules (renderer) depend on abstractions (FwboData)
- Low-level modules (XML/JSON parsers) implement abstractions

### 4. **Single Responsibility**
- Each provider handles ONE format
- Factory handles provider selection
- Renderer handles visualization only

## Adding a New Data Format

To add support for a new format (e.g., YAML):

1. **Create Provider**:
   ```typescript
   // src/YamlFwboDataProvider.ts
   export class YamlFwboDataProvider implements IFwboDataProvider {
       public parse(modelContent: string, diagramContent?: string): FwboData {
           // Parse YAML and return FwboData
       }
   }
   ```

2. **Update Factory**:
   ```typescript
   // src/FwboDataProviderFactory.ts
   if (trimmed.startsWith('---')) {
       return new YamlFwboDataProvider();
   }
   ```

3. **Done!** No changes to renderer, editor, or data model needed.

## Migration Path

### Current State (✅ Working)
- XML .fwbo files work exactly as before
- Zero breaking changes
- All existing functionality preserved

### Future State (🚧 Ready)
When JSON format is defined:
1. Implement `JsonFwboDataProvider.transformToFwboData()`
2. Define JSON schema in documentation
3. Factory auto-detects and routes correctly
4. Both XML and JSON work side-by-side

## Testing Strategy

### Unit Tests
- Test each provider in isolation
- Mock FwboData validation
- Test factory auto-detection logic

### Integration Tests
- Test XML provider with real .fwbo files
- Test JSON provider with sample JSON (when schema defined)
- Test factory with mixed formats

### Regression Tests
- Ensure all existing XML files still render correctly
- Verify zero breaking changes in UI/rendering

## Performance Considerations

### Provider Selection
- Factory detection is O(1) - checks first character only
- No performance impact vs direct instantiation

### Memory
- Providers are created per-parse (not cached)
- FwboData structure is identical regardless of source
- No memory overhead

### Rendering
- Renderer is completely unchanged
- Same 60fps performance for pan/zoom
- No additional layers or abstractions in render path

## Backward Compatibility

### ✅ Guaranteed
- All existing XML .fwbo files work unchanged
- Same API for VSCode extension
- Same rendering behavior
- Same performance characteristics

### ❌ No Breaking Changes
- FwboParser still exists (used by XmlFwboDataProvider)
- FwboData interface unchanged
- Renderer unchanged
- Editor integration unchanged

## Future Enhancements

### Potential Providers
- **DatabaseFwboDataProvider**: Load from SQL/NoSQL
- **ApiFwboDataProvider**: Fetch from REST API
- **BinaryFwboDataProvider**: Optimized binary format
- **HybridFwboDataProvider**: Combine multiple sources

### Advanced Features
- **Provider Caching**: Cache parsed results
- **Lazy Loading**: Stream large diagrams
- **Validation**: Schema validation per provider
- **Conversion**: XML ↔ JSON conversion tools
