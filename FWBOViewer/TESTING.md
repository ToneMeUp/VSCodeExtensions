# FWBO Viewer Testing Guide

## Architecture Verification

### Test 1: XML Provider (Current Format) ✅

**Purpose**: Verify existing XML .fwbo files work unchanged

**Steps**:
1. Open any existing .fwbo file in VSCode
2. Verify diagram renders correctly
3. Test pan, zoom, search functionality
4. Verify navigation properties show clean names

**Expected Result**:
- ✅ Everything works exactly as before
- ✅ No errors in console
- ✅ Same performance (60fps pan)

### Test 2: Provider Factory Auto-Detection ✅

**Purpose**: Verify factory correctly detects XML format

**Test Code**:
```typescript
import { FwboDataProviderFactory } from './FwboDataProviderFactory';
import { XmlFwboDataProvider } from './XmlFwboDataProvider';

// Test XML detection
const xmlContent = '<?xml version="1.0"?><modelRoot>...</modelRoot>';
const provider = FwboDataProviderFactory.createProvider(xmlContent);
console.assert(provider instanceof XmlFwboDataProvider, 'Should detect XML');
```

**Expected Result**:
- ✅ Returns XmlFwboDataProvider instance
- ✅ No errors

### Test 3: JSON Provider (Future Format) 🚧

**Purpose**: Verify JSON provider can parse FwboData-compatible JSON

**Sample JSON** (to be saved as `test.fwbo.json`):
```json
{
  "entities": [
    {
      "id": "entity1",
      "name": "TestEntity",
      "properties": [
        { "name": "Id", "type": "Int32" },
        { "name": "Name", "type": "String" }
      ],
      "navigationProperties": ["RelatedEntity"]
    }
  ],
  "services": [],
  "associations": [
    {
      "id": "assoc1",
      "name": "TestEntityRelatedEntity",
      "sourceMultiplicity": "1",
      "targetMultiplicity": "*"
    }
  ],
  "aliases": [],
  "diagram": {
    "shapes": [
      {
        "id": "shape1",
        "modelId": "entity1",
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 150,
        "type": "entity",
        "outlineColor": "#5c6bc0"
      }
    ],
    "connectors": []
  }
}
```

**Steps** (when JSON support is needed):
1. Create a file with above JSON content
2. Open in FWBO Viewer
3. Verify diagram renders from JSON

**Expected Result** (future):
- ✅ Factory detects JSON format
- ✅ JsonFwboDataProvider parses correctly
- ✅ Diagram renders identically to XML version

### Test 4: Provider Factory Explicit Format Selection ✅

**Purpose**: Verify explicit provider creation

**Test Code**:
```typescript
import { FwboDataProviderFactory } from './FwboDataProviderFactory';

// Test explicit XML
const xmlProvider = FwboDataProviderFactory.createProviderByFormat('xml');
console.assert(xmlProvider instanceof XmlFwboDataProvider);

// Test explicit JSON (future)
const jsonProvider = FwboDataProviderFactory.createProviderByFormat('json');
console.assert(jsonProvider instanceof JsonFwboDataProvider);
```

**Expected Result**:
- ✅ Returns correct provider type
- ✅ No errors

## Regression Testing

### Existing XML Files ✅

**Test Files**:
- `/Users/vaibhavdandekar/Illumify/CPI.Tools/CodeGenerator/TestApp/TestModel.fwbo`
- Any other existing .fwbo files in the codebase

**Verification**:
- ✅ All files open without errors
- ✅ Diagram layout matches previous version
- ✅ All entities, services, aliases render correctly
- ✅ Navigation properties show clean names
- ✅ Search functionality works
- ✅ Pan/zoom smooth (60fps)

### Performance Benchmarks ✅

**Metrics** (unchanged from before):
- Parse time: < 100ms for typical .fwbo file
- Initial render: < 200ms
- Pan frame rate: 60fps
- Zoom frame rate: 60fps
- Memory usage: < 50MB for typical diagram

## Integration Testing

### VSCode Extension Integration ✅

**Test Scenarios**:
1. **File Open**: Right-click .fwbo → Open With → FWBO Viewer
2. **Auto-detection**: Factory detects format from content
3. **Error Handling**: Malformed XML/JSON shows error message
4. **Hot Reload**: Edit file externally, verify auto-refresh

**Expected Results**:
- ✅ All scenarios work as before
- ✅ No breaking changes

## Manual Testing Checklist

- [ ] Open existing XML .fwbo file
- [ ] Verify entities render with correct colors (blue/purple/gray)
- [ ] Verify properties show with types
- [ ] Verify navigation properties show clean names (e.g., "SalesOrder" not "GetHubSalesOrderResponseSalesOrder")
- [ ] Verify connectors are dotted lines
- [ ] Test pan with mouse drag
- [ ] Test zoom with scroll wheel
- [ ] Test search functionality
- [ ] Test alias hover tooltip
- [ ] Verify Microsoft Fluent UI styling
- [ ] Check console for errors (should be none)

## Debugging Tips

### Enable Debug Logging

Add to `FwboEditorProvider.ts`:
```typescript
console.log('Provider type:', provider.constructor.name);
console.log('Parsed data:', JSON.stringify(data, null, 2));
```

### Check Provider Selection

Add to `FwboDataProviderFactory.ts`:
```typescript
const format = trimmed.startsWith('{') ? 'JSON' : 'XML';
console.log(`Detected format: ${format}`);
```

### Verify FwboData Structure

Add to renderer (`media/fwbo.js`):
```javascript
console.log('FwboData:', fwboData);
console.log('Entities:', fwboData.entities.length);
console.log('Services:', fwboData.services.length);
```

## Future Testing (When JSON is Needed)

### Step 1: Define JSON Schema
Document expected JSON structure in `ARCHITECTURE.md`

### Step 2: Implement Transformation
Update `JsonFwboDataProvider.transformToFwboData()` with actual logic

### Step 3: Create Test Files
Create sample JSON files matching schema

### Step 4: Verify Parity
Ensure JSON renders identically to equivalent XML

### Step 5: Performance Test
Benchmark JSON parsing vs XML parsing

## Continuous Integration

### Automated Tests (Future)

```bash
# Run TypeScript compilation
npm run compile

# Run unit tests (when created)
npm test

# Package extension
npx @vscode/vsce package

# Verify package size
ls -lh *.vsix
```

### Success Criteria

- ✅ TypeScript compiles with no errors
- ✅ All unit tests pass
- ✅ Package builds successfully
- ✅ No console errors when loading .fwbo files
- ✅ Performance metrics within acceptable range
- ✅ Visual regression tests pass
