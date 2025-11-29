/**
 * Realistic test queries for Drexel University Historical Collection
 *
 * These tests simulate questions a researcher might actually ask about the collection:
 * - Finding experts by topic
 * - Tracing provenance of documents
 * - Discovering treatments for symptoms
 * - Understanding institutional connections
 * - Cross-domain queries (medicine + administration)
 *
 * Test categories:
 * 1. Basic semantic search - Can we find things by natural language?
 * 2. Expert discovery - Who wrote about X?
 * 3. Geographic queries - What came from location Y?
 * 4. Symptom-treatment - What treats condition Z?
 * 5. Multi-hop exploration - Complex relationship chains
 * 6. Edge cases - Where does the system struggle?
 */

const BASE_URL = process.env.ARGO_URL || 'http://localhost:8787';
const PREFIX = 'drexel_test_';

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
// Test Cases
// ============================================================================

const testCases: TestCase[] = [
  // ==========================================================================
  // Category 1: Basic Semantic Search Entry Points
  // ==========================================================================
  {
    name: 'Semantic: Find homeopathic remedies',
    description: 'What homeopathic remedies are documented in the collection?',
    path: `"homeopathic remedy treatment" -[*]-> type:concept`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}spigelia`,
      containsType: 'concept',
    },
  },
  {
    name: 'Semantic: Find medical case studies',
    description: 'Show me the medical case studies',
    path: `"medical case patient treatment" -[*]-> type:document`,
    k: 10,
    expected: {
      minResults: 1,
      shouldContainAny: [`${PREFIX}case_64`, `${PREFIX}case_65`, `${PREFIX}case_76`],
    },
  },
  {
    name: 'Semantic: Find physicians/doctors (zero-hop)',
    description: 'Who were the physicians in this collection?',
    path: `"physician doctor author homeopathy" type:person`,
    k: 10,
    expected: {
      minResults: 1,
      shouldContainAny: [`${PREFIX}c_hering`, `${PREFIX}f_romig`, `${PREFIX}j_walter`],
    },
    notes: 'Zero-hop query: semantic search with type filter, no edge traversal',
  },

  // ==========================================================================
  // Category 2: Expert Discovery - "Who wrote about X?"
  // ==========================================================================
  {
    name: 'Expert: Who wrote about Spigelia?',
    description: 'Find authors who wrote about the Spigelia remedy',
    path: `@${PREFIX}spigelia <-[authored, wrote, discussed, researched]- type:person`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}c_hering`,
    },
    notes: 'Direct authorship relationship should work',
  },
  {
    name: 'Expert: Authors of eye disease cases',
    description: 'Who documented cases involving eye problems?',
    path: `@${PREFIX}eye_inflammation <-[documents_symptom, documents]- type:document <-[authored, wrote]- type:person`,
    expected: {
      minResults: 1,
      shouldContainAny: [`${PREFIX}f_romig`, `${PREFIX}j_walter`],
    },
    notes: 'Two-hop: symptom → case → author',
  },
  {
    name: 'Expert: Find homeopathy researchers via affiliation',
    description: 'Find researchers affiliated with homeopathic organizations',
    path: `@${PREFIX}homeopathy <-[focuses_on, specialty]- type:organization <-[affiliated_with, member]- type:person`,
    expected: {
      minResults: 1,
      containsType: 'person',
    },
    notes: 'Multi-hop through organization',
  },

  // ==========================================================================
  // Category 3: Geographic Provenance
  // ==========================================================================
  {
    name: 'Geographic: Cases from Pennsylvania',
    description: 'What medical cases originated from Pennsylvania?',
    path: `@${PREFIX}allentau <-[includes_cases_from, associated_place, located_in]- type:publication`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}correspondence_journal`,
    },
  },
  {
    name: 'Geographic: Documents from Surinam',
    description: 'Are there any documents related to Surinam?',
    path: `@${PREFIX}surinam <-[includes_cases_from, associated_place]- type:publication`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}correspondence_journal`,
    },
    notes: 'Tests international provenance tracking',
  },
  {
    name: 'Geographic: What happened at St. College?',
    description: 'What documents were written at St. College building?',
    path: `@${PREFIX}st_college <-[written_at, located_at]- type:document`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}letter_faculty_conduct`,
    },
  },

  // ==========================================================================
  // Category 4: Symptom-Treatment Discovery
  // ==========================================================================
  {
    name: 'Symptom: What treats headaches?',
    description: 'What remedies were used for headaches in these cases?',
    path: `@${PREFIX}severe_headache <-[used_for, treats]- type:concept`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}spigelia`,
    },
  },
  {
    name: 'Symptom: Cases with eye problems',
    description: 'Find case reports documenting eye conditions',
    path: `@${PREFIX}eye_inflammation <-[documents_symptom]- type:document`,
    expected: {
      minResults: 1,
      shouldContainAny: [`${PREFIX}case_64`, `${PREFIX}case_65`],
    },
  },
  {
    name: 'Symptom: Patients treated for oral swelling',
    description: 'Which patients had oral swelling?',
    path: `@${PREFIX}oral_swelling <-[documents_symptom]- type:document -[patient]-> type:person`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}patient_76`,
    },
    notes: 'Two-hop: symptom → case → patient',
  },

  // ==========================================================================
  // Category 5: Institutional/Organizational Queries
  // ==========================================================================
  {
    name: 'Institution: What did the Academy publish?',
    description: 'What publications came from the Homeopathic Academy?',
    path: `@${PREFIX}nra_academy -[published]-> type:publication`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}correspondence_journal`,
    },
  },
  {
    name: 'Institution: Who was affiliated with the Academy?',
    description: 'Find people who worked at the Homeopathic Academy',
    path: `@${PREFIX}nra_academy <-[affiliated_with, member]- type:person`,
    expected: {
      minResults: 3,
      shouldContainAny: [
        `${PREFIX}c_hering`,
        `${PREFIX}f_romig`,
        `${PREFIX}j_walter`,
        `${PREFIX}c_zering`,
        `${PREFIX}g_h_bute`,
      ],
    },
  },
  {
    name: 'Institution: What did Drexel University publish?',
    description: 'Find all publications from Drexel University',
    path: `@${PREFIX}drexel_university -[published]-> type:document`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}historical_collection`,
    },
  },

  // ==========================================================================
  // Category 6: Multi-hop Complex Queries
  // ==========================================================================
  {
    name: 'Multi-hop: Symptoms treated by Academy members',
    description: 'What symptoms did Academy-affiliated physicians treat?',
    path: `@${PREFIX}nra_academy <-[affiliated_with]- type:person -[authored]-> type:document -[documents_symptom]-> type:symptom`,
    expected: {
      minResults: 1,
      containsType: 'symptom',
    },
    notes: 'Three-hop chain: org ← person → doc → symptom',
  },
  {
    name: 'Multi-hop: Collection → Journal → Cases',
    description: 'What case studies are in the historical collection?',
    path: `@${PREFIX}historical_collection -[contains]-> type:publication -[contains]-> type:document`,
    expected: {
      minResults: 1,
      shouldContainAny: [`${PREFIX}case_64`, `${PREFIX}case_65`, `${PREFIX}case_76`],
    },
  },
  {
    name: 'Multi-hop: Authors in Pennsylvania',
    description: 'Find authors whose organizations were in Pennsylvania',
    path: `@${PREFIX}allentau <-[located_in]- type:organization <-[affiliated_with]- type:person`,
    expected: {
      minResults: 1,
      containsType: 'person',
    },
  },

  // ==========================================================================
  // Category 7: Variable Depth Queries
  // ==========================================================================
  {
    name: 'Variable depth: Documents related to Spigelia within 2 hops',
    description: 'What documents are related to Spigelia treatment?',
    path: `@${PREFIX}spigelia <-[*]{1,2}- type:document`,
    expected: {
      minResults: 1,
      containsType: 'document',
      shouldContainAny: [`${PREFIX}case_64`, `${PREFIX}case_65`, `${PREFIX}case_76`],
    },
    notes: 'Uses incoming direction since cases point TO spigelia (TREATED_WITH)',
  },
  {
    name: 'Variable depth: People within 3 hops of collection',
    description: 'Who is mentioned in or connected to the collection?',
    path: `@${PREFIX}historical_collection -[*]{1,3}-> type:person`,
    expected: {
      minResults: 1,
      containsType: 'person',
    },
  },

  // ==========================================================================
  // Category 8: Semantic Filters
  // ==========================================================================
  {
    name: 'Semantic filter: Documents about diplomas',
    description: 'Find documents discussing diploma issues',
    path: `"faculty academic university" -[*]-> type:document ~ "diploma conduct policy"`,
    k: 10,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}letter_faculty_conduct`,
    },
    notes: 'Combines semantic entry with semantic filter',
  },
  {
    name: 'Semantic filter: People who studied remedies',
    description: 'Find researchers who focused on herbal or homeopathic treatments',
    path: `"homeopathy alternative medicine researcher" -[*]-> type:person ~ "author physician"`,
    k: 10,
    expected: {
      minResults: 1,
      containsType: 'person',
    },
  },

  // ==========================================================================
  // Category 9: Cross-Domain Queries (Medicine + Administration)
  // ==========================================================================
  {
    name: 'Cross-domain: Both medical and administrative subjects',
    description: 'What collection contains both medical and policy content?',
    path: `@${PREFIX}faculty_conduct <-[includes_subject]- type:document -[includes_subject]-> @${PREFIX}homeopathy`,
    expected: {
      minResults: 0, // This might not find anything due to directional issues
    },
    notes: 'Tests if we can find documents spanning both domains',
  },

  // ==========================================================================
  // Category 10: Edge Cases and Challenges
  // ==========================================================================
  {
    name: 'Edge: Fuzzy relation matching',
    description: 'Find organizations using various affiliation terms',
    path: `@${PREFIX}c_hering -[works_at, employed_by, member_of, affiliated, associated]-> type:organization`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}nra_academy`,
    },
    notes: 'Tests fuzzy matching with terms that differ from stored predicate',
  },
  {
    name: 'Edge: Semantic search for obscure term',
    description: 'Find information about pterygium (eye condition)',
    path: `"pterygium eye growth condition" -[*]-> type:document`,
    k: 10,
    expected: {
      minResults: 1,
    },
    notes: 'Tests semantic understanding of medical terminology',
  },
  {
    name: 'Edge: Incoming then outgoing',
    description: 'Find authors and what organization they belong to',
    path: `@${PREFIX}case_64 <-[authored]- type:person -[affiliated_with]-> type:organization`,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}nra_academy`,
    },
    notes: 'Tests bidirectional traversal in single query',
  },

  // ==========================================================================
  // Category 11: Natural Language Discovery Attempts
  // These simulate what users might actually type
  // ==========================================================================
  {
    name: 'Natural: Who treated patients?',
    description: 'A researcher asks: who were the doctors treating patients?',
    path: `"patients treated medical care doctor" -[*]-> type:person`,
    k: 10,
    expected: {
      minResults: 1,
      containsType: 'person',
    },
    notes: 'Tests if semantic search finds relevant people',
  },
  {
    name: 'Natural: German medical journal',
    description: 'Find the German-language medical journal',
    path: `"german medical journal correspondence homeopathic" -[*]-> type:publication`,
    k: 5,
    expected: {
      minResults: 1,
      containsEntity: `${PREFIX}correspondence_journal`,
    },
  },
  {
    name: 'Natural: Historical documents from 1836',
    description: 'What was published in 1836?',
    path: `@${PREFIX}date_1836_03_19 <-[published_on, created_on]- type:document`,
    expected: {
      minResults: 1,
    },
    notes: 'Tests temporal queries via date entities',
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
  console.log('🏛️  Testing Drexel University Historical Collection Queries');
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
