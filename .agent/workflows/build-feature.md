---
description: Executes a specification file into code.
---

Usage: /build-feature [spec-file-path]

Step 1: Analyze & Plan

Instruction: "Read the specification file provided. Cross-reference it with .agent/rules/stack-rules.md. Create a step-by-step implementation plan (Files to create, Packages to install)."

Step 2: Gap Analysis (Technical)

Instruction: "Perform a final Gap Analysis on the Technical Plan. Are we missing any Shadcn components? Do we need a database migration? Ask me to confirm the plan."

Step 3: Execute

Instruction: "Upon confirmation, generate the code. Remember: Use React Server Components by default. Update docs/progress-log.md when finished."

Step 4: Quality Check

Instruction: "Act as the QA Lead. Review the generated code against the Acceptance Criteria in the spec. List any potential issues or necessary manual testing steps."