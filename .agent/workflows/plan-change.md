---
description: Manages updates to an existing feature by creating a "Delta Spec" before touching code.
---

Plan Change Workflow

Usage: /plan-change [feature-name]

Step 1: Context Gathering

Instruction: "Locate the existing specification file for [feature-name] in docs/specs/. Then, scan the current codebase (app/, components/) to understand the actual implementation. Summarize the difference between the Original Spec and the Current Code (if any)."

Step 2: Change Interview (Gap Analysis)

Instruction: "Act as the Project Manager. Ask me what specific changes are needed. Then, perform a Gap Analysis on these changes:

Impact: Will this break existing data/UI?

Scope: Is this a small tweak or a full refactor?

Risks: Does this affect Compliance or Security?"

Step 3: Draft Delta Spec

Instruction: "Create a NEW specification file named docs/specs/[Original-ID]-revision-[change-topic].md (e.g., 001-revision-add-csv-support.md).

Content Requirements:

Reference: Link to the original spec.

The Change: clearly list 'Current Behavior' vs 'New Behavior'.

Technical Plan: List specific files to modify (Don't list files that stay the same)."

Step 4: Approval

Instruction: "Ask me to review the Delta Spec. If approved, tell me to run /build-feature [new-spec-filename] to execute the changes."