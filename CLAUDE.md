## Context retrieval policy
Before reading any file to understand related code (symbols, callers, signatures),
always query the codegraph MCP tool first. Only read raw file content when:
- You need full implementation logic, not just a signature
- codegraph returns no relevant results
