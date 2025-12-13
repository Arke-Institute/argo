/**
 * Argo - Path Query Engine for Thalassa Knowledge Graph
 *
 * link-search worker
 */

import type { Env, QueryParams, QueryResult, LineageMetadata } from './types';
import { createServices, LineageClient } from './services';
import { parse, LexerError, ParseError } from './parser';
import { execute } from './executor';
import { enrichResults } from './executor/enrich';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handling
      if (path === '/health' || path === '/') {
        return json({ status: 'ok', service: 'argo', version: '0.1.0' }, corsHeaders);
      }

      if (path === '/syntax' && request.method === 'GET') {
        return handleSyntax(corsHeaders);
      }

      if (path === '/parse' && request.method === 'GET') {
        return handleParse(url, corsHeaders);
      }

      if (path === '/query' && request.method === 'POST') {
        return handleQuery(request, env, corsHeaders);
      }

      if (path === '/search/collections' && request.method === 'GET') {
        return handleCollectionSearch(request, env, corsHeaders);
      }

      return json({ error: 'Not found' }, corsHeaders, 404);
    } catch (error) {
      console.error('Unhandled error:', error);
      return json(
        { error: 'Internal server error', message: String(error) },
        corsHeaders,
        500
      );
    }
  },
};

/**
 * Handle GET /syntax - Return path query syntax documentation
 */
function handleSyntax(corsHeaders: Record<string, string>): Response {
  const syntax = {
    version: '1.0',
    description: 'Path query language for traversing the Arke knowledge graph with semantic flexibility.',

    entryPoints: {
      description: 'Every query starts with an entry point. For queries with edge traversal, type-only entry points are NOT supported.',
      types: [
        {
          syntax: '"text"',
          name: 'Semantic Search',
          description: 'Finds entities matching the text via vector similarity',
          example: '"alice austen"',
          supportsHops: true,
        },
        {
          syntax: '@canonical_id',
          name: 'Exact Entity',
          description: 'Lookup entity by canonical ID',
          example: '@george_washington',
          supportsHops: true,
        },
        {
          syntax: 'type:X ~ "text"',
          name: 'Type + Semantic',
          description: 'Filter by type with semantic ranking',
          example: 'type:person ~ "photographer"',
          supportsHops: true,
        },
        {
          syntax: 'type:X',
          name: 'Type Filter',
          description: 'Filter by entity type (zero-hop queries only)',
          example: 'type:person',
          supportsHops: false,
        },
      ],
    },

    edgeTraversal: {
      description: 'Edges connect entities and specify direction. Use wildcard [*] for multi-hop queries.',
      types: [
        { syntax: '-[*]->', description: 'Outgoing edge, any relation' },
        { syntax: '<-[*]-', description: 'Incoming edge, any relation' },
        { syntax: '<-[*]->', description: 'Bidirectional edge' },
        { syntax: '-[term]->', description: 'Outgoing with fuzzy relation match (single-hop only)' },
        { syntax: '-[term1, term2]->', description: 'Match ANY of the terms (single-hop only)' },
      ],
      variableDepth: {
        description: 'For multi-hop traversal. Must use wildcard [*]. Maximum depth is 4.',
        syntax: [
          { pattern: '-[*]{1,4}->', description: '1 to 4 hops' },
          { pattern: '-[*]{,4}->', description: 'Up to 4 hops (shorthand)' },
          { pattern: '-[*]{2,}->', description: '2 or more hops (capped at 4)' },
          { pattern: '-[*]{3}->', description: 'Exactly 3 hops' },
        ],
      },
    },

    filters: {
      description: 'Filters specify what entities to find after traversal. Every hop must end with a filter.',
      types: [
        { syntax: 'type:X', description: 'Filter by entity type', example: 'type:person' },
        { syntax: 'type:X,Y,Z', description: 'Filter by multiple types (OR)', example: 'type:file,document' },
        { syntax: 'type:X ~ "text"', description: 'Type + semantic ranking', example: 'type:person ~ "photographer"' },
        { syntax: '@canonical_id', description: 'Exact entity match', example: '@mount_vernon' },
        { syntax: '"text"', description: 'Semantic search on candidates', example: '"historical significance"' },
      ],
    },

    entityTypes: [
      'person', 'place', 'organization', 'date', 'event',
      'concept', 'document', 'publication', 'movement',
      'pi', 'file', 'collection', 'unknown'
    ],

    parameters: {
      description: 'Query execution parameters',
      fields: [
        { name: 'path', type: 'string', required: true, description: 'The path query to execute' },
        { name: 'k', type: 'integer', default: 5, description: 'Number of final results to return' },
        { name: 'k_explore', type: 'integer', default: 'k * 3', description: 'Beam width for exploration' },
        { name: 'lineage', type: 'object', default: null, description: 'Scope query to PI hierarchy' },
        { name: 'enrich', type: 'boolean', default: false, description: 'Fetch content for PI and File entities' },
        { name: 'enrich_limit', type: 'integer', default: 2000, description: 'Max characters per enriched entity' },
      ],
      lineage: {
        description: 'Scope queries to entities within a PI hierarchy',
        fields: [
          { name: 'sourcePi', type: 'string', description: 'The PI to start lineage resolution from' },
          { name: 'direction', type: 'string', enum: ['ancestors', 'descendants', 'both'], description: 'Direction to resolve' },
        ],
      },
    },

    examples: [
      {
        description: 'Find people connected to Alice Austen',
        query: '"alice austen" -[*]{,4}-> type:person',
      },
      {
        description: 'Find photographers connected to Alice Austen',
        query: '"alice austen" -[*]{,4}-> type:person ~ "photographer"',
      },
      {
        description: 'Find files from a known entity',
        query: '@6a9dbb57-9096-4753-a0e6-26299324161f -[*]{,4}-> type:file',
      },
      {
        description: 'Single-hop with relation filtering',
        query: '"alice austen" -[photographed, captured]-> type:person',
      },
      {
        description: 'Zero-hop: find people named Washington',
        query: '"Washington" type:person',
      },
      {
        description: 'Type + semantic entry point',
        query: 'type:person ~ "photographer" -[*]{,3}-> type:collection',
      },
      {
        description: 'Chained hops through intermediate types',
        query: '@collection_id -[*]{,2}-> type:person -[*]{,2}-> type:file',
      },
      {
        description: 'Bidirectional search',
        query: '"george washington" <-[*]-> type:person',
      },
    ],

    constraints: [
      'Entry points with hops must be semantic, exact ID, or type+semantic (not type-only)',
      'Every hop must end with a target filter',
      'Variable-depth queries must use wildcard [*], not fuzzy relations',
      'Maximum depth is 4 hops',
      'Fuzzy relation matching only works on single-hop queries',
    ],

    errors: {
      invalid_entry_point: 'Queries with hops require semantic search or exact ID entry point',
      unsupported_query: 'Variable-depth hop requires a target filter (type, semantic, or exact_id)',
      no_path_found: 'Traversal stopped - no matching paths found',
      parse_error: 'Invalid query syntax',
    },
  };

  return json(syntax, corsHeaders);
}

/**
 * Handle GET /parse - Parse a query and return AST
 */
function handleParse(
  url: URL,
  corsHeaders: Record<string, string>
): Response {
  const pathQuery = url.searchParams.get('path');

  if (!pathQuery) {
    return json(
      { error: 'Missing path parameter' },
      corsHeaders,
      400
    );
  }

  try {
    const ast = parse(pathQuery);
    return json({ ast }, corsHeaders);
  } catch (error) {
    if (error instanceof LexerError || error instanceof ParseError) {
      return json(
        {
          error: 'Parse error',
          message: error.message,
          position: error.position,
        },
        corsHeaders,
        400
      );
    }
    throw error;
  }
}

/**
 * Handle POST /query - Execute a path query
 */
async function handleQuery(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: QueryParams;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, corsHeaders, 400);
  }

  if (!body.path) {
    return json({ error: 'Missing path field' }, corsHeaders, 400);
  }

  // Parse the query
  let ast;
  try {
    ast = parse(body.path);
  } catch (error) {
    if (error instanceof LexerError || error instanceof ParseError) {
      return json(
        {
          error: 'Parse error',
          message: error.message,
          position: error.position,
        },
        corsHeaders,
        400
      );
    }
    throw error;
  }

  // Resolve lineage if provided
  let allowedPis: string[] | undefined;
  let lineageMetadata: LineageMetadata | undefined;

  if (body.lineage) {
    try {
      const lineageClient = new LineageClient(env.GRAPHDB_GATEWAY);
      const lineageResult = await lineageClient.getLineage(
        body.lineage.sourcePi,
        body.lineage.direction
      );
      allowedPis = lineageResult.pis;
      lineageMetadata = {
        sourcePi: body.lineage.sourcePi,
        direction: body.lineage.direction,
        piCount: lineageResult.pis.length,
        truncated: lineageResult.truncated,
      };
    } catch (error) {
      return json(
        {
          error: 'Lineage resolution failed',
          message: String(error),
        },
        corsHeaders,
        400
      );
    }
  }

  // Execute the query
  const services = createServices(env);
  const result = await execute(ast, services, body, allowedPis, lineageMetadata);

  // Enrich results if requested
  if (body.enrich && result.results.length > 0) {
    const enrichLimit = body.enrich_limit ?? 2000;
    result.results = await enrichResults(result.results, services, enrichLimit);
  }

  return json(result, corsHeaders);
}

/**
 * Handle GET /search/collections - Semantic search for collections
 *
 * Query params:
 * - q: Search query text (required)
 * - limit: Max results (default 10, max 50)
 * - visibility: Filter by visibility ('public' or 'private')
 */
async function handleCollectionSearch(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const limitParam = url.searchParams.get('limit');
  const visibility = url.searchParams.get('visibility');

  if (!query?.trim()) {
    return json({ error: 'Missing q parameter' }, corsHeaders, 400);
  }

  const limit = Math.min(Math.max(parseInt(limitParam || '10'), 1), 50);

  // Build filter for visibility if specified
  const filter: Record<string, unknown> | undefined = visibility
    ? { visibility: { $eq: visibility } }
    : undefined;

  const services = createServices(env);

  try {
    const matches = await services.pinecone.queryByText(query, {
      top_k: limit,
      filter,
      namespace: 'collections',
      include_metadata: true,
    });

    // Transform matches to collection results
    const collections = matches.map((match) => ({
      id: match.id,
      score: match.score,
      title: match.metadata?.label,
      slug: match.metadata?.slug,
      rootPi: match.metadata?.source_pi,
      visibility: match.metadata?.visibility,
    }));

    return json({ collections, count: collections.length }, corsHeaders);
  } catch (error) {
    console.error('Collection search error:', error);
    return json(
      { error: 'Search failed', message: String(error) },
      corsHeaders,
      500
    );
  }
}

/**
 * JSON response helper
 */
function json(
  data: unknown,
  extraHeaders: Record<string, string> = {},
  status = 200
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}
