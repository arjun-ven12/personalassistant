# Memory Retention

Memory Studio classifies cognitive items by retention intent:

- `TRANSIENT`
- `SHORT_TERM`
- `WORKING`
- `DURABLE`
- `PINNED`
- `HISTORICAL`
- `SYSTEM`

Retention in Phase 19D is control metadata and review guidance. It does not
delete canonical records.

## Controls

Owners can archive, restore, pin, unpin, and set retention metadata through
authenticated Studio APIs. Permanent deletion remains prohibited, so delete
requests return an impact preview and safer alternatives.

## Stale review

Items with old timestamps, low confidence, rejected state, or conflict markers
appear in review queues. Review queues are advisory and never mutate data
without an explicit guarded request.
