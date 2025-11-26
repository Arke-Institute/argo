/**
 * Graph Traversal - Execute a single hop
 */

import type { Services } from '../services';
import type {
  Entity,
  CandidatePath,
  PathStep,
  Relationship,
} from '../types';
import type { Hop, RelationMatch, Filter } from '../parser/types';
import { cosineSimilarity } from '../utils/similarity';

interface ScoredRelation {
  relation: Relationship;
  target_id: string;
  score: number;
}

/**
 * Execute a single hop for all candidate paths
 */
export async function executeHop(
  candidates: CandidatePath[],
  hop: Hop,
  services: Services,
  k: number,
  threshold: number
): Promise<CandidatePath[]> {
  const newCandidates: CandidatePath[] = [];

  for (const candidate of candidates) {
    const hopResults = await executeHopForCandidate(
      candidate,
      hop,
      services,
      k,
      threshold
    );
    newCandidates.push(...hopResults);
  }

  // Sort by score and limit to reasonable number
  newCandidates.sort((a, b) => b.score - a.score);
  return newCandidates.slice(0, k * candidates.length);
}

/**
 * Execute a hop for a single candidate path
 */
async function executeHopForCandidate(
  candidate: CandidatePath,
  hop: Hop,
  services: Services,
  k: number,
  threshold: number
): Promise<CandidatePath[]> {
  // Get relationships for current entity
  const relationships = await services.graphdb.getRelationships(
    candidate.current_entity.canonical_id
  );

  // Filter by direction
  const directedRels =
    hop.direction === 'outgoing'
      ? relationships.outgoing
      : relationships.incoming;

  if (directedRels.length === 0) {
    return [];
  }

  // Score relations against fuzzy terms
  const scoredRelations = await scoreRelations(
    directedRels,
    hop.relation,
    hop.direction,
    services,
    threshold
  );

  // Take top k
  const topRelations = scoredRelations.slice(0, k);

  if (topRelations.length === 0) {
    return [];
  }

  // Get target entities
  const targetIds = topRelations.map((r) => r.target_id);
  const uniqueTargetIds = [...new Set(targetIds)].filter(
    (id) => !candidate.visited.has(id)
  );

  if (uniqueTargetIds.length === 0) {
    return [];
  }

  const targetEntities = await services.graphdb.getEntities(uniqueTargetIds);

  // Apply filter
  const filteredEntities = await applyFilter(
    Array.from(targetEntities.values()),
    hop.filter,
    services,
    k,
    threshold
  );

  // Build new candidate paths
  const newCandidates: CandidatePath[] = [];

  for (const scored of topRelations) {
    const entity = filteredEntities.find(
      (e) => e.entity.canonical_id === scored.target_id
    );
    if (!entity) continue;

    const newVisited = new Set(candidate.visited);
    newVisited.add(entity.entity.canonical_id);

    const edgeStep: PathStep = {
      edge: scored.relation.predicate,
      direction: hop.direction,
      score: scored.score,
    };

    const entityStep: PathStep = {
      entity: entity.entity.canonical_id,
      label: entity.entity.label,
      type: entity.entity.type,
      score: entity.filterScore,
    };

    newCandidates.push({
      current_entity: entity.entity,
      path: [...candidate.path, edgeStep, entityStep],
      score: candidate.score * scored.score * (entity.filterScore || 1),
      visited: newVisited,
    });
  }

  return newCandidates;
}

/**
 * Score relations against fuzzy terms
 */
async function scoreRelations(
  relations: Relationship[],
  relationMatch: RelationMatch,
  direction: 'outgoing' | 'incoming',
  services: Services,
  threshold: number
): Promise<ScoredRelation[]> {
  // Determine target IDs based on direction
  const withTargets = relations.map((rel) => ({
    relation: rel,
    target_id: direction === 'outgoing' ? rel.object_id : rel.subject_id,
  }));

  // If wildcard, return all with score 1.0
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

  for (const { relation, target_id } of withTargets) {
    const predEmb = predicateEmbeddings.get(relation.predicate);
    if (!predEmb) continue;

    // Max similarity across all terms
    let maxScore = 0;
    for (const termEmb of termEmbeddings) {
      const sim = cosineSimilarity(predEmb, termEmb);
      maxScore = Math.max(maxScore, sim);
    }

    if (maxScore >= threshold) {
      scored.push({ relation, target_id, score: maxScore });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Apply a filter to entities
 */
async function applyFilter(
  entities: Entity[],
  filter: Filter | null,
  services: Services,
  k: number,
  threshold: number
): Promise<Array<{ entity: Entity; filterScore?: number }>> {
  if (!filter) {
    return entities.map((e) => ({ entity: e }));
  }

  if (filter.type === 'type_filter') {
    return entities
      .filter((e) => e.type === filter.value)
      .map((e) => ({ entity: e }));
  }

  if (filter.type === 'exact_id') {
    const match = entities.find((e) => e.canonical_id === filter.id);
    return match ? [{ entity: match }] : [];
  }

  if (filter.type === 'semantic_search') {
    // Embed the filter text
    const filterEmbedding = await services.embedding.embedOne(filter.text);

    // Query Pinecone filtered to only these entity IDs
    const ids = entities.map((e) => e.canonical_id);
    const matches = await services.pinecone.queryByIds(filterEmbedding, ids, k);

    // Build result with scores
    const result: Array<{ entity: Entity; filterScore: number }> = [];
    for (const match of matches) {
      if (match.score < threshold) continue;
      const entity = entities.find((e) => e.canonical_id === match.id);
      if (entity) {
        result.push({ entity, filterScore: match.score });
      }
    }

    return result;
  }

  return entities.map((e) => ({ entity: e }));
}
