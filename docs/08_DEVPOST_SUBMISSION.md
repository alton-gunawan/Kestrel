# Kestrel — Devpost Submission Pack

## Submission thesis
Kestrel is a meeting operations **web app** that turns meetings into execution.

Humans operate Kestrel directly in the UI: context → agenda → human-approved
meeting changes → decisions → action items → follow-up. WebMCP and integrations
are differentiators that expand *how* the system is used — an external agent can
drive the same capabilities through WebMCP, and external systems connect through
capability-based integration providers — they never replace the application
itself.

## Why WebMCP
The website exposes structured business capabilities to external agents instead of forcing agents to operate the UI through brittle click/typing automation.

The most important proof is not “we have an AI.” It is:
> An external agent discovers Kestrel capabilities, prepares a meaningful meeting workflow, pauses for human approval, performs approved actions through WebMCP, and verifies the persisted result.

## Why Integrations
External systems (calendars, meeting intelligence like Fathom, and later
communication/project systems) connect through capability-based provider
adapters over the same shared application services. Provider data is untrusted
and becomes proposals for human approval — never committed directly. Demo
adapters prove the boundary honestly without contacting real third parties.

## Judge-facing proof points
- real `document.modelContext.registerTool(...)`
- multiple meaningful tools, not one generic “execute” tool
- read/propose/write/verify lifecycle
- human approval is a real application boundary
- deterministic domain services
- visible tool activity
- golden scenario works end-to-end, including the pure-UI path without WebMCP
- user-facing Integrations page: connect/sync/disconnect/activity with honest
  error states; demo adapters clearly labeled
- capability-based provider abstraction (calendar, meeting intelligence,
  communication, project, meeting platform, automation)

## Required deliverables from official challenge requirements
- working live URL accessible through ChatGPT in-app browser or WebMCP-enabled Chrome
- text description explaining WebMCP fit, UX improvement, human+agent capabilities, and implementation
- public YouTube demo video under 3 minutes with audio
- public code repository with all source/assets/instructions and an open-source license

The official rules currently show the above requirements and explicitly expect actual WebMCP registration in the repository. citehttps://webmcp.devpost.com/rules

## Submission narrative structure
1. One-sentence problem.
2. Why meetings fail at the handoff from discussion to execution.
3. What Kestrel changes.
4. Why WebMCP is the enabling capability.
5. How human approval works.
6. Demo evidence.
7. Architecture briefly.
8. Limitations honestly stated.

## Avoid
- claims of measured productivity unless actually measured
- claims of broad customer adoption
- saying the app has an embedded AI when it does not
- describing a mock tool registry as native WebMCP support
- claiming real external side effects from demo adapters (they are labeled demo)
- claiming native WebMCP verification that was not performed (the 21st tool, `get_integrations`, is UNVERIFIED natively in this build)
