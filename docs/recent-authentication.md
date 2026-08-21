# Recent authentication

High-risk approval uses a password ceremony:

1. An authenticated, CSRF-protected session requests a purpose-bound challenge.
2. The owner re-enters the password.
3. The server verifies the Argon2id owner hash and consumes the challenge.
4. A short-lived server-side grant is bound to owner, session, and purpose.
5. The approval route consumes the matching grant before changing the exact
   digest-bound approval to `APPROVED`.

The password is never sent to the approval endpoint or retained in browser
state. Login age, network membership, device trust, voice, face, or gesture are
not recent authentication. Logout or session revocation invalidates grants.
Passkeys and Android biometrics are future additions behind the same service
boundary. Approval still performs no action.
