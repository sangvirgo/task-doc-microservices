# Postman hierarchy and permission coverage design

## Goal

Make the Postman collection exercise the current task, document, grant, and secure-download contracts end to end. The collection must prove both the allowed path and the authorization boundaries, not merely avoid 5xx responses.

## Scope

Only `docs/c17-api-postman-collection.json` will be changed. Backend behavior is already present and is treated as the contract source. Existing user changes elsewhere in the worktree are out of scope.

## Design

1. Add a dedicated parent/child task sequence:
   - create and assign a parent task;
   - reject child creation by the parent creator;
   - create two children by the current parent assignee;
   - verify the ancestor sees only the six-field summary;
   - reject a child participant trying to read the parent as a direct participant;
   - start and submit the parent, then reject parent approval while children remain incomplete;
   - complete and approve both children;
   - approve the parent after the child gate is satisfied.

2. Strengthen the document/grant/download sequence:
   - assert association and grant response fields;
   - pass `task_id` to permission checks and download-ticket creation;
   - verify grant delegation is to a direct task participant and is a permission subset;
   - verify one-time ticket redemption and replay denial;
   - verify detach revokes access and grants.

3. Improve collection reliability:
   - declare every dynamically stored collection variable;
   - replace hard-coded participant IDs with variables;
   - add request-level status, response-shape, and security assertions for core flows;
   - preserve the collection-level negative-request convention.

## Non-goals

- No backend source changes.
- No database reset or destructive Docker operation.
- No assumptions that task hierarchy grants document access transitively.

## Verification

- Parse the collection as JSON.
- Resolve every `{{variable}}` reference against declared or intentionally generated variables.
- Check that every new request has an assertion script and that negative names expect 4xx.
- Run `git diff --check` and inspect the final diff without touching unrelated worktree changes.
