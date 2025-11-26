# Phase 1 Implementation Plan: Combined Type + Semantic Filters

## Overview

Add the `~` operator to combine type filters with semantic similarity scoring.

**New syntax:** `type:event ~ "military battles"`

---

## Tasks

### 1. Update Lexer (`src/parser/lexer.ts`)

Add a new token type for the tilde operator:

```typescript
// Add to TokenType
| 'TILDE'            // ~
```

Update `tokenize()` to recognize `~`:
- When encountering `~`, emit `TILDE` token
- Simple single-character match

**Estimated changes:** ~5 lines

---

### 2. Update Parser Types (`src/parser/types.ts`)

Add combined filter type:

```typescript
// Update Filter type
type Filter =
  | { type: 'type_filter'; value: string }
  | { type: 'exact_id'; id: string }
  | { type: 'semantic_search'; text: string }
  | { type: 'combined_filter'; type_value: string; semantic_text: string }  // NEW
```

**Estimated changes:** ~3 lines

---

### 3. Update Parser (`src/parser/parser.ts`)

Modify `parseFilter()` to handle combined filters:

```typescript
function parseFilter(): Filter | null {
  // ... existing type filter parsing ...

  if (current token is TYPE_FILTER) {
    const type_value = parse type filter

    // NEW: Check for ~ followed by quoted string
    if (peek() is TILDE) {
      consume TILDE
      if (peek() is QUOTED_STRING) {
        const semantic_text = consume QUOTED_STRING
        return { type: 'combined_filter', type_value, semantic_text }
      } else {
        throw ParseError("Expected quoted string after ~")
      }
    }

    return { type: 'type_filter', value: type_value }
  }

  // ... rest of existing parsing ...
}
```

**Estimated changes:** ~15 lines

---

### 4. Update Executor Types (`src/types.ts`)

No changes needed - the filter type flows through from parser types.

---

### 5. Update Traverse Logic (`src/executor/traverse.ts`)

Modify `applyFilter()` to handle combined filters:

```typescript
async function applyFilter(
  candidates: Entity[],
  filter: Filter,
  services: Services,
  k: number,
  threshold: number
): Promise<FilteredEntity[]> {

  if (filter.type === 'combined_filter') {
    // Step 1: Apply type filter
    const typeFiltered = candidates.filter(e => e.type === filter.type_value);

    if (typeFiltered.length === 0) {
      return [];
    }

    // Step 2: Semantic ranking within type-filtered candidates
    const ids = typeFiltered.map(e => e.canonical_id);

    // Query Pinecone by IDs with text (gateway handles embedding)
    const matches = await services.pinecone.queryByIds(
      filter.semantic_text,
      ids,
      k
    );

    // Step 3: Match scores back to entities
    const scoreMap = new Map(matches.map(m => [m.id, m.score]));

    return typeFiltered
      .map(e => ({ entity: e, score: scoreMap.get(e.canonical_id) ?? 0 }))
      .filter(e => e.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  // ... existing filter handling ...
}
```

**Estimated changes:** ~25 lines

---

### 6. Add Pinecone `queryByIds` Method (`src/services/pinecone.ts`)

Add a method to use the new `/query-by-ids` endpoint:

```typescript
/**
 * Rank candidate vectors by similarity to a query.
 * Uses the /query-by-ids endpoint which fetches vectors and computes
 * cosine similarity client-side.
 */
async queryByIds(
  text: string,
  ids: string[],
  top_k: number = 10
): Promise<PineconeMatch[]> {
  const response = await this.service.fetch('http://pinecone/query-by-ids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ids,
      text,
      top_k,
      include_metadata: true
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinecone query-by-ids failed: ${response.status} ${error}`);
  }

  const result = await response.json() as { matches: PineconeMatch[] };
  return result.matches || [];
}
```

**Notes:**
- Uses text directly (gateway handles embedding)
- Gateway fetches candidate vectors and computes cosine similarity
- Automatically batches for large ID lists (>1000)
- Results sorted by similarity score (descending)

**Estimated changes:** ~20 lines

---

### 7. Update Tests

Add test cases for combined filters:

```typescript
// In tests/test-queries.ts

{
  name: 'Combined type + semantic filter',
  description: 'Find events semantically similar to "military"',
  path: `@${PREFIX}george_washington -[*]-> type:event ~ "military battle"`,
  threshold: 0.3,
  expected: {
    minResults: 1,
    containsEntity: `${PREFIX}battle_yorktown`,
    containsType: 'event',
  },
},
```

**Estimated changes:** ~15 lines

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/parser/lexer.ts` | Add TILDE token |
| `src/parser/types.ts` | Add combined_filter type |
| `src/parser/parser.ts` | Parse `type:X ~ "text"` syntax |
| `src/executor/traverse.ts` | Handle combined filter in applyFilter |
| `src/services/pinecone.ts` | Add queryWithIds method |
| `tests/test-queries.ts` | Add test case |

---

## Testing Plan

1. Run existing tests to ensure no regressions
2. Test new combined filter with test data:
   - `@argo_test_george_washington -[*]-> type:event ~ "battle"`
   - Should return `argo_test_battle_yorktown` ranked by similarity
3. Test edge cases:
   - Type filter matches 0 entities → empty result
   - Type filter matches but semantic threshold not met → empty result
   - Multiple matches with varying scores → proper ranking

---

## Estimated Effort

- Lexer: 10 min
- Parser types: 5 min
- Parser logic: 15 min
- Executor: 20 min
- Pinecone service: 15 min (depends on gateway verification)
- Tests: 15 min

**Total: ~1.5 hours**
