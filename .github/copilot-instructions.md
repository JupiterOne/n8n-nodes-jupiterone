# Copilot Instructions for n8n-nodes-jupiterone

You are reviewing code for an n8n community node package that integrates with JupiterOne security platform.

## Repository Context
- **Type**: n8n community node package
- **Purpose**: JupiterOne API integration (security/compliance platform)
- **Language**: TypeScript with strict mode
- **Architecture**: Credentials + Query Node + Webhook Node

## Review Priority Levels

### 🚨 CRITICAL - Must Fix Immediately
- Security vulnerabilities in credential handling
- Type safety violations (any types, implicit returns)
- Authentication bypass or credential exposure
- API endpoint security issues
- Error handling that exposes sensitive data

### ⚠️ HIGH - Should Fix Before Merge
- n8n compliance violations
- Performance issues (memory leaks, inefficient loops)
- Poor user experience (unclear errors, missing validation)
- Inappropriate logging of sensitive data
- Missing input validation

### 🔧 MEDIUM - Nice to Fix
- Code consistency and formatting
- Documentation gaps
- Error handling improvements
- Type definition enhancements
- Test coverage gaps

## n8n Framework Requirements

### Credential Files (`.credentials.ts`)
**REQUIRED:**
- Implement `ICredentialType` interface
- Include `authenticate` configuration
- Use `typeOptions: { password: true }` for sensitive fields
- Follow naming: `jupiteroneApi` (not `JupiterOneApi`)
- Provide `test` property for validation

### Node Files (`.node.ts`)
**REQUIRED:**
- Implement `INodeType` interface
- Complete `description` object with all fields
- Use `NodeConnectionType.Main` for I/O
- Implement `execute()` method (regular nodes)
- Implement `webhook()` method (webhook nodes)
- Use `NodeApiError` for error handling

### Security Requirements
**CRITICAL:**
- Validate ALL user inputs before API calls
- Use `this.getCredentials()` for secure access
- NEVER log sensitive data (tokens, passwords)
- Handle authentication errors gracefully
- Validate API responses before processing

## Code Quality Standards

### TypeScript Requirements
**MANDATORY:**
- Use strict TypeScript (`strict: true`)
- NO `any` types - use proper interfaces
- Handle null/undefined explicitly
- Use proper type assertions
- Implement error types and interfaces

### Code Structure
**REQUIRED:**
- Consistent naming conventions
- Meaningful variable/function names
- Organize imports (n8n types first)
- Use constants for magic values
- Implement error boundaries

### Error Handling
**CRITICAL:**
- Catch ALL potential errors
- User-friendly error messages
- Appropriate logging (no sensitive data)
- Don't expose internal details
- Validate API responses

## JupiterOne Integration Requirements

### API Integration
**REQUIRED:**
- Handle API rate limits gracefully
- Validate J1QL queries before execution
- Implement pagination for large results
- Handle GraphQL errors properly
- Use appropriate timeouts

### Data Processing
**REQUIRED:**
- Validate query results before returning
- Handle empty/malformed responses
- Implement data transformation
- Respect data limits and constraints

## Common Anti-Patterns (REJECT THESE)

### 🔴 Security Violations
```typescript
// ❌ REJECT: Logging sensitive data
this.logger.info(`Token: ${accessToken}`);

// ✅ ACCEPT: Redacted logging
this.logger.info('Authorization: Bearer [REDACTED]');
```

### 🔴 Type Safety Violations
```typescript
// ❌ REJECT: Using any types
const data: any = response.data;

// ✅ ACCEPT: Proper interfaces
const data: JupiterOneResponse = response.data;
```

### 🔴 Error Handling Violations
```typescript
// ❌ REJECT: Ignoring errors
const result = await apiCall();

// ✅ ACCEPT: Proper error handling
try {
  const result = await apiCall();
} catch (error) {
  throw new NodeApiError(this.getNode(), {
    message: 'API call failed',
    description: error.message,
  });
}
```

### 🔴 Input Validation Violations
```typescript
// ❌ REJECT: No input validation
const query = this.getNodeParameter('query');

// ✅ ACCEPT: Input validation
const query = this.getNodeParameter('query') as string;
if (!query || query.trim().length === 0) {
  throw new NodeApiError(this.getNode(), {
    message: 'Query parameter is required',
  });
}
```

## Performance Anti-Patterns (REJECT THESE)

### 🔴 Inefficient Processing
```typescript
// ❌ REJECT: Blocking async operations
for (let i = 0; i < items.length; i++) {
  await processItem(items[i]); // Blocks execution
}

// ✅ ACCEPT: Parallel processing
const promises = items.map(item => processItem(item));
const results = await Promise.all(promises);
```

### 🔴 Memory Issues
```typescript
// ❌ REJECT: Accumulating large arrays
let allResults = [];
for (const item of items) {
  allResults.push(await processItem(item));
}

// ✅ ACCEPT: Batch processing
const batchSize = 100;
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize);
  // Process batch
}
```

## Testing Requirements

### Credential Testing
**REQUIRED:**
- Test authentication flow
- Validate all credential fields
- Handle test failures gracefully
- Use appropriate test endpoints

### Node Testing
**REQUIRED:**
- Validate all input parameters
- Handle edge cases (empty inputs, large datasets)
- Test error scenarios
- Validate output data structure

## Documentation Requirements

### Code Comments
**REQUIRED:**
- Document complex business logic
- Explain JupiterOne-specific concepts
- Provide usage examples
- Document error handling strategies

### User Documentation
**REQUIRED:**
- Clear parameter descriptions
- Example values and formats
- Document limitations/constraints
- Provide troubleshooting guidance

## Review Checklist (Use This)

### Pre-Approval Checklist
- [ ] TypeScript errors resolved
- [ ] ESLint rules passing
- [ ] No security vulnerabilities
- [ ] Proper error handling implemented
- [ ] Input validation in place
- [ ] Sensitive data not logged
- [ ] n8n standards followed
- [ ] JupiterOne API best practices followed
- [ ] Performance considerations addressed
- [ ] Documentation updated

### Key Review Questions
1. **Security**: Could this expose sensitive information?
2. **Type Safety**: Are types properly defined and used?
3. **Error Handling**: Are all error cases handled?
4. **Performance**: Could this cause performance issues?
5. **User Experience**: Is error messaging clear?
6. **n8n Compliance**: Follows community standards?
7. **JupiterOne Integration**: Best API interaction method?

## Quick Reference Links
- [n8n Community Nodes](https://docs.n8n.io/integrations/#community-nodes)
- [n8n Workflow Types](https://docs.n8n.io/api/)
- [JupiterOne API Docs](https://docs.jupiterone.io/)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/)
- [ESLint n8n Rules](https://github.com/n8n-io/eslint-plugin-n8n-nodes-base)

---

**REMEMBER**: This is a SECURITY-FOCUSED JupiterOne integration. 
- 🚨 Security first
- 🔒 Type safety required  
- 👥 User experience matters
- 📋 n8n compliance mandatory
