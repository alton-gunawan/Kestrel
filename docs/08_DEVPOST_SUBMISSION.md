# MeetingOps — Devpost Submission Pack

## Submission thesis
MeetingOps turns meetings into execution.

A calendar can schedule a meeting. MeetingOps connects the whole lifecycle: context → agenda → human-approved meeting changes → decisions → action items → follow-up.

## Why WebMCP
The website exposes structured business capabilities to external agents instead of forcing agents to operate the UI through brittle click/typing automation.

The most important proof is not “we have an AI.” It is:
> An external agent discovers MeetingOps capabilities, prepares a meaningful meeting workflow, pauses for human approval, performs approved actions through WebMCP, and verifies the persisted result.

## Judge-facing proof points
- real `document.modelContext.registerTool(...)`
- multiple meaningful tools, not one generic “execute” tool
- read/propose/write/verify lifecycle
- human approval is a real application boundary
- deterministic domain services
- visible tool activity
- golden scenario works end-to-end

## Required deliverables from official challenge requirements
- working live URL accessible through ChatGPT in-app browser or WebMCP-enabled Chrome
- text description explaining WebMCP fit, UX improvement, human+agent capabilities, and implementation
- public YouTube demo video under 3 minutes with audio
- public code repository with all source/assets/instructions and an open-source license

The official rules currently show the above requirements and explicitly expect actual WebMCP registration in the repository. citehttps://webmcp.devpost.com/rules

## Submission narrative structure
1. One-sentence problem.
2. Why meetings fail at the handoff from discussion to execution.
3. What MeetingOps changes.
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
