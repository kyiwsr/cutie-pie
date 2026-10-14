# Cutie Pie

A pixel-art castle where the user's AI roster agents live, each running on Claude Code or opencode.

## Language

**Roster agent**:
A named member of the castle team (Master, Scout, Builder, …) with a role, a provider, a model, and a tool list.
_Avoid_: agent (bare), teammate, profile

**Opencode profile**:
The per-run opencode definition of a roster agent: system prompt, model, and permission rules.
_Avoid_: agent (bare), roster agent

**Tool**:
A capability checkbox in Manage Agents, named in Claude Code's vocabulary (Read, Bash, TodoWrite, …).
_Avoid_: action, permission

**Action**:
An opencode permission target (read, shell, subagent, edit, …) that tools are mapped onto for opencode runs.
_Avoid_: tool, permission

**Effort**:
The thinking-level setting stored per roster agent (low…max), honored only by Claude runs.
_Avoid_: variant, thinking

**Variant**:
An opencode model option appended to the model reference (`provider/model#variant`); availability is per-model.
_Avoid_: effort

**Free model**:
An opencode model needing no account, listed under "Free, no account needed". Free-tier runs require the shell tool to remain available to the profile.
_Avoid_: free tier (as a noun for the model)
