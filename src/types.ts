/**
 * Argo - Path Query Types
 */

// ============================================================================
// Environment
// ============================================================================

export interface Env {
  EMBEDDING_GATEWAY: Fetcher;
  GRAPHDB_GATEWAY: Fetcher;
  PINECONE_GATEWAY: Fetcher;
}

// ============================================================================
// Entity & Relationship Types
// ============================================================================

export interface Entity {
  canonical_id: string;
  code: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
  source_pis: string[];
  content?: EnrichedContent;
}

// ============================================================================
// Enrichment Types
// ============================================================================

export interface EnrichedContent {
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
  format?: 'text' | 'json' | 'raw';
  truncated?: boolean;
  parse_error?: boolean;
  fetch_error?: string;
}

export interface Relationship {
  subject_id: string;
  predicate: string;
  object_id: string;
  properties: Record<string, unknown>;
  source_pi: string;
  // Target entity metadata (for pre-filtering without fetching entity)
  target_type?: string;
  target_label?: string;
}

export interface RelationshipSet {
  outgoing: Relationship[];
  incoming: Relationship[];
}

// ============================================================================
// Lineage Types
// ============================================================================

export interface LineageParams {
  sourcePi: string;
  direction: 'ancestors' | 'descendants' | 'both';
}

export interface LineagePiInfo {
  id: string;
  hops: number;
  created_at: string;
}

export interface LineageDirectionResult {
  pis: LineagePiInfo[];
  count: number;
  truncated: boolean;
}

export interface LineageResponse {
  sourcePi: string;
  ancestors?: LineageDirectionResult;
  descendants?: LineageDirectionResult;
}

export interface LineageMetadata {
  sourcePi: string;
  direction: string;
  piCount: number;
  truncated: boolean;
}

// ============================================================================
// Query Parameters & Results
// ============================================================================

export interface QueryParams {
  path: string;
  k?: number;
  k_explore?: number;
  lineage?: LineageParams;
  enrich?: boolean;
  enrich_limit?: number;
}

export interface QueryResult {
  results: PathResult[];
  metadata: QueryMetadata;
}

export interface PathResult {
  entity: Entity;
  path: PathStep[];
  score: number;
}

export interface PathStep {
  entity?: string;
  label?: string;
  type?: string;
  edge?: string;
  direction?: 'outgoing' | 'incoming';
  score?: number;
}

export interface QueryMetadata {
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
  lineage?: LineageMetadata;
}

// ============================================================================
// Pinecone Types
// ============================================================================

export interface PineconeMatch {
  id: string;
  score: number;
  metadata?: {
    canonical_id: string;
    label: string;
    type: string;
    source_pi: string;
  };
}

export interface PineconeQueryResponse {
  matches: PineconeMatch[];
}

// ============================================================================
// Execution State
// ============================================================================

export interface CandidatePath {
  current_entity: Entity;
  path: PathStep[];
  score: number;
  visited: Set<string>;
}

export interface ExecutionContext {
  k: number;
  k_explore: number;
  candidates_explored: number;
}

// ============================================================================
// Path-Finding Types (GraphDB Triad Endpoints)
// ============================================================================

/**
 * Edge in a path result from GraphDB
 */
export interface PathEdge {
  subject_id: string;
  subject_label: string;
  subject_type: string;
  predicate: string;
  object_id: string;
  object_label: string;
  object_type: string;
  source_pi: string;
}

/**
 * Request to find paths between source and target entity sets
 */
export interface PathsBetweenRequest {
  source_ids: string[];
  target_ids: string[];
  max_depth: number;
  direction: 'outgoing' | 'incoming' | 'both';
  limit?: number;
}

/**
 * Single path result from /paths/between
 */
export interface GraphPathResult {
  source_id: string;
  target_id: string;
  length: number;
  edges: PathEdge[];
}

/**
 * Response from /paths/between endpoint
 */
export interface PathsBetweenResponse {
  paths: GraphPathResult[];
  truncated: boolean;
}

/**
 * Request to find entities of a type reachable from sources
 */
export interface PathsReachableRequest {
  source_ids: string[];
  target_type: string;
  max_depth: number;
  direction: 'outgoing' | 'incoming' | 'both';
  limit: number;
}

/**
 * Single result from /paths/reachable
 */
export interface ReachableResult {
  source_id: string;
  target_id: string;
  target_label: string;
  target_type: string;
  length: number;
  edges: PathEdge[];
}

/**
 * Response from /paths/reachable endpoint
 */
export interface PathsReachableResponse {
  results: ReachableResult[];
  truncated: boolean;
}
