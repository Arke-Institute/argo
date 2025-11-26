/**
 * Teardown test data for Argo path query tests
 *
 * Removes all entities with the argo_test_ prefix
 */

const GRAPHDB_URL = 'https://graphdb-gateway.arke.institute';
const PINECONE_URL = 'https://pinecone-gateway.arke.institute';

const PREFIX = 'argo_test_';

// List of test entity IDs (must match setup-test-data.ts)
const testEntityIds = [
  `${PREFIX}george_washington`,
  `${PREFIX}thomas_jefferson`,
  `${PREFIX}date_1732_02_22`,
  `${PREFIX}date_1743_04_13`,
  `${PREFIX}date_1781_10_19`,
  `${PREFIX}mount_vernon`,
  `${PREFIX}continental_congress`,
  `${PREFIX}declaration`,
  `${PREFIX}battle_yorktown`,
];

async function deleteFromGraphDB(): Promise<void> {
  console.log('\n🗑️  Deleting entities from GraphDB...\n');

  for (const id of testEntityIds) {
    const response = await fetch(`${GRAPHDB_URL}/entity/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`   ❌ Failed to delete ${id}: ${error}`);
    } else {
      const result = await response.json() as { deleted?: boolean };
      if (result.deleted) {
        console.log(`   ✓ Deleted ${id}`);
      } else {
        console.log(`   - ${id} (not found)`);
      }
    }
  }
}

async function deleteFromPinecone(): Promise<void> {
  console.log('\n🗑️  Deleting vectors from Pinecone...\n');

  // Pinecone delete by IDs
  const response = await fetch(`${PINECONE_URL}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: testEntityIds }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`   ❌ Failed to delete from Pinecone: ${error}`);
  } else {
    console.log(`   ✓ Deleted ${testEntityIds.length} vectors from Pinecone`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🧹 Tearing down Argo test data');
  console.log('='.repeat(60));

  try {
    await deleteFromGraphDB();
    await deleteFromPinecone();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Teardown complete!');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('\n❌ Teardown failed:', error);
    process.exit(1);
  }
}

main();
