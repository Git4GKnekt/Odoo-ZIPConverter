---
name: testing-patterns
description: Testing strategy and patterns for Jest/Vitest/Pytest. Use when writing tests or following TDD.
---

# Testing Patterns

## AAA Pattern (Arrange-Act-Assert)
```typescript
describe('UserService', () => {
  it('should create user with valid email', async () => {
    // ARRANGE
    const userData = { email: 'test@example.com' };
    const mockDb = createMockDatabase();
    
    // ACT
    const user = await userService.createUser(userData, mockDb);
    
    // ASSERT
    expect(user.email).toBe(userData.email);
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
```

## Factory Functions
```typescript
function createMockUser(overrides = {}) {
  return {
    id: '123',
    email: 'test@example.com',
    name: 'Test User',
    ...overrides
  };
}

// Usage
const admin = createMockUser({ role: 'admin' });
```

## Coverage Mal
- Unit Tests: 80%+
- Integration Tests: Alla API endpoints
- E2E Tests: Kritiska floden
