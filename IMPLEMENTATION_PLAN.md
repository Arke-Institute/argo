# Path Query Implementation Plan

## Overview

A Cloudflare Worker that parses and executes path queries against the Arke knowledge graph.

**Worker name:** `path-query` (or `query-links`?)
**Bindings:** `EMBEDDING_GATEWAY`, `GRAPHDB_GATEWAY`, `PINECONE_GATEWAY`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PATH QUERY WORKER                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  POST /query                                                             │
│       │                                                                  │
│       ▼                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │  Parser  │───▶│ Executor │───▶│ Traverser│───▶│Formatter │          │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘          │
│                        │                                                 │
│                        ▼                                                 │
│               ┌─────────────────┐                                        │
│               │ Service Clients │                                        │
│               │ - embedding     │                                        │
│               │ - graphdb       │                                        │
│               │ - pinecone      │                                        │
│               └────────┬────────┘                                        │
│                        │                                                 │
└────────────────────────┼─────────────────────────────────────────────────┘
                         │ Service Bindings (RPC)
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │ embedding │   │  graphdb  │   │ pinecone  │
   │  gateway  │   │  gateway  │   │  gateway  │
   └───────────┘   └───────────┘   └───────────┘
```

---

## API Endpoints

### POST /query
Execute a path query.

**Request:**
```json
{
  "path": "\"George Washington\" -[born]-> type:date",
  "k": 3,
  "threshold": 0.5,
  "max_results": 20
}
```

**Response:**
```json
{
  "results": [
    {
      "entity": {
        "canonical_id": "date_1732_02_22",
        "label": "February 22, 1732",
        "type": "date",
        "properties": {}
      },
      "path": [
        { "entity": "george_washington", "label": "George Washington" },
        { "edge": "BORN_ON", "direction": "outgoing", "score": 0.92 },
        { "entity": "date_1732_02_22", "label": "February 22, 1732" }
      ],
      "score": 0.89
    }
  ],
  "metadata": {
    "query": "\"George Washington\" -[born]-> type:date",
    "hops": 1,
    "execution_time_ms": 150
  }
}
```

### GET /parse
Parse a path query and return the AST (for debugging).

**Request:** `GET /parse?path="George Washington" -[born]-> type:date`

**Response:**
```json
{
  "ast": {
    "entry": { "type": "semantic_search", "text": "George Washington" },
    "hops": [
      {
        "direction": "outgoing",
        "relation": { "type": "fuzzy", "terms": ["born"] },
        "filter": { "type": "type_filter", "value": "date" }
      }
    ]
  }
}
```

### GET /health
Health check.

---

## File Structure

```
src/
├── index.ts                    # Worker entry, routing
├── types.ts                    # Shared types (AST, results, etc.)
│
├── parser/
│   ├── index.ts                # Main parse() function
│   ├── lexer.ts                # Tokenize path string
│   ├── parser.ts               # Build AST from tokens
│   └── types.ts                # Token and AST types
│
├── executor/
│   ├── index.ts                # Main execute() function
│   ├── entry.ts                # Resolve entry points
│   ├── traverse.ts             # Single hop traversal
│   ├── filter.ts               # Apply type/semantic filters
│   ├── scoring.ts              # Similarity scoring, path ranking
│   └── types.ts                # Execution state types
│
├── services/
│   ├── index.ts                # Service client factory
│   ├── embedding.ts            # EmbeddingClient
│   ├── graphdb.ts              # GraphDBClient
│   ├── pinecone.ts             # PineconeClient
│   └── types.ts                # Service interfaces
│
└── utils/
    ├── similarity.ts           # Cosine similarity
    └── errors.ts               # Custom error types
```

---

## Implementation Tasks

### Phase 1: Project Setup

#### 1.1 Initialize Worker Project
- [ ] Create `wrangler.jsonc` with service bindings
- [ ] Create `package.json` with dependencies
- [ ] Create `tsconfig.json`
- [ ] Create basic `src/index.ts` with health endpoint

**wrangler.jsonc:**
```jsonc
{
  "name": "path-query",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  "services": [
    { "binding": "EMBEDDING_GATEWAY", "service": "embedding-gateway" },
    { "binding": "GRAPHDB_GATEWAY", "service": "graphdb-gateway" },
    { "binding": "PINECONE_GATEWAY", "service": "pinecone-gateway" }
  ]
}
```

---

### Phase 2: Service Clients

#### 2.1 Create Service Types
- [ ] Define `Env` interface with bindings
- [ ] Define request/response types for each service

#### 2.2 Embedding Client
- [ ] `embed(texts: string[]): Promise<number[][]>`
- [ ] Use 768 dimensions, text-embedding-3-small

#### 2.3 GraphDB Client
- [ ] `getEntity(canonical_id: string): Promise<Entity | null>`
- [ ] `getRelationships(canonical_id: string): Promise<{ outgoing: Relationship[], incoming: Relationship[] }>`
  - **NOTE:** May need to use `POST /query` with Cypher if endpoint doesn't exist

#### 2.4 Pinecone Client
- [ ] `semanticSearch(vector: number[], filter?: object, top_k?: number): Promise<Match[]>`
- [ ] `searchByIds(vector: number[], ids: string[], top_k?: number): Promise<Match[]>`

---

### Phase 3: Parser

#### 3.1 Define Token Types
```typescript
type TokenType =
  | 'QUOTED_STRING'    // "George Washington"
  | 'AT_ID'            // @george_washington
  | 'TYPE_FILTER'      // type:person
  | 'ARROW_OUT'        // ->
  | 'ARROW_IN'         // <-
  | 'BRACKET_OPEN'     // [
  | 'BRACKET_CLOSE'    // ]
  | 'COMMA'            // ,
  | 'WILDCARD'         // *
  | 'TERM'             // born, affiliated, etc.
  | 'DASH'             // -
  | 'EOF'
```

#### 3.2 Define AST Types
```typescript
interface PathAST {
  entry: EntryPoint;
  hops: Hop[];
}

type EntryPoint =
  | { type: 'semantic_search'; text: string }
  | { type: 'exact_id'; id: string }

interface Hop {
  direction: 'outgoing' | 'incoming';
  relation: RelationMatch;
  filter: Filter | null;
}

type RelationMatch =
  | { type: 'wildcard' }
  | { type: 'fuzzy'; terms: string[] }

type Filter =
  | { type: 'type_filter'; value: string }
  | { type: 'exact_id'; id: string }
  | { type: 'semantic_search'; text: string }
```

#### 3.3 Implement Lexer
- [ ] `tokenize(input: string): Token[]`
- [ ] Handle quoted strings with escapes
- [ ] Handle @-prefixed IDs
- [ ] Handle type: prefix

#### 3.4 Implement Parser
- [ ] `parse(tokens: Token[]): PathAST`
- [ ] Entry point parsing
- [ ] Hop parsing (direction + relation + optional filter)
- [ ] Error messages with position info

#### 3.5 Parser Tests
- [ ] Test basic queries
- [ ] Test edge cases (empty relation, malformed input)
- [ ] Test error messages

---

### Phase 4: Executor

#### 4.1 Execution State
```typescript
interface ExecutionState {
  // Current candidates at this point in traversal
  candidates: CandidatePath[];
  // Parameters
  k: number;
  threshold: number;
  max_results: number;
}

interface CandidatePath {
  current_entity: Entity;
  path: PathStep[];
  score: number;
}
```

#### 4.2 Entry Point Resolution
- [ ] `resolveEntry(entry: EntryPoint, services, k): Promise<CandidatePath[]>`
- [ ] Semantic search: embed text → query Pinecone → fetch entities
- [ ] Exact ID: fetch from GraphDB directly

#### 4.3 Single Hop Traversal
- [ ] `executeHop(candidates: CandidatePath[], hop: Hop, services, k, threshold): Promise<CandidatePath[]>`
- [ ] Get relationships for each candidate entity
- [ ] Filter by direction (outgoing/incoming)
- [ ] Score relations against fuzzy terms (if not wildcard)
- [ ] Keep top-k relations per entity
- [ ] Fetch target entities
- [ ] Apply type/semantic filter
- [ ] Extend paths

#### 4.4 Relation Scoring
- [ ] `scoreRelations(relations: Relationship[], terms: string[], services): Promise<ScoredRelation[]>`
- [ ] Embed relation predicates
- [ ] Embed fuzzy terms
- [ ] Compute cosine similarity
- [ ] Return sorted by score

#### 4.5 Filter Application
- [ ] `applyFilter(entities: Entity[], filter: Filter, services, k): Promise<Entity[]>`
- [ ] Type filter: simple property check
- [ ] Exact ID: single entity match
- [ ] Semantic filter: embed text → query Pinecone filtered by IDs

#### 4.6 Main Executor
- [ ] `execute(ast: PathAST, services, params): Promise<QueryResult>`
- [ ] Resolve entry point
- [ ] Loop through hops
- [ ] Track partial paths for error reporting
- [ ] Format final results

---

### Phase 5: Integration & Polish

#### 5.1 Wire Up Routes
- [ ] POST /query → parse → execute → respond
- [ ] GET /parse → parse → respond with AST
- [ ] GET /health → respond OK
- [ ] Error handling middleware

#### 5.2 Response Formatting
- [ ] Format paths with entity labels
- [ ] Include metadata (timing, hops, etc.)
- [ ] Handle partial results (traversal stopped early)

#### 5.3 Error Handling
- [ ] Parse errors with position
- [ ] No entry point found
- [ ] No matching relations
- [ ] Service errors (graceful degradation?)

#### 5.4 Testing
- [ ] Unit tests for parser
- [ ] Integration tests against real services
- [ ] Test queries from spec examples

---

## Dependencies

**Required GraphDB Endpoint:**

`GET /relationships/:canonical_id` - Returns incoming and outgoing relationships for an entity.

**If not available**, we can use `POST /query` with:
```cypher
MATCH (e:Entity {canonical_id: $id})-[r]->(target)
RETURN type(r) as predicate, r.source_pi as source_pi, r.properties as properties, target.canonical_id as target_id, 'outgoing' as direction
UNION
MATCH (source)-[r]->(e:Entity {canonical_id: $id})
RETURN type(r) as predicate, r.source_pi as source_pi, r.properties as properties, source.canonical_id as target_id, 'incoming' as direction
```

---

## Open Questions

1. **Worker name:** `path-query` or `query-links`?

2. **Scoring formula:** How to combine scores across hops?
   - Multiply? (penalizes long paths)
   - Average? (treats all hops equally)
   - Minimum? (bottleneck approach)

   **Suggestion:** Start with multiply, adjust later.

3. **Relation embedding:** Should we batch embed all relation predicates in a single call, or embed per-hop?
   - Batching is more efficient if we have many unique predicates
   - Per-hop is simpler to implement

   **Suggestion:** Start with per-hop, optimize later.

4. **Cycle detection:** Should we prevent revisiting entities in the same path?

   **Suggestion:** Yes, track visited IDs per path.

---

## Milestones

| Milestone | Description | Deliverable |
|-----------|-------------|-------------|
| M1 | Project setup + service clients working | Can call all 3 services |
| M2 | Parser complete | Can parse all example queries |
| M3 | Basic executor (no fuzzy matching) | Works with wildcard relations only |
| M4 | Full executor with fuzzy matching | Complete implementation |
| M5 | Polish + error handling | Production ready |

---

## Example Execution Trace

Query: `"George Washington" -[born]-> type:date`

```
1. Parse
   AST: {
     entry: { type: 'semantic_search', text: 'George Washington' },
     hops: [{
       direction: 'outgoing',
       relation: { type: 'fuzzy', terms: ['born'] },
       filter: { type: 'type_filter', value: 'date' }
     }]
   }

2. Resolve Entry
   - Embed "George Washington" → [0.12, -0.34, ...]
   - Query Pinecone(vector, top_k=3) → [
       { id: 'george_washington', score: 0.95 },
       { id: 'washington_irving', score: 0.72 },
       { id: 'booker_t_washington', score: 0.68 }
     ]
   - Fetch entities from GraphDB
   - candidates = [{ entity: george_washington, path: [...], score: 0.95 }, ...]

3. Execute Hop 1
   For george_washington (score 0.95):
     - Get relationships → { outgoing: [BORN_ON, DIED_ON, AFFILIATED_WITH, ...], incoming: [...] }
     - Filter to outgoing only
     - Score relations against "born":
       - BORN_ON: 0.92
       - DIED_ON: 0.45
       - AFFILIATED_WITH: 0.12
     - Keep top k=3 above threshold=0.5 → [BORN_ON]
     - Get target entities → [date_1732_02_22]
     - Apply type filter (date) → [date_1732_02_22] ✓
     - New candidate: {
         entity: date_1732_02_22,
         path: [washington, -BORN_ON->, date],
         score: 0.95 * 0.92 = 0.87
       }

4. Format Results
   {
     results: [{ entity: date_1732_02_22, path: [...], score: 0.87 }],
     metadata: { hops: 1, execution_time_ms: 150 }
   }
```
