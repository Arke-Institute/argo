# Path Query Language Specification

A lightweight DSL for traversing the Arke knowledge graph with semantic flexibility.

---

## Overview

Path queries describe a traversal through the knowledge graph, starting from an entry point and following edges (with fuzzy semantic matching) to reach target entities. The language prioritizes readability and flexibility over rigid schema matching.

```
"George Washington" -[born]-> type:date <-[event]- type:event
```

---

## Core Syntax Elements

### 1. Entry Points

Every query starts with an entry point on the left side.

| Syntax | Description | Example |
|--------|-------------|---------|
| `"text"` | Semantic search - finds entities matching the text | `"George Washington"` |
| `@canonical_id` | Exact entity lookup by canonical ID | `@george_washington` |

**Semantic search** embeds the text and queries Pinecone, returning the top-k most similar entities.

**Exact lookup** fetches a specific entity from Neo4j by its canonical ID.

### 2. Edge Traversal

Edges connect entities and specify direction and relation matching.

| Syntax | Description |
|--------|-------------|
| `-[term]->` | Outgoing edge with fuzzy relation match |
| `<-[term]-` | Incoming edge with fuzzy relation match |
| `-[term1, term2]->` | Outgoing edge matching ANY of the terms |
| `-[*]->` | Outgoing edge with any relation (wildcard) |
| `<-[*]-` | Incoming edge with any relation (wildcard) |

**Fuzzy relation matching**: The term(s) in brackets are embedded and compared against the actual relation predicates in the graph. The top-k most similar relations are followed.

**Example**: `-[born, birth]->` will match relations like `BORN_ON`, `BIRTH_DATE`, `DATE_OF_BIRTH`, etc.

### 3. Node Filters

After an edge, you can filter what entities to include.

| Syntax | Description | Example |
|--------|-------------|---------|
| `type:typename` | Filter by entity type | `type:person` |
| `@canonical_id` | Exact entity match | `@mount_vernon` |
| `"text"` | Semantic filter on candidates | `"historical event"` |
| (none) | No filter, accept all | `-[knows]->` at end of query |

**Type filter** restricts results to entities of that type. Valid types: `person`, `place`, `organization`, `date`, `file`, `event`, `unknown`.

**Semantic filter** (quoted text at a non-entry position) ranks the candidate entities by semantic similarity to the text. This is different from entry-point search: it searches *within* the candidates found by traversal, not the whole index.

### 4. Chain Structure

A complete query is a chain of: `entry_point` followed by one or more `edge + filter` pairs.

```
entry_point [-[relation]-> filter]*
```

The **rightmost position** is always the result target.

---

## Complete Grammar

```
query        := entry_point (edge filter?)*
entry_point  := semantic_search | exact_entity
edge         := outgoing | incoming
outgoing     := "-[" relation "]->"
incoming     := "<-[" relation "]-"
relation     := "*" | term_list
term_list    := term ("," term)*
term         := [a-zA-Z_]+
filter       := type_filter | exact_entity | semantic_search | ε
type_filter  := "type:" typename
typename     := "person" | "place" | "organization" | "date" | "file" | "event" | "unknown"
exact_entity := "@" canonical_id
semantic_search := '"' text '"'
canonical_id := [a-zA-Z0-9_:]+
text         := [^"]+
```

---

## Execution Model

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `k` | int | 3 | Top-k results to keep at each hop |
| `threshold` | float | 0.5 | Minimum similarity score for relation/entity matching |
| `max_results` | int | 20 | Maximum final results to return |

### Execution Steps

Given a query like:
```
"George Washington" -[born]-> type:date <-[event]- type:event
```

**Step 1: Entry Point Resolution**

```
entry_point = "George Washington" (semantic search)

→ Call Pinecone: embed("George Washington"), query top_k=k
→ Results: [george_washington (0.95), washington_irving (0.72), ...]
→ Keep top k, apply threshold
→ current_entities = [george_washington]
   paths = [[george_washington]]
```

**Step 2: First Edge Traversal**

```
edge = -[born]->
filter = type:date

For each entity in current_entities:
  → Get all outgoing relations from Neo4j
  → Embed relation predicates (cached)
  → Score against embed("born")
  → Keep top k relations above threshold

  For each matched relation:
    → Add target entity to candidates
    → Extend path: [george_washington, -BORN_ON->, date_1732_02_22]

→ Apply type filter: keep only type:date
→ current_entities = [date_1732_02_22]
   paths = [[george_washington, -BORN_ON->, date_1732_02_22]]
```

**Step 3: Second Edge Traversal**

```
edge = <-[event]-
filter = type:event

For each entity in current_entities:
  → Get all INCOMING relations from Neo4j
  → Score against embed("event")
  → Keep top k relations above threshold

  For each matched relation:
    → Add SOURCE entity to candidates (incoming edge)
    → Extend path

→ Apply type filter: keep only type:event
→ current_entities = [battle_of_yorktown, ...]
   paths = [[george_washington, -BORN_ON->, date_1732_02_22, <-OCCURRED_ON-, battle_of_yorktown], ...]
```

**Step 4: Return Results**

```json
{
  "results": [
    {
      "entity": { "canonical_id": "battle_of_yorktown", "label": "Battle of Yorktown", "type": "event", ... },
      "path": [
        { "entity": "george_washington", "label": "George Washington" },
        { "edge": "BORN_ON", "direction": "outgoing" },
        { "entity": "date_1732_02_22", "label": "February 22, 1732" },
        { "edge": "OCCURRED_ON", "direction": "incoming" },
        { "entity": "battle_of_yorktown", "label": "Battle of Yorktown" }
      ],
      "score": 0.87
    }
  ],
  "metadata": {
    "hops": 2,
    "total_candidates_explored": 15,
    "execution_time_ms": 230
  }
}
```

---

## Semantic Filter at End

When the final position is a quoted string (not a type filter), it acts as a semantic filter on candidates:

```
"George Washington" -[born]-> type:date <-[*]- "historical event"
```

Execution of final step:

```
edge = <-[*]- (wildcard, all incoming relations)
filter = "historical event" (semantic)

For each entity in current_entities:
  → Get ALL incoming relations (no relation filtering due to wildcard)
  → Collect all source entities as candidates

→ Semantic filter:
  → Get candidate IDs: [event_123, meeting_456, letter_789, ...]
  → Query Pinecone with embed("historical event"), filter to only these IDs
  → Rank by similarity
  → Keep top k above threshold

→ current_entities = [event_123, ...]
```

This allows finding entities that are:
1. Connected to the traversal path
2. Semantically similar to a concept

---

## Examples

### Example 1: Simple Attribute Lookup

**Query**: "When was George Washington born?"

```
"George Washington" -[born, birth]-> type:date
```

**Execution**:
1. Semantic search "George Washington" → `george_washington`
2. Outgoing edges matching "born" or "birth" → follows `BORN_ON`
3. Filter to dates → `date_1732_02_22`

**Result**: February 22, 1732

---

### Example 2: Reverse Lookup

**Query**: "What documents mention Mount Vernon?"

```
"Mount Vernon" <-[mentioned, about, describes]- type:file
```

**Execution**:
1. Semantic search "Mount Vernon" → `mount_vernon`
2. Incoming edges matching mention-related terms
3. Filter to files → `[arke:01ABC:file_001, ...]`

---

### Example 3: Multi-Hop

**Query**: "What events happened on George Washington's birthday?"

```
"George Washington" -[born]-> type:date <-[happened, occurred, event]- type:event
```

**Execution**:
1. Find Washington → traverse to birth date → find events on that date

---

### Example 4: From Exact Entity

**Query**: Starting from a known entity

```
@continental_congress -[member, delegate]-> type:person
```

**Execution**:
1. Direct lookup of `continental_congress`
2. Outgoing edges matching "member" or "delegate"
3. Filter to persons

---

### Example 5: Open-Ended Exploration

**Query**: "Find anything interesting connected to Thomas Jefferson"

```
"Thomas Jefferson" -[*]-> "significant historical"
```

**Execution**:
1. Find Jefferson
2. Follow ALL outgoing relations
3. Semantically filter results by "significant historical"

---

### Example 6: File to Entity

**Query**: "Who is mentioned in this document?"

```
@arke:01ABC:file_001 -[mentions, contains, about]-> type:person
```

---

### Example 7: Finding Source Documents

**Query**: "What files contain information about the Revolutionary War?"

```
"Revolutionary War" <-[*]- type:file
```

---

### Example 8: Long Chain

**Query**: "Find places where people George Washington worked with lived"

```
"George Washington" -[worked, collaborated, served]-> type:person -[lived, resided]-> type:place
```

**Execution**:
1. Find Washington
2. Find people he worked with
3. Find where those people lived

---

## Edge Cases

### No Results at Entry Point

If semantic search returns no results above threshold:

```
"xyzzy nonsense query" -[*]-> type:person
```

**Behavior**: Return empty results with metadata indicating "no entry point found".

```json
{
  "results": [],
  "metadata": {
    "error": "no_entry_point",
    "message": "Semantic search found no matching entities for 'xyzzy nonsense query'"
  }
}
```

### No Matching Relations

If no relations match the fuzzy term:

```
"George Washington" -[teleported]-> type:place
```

**Behavior**: Return partial path showing where traversal stopped.

```json
{
  "results": [],
  "metadata": {
    "partial_path": [{ "entity": "george_washington", "label": "George Washington" }],
    "stopped_at_hop": 1,
    "reason": "no_matching_relations",
    "available_relations": ["BORN_ON", "AFFILIATED_WITH", "MENTIONED_IN", ...]
  }
}
```

### No Entities Match Type Filter

```
"George Washington" -[born]-> type:organization
```

**Behavior**: Return empty. Birth dates aren't organizations.

### Ambiguous Entry Point

```
"Washington" -[*]-> type:date
```

**Behavior**: Multiple entities may match. With `k=3`:
- Follow paths from all k entry points
- Merge and deduplicate results
- Score final results by cumulative path score

### Cycles

```
"George Washington" -[knows]-> type:person -[knows]-> type:person -[knows]-> type:person
```

**Behavior**:
- Track visited entities per path
- Skip entities already in the current path
- Different paths may visit the same entity

### Empty Relation Term List

```
"George Washington" -[]-> type:date
```

**Behavior**: Parse error. Use `[*]` for wildcard.

---

## Relation Matching Details

### Pre-computed Relation Embeddings

For efficiency, all unique relation predicates in Neo4j should have pre-computed embeddings:

```
BORN_ON         → [0.12, -0.34, ...]
AFFILIATED_WITH → [0.56, 0.78, ...]
MENTIONED_IN    → [-0.23, 0.45, ...]
...
```

### Matching Algorithm

Given fuzzy terms `[born, birth]` and candidate relations `[BORN_ON, DIED_ON, AFFILIATED_WITH]`:

1. Embed each fuzzy term: `embed("born")`, `embed("birth")`
2. For each candidate relation:
   - Score = max similarity across all fuzzy terms
   - `score(BORN_ON) = max(sim("born", BORN_ON), sim("birth", BORN_ON))`
3. Rank relations by score
4. Keep top k above threshold

### Exact Relation Matching

For system relations that should match exactly, use the exact predicate:

```
"Mount Vernon" -[MENTIONED_IN]-> type:pi
```

If the term in brackets exactly matches a known predicate (case-insensitive), skip embedding and match directly.

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
  score: number;  // Cumulative score across all hops
}

interface PathStep {
  entity?: string;      // canonical_id
  label?: string;       // Human-readable
  edge?: string;        // Relation predicate
  direction?: "outgoing" | "incoming";
  score?: number;       // Score for this hop
}

interface Entity {
  canonical_id: string;
  label: string;
  type: string;
  properties: Record<string, any>;
  source_pis: string[];
}

interface Metadata {
  query: string;
  hops: number;
  k: number;
  threshold: number;
  total_candidates_explored: number;
  execution_time_ms: number;
  error?: string;
  partial_path?: PathStep[];
  stopped_at_hop?: number;
  reason?: string;
}
```

---

## Future Extensions (Out of Scope for v1)

- **Intersection queries**: Find entities connected to multiple entry points
- **Property filters**: `type:person{country: "USA"}`
- **Negation**: `-[!enemy]->` (relations NOT matching)
- **Optional edges**: `-[born]->?` (zero or one hop)
- **Variable-length paths**: `-[knows*2..4]->` (2 to 4 hops of same relation)
- **Named captures**: `"Washington" as $w -[*]-> $w` (backreferences)
- **Aggregations**: Count, group by, etc.

---

## Implementation Notes

### Caching Strategy

1. **Relation embeddings**: Pre-compute and cache indefinitely (invalidate on new relation types)
2. **Entity embeddings**: Already in Pinecone
3. **Query term embeddings**: Cache with TTL (same terms often reused)

### Performance Considerations

- Each hop multiplies candidates by k
- 3 hops with k=3: up to 27 paths
- 5 hops with k=3: up to 243 paths
- Consider pruning low-scoring paths mid-traversal

### LLM Integration

The LLM's job is to translate natural language to this path syntax:

**Input**: "What events happened on George Washington's birthday?"

**Output**:
```
"George Washington" -[born, birth]-> type:date <-[happened, occurred, event, took_place]- type:event
```

The LLM should:
1. Identify the entry point entity/concept
2. Hypothesize reasonable relation terms (multiple synonyms help)
3. Specify type filters where the intent is clear
4. Use semantic filters for vague concepts
