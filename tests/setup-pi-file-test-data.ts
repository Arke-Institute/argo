/**
 * Setup test data for PI and File entity type queries
 *
 * All test IDs contain "test" to enable automatic cleanup via /admin/clear-test-data.
 * See service_docs/TESTING.md for conventions.
 *
 * This test dataset demonstrates the PI and File entity types:
 *
 * PI Entities (Collections):
 *   - Represent archival collections (IIIF-based Pinax packages)
 *   - Code pattern: pi_{PI_IDENTIFIER}
 *   - Have metadata: description, creator, date_range, subjects, etc.
 *   - Self-referential source_pi (they are their own source)
 *
 * File Entities:
 *   - Represent actual files within collections (notes, images, etc.)
 *   - Code pattern: file_{filename}
 *   - Linked to parent PI via EXTRACTED_FROM relationship
 *   - Have content_type: "text", "ref_ocr", or "ref_description"
 *
 * Graph structure:
 *
 *   pifile_test_pi_main (type: pi)
 *       ├─[PARENT_OF]────────────► pifile_test_pi_child (type: pi)
 *       ├─[CONTAINS_FILE]────────► pifile_test_file_notes (type: file)
 *       ├─[CONTAINS_FILE]────────► pifile_test_file_letter (type: file)
 *       └─[CONTAINS_FILE]────────► pifile_test_file_image (type: file)
 *
 *   pifile_test_pi_child (type: pi)
 *       ├─[CONTAINS_FILE]────────► pifile_test_file_transcript (type: file)
 *       └─[CONTAINS_FILE]────────► pifile_test_file_analysis (type: file)
 *
 *   pifile_test_file_notes ──[MENTIONS]───► pifile_test_person_john
 *   pifile_test_file_letter ──[AUTHORED_BY]──► pifile_test_person_jane
 *   pifile_test_file_transcript ──[REFERENCES]──► pifile_test_event_meeting
 */

const GRAPHDB_URL = 'https://graphdb-gateway.arke.institute';
const EMBEDDING_URL = 'https://embedding-worker.arke.institute';
const PINECONE_URL = 'https://pinecone-gateway.arke.institute';

const TEST_PI = 'pifile_test_pi_001';
const PREFIX = 'pifile_test_';

interface Entity {
  canonical_id: string;
  code: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
}

interface Relationship {
  subject_id: string;
  predicate: string;
  object_id: string;
  properties?: Record<string, unknown>;
}

// ============================================================================
// ENTITIES - PI and File Types
// ============================================================================

const entities: Entity[] = [
  // -------------------------------------------------------------------------
  // PI Entities (Collections)
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}pi_main`,
    code: `pi_${PREFIX}MAIN_COLLECTION_ID`,
    label: 'Historical Research Archive',
    type: 'pi',
    properties: {
      pi: `${PREFIX}MAIN_COLLECTION_ID`,
      description:
        '# Historical Research Archive\n\nA collection of primary source documents from the 19th century including correspondence, field notes, and institutional records.',
      creator: 'State Historical Society',
      date_range: '1850-1920',
      subjects: ['history', 'correspondence', 'institutional records'],
      language: 'en',
      rights: 'Public Domain',
    },
  },
  {
    canonical_id: `${PREFIX}pi_child`,
    code: `pi_${PREFIX}CHILD_COLLECTION_ID`,
    label: 'Civil War Letters Subcollection',
    type: 'pi',
    properties: {
      pi: `${PREFIX}CHILD_COLLECTION_ID`,
      parent_pi: `${PREFIX}MAIN_COLLECTION_ID`,
      description:
        '# Civil War Letters\n\nPersonal correspondence from soldiers and their families during the American Civil War (1861-1865).',
      creator: 'Military History Division',
      date_range: '1861-1865',
      subjects: ['civil war', 'military history', 'correspondence', 'personal letters'],
      language: 'en',
      rights: 'Public Domain',
    },
  },
  {
    canonical_id: `${PREFIX}pi_medical`,
    code: `pi_${PREFIX}MEDICAL_COLLECTION_ID`,
    label: 'Medical Research Papers',
    type: 'pi',
    properties: {
      pi: `${PREFIX}MEDICAL_COLLECTION_ID`,
      description:
        '# Medical Research Papers\n\nCollection of early 20th century medical research documents, clinical notes, and treatment protocols.',
      creator: 'University Medical Archive',
      date_range: '1900-1950',
      subjects: ['medicine', 'research', 'clinical studies', 'public health'],
      language: 'en',
      rights: 'Restricted',
    },
  },

  // -------------------------------------------------------------------------
  // File Entities (Documents within collections)
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}file_notes`,
    code: `file_field_notes.md`,
    label: 'Field Notes',
    type: 'file',
    properties: {
      filename: 'field_notes.md',
      file_cid: 'bafkreiexample1234567890abcdef',
      content_type: 'text',
      description: 'Field notes from the 1875 expedition to document local historical sites',
    },
  },
  {
    canonical_id: `${PREFIX}file_letter`,
    code: `file_correspondence_1862.txt`,
    label: 'Letter from Jane to Family',
    type: 'file',
    properties: {
      filename: 'correspondence_1862.txt',
      file_cid: 'bafkreiletter9876543210fedcba',
      content_type: 'text',
      description: 'Personal letter written by Jane Smith to her family in 1862',
    },
  },
  {
    canonical_id: `${PREFIX}file_image`,
    code: `file_photograph_1870.jpg`,
    label: 'Town Square Photograph 1870',
    type: 'file',
    properties: {
      filename: 'photograph_1870.jpg',
      file_cid: 'bafkreiimage000111222333444',
      content_type: 'ref_description',
      description: 'Historical photograph of the town square taken in 1870',
    },
  },
  {
    canonical_id: `${PREFIX}file_transcript`,
    code: `file_meeting_transcript.txt`,
    label: 'Committee Meeting Transcript',
    type: 'file',
    properties: {
      filename: 'meeting_transcript.txt',
      file_cid: 'bafkreitranscript55566677788',
      content_type: 'text',
      description: 'Transcript of the Historical Society committee meeting from 1863',
    },
  },
  {
    canonical_id: `${PREFIX}file_analysis`,
    code: `file_battle_analysis.md`,
    label: 'Battle Analysis Report',
    type: 'file',
    properties: {
      filename: 'battle_analysis.md',
      file_cid: 'bafkreianalysisaaa111bbb222',
      content_type: 'text',
      description: 'Detailed analysis of the Battle of Gettysburg with tactical notes',
    },
  },
  {
    canonical_id: `${PREFIX}file_medical_notes`,
    code: `file_patient_records.pdf`,
    label: 'Patient Records 1920',
    type: 'file',
    properties: {
      filename: 'patient_records.pdf',
      file_cid: 'bafkreimedical999888777666',
      content_type: 'ref_ocr',
      description: 'OCR-processed patient records from the tuberculosis ward, 1920',
    },
  },
  {
    canonical_id: `${PREFIX}file_research_paper`,
    code: `file_influenza_study.md`,
    label: 'Influenza Study 1918',
    type: 'file',
    properties: {
      filename: 'influenza_study.md',
      file_cid: 'bafkrei1918flu12345678',
      content_type: 'text',
      description: 'Research paper on the 1918 influenza pandemic and its local impact',
    },
  },

  // -------------------------------------------------------------------------
  // Related Entities (for testing multi-hop queries)
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}person_john`,
    code: `${PREFIX}person_john`,
    label: 'John Historian',
    type: 'person',
    properties: {
      role: 'researcher',
      specialty: 'local history',
    },
  },
  {
    canonical_id: `${PREFIX}person_jane`,
    code: `${PREFIX}person_jane`,
    label: 'Jane Smith',
    type: 'person',
    properties: {
      role: 'correspondent',
      lived: '1840-1910',
    },
  },
  {
    canonical_id: `${PREFIX}person_doctor`,
    code: `${PREFIX}person_doctor`,
    label: 'Dr. William Brown',
    type: 'person',
    properties: {
      role: 'physician',
      specialty: 'infectious diseases',
    },
  },
  {
    canonical_id: `${PREFIX}event_meeting`,
    code: `${PREFIX}event_meeting`,
    label: 'Historical Society Meeting 1863',
    type: 'event',
    properties: {
      date: '1863-05-15',
      location: 'Town Hall',
    },
  },
  {
    canonical_id: `${PREFIX}event_expedition`,
    code: `${PREFIX}event_expedition`,
    label: '1875 Historical Sites Expedition',
    type: 'event',
    properties: {
      date: '1875-06-01',
      duration: '3 months',
    },
  },
  {
    canonical_id: `${PREFIX}place_hospital`,
    code: `${PREFIX}place_hospital`,
    label: 'County General Hospital',
    type: 'place',
    properties: {
      location: 'Philadelphia, PA',
      established: '1895',
    },
  },
  {
    canonical_id: `${PREFIX}concept_tuberculosis`,
    code: `${PREFIX}concept_tuberculosis`,
    label: 'Tuberculosis',
    type: 'concept',
    properties: {
      category: 'disease',
      era: 'early 20th century',
    },
  },
  {
    canonical_id: `${PREFIX}concept_influenza`,
    code: `${PREFIX}concept_influenza`,
    label: 'Influenza Pandemic',
    type: 'concept',
    properties: {
      category: 'disease',
      year: '1918',
    },
  },
];

// ============================================================================
// RELATIONSHIPS
// ============================================================================

const relationships: Relationship[] = [
  // -------------------------------------------------------------------------
  // PI hierarchy relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}pi_main`,
    predicate: 'PARENT_OF',
    object_id: `${PREFIX}pi_child`,
  },

  // -------------------------------------------------------------------------
  // File → PI relationships (EXTRACTED_FROM)
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}file_notes`,
    predicate: 'EXTRACTED_FROM',
    object_id: `${PREFIX}pi_main`,
  },
  {
    subject_id: `${PREFIX}file_letter`,
    predicate: 'EXTRACTED_FROM',
    object_id: `${PREFIX}pi_main`,
  },
  {
    subject_id: `${PREFIX}file_image`,
    predicate: 'EXTRACTED_FROM',
    object_id: `${PREFIX}pi_main`,
  },
  {
    subject_id: `${PREFIX}file_transcript`,
    predicate: 'EXTRACTED_FROM',
    object_id: `${PREFIX}pi_child`,
  },
  {
    subject_id: `${PREFIX}file_analysis`,
    predicate: 'EXTRACTED_FROM',
    object_id: `${PREFIX}pi_child`,
  },
  {
    subject_id: `${PREFIX}file_medical_notes`,
    predicate: 'EXTRACTED_FROM',
    object_id: `${PREFIX}pi_medical`,
  },
  {
    subject_id: `${PREFIX}file_research_paper`,
    predicate: 'EXTRACTED_FROM',
    object_id: `${PREFIX}pi_medical`,
  },

  // -------------------------------------------------------------------------
  // PI → File relationships (reverse direction: CONTAINS_FILE)
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}pi_main`,
    predicate: 'CONTAINS_FILE',
    object_id: `${PREFIX}file_notes`,
  },
  {
    subject_id: `${PREFIX}pi_main`,
    predicate: 'CONTAINS_FILE',
    object_id: `${PREFIX}file_letter`,
  },
  {
    subject_id: `${PREFIX}pi_main`,
    predicate: 'CONTAINS_FILE',
    object_id: `${PREFIX}file_image`,
  },
  {
    subject_id: `${PREFIX}pi_child`,
    predicate: 'CONTAINS_FILE',
    object_id: `${PREFIX}file_transcript`,
  },
  {
    subject_id: `${PREFIX}pi_child`,
    predicate: 'CONTAINS_FILE',
    object_id: `${PREFIX}file_analysis`,
  },
  {
    subject_id: `${PREFIX}pi_medical`,
    predicate: 'CONTAINS_FILE',
    object_id: `${PREFIX}file_medical_notes`,
  },
  {
    subject_id: `${PREFIX}pi_medical`,
    predicate: 'CONTAINS_FILE',
    object_id: `${PREFIX}file_research_paper`,
  },

  // -------------------------------------------------------------------------
  // File → Entity relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}file_notes`,
    predicate: 'MENTIONS',
    object_id: `${PREFIX}person_john`,
  },
  {
    subject_id: `${PREFIX}file_notes`,
    predicate: 'DOCUMENTS',
    object_id: `${PREFIX}event_expedition`,
  },
  {
    subject_id: `${PREFIX}file_letter`,
    predicate: 'AUTHORED_BY',
    object_id: `${PREFIX}person_jane`,
  },
  {
    subject_id: `${PREFIX}file_transcript`,
    predicate: 'DOCUMENTS',
    object_id: `${PREFIX}event_meeting`,
  },
  {
    subject_id: `${PREFIX}file_medical_notes`,
    predicate: 'AUTHORED_BY',
    object_id: `${PREFIX}person_doctor`,
  },
  {
    subject_id: `${PREFIX}file_medical_notes`,
    predicate: 'CONCERNS',
    object_id: `${PREFIX}concept_tuberculosis`,
  },
  {
    subject_id: `${PREFIX}file_medical_notes`,
    predicate: 'LOCATION',
    object_id: `${PREFIX}place_hospital`,
  },
  {
    subject_id: `${PREFIX}file_research_paper`,
    predicate: 'AUTHORED_BY',
    object_id: `${PREFIX}person_doctor`,
  },
  {
    subject_id: `${PREFIX}file_research_paper`,
    predicate: 'CONCERNS',
    object_id: `${PREFIX}concept_influenza`,
  },

  // -------------------------------------------------------------------------
  // PI → Subject relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}pi_main`,
    predicate: 'SUBJECT',
    object_id: `${PREFIX}event_expedition`,
  },
  {
    subject_id: `${PREFIX}pi_child`,
    predicate: 'SUBJECT',
    object_id: `${PREFIX}event_meeting`,
  },
  {
    subject_id: `${PREFIX}pi_medical`,
    predicate: 'SUBJECT',
    object_id: `${PREFIX}concept_tuberculosis`,
  },
  {
    subject_id: `${PREFIX}pi_medical`,
    predicate: 'SUBJECT',
    object_id: `${PREFIX}concept_influenza`,
  },
];

// ============================================================================
// Setup Functions
// ============================================================================

async function createTestPI(): Promise<void> {
  console.log('\n🏷️  Creating test PI node...\n');

  const response = await fetch(`${GRAPHDB_URL}/pi/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pi: TEST_PI }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`   ❌ Failed to create PI: ${error}`);
  } else {
    console.log(`   ✓ Created PI: ${TEST_PI}`);
  }
}

async function createEntities(): Promise<void> {
  console.log('\n📦 Creating entities in GraphDB...\n');

  let created = 0;
  let updated = 0;

  for (const entity of entities) {
    const response = await fetch(`${GRAPHDB_URL}/entity/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...entity,
        source_pi: TEST_PI,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`   ❌ Failed to create ${entity.canonical_id}: ${error}`);
    } else {
      const result = (await response.json()) as { data?: { nodesCreated?: number } };
      const wasCreated = (result.data?.nodesCreated ?? 0) > 0;
      if (wasCreated) {
        created++;
        console.log(`   ✓ Created ${entity.label} (${entity.type})`);
      } else {
        updated++;
        console.log(`   ~ Updated ${entity.label} (${entity.type})`);
      }
    }
  }

  console.log(`\n   ✓ Created ${created} new entities, updated ${updated} existing`);
}

async function createRelationships(): Promise<void> {
  console.log('\n🔗 Creating relationships in GraphDB...\n');

  const response = await fetch(`${GRAPHDB_URL}/relationships/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      relationships: relationships.map((r) => ({
        ...r,
        properties: r.properties || {},
        source_pi: TEST_PI,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`   ❌ Failed to create relationships: ${error}`);
  } else {
    const result = await response.json();
    console.log(`   ✓ Created ${relationships.length} relationships`);
    console.log(`   Response: ${JSON.stringify(result)}`);
  }
}

async function embedAndUpsert(): Promise<void> {
  console.log('\n🧠 Embedding entities and upserting to Pinecone...\n');

  // Create rich text representations for embedding
  const texts = entities.map((e) => {
    const props = e.properties
      ? Object.entries(e.properties)
          .filter(([k]) => !['file_cid'].includes(k)) // Skip CID from embedding text
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(', ')
      : '';
    return `${e.type}: ${e.label}${props ? ` | ${props}` : ''}`;
  });

  console.log(`   Embedding ${texts.length} entities...`);
  console.log('\n   Sample texts:');
  texts.slice(0, 5).forEach((t, i) => console.log(`     ${i + 1}. ${t.slice(0, 100)}...`));

  // Batch embeddings in chunks of 20
  const BATCH_SIZE = 20;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embResponse = await fetch(`${EMBEDDING_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: batch,
        model: 'text-embedding-3-small',
        dimensions: 768,
      }),
    });

    if (!embResponse.ok) {
      const error = await embResponse.text();
      throw new Error(`Embedding failed: ${error}`);
    }

    const { embeddings } = (await embResponse.json()) as { embeddings: number[][] };
    allEmbeddings.push(...embeddings);
    console.log(`   ... embedded ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}`);
  }

  console.log(`   ✓ Got ${allEmbeddings.length} embeddings`);

  // Upsert to Pinecone
  const vectors = entities.map((e, i) => ({
    id: e.canonical_id,
    values: allEmbeddings[i],
    text: texts[i],
    metadata: {
      canonical_id: e.canonical_id,
      label: e.label,
      type: e.type,
      source_pi: TEST_PI,
    },
  }));

  const UPSERT_BATCH_SIZE = 50;
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    const upsertResponse = await fetch(`${PINECONE_URL}/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vectors: batch }),
    });

    if (!upsertResponse.ok) {
      const error = await upsertResponse.text();
      throw new Error(`Pinecone upsert failed: ${error}`);
    }
    console.log(`   ... upserted ${Math.min(i + UPSERT_BATCH_SIZE, vectors.length)}/${vectors.length} vectors`);
  }

  console.log(`   ✓ Upserted ${vectors.length} vectors to Pinecone`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('📁 Setting up PI and File Entity Type Test Data');
  console.log('='.repeat(70));
  console.log(`\nEntities: ${entities.length}`);
  console.log(`  - PI entities: ${entities.filter((e) => e.type === 'pi').length}`);
  console.log(`  - File entities: ${entities.filter((e) => e.type === 'file').length}`);
  console.log(`  - Other entities: ${entities.filter((e) => !['pi', 'file'].includes(e.type)).length}`);
  console.log(`Relationships: ${relationships.length}`);

  try {
    await createTestPI();
    await createEntities();
    await createRelationships();
    await embedAndUpsert();

    console.log('\n' + '='.repeat(70));
    console.log('✅ PI/File test data setup complete!');
    console.log('='.repeat(70));
    console.log('\nTest entities created with prefix: ' + PREFIX);
    console.log('Run tests with: npx tsx tests/test-pi-file-queries.ts');
    console.log('Clean up with: npm run test:teardown\n');
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
