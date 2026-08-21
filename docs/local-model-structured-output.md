# Structured Local Output

Interpretation is validated by `LocalIntentInterpretationSchema`. Invalid JSON
or invalid fields are retried at most once and then fail closed. No free-form
model text is converted into an executable command. A valid interpretation is
still only candidate data for the existing Intent Engine.
