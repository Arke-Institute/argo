/**
 * Triad-Based Path Execution
 *
 * A triad is: [source candidates] -[relation, depth]-> [target constraint]
 *
 * We resolve both endpoints first, then ask GraphDB to find paths between them.
 * This replaces the BFS approach which caused exponential subrequests.
 */

import type { Services } from '../services';
import type {
  Entity,
  CandidatePath,
  PathStep,
  GraphPathResult,
  ReachableResult,
  PathEdge,
} from '../types';
import type { Hop, Filter } from '../parser/types';
import { cosineSimilarity } from '../utils/similarity';

const DEFAULT_MAX_DEPTH = 4;
const DEPTH_DECAY_FACTOR = 0.9;

/**
 * Execute a hop as a triad
 * Works for both single-hop (depth=1) and variable-depth queries
 */
export async function executeTriad(
  sourceCandidates: CandidatePath[],
  hop: Hop,
  services: Services,
  limit: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Determine depth - single hop (no depth_range) defaults to 1
  const maxDepth = hop.depth_range
    ? hop.depth_range.max === -1
      ? DEFAULT_MAX_DEPTH
      : hop.depth_range.max
    : 1;

  const sourceIds = sourceCandidates.map((c) => c.current_entity.canonical_id);
  const direction = hop.direction === 'bidirectional' ? 'both' : hop.direction;

  // Route based on filter type
  let results: CandidatePath[];

  if (hop.filter?.type === 'semantic_search') {
    results = await executeWithSemanticTarget(
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
  } else if (hop.filter?.type === 'combined_filter') {
    results = await executeWithSemanticTarget(
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
  } else if (hop.filter?.type === 'type_filter') {
    results = await executeWithTypeTarget(
      sourceCandidates,
      sourceIds,
      hop.filter.values,
      maxDepth,
      direction,
      services,
      limit
    );
  } else if (hop.filter?.type === 'exact_id') {
    results = await executeWithExactTarget(
      sourceCandidates,
      sourceIds,
      hop.filter.id,
      maxDepth,
      direction,
      services,
      limit
    );
  } else {
    // No filter - error for variable depth, allow for single hop
    if (hop.depth_range) {
      throw new Error(
        'Variable-depth hop requires a target filter (type, semantic, or exact_id)'
      );
    }
    // Single hop with no target filter - use reachable with no type constraint
    // This is unusual but we handle it by returning empty (no meaningful target)
    return [];
  }

  // If fuzzy relation match, score relations post-hoc
  if (hop.relation.type === 'fuzzy' && results.length > 0) {
    results = await scoreRelationsPostHoc(results, hop.relation.terms, services);
  }

  return results.slice(0, limit);
}

/**
 * Execute triad with semantic target constraint
 * Uses Pinecone to find target candidates, then GraphDB to find paths
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
  return buildPathResults(
    sourceCandidates,
    pathResults.paths,
    targetScores,
    services,
    limit
  );
}

/**
 * Execute triad with type-only target constraint
 * Uses GraphDB's reachable endpoint directly
 */
async function executeWithTypeTarget(
  sourceCandidates: CandidatePath[],
  sourceIds: string[],
  typeValues: string[],
  maxDepth: number,
  direction: 'outgoing' | 'incoming' | 'both',
  services: Services,
  limit: number
): Promise<CandidatePath[]> {
  // For multiple types, we need to call reachable multiple times
  // TODO: Enhance GraphDB endpoint to support multiple types
  const allResults: ReachableResult[] = [];

  for (const targetType of typeValues) {
    const reachableResults = await services.graphdb.findReachable({
      source_ids: sourceIds,
      target_type: targetType,
      max_depth: maxDepth,
      direction,
      limit: Math.ceil((limit * 2) / typeValues.length),
    });
    allResults.push(...reachableResults.results);
  }

  if (allResults.length === 0) {
    return [];
  }

  return buildReachableResults(sourceCandidates, allResults, services, limit);
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
  return buildPathResults(
    sourceCandidates,
    pathResults.paths,
    targetScores,
    services,
    limit
  );
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
  paths: GraphPathResult[],
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
          edge: '(no path found)',
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
 * Score relations post-hoc for fuzzy matching
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
      if (step.edge && step.edge !== '(no path found)') {
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

  // Score each result based on its relations
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
  edges: PathEdge[],
  targetEntity: Entity
): PathStep[] {
  const steps: PathStep[] = [...sourcePath];

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const isLast = i === edges.length - 1;

    // Add edge step
    steps.push({
      edge: edge.predicate,
      direction: 'outgoing', // GraphDB returns in traversal order
    });

    // Add entity step - use object_label/object_type from edge
    if (isLast) {
      // For the final target, we have the full entity
      steps.push({
        entity: targetEntity.canonical_id,
        label: targetEntity.label,
        type: targetEntity.type,
      });
    } else {
      // For intermediate entities, use edge metadata
      steps.push({
        entity: edge.object_id,
        label: edge.object_label,
        type: edge.object_type,
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
