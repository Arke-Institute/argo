/**
 * Test cases for PI (Collection) and File entity type queries
 *
 * All test IDs contain "test" to enable automatic cleanup via /admin/clear-test-data.
 * See service_docs/TESTING.md for conventions.
 *
 * Uses test data created by setup-pi-file-test-data.ts
 *
 * Entity Type Summary:
 * ┌──────────┬─────────────────────┬──────────────────────────────────────────────────────┐
 * │ Type     │ Code Pattern        │ Description                                          │
 * ├──────────┼─────────────────────┼──────────────────────────────────────────────────────┤
 * │ pi       │ pi_{PI_IDENTIFIER}  │ Collections - IIIF-based archival packages           │
 * │ file     │ file_{filename}     │ Files within collections (notes, images, etc.)       │
 * │ person   │ {name}              │ People mentioned in or authoring files               │
 * │ event    │ {event_name}        │ Events documented in files                           │
 * │ concept  │ {concept_name}      │ Topics, diseases, subjects                           │
 * │ place    │ {place_name}        │ Locations referenced in files                        │
 * └──────────┴─────────────────────┴──────────────────────────────────────────────────────┘
 *
 * Query Examples:
 *
 * Find all files in a collection (PI):
 *   @pifile_test_pi_main -[contains_file]-> type:file
 *
 * Find the collection a file belongs to:
 *   @pifile_test_file_notes -[extracted_from]-> type:pi
 *
 * Find people mentioned in files from a collection:
 *   @pifile_test_pi_main -[contains_file]-> type:file -[mentions, authored_by]-> type:person
 *
 * Semantic search for collections about a topic:
 *   "civil war correspondence" -[*]-> type:pi
 *
 * Semantic search for files about a topic:
 *   "medical patient records tuberculosis" -[*]-> type:file
 */

const BASE_URL = process.env.ARGO_URL || 'http://localhost:8787';
const PREFIX = 'pifile_test_';

interface TestCase {
  name: string;
  description: string; // Natural language question a researcher might ask
  path: string;
  k?: number;
  k_explore?: number;
  expected: {
    minResults?: number;
    maxResults?: number;
    containsEntity?: string;
    containsType?: string;
    shouldContainAny?: string[]; // At least one of these should be in results
  };
  expectError?: boolean;
  notes?: string; // Analysis notes
}

// ============================================================================
// Test Cases for PI and File Entity Types
// ============================================================================

const testCases: TestCase[] = [
  // ==========================================================================
  // Category 1: PI (Collection) Queries
  // ==========================================================================
  {
    name: 'PI: Find collection by exact ID',
    description: 'Look up the main historical archive collection',
    path: `@${PREFIX}pi_main -[*]-> type:file`,
    expected: {
      minResults: 1,
      containsType: 'file',
    },
    notes: 'Basic exact ID lookup for PI entity',
  },
  {
    name: 'PI: Semantic search for collections (zero-hop)',
    description: 'Find collections about historical research',
    path: `"historical research archive primary source documents" type:pi`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_main`,
      containsType: 'pi',
    },
    notes: 'Zero-hop semantic search with type filter for PI entities',
  },
  {
    name: 'PI: Semantic search for civil war collection',
    description: 'Find collections related to the Civil War',
    path: `"civil war letters soldiers correspondence military" type:pi`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_child`,
      containsType: 'pi',
    },
  },
  {
    name: 'PI: Semantic search for medical collections',
    description: 'Find collections about medical research',
    path: `"medical research papers clinical studies public health" type:pi`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_medical`,
      containsType: 'pi',
    },
  },
  {
    name: 'PI: Find child collections',
    description: 'Find subcollections under the main archive',
    path: `@${PREFIX}pi_main -[parent_of, contains]-> type:pi`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_child`,
      containsType: 'pi',
    },
  },
  {
    name: 'PI: Find all files in a collection',
    description: 'What files are in the main historical archive?',
    path: `@${PREFIX}pi_main -[contains_file, has_file]-> type:file`,
    expected: {
      minResults: 3,
      containsType: 'file',
      shouldContainAny: [`${PREFIX}file_notes`, `${PREFIX}file_letter`, `${PREFIX}file_image`],
    },
    notes: 'PI → File traversal using CONTAINS_FILE relationship',
  },
  {
    name: 'PI: Find files in child collection',
    description: 'What files are in the Civil War letters subcollection?',
    path: `@${PREFIX}pi_child -[contains_file]-> type:file`,
    expected: {
      minResults: 2,
      containsType: 'file',
      shouldContainAny: [`${PREFIX}file_transcript`, `${PREFIX}file_analysis`],
    },
  },
  {
    name: 'PI: Find collections by subject',
    description: 'Find collections about tuberculosis',
    path: `@${PREFIX}concept_tuberculosis <-[subject, covers]- type:pi`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_medical`,
      containsType: 'pi',
    },
  },

  // ==========================================================================
  // Category 2: File Entity Queries
  // ==========================================================================
  {
    name: 'File: Find file by exact ID',
    description: 'Look up the field notes document',
    path: `@${PREFIX}file_notes -[*]-> type:person`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}person_john`,
      containsType: 'person',
    },
    notes: 'Basic exact ID lookup for File entity',
  },
  {
    name: 'File: Semantic search for files (zero-hop)',
    description: 'Find files about field expeditions',
    path: `"field notes expedition historical sites" type:file`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}file_notes`,
      containsType: 'file',
    },
    notes: 'Zero-hop semantic search for File entities',
  },
  {
    name: 'File: Find medical files',
    description: 'Find patient records and medical documents',
    path: `"patient records tuberculosis medical clinical" type:file`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}file_medical_notes`,
      containsType: 'file',
    },
  },
  {
    name: 'File: Find research papers',
    description: 'Find influenza research documents',
    path: `"influenza pandemic 1918 research study" type:file`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}file_research_paper`,
      containsType: 'file',
    },
  },
  {
    name: 'File: Find parent collection (EXTRACTED_FROM)',
    description: 'What collection does this file belong to?',
    path: `@${PREFIX}file_notes -[extracted_from, from_collection]-> type:pi`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_main`,
      containsType: 'pi',
    },
    notes: 'File → PI traversal using EXTRACTED_FROM relationship',
  },
  {
    name: 'File: Find author of file',
    description: 'Who wrote the correspondence letter?',
    path: `@${PREFIX}file_letter -[authored_by, written_by]-> type:person`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}person_jane`,
      containsType: 'person',
    },
  },
  {
    name: 'File: Find files by author',
    description: 'What files did Dr. William Brown write?',
    path: `@${PREFIX}person_doctor <-[authored_by, wrote]- type:file`,
    expected: {
      minResults: 2,
      containsType: 'file',
      shouldContainAny: [`${PREFIX}file_medical_notes`, `${PREFIX}file_research_paper`],
    },
  },
  {
    name: 'File: Find files about a topic',
    description: 'Find files that concern tuberculosis',
    path: `@${PREFIX}concept_tuberculosis <-[concerns, discusses]- type:file`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}file_medical_notes`,
      containsType: 'file',
    },
  },
  {
    name: 'File: Find event documentation',
    description: 'Which file documents the 1863 meeting?',
    path: `@${PREFIX}event_meeting <-[documents, records]- type:file`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}file_transcript`,
      containsType: 'file',
    },
  },

  // ==========================================================================
  // Category 3: Multi-hop PI/File Queries
  // ==========================================================================
  {
    name: 'Multi-hop: Collection → Files → People',
    description: 'Find people mentioned in files from the main archive',
    path: `@${PREFIX}pi_main -[contains_file]-> type:file -[mentions, authored_by]-> type:person`,
    expected: {
      minResults: 1,
      containsType: 'person',
      shouldContainAny: [`${PREFIX}person_john`, `${PREFIX}person_jane`],
    },
    notes: 'Two-hop: PI → File → Person',
  },
  {
    name: 'Multi-hop: Collection → Files → Events',
    description: 'What events are documented in the Civil War subcollection?',
    path: `@${PREFIX}pi_child -[contains_file]-> type:file -[documents]-> type:event`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}event_meeting`,
      containsType: 'event',
    },
  },
  {
    name: 'Multi-hop: Person → Files → Collection',
    description: 'What collections contain files authored by Dr. Brown?',
    path: `@${PREFIX}person_doctor <-[authored_by]- type:file -[extracted_from]-> type:pi`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_medical`,
      containsType: 'pi',
    },
    notes: 'Three-hop reverse traversal: Person ← File → PI',
  },
  {
    name: 'Multi-hop: Topic → Files → Collection',
    description: 'Find collections that have files about influenza',
    path: `@${PREFIX}concept_influenza <-[concerns]- type:file -[extracted_from]-> type:pi`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_medical`,
      containsType: 'pi',
    },
  },
  {
    name: 'Multi-hop: Parent → Child → Files',
    description: 'Find files in child collections of the main archive',
    path: `@${PREFIX}pi_main -[parent_of]-> type:pi -[contains_file]-> type:file`,
    expected: {
      minResults: 1,
      containsType: 'file',
      shouldContainAny: [`${PREFIX}file_transcript`, `${PREFIX}file_analysis`],
    },
    notes: 'Traverses PI hierarchy then to files',
  },

  // ==========================================================================
  // Category 4: Variable Depth Queries
  // ==========================================================================
  {
    name: 'Variable depth: Files within 2 hops of main collection',
    description: 'Find all files related to the main archive (direct or in subcollections)',
    path: `@${PREFIX}pi_main -[*]{1,2}-> type:file`,
    expected: {
      minResults: 3,
      containsType: 'file',
    },
    notes: 'Should find direct files and files in child collections',
  },
  {
    name: 'Variable depth: People within 3 hops of collection',
    description: 'Find all people connected to the medical collection',
    path: `@${PREFIX}pi_medical -[*]{1,3}-> type:person`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}person_doctor`,
      containsType: 'person',
    },
  },
  {
    name: 'Variable depth: Collections within 2 hops of person',
    description: 'What collections are connected to Dr. Brown?',
    path: `@${PREFIX}person_doctor <-[*]{1,2}- type:pi`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_medical`,
      containsType: 'pi',
    },
  },

  // ==========================================================================
  // Category 5: Bidirectional Queries
  // ==========================================================================
  {
    name: 'Bidirectional: Entities connected to file in either direction',
    description: 'Find anything connected to the field notes file',
    path: `@${PREFIX}file_notes <-[*]-> type:person`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}person_john`,
      containsType: 'person',
    },
  },
  {
    name: 'Bidirectional: Collections and files connected to event',
    description: 'Find collections or files connected to the expedition',
    path: `@${PREFIX}event_expedition <-[*]{1,2}-> type:pi`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}pi_main`,
      containsType: 'pi',
    },
  },

  // ==========================================================================
  // Category 6: Semantic Filter Queries
  // ==========================================================================
  {
    name: 'Semantic filter: Collections about correspondence',
    description: 'Find archival collections that focus on correspondence',
    path: `"archive collection documents" -[*]-> type:pi ~ "letters correspondence"`,
    k: 10,
    expected: {
      minResults: 1,
      containsType: 'pi',
    },
    notes: 'Semantic entry with semantic filter on PI type',
  },
  {
    name: 'Semantic filter: Medical files with patient records',
    description: 'Find medical files that contain patient information',
    path: `"medical clinical hospital" -[*]-> type:file ~ "patient records"`,
    k: 10,
    expected: {
      minResults: 1,
      containsType: 'file',
    },
  },

  // ==========================================================================
  // Category 7: Cross-type Discovery
  // ==========================================================================
  {
    name: 'Discovery: Files and their locations',
    description: 'Find files associated with specific locations',
    path: `@${PREFIX}place_hospital <-[location, located_at]- type:file`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}file_medical_notes`,
      containsType: 'file',
    },
  },
  {
    name: 'Discovery: Events documented in collections',
    description: 'What events are covered by the main archive?',
    path: `@${PREFIX}pi_main -[subject, covers]-> type:event`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}event_expedition`,
      containsType: 'event',
    },
  },

  // ==========================================================================
  // Category 8: Complex Research Questions
  // ==========================================================================
  {
    name: 'Research: Who documented events in which collections?',
    description: 'Find authors of files that document events, and their parent collections',
    path: `@${PREFIX}event_meeting <-[documents]- type:file <-[authored_by]- type:person`,
    expected: {
      minResults: 0, // May or may not have author for transcript
    },
    notes: 'Complex query: Event ← File ← Person',
  },
  {
    name: 'Research: Topics across collections via files',
    description: 'What topics appear in files across the medical collection?',
    path: `@${PREFIX}pi_medical -[contains_file]-> type:file -[concerns]-> type:concept`,
    expected: {
      minResults: 2,
      containsType: 'concept',
      shouldContainAny: [`${PREFIX}concept_tuberculosis`, `${PREFIX}concept_influenza`],
    },
  },

  // ==========================================================================
  // Category 9: Filtering by content_type (via semantic search)
  // ==========================================================================
  {
    name: 'Content type: Find OCR-processed files',
    description: 'Find files that were OCR processed',
    path: `"OCR processed scanned document" type:file`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}file_medical_notes`,
      containsType: 'file',
    },
    notes: 'content_type: ref_ocr in properties',
  },
  {
    name: 'Content type: Find image description files',
    description: 'Find files that are image descriptions',
    path: `"photograph image description visual" type:file`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}file_image`,
      containsType: 'file',
    },
    notes: 'content_type: ref_description in properties',
  },
];

// ============================================================================
// Test Runner
// ============================================================================

interface QueryResult {
  results: Array<{
    entity: { canonical_id: string; type: string; label?: string };
    path: unknown[];
    score: number;
  }>;
  metadata: {
    error?: string;
    hops?: number;
    total_candidates_explored?: number;
    execution_time_ms?: number;
    reason?: string;
  };
  error?: string;
}

interface TestResult {
  passed: boolean;
  message: string;
  details?: {
    resultCount?: number;
    topScore?: number;
    foundEntities?: string[];
    metadata?: unknown;
  };
}

async function runTest(test: TestCase): Promise<TestResult> {
  try {
    const body: Record<string, unknown> = { path: test.path };
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
        return { passed: true, message: 'Got expected error', details: { metadata: data } };
      }
      return { passed: false, message: 'Expected error but got success', details: { metadata: data } };
    }

    // Check for unexpected errors
    if (data.error && !['no_path_found', 'no_entry_point'].includes(data.metadata?.error || '')) {
      return { passed: false, message: `Unexpected error: ${data.error}`, details: { metadata: data } };
    }

    const results = data.results || [];
    const expected = test.expected;
    const foundIds = results.map((r) => r.entity.canonical_id);

    // Check min results
    if (expected.minResults !== undefined && results.length < expected.minResults) {
      return {
        passed: false,
        message: `Expected at least ${expected.minResults} results, got ${results.length}`,
        details: { resultCount: results.length, foundEntities: foundIds, metadata: data.metadata },
      };
    }

    // Check max results
    if (expected.maxResults !== undefined && results.length > expected.maxResults) {
      return {
        passed: false,
        message: `Expected at most ${expected.maxResults} results, got ${results.length}`,
        details: { resultCount: results.length, foundEntities: foundIds },
      };
    }

    // Check contains specific entity
    if (expected.containsEntity) {
      const found = results.some((r) => r.entity.canonical_id === expected.containsEntity);
      if (!found) {
        return {
          passed: false,
          message: `Expected to find "${expected.containsEntity}"`,
          details: { foundEntities: foundIds, metadata: data.metadata },
        };
      }
    }

    // Check contains type
    if (expected.containsType) {
      const found = results.some((r) => r.entity.type === expected.containsType);
      if (!found) {
        const foundTypes = [...new Set(results.map((r) => r.entity.type))];
        return {
          passed: false,
          message: `Expected type "${expected.containsType}", found: [${foundTypes.join(', ')}]`,
          details: { foundEntities: foundIds },
        };
      }
    }

    // Check should contain any
    if (expected.shouldContainAny) {
      const foundAny = expected.shouldContainAny.some((id) => foundIds.includes(id));
      if (!foundAny) {
        return {
          passed: false,
          message: `Expected one of [${expected.shouldContainAny.join(', ')}]`,
          details: { foundEntities: foundIds, metadata: data.metadata },
        };
      }
    }

    return {
      passed: true,
      message: `Got ${results.length} result(s)`,
      details: {
        resultCount: results.length,
        topScore: results[0]?.score,
        foundEntities: foundIds.slice(0, 5), // Top 5
        metadata: {
          execution_time_ms: data.metadata?.execution_time_ms,
          candidates_explored: data.metadata?.total_candidates_explored,
        },
      },
    };
  } catch (error) {
    return { passed: false, message: `Request failed: ${error}` };
  }
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('📁 Testing PI and File Entity Type Queries');
  console.log('='.repeat(80));
  console.log(`\nBase URL: ${BASE_URL}`);
  console.log(`Test prefix: ${PREFIX}`);
  console.log(`Total test cases: ${testCases.length}\n`);

  const results: { category: string; tests: { test: TestCase; result: TestResult }[] }[] = [];
  let currentCategory = '';
  let categoryTests: { test: TestCase; result: TestResult }[] = [];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    // Extract category from test name
    const category = test.name.split(':')[0];
    if (category !== currentCategory) {
      if (categoryTests.length > 0) {
        results.push({ category: currentCategory, tests: categoryTests });
      }
      currentCategory = category;
      categoryTests = [];
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📂 ${category}`);
      console.log(`${'─'.repeat(80)}`);
    }

    console.log(`\n📋 ${test.name}`);
    console.log(`   "${test.description}"`);
    console.log(`   Query: ${test.path}`);

    const result = await runTest(test);
    categoryTests.push({ test, result });

    if (result.passed) {
      console.log(`   ✅ PASSED: ${result.message}`);
      if (result.details?.foundEntities && result.details.foundEntities.length > 0) {
        const shortIds = result.details.foundEntities.map((id) => id.replace(PREFIX, ''));
        console.log(`   Found: [${shortIds.join(', ')}]`);
      }
      passed++;
    } else {
      console.log(`   ❌ FAILED: ${result.message}`);
      if (result.details?.foundEntities) {
        const shortIds = result.details.foundEntities.map((id) => id.replace(PREFIX, ''));
        console.log(`   Found: [${shortIds.join(', ')}]`);
      }
      if (test.notes) {
        console.log(`   Note: ${test.notes}`);
      }
      failed++;
    }
  }

  // Add last category
  if (categoryTests.length > 0) {
    results.push({ category: currentCategory, tests: categoryTests });
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));

  console.log(`\nOverall: ${passed} passed, ${failed} failed (${Math.round((passed / (passed + failed)) * 100)}%)`);

  console.log('\nBy Category:');
  for (const cat of results) {
    const catPassed = cat.tests.filter((t) => t.result.passed).length;
    const catTotal = cat.tests.length;
    const emoji = catPassed === catTotal ? '✅' : catPassed === 0 ? '❌' : '⚠️';
    console.log(`  ${emoji} ${cat.category}: ${catPassed}/${catTotal}`);
  }

  // Failed tests summary
  const failedTests = results.flatMap((r) => r.tests.filter((t) => !t.result.passed));
  if (failedTests.length > 0) {
    console.log('\n❌ Failed Tests:');
    for (const { test, result } of failedTests) {
      console.log(`  - ${test.name}: ${result.message}`);
    }
  }

  console.log('\n');
  process.exit(failed > 0 ? 1 : 0);
}

main();
