/**
 * Variable-Depth Traversal - Execute BFS traversal up to max depth
 */

import type { Services } from '../services';
import type { Entity, CandidatePath, PathStep, Relationship } from '../types';
import type { Hop, RelationMatch, Filter } from '../parser/types';
import { cosineSimilarity } from '../utils/similarity';

const MAX_TOTAL_CANDIDATES = 1000;
const DEFAULT_MAX_DEPTH = 4;

interface ScoredRelation {
  relation: Relationship;
  target_id: string;
  score: number;
  actual_direction: 'outgoing' | 'incoming';
}

/**
 * Execute a variable-depth hop using BFS
 *
 * For type-only filters: stops early once k results are found
 * For semantic filters: continues to max depth (deeper match might beat closer)
 */
export async function executeVariableDepthHop(
  startCandidates: CandidatePath[],
  hop: Hop,
  services: Services,
  k: number,
  k_explore: number
): Promise<CandidatePath[]> {
  const { min, max } = hop.depth_range!;
  const maxDepth = max === -1 ? DEFAULT_MAX_DEPTH : max;

  // Determine if we can terminate early (type-only = closer always wins)
  const isTypeOnly = hop.filter?.type === 'type_filter';

  // Running top-k results (bounded memory)
  const topK: CandidatePath[] = [];

  let currentLevel = startCandidates;
  let totalCandidates = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    // Expand to next level (no filter applied yet)
    const nextLevel = await expandOneLevel(
      currentLevel,
      hop.direction,
      hop.relation,
      services,
      k_explore
    );

    totalCandidates += nextLevel.length;

    if (nextLevel.length === 0) {
      break; // No more to explore
    }

    // If we've reached minimum depth, check for matches
    if (depth >= min) {
      const matches = await applyFilterAndCollect(
        nextLevel,
        hop.filter,
        services,
        k_explore
      );

      // Add matches to running top-k
      for (const match of matches) {
        addToTopK(topK, match, k);
      }

      // Early termination for type-only filters
      if (isTypeOnly && topK.length >= k) {
        break; // Closer is always better, we have enough
      }
    }

    // Safety limit check
    if (totalCandidates > MAX_TOTAL_CANDIDATES) {
      break;
    }

    // Continue exploring from this level
    currentLevel = nextLevel;
  }

  return topK;
}

/**
 * Expand candidates by one hop (no filter applied)
 */
async function expandOneLevel(
  candidates: CandidatePath[],
  direction: 'outgoing' | 'incoming' | 'bidirectional',
  relation: RelationMatch,
  services: Services,
  k_explore: number
): Promise<CandidatePath[]> {
  const expanded: CandidatePath[] = [];

  for (const candidate of candidates) {
    // Get relationships for current entity
    const relationships = await services.graphdb.getRelationships(
      candidate.current_entity.canonical_id
    );

    // Collect scored relations from relevant direction(s)
    let scoredRels: ScoredRelation[] = [];

    if (direction === 'outgoing' || direction === 'bidirectional') {
      if (relationships.outgoing.length > 0) {
        const outScored = await scoreRelationsForExpansion(
          relationships.outgoing,
          relation,
          'outgoing',
          services,
          k_explore
        );
        scoredRels.push(...outScored);
      }
    }

    if (direction === 'incoming' || direction === 'bidirectional') {
      if (relationships.incoming.length > 0) {
        const inScored = await scoreRelationsForExpansion(
          relationships.incoming,
          relation,
          'incoming',
          services,
          k_explore
        );
        scoredRels.push(...inScored);
      }
    }

    // For bidirectional, re-sort merged results and limit to k_explore
    if (direction === 'bidirectional' && scoredRels.length > k_explore) {
      scoredRels.sort((a, b) => b.score - a.score);
      scoredRels = scoredRels.slice(0, k_explore);
    }

    if (scoredRels.length === 0) {
      continue;
    }

    // Get target entities
    const targetIds = scoredRels.map((r) => r.target_id);
    const uniqueTargetIds = [...new Set(targetIds)].filter(
      (id) => !candidate.visited.has(id)
    );

    if (uniqueTargetIds.length === 0) {
      continue;
    }

    const targetEntities = await services.graphdb.getEntities(uniqueTargetIds);

    // Build expanded candidates (no filter at this stage)
    for (const scored of scoredRels) {
      const entity = targetEntities.get(scored.target_id);
      if (!entity) continue;
      if (candidate.visited.has(entity.canonical_id)) continue;

      const newVisited = new Set(candidate.visited);
      newVisited.add(entity.canonical_id);

      const edgeStep: PathStep = {
        edge: scored.relation.predicate,
        direction: scored.actual_direction,
        score: scored.score,
      };

      const entityStep: PathStep = {
        entity: entity.canonical_id,
        label: entity.label,
        type: entity.type,
      };

      expanded.push({
        current_entity: entity,
        path: [...candidate.path, edgeStep, entityStep],
        score: candidate.score * scored.score,
        visited: newVisited,
      });
    }
  }

  return expanded;
}

/**
 * Score relations against fuzzy terms (for expansion)
 */
async function scoreRelationsForExpansion(
  relations: Relationship[],
  relationMatch: RelationMatch,
  direction: 'outgoing' | 'incoming',
  services: Services,
  k_explore: number
): Promise<ScoredRelation[]> {
  // Determine target IDs based on direction
  const withTargets = relations.map((rel) => ({
    relation: rel,
    target_id: direction === 'outgoing' ? rel.object_id : rel.subject_id,
    actual_direction: direction,
  }));

  // If wildcard, return ALL with score 1.0 (no k_explore limit for wildcards)
  if (relationMatch.type === 'wildcard') {
    return withTargets.map((r) => ({ ...r, score: 1.0 }));
  }

  // Get unique predicates
  const predicates = [...new Set(relations.map((r) => r.predicate))];

  if (predicates.length === 0) {
    return [];
  }

  // Embed predicates and terms
  const textsToEmbed = [...predicates, ...relationMatch.terms];
  const embeddings = await services.embedding.embed(textsToEmbed);

  const predicateEmbeddings = new Map<string, number[]>();
  for (let i = 0; i < predicates.length; i++) {
    predicateEmbeddings.set(predicates[i], embeddings[i]);
  }

  const termEmbeddings = embeddings.slice(predicates.length);

  // Score each relation
  const scored: ScoredRelation[] = [];

  for (const { relation, target_id, actual_direction } of withTargets) {
    const predEmb = predicateEmbeddings.get(relation.predicate);
    if (!predEmb) continue;

    // Max similarity across all terms
    let maxScore = 0;
    for (const termEmb of termEmbeddings) {
      const sim = cosineSimilarity(predEmb, termEmb);
      maxScore = Math.max(maxScore, sim);
    }

    scored.push({ relation, target_id, score: maxScore, actual_direction });
  }

  // Sort by score descending and take top k_explore (for fuzzy relations)
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k_explore);
}

/**
 * Apply filter to candidates and collect as results
 */
async function applyFilterAndCollect(
  candidates: CandidatePath[],
  filter: Filter | null,
  services: Services,
  k_explore: number
): Promise<CandidatePath[]> {
  const entities = candidates.map((c) => c.current_entity);

  // No filter - all candidates pass
  if (!filter) {
    return candidates;
  }

  // Type filter
  if (filter.type === 'type_filter') {
    return candidates.filter((c) => c.current_entity.type === filter.value);
  }

  // Exact ID filter
  if (filter.type === 'exact_id') {
    return candidates.filter(
      (c) => c.current_entity.canonical_id === filter.id
    );
  }

  // Semantic filter - query Pinecone for similarity scores
  if (filter.type === 'semantic_search') {
    const ids = entities.map((e) => e.canonical_id);
    const matches = await services.pinecone.queryByIdsWithText(
      filter.text,
      ids,
      k_explore
    );

    // Build results with semantic scores
    const results: CandidatePath[] = [];
    for (const match of matches) {
      const candidate = candidates.find(
        (c) => c.current_entity.canonical_id === match.id
      );
      if (candidate) {
        results.push({
          ...candidate,
          score: candidate.score * match.score,
        });
      }
    }
    return results;
  }

  // Combined filter - type first, then semantic
  if (filter.type === 'combined_filter') {
    const typeFiltered = candidates.filter(
      (c) => c.current_entity.type === filter.type_value
    );

    if (typeFiltered.length === 0) {
      return [];
    }

    const ids = typeFiltered.map((c) => c.current_entity.canonical_id);
    const matches = await services.pinecone.queryByIdsWithText(
      filter.semantic_text,
      ids,
      k_explore
    );

    const results: CandidatePath[] = [];
    for (const match of matches) {
      const candidate = typeFiltered.find(
        (c) => c.current_entity.canonical_id === match.id
      );
      if (candidate) {
        results.push({
          ...candidate,
          score: candidate.score * match.score,
        });
      }
    }
    return results;
  }

  return candidates;
}

/**
 * Add a candidate to the top-k set, maintaining bounded size
 */
function addToTopK(
  topK: CandidatePath[],
  candidate: CandidatePath,
  k: number
): void {
  // Check if this entity is already in topK (from a shorter path)
  const existingIndex = topK.findIndex(
    (c) => c.current_entity.canonical_id === candidate.current_entity.canonical_id
  );

  if (existingIndex >= 0) {
    // Keep the higher-scoring one
    if (candidate.score > topK[existingIndex].score) {
      topK[existingIndex] = candidate;
    }
    return;
  }

  // Add new candidate
  topK.push(candidate);
  topK.sort((a, b) => b.score - a.score);

  // Trim to k
  if (topK.length > k) {
    topK.pop();
  }
}
