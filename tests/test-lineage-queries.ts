/**
 * Test cases for PI Lineage filtering
 *
 * Tests the lineage parameter on queries to verify that:
 * 1. Queries are filtered to only entities/relationships within the PI lineage
 * 2. Descendants filtering works (down the tree)
 * 3. Ancestors filtering works (up the tree)
 * 4. Both direction filtering works
 *
 * PI Hierarchy (from setup-lineage-test-data.ts):
 *   lineage_test_pi_root
 *       ├─► lineage_test_pi_history
 *       │   └─► lineage_test_pi_civil_war
 *       └─► lineage_test_pi_science
 */

const BASE_URL = process.env.ARGO_URL || 'http://localhost:8787';
const PREFIX = 'lineage_test_';

// PI IDs
const PI_ROOT = `${PREFIX}pi_root`;
const PI_HISTORY = `${PREFIX}pi_history`;
const PI_CIVIL_WAR = `${PREFIX}pi_civil_war`;
const PI_SCIENCE = `${PREFIX}pi_science`;

interface LineageParams {
  sourcePi: string;
  direction: 'ancestors' | 'descendants' | 'both';
}

interface TestCase {
  name: string;
  description: string;
  path: string;
  lineage?: LineageParams;
  k?: number;
  expected: {
    minResults?: number;
    maxResults?: number;
    shouldContain?: string[];
    shouldNotContain?: string[];
    containsType?: string;
  };
}

const testCases: TestCase[] = [
  // ============================================================================
  // Baseline: No lineage filter - should find all matching entities
  // ============================================================================
  {
    name: 'Baseline: No lineage filter',
    description: 'Search for all persons without lineage filtering',
    path: `"person researcher president general" type:person`,
    k: 10,
    expected: {
      minResults: 1,
      containsType: 'person',
      // Should find persons from all PIs
    },
  },

  // ============================================================================
  // Descendants filtering tests
  // ============================================================================
  {
    name: 'Descendants of root - find all',
    description: 'Search within descendants of root should find everything',
    path: `"Lincoln president civil war" type:person`,
    lineage: { sourcePi: PI_ROOT, direction: 'descendants' },
    k: 10,
    expected: {
      minResults: 1,
      shouldContain: [`${PREFIX}person_lincoln`],
      containsType: 'person',
    },
  },

  {
    name: 'Descendants of history - find history + civil_war',
    description: 'Search within history lineage should find history and civil war entities',
    path: `"Lincoln president" type:person`,
    lineage: { sourcePi: PI_HISTORY, direction: 'descendants' },
    k: 10,
    expected: {
      minResults: 1,
      shouldContain: [`${PREFIX}person_lincoln`],
      // Should NOT find science entities
      shouldNotContain: [`${PREFIX}person_scientist`],
    },
  },

  {
    name: 'Descendants of civil_war - only civil war entities',
    description: 'Search within civil war lineage should only find civil war entities',
    path: `"Lincoln Grant president general" type:person`,
    lineage: { sourcePi: PI_CIVIL_WAR, direction: 'descendants' },
    k: 10,
    expected: {
      minResults: 1,
      shouldContain: [`${PREFIX}person_lincoln`, `${PREFIX}person_grant`],
      // Should NOT find history or science entities
      shouldNotContain: [`${PREFIX}person_historian`, `${PREFIX}person_scientist`],
    },
  },

  {
    name: 'Descendants of science - only science entities',
    description: 'Search within science lineage should only find science entities',
    path: `"researcher scientist physics" type:person`,
    lineage: { sourcePi: PI_SCIENCE, direction: 'descendants' },
    k: 10,
    expected: {
      minResults: 1,
      shouldContain: [`${PREFIX}person_scientist`],
      // Should NOT find history or civil war entities
      shouldNotContain: [`${PREFIX}person_lincoln`, `${PREFIX}person_historian`],
    },
  },

  // ============================================================================
  // Ancestors filtering tests
  // ============================================================================
  {
    name: 'Ancestors of civil_war - find civil_war + history + root',
    description: 'Ancestors of civil war should include all parent PIs',
    path: `"archivist historian" type:person`,
    lineage: { sourcePi: PI_CIVIL_WAR, direction: 'ancestors' },
    k: 10,
    expected: {
      minResults: 1,
      // Should find root and history entities
      shouldContain: [`${PREFIX}person_archivist`, `${PREFIX}person_historian`],
      // Should NOT find science entities (different branch)
      shouldNotContain: [`${PREFIX}person_scientist`],
    },
  },

  {
    name: 'Ancestors of science - find science + root only',
    description: 'Ancestors of science should not include history branch',
    path: `"archivist curator" type:person`,
    lineage: { sourcePi: PI_SCIENCE, direction: 'ancestors' },
    k: 10,
    expected: {
      minResults: 1,
      shouldContain: [`${PREFIX}person_archivist`],
      // Should NOT find history or civil war entities
      shouldNotContain: [`${PREFIX}person_historian`, `${PREFIX}person_lincoln`],
    },
  },

  // ============================================================================
  // Both directions filtering tests
  // ============================================================================
  {
    name: 'Both directions from history',
    description: 'Both directions from history should find root + history + civil_war',
    path: `"Lincoln historian archivist" type:person`,
    lineage: { sourcePi: PI_HISTORY, direction: 'both' },
    k: 10,
    expected: {
      minResults: 1,
      // Should find entities from root, history, and civil_war
      shouldContain: [`${PREFIX}person_archivist`, `${PREFIX}person_historian`],
      // Should NOT find science entities
      shouldNotContain: [`${PREFIX}person_scientist`],
    },
  },

  // ============================================================================
  // Graph traversal with lineage filtering
  // ============================================================================
  {
    name: 'Traversal with lineage - civil war documents',
    description: 'From Lincoln, find documents only within civil war lineage',
    path: `@${PREFIX}person_lincoln -[authored, wrote]-> type:document`,
    lineage: { sourcePi: PI_CIVIL_WAR, direction: 'descendants' },
    expected: {
      minResults: 1,
      shouldContain: [`${PREFIX}doc_emancipation`],
      // Should NOT traverse to documents in other PIs
      shouldNotContain: [`${PREFIX}doc_research`, `${PREFIX}doc_constitution`],
    },
  },

  {
    name: 'Traversal with ancestors lineage',
    description: 'From Lincoln with ancestors, should find paths through history',
    path: `@${PREFIX}person_lincoln -[*]{1,3}-> type:organization`,
    lineage: { sourcePi: PI_CIVIL_WAR, direction: 'ancestors' },
    expected: {
      // May find National Archives through relationships
      containsType: 'organization',
    },
  },

  // ============================================================================
  // Edge cases
  // ============================================================================
  {
    name: 'Exact ID filtered by lineage',
    description: 'Exact ID lookup should fail if entity not in lineage',
    path: `@${PREFIX}person_scientist`,
    lineage: { sourcePi: PI_CIVIL_WAR, direction: 'descendants' },
    expected: {
      maxResults: 0, // Should find nothing - scientist is not in civil war lineage
    },
  },

  {
    name: 'Exact ID in correct lineage',
    description: 'Exact ID lookup should succeed if entity is in lineage',
    path: `@${PREFIX}person_lincoln`,
    lineage: { sourcePi: PI_ROOT, direction: 'descendants' },
    expected: {
      minResults: 1,
      shouldContain: [`${PREFIX}person_lincoln`],
    },
  },

  {
    name: 'Multi-hop with narrow lineage',
    description: 'Multi-hop traversal respects lineage at each step',
    path: `@${PREFIX}person_grant -[*]-> type:event -[*]-> type:place`,
    lineage: { sourcePi: PI_CIVIL_WAR, direction: 'descendants' },
    expected: {
      minResults: 1,
      shouldContain: [`${PREFIX}place_appomattox`],
    },
  },
];

interface QueryResult {
  results: Array<{
    entity: { canonical_id: string; type: string; label: string };
    path: unknown[];
    score: number;
  }>;
  metadata: {
    error?: string;
    hops?: number;
    lineage?: {
      sourcePi: string;
      direction: string;
      piCount: number;
      truncated: boolean;
    };
  };
  error?: string;
}

async function runTest(test: TestCase): Promise<{ passed: boolean; message: string; details?: unknown }> {
  try {
    const body: Record<string, unknown> = {
      path: test.path,
    };
    if (test.k !== undefined) body.k = test.k;
    if (test.lineage) body.lineage = test.lineage;

    const response = await fetch(`${BASE_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: QueryResult = await response.json();

    // Check for unexpected errors
    if (data.error && !['no_path_found', 'no_entry_point'].includes(data.metadata?.error || '')) {
      return { passed: false, message: `Unexpected error: ${data.error}`, details: data };
    }

    const results = data.results || [];
    const expected = test.expected;
    const foundIds = results.map((r) => r.entity.canonical_id);

    // Check min results
    if (expected.minResults !== undefined && results.length < expected.minResults) {
      return {
        passed: false,
        message: `Expected at least ${expected.minResults} results, got ${results.length}`,
        details: { foundIds, metadata: data.metadata },
      };
    }

    // Check max results
    if (expected.maxResults !== undefined && results.length > expected.maxResults) {
      return {
        passed: false,
        message: `Expected at most ${expected.maxResults} results, got ${results.length}`,
        details: { foundIds, metadata: data.metadata },
      };
    }

    // Check shouldContain
    if (expected.shouldContain) {
      for (const expectedId of expected.shouldContain) {
        if (!foundIds.includes(expectedId)) {
          return {
            passed: false,
            message: `Expected to find "${expectedId}" but didn't. Found: [${foundIds.join(', ')}]`,
            details: { foundIds, metadata: data.metadata },
          };
        }
      }
    }

    // Check shouldNotContain (critical for lineage filtering!)
    if (expected.shouldNotContain) {
      for (const forbiddenId of expected.shouldNotContain) {
        if (foundIds.includes(forbiddenId)) {
          return {
            passed: false,
            message: `Should NOT have found "${forbiddenId}" but it was in results!`,
            details: { foundIds, metadata: data.metadata },
          };
        }
      }
    }

    // Check contains type
    if (expected.containsType) {
      const found = results.some((r) => r.entity.type === expected.containsType);
      if (!found && results.length > 0) {
        return {
          passed: false,
          message: `Expected to find entity of type "${expected.containsType}"`,
          details: { results: results.map((r) => ({ id: r.entity.canonical_id, type: r.entity.type })) },
        };
      }
    }

    // Check lineage metadata is present when lineage was requested
    if (test.lineage && !data.metadata?.lineage) {
      return {
        passed: false,
        message: 'Lineage metadata missing from response',
        details: data.metadata,
      };
    }

    return {
      passed: true,
      message: `Got ${results.length} result(s)${data.metadata?.lineage ? ` (${data.metadata.lineage.piCount} PIs in lineage)` : ''}`,
      details: {
        resultCount: results.length,
        foundIds: foundIds.slice(0, 5),
        lineage: data.metadata?.lineage,
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
  console.log('\n' + '='.repeat(70));
  console.log('🧬 Testing PI Lineage Filtering');
  console.log('='.repeat(70));
  console.log(`\nBase URL: ${BASE_URL}`);
  console.log(`Test prefix: ${PREFIX}`);
  console.log(`
PI Hierarchy:
  ${PI_ROOT}
      ├─► ${PI_HISTORY}
      │   └─► ${PI_CIVIL_WAR}
      └─► ${PI_SCIENCE}
`);

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n📋 ${test.name}`);
    console.log(`   ${test.description}`);
    console.log(`   Query: ${test.path}`);
    if (test.lineage) {
      console.log(`   Lineage: ${test.lineage.direction} of ${test.lineage.sourcePi}`);
    }

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

  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
