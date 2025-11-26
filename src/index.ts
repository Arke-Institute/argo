/**
 * Argo - Path Query Engine for Thalassa Knowledge Graph
 *
 * link-search worker
 */

import type { Env, QueryParams, QueryResult } from './types';
import { createServices } from './services';
import { parse, LexerError, ParseError } from './parser';
import { execute } from './executor';

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

      if (path === '/parse' && request.method === 'GET') {
        return handleParse(url, corsHeaders);
      }

      if (path === '/query' && request.method === 'POST') {
        return handleQuery(request, env, corsHeaders);
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

  // Execute the query
  const services = createServices(env);
  const result = await execute(ast, services, body);

  return json(result, corsHeaders);
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
