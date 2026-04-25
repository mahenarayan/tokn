# Specifications

## Purpose

This directory stores implementation specs for substantial changes in Tokn.

Specs describe intended behavior before or alongside implementation.
They are the working design documents for feature work, adapter changes, contract changes, and major analysis behavior changes.

## When To Add A Spec

Add a spec here when the change affects:

- supported input shapes
- analyzer behavior
- report or JSON contract shape
- CLI behavior
- trace import behavior
- suggestion rules
- compatibility or migration expectations

## How To Write One

- Start from `docs/templates/spec-template.md`.
- Keep the scope explicit.
- Call out unsupported or unknown behavior directly.
- Name the tests and fixtures that will prove the behavior.
- Link related ADRs when the work changes a lasting architectural decision.

## Naming

Prefer short, stable file names such as:

- `openinference-trace-import.md`
- `suggestion-engine-v1.md`
- `model-registry-refactor.md`
