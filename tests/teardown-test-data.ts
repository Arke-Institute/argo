/**
 * Teardown test data for Argo path query tests
 *
 * Uses /admin/clear-test-data to remove all nodes containing "test" in their IDs.
 * This follows the TESTING.md convention for safe, automatic cleanup.
 */

const GRAPHDB_URL = 'https://graphdb-gateway.arke.institute';
const PINECONE_URL = 'https://pinecone-gateway.arke.institute';

const PREFIX = 'argo_test_';

// List of test entity IDs for Pinecone cleanup (vectors require explicit IDs)
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
  console.log('\n🗑️  Clearing test data from GraphDB...\n');

  const response = await fetch(`${GRAPHDB_URL}/admin/clear-test-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`   ❌ Failed to clear test data: ${error}`);
  } else {
    const result = await response.json() as { deleted?: number; message?: string };
    console.log(`   ✓ Cleared test data from GraphDB`);
    if (result.deleted !== undefined) {
      console.log(`     Deleted ${result.deleted} nodes`);
    }
  }
}

async function deleteFromPinecone(): Promise<void> {
  console.log('\n🗑️  Deleting vectors from Pinecone...\n');

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
