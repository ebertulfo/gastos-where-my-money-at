---
description: Initiates the project management process for a new feature. 
---

Usage: /new-feature

Step 1: Gap Analysis & Scope

Instruction: "I want to start a new feature. Please act as the Project Manager. Ask me questions to clarify the User Story, Scope (In/Out), and Success Criteria. Do not write the spec yet, just interview me."

Step 2: Draft Specification

Instruction: "Based on my answers, draft a new specification file in docs/specs/ (use the next available number, e.g., 002-feature-name.md). Include User Stories, Acceptance Criteria, and a Technical Plan (Shadcn components + Supabase tables)."

Step 3: Approval

Instruction: "Ask me for approval. If I approve, tell me to run /build-feature [filename]."