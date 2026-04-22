# ADR 0011: Defer LiteLLM Adapter And Prioritize OpenAI-Compatible Request Logs

## Status

Accepted

## Context

As of March 31, 2026, LiteLLM adapter work is not the best next step for Tokn.
There was a recent supply-chain compromise involving malicious PyPI releases on March 24, 2026, and that changes the risk profile of prioritizing LiteLLM-specific support right now.

Tokn does not need a live LiteLLM dependency to parse exported data, but making LiteLLM the next public adapter target would still:

- create confusing product signaling during an active security concern
- encourage users to treat LiteLLM as the preferred next integration path
- compete with a simpler and safer near-term target already aligned with Tokn's current adapter model

OpenAI-compatible request logs are a better next step because they are:

- broadly useful across gateways and wrappers
- closer to Tokn's existing request-payload normalization paths
- lower-friction to validate with static fixtures

## Decision

- Defer LiteLLM-specific adapter work for now.
- Do not list LiteLLM as the next recommended adapter target in roadmap docs.
- Prioritize OpenAI-compatible request logs as the next adapter milestone instead.
- Revisit LiteLLM only after a fresh security review and a clear product reason to support its export shape directly.

## Consequences

- the roadmap stays aligned with a lower-risk adapter target
- Tokn still supports many LiteLLM-adjacent deployments indirectly if they emit OpenAI-compatible request logs
- future LiteLLM work requires an explicit re-evaluation instead of sliding in through roadmap inertia
