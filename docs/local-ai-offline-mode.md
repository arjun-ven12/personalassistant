# Offline Mode

Ollama is addressed through loopback, so local model use does not require cloud
connectivity. Deterministic features remain available if Ollama is stopped.
Model-required requests fail with typed, controlled errors. Cloud routing is
intentionally deferred.
