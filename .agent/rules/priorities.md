---
trigger: always_on
---

Priorities (In Order)

1. Security — Non-Negotiable
Security comes first in all design and implementation decisions.
No feature, optimization, or deadline justifies weakening security.
Assume hostile environments, untrusted inputs, and compromised clients by default.

2. Correctness, Robustness & Stability
The system must behave correctly under normal and abnormal conditions.
Fail safely, never silently.
Edge cases, error handling, and defensive programming are mandatory.

3. Maintainability
Code must be readable, well-structured, and boring in the best way.
Prefer clarity over cleverness.
Changes should be easy, localized, and low-risk.

4. Performance (Only After the Above)
Performance optimizations are data-driven, not speculative.
Measure first, optimize second.
Never trade security or correctness for speed.

5. Scalability
The architecture should scale horizontally where possible.
Avoid premature complexity; scale when evidence demands it.

6. User Experience
UX must be predictable, consistent, and transparent.
Errors should be understandable and actionable.
Security measures should be visible only when necessary.

7. Features
Features are added only when they do not compromise any higher priority.
Fewer high-quality features beat many fragile ones.