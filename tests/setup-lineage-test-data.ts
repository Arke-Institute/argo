/**
 * Setup test data for PI Lineage filtering tests
 *
 * Creates a nested PI hierarchy to test lineage-based query filtering:
 *
 * PI Hierarchy:
 *   lineage_test_pi_root
 *       ├─► lineage_test_pi_history (child)
 *       │   └─► lineage_test_pi_civil_war (grandchild)
 *       └─► lineage_test_pi_science (child)
 *
 * Each PI has unique entities and relationships.
 * Tests verify that queries with lineage filtering only return
 * entities/relationships from the correct PI lineage.
 */

const GRAPHDB_URL = 'https://graphdb-gateway.arke.institute';
const EMBEDDING_URL = 'https://embedding-worker.arke.institute';
const PINECONE_URL = 'https://pinecone-gateway.arke.institute';

const PREFIX = 'lineage_test_';

// PI IDs for the hierarchy
const PI_ROOT = `${PREFIX}pi_root`;
const PI_HISTORY = `${PREFIX}pi_history`;
const PI_CIVIL_WAR = `${PREFIX}pi_civil_war`;
const PI_SCIENCE = `${PREFIX}pi_science`;

interface Entity {
  canonical_id: string;
  code: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
  source_pi: string;
}

interface Relationship {
  subject_id: string;
  predicate: string;
  object_id: string;
  properties?: Record<string, unknown>;
  source_pi: string;
}

// ============================================================================
// ENTITIES - Each belongs to a specific PI
// ============================================================================

const entities: Entity[] = [
  // -------------------------------------------------------------------------
  // ROOT PI entities - General collection
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}person_archivist`,
    code: `${PREFIX}person_archivist`,
    label: 'Main Archivist',
    type: 'person',
    properties: { role: 'curator', department: 'archives' },
    source_pi: PI_ROOT,
  },
  {
    canonical_id: `${PREFIX}org_archive`,
    code: `${PREFIX}org_archive`,
    label: 'National Archives',
    type: 'organization',
    properties: { founded: '1934', location: 'Washington DC' },
    source_pi: PI_ROOT,
  },

  // -------------------------------------------------------------------------
  // HISTORY PI entities - History collection (child of root)
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}person_historian`,
    code: `${PREFIX}person_historian`,
    label: 'History Professor',
    type: 'person',
    properties: { role: 'researcher', specialty: 'American history' },
    source_pi: PI_HISTORY,
  },
  {
    canonical_id: `${PREFIX}doc_constitution`,
    code: `${PREFIX}doc_constitution`,
    label: 'Constitution Document',
    type: 'document',
    properties: { year: '1787', pages: 4 },
    source_pi: PI_HISTORY,
  },
  {
    canonical_id: `${PREFIX}event_revolution`,
    code: `${PREFIX}event_revolution`,
    label: 'American Revolution',
    type: 'event',
    properties: { start: '1775', end: '1783' },
    source_pi: PI_HISTORY,
  },

  // -------------------------------------------------------------------------
  // CIVIL WAR PI entities - Civil War subcollection (grandchild of root)
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}person_lincoln`,
    code: `${PREFIX}person_lincoln`,
    label: 'Abraham Lincoln',
    type: 'person',
    properties: { role: 'President', term: '1861-1865' },
    source_pi: PI_CIVIL_WAR,
  },
  {
    canonical_id: `${PREFIX}person_grant`,
    code: `${PREFIX}person_grant`,
    label: 'Ulysses S. Grant',
    type: 'person',
    properties: { role: 'General', army: 'Union' },
    source_pi: PI_CIVIL_WAR,
  },
  {
    canonical_id: `${PREFIX}event_gettysburg`,
    code: `${PREFIX}event_gettysburg`,
    label: 'Battle of Gettysburg',
    type: 'event',
    properties: { date: '1863-07-01', duration: '3 days' },
    source_pi: PI_CIVIL_WAR,
  },
  {
    canonical_id: `${PREFIX}doc_emancipation`,
    code: `${PREFIX}doc_emancipation`,
    label: 'Emancipation Proclamation',
    type: 'document',
    properties: { year: '1863', author: 'Lincoln' },
    source_pi: PI_CIVIL_WAR,
  },
  {
    canonical_id: `${PREFIX}place_appomattox`,
    code: `${PREFIX}place_appomattox`,
    label: 'Appomattox Court House',
    type: 'place',
    properties: { state: 'Virginia', significance: 'Surrender site' },
    source_pi: PI_CIVIL_WAR,
  },

  // -------------------------------------------------------------------------
  // SCIENCE PI entities - Science collection (child of root, sibling to history)
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}person_scientist`,
    code: `${PREFIX}person_scientist`,
    label: 'Research Scientist',
    type: 'person',
    properties: { role: 'researcher', field: 'physics' },
    source_pi: PI_SCIENCE,
  },
  {
    canonical_id: `${PREFIX}doc_research`,
    code: `${PREFIX}doc_research`,
    label: 'Research Paper',
    type: 'document',
    properties: { year: '1950', topic: 'quantum mechanics' },
    source_pi: PI_SCIENCE,
  },
  {
    canonical_id: `${PREFIX}org_university`,
    code: `${PREFIX}org_university`,
    label: 'State University',
    type: 'organization',
    properties: { founded: '1850', type: 'educational' },
    source_pi: PI_SCIENCE,
  },
];

// ============================================================================
// RELATIONSHIPS - Each belongs to a specific PI
// ============================================================================

const relationships: Relationship[] = [
  // -------------------------------------------------------------------------
  // ROOT PI relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}person_archivist`,
    predicate: 'WORKS_AT',
    object_id: `${PREFIX}org_archive`,
    source_pi: PI_ROOT,
  },

  // -------------------------------------------------------------------------
  // HISTORY PI relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}person_historian`,
    predicate: 'STUDIES',
    object_id: `${PREFIX}doc_constitution`,
    source_pi: PI_HISTORY,
  },
  {
    subject_id: `${PREFIX}doc_constitution`,
    predicate: 'RESULTED_FROM',
    object_id: `${PREFIX}event_revolution`,
    source_pi: PI_HISTORY,
  },
  {
    subject_id: `${PREFIX}person_historian`,
    predicate: 'RESEARCHES',
    object_id: `${PREFIX}event_revolution`,
    source_pi: PI_HISTORY,
  },

  // -------------------------------------------------------------------------
  // CIVIL WAR PI relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}person_lincoln`,
    predicate: 'AUTHORED',
    object_id: `${PREFIX}doc_emancipation`,
    source_pi: PI_CIVIL_WAR,
  },
  {
    subject_id: `${PREFIX}person_lincoln`,
    predicate: 'COMMANDED',
    object_id: `${PREFIX}person_grant`,
    source_pi: PI_CIVIL_WAR,
  },
  {
    subject_id: `${PREFIX}person_grant`,
    predicate: 'FOUGHT_AT',
    object_id: `${PREFIX}event_gettysburg`,
    source_pi: PI_CIVIL_WAR,
  },
  {
    subject_id: `${PREFIX}event_gettysburg`,
    predicate: 'OCCURRED_AT',
    object_id: `${PREFIX}place_appomattox`,
    source_pi: PI_CIVIL_WAR,
  },

  // -------------------------------------------------------------------------
  // SCIENCE PI relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}person_scientist`,
    predicate: 'WROTE',
    object_id: `${PREFIX}doc_research`,
    source_pi: PI_SCIENCE,
  },
  {
    subject_id: `${PREFIX}person_scientist`,
    predicate: 'AFFILIATED_WITH',
    object_id: `${PREFIX}org_university`,
    source_pi: PI_SCIENCE,
  },

  // -------------------------------------------------------------------------
  // CROSS-PI relationships (from root PI, connecting things)
  // These test that relationship filtering works correctly
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}org_archive`,
    predicate: 'HOUSES',
    object_id: `${PREFIX}doc_constitution`,
    source_pi: PI_ROOT, // Root PI owns this relationship
  },
  {
    subject_id: `${PREFIX}org_archive`,
    predicate: 'HOUSES',
    object_id: `${PREFIX}doc_emancipation`,
    source_pi: PI_ROOT, // Root PI owns this relationship
  },
];

// ============================================================================
// Setup Functions
// ============================================================================

async function createPIs(): Promise<void> {
  console.log('\n🏷️  Creating PI nodes with lineage...\n');

  // Create root PI
  await fetch(`${GRAPHDB_URL}/pi/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pi: PI_ROOT }),
  });
  console.log(`   ✓ Created PI: ${PI_ROOT}`);

  // Create history PI as child of root
  await fetch(`${GRAPHDB_URL}/pi/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pi: PI_HISTORY, parent: PI_ROOT }),
  });
  console.log(`   ✓ Created PI: ${PI_HISTORY} (child of root)`);

  // Create civil war PI as child of history (grandchild of root)
  await fetch(`${GRAPHDB_URL}/pi/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pi: PI_CIVIL_WAR, parent: PI_HISTORY }),
  });
  console.log(`   ✓ Created PI: ${PI_CIVIL_WAR} (grandchild of root)`);

  // Create science PI as child of root (sibling to history)
  await fetch(`${GRAPHDB_URL}/pi/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pi: PI_SCIENCE, parent: PI_ROOT }),
  });
  console.log(`   ✓ Created PI: ${PI_SCIENCE} (child of root, sibling to history)`);
}

async function createEntities(): Promise<void> {
  console.log('\n📦 Creating entities in GraphDB...\n');

  const byPi: Record<string, number> = {};

  for (const entity of entities) {
    const response = await fetch(`${GRAPHDB_URL}/entity/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entity),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`   ❌ Failed to create ${entity.canonical_id}: ${error}`);
    } else {
      byPi[entity.source_pi] = (byPi[entity.source_pi] || 0) + 1;
      console.log(`   ✓ Created ${entity.label} (${entity.type}) in ${entity.source_pi}`);
    }
  }

  console.log('\n   Entity count by PI:');
  for (const [pi, count] of Object.entries(byPi)) {
    console.log(`     ${pi}: ${count} entities`);
  }
}

async function createRelationships(): Promise<void> {
  console.log('\n🔗 Creating relationships in GraphDB...\n');

  const byPi: Record<string, number> = {};

  for (const rel of relationships) {
    const response = await fetch(`${GRAPHDB_URL}/relationships/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relationships: [{ ...rel, properties: rel.properties || {} }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`   ❌ Failed: ${rel.subject_id} -[${rel.predicate}]-> ${rel.object_id}: ${error}`);
    } else {
      byPi[rel.source_pi] = (byPi[rel.source_pi] || 0) + 1;
    }
  }

  console.log(`   ✓ Created ${relationships.length} relationships`);
  console.log('\n   Relationship count by PI:');
  for (const [pi, count] of Object.entries(byPi)) {
    console.log(`     ${pi}: ${count} relationships`);
  }
}

async function embedAndUpsert(): Promise<void> {
  console.log('\n🧠 Embedding entities and upserting to Pinecone...\n');

  const texts = entities.map((e) => {
    const props = e.properties
      ? Object.entries(e.properties)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : '';
    return `${e.type}: ${e.label}${props ? ` | ${props}` : ''}`;
  });

  console.log(`   Embedding ${texts.length} entities...`);

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
  console.log(`   ✓ Got ${embeddings.length} embeddings`);

  // Upsert to Pinecone with correct source_pi per entity
  const vectors = entities.map((e, i) => ({
    id: e.canonical_id,
    values: embeddings[i],
    text: texts[i],
    metadata: {
      canonical_id: e.canonical_id,
      label: e.label,
      type: e.type,
      source_pi: e.source_pi, // Important: each entity has its own source_pi
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

async function verifyLineage(): Promise<void> {
  console.log('\n🔍 Verifying PI lineage structure...\n');

  // Test lineage from civil_war (should have ancestors: history, root)
  const response = await fetch(`${GRAPHDB_URL}/pi/lineage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourcePi: PI_CIVIL_WAR,
      direction: 'both',
      maxHops: 10,
    }),
  });

  if (!response.ok) {
    console.log('   ⚠️  Could not verify lineage (endpoint may not exist yet)');
    return;
  }

  const lineage = await response.json();
  console.log(`   Civil War PI lineage: ${JSON.stringify(lineage, null, 2)}`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('🧬 Setting up PI Lineage Test Data');
  console.log('='.repeat(70));
  console.log(`
PI Hierarchy:
  ${PI_ROOT}
      ├─► ${PI_HISTORY}
      │   └─► ${PI_CIVIL_WAR}
      └─► ${PI_SCIENCE}

Entities: ${entities.length}
  - Root PI: ${entities.filter((e) => e.source_pi === PI_ROOT).length}
  - History PI: ${entities.filter((e) => e.source_pi === PI_HISTORY).length}
  - Civil War PI: ${entities.filter((e) => e.source_pi === PI_CIVIL_WAR).length}
  - Science PI: ${entities.filter((e) => e.source_pi === PI_SCIENCE).length}

Relationships: ${relationships.length}
`);

  try {
    await createPIs();
    await createEntities();
    await createRelationships();
    await embedAndUpsert();
    await verifyLineage();

    console.log('\n' + '='.repeat(70));
    console.log('✅ Lineage test data setup complete!');
    console.log('='.repeat(70));
    console.log('\nRun tests with: npx tsx tests/test-lineage-queries.ts\n');
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
