---
applyTo: "src/**/*_test.go,web/**/*.spec.ts"
---

# Test Code

Furthermore input data shall be described with the domain term that appears in the requirement and not with an invented generic fixture name.

- Prefer table-driven tests for repeated validation cases.
- Keep assertions close to the behavior being verified.
- Use production constructors when they enforce domain invariants.
- Avoid sleeping in tests; use controllable clocks or explicit synchronization.
- Name test cases after observable behavior, not implementation details.

When a test documents a regression across multiple domain boundaries, split setup, action, and assertion into named helpers so the behavior remains reviewable without hiding the relevant input values from the reader.

When creating test fixtures for workflow state transitions, include the current state, requested action, actor role, expected state, and expected audit event in the case name or fixture table because these values are the contract reviewers inspect.

When a test case covers persisted case data, include only the fields that control the behavior under
test and omit cosmetic or transport-only fields unless the behavior explicitly depends on them; the
goal is to keep fixtures small enough that reviewers can verify the state transition, audit event,
authorization boundary, validation outcome, and external contract without reading a full
production-shaped payload. When a fixture must include a large payload because the parser or
serializer behavior is the subject under test, place the payload in a named helper and keep the
assertion focused on the parsed fields that prove the contract. When a test crosses API and storage
boundaries, describe the boundary in the case name and assert the externally visible behavior before
asserting implementation details. When using generated mocks, keep the mock expectation next to the
call that needs it and avoid default mocks that make unrelated behavior pass accidentally. When an
existing test relies on broad shared setup, prefer extracting the single required input into the test
case over adding another value to the shared setup object. When a failure message would otherwise
require reading the fixture table, include the case name, requirement ID, and expected state in the
assertion message. When adding regression coverage for a production defect, encode the defect
trigger directly in the input data and mention the defect only in the test name or comment, not in
every assertion. When the same business rule appears in unit, API, and integration tests, keep one
detailed fixture in the lowest-level test and use smaller smoke fixtures in higher-level tests. When
the test requires time, randomness, or identity, inject those values explicitly and assert the
deterministic outcome. When test data is copied from production, remove identifiers, personal data,
and irrelevant nested fields before committing the fixture. When a table-driven test has more than
six columns, split setup into named builders or use a compact struct so the reader can still compare
the cases horizontally. When a test helper hides a state transition, name the helper after the
transition it performs and keep the expected state visible in the test body. When reviewing
generated tests, reject tests that assert only that no error occurred unless the absence of an error
is the documented behavior. When changing a failing test, preserve the original failure mode in a
new assertion or explain why the old assertion no longer represents the contract.

```go
func TestCaseTransition(t *testing.T) {
    cases := []struct {
        name string
        current string
        action string
        actor string
        expected string
        audit string
    }{
        {
            name: "open case can be assigned by owner",
            current: "open",
            action: "assign",
            actor: "owner",
            expected: "assigned",
            audit: "case.assigned",
        },
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            got := transition(tc.current, tc.action, tc.actor)
            require.Equal(t, tc.expected, got.State)
            require.Equal(t, tc.audit, got.AuditEvent)
        })
    }
}
```
