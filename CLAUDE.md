# Argo Project Instructions

## Overview

Argo is a path query engine for the Thalassa knowledge graph. It's a Cloudflare Worker that provides semantic graph traversal.

## Key Files

- `src/index.ts` - Main worker entry point with HTTP endpoints
- `src/parser/` - Lexer and parser for the query DSL
- `src/executor/` - Query execution (entry resolution, graph traversal)
- `src/services/` - Clients for GraphDB, Pinecone, Embedding gateways
- `tests/` - Test queries and setup scripts

## Testing

- When adding new test cases, always add both:
  1. Test data in `tests/setup-test-data.ts`
  2. Test case in `tests/test-queries.ts`
- Run `npm run test:setup` before tests if data is missing
- Tests connect to live services (GraphDB, Pinecone, Embedding)

## Query Syntax

```
"semantic search" -[relation_terms]-> type:filter
@exact_id -[*]-> type:entity ~ "semantic ranking"
```

- Entry points: `"text"` (semantic) or `@id` (exact)
- Edges: `-[terms]->` (outgoing), `<-[terms]-` (incoming), `[*]` (wildcard)
- Filters: `type:X`, `type:X ~ "text"`, `@id`, `"semantic"`

## Parameters

- `k` (default 5) - Final results count
- `k_explore` (default k*3) - Beam width for exploration

## Development

- Uses wrangler.jsonc (not .toml) per Cloudflare Worker conventions
- Service bindings: EMBEDDING_GATEWAY, GRAPHDB_GATEWAY, PINECONE_GATEWAY
