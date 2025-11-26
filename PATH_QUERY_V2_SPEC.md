# Path Query Language v2 Specification

Building on v1, this document specifies new features for variable-depth traversal and combined semantic+type filtering.

**Implementation Status:**
- Phase 1 (Combined Type + Semantic): IMPLEMENTED
- Phase 2 (Variable-Depth BFS): IMPLEMENTED
- Phase 3 (Guided Search): IMPLEMENTED
- Phase 4 (Stacked Variable-Depth): PENDING

---

## Summary of Changes from v1

| Feature | v1 | v2 | Status |
|---------|----|----|--------|
| Fixed-hop traversal | Yes | Yes | Done |
| Type filters | Yes | Yes | Done |
| Semantic filters | At end only | **Anywhere (combined with type)** | Done |
| Variable-depth traversal | No | **Yes** | Done |
| Guided search | No | **Yes** | Done |
| Stacked variable-depth | No | **Yes** | Pending |

---

## Phase 1: Combined Type + Semantic Filters

### Problem

In v1, you can filter by type OR by semantic similarity, but not both:

```
@washington -[*]-> type:event           # All events, no semantic ranking
@washington -[*]-> "military battles"   # Semantically similar, any type
```

We want: "Find events semantically similar to 'military battles'"

### New Syntax

```
@washington -[*]-> type:event ~ "military battles"
```

The `~` operator applies semantic similarity scoring to type-filtered results.

### Grammar Addition

```
filter := type_filter | exact_entity | semantic_search | combined_filter | ε
combined_filter := type_filter "~" semantic_search
```

### Examples

```
# Events related to military battles
@washington -[*]-> type:event ~ "military battles"

# People who are scientists
"Albert Einstein" -[knows]-> type:person ~ "physicist researcher"

# Files about financial topics
@company_xyz <-[*]- type:file ~ "quarterly earnings revenue"
```

### Execution

1. Apply type filter first → get candidate entity IDs
2. Query Pinecone with semantic text, filtered to those IDs
3. Return ranked results

This is similar to the existing semantic filter at end, but explicitly combined with type.

---

## Phase 2: Variable-Depth Exhaustive Search (BFS with k-limit)

### Problem

In v1, you must specify exact hop count:

```
@washington -[*]-> type:file                           # 1 hop only
@washington -[*]-> -[*]-> type:file                    # Exactly 2 hops
@washington -[*]-> -[*]-> -[*]-> type:file             # Exactly 3 hops
```

We want: "Find all files connected to Washington within 4 hops"

### New Syntax

```
@washington -[*]{1,4}-> type:file
```

The `{min,max}` range specifier after the relation brackets.

| Syntax | Meaning |
|--------|---------|
| `{1,4}` | Between 1 and 4 hops |
| `{,4}` | Up to 4 hops (shorthand for `{1,4}`) |
| `{2,}` | 2 or more hops (use max_depth parameter as cap) |
| `{3}` | Exactly 3 hops (same as chaining 3 fixed hops) |

### Direction

Direction arrows still work as expected:

```
@washington -[*]{,4}->  type:file    # Outgoing only
@washington <-[*]{,4}-  type:file    # Incoming only
@washington <-[*]{,4}-> type:file    # Bidirectional
```

### Grammar Addition

```
edge := outgoing | incoming | bidirectional
outgoing := "-[" relation "]" depth_range? "->"
incoming := "<-[" relation "]" depth_range? "-"
bidirectional := "<-[" relation "]" depth_range? "->"
depth_range := "{" min_depth? "," max_depth? "}" | "{" exact_depth "}"
min_depth := integer
max_depth := integer
exact_depth := integer
```

### Execution: BFS with k-limit

```
function variableDepthBFS(start, direction, maxDepth, targetFilter, k):
  results = []
  visited = Set()
  queue = [(start, depth=0, path=[])]

  while queue not empty AND len(results) < k:
    (entity, depth, path) = queue.pop_front()

    if depth > 0 AND matches(entity, targetFilter):
      results.append({entity, path, score: 1.0 / depth})

    if depth < maxDepth:
      neighbors = getNeighbors(entity, direction)
      for neighbor in neighbors:
        if neighbor not in visited:
          visited.add(neighbor)
          queue.append((neighbor, depth+1, path + [edge, neighbor]))

  return results sorted by score (closer = higher)
```

**Key behaviors:**

1. BFS explores level by level (all depth-1 before depth-2)
2. Results collected at each depth if they match the target filter
3. Stop when we have k results OR exhausted max depth
4. Closer results score higher (score = 1.0 / depth, or similar decay)

### Examples

```
# Find all files within 4 hops of Washington
@washington -[*]{,4}-> type:file

# Find people within 2 hops (colleagues, collaborators)
@washington -[*]{,2}-> type:person

# Find anything connected bidirectionally within 3 hops
@washington <-[*]{,3}-> type:event
```

### With Relation Matching

Variable depth can combine with fuzzy relation matching:

```
@washington -[affiliated, member, worked]{,3}-> type:organization
```

At each hop, only follow relations that match the fuzzy terms. This naturally prunes the search space.

---

## Phase 3: Variable-Depth with Guided Search

### Problem

For large graphs, even BFS with k-limit can explore many irrelevant paths before finding matches. If we know the semantic target, we can guide the search.

### When Guided Search Activates

Guided search activates when variable-depth traversal has a **semantic filter** (with or without type):

```
# Type + semantic → guided search
@washington -[*]{,4}-> type:event ~ "military battles"

# Semantic only → guided search
@washington -[*]{,4}-> "military battles"
```

Exhaustive BFS (Phase 2) is used when the target is **type-only** with no semantic component:

```
# Type only → exhaustive BFS
@washington -[*]{,4}-> type:file
```

### Execution: Guided Beam Search

```
function guidedSearch(start, direction, maxDepth, typeFilter, semanticText, k):
  guidance_embedding = embed(semanticText)
  results = []
  beam = [(start, score=1.0, path=[])]

  for depth in 1..maxDepth:
    candidates = []

    for (entity, score, path) in beam:
      neighbors = getNeighbors(entity, direction)

      # Optionally filter by type at each level
      if typeFilter:
        neighbors = neighbors.filter(n => n.type == typeFilter)

      candidates.extend([(n, score, path + [edge, n]) for n in neighbors])

    if not candidates:
      break

    # Score candidates by semantic similarity to guidance
    candidate_ids = [c.entity.id for c in candidates]
    pinecone_scores = pinecone.query(
      vector=guidance_embedding,
      filter={id: {$in: candidate_ids}},
      top_k=k
    )

    # Merge scores: path_score * semantic_score * depth_decay
    for candidate in candidates:
      semantic_score = pinecone_scores.get(candidate.entity.id, 0)
      candidate.score = candidate.score * semantic_score * (0.95 ** depth)

    # Keep top k for next iteration (beam)
    beam = sorted(candidates, by=score, desc)[:k]

    # Collect results that match final filter
    for candidate in beam:
      if matches(candidate.entity, typeFilter):
        results.append(candidate)

  return results sorted by score
```

**Key differences from Phase 2:**

1. At each depth, query Pinecone to score candidates by semantic similarity
2. Beam search: only keep top-k most promising paths at each level
3. Combined score: `path_score * semantic_score * depth_decay`
4. Much more efficient for large graphs when we know what we're looking for

### Combining Relation Matching + Entity Guidance

For maximum precision, combine fuzzy relations with guided search:

```
@washington -[military, command, led]{,4}-> type:event ~ "revolutionary war battles"
```

At each hop:
1. Score relations against fuzzy terms → `relation_score`
2. Score candidate entities against semantic guidance → `entity_score`
3. Combined: `path_score * relation_score * entity_score * depth_decay`

---

## Phase 4: Stacked Variable-Depth (Chained Variable Hops)

### Problem

What if you want: "Find files connected to Washington through a person"?

```
@washington -[*]{,2}-> type:person -[*]{,3}-> type:file
```

This is two variable-depth segments chained together.

### Execution Model

Each variable-depth segment produces intermediate results. The next segment starts from those results.

```
Segment 1: @washington -[*]{,2}-> type:person
  → Results: [jefferson, adams, hamilton, ...]

Segment 2: (from each result) -[*]{,3}-> type:file
  Starting points: [jefferson, adams, hamilton, ...]
  → For jefferson: find files within 3 hops
  → For adams: find files within 3 hops
  → For hamilton: find files within 3 hops
  → Merge and dedupe results

Final results: files with paths like:
  washington → jefferson → document_123 → file_456
  washington → adams → letter_789 → file_012
```

### Path Tracking

Each result includes the full path through all segments:

```json
{
  "entity": { "canonical_id": "file_456", "type": "file" },
  "path": [
    { "entity": "washington", "label": "George Washington" },
    { "edge": "COLLABORATED_WITH", "direction": "outgoing" },
    { "entity": "jefferson", "label": "Thomas Jefferson" },
    { "edge": "AUTHORED", "direction": "outgoing" },
    { "entity": "document_123", "label": "Some Document" },
    { "edge": "EXTRACTED_FROM", "direction": "incoming" },
    { "entity": "file_456", "label": "archive.pdf" }
  ],
  "score": 0.72
}
```

### Complexity Consideration

Stacking multiplies complexity:

- Segment 1 produces up to k results
- Segment 2 runs from each of those k starting points
- Total work: O(k * work_per_segment)

With k=10 and two segments of max_depth=4 each:
- Segment 1: explores up to ~10k entities, returns 10
- Segment 2: 10 starting points × ~10k entities each = ~100k entities

This is manageable but we should:
1. Apply beam search within each segment
2. Limit total results across all segments
3. Potentially limit the intermediate result count

### Examples

```
# Files connected to Washington through a person
@washington -[*]{,2}-> type:person -[*]{,3}-> type:file

# Events connected to places Washington visited
@washington -[visited, resided]{,2}-> type:place <-[occurred, happened]{,2}- type:event

# Guided version: military-related files through military people
@washington -[*]{,2}-> type:person ~ "military general" -[*]{,3}-> type:file ~ "battle report"
```

---

## Updated Grammar (Complete)

```
query        := entry_point (edge filter?)*
entry_point  := semantic_search | exact_entity

edge         := outgoing | incoming | bidirectional
outgoing     := "-[" relation "]" depth_range? "->"
incoming     := "<-[" relation "]" depth_range? "-"
bidirectional := "<-[" relation "]" depth_range? "->"

relation     := "*" | term_list
term_list    := term ("," term)*
term         := [a-zA-Z_]+

depth_range  := "{" range_spec "}"
range_spec   := min_max | exact
min_max      := integer? "," integer?
exact        := integer

filter       := type_filter | exact_entity | semantic_search | combined_filter | ε
type_filter  := "type:" typename
combined_filter := type_filter "~" semantic_search
typename     := "person" | "place" | "organization" | "date" | "file" | "event" | "pi" | "unknown"

exact_entity := "@" canonical_id
semantic_search := '"' text '"'
canonical_id := [a-zA-Z0-9_:-]+
text         := [^"]+
```

---

## Execution Parameters (Updated)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `k` | int | 10 | Top-k results/beam width |
| `threshold` | float | 0.5 | Minimum similarity score |
| `max_results` | int | 50 | Maximum final results |
| `max_depth` | int | 4 | Default max depth for unbounded `{2,}` syntax |
| `depth_decay` | float | 0.95 | Score decay per hop (closer = higher score) |

---

## Implementation Order

### Phase 1: Combined Type + Semantic Filters
- Add `~` operator to grammar
- Update filter execution to handle combined filters
- Test with existing fixed-hop queries

### Phase 2: Variable-Depth BFS (Exhaustive)
- Add `{min,max}` depth range to grammar
- Implement BFS traversal with depth tracking
- Handle all three directions (out, in, bidirectional)
- Test with type-only filters

### Phase 3: Variable-Depth Guided Search
- Detect when semantic filter is present
- Implement beam search with Pinecone scoring at each level
- Combine relation scores + entity scores
- Test with semantic targets

### Phase 4: Stacked Variable-Depth
- Handle multiple variable-depth segments in sequence
- Track full paths across segments
- Manage intermediate result sets
- Test chained queries

---

## Questions to Resolve

1. **Pinecone filter syntax**: Need to verify exact syntax for `id IN [list]` filtering. The gateway may need an update.

2. **Score combination formula**: Currently proposed:
   ```
   score = entry_score * Π(relation_scores) * Π(entity_scores) * (decay ^ depth)
   ```
   Is this the right balance?

3. **Bidirectional cycle handling**: In bidirectional search, an entity might be reachable via outgoing then incoming. Should we:
   - Allow it (different paths)?
   - Dedupe by entity (shortest path wins)?

4. **Max intermediate results**: For stacked queries, should we cap how many results pass between segments? Proposal: `max_intermediate = k * 2`

5. **Empty intermediate results**: If segment 1 returns 0 results, return early with appropriate error message?

---

## Migration from v1

All v1 queries remain valid. The new syntax is additive:

| v1 Syntax | Still Works | v2 Equivalent |
|-----------|-------------|---------------|
| `-[*]->` | Yes | `-[*]{1}->` (implicit) |
| `type:person` | Yes | Same |
| `"semantic text"` | Yes | Same |

The only potential ambiguity is if someone wrote `type:person` followed by `~` which wasn't valid in v1, so no breaking changes.
