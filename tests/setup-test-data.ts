/**
 * Setup test data for Argo path query tests
 *
 * All test IDs contain "test" to enable automatic cleanup via /admin/clear-test-data.
 * See service_docs/TESTING.md for conventions.
 *
 * Creates a small test graph with prefixed entities:
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

const GRAPHDB_URL = 'https://graphdb-gateway.arke.institute';
const EMBEDDING_URL = 'https://embedding-worker.arke.institute';
const PINECONE_URL = 'https://pinecone-gateway.arke.institute';

const TEST_PI = 'argo_test_pi_001';
const PREFIX = 'argo_test_';

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

// Test entities
const entities: Entity[] = [
  // People
  {
    canonical_id: `${PREFIX}george_washington`,
    code: `${PREFIX}george_washington`,
    label: 'George Washington',
    type: 'person',
    properties: { role: 'First President', country: 'United States' },
  },
  {
    canonical_id: `${PREFIX}thomas_jefferson`,
    code: `${PREFIX}thomas_jefferson`,
    label: 'Thomas Jefferson',
    type: 'person',
    properties: { role: 'Third President', country: 'United States' },
  },
  // Dates
  {
    canonical_id: `${PREFIX}date_1732_02_22`,
    code: `${PREFIX}date_1732_02_22`,
    label: 'February 22, 1732',
    type: 'date',
    properties: { iso_date: '1732-02-22' },
  },
  {
    canonical_id: `${PREFIX}date_1743_04_13`,
    code: `${PREFIX}date_1743_04_13`,
    label: 'April 13, 1743',
    type: 'date',
    properties: { iso_date: '1743-04-13' },
  },
  {
    canonical_id: `${PREFIX}date_1781_10_19`,
    code: `${PREFIX}date_1781_10_19`,
    label: 'October 19, 1781',
    type: 'date',
    properties: { iso_date: '1781-10-19' },
  },
  // Places
  {
    canonical_id: `${PREFIX}mount_vernon`,
    code: `${PREFIX}mount_vernon`,
    label: 'Mount Vernon',
    type: 'place',
    properties: { state: 'Virginia', country: 'United States' },
  },
  // Organizations
  {
    canonical_id: `${PREFIX}continental_congress`,
    code: `${PREFIX}continental_congress`,
    label: 'Continental Congress',
    type: 'organization',
    properties: { founded: '1774' },
  },
  // Documents
  {
    canonical_id: `${PREFIX}declaration`,
    code: `${PREFIX}declaration`,
    label: 'Declaration of Independence',
    type: 'document',
    properties: { year: '1776' },
  },
  // Events
  {
    canonical_id: `${PREFIX}battle_yorktown`,
    code: `${PREFIX}battle_yorktown`,
    label: 'Battle of Yorktown',
    type: 'event',
    properties: { war: 'American Revolutionary War' },
  },
];

// Test relationships
const relationships: Relationship[] = [
  // George Washington relationships
  {
    subject_id: `${PREFIX}george_washington`,
    predicate: 'BORN_ON',
    object_id: `${PREFIX}date_1732_02_22`,
  },
  {
    subject_id: `${PREFIX}george_washington`,
    predicate: 'AFFILIATED_WITH',
    object_id: `${PREFIX}continental_congress`,
  },
  {
    subject_id: `${PREFIX}george_washington`,
    predicate: 'RESIDED_AT',
    object_id: `${PREFIX}mount_vernon`,
  },
  // Thomas Jefferson relationships
  {
    subject_id: `${PREFIX}thomas_jefferson`,
    predicate: 'BORN_ON',
    object_id: `${PREFIX}date_1743_04_13`,
  },
  {
    subject_id: `${PREFIX}thomas_jefferson`,
    predicate: 'AFFILIATED_WITH',
    object_id: `${PREFIX}continental_congress`,
  },
  // Declaration relationships
  {
    subject_id: `${PREFIX}declaration`,
    predicate: 'AUTHORED_BY',
    object_id: `${PREFIX}thomas_jefferson`,
  },
  {
    subject_id: `${PREFIX}declaration`,
    predicate: 'SIGNED_BY',
    object_id: `${PREFIX}george_washington`,
  },
  // Battle of Yorktown
  {
    subject_id: `${PREFIX}battle_yorktown`,
    predicate: 'OCCURRED_ON',
    object_id: `${PREFIX}date_1781_10_19`,
  },
  // Washington commanded at Yorktown
  {
    subject_id: `${PREFIX}george_washington`,
    predicate: 'COMMANDED_AT',
    object_id: `${PREFIX}battle_yorktown`,
  },
  // Jefferson was at Continental Congress during the war
  {
    subject_id: `${PREFIX}thomas_jefferson`,
    predicate: 'PARTICIPATED_IN',
    object_id: `${PREFIX}battle_yorktown`,
  },
];

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
      const created = result.data?.nodesCreated ?? 0;
      console.log(`   ✓ ${created > 0 ? 'Created' : 'Updated'} ${entity.label} (${entity.type})`);
    }
  }
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
    console.log(`   ${JSON.stringify(result)}`);
  }
}

async function embedAndUpsert(): Promise<void> {
  console.log('\n🧠 Embedding entities and upserting to Pinecone...\n');

  // Create text representations for embedding
  const texts = entities.map((e) => {
    const props = e.properties
      ? Object.entries(e.properties)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : '';
    return `${e.type}: ${e.label}${props ? ` | ${props}` : ''}`;
  });

  console.log('   Embedding texts:');
  texts.forEach((t, i) => console.log(`     ${i + 1}. ${t}`));

  // Get embeddings
  const embResponse = await fetch(`${EMBEDDING_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      texts,
      model: 'text-embedding-3-small',
      dimensions: 768,
    }),
  });

  if (!embResponse.ok) {
    const error = await embResponse.text();
    throw new Error(`Embedding failed: ${error}`);
  }

  const { embeddings } = (await embResponse.json()) as { embeddings: number[][] };
  console.log(`\n   ✓ Got ${embeddings.length} embeddings`);

  // Upsert to Pinecone
  const vectors = entities.map((e, i) => ({
    id: e.canonical_id,
    values: embeddings[i],
    text: texts[i], // Required by pinecone gateway
    metadata: {
      canonical_id: e.canonical_id,
      label: e.label,
      type: e.type,
      source_pi: TEST_PI,
    },
  }));

  const upsertResponse = await fetch(`${PINECONE_URL}/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vectors }),
  });

  if (!upsertResponse.ok) {
    const error = await upsertResponse.text();
    throw new Error(`Pinecone upsert failed: ${error}`);
  }

  console.log(`   ✓ Upserted ${vectors.length} vectors to Pinecone`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 Setting up Argo test data');
  console.log('='.repeat(60));

  try {
    await createTestPI();
    await createEntities();
    await createRelationships();
    await embedAndUpsert();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test data setup complete!');
    console.log('='.repeat(60));
    console.log('\nTest entities created with prefix: ' + PREFIX);
    console.log('Run tests with: npm test');
    console.log('Clean up with: npm run test:teardown\n');
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
