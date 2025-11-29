/**
 * Setup realistic test data based on Drexel University Historical Collection
 *
 * Source: https://www.arke.institute/01KA1H51YC3PWXKYNDNM566E0P
 *
 * This test dataset replicates a real-world archival collection:
 * - 19th-century homeopathic medicine records
 * - Case studies with patients, symptoms, treatments
 * - Academic/administrative documents
 * - Multiple authors, institutions, geographic locations
 *
 * All test IDs contain "drexel_test" to enable automatic cleanup.
 *
 * Graph structure:
 *
 *   drexel_university (organization)
 *       └─[published]─────────► historical_collection (document)
 *                                    ├─[includes_subject]──► homeopathy, case_studies, etc. (concepts)
 *                                    ├─[associated_place]──► allentown, surinam, germany (places)
 *                                    └─[contains]──────────► correspondence_journal (publication)
 *
 *   nra_academy (organization)
 *       ├─[located_in]────────► allentau (place)
 *       └─[published]─────────► correspondence_journal (publication)
 *
 *   c_hering (person)
 *       ├─[authored]──────────► spigelia_discussion (document)
 *       ├─[authored]──────────► archival_note (document)
 *       └─[affiliated_with]───► nra_academy (organization)
 *
 *   f_romig (person)
 *       └─[authored]──────────► case_64 (document)
 *                                    ├─[patient]────────► patient_64 (person)
 *                                    ├─[treated_with]───► spigelia (concept)
 *                                    └─[documents_symptom]──► severe_headache, eye_inflammation (symptoms)
 *
 *   j_walter (person)
 *       └─[authored]──────────► case_65 (document)
 *                                    ├─[patient]────────► patient_65 (person)
 *                                    └─[treated_with]───► spigelia (concept)
 *
 *   letter_faculty_conduct (document)
 *       ├─[concerns]──────────► faculty_conduct, diploma_signing (concepts)
 *       └─[written_at]────────► st_college (place)
 */

const GRAPHDB_URL = 'https://graphdb-gateway.arke.institute';
const EMBEDDING_URL = 'https://embedding-worker.arke.institute';
const PINECONE_URL = 'https://pinecone-gateway.arke.institute';

const TEST_PI = 'drexel_test_pi_001';
const PREFIX = 'drexel_test_';

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
// ENTITIES - Based on Drexel Collection
// ============================================================================

const entities: Entity[] = [
  // -------------------------------------------------------------------------
  // Organizations
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}drexel_university`,
    code: `${PREFIX}drexel_university`,
    label: 'Drexel University',
    type: 'organization',
    properties: {
      type: 'University',
      location: 'Philadelphia, Pennsylvania',
    },
  },
  {
    canonical_id: `${PREFIX}nra_academy`,
    code: `${PREFIX}nra_academy`,
    label: 'N. A. Akademie der homöopathischen Heilkunst',
    type: 'organization',
    properties: {
      full_name: 'North American Academy of Homeopathic Medicine',
      founded: '1835',
      focus: 'homeopathic education',
    },
  },

  // -------------------------------------------------------------------------
  // People - Authors, Editors, Contributors
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}c_hering`,
    code: `${PREFIX}c_hering`,
    label: 'Constantine Hering',
    type: 'person',
    properties: {
      role: 'author, physician',
      specialty: 'homeopathy',
      known_for: 'Father of American Homeopathy',
    },
  },
  {
    canonical_id: `${PREFIX}c_zering`,
    code: `${PREFIX}c_zering`,
    label: 'C. Zering',
    type: 'person',
    properties: { role: 'editor' },
  },
  {
    canonical_id: `${PREFIX}f_romig`,
    code: `${PREFIX}f_romig`,
    label: 'F. Romig',
    type: 'person',
    properties: { role: 'author, physician' },
  },
  {
    canonical_id: `${PREFIX}g_h_bute`,
    code: `${PREFIX}g_h_bute`,
    label: 'G. H. Bute',
    type: 'person',
    properties: { role: 'contributor' },
  },
  {
    canonical_id: `${PREFIX}j_walter`,
    code: `${PREFIX}j_walter`,
    label: 'J. Walter',
    type: 'person',
    properties: { role: 'author, physician' },
  },

  // -------------------------------------------------------------------------
  // People - Patients (anonymized case studies)
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}patient_64`,
    code: `${PREFIX}patient_64`,
    label: 'Patient 64',
    type: 'person',
    properties: {
      age: 25,
      temperament: 'choleric-sanguine',
      case_number: 64,
    },
  },
  {
    canonical_id: `${PREFIX}patient_65`,
    code: `${PREFIX}patient_65`,
    label: 'Patient 65',
    type: 'person',
    properties: {
      case_number: 65,
      condition: 'eye disease',
    },
  },
  {
    canonical_id: `${PREFIX}patient_76`,
    code: `${PREFIX}patient_76`,
    label: 'Patient 76',
    type: 'person',
    properties: {
      case_number: 76,
      condition: 'oral swelling',
    },
  },

  // -------------------------------------------------------------------------
  // Places
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}allentau`,
    code: `${PREFIX}allentau`,
    label: 'Allentau',
    type: 'place',
    properties: {
      full_name: 'Allentown, Pennsylvania, USA',
      state: 'Pennsylvania',
      country: 'United States',
    },
  },
  {
    canonical_id: `${PREFIX}surinam`,
    code: `${PREFIX}surinam`,
    label: 'Surinam',
    type: 'place',
    properties: {
      full_name: 'Suriname',
      region: 'South America',
    },
  },
  {
    canonical_id: `${PREFIX}germany`,
    code: `${PREFIX}germany`,
    label: 'Germany',
    type: 'place',
    properties: {
      full_name: 'Germany',
      region: 'Europe',
    },
  },
  {
    canonical_id: `${PREFIX}st_college`,
    code: `${PREFIX}st_college`,
    label: 'St. College Building',
    type: 'place',
    properties: {
      description: 'Building within Drexel University campus',
    },
  },
  {
    canonical_id: `${PREFIX}philadelphia`,
    code: `${PREFIX}philadelphia`,
    label: 'Philadelphia',
    type: 'place',
    properties: {
      full_name: 'Philadelphia, Pennsylvania, USA',
      state: 'Pennsylvania',
      country: 'United States',
    },
  },

  // -------------------------------------------------------------------------
  // Dates
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}date_1836_03_19`,
    code: `${PREFIX}date_1836_03_19`,
    label: 'March 19, 1836',
    type: 'date',
    properties: { iso_date: '1836-03-19' },
  },
  {
    canonical_id: `${PREFIX}date_1835`,
    code: `${PREFIX}date_1835`,
    label: '1835',
    type: 'date',
    properties: { year: 1835 },
  },

  // -------------------------------------------------------------------------
  // Concepts - Medical
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}homeopathy`,
    code: `${PREFIX}homeopathy`,
    label: 'Homeopathy',
    type: 'concept',
    properties: {
      description: 'System of alternative medicine based on the principle of like cures like',
      category: 'medical practice',
    },
  },
  {
    canonical_id: `${PREFIX}spigelia`,
    code: `${PREFIX}spigelia`,
    label: 'Spigelia',
    type: 'concept',
    properties: {
      description: 'Homeopathic remedy derived from pinkroot plant',
      category: 'homeopathic remedy',
      uses: 'headaches, eye pain, heart conditions',
    },
  },
  {
    canonical_id: `${PREFIX}medical_correspondence`,
    code: `${PREFIX}medical_correspondence`,
    label: 'Medical Correspondence',
    type: 'concept',
    properties: {
      description: 'Exchange of letters and reports concerning medical cases',
    },
  },
  {
    canonical_id: `${PREFIX}case_studies`,
    code: `${PREFIX}case_studies`,
    label: 'Case Studies',
    type: 'concept',
    properties: {
      description: 'Detailed examinations of individual medical patients',
    },
  },
  {
    canonical_id: `${PREFIX}medical_treatments`,
    code: `${PREFIX}medical_treatments`,
    label: 'Medical Treatments',
    type: 'concept',
    properties: {
      description: 'Therapies applied to treat diseases',
    },
  },

  // -------------------------------------------------------------------------
  // Concepts - Symptoms
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}severe_headache`,
    code: `${PREFIX}severe_headache`,
    label: 'Severe Headache',
    type: 'symptom',
    properties: {
      description: 'Intense head pain',
      location: 'head',
    },
  },
  {
    canonical_id: `${PREFIX}eye_inflammation`,
    code: `${PREFIX}eye_inflammation`,
    label: 'Eye Inflammation',
    type: 'symptom',
    properties: {
      description: 'Inflamed left eye with pain',
      location: 'eye',
    },
  },
  {
    canonical_id: `${PREFIX}nasal_congestion`,
    code: `${PREFIX}nasal_congestion`,
    label: 'Nasal Congestion',
    type: 'symptom',
    properties: {
      description: 'Blocked nasal passages',
      location: 'nose',
    },
  },
  {
    canonical_id: `${PREFIX}pterygium`,
    code: `${PREFIX}pterygium`,
    label: 'Pterygium',
    type: 'symptom',
    properties: {
      description: 'Flap-like growth on the eye',
      location: 'eye',
    },
  },
  {
    canonical_id: `${PREFIX}oral_swelling`,
    code: `${PREFIX}oral_swelling`,
    label: 'Oral Swelling',
    type: 'symptom',
    properties: {
      description: 'Swelling in the mouth area with difficulty opening',
      location: 'mouth',
    },
  },

  // -------------------------------------------------------------------------
  // Concepts - Academic/Administrative
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}faculty_conduct`,
    code: `${PREFIX}faculty_conduct`,
    label: 'Faculty Conduct',
    type: 'concept',
    properties: {
      description: 'Standards and expectations for university faculty behavior',
    },
  },
  {
    canonical_id: `${PREFIX}diploma_signing`,
    code: `${PREFIX}diploma_signing`,
    label: 'Diploma Signing',
    type: 'concept',
    properties: {
      description: 'Official endorsement of academic degrees',
    },
  },
  {
    canonical_id: `${PREFIX}academic_policies`,
    code: `${PREFIX}academic_policies`,
    label: 'Academic Policies',
    type: 'concept',
    properties: {
      description: 'Regulations governing university operations',
    },
  },
  {
    canonical_id: `${PREFIX}resolutions`,
    code: `${PREFIX}resolutions`,
    label: 'Resolutions',
    type: 'concept',
    properties: {
      description: 'Formal decisions adopted by an academic body',
    },
  },

  // -------------------------------------------------------------------------
  // Documents - Collection level
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}historical_collection`,
    code: `${PREFIX}historical_collection`,
    label: 'Drexel University Historical Collection',
    type: 'document',
    properties: {
      title: 'Drexel University Historical Collection',
      description:
        'A collection of historical documents including medical correspondence, case studies, and administrative letters',
      language: 'en, de',
      rights: 'Public domain',
    },
  },

  // -------------------------------------------------------------------------
  // Documents - Publications
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}correspondence_journal`,
    code: `${PREFIX}correspondence_journal`,
    label: 'Correspondenzblatt der homöopathischen Aerzte',
    type: 'publication',
    properties: {
      title: 'Correspondenzblatt der homöopathischen Aerzte',
      language: 'de',
      issue: 'No. 6',
      focus: 'homeopathy',
    },
  },

  // -------------------------------------------------------------------------
  // Documents - Case Reports
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}case_64`,
    code: `${PREFIX}case_64`,
    label: 'Case Report 64',
    type: 'document',
    properties: {
      case_number: 64,
      outcome: 'recovery after Spigelia X treatment',
      description: 'Patient with severe headache and eye inflammation treated with Spigelia',
    },
  },
  {
    canonical_id: `${PREFIX}case_65`,
    code: `${PREFIX}case_65`,
    label: 'Case Report 65',
    type: 'document',
    properties: {
      case_number: 65,
      outcome: 'symptom relief',
      description: 'Patient with pterygium and eye pain treated with Spigelia',
    },
  },
  {
    canonical_id: `${PREFIX}case_76`,
    code: `${PREFIX}case_76`,
    label: 'Case Report 76',
    type: 'document',
    properties: {
      case_number: 76,
      outcome: 'partial relief',
      description: 'Patient with oral swelling and difficulty opening mouth',
    },
  },

  // -------------------------------------------------------------------------
  // Documents - Other
  // -------------------------------------------------------------------------
  {
    canonical_id: `${PREFIX}spigelia_discussion`,
    code: `${PREFIX}spigelia_discussion`,
    label: 'Discussion on Spigelia',
    type: 'document',
    properties: {
      title: 'Advocacy for Spigelia Research',
      content: 'Discussion of Spigelia varieties including anthelmintic and Marylandica',
    },
  },
  {
    canonical_id: `${PREFIX}archival_note`,
    code: `${PREFIX}archival_note`,
    label: 'Archival Note on Distribution',
    type: 'document',
    properties: {
      title: 'Proposal for Archive Distribution',
      content: 'Proposal for systematic distribution of homeopathic experience archives to practitioners',
    },
  },
  {
    canonical_id: `${PREFIX}letter_faculty_conduct`,
    code: `${PREFIX}letter_faculty_conduct`,
    label: 'Letter Regarding Faculty Conduct',
    type: 'document',
    properties: {
      title: 'Letter regarding faculty conduct and diploma signing',
      language: 'en',
      description:
        'Handwritten letter expressing concerns about faculty misconduct and refusing to sign invalid diplomas',
    },
  },
];

// ============================================================================
// RELATIONSHIPS - Based on Drexel Collection
// ============================================================================

const relationships: Relationship[] = [
  // -------------------------------------------------------------------------
  // Organization relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}drexel_university`,
    predicate: 'PUBLISHED',
    object_id: `${PREFIX}historical_collection`,
  },
  {
    subject_id: `${PREFIX}drexel_university`,
    predicate: 'LOCATED_IN',
    object_id: `${PREFIX}philadelphia`,
  },
  {
    subject_id: `${PREFIX}nra_academy`,
    predicate: 'LOCATED_IN',
    object_id: `${PREFIX}allentau`,
  },
  {
    subject_id: `${PREFIX}nra_academy`,
    predicate: 'PUBLISHED',
    object_id: `${PREFIX}correspondence_journal`,
  },
  {
    subject_id: `${PREFIX}nra_academy`,
    predicate: 'FOUNDED_ON',
    object_id: `${PREFIX}date_1835`,
  },
  {
    subject_id: `${PREFIX}nra_academy`,
    predicate: 'FOCUSES_ON',
    object_id: `${PREFIX}homeopathy`,
  },

  // -------------------------------------------------------------------------
  // Collection structure
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'CONTAINS',
    object_id: `${PREFIX}correspondence_journal`,
  },
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'CONTAINS',
    object_id: `${PREFIX}letter_faculty_conduct`,
  },
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'CREATED_ON',
    object_id: `${PREFIX}date_1836_03_19`,
  },

  // Collection subjects
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'INCLUDES_SUBJECT',
    object_id: `${PREFIX}homeopathy`,
  },
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'INCLUDES_SUBJECT',
    object_id: `${PREFIX}medical_correspondence`,
  },
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'INCLUDES_SUBJECT',
    object_id: `${PREFIX}case_studies`,
  },
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'INCLUDES_SUBJECT',
    object_id: `${PREFIX}faculty_conduct`,
  },
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'INCLUDES_SUBJECT',
    object_id: `${PREFIX}diploma_signing`,
  },

  // Collection places
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'ASSOCIATED_PLACE',
    object_id: `${PREFIX}allentau`,
  },
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'ASSOCIATED_PLACE',
    object_id: `${PREFIX}surinam`,
  },
  {
    subject_id: `${PREFIX}historical_collection`,
    predicate: 'ASSOCIATED_PLACE',
    object_id: `${PREFIX}germany`,
  },

  // -------------------------------------------------------------------------
  // Journal structure
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}correspondence_journal`,
    predicate: 'CONTAINS',
    object_id: `${PREFIX}case_64`,
  },
  {
    subject_id: `${PREFIX}correspondence_journal`,
    predicate: 'CONTAINS',
    object_id: `${PREFIX}case_65`,
  },
  {
    subject_id: `${PREFIX}correspondence_journal`,
    predicate: 'CONTAINS',
    object_id: `${PREFIX}case_76`,
  },
  {
    subject_id: `${PREFIX}correspondence_journal`,
    predicate: 'CONTAINS',
    object_id: `${PREFIX}spigelia_discussion`,
  },
  {
    subject_id: `${PREFIX}correspondence_journal`,
    predicate: 'CONTAINS',
    object_id: `${PREFIX}archival_note`,
  },
  {
    subject_id: `${PREFIX}correspondence_journal`,
    predicate: 'PUBLISHED_ON',
    object_id: `${PREFIX}date_1836_03_19`,
  },

  // Journal geographic coverage
  {
    subject_id: `${PREFIX}correspondence_journal`,
    predicate: 'INCLUDES_CASES_FROM',
    object_id: `${PREFIX}allentau`,
  },
  {
    subject_id: `${PREFIX}correspondence_journal`,
    predicate: 'INCLUDES_CASES_FROM',
    object_id: `${PREFIX}surinam`,
  },
  {
    subject_id: `${PREFIX}correspondence_journal`,
    predicate: 'INCLUDES_CASES_FROM',
    object_id: `${PREFIX}germany`,
  },

  // -------------------------------------------------------------------------
  // Person - Authorship relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}c_zering`,
    predicate: 'EDITED',
    object_id: `${PREFIX}correspondence_journal`,
  },
  {
    subject_id: `${PREFIX}c_hering`,
    predicate: 'AUTHORED',
    object_id: `${PREFIX}spigelia_discussion`,
  },
  {
    subject_id: `${PREFIX}c_hering`,
    predicate: 'AUTHORED',
    object_id: `${PREFIX}archival_note`,
  },
  {
    subject_id: `${PREFIX}g_h_bute`,
    predicate: 'COAUTHORED',
    object_id: `${PREFIX}archival_note`,
  },
  {
    subject_id: `${PREFIX}f_romig`,
    predicate: 'AUTHORED',
    object_id: `${PREFIX}case_64`,
  },
  {
    subject_id: `${PREFIX}j_walter`,
    predicate: 'AUTHORED',
    object_id: `${PREFIX}case_65`,
  },

  // Person - Organization affiliations
  {
    subject_id: `${PREFIX}c_hering`,
    predicate: 'AFFILIATED_WITH',
    object_id: `${PREFIX}nra_academy`,
  },
  {
    subject_id: `${PREFIX}f_romig`,
    predicate: 'AFFILIATED_WITH',
    object_id: `${PREFIX}nra_academy`,
  },
  {
    subject_id: `${PREFIX}j_walter`,
    predicate: 'AFFILIATED_WITH',
    object_id: `${PREFIX}nra_academy`,
  },
  {
    subject_id: `${PREFIX}c_zering`,
    predicate: 'AFFILIATED_WITH',
    object_id: `${PREFIX}nra_academy`,
  },
  {
    subject_id: `${PREFIX}g_h_bute`,
    predicate: 'AFFILIATED_WITH',
    object_id: `${PREFIX}nra_academy`,
  },

  // Person - Expertise
  {
    subject_id: `${PREFIX}c_hering`,
    predicate: 'EXPERT_IN',
    object_id: `${PREFIX}homeopathy`,
  },
  {
    subject_id: `${PREFIX}c_hering`,
    predicate: 'RESEARCHED',
    object_id: `${PREFIX}spigelia`,
  },

  // -------------------------------------------------------------------------
  // Case Report relationships
  // -------------------------------------------------------------------------
  // Case 64
  {
    subject_id: `${PREFIX}case_64`,
    predicate: 'PATIENT',
    object_id: `${PREFIX}patient_64`,
  },
  {
    subject_id: `${PREFIX}case_64`,
    predicate: 'TREATED_WITH',
    object_id: `${PREFIX}spigelia`,
  },
  {
    subject_id: `${PREFIX}case_64`,
    predicate: 'DOCUMENTS_SYMPTOM',
    object_id: `${PREFIX}severe_headache`,
  },
  {
    subject_id: `${PREFIX}case_64`,
    predicate: 'DOCUMENTS_SYMPTOM',
    object_id: `${PREFIX}eye_inflammation`,
  },
  {
    subject_id: `${PREFIX}case_64`,
    predicate: 'DOCUMENTS_SYMPTOM',
    object_id: `${PREFIX}nasal_congestion`,
  },

  // Case 65
  {
    subject_id: `${PREFIX}case_65`,
    predicate: 'PATIENT',
    object_id: `${PREFIX}patient_65`,
  },
  {
    subject_id: `${PREFIX}case_65`,
    predicate: 'TREATED_WITH',
    object_id: `${PREFIX}spigelia`,
  },
  {
    subject_id: `${PREFIX}case_65`,
    predicate: 'DOCUMENTS_SYMPTOM',
    object_id: `${PREFIX}eye_inflammation`,
  },
  {
    subject_id: `${PREFIX}case_65`,
    predicate: 'DOCUMENTS_SYMPTOM',
    object_id: `${PREFIX}pterygium`,
  },

  // Case 76
  {
    subject_id: `${PREFIX}case_76`,
    predicate: 'PATIENT',
    object_id: `${PREFIX}patient_76`,
  },
  {
    subject_id: `${PREFIX}case_76`,
    predicate: 'TREATED_WITH',
    object_id: `${PREFIX}spigelia`,
  },
  {
    subject_id: `${PREFIX}case_76`,
    predicate: 'DOCUMENTS_SYMPTOM',
    object_id: `${PREFIX}oral_swelling`,
  },

  // -------------------------------------------------------------------------
  // Faculty letter relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}letter_faculty_conduct`,
    predicate: 'CONCERNS',
    object_id: `${PREFIX}faculty_conduct`,
  },
  {
    subject_id: `${PREFIX}letter_faculty_conduct`,
    predicate: 'CONCERNS',
    object_id: `${PREFIX}diploma_signing`,
  },
  {
    subject_id: `${PREFIX}letter_faculty_conduct`,
    predicate: 'CONCERNS',
    object_id: `${PREFIX}academic_policies`,
  },
  {
    subject_id: `${PREFIX}letter_faculty_conduct`,
    predicate: 'CONCERNS',
    object_id: `${PREFIX}resolutions`,
  },
  {
    subject_id: `${PREFIX}letter_faculty_conduct`,
    predicate: 'WRITTEN_AT',
    object_id: `${PREFIX}st_college`,
  },
  {
    subject_id: `${PREFIX}st_college`,
    predicate: 'PART_OF',
    object_id: `${PREFIX}drexel_university`,
  },

  // -------------------------------------------------------------------------
  // Place hierarchies
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}allentau`,
    predicate: 'NEAR',
    object_id: `${PREFIX}philadelphia`,
  },

  // -------------------------------------------------------------------------
  // Concept relationships
  // -------------------------------------------------------------------------
  {
    subject_id: `${PREFIX}spigelia`,
    predicate: 'USED_FOR',
    object_id: `${PREFIX}severe_headache`,
  },
  {
    subject_id: `${PREFIX}spigelia`,
    predicate: 'USED_FOR',
    object_id: `${PREFIX}eye_inflammation`,
  },
  {
    subject_id: `${PREFIX}spigelia`,
    predicate: 'PART_OF',
    object_id: `${PREFIX}homeopathy`,
  },
  {
    subject_id: `${PREFIX}case_studies`,
    predicate: 'PART_OF',
    object_id: `${PREFIX}medical_correspondence`,
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
      } else {
        updated++;
      }
      // Only log every 10th entity to reduce noise
      if ((created + updated) % 10 === 0) {
        console.log(`   ... processed ${created + updated}/${entities.length} entities`);
      }
    }
  }

  console.log(`   ✓ Created ${created} new entities, updated ${updated} existing`);
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
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : '';
    return `${e.type}: ${e.label}${props ? ` | ${props}` : ''}`;
  });

  console.log(`   Embedding ${texts.length} entities...`);

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

  // Upsert to Pinecone in batches
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
  console.log('🏛️  Setting up Drexel University Historical Collection Test Data');
  console.log('='.repeat(70));
  console.log(`\nEntities: ${entities.length}`);
  console.log(`Relationships: ${relationships.length}`);

  try {
    await createTestPI();
    await createEntities();
    await createRelationships();
    await embedAndUpsert();

    console.log('\n' + '='.repeat(70));
    console.log('✅ Drexel test data setup complete!');
    console.log('='.repeat(70));
    console.log('\nTest entities created with prefix: ' + PREFIX);
    console.log('Run tests with: npx tsx tests/test-drexel-queries.ts');
    console.log('Clean up with: npm run test:teardown\n');
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
