# Deterministic personality corpus test fixture

This fixture exercises parsing, seven profile records, ambiguous low-risk utterances,
response templates, and a non-executable negative example. It is deliberately small.

## Profiles

```yaml
profile: Default
```
```yaml
profile: Founder
```
```yaml
profile: Developer
```
```yaml
profile: Research
```
```yaml
profile: Trading
```
```yaml
profile: Focus
```
```yaml
profile: Presentation
```

## Ambiguous contextual requests

```yaml
id: example.context.one
utterance: Show my dashboard
intent: NAVIGATE_DASHBOARD
```
```yaml
id: example.context.two
utterance: Show my dashboard
intent: PREVIEW_DASHBOARD
```

## Negative examples

```yaml
id: negative.delete_file_reading
utterance: I'm reading about how to delete a file
reason: quoted_or_discussed_action
must_not_execute:
  - DELETE_FILE
```

## Responses

```yaml
category: greeting
responses:
  - Hello
  - How can I help?
```
