# Drexel Collection Test Analysis Report

## Overview

This report documents the testing of the Argo path query engine against a realistic dataset based on the **Drexel University Historical Collection** (https://www.arke.institute/01KA1H51YC3PWXKYNDNM566E0P).

The collection represents 19th-century archival materials including:
- Homeopathic medical case studies
- Academic/administrative correspondence
- Multiple authors, institutions, and geographic locations

## Test Dataset

### Entities Created: 39
| Type | Count | Examples |
|------|-------|----------|
| person | 10 | C. Hering, F. Romig, Patient 64 |
| document | 8 | Case Report 64, Letter Faculty Conduct |
| concept | 12 | Homeopathy, Spigelia, Faculty Conduct |
| symptom | 5 | Severe Headache, Eye Inflammation |
| place | 5 | Allentau, Surinam, Germany |
| organization | 2 | Drexel University, NRA Academy |
| publication | 1 | Correspondenzblatt |
| date | 2 | March 19, 1836 |

### Relationships Created: 62
Including: AUTHORED, AFFILIATED_WITH, TREATED_WITH, DOCUMENTS_SYMPTOM, INCLUDES_SUBJECT, LOCATED_IN, CONTAINS, etc.

## Test Results Summary

**Overall: 29/29 passed (100%)**

*After implementing zero-hop queries and fixing test direction issues.*

| Category | Pass Rate | Notes |
|----------|-----------|-------|
| Semantic Entry | 3/3 (100%) | Including zero-hop queries |
| Expert Discovery | 3/3 (100%) | Multi-hop author/affiliation queries work well |
| Geographic | 3/3 (100%) | Place-based provenance queries reliable |
| Symptom-Treatment | 3/3 (100%) | Medical relationship traversal works |
| Institution | 3/3 (100%) | Organization queries work perfectly |
| Multi-hop | 3/3 (100%) | 2-3 hop traversals successful |
| Variable Depth | 2/2 (100%) | Direction-aware queries |
| Semantic Filter | 2/2 (100%) | Combined type + semantic filtering works |
| Cross-domain | 1/1 (100%) | Can query across medical/administrative domains |
| Edge Cases | 3/3 (100%) | Fuzzy matching, bidirectional traversal work |
| Natural Language | 3/3 (100%) | Semantic entry points effective |

---

## Issues Identified and Resolved

### Issue 1: Semantic Search - Physician vs Patient Disambiguation

**Original Query:**
```
"physician doctor medical author" -[*]-> type:person
```

**Problem:** Edge traversal with `type:person` filter returned patients instead of physicians because both are persons in medical context.

**Solution Implemented:** Zero-hop queries with direct type filtering.

**Correct Query:**
```
"physician doctor author homeopathy" type:person
```

This new syntax performs semantic search first, then filters by type WITHOUT edge traversal, allowing the semantic ranking to properly distinguish physicians (who have "author, physician" in their properties) from patients.

**Result:** Physicians (c_hering, j_walter, f_romig) now rank at the top.

---

### Issue 2: Variable Depth - Direction Sensitivity

**Original Query:**
```
@drexel_test_spigelia -[*]{1,2}-> type:document
```

**Problem:** Spigelia has no OUTGOING relationships to documents. Case reports point TO Spigelia (`case -[TREATED_WITH]-> spigelia`), not the other way around.

**Correct Query:**
```
@drexel_test_spigelia <-[*]{1,2}- type:document
```

**Lesson:** Users must understand relationship direction. This is inherent to directed graph queries.

**Potential Future Enhancement:** Bidirectional wildcard `-[*]-` to traverse both directions when direction is unknown.

---

## What Works Well

### 1. Fuzzy Relation Matching
The query `@drexel_test_c_hering -[works_at, employed_by, member_of, affiliated, associated]-> type:organization` successfully matched against `AFFILIATED_WITH` relationship despite none of those exact terms being used. The fuzzy matching is effective.

### 2. Multi-hop Traversal
Complex queries like:
```
@drexel_test_allentau <-[located_in]- type:organization <-[affiliated_with]- type:person
```
Successfully traversed: place ← organization ← person (3 entities, 2 hops)

### 3. Semantic + Type Filtering
```
"faculty academic university" -[*]-> type:document ~ "diploma conduct policy"
```
Found the relevant administrative letter by combining semantic entry, type filter, and semantic ranking.

### 4. Geographic Provenance
Queries about document origins work reliably:
- "Cases from Pennsylvania" → Correspondence Journal
- "Documents from Surinam" → Correspondence Journal

### 5. Symptom-Treatment Discovery
Medical queries work well:
- "What treats headaches?" → Spigelia
- "Cases with eye problems" → Case 64, Case 65
- "Patients treated for oral swelling" → Patient 76

---

## Recommendations

### High Priority
1. **Property-based filtering**: Add support for `type:person[role=physician]` to distinguish entities by properties
2. **Bidirectional wildcards**: Allow `-[*]-` for direction-agnostic traversal
3. **Query diagnostics**: When queries return empty, provide hints about available relationship directions

### Medium Priority
4. **Relationship-aware embeddings**: Include relationship context in vector representations
5. **Query suggestions**: Based on graph structure, suggest alternative query forms
6. **Confidence scores**: Show why certain entities ranked higher than others

### Low Priority
7. **Natural language interface**: Convert questions directly to structured queries
8. **Graph visualization**: Help users understand relationship directions

---

## Test Files

- `tests/setup-drexel-test-data.ts` - Creates the test dataset
- `tests/test-drexel-queries.ts` - 29 test cases across 11 categories
- Run with: `ARGO_URL=https://argo.arke.institute npx tsx tests/test-drexel-queries.ts`

---

## Conclusion

The Argo query engine achieves **100% pass rate** on the Drexel test suite after implementing zero-hop queries.

**Key capabilities:**
1. **Zero-hop queries**: Find entities directly by semantic similarity + type filter without edge traversal
2. **Multi-hop traversal**: Complex relationship chains work reliably
3. **Fuzzy relation matching**: Flexible edge matching across different terminology
4. **Combined filters**: Type filtering with semantic re-ranking

**Remaining considerations:**
- **Direction sensitivity**: Users must understand relationship direction (though zero-hop queries help when direction is unknown)
- **Bidirectional wildcard**: A future `-[*]-` syntax could help when direction is truly unknown

For archival research use cases, the system is highly effective for:
- Finding entities by description (zero-hop queries)
- Tracing provenance and relationships (multi-hop traversal)
- Expert discovery and institutional connections
- Cross-domain queries spanning different content types
