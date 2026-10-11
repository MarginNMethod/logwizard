# 0003: Contributors use a generated Google Form

Status: accepted, pending Spike 3 and 4. Date: 2026-10-11.

## Context
Each copied sheet has its own script project. A contributor who opens a sidebar must approve that script and sees Google's "unverified app" warning.

## Decision
Contributors add entries through a Google Form generated from the plan. The form-submit trigger is installed by the owner, so it runs as the owner. The owner may still use the sidebar.

## Why
Contributors never see an authorization prompt, which keeps setup within reach of non-technical teams.

## Consequences
The submitter's identity depends on what Forms provides (Spike 4). Fallback is a required "Your name" question.
