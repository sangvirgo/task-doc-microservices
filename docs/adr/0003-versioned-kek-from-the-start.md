# Wrapped DEKs carry a KEK version from day one

Every Document version gets its own DEK, wrapped by a key-encrypting key loaded from an
environment secret at boot and never committed. Each wrapped DEK stores the `kek_version`
of the KEK that wrapped it, unwrap dispatches on that version, new document versions are
wrapped with the active version, and the KEK provider is an interface — even though only
one KEK version will ever exist in this project.

The versioning is scaffolding for a rotation feature nothing currently exercises, which
normally would not earn its place. It is here because retrofitting it is not a code change
but a data migration over every encrypted document in storage — cheap now, expensive later.

## Scope

This scaffold is the whole requirement. Explicitly out of scope, and not to be built:

- a production KMS or external key service;
- an automatic rotation scheduler;
- a bulk re-wrap migration.

## Consequences

- Rotation itself is not implemented. The platform can read documents wrapped under any
  recorded KEK version but cannot re-wrap them. This is a deliberate accepted boundary,
  recorded in Known Limitations, not an unfinished feature.
- The KEK is in application memory. A dedicated key service holding it out of process was
  considered and rejected as too much infrastructure for this project.
