# Phase 01: Create Demo Pages

## Context
- Parent: [plan.md](./plan.md)
- Library: `src/index.ts`
- Build output: `dist/index.js`

## Overview
- Priority: P2
- Status: ✅ done
- Description: Create interactive HTML demo pages

## Key Insights
- Library exports: `createParentBridge`, `createIframeBridge`, error classes
- Uses ES modules (`type: module` in package.json)
- Bridge options: timeout, targetOrigin, channel, debug, includeStackTraces

## Requirements

### Functional
- Parent page loads iframe and creates bridge
- Iframe page creates bridge to parent
- UI buttons to test all methods
- Console area shows logs and results
- Error states displayed clearly

### Non-Functional
- Pure HTML/JS, no build step needed
- Inline CSS for simplicity
- Works with any static file server

## Architecture

### parent.html
```
┌─────────────────────────────────────┐
│ Parent Window                       │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ Controls                        │ │
│ │ [Call getStatus] [Initialize]   │ │
│ │ [Invoke dynamic] [Destroy]      │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Iframe                          │ │
│ │ (iframe.html loaded here)       │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Console Log                     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### iframe.html
```
┌─────────────────────────────────────┐
│ Iframe Content                      │
├─────────────────────────────────────┤
│ [Call getUser] [Notify parent]      │
│ [Test error] [Test timeout]         │
├─────────────────────────────────────┤
│ Console Log                         │
└─────────────────────────────────────┘
```

## Related Code Files
- Create: `examples/demo/parent.html`
- Create: `examples/demo/iframe.html`
- Reference: `dist/index.js` (ES module build)

## Implementation Steps

1. Create `examples/demo/` directory

2. Create `parent.html`:
   - HTML structure with controls, iframe, console
   - Load `../../dist/index.js` as ES module
   - Define ParentMethods: getUser, notify, slowMethod
   - Create bridge on iframe load
   - UI buttons for: call.getStatus, call.initialize, invoke, notify, destroy
   - Console log interceptor

3. Create `iframe.html`:
   - HTML structure with controls, console
   - Load `../../dist/index.js` as ES module
   - Define IframeMethods: initialize, getStatus
   - Create bridge on page load
   - UI buttons for: call.getUser, notify, test error, test timeout
   - Console log interceptor

4. Test all features work correctly

## Todo List
- [x] Create examples/demo directory
- [x] Create parent.html with full UI
- [x] Create iframe.html with full UI
- [x] Test all bridge methods
- [x] Verify error handling works
- [x] Verify debug logging works

## Success Criteria
- Pages load in browser without errors
- All buttons trigger expected behavior
- Results/errors show in console area
- Debug mode shows message traffic
- Destroy properly cleans up bridge

## Risk Assessment
- Low risk: Pure HTML/JS, no dependencies
- ES module loading requires proper MIME type (use static server)

## Security Considerations
- Demo uses targetOrigin: '*' for simplicity
- Production should use specific origin

## Next Steps
- After completion: Update README with demo instructions
- Consider: Add to package.json scripts for easy serving
