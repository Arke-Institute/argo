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
| `<-[term]->` | Bidirectional edge (both directions) |
| `-[term1, term2]->` | Outgoing edge matching ANY of the terms |
| `-[*]->` | Outgoing edge with any relation (wildcard) |
| `<-[*]-` | Incoming edge with any relation (wildcard) |
| `<-[*]->` | Bidirectional wildcard (any relation, both directions) |

**Fuzzy relation matching**: The term(s) in brackets are embedded and compared against the actual relation predicates in the graph. The top-k most similar relations are followed.

**Bidirectional traversal**: The `<-[...]->` syntax follows edges in both directions simultaneously. Outgoing and incoming edges are processed separately, merged, and deduplicated. Each edge in the result path records its actual direction (`outgoing` or `incoming`).

**Example**: `-[born, birth]->` will match relations like `BORN_ON`, `BIRTH_DATE`, `DATE_OF_BIRTH`, etc.

### 2a. Variable-Depth Traversal

For exploring multiple hops without specifying exact depth:

| Syntax | Description |
|--------|-------------|
| `-[*]{1,4}->` | 1 to 4 hops |
| `-[*]{,4}->` | Up to 4 hops (shorthand for {1,4}) |
| `-[*]{2,}->` | 2 or more hops (capped by default max_depth=4) |
| `-[*]{3}->` | Exactly 3 hops |
| `-[term]{1,3}->` | Variable depth with fuzzy relation matching |

**Execution**: BFS (breadth-first search) where each depth builds on previous:
- Results collected at each depth that match the final filter
- For type-only filters: closer results always win (early termination when k results found)
- For semantic filters: continues to max depth (deeper match might beat closer)

**Scoring**: Path scores multiply naturally (similarity < 1.0 = natural decay). No artificial depth penalty.

**Stacking**: Variable-depth hops can be chained with other hops (fixed or variable):

```
@entity -[*]{,2}-> type:person -[*]{,3}-> type:file
```

Each segment produces results that become starting points for the next segment. Full paths are tracked across all segments.

### 3. Node Filters

After an edge, you can filter what entities to include.

| Syntax | Description | Example |
|--------|-------------|---------|
| `type:typename` | Filter by entity type | `type:person` |
| `type:t1,t2,t3` | Filter by multiple types (OR) | `type:file,document` |
| `type:typename ~ "text"` | Type filter + semantic ranking | `type:event ~ "military battle"` |
| `type:t1,t2 ~ "text"` | Multi-type + semantic ranking | `type:file,document ~ "letter"` |
| `@canonical_id` | Exact entity match | `@mount_vernon` |
| `"text"` | Semantic filter on candidates | `"historical event"` |
| (none) | No filter, accept all | `-[knows]->` at end of query |

**Type filter** restricts results to entities of that type. Valid types: `person`, `place`, `organization`, `date`, `file`, `event`, `pi`, `unknown`.

**Multi-type filter** allows matching any of several types using comma-separated values. Example: `type:file,document` matches both file and document entities. Useful when entity types overlap or when searching across related types.

**Combined type + semantic filter** first filters by type(s), then ranks within that set by semantic similarity. The `~` operator means "similar to". Example: `type:event ~ "military battle"` finds events that are semantically similar to "military battle".

**Semantic filter** (quoted text at a non-entry position) ranks the candidate entities by semantic similarity to the text. This is different from entry-point search: it searches *within* the candidates found by traversal, not the whole index.

### 4. Zero-Hop Queries

A filter can be applied directly to the entry point without any edge traversal. This is useful for disambiguating semantic searches.

| Syntax | Description | Example |
|--------|-------------|---------|
| `"text" type:X` | Semantic search filtered by type | `"Washington" type:person` |
| `"text" type:X ~ "ranking"` | Type filter + semantic ranking | `"letter" type:file ~ "correspondence"` |
| `@id type:X` | Exact lookup verified by type | `@washington type:person` |

**Zero-hop queries** solve the semantic disambiguation problem where edge traversal would find connected entities rather than direct matches. For example, `"Washington" type:person` returns persons matching "Washington" directly, rather than traversing to connected entities.

**Execution**: The entry point is resolved normally (semantic search or exact lookup), then the filter is applied to narrow/rank results without any graph traversal.

### 5. Chain Structure

A complete query is a chain of: `entry_point` followed by one or more `edge + filter` pairs.

```
entry_point [-[relation]-> filter]*
```

The **rightmost position** is always the result target.

---

## Complete Grammar

```
query           := entry_point entry_filter? (edge filter?)*
entry_point     := semantic_search | exact_entity
entry_filter    := filter                           // Zero-hop: filter applied directly to entry
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
filter          := combined_filter | type_filter | exact_entity | semantic_search | ε
combined_filter := type_filter "~" semantic_search
type_filter     := "type:" typename_list
typename_list   := typename ("," typename)*
typename        := "person" | "place" | "organization" | "date" | "file" | "event" | "pi" | "unknown"
exact_entity    := "@" canonical_id
semantic_search := '"' text '"'
canonical_id    := [a-zA-Z0-9_:-]+
text            := [^"]+
integer         := [0-9]+
```

---

## Execution Model

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `k` | int | 5 | Number of final results to return |
| `k_explore` | int | `k * 3` | Beam width for intermediate traversal (how many candidates to explore at each hop) |
| `lineage` | object | null | PI lineage filter - scope query to entities within a PI hierarchy |
| `enrich` | bool | false | Fetch content for PI and File entities in results |
| `enrich_limit` | int | 2000 | Max characters to fetch per entity when enriching |

### Lineage Filtering

The `lineage` parameter scopes queries to entities and relationships within a PI's hierarchy. This is useful for restricting results to a specific data source or collection.

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

**Execution**:
1. Before query execution, the lineage API is called to get all PIs in the specified direction
2. Entry point resolution filters Pinecone by `source_pi $in [allowed_pis]`
3. Each hop filters relationships by `source_pi` and entities by `source_pis`
4. Results only include entities/relationships from the allowed PIs

**Use cases**:
- Scoping to a single collection: `direction: "descendants"` from a collection PI
- Finding provenance: `direction: "ancestors"` to find parent PIs
- Full lineage: `direction: "both"` for complete lineage context

### Content Enrichment

The `enrich` parameter fetches content for PI and File entities in results.

```json
{
  "path": "@some_file",
  "enrich": true,
  "enrich_limit": 5000
}
```

**For File entities**: Fetches content from IPFS based on `content_type`:
- `text`: Raw text content (truncated to `enrich_limit`)
- `ref_*`: Parsed JSON blob with structured data

**For PI entities**: Fetches manifest components:
- `pinx`: Short identifier
- `description`: Human-readable description
- `manifest.version`: Manifest version
- `manifest.children_count`: Number of child PIs

### Execution Steps

Given a query like:
```
"George Washington" -[born]-> type:date <-[event]- type:event
```

**Step 1: Entry Point Resolution**

```
entry_point = "George Washington" (semantic search)

→ Call Pinecone: embed("George Washington"), query top_k=k_explore
→ Results: [george_washington (0.95), washington_irving (0.72), ...]
→ Keep top k_explore results
→ current_entities = [george_washington, ...]
   paths = [[george_washington], ...]
```

**Step 2: First Edge Traversal**

```
edge = -[born]->
filter = type:date

For each entity in current_entities:
  → Get all outgoing relations from Neo4j
  → Embed relation predicates (cached)
  → Score against embed("born")
  → Keep top k_explore relations by score

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
  → Keep top k_explore relations by score

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
  → Keep top k_explore by score

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

### Example 9: Variable-Depth

**Query**: "Find all files within 4 hops of Washington"

```
@george_washington -[*]{,4}-> type:file
```

**Execution**:
1. BFS expansion at each depth level (1, 2, 3, 4)
2. Collect files found at each level
3. Return closest matches first (closer = higher score)

---

### Example 10: Variable-Depth with Semantic Filter

**Query**: "Find events related to military battles, up to 3 hops"

```
@george_washington -[*]{1,3}-> type:event ~ "military battle"
```

**Execution**:
1. BFS expansion up to 3 levels
2. At each level, filter to events and rank by semantic similarity
3. Continue to max depth (deeper semantic match might beat closer)

---

### Example 11: Stacked Variable-Depth

**Query**: "Find organizations through people connected to the Declaration"

```
@declaration -[*]{1,2}-> type:person -[*]{,3}-> type:organization
```

**Execution**:
1. First segment: Find persons within 1-2 hops of declaration
2. Those persons become starting points for second segment
3. Second segment: Find organizations within 1-3 hops of each person
4. Merge and deduplicate results across all paths

**Result path example**:
```
declaration → (SIGNED_BY) → washington → (AFFILIATED_WITH) → continental_congress
```

---

### Example 12: Zero-Hop Query

**Query**: "Find people named Washington (direct match, no traversal)"

```
"Washington" type:person
```

**Execution**:
1. Semantic search "Washington" → returns various matches
2. Filter directly by type:person → only person entities
3. No edge traversal (zero hops)

**Use case**: Disambiguation - find entities directly rather than connected entities.

---

### Example 13: Zero-Hop with Semantic Ranking

**Query**: "Find letters about correspondence"

```
"letter" type:file ~ "correspondence"
```

**Execution**:
1. Semantic search "letter"
2. Filter to type:file
3. Re-rank by semantic similarity to "correspondence"

---

### Example 14: Bidirectional Traversal

**Query**: "Find all persons connected to Washington in any direction"

```
@george_washington <-[*]-> type:person
```

**Execution**:
1. Start from washington entity
2. Follow ALL edges (both outgoing and incoming)
3. Filter to persons

**Use case**: Exploring connections without knowing relationship direction.

---

### Example 15: Bidirectional with Relation Terms

**Query**: "Find entities related through family connections"

```
@george_washington <-[family, relative, spouse, child]-> type:person
```

**Execution**:
1. Follow edges matching family-related terms in both directions
2. Filter to person entities

---

### Example 16: Lineage-Scoped Query

**Query**: "Find people in the Drexel collection"

**Request**:
```json
{
  "path": "\"person\" type:person",
  "k": 10,
  "lineage": {
    "sourcePi": "arke:drexel_historical_collection",
    "direction": "descendants"
  }
}
```

**Execution**:
1. Resolve lineage: get all PIs descended from drexel_historical_collection
2. Semantic search "person" filtered to source_pi in lineage
3. Filter to type:person

---

### Example 17: Enriched File Query

**Query**: "Get files mentioning a topic with content"

**Request**:
```json
{
  "path": "\"Revolutionary War\" <-[*]- type:file",
  "k": 5,
  "enrich": true,
  "enrich_limit": 5000
}
```

**Response** (partial):
```json
{
  "results": [{
    "entity": {
      "canonical_id": "arke:doc:letter_001",
      "label": "Letter from Washington",
      "type": "file",
      "content": {
        "text": "Dear Sir, I write to inform you of our victory...",
        "format": "text",
        "truncated": false
      }
    }
  }]
}
```

---

### Example 18: Finding PIs (Processing Instances)

**Query**: "Find PIs related to historical collections"

```
"historical collection" type:pi
```

**Execution**:
1. Semantic search "historical collection"
2. Filter directly to type:pi

**Use case**: Find data source collections by topic.

---

### Example 19: Navigating PI Hierarchy

**Query**: "Find child PIs of a collection"

```
@arke:drexel_collection -[HAS_CHILD]-> type:pi
```

**Execution**:
1. Start from known PI
2. Follow HAS_CHILD relationships
3. Filter to PI entities

**Note**: PI hierarchy uses `HAS_CHILD` relationships. Use incoming `<-[HAS_CHILD]-` to find parent PIs.

---

### Example 20: Files Within a PI

**Query**: "Find all files in a specific PI"

```
@arke:drexel_collection -[HAS_FILE]-> type:file
```

**Execution**:
1. Start from PI
2. Follow HAS_FILE relationships
3. Return file entities

**Alternative with semantic ranking**:
```
@arke:drexel_collection -[HAS_FILE]-> type:file ~ "correspondence letters"
```

---

### Example 21: From File to Mentioned Entities

**Query**: "What people and places are mentioned in this file?"

```
@arke:doc:letter_001 -[MENTIONS, REFERS_TO]-> type:person
```

```
@arke:doc:letter_001 -[MENTIONS, REFERS_TO]-> type:place
```

**Use case**: Extract entities from a document.

---

### Example 22: PI with Enriched Metadata

**Query**: "Get PI details with manifest info"

**Request**:
```json
{
  "path": "@arke:drexel_collection",
  "enrich": true
}
```

**Response** (partial):
```json
{
  "results": [{
    "entity": {
      "canonical_id": "arke:drexel_collection",
      "label": "Drexel Historical Collection",
      "type": "pi",
      "content": {
        "pinx": "drexel",
        "description": "Historical documents from Drexel University archives",
        "manifest": {
          "version": 1,
          "children_count": 15
        }
      }
    }
  }]
}
```

---

### Example 23: Files with Structured Data

**Query**: "Get reference files with parsed JSON"

**Request**:
```json
{
  "path": "\"metadata\" type:file ~ \"structured data\"",
  "enrich": true
}
```

**Response** (partial - for a file with content_type: ref_json):
```json
{
  "results": [{
    "entity": {
      "canonical_id": "arke:ref:metadata_001",
      "type": "file",
      "content": {
        "data": {
          "author": "George Washington",
          "date": "1776-07-04",
          "recipients": ["John Adams", "Thomas Jefferson"]
        },
        "format": "json"
      }
    }
  }]
}
```

---

### Example 24: Cross-PI Entity Search

**Query**: "Find people mentioned across multiple collections"

**Request**:
```json
{
  "path": "\"Benjamin Franklin\" type:person",
  "k": 10
}
```

**Use case**: Without lineage filtering, searches across all PIs to find entity mentions in different collections.

---

### Example 25: File to PI Provenance

**Query**: "What PI does this file belong to?"

```
@arke:doc:letter_001 <-[HAS_FILE]- type:pi
```

**Execution**:
1. Start from file
2. Follow incoming HAS_FILE edge
3. Return the parent PI

**Use case**: Trace provenance of a document back to its source collection.

---

## Edge Cases

### Low Similarity Scores

With k-based selection (no threshold), queries always return results even with low semantic similarity. A query like `"xyzzy nonsense"` will still return the top-k most similar entities, potentially with very low scores (e.g., 0.1).

**Implication**: Callers should check the `score` field in results to assess confidence. Low scores indicate weak matches.

### No Entry Point Found

This only occurs when:
- The Pinecone index is empty
- For `@id` lookup, the entity doesn't exist in GraphDB

```json
{
  "results": [],
  "metadata": {
    "error": "no_entry_point",
    "message": "No matching entities found for entry point"
  }
}
```

### No Path Found

This occurs when:
- An entity has no relationships in the specified direction
- A type filter excludes all candidates at some hop

```json
{
  "results": [],
  "metadata": {
    "error": "no_path_found",
    "reason": "Traversal stopped at hop 1 - no matching relations or entities",
    "stopped_at_hop": 1,
    "partial_path": [{ "entity": "george_washington", "label": "George Washington" }]
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
4. Keep top k_explore by score

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
  type?: string;        // Entity type
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
  content?: EnrichedContent;  // Present when enrich=true
}

interface EnrichedContent {
  // For files with content_type: text
  text?: string;

  // For files with ref_* types - parsed JSON blob
  data?: Record<string, unknown>;

  // Fallback if JSON parsing fails
  raw?: string;

  // For PIs - fetched from manifest components
  pinx?: string | null;
  description?: string | null;
  manifest?: {
    version?: number;
    children_count?: number;
  };

  // Metadata
  format?: "text" | "json" | "raw";
  truncated?: boolean;
  parse_error?: boolean;
  fetch_error?: string;
}

interface Metadata {
  query: string;
  hops: number;
  k: number;
  k_explore: number;
  total_candidates_explored: number;
  execution_time_ms: number;
  error?: string;
  partial_path?: PathStep[];
  stopped_at_hop?: number;
  reason?: string;
  lineage?: LineageMetadata;  // Present when lineage filter used
}

interface LineageMetadata {
  sourcePi: string;
  direction: string;
  piCount: number;
  truncated: boolean;
}
```

---

## Future Extensions

These features are not yet implemented:

- **Intersection queries**: Find entities connected to multiple entry points
- **Property filters**: `type:person{country: "USA"}`
- **Negation**: `-[!enemy]->` (relations NOT matching)
- **Optional edges**: `-[born]->?` (zero or one hop)
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
- Beam search prunes low-scoring paths automatically

### Safety Limits

- **MAX_TOTAL_CANDIDATES = 1000**: Variable-depth traversal stops if this limit is reached
- **DEFAULT_MAX_DEPTH = 4**: Used for unbounded `{2,}` syntax
- **k_explore**: Limits candidates explored per hop (default: k × 3)

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
