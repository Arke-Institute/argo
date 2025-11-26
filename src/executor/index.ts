/**
 * Executor - Execute parsed path queries
 */

import type { Services } from '../services';
import type {
  QueryParams,
  QueryResult,
  PathResult,
  QueryMetadata,
  CandidatePath,
} from '../types';
import type { PathAST } from '../parser/types';
import { resolveEntry } from './entry';
import { executeHop } from './traverse';

const DEFAULT_K = 3;
const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_MAX_RESULTS = 20;

/**
 * Execute a parsed path query
 */
export async function execute(
  ast: PathAST,
  services: Services,
  params: Partial<QueryParams>
): Promise<QueryResult> {
  const startTime = Date.now();

  const k = params.k ?? DEFAULT_K;
  const threshold = params.threshold ?? DEFAULT_THRESHOLD;
  const max_results = params.max_results ?? DEFAULT_MAX_RESULTS;

  let candidatesExplored = 0;

  // Resolve entry point
  let candidates = await resolveEntry(ast.entry, services, k, threshold);
  candidatesExplored += candidates.length;

  if (candidates.length === 0) {
    return buildErrorResult(
      params.path || '',
      ast.hops.length,
      k,
      threshold,
      startTime,
      candidatesExplored,
      'no_entry_point',
      `No matching entities found for entry point`
    );
  }

  // Execute each hop
  for (let i = 0; i < ast.hops.length; i++) {
    const hop = ast.hops[i];
    const previousCandidates = candidates;

    candidates = await executeHop(candidates, hop, services, k, threshold);
    candidatesExplored += candidates.length;

    if (candidates.length === 0) {
      // Return partial path info
      return buildPartialResult(
        params.path || '',
        ast.hops.length,
        k,
        threshold,
        startTime,
        candidatesExplored,
        previousCandidates,
        i + 1
      );
    }
  }

  // Build final results
  const results = buildResults(candidates, max_results);

  return {
    results,
    metadata: {
      query: params.path || '',
      hops: ast.hops.length,
      k,
      threshold,
      total_candidates_explored: candidatesExplored,
      execution_time_ms: Date.now() - startTime,
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
  // Sort by score and take top results
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
  threshold: number,
  startTime: number,
  candidatesExplored: number,
  error: string,
  message: string
): QueryResult {
  return {
    results: [],
    metadata: {
      query,
      hops,
      k,
      threshold,
      total_candidates_explored: candidatesExplored,
      execution_time_ms: Date.now() - startTime,
      error,
      reason: message,
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
  threshold: number,
  startTime: number,
  candidatesExplored: number,
  lastCandidates: CandidatePath[],
  stoppedAt: number
): QueryResult {
  // Include the partial path from the best candidate
  const bestCandidate = lastCandidates.sort((a, b) => b.score - a.score)[0];

  return {
    results: [],
    metadata: {
      query,
      hops: totalHops,
      k,
      threshold,
      total_candidates_explored: candidatesExplored,
      execution_time_ms: Date.now() - startTime,
      error: 'no_path_found',
      reason: `Traversal stopped at hop ${stoppedAt} - no matching relations or entities`,
      stopped_at_hop: stoppedAt,
      partial_path: bestCandidate?.path,
    },
  };
}

export { resolveEntry } from './entry';
export { executeHop } from './traverse';
