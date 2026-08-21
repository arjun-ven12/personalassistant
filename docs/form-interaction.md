# Form Interaction

`FormInteractionService` supports deterministic form work over registered
semantic field mappings. It does not rely on visual order, screen position, OCR,
or pixels.

Supported field types:

- text, password, email, search, number
- date, time
- dropdown
- checkbox, radio
- slider
- multi-select

Before a value is entered, the field mapping validation contract is checked:
required state, length limits, regex, numeric ranges, allowed values, dropdown
options, and secure password-entry policy.

If validation fails, the service records a failed interaction and asks for user
direction. It never silently coerces or modifies values.

Supported form operations include fill, clear, replace, append, reset, review,
preview, submit, and cancel. Multi-field requests are decomposed into ordered
semantic action records.
