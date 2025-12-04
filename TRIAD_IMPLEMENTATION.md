# Query-Links: Triad-Based Execution Implementation

## Overview

This document describes the implementation of triad-based query execution for the Argo query engine. This is a fundamental architectural change that replaces BFS graph traversal with a model where we resolve both endpoints of a query segment first, then ask GraphDB to find paths between them.

## Background: The Problem

The current BFS approach causes exponential subrequest growth:

```
"female medical college" -[*]{,4}-> type:file

Current flow:
1. Pinecone: find "female medical college" → 15 candidates
2. For each candidate:
   - GraphDB: getRelationships() → 350 relationships
   - GraphDB: getEntities() for each target → 350 calls
3. Repeat for depth 2, 3, 4...
Result: 500+ subrequests, hits Cloudflare Worker limits
```

## The Triad Model

A **triad** is: `[source constraint] -[relation, depth]-> [target constraint]`

```
New flow:
1. Pinecone: find "female medical college" → 15 source IDs
2. GraphDB: findReachable(source_ids, type=file, max_depth=4) → paths
3. Score and return results
Result: 1 Pinecone call + 1 GraphDB call
```

---

## Critical Constraint: Entry Point Requirements

**The entry point of a query MUST be one of:**
1. **Semantic search**: `"query text"` - searches Pinecone for matching entities
2. **Exact ID**: `@canonical_id` - looks up a specific entity
3. **Type + Semantic**: `type:person ~ "query text"` - semantic search within a type

**NOT SUPPORTED as entry point:**
- **Type-only**: `type:person` - This is NOT a valid entry point for triad queries

**Rationale:** The triad model requires known source entity IDs to pass to GraphDB's path-finding endpoints. A type-only entry would mean "all entities of this type" which is unbounded and defeats the purpose of the optimization.

### Valid Query Examples

```
"alice austen" -[*]{,4}-> type:person              ✅ Semantic entry
"alice austen" type:person -[*]{,4}-> type:file    ✅ Semantic entry with entry_filter
@a02e1ce8-d7c5-4008 -[*]{,4}-> type:file           ✅ Exact ID entry
type:person ~ "physician" -[*]{,2}-> type:event    ✅ Type+semantic entry
```

### Invalid Query Examples

```
type:person -[*]{,4}-> type:file                   ❌ Type-only entry NOT SUPPORTED
type:organization -[founded]-> "query"             ❌ Type-only entry NOT SUPPORTED
```

**Error Handling:** If a query has a type-only entry point with hops, return an error:
```json
{
  "error": "invalid_entry_point",
  "reason": "Queries with hops require a semantic search or exact ID entry point. Type-only entry points are only valid for zero-hop queries."
}
```

---

## Query Syntax Changes

### Variable-Depth Queries

| Syntax | Support | Notes |
|--------|---------|-------|
| `"query" -[*]{,4}-> type:file` | ✅ Supported | Wildcard relation, type target |
| `"query" -[*]{,4}-> type:file ~ "semantic"` | ✅ Supported | Wildcard relation, semantic target |
| `"query" -[*]{,4}-> "semantic target"` | ✅ Supported | Wildcard relation, semantic-only target |
| `"query" -[*]{,4}-> @exact_id` | ✅ Supported | Wildcard relation, exact target |
| `"query" -[related]{,4}-> type:file` | ❌ **NOT SUPPORTED** | Fuzzy relation on variable-depth |

**Important:** Fuzzy relation matching (`-[term1, term2]{,N}->`) is NO LONGER SUPPORTED for variable-depth queries. Use wildcard `[*]` for multi-hop traversal.

### Single-Hop Queries

| Syntax | Support | Notes |
|--------|---------|-------|
| `"query" -[*]-> type:file` | ✅ Supported | Uses triad with depth=1 |
| `"query" -[related, connected]-> type:file` | ✅ Supported | Triad + post-hoc relation scoring |
| `"query" -[authored]-> "semantic target"` | ✅ Supported | Full support |

Single-hop queries with fuzzy relations work by:
1. Finding paths (depth=1) via GraphDB
2. Scoring the relation predicates against query terms post-hoc
3. Adjusting result scores based on relation match

### Zero-Hop Queries

```
"alice austen" type:person                         ✅ Unchanged
"alice austen" type:person ~ "photographer"        ✅ Unchanged
type:person ~ "physician"                          ✅ Unchanged (no hops)
type:person                                        ✅ Unchanged (no hops)
```

Zero-hop queries (entry + optional filter, no hops) work exactly as before.

---

## What We're Keeping (No Changes)

| File | Reason |
|------|--------|
| `src/parser/lexer.ts` | Tokenization unchanged |
| `src/parser/parser.ts` | AST structure works for triads |
| `src/parser/types.ts` | PathAST, Hop, Filter types unchanged |
| `src/executor/entry.ts` | Entry point resolution unchanged |
| `src/services/pinecone.ts` | All methods still needed |
| `src/services/embedding.ts` | Needed for single-hop relation scoring |
| `src/services/graphdb.ts` | Existing methods kept, new methods added |
| `src/types.ts` | Core types unchanged |
| `src/utils/similarity.ts` | `cosineSimilarity` still needed |

---

## What We're Removing/Replacing

| File/Function | Action |
|--------------|--------|
| `src/executor/variable-depth.ts` | **DELETE ENTIRE FILE** |
| `src/executor/traverse.ts` | **REWRITE** - New triad-based logic |
| Functions: `expandOneLevel`, `expandCandidateOneLevel`, `scoreRelationsForExpansion` | **REMOVE** |

---

## New File Structure

```
src/
├── executor/
│   ├── index.ts          # MODIFY - New execution flow
│   ├── entry.ts          # KEEP - Unchanged
│   ├── triad.ts          # NEW - Triad execution logic
│   └── traverse.ts       # DELETE or REWRITE
├── services/
│   └── graphdb.ts        # MODIFY - Add path-finding methods
└── types.ts              # MODIFY - Add path result types
```

---

## Implementation Details

### 1. New Types (`src/types.ts`)

Add these types:

```typescript
// Path-finding request/response types
export interface PathsBetweenRequest {
  source_ids: string[];
  target_ids: string[];
  max_depth: number;
  direction: 'outgoing' | 'incoming' | 'both';
  limit?: number;
}

export interface PathEdge {
  subject_id: string;
  predicate: string;
  object_id: string;
  source_pi: string;
}

export interface PathResult {
  source_id: string;
  target_id: string;
  length: number;
  edges: PathEdge[];
}

export interface PathsBetweenResponse {
  paths: PathResult[];
  truncated: boolean;
}

export interface PathsReachableRequest {
  source_ids: string[];
  target_type: string;
  max_depth: number;
  direction: 'outgoing' | 'incoming' | 'both';
  limit: number;
}

export interface ReachableResult {
  source_id: string;
  target_id: string;
  target_label: string;
  target_type: string;
  length: number;
  edges: PathEdge[];
}

export interface PathsReachableResponse {
  results: ReachableResult[];
  truncated: boolean;
}
```

### 2. GraphDB Client Updates (`src/services/graphdb.ts`)

Add new methods:

```typescript
export class GraphDBClient {
  // ... existing methods ...

  /**
   * Find shortest paths between source and target entity sets
   */
  async findPathsBetween(req: PathsBetweenRequest): Promise<PathsBetweenResponse> {
    const response = await this.gateway.fetch(
      new Request(`${this.baseUrl}/paths/between`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB findPathsBetween failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Find entities of a type reachable from source entities
   */
  async findReachable(req: PathsReachableRequest): Promise<PathsReachableResponse> {
    const response = await this.gateway.fetch(
      new Request(`${this.baseUrl}/paths/reachable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB findReachable failed: ${error}`);
    }

    return response.json();
  }
}
```

### 3. New Triad Executor (`src/executor/triad.ts`)

```typescript
/**
 * Triad-Based Path Execution
 *
 * A triad is: [source candidates] -[relation, depth]-> [target constraint]
 *
 * We resolve both endpoints first, then ask GraphDB to find paths between them.
 */

import type { Services } from '../services';
import type {
  Entity,
  CandidatePath,
  PathStep,
  PathResult,
  ReachableResult,
} from '../types';
import type { Hop, Filter } from '../parser/types';
import { cosineSimilarity } from '../utils/similarity';

const DEFAULT_MAX_DEPTH = 4;
const DEPTH_DECAY_FACTOR = 0.9;

/**
 * Execute a variable-depth hop as a triad
 */
export async function executeTriadVariableDepth(
  sourceCandidates: CandidatePath[],
  hop: Hop,
  services: Services,
  limit: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  const { min, max } = hop.depth_range!;
  const maxDepth = max === -1 ? DEFAULT_MAX_DEPTH : max;

  const sourceIds = sourceCandidates.map((c) => c.current_entity.canonical_id);
  const direction = hop.direction === 'bidirectional' ? 'both' : hop.direction;

  // Route based on filter type
  if (hop.filter?.type === 'semantic_search') {
    return executeWithSemanticTarget(
      sourceCandidates,
      sourceIds,
      hop.filter.text,
      null,
      maxDepth,
      direction,
      services,
      limit,
      allowedPis
    );
  }

  if (hop.filter?.type === 'combined_filter') {
    return executeWithSemanticTarget(
      sourceCandidates,
      sourceIds,
      hop.filter.semantic_text,
      hop.filter.type_values,
      maxDepth,
      direction,
      services,
      limit,
      allowedPis
    );
  }

  if (hop.filter?.type === 'type_filter') {
    return executeWithTypeTarget(
      sourceCandidates,
      sourceIds,
      hop.filter.values,
      maxDepth,
      direction,
      services,
      limit,
      allowedPis
    );
  }

  if (hop.filter?.type === 'exact_id') {
    return executeWithExactTarget(
      sourceCandidates,
      sourceIds,
      hop.filter.id,
      maxDepth,
      direction,
      services,
      limit
    );
  }

  // No filter - error for variable depth
  throw new Error(
    'Variable-depth hop requires a target filter (type, semantic, or exact_id)'
  );
}

/**
 * Execute a single hop as a triad
 */
export async function executeTriadSingleHop(
  sourceCandidates: CandidatePath[],
  hop: Hop,
  services: Services,
  limit: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Single hop = depth 1 triad
  const hopWithDepth = { ...hop, depth_range: { min: 1, max: 1 } };

  // Get path results
  let results = await executeTriadVariableDepth(
    sourceCandidates,
    hopWithDepth,
    services,
    limit * 2, // Get more to allow for filtering
    allowedPis
  );

  // If fuzzy relation match, score relations post-hoc
  if (hop.relation.type === 'fuzzy' && results.length > 0) {
    results = await scoreRelationsPostHoc(results, hop.relation.terms, services);
  }

  return results.slice(0, limit);
}

/**
 * Execute triad with semantic target constraint
 */
async function executeWithSemanticTarget(
  sourceCandidates: CandidatePath[],
  sourceIds: string[],
  semanticText: string,
  typeFilter: string[] | null,
  maxDepth: number,
  direction: 'outgoing' | 'incoming' | 'both',
  services: Services,
  limit: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Step 1: Find target candidates via Pinecone
  const embedding = await services.embedding.embedOne(semanticText);

  const pineconeFilter: Record<string, unknown> = {};
  if (typeFilter && typeFilter.length > 0) {
    pineconeFilter.type =
      typeFilter.length === 1 ? { $eq: typeFilter[0] } : { $in: typeFilter };
  }
  if (allowedPis) {
    pineconeFilter.source_pi = { $in: allowedPis };
  }

  const targetMatches = await services.pinecone.query(embedding, {
    top_k: limit * 3, // Get more to account for unreachable ones
    filter: Object.keys(pineconeFilter).length > 0 ? pineconeFilter : undefined,
  });

  if (targetMatches.length === 0) {
    return [];
  }

  const targetIds = targetMatches.map((m) => m.id);
  const targetScores = new Map(targetMatches.map((m) => [m.id, m.score]));

  // Step 2: Find paths between sources and targets
  const pathResults = await services.graphdb.findPathsBetween({
    source_ids: sourceIds,
    target_ids: targetIds,
    max_depth: maxDepth,
    direction,
    limit: limit * 2,
  });

  if (pathResults.paths.length === 0) {
    // No paths found - return targets as fallback (penalized)
    return buildFallbackResults(
      targetMatches.slice(0, limit),
      services,
      limit
    );
  }

  // Step 3: Build and score results
  return buildPathResults(sourceCandidates, pathResults.paths, targetScores, services, limit);
}

/**
 * Execute triad with type-only target constraint
 */
async function executeWithTypeTarget(
  sourceCandidates: CandidatePath[],
  sourceIds: string[],
  typeValues: string[],
  maxDepth: number,
  direction: 'outgoing' | 'incoming' | 'both',
  services: Services,
  limit: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Use reachable endpoint - GraphDB finds entities of type within N hops
  // For multiple types, call for first type (most common case)
  // TODO: Support multiple types by calling multiple times or enhancing endpoint
  const targetType = typeValues[0];

  const reachableResults = await services.graphdb.findReachable({
    source_ids: sourceIds,
    target_type: targetType,
    max_depth: maxDepth,
    direction,
    limit: limit * 2,
  });

  if (reachableResults.results.length === 0) {
    return [];
  }

  return buildReachableResults(sourceCandidates, reachableResults.results, services, limit);
}

/**
 * Execute triad with exact ID target
 */
async function executeWithExactTarget(
  sourceCandidates: CandidatePath[],
  sourceIds: string[],
  targetId: string,
  maxDepth: number,
  direction: 'outgoing' | 'incoming' | 'both',
  services: Services,
  limit: number
): Promise<CandidatePath[]> {
  const pathResults = await services.graphdb.findPathsBetween({
    source_ids: sourceIds,
    target_ids: [targetId],
    max_depth: maxDepth,
    direction,
    limit,
  });

  if (pathResults.paths.length === 0) {
    return [];
  }

  // Target score is 1.0 for exact match
  const targetScores = new Map([[targetId, 1.0]]);
  return buildPathResults(sourceCandidates, pathResults.paths, targetScores, services, limit);
}

/**
 * Build candidate results from path-finding results
 *
 * Scoring:
 * - source_score: From entry resolution (Pinecone match)
 * - target_score: From target semantic search (or 1.0 if type-only)
 * - depth_decay: 0.9^(path_length - 1)
 * - final: ((source + target) / 2) * depth_decay
 */
async function buildPathResults(
  sourceCandidates: CandidatePath[],
  paths: PathResult[],
  targetScores: Map<string, number>,
  services: Services,
  limit: number
): Promise<CandidatePath[]> {
  const sourceMap = new Map(
    sourceCandidates.map((c) => [c.current_entity.canonical_id, c])
  );

  // Collect unique target IDs to fetch entities
  const targetIds = [...new Set(paths.map((p) => p.target_id))];
  const targetEntities = await services.graphdb.getEntities(targetIds);

  const results: CandidatePath[] = [];

  for (const path of paths) {
    const sourceCandidate = sourceMap.get(path.source_id);
    if (!sourceCandidate) continue;

    const targetEntity = targetEntities.get(path.target_id);
    if (!targetEntity) continue;

    const sourceScore = sourceCandidate.score;
    const targetScore = targetScores.get(path.target_id) ?? 1.0;
    const depthDecay = Math.pow(DEPTH_DECAY_FACTOR, path.length - 1);

    const finalScore = ((sourceScore + targetScore) / 2) * depthDecay;

    // Build path steps from source path + edges + target
    const pathSteps = buildPathStepsFromEdges(
      sourceCandidate.path,
      path.edges,
      targetEntity
    );

    const newVisited = new Set(sourceCandidate.visited);
    // Add all entities in path to visited
    for (const edge of path.edges) {
      newVisited.add(edge.subject_id);
      newVisited.add(edge.object_id);
    }

    results.push({
      current_entity: targetEntity,
      path: pathSteps,
      score: finalScore,
      visited: newVisited,
    });
  }

  // Deduplicate by target entity (keep highest score)
  const deduped = deduplicateByEntity(results);

  // Sort and limit
  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, limit);
}

/**
 * Build results from reachable endpoint (type-only target)
 */
async function buildReachableResults(
  sourceCandidates: CandidatePath[],
  results: ReachableResult[],
  services: Services,
  limit: number
): Promise<CandidatePath[]> {
  const sourceMap = new Map(
    sourceCandidates.map((c) => [c.current_entity.canonical_id, c])
  );

  // Collect unique target IDs
  const targetIds = [...new Set(results.map((r) => r.target_id))];
  const targetEntities = await services.graphdb.getEntities(targetIds);

  const candidates: CandidatePath[] = [];

  for (const result of results) {
    const sourceCandidate = sourceMap.get(result.source_id);
    if (!sourceCandidate) continue;

    const targetEntity = targetEntities.get(result.target_id);
    if (!targetEntity) continue;

    const sourceScore = sourceCandidate.score;
    const targetScore = 1.0; // Type-only = uniform score
    const depthDecay = Math.pow(DEPTH_DECAY_FACTOR, result.length - 1);

    const finalScore = ((sourceScore + targetScore) / 2) * depthDecay;

    const pathSteps = buildPathStepsFromEdges(
      sourceCandidate.path,
      result.edges,
      targetEntity
    );

    const newVisited = new Set(sourceCandidate.visited);
    for (const edge of result.edges) {
      newVisited.add(edge.subject_id);
      newVisited.add(edge.object_id);
    }

    candidates.push({
      current_entity: targetEntity,
      path: pathSteps,
      score: finalScore,
      visited: newVisited,
    });
  }

  const deduped = deduplicateByEntity(candidates);
  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, limit);
}

/**
 * Build fallback results when no paths found
 * Returns target entities ranked by semantic score, penalized
 */
async function buildFallbackResults(
  targetMatches: Array<{ id: string; score: number }>,
  services: Services,
  limit: number
): Promise<CandidatePath[]> {
  const targetIds = targetMatches.map((m) => m.id);
  const entities = await services.graphdb.getEntities(targetIds);

  const results: CandidatePath[] = [];

  for (const match of targetMatches) {
    const entity = entities.get(match.id);
    if (!entity) continue;

    results.push({
      current_entity: entity,
      path: [
        {
          entity: entity.canonical_id,
          label: entity.label,
          type: entity.type,
          score: match.score,
        },
        {
          edge: '(no path found from source)',
          direction: 'outgoing',
        },
      ],
      score: match.score * 0.5, // Penalty for no connection
      visited: new Set([entity.canonical_id]),
    });
  }

  return results.slice(0, limit);
}

/**
 * Score relations post-hoc for single-hop fuzzy matching
 */
async function scoreRelationsPostHoc(
  results: CandidatePath[],
  terms: string[],
  services: Services
): Promise<CandidatePath[]> {
  // Get unique predicates from all result paths
  const predicates = new Set<string>();
  for (const result of results) {
    for (const step of result.path) {
      if (step.edge && step.edge !== '(no path found from source)') {
        predicates.add(step.edge);
      }
    }
  }

  if (predicates.size === 0) return results;

  // Embed predicates and terms
  const textsToEmbed = [...predicates, ...terms];
  const embeddings = await services.embedding.embed(textsToEmbed);

  const predicateEmbeddings = new Map<string, number[]>();
  let i = 0;
  for (const pred of predicates) {
    predicateEmbeddings.set(pred, embeddings[i++]);
  }
  const termEmbeddings = embeddings.slice(predicates.size);

  // Score each result based on its relation
  for (const result of results) {
    let relationScore = 1.0;

    for (const step of result.path) {
      if (step.edge && predicateEmbeddings.has(step.edge)) {
        const predEmb = predicateEmbeddings.get(step.edge)!;
        let maxSim = 0;
        for (const termEmb of termEmbeddings) {
          maxSim = Math.max(maxSim, cosineSimilarity(predEmb, termEmb));
        }
        relationScore *= maxSim;
        step.score = maxSim; // Update step score
      }
    }

    result.score *= relationScore;
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Build path steps from source path + GraphDB edges + target entity
 */
function buildPathStepsFromEdges(
  sourcePath: PathStep[],
  edges: Array<{
    subject_id: string;
    predicate: string;
    object_id: string;
    source_pi?: string;
  }>,
  targetEntity: Entity
): PathStep[] {
  const steps: PathStep[] = [...sourcePath];

  for (const edge of edges) {
    // Add edge step
    steps.push({
      edge: edge.predicate,
      direction: 'outgoing', // GraphDB returns in traversal order
    });

    // Add entity step (we only have ID, not full entity for intermediates)
    // For the final target, we have the full entity
    if (edge.object_id === targetEntity.canonical_id) {
      steps.push({
        entity: targetEntity.canonical_id,
        label: targetEntity.label,
        type: targetEntity.type,
      });
    } else {
      steps.push({
        entity: edge.object_id,
        // We don't have label/type for intermediate entities
        // Could fetch them if needed for display
      });
    }
  }

  return steps;
}

/**
 * Deduplicate candidates by target entity, keeping highest score
 */
function deduplicateByEntity(candidates: CandidatePath[]): CandidatePath[] {
  const seen = new Map<string, CandidatePath>();

  for (const candidate of candidates) {
    const id = candidate.current_entity.canonical_id;
    const existing = seen.get(id);

    if (!existing || candidate.score > existing.score) {
      seen.set(id, candidate);
    }
  }

  return Array.from(seen.values());
}
```

### 4. Updated Main Executor (`src/executor/index.ts`)

```typescript
/**
 * Executor - Execute parsed path queries
 */

import type { Services } from '../services';
import type {
  QueryParams,
  QueryResult,
  PathResult,
  CandidatePath,
  LineageMetadata,
} from '../types';
import type { PathAST } from '../parser/types';
import { resolveEntry, applyEntryFilter } from './entry';
import { executeTriadVariableDepth, executeTriadSingleHop } from './triad';

const DEFAULT_K = 5;
const DEFAULT_K_EXPLORE_MULTIPLIER = 3;

/**
 * Execute a parsed path query
 */
export async function execute(
  ast: PathAST,
  services: Services,
  params: Partial<QueryParams>,
  allowedPis?: string[],
  lineageMetadata?: LineageMetadata
): Promise<QueryResult> {
  const startTime = Date.now();

  const k = params.k ?? DEFAULT_K;
  const k_explore = params.k_explore ?? k * DEFAULT_K_EXPLORE_MULTIPLIER;

  let candidatesExplored = 0;

  // Validate entry point for queries with hops
  if (ast.hops.length > 0 && ast.entry.type === 'type_filter') {
    return buildErrorResult(
      params.path || '',
      ast.hops.length,
      k,
      k_explore,
      startTime,
      0,
      'invalid_entry_point',
      'Queries with hops require a semantic search or exact ID entry point. Type-only entry points (type:X) are only valid for zero-hop queries.',
      lineageMetadata
    );
  }

  // Resolve entry point
  let candidates = await resolveEntry(ast.entry, services, k_explore, allowedPis);
  candidatesExplored += candidates.length;

  if (candidates.length === 0) {
    return buildErrorResult(
      params.path || '',
      ast.hops.length,
      k,
      k_explore,
      startTime,
      candidatesExplored,
      'no_entry_point',
      `No matching entities found for entry point`,
      lineageMetadata
    );
  }

  // Apply entry filter if present (zero-hop query support)
  if (ast.entry_filter) {
    candidates = await applyEntryFilter(
      candidates,
      ast.entry_filter,
      services,
      allowedPis
    );
    candidatesExplored += candidates.length;

    // If this is a zero-hop query (no hops), return results now
    if (ast.hops.length === 0) {
      const results = buildResults(candidates, k);
      return {
        results,
        metadata: {
          query: params.path || '',
          hops: 0,
          k,
          k_explore,
          total_candidates_explored: candidatesExplored,
          execution_time_ms: Date.now() - startTime,
          lineage: lineageMetadata,
        },
      };
    }
  }

  // Execute each hop using triad model
  for (let i = 0; i < ast.hops.length; i++) {
    const hop = ast.hops[i];
    const previousCandidates = candidates;
    const isLastHop = i === ast.hops.length - 1;
    const hopLimit = isLastHop ? k : k_explore;

    try {
      if (hop.depth_range) {
        // Variable-depth hop
        candidates = await executeTriadVariableDepth(
          candidates,
          hop,
          services,
          hopLimit,
          allowedPis
        );
      } else {
        // Single-hop
        candidates = await executeTriadSingleHop(
          candidates,
          hop,
          services,
          hopLimit,
          allowedPis
        );
      }
    } catch (error) {
      // Handle unsupported query patterns
      if (error instanceof Error && error.message.includes('requires')) {
        return buildErrorResult(
          params.path || '',
          ast.hops.length,
          k,
          k_explore,
          startTime,
          candidatesExplored,
          'unsupported_query',
          error.message,
          lineageMetadata
        );
      }
      throw error;
    }

    candidatesExplored += candidates.length;

    if (candidates.length === 0) {
      return buildPartialResult(
        params.path || '',
        ast.hops.length,
        k,
        k_explore,
        startTime,
        candidatesExplored,
        previousCandidates,
        i + 1,
        lineageMetadata
      );
    }
  }

  // Build final results
  const results = buildResults(candidates, k);

  return {
    results,
    metadata: {
      query: params.path || '',
      hops: ast.hops.length,
      k,
      k_explore,
      total_candidates_explored: candidatesExplored,
      execution_time_ms: Date.now() - startTime,
      lineage: lineageMetadata,
    },
  };
}

/**
 * Build result objects from candidate paths
 */
function buildResults(
  candidates: CandidatePath[],
  max_results: number
): PathResult[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, max_results);

  return top.map((candidate) => ({
    entity: candidate.current_entity,
    path: candidate.path,
    score: candidate.score,
  }));
}

/**
 * Build error result when entry point fails
 */
function buildErrorResult(
  query: string,
  hops: number,
  k: number,
  k_explore: number,
  startTime: number,
  candidatesExplored: number,
  error: string,
  message: string,
  lineageMetadata?: LineageMetadata
): QueryResult {
  return {
    results: [],
    metadata: {
      query,
      hops,
      k,
      k_explore,
      total_candidates_explored: candidatesExplored,
      execution_time_ms: Date.now() - startTime,
      error,
      reason: message,
      lineage: lineageMetadata,
    },
  };
}

/**
 * Build result when traversal stops early
 */
function buildPartialResult(
  query: string,
  totalHops: number,
  k: number,
  k_explore: number,
  startTime: number,
  candidatesExplored: number,
  lastCandidates: CandidatePath[],
  stoppedAt: number,
  lineageMetadata?: LineageMetadata
): QueryResult {
  const bestCandidate = lastCandidates.sort((a, b) => b.score - a.score)[0];

  return {
    results: [],
    metadata: {
      query,
      hops: totalHops,
      k,
      k_explore,
      total_candidates_explored: candidatesExplored,
      execution_time_ms: Date.now() - startTime,
      error: 'no_path_found',
      reason: `Traversal stopped at hop ${stoppedAt} - no matching paths found`,
      stopped_at_hop: stoppedAt,
      partial_path: bestCandidate?.path,
      lineage: lineageMetadata,
    },
  };
}

export { resolveEntry, applyEntryFilter } from './entry';
```

### 5. Delete Old Files

Delete these files:
- `src/executor/variable-depth.ts`
- `src/executor/traverse.ts` (if completely replaced, or gut it)

---

## Scoring System

### Formula

```
final_score = ((source_score + target_score) / 2) * depth_decay * relation_score

where:
- source_score: From Pinecone semantic match at entry (0.0-1.0)
- target_score: From Pinecone semantic match at target, or 1.0 if type-only
- depth_decay: 0.9^(path_length - 1)
  - 1 hop: 1.0
  - 2 hops: 0.9
  - 3 hops: 0.81
  - 4 hops: 0.729
- relation_score: From post-hoc relation scoring (single-hop fuzzy only), or 1.0
```

### Examples

| Query | Source | Target | Depth | Relation | Final |
|-------|--------|--------|-------|----------|-------|
| `"george" -[*]{,4}-> type:date ~ "birth"` | 0.90 | 0.85 | 2 | 1.0 | 0.79 |
| `"medical college" -[*]{,4}-> type:file` | 0.95 | 1.0 | 3 | 1.0 | 0.79 |
| `"alice" -[photographed]-> type:person` | 0.88 | 1.0 | 1 | 0.75 | 0.71 |

---

## Migration Checklist

### Before Starting
- [ ] Ensure GraphDB gateway has `/paths/between` and `/paths/reachable` endpoints deployed
- [ ] Test endpoints with hardcoded IDs to verify they work

### Implementation Steps
1. [ ] Add new types to `src/types.ts`
2. [ ] Add `findPathsBetween` and `findReachable` to `src/services/graphdb.ts`
3. [ ] Create `src/executor/triad.ts` with all triad execution logic
4. [ ] Update `src/executor/index.ts` with new execution flow
5. [ ] Delete `src/executor/variable-depth.ts`
6. [ ] Delete or gut `src/executor/traverse.ts`
7. [ ] Update exports in `src/executor/index.ts`

### Testing
- [ ] Test: `"female medical college" -[*]{,4}-> type:file` (the problem case)
- [ ] Test: `"alice austen" type:person -[*]{,4}-> type:person`
- [ ] Test: `"query" -[authored]-> type:document` (single-hop fuzzy)
- [ ] Test: `"query" type:person` (zero-hop, unchanged)
- [ ] Test: Chained triads `"query" -[*]{,2}-> type:file -[*]{,2}-> type:person`
- [ ] Test: Error case `type:person -[*]{,4}-> type:file` (should fail)
- [ ] Test: No paths found returns fallback results

### Deployment
- [ ] Deploy to staging
- [ ] Run test suite
- [ ] Monitor for errors
- [ ] Deploy to production

---

## Error Messages

### Invalid Entry Point
```json
{
  "results": [],
  "metadata": {
    "error": "invalid_entry_point",
    "reason": "Queries with hops require a semantic search or exact ID entry point. Type-only entry points (type:X) are only valid for zero-hop queries."
  }
}
```

### Unsupported Query Pattern
```json
{
  "results": [],
  "metadata": {
    "error": "unsupported_query",
    "reason": "Variable-depth hop requires a target filter (type, semantic, or exact_id)"
  }
}
```

### No Paths Found
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

## Performance Expectations

| Scenario | Before (BFS) | After (Triad) |
|----------|--------------|---------------|
| Female Medical College → type:file (4 hops) | 500+ subrequests, timeout | 2 requests, ~2-3s |
| Alice Austen → type:person (4 hops) | 100+ subrequests, ~20s | 2 requests, ~1-2s |
| Simple single-hop | 15 subrequests | 2 requests |
| Zero-hop query | 1 request | 1 request (unchanged) |

---

## Future Enhancements

1. **Multiple target types**: Support `type:person,organization` by calling reachable multiple times or enhancing GraphDB endpoint
2. **Intermediate entity details**: Fetch full entity details for intermediate nodes in paths
3. **Relation filtering in GraphDB**: Add predicate filtering to path endpoints for specific relation types
4. **Caching**: Cache common path queries (e.g., "files near this org")
5. **Path explanations**: Add human-readable explanations of why paths were found
