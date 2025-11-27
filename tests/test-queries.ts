/**
 * Test cases for Argo path query engine
 *
 * All test IDs contain "test" to enable automatic cleanup via /admin/clear-test-data.
 * See service_docs/TESTING.md for conventions.
 *
 * Uses test data created by setup-test-data.ts:
 *
 *   argo_test_george_washington (person)
 *       ├─[BORN_ON]──────────► argo_test_date_1732_02_22 (date)
 *       ├─[AFFILIATED_WITH]──► argo_test_continental_congress (organization)
 *       └─[RESIDED_AT]───────► argo_test_mount_vernon (place)
 *
 *   argo_test_thomas_jefferson (person)
 *       ├─[BORN_ON]──────────► argo_test_date_1743_04_13 (date)
 *       └─[AFFILIATED_WITH]──► argo_test_continental_congress (organization)
 *
 *   argo_test_declaration (document)
 *       ├─[AUTHORED_BY]──────► argo_test_thomas_jefferson (person)
 *       └─[SIGNED_BY]────────► argo_test_george_washington (person)
 *
 *   argo_test_battle_yorktown (event)
 *       └─[OCCURRED_ON]──────► argo_test_date_1781_10_19 (date)
 */

const BASE_URL = process.env.ARGO_URL || 'http://localhost:8787';
const PREFIX = 'argo_test_';

interface TestCase {
  name: string;
  description: string;
  path: string;
  k?: number;
  k_explore?: number;
  expected: {
    minResults?: number;
    maxResults?: number;
    containsEntity?: string;
    containsType?: string;
    pathLength?: number;
  };
  expectError?: boolean;
}

const testCases: TestCase[] = [
  // ============================================================================
  // Basic: Exact ID to related entity
  // ============================================================================
  {
    name: 'Exact ID → outgoing → type filter',
    description: 'Find when George Washington was born',
    path: `@${PREFIX}george_washington -[born, birth]-> type:date`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}date_1732_02_22`,
      containsType: 'date',
    },
  },

  // ============================================================================
  // Semantic search entry point
  // ============================================================================
  {
    name: 'Semantic search → outgoing → type filter',
    description: 'Search for "Washington" and find his residence',
    path: `"George Washington president" -[resided, lived, home]-> type:place`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}mount_vernon`,
      containsType: 'place',
    },
  },

  // ============================================================================
  // Incoming relationship
  // ============================================================================
  {
    name: 'Exact ID ← incoming ← type filter',
    description: 'Find who signed the Declaration',
    path: `@${PREFIX}declaration -[signed, signer]-> type:person`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}george_washington`,
      containsType: 'person',
    },
  },

  // ============================================================================
  // Two-hop traversal
  // ============================================================================
  {
    name: 'Two-hop: person → org ← person',
    description: 'Find people affiliated with same org as Washington',
    path: `@${PREFIX}george_washington -[affiliated, member]-> type:organization <-[affiliated, member]- type:person`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}thomas_jefferson`,
      containsType: 'person',
    },
  },

  // ============================================================================
  // Wildcard relation
  // ============================================================================
  {
    name: 'Wildcard relation',
    description: 'Find anything connected to Mount Vernon',
    path: `@${PREFIX}mount_vernon <-[*]- type:person`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}george_washington`,
    },
  },

  // ============================================================================
  // Semantic filter at end
  // ============================================================================
  {
    name: 'Semantic filter at end',
    description: 'Find documents related to Jefferson that mention independence',
    path: `@${PREFIX}thomas_jefferson <-[authored, wrote]- "independence declaration"`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}declaration`,
    },
  },

  // ============================================================================
  // Multiple fuzzy terms
  // ============================================================================
  {
    name: 'Multiple fuzzy relation terms',
    description: 'Find organizations Washington was part of using various terms',
    path: `@${PREFIX}george_washington -[affiliated, member, part_of, belonged]-> type:organization`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}continental_congress`,
    },
  },

  // ============================================================================
  // Combined type + semantic filter
  // ============================================================================
  {
    name: 'Combined type + semantic filter',
    description: 'Find events semantically similar to "military battle war"',
    path: `@${PREFIX}george_washington -[*]-> type:event ~ "military battle war"`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}battle_yorktown`,
      containsType: 'event',
    },
  },

  // ============================================================================
  // Variable-depth traversal
  // ============================================================================
  {
    name: 'Variable depth - single depth {1}',
    description: 'Variable depth with exact 1 hop (same as regular)',
    path: `@${PREFIX}george_washington -[*]{1}-> type:date`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}date_1732_02_22`,
      containsType: 'date',
    },
  },

  {
    name: 'Variable depth - exact 2 hops {2}',
    description: 'Find dates 2 hops from declaration (via person)',
    path: `@${PREFIX}declaration -[*]{2}-> type:date`,
    expected: {
      minResults: 1,
      // declaration → person → date (2 hops)
      containsType: 'date',
    },
  },

  {
    name: 'Variable depth - range {1,2}',
    description: 'Find people within 1-2 hops of declaration',
    path: `@${PREFIX}declaration -[*]{1,2}-> type:person`,
    expected: {
      minResults: 1,
      // Depth 1: jefferson, washington directly
      containsEntity: `${PREFIX}thomas_jefferson`,
      containsType: 'person',
    },
  },

  {
    name: 'Variable depth - shorthand {,3}',
    description: 'Find organizations within 3 hops using shorthand',
    path: `@${PREFIX}declaration -[*]{,3}-> type:organization`,
    expected: {
      minResults: 1,
      // declaration → person → organization (2 hops)
      containsEntity: `${PREFIX}continental_congress`,
      containsType: 'organization',
    },
  },

  {
    name: 'Variable depth - with fuzzy relation',
    description: 'Variable depth with fuzzy relation matching',
    path: `@${PREFIX}george_washington -[affiliated, member]{1,2}-> type:organization`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}continental_congress`,
    },
  },

  {
    name: 'Variable depth - with type + semantic filter',
    description: 'Variable depth with combined type and semantic filter',
    path: `@${PREFIX}george_washington -[*]{1,3}-> type:date ~ "birth"`,
    expected: {
      minResults: 1,
      containsType: 'date',
    },
  },

  // ============================================================================
  // Parse error
  // ============================================================================
  {
    name: 'Parse error handling',
    description: 'Malformed query should return error',
    path: '"unclosed string -[bad]->',
    expectError: true,
    expected: {},
  },
];

interface QueryResult {
  results: Array<{
    entity: { canonical_id: string; type: string };
    path: unknown[];
    score: number;
  }>;
  metadata: {
    error?: string;
    hops?: number;
  };
  error?: string;
}

async function runTest(test: TestCase): Promise<{ passed: boolean; message: string; details?: unknown }> {
  try {
    const body: Record<string, unknown> = {
      path: test.path,
    };
    if (test.k !== undefined) body.k = test.k;
    if (test.k_explore !== undefined) body.k_explore = test.k_explore;

    const response = await fetch(`${BASE_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: QueryResult = await response.json();

    // Check for expected parse errors
    if (test.expectError) {
      if (data.error) {
        return { passed: true, message: 'Got expected error', details: { error: data.error } };
      }
      return { passed: false, message: 'Expected error but got success', details: data };
    }

    // Check for unexpected errors (but allow no_path_found, no_entry_point)
    if (data.error && !['no_path_found', 'no_entry_point'].includes(data.metadata?.error || '')) {
      return { passed: false, message: `Unexpected error: ${data.error}`, details: data };
    }

    const results = data.results || [];
    const expected = test.expected;

    // Check min results
    if (expected.minResults !== undefined && results.length < expected.minResults) {
      return {
        passed: false,
        message: `Expected at least ${expected.minResults} results, got ${results.length}`,
        details: data,
      };
    }

    // Check max results
    if (expected.maxResults !== undefined && results.length > expected.maxResults) {
      return {
        passed: false,
        message: `Expected at most ${expected.maxResults} results, got ${results.length}`,
        details: data,
      };
    }

    // Check contains entity
    if (expected.containsEntity) {
      const found = results.some((r) => r.entity.canonical_id === expected.containsEntity);
      if (!found) {
        const foundIds = results.map((r) => r.entity.canonical_id);
        return {
          passed: false,
          message: `Expected to find entity "${expected.containsEntity}", found: [${foundIds.join(', ')}]`,
          details: data,
        };
      }
    }

    // Check contains type
    if (expected.containsType) {
      const found = results.some((r) => r.entity.type === expected.containsType);
      if (!found) {
        return {
          passed: false,
          message: `Expected to find entity of type "${expected.containsType}"`,
          details: data,
        };
      }
    }

    return {
      passed: true,
      message: `Got ${results.length} result(s)`,
      details: {
        resultCount: results.length,
        topScore: results[0]?.score,
        metadata: data.metadata,
      },
    };
  } catch (error) {
    return {
      passed: false,
      message: `Request failed: ${error}`,
    };
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 Testing Argo Path Query Engine');
  console.log('='.repeat(60));
  console.log(`\nBase URL: ${BASE_URL}`);
  console.log(`Test prefix: ${PREFIX}\n`);

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n📋 ${test.name}`);
    console.log(`   ${test.description}`);
    console.log(`   Query: ${test.path}`);

    const result = await runTest(test);

    if (result.passed) {
      console.log(`   ✅ PASSED: ${result.message}`);
      passed++;
    } else {
      console.log(`   ❌ FAILED: ${result.message}`);
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2).split('\n').map((l) => '   ' + l).join('\n')}`);
      }
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
