# Path Query Language Specification

A lightweight DSL for traversing the Arke knowledge graph with semantic flexibility.

---

## Overview

Path queries describe a traversal through the knowledge graph, starting from an entry point and following edges to reach target entities. The engine uses a **triad-based execution model** that efficiently finds paths using Neo4j's native graph algorithms.

```
"alice austen" -[*]{,4}-> type:person ~ "photographer"
```

---

## Core Syntax Elements

### 1. Entry Points

Every query starts with an entry point on the left side.

| Syntax | Description | Example |
|--------|-------------|---------|
| `"text"` | Semantic search - finds entities matching the text | `"alice austen"` |
| `@canonical_id` | Exact entity lookup by canonical ID | `@george_washington` |
| `type:X ~ "text"` | Type filter + semantic search | `type:person ~ "photographer"` |
| `type:X` | Type filter only (zero-hop queries only) | `type:person` |

**Semantic search** embeds the text and queries Pinecone, returning the top-k most similar entities.

**Exact lookup** fetches a specific entity from Neo4j by its canonical ID.

**Type + semantic** queries Pinecone with a type filter and semantic ranking.

> **IMPORTANT: Entry Point Restrictions**
>
> For queries with hops (edge traversal), the entry point MUST be:
> - Semantic search: `"text"`
> - Exact ID: `@canonical_id`
> - Type + semantic: `type:X ~ "text"`
>
> **Type-only entry points (`type:X`) are NOT supported for queries with hops.**
> This is because the triad model requires known source entity IDs.
>
> Type-only entry points are valid for zero-hop queries only (no traversal).

### 2. Edge Traversal

Edges connect entities and specify direction.

| Syntax | Description |
|--------|-------------|
| `-[*]->` | Outgoing edge, any relation |
| `<-[*]-` | Incoming edge, any relation |
| `<-[*]->` | Bidirectional edge (both directions) |
| `-[term]->` | Outgoing edge with fuzzy relation match (single-hop only) |
| `-[term1, term2]->` | Outgoing edge matching ANY of the terms (single-hop only) |

**Wildcard (`[*]`)** follows all edges without relation filtering. This is the **recommended pattern** for most queries as it leverages the triad model's efficiency.

**Fuzzy relation matching** embeds the term(s) and compares against actual predicates. **This is only supported for single-hop queries.** For multi-hop traversal, use `[*]` and filter results.

### 2a. Variable-Depth Traversal

For exploring multiple hops:

| Syntax | Description |
|--------|-------------|
| `-[*]{1,4}->` | 1 to 4 hops |
| `-[*]{,4}->` | Up to 4 hops (shorthand for {1,4}) |
| `-[*]{2,}->` | 2 or more hops (capped at max_depth=4) |
| `-[*]{3}->` | Exactly 3 hops |

> **IMPORTANT: Variable-depth queries MUST use wildcard `[*]`**
>
> Fuzzy relation matching (`-[term]{,N}->`) is NOT supported for variable-depth.
> The triad model finds paths first, then scoring happens post-hoc.

**Execution**: Uses Neo4j's native path-finding algorithms. Queries depths 1 through N, returning shortest paths first.

**Maximum Depth**: The maximum supported depth is **4 hops**. Higher depths cause exponential query times in densely connected graph regions.

**Stacking**: Variable-depth hops can be chained:

```
@entity -[*]{,2}-> type:person -[*]{,3}-> type:file
```

Each segment produces results that become starting points for the next segment.

### 3. Node Filters (Targets)

After an edge, you specify what entities to find.

| Syntax | Description | Example |
|--------|-------------|---------|
| `type:X` | Filter by entity type | `type:person` |
| `type:X,Y,Z` | Filter by multiple types (OR) | `type:file,document` |
| `type:X ~ "text"` | Type filter + semantic ranking | `type:event ~ "military battle"` |
| `@canonical_id` | Exact entity match | `@mount_vernon` |
| `"text"` | Semantic search on candidates | `"historical significance"` |

> **IMPORTANT: Target filter is REQUIRED for queries with hops**
>
> You cannot leave the target empty. These are NOT supported:
> ```
> "query" -[*]->              // ERROR: no target
> "query" -[*]{,4}->          // ERROR: no target
> ```
>
> Every hop must end with a target filter (type, semantic, or exact_id).

**Recommended pattern**: Use `type:X` or `type:X ~ "semantic"` for targets. This allows the triad model to efficiently query Neo4j.

### 4. Zero-Hop Queries

A filter applied directly to the entry point without edge traversal.

| Syntax | Description | Example |
|--------|-------------|---------|
| `"text" type:X` | Semantic search filtered by type | `"Washington" type:person` |
| `"text" type:X ~ "ranking"` | Type filter + semantic ranking | `"letter" type:file ~ "correspondence"` |
| `type:X ~ "text"` | Type + semantic (entry-only) | `type:person ~ "photographer"` |
| `type:X` | Type filter only | `type:person` |

**Zero-hop queries** return direct matches without graph traversal. Type-only entry points are allowed here since no traversal is needed.

### 5. Chain Structure

A complete query is: `entry_point` optionally followed by `edge + filter` pairs.

```
entry_point [edge filter]+
```

The **rightmost position** is the result target.

---

## Recommended Query Patterns

The triad execution model works best with certain patterns. Here are the recommended approaches:

### Best Patterns

```
# Semantic entry + type target (OPTIMAL)
"alice austen" -[*]{,4}-> type:person

# Semantic entry + semantic target (OPTIMAL)
"alice austen" -[*]{,4}-> type:person ~ "photographer"

# Exact ID entry + type target (OPTIMAL)
@6a9dbb57-9096-4753-a0e6-26299324161f -[*]{,4}-> type:file

# Type+semantic entry + type target (OPTIMAL)
type:person ~ "alice austen" -[*]{,4}-> type:collection

# Single-hop with fuzzy relation (SUPPORTED)
"alice austen" -[photographed, captured]-> type:person
```

### Avoid These Patterns

```
# Type-only entry with hops (NOT SUPPORTED)
type:person -[*]{,4}-> type:file
# ERROR: "Queries with hops require a semantic search or exact ID entry point"

# No target filter (NOT SUPPORTED)
"alice austen" -[*]->
# ERROR: No target specified

# Fuzzy relations on variable-depth (NOT SUPPORTED)
"alice austen" -[photographed]{,4}-> type:person
# Use: "alice austen" -[*]{,4}-> type:person instead

# Very long chains (SLOW)
"query" -[*]{,4}-> type:X -[*]{,4}-> type:Y -[*]{,4}-> type:Z
# Each segment queries the graph separately; prefer fewer, deeper hops
```

---

## Complete Grammar

```
query           := entry_point entry_filter? (edge filter)*
entry_point     := semantic_search | exact_entity | type_semantic_entry | type_entry
type_semantic_entry := type_filter "~" semantic_search
type_entry      := type_filter                    // Only valid for zero-hop
entry_filter    := filter                         // Zero-hop: filter applied directly
edge            := outgoing | incoming | bidirectional
outgoing        := "-[" relation "]" depth_range? "->"
incoming        := "<-[" relation "]" depth_range? "-"
bidirectional   := "<-[" relation "]" depth_range? "->"
relation        := "*" | term_list
term_list       := term ("," term)*
term            := [a-zA-Z_]+
depth_range     := "{" range_spec "}"
range_spec      := min_max | exact
min_max         := integer? "," integer?
exact           := integer
filter          := combined_filter | type_filter | exact_entity | semantic_search
combined_filter := type_filter "~" semantic_search
type_filter     := "type:" typename_list
typename_list   := typename ("," typename)*
typename        := "person" | "place" | "organization" | "date" | "file" | "event" | "pi" | "collection" | "document" | "unknown"
exact_entity    := "@" canonical_id
semantic_search := '"' text '"'
canonical_id    := [a-zA-Z0-9_:-]+
text            := [^"]+
integer         := [0-9]+
```

---

## Execution Model

### The Triad Model

The engine uses a **triad-based execution model**:

```
[source candidates] -[depth N]-> [target constraint]
```

**Execution flow**:
1. Resolve source candidates via Pinecone semantic search
2. Resolve target candidates (if semantic target) via Pinecone
3. Use Neo4j's native path-finding to connect sources to targets
4. Score and rank results

**Benefits**:
- 2-3 HTTP requests instead of 500+ (for complex queries)
- Execution time: 2-5 seconds for 4-hop queries
- Leverages Neo4j's optimized graph algorithms

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `k` | int | 5 | Number of final results to return |
| `k_explore` | int | `k * 3` | Beam width for intermediate traversal |
| `lineage` | object | null | PI lineage filter |
| `enrich` | bool | false | Fetch content for PI and File entities |
| `enrich_limit` | int | 2000 | Max characters per enriched entity |

### Scoring

Results are scored based on:

```
final_score = ((source_score + target_score) / 2) * depth_decay * relation_score

where:
- source_score: Pinecone semantic match at entry (0.0-1.0)
- target_score: Pinecone semantic match at target, or 1.0 if type-only
- depth_decay: 0.9^(path_length - 1)
  - 1 hop: 1.0
  - 2 hops: 0.9
  - 3 hops: 0.81
  - 4 hops: 0.729
- relation_score: From fuzzy relation matching (single-hop only), or 1.0
```

**Depth decay** naturally favors shorter paths while still returning deeper results when relevant.

### Lineage Filtering

The `lineage` parameter scopes queries to entities within a PI hierarchy.

```json
{
  "path": "\"Washington\" type:person",
  "lineage": {
    "sourcePi": "arke:drexel_historical_collection",
    "direction": "descendants"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sourcePi` | string | The PI to start lineage resolution from |
| `direction` | string | `"ancestors"`, `"descendants"`, or `"both"` |

### Content Enrichment

The `enrich` parameter fetches content for PI and File entities.

```json
{
  "path": "@some_file",
  "enrich": true,
  "enrich_limit": 5000
}
```

**For File entities**: Fetches content from IPFS
**For PI entities**: Fetches manifest components (pinx, description, etc.)

---

## Examples

### Example 1: Find Related Entities

**Query**: "Find people connected to Alice Austen"

```
"alice austen" -[*]{,4}-> type:person
```

**Execution**:
1. Semantic search "alice austen" → source candidates
2. GraphDB: find persons within 4 hops of sources
3. Return paths ranked by score

---

### Example 2: Semantic Target

**Query**: "Find photographers connected to Alice Austen"

```
"alice austen" -[*]{,4}-> type:person ~ "photographer"
```

**Execution**:
1. Semantic search "alice austen" → source candidates
2. Semantic search "photographer" filtered to type:person → target candidates
3. GraphDB: find paths between sources and targets
4. Return paths ranked by combined source/target scores

---

### Example 3: From Exact Entity

**Query**: "Find files connected to a known entity"

```
@6a9dbb57-9096-4753-a0e6-26299324161f -[*]{,4}-> type:file
```

**Execution**:
1. Direct lookup of entity
2. GraphDB: find files within 4 hops
3. Return paths

---

### Example 4: Single-Hop with Relation Filtering

**Query**: "Find people Alice Austen photographed"

```
"alice austen" -[photographed, captured, took]-> type:person
```

**Execution**:
1. Semantic search "alice austen" → source candidates
2. GraphDB: find paths of depth 1 to type:person
3. Score relations against "photographed", "captured", "took"
4. Re-rank results by relation score

---

### Example 5: Zero-Hop Query

**Query**: "Find people named Washington"

```
"Washington" type:person
```

**Execution**:
1. Semantic search "Washington"
2. Filter by type:person
3. No traversal (zero hops)

---

### Example 6: Type + Semantic Entry

**Query**: "Find collections near photographers"

```
type:person ~ "photographer" -[*]{,3}-> type:collection
```

**Execution**:
1. Semantic search "photographer" filtered to type:person
2. GraphDB: find collections within 3 hops
3. Return paths

---

### Example 7: Chained Hops

**Query**: "Find files through people connected to a collection"

```
@collection_id -[*]{,2}-> type:person -[*]{,2}-> type:file
```

**Execution**:
1. First triad: find persons within 2 hops of collection
2. Second triad: find files within 2 hops of those persons
3. Combine paths and scores

---

### Example 8: Bidirectional Search

**Query**: "Find all persons connected to Washington in any direction"

```
"george washington" <-[*]-> type:person
```

**Execution**:
1. Semantic search for Washington
2. GraphDB: find persons connected in either direction
3. Return with direction recorded in path

---

### Example 9: Files Within a PI

**Query**: "Find files in a specific processing instance"

```
@arke:pi_id -[*]-> type:file
```

---

### Example 10: Semantic Filter Only Target

**Query**: "Find historically significant entities near Jefferson"

```
"thomas jefferson" -[*]{,3}-> "historically significant"
```

**Execution**:
1. Semantic search "thomas jefferson" → sources
2. Semantic search "historically significant" → target candidates
3. GraphDB: find paths between sources and targets
4. Return with semantic scores from both ends

---

## Limitations

### Not Supported

| Pattern | Status | Alternative |
|---------|--------|-------------|
| `type:X -[*]-> type:Y` | NOT SUPPORTED | Use `type:X ~ "semantic" -[*]-> type:Y` |
| `"query" -[*]->` (empty target) | NOT SUPPORTED | Always specify a target filter |
| `-[term]{,N}->` (fuzzy + variable-depth) | NOT SUPPORTED | Use `-[*]{,N}->` then filter |
| Depth > 4 | NOT SUPPORTED | Maximum depth is 4 hops |
| Property filters | NOT YET | `type:person{country: "USA"}` |
| Negation | NOT YET | `-[!enemy]->` |
| Aggregations | NOT YET | Count, group by, etc. |

### Error Responses

**Invalid entry point**:
```json
{
  "results": [],
  "metadata": {
    "error": "invalid_entry_point",
    "reason": "Queries with hops require a semantic search or exact ID entry point. Type-only entry points (type:X) are only valid for zero-hop queries."
  }
}
```

**Unsupported query pattern**:
```json
{
  "results": [],
  "metadata": {
    "error": "unsupported_query",
    "reason": "Variable-depth hop requires a target filter (type, semantic, or exact_id)"
  }
}
```

**No path found**:
```json
{
  "results": [],
  "metadata": {
    "error": "no_path_found",
    "reason": "Traversal stopped at hop 1 - no matching paths found",
    "stopped_at_hop": 1,
    "partial_path": [...]
  }
}
```

---

## Safety Limits

| Limit | Value | Reason |
|-------|-------|--------|
| MAX_DEPTH | 4 | Queries at depth 5+ cause exponential graph traversal (40+ seconds) |
| QUERY_TIMEOUT | 5 seconds | Safety net for densely connected regions |
| MAX_LIMIT | 1000 | Maximum results per GraphDB call |

---

## Output Format

### Success Response

```typescript
interface QueryResponse {
  results: Result[];
  metadata: Metadata;
}

interface Result {
  entity: Entity;
  path: PathStep[];
  score: number;
}

interface PathStep {
  entity?: string;      // canonical_id
  label?: string;       // Human-readable
  type?: string;        // Entity type
  edge?: string;        // Relation predicate
  direction?: "outgoing" | "incoming";
  score?: number;       // Score for this step
}

interface Entity {
  canonical_id: string;
  label: string;
  type: string;
  properties: Record<string, any>;
  source_pis: string[];
  content?: EnrichedContent;
}

interface Metadata {
  query: string;
  hops: number;
  k: number;
  k_explore: number;
  total_candidates_explored: number;
  execution_time_ms: number;
  error?: string;
  reason?: string;
  partial_path?: PathStep[];
  stopped_at_hop?: number;
  lineage?: LineageMetadata;
}
```

---

## LLM Integration

When translating natural language to path queries, the LLM should:

1. **Use semantic entry points**: Start with `"text"` or `type:X ~ "text"`, not `type:X` alone
2. **Use wildcard relations**: Prefer `-[*]{,N}->` over `-[term]{,N}->`
3. **Always specify targets**: Every hop must end with a type, semantic, or exact_id filter
4. **Use type + semantic targets**: `type:X ~ "semantic"` is more precise than `type:X` alone
5. **Prefer fewer, deeper hops**: One `-[*]{,4}->` is better than four `-[*]->`
6. **Keep depth <= 4**: Maximum supported depth is 4 hops

**Input**: "Find photographers connected to Alice Austen"

**Good output**:
```
"alice austen" -[*]{,4}-> type:person ~ "photographer"
```

**Bad output** (avoid):
```
type:person -[*]{,4}-> type:person    // Type-only entry not allowed
"alice austen" -[photographed]{,4}->  // Fuzzy relation on variable-depth not supported
"alice austen" -[*]->                 // No target specified
```
