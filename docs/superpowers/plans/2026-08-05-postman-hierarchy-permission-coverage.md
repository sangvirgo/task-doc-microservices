# Postman hierarchy and permission coverage implementation plan

## 1. Normalize collection state

- Add collection variables for every ID saved by scripts.
- Keep generated timestamps and UUIDs collection-scoped.
- Make the secure-download and permission-check bodies use the task binding required by the current backend.

## 2. Add task hierarchy flow

- Add a parent task with an assignee and save its ID.
- Exercise creator-denied child creation and assignee-allowed creation of two children.
- Assert child creator/parent/status fields and the ancestor six-field summary.
- Exercise descendant denial, incomplete-child parent approval denial, child approval, and final parent approval.

## 3. Strengthen sharing and permission flows

- Assert task-document association and task-scoped grant fields.
- Verify delegation targets a direct participant, is a subset, and has bounded effective expiry.
- Verify secure ticket creation, binary redemption, replay denial, detach cascade, and post-detach denial.
- Add response assertions to the core positive and negative requests.

## 4. Verify

- Parse JSON and validate request/event structure.
- Find unresolved variables and duplicate/invalid references.
- Run diff checks and inspect only the intended files.
- Reconfirm Docker container health and endpoint smoke results.
