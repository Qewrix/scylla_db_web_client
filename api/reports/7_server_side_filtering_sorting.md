# Report 7: Server-Side Filtering and Sorting

**Date**: 2025-11-25  
**Model**: Claude 3.5 Sonnet (Thinking)  
**Feature**: Database-Level Query Building

## Objective
Implement true database-level filtering and sorting that works across all data, not just the current page.

## Implementation Details

### Backend Changes
**Enhanced `/explorer/keyspaces/{keyspace}/tables/{table}/rows` endpoint:**
- **New Parameters**:
  - `where_clause`: SQL WHERE conditions (e.g., `country_id = 'US'`)
  - `order_by`: ORDER BY clause (e.g., `created_at DESC`)
  - `allow_filtering`: Boolean flag to append ALLOW FILTERING
- **Query Building**: Dynamically constructs CQL queries with filters/sorting
- **Returns**: Actual executed query in response for transparency

### Frontend Changes

**Dual Filtering System:**

1. **Server-Side (Database-Level)**
   - WHERE clause input for filtering
   - ORDER BY input for sorting
   - ALLOW FILTERING checkbox
   - Apply/Clear buttons
   - Warning about performance implications

2. **Client-Side (Quick Filter)**
   - Renamed to "Quick filter (current page only)"
   - Filters only displayed rows
   - No database hit, instant results

### Query Examples

**Filter by column:**
```
WHERE country_id = 'US'
```

**Filter with multiple conditions:**
```
WHERE country_id = 'US' AND created_at > '2024-01-01'
```

**Sort results:**
```
ORDER BY created_at DESC
```

**Combined:**
```
WHERE post_id = 'abc123'
ORDER BY created_at DESC
[x] ALLOW FILTERING
```

## User Experience

**Server-Side Filters Section:**
- Appears above table schema
- Clear inputs for WHERE and ORDER BY
- Checkbox for ALLOW FILTERING
- Warning message about performance
- Visual feedback when filters are active

**CQL Auto-Population:**
- Query box now shows the ACTUAL executed query
- Includes WHERE, ORDER BY, ALLOW FILTERING
- Educational - shows valid CQL syntax
- Can copy/modify and re-execute

## Technical Considerations

### ScyllaDB Limitations
1. **WHERE clauses** require:
   - Partition key equality, OR
   - Clustering column range queries, OR
   - ALLOW FILTERING (can be slow)

2. **ORDER BY** requires:
   - Must be on clustering columns
   - Must match clustering order
   - Otherwise requires ALLOW FILTERING

3. **ALLOW FILTERING**:
   - Scans entire table
   - Use with caution on large tables
   - We warn users in the UI

### Benefits
- ✅ Filter/sort across ALL data, not just current page
- ✅ Proper pagination with filters applied
- ✅ Educational - teaches CQL syntax
- ✅ Flexible - users can build complex queries
- ✅ Transparent - shows executed query

### Safety Features
- Performance warning displayed
- ALLOW FILTERING is opt-in
- Error messages show CQL errors
- Quick filter still available for simple searches

## Code Example

**Backend:**
```python
query = f"SELECT * FROM {keyspace}.{table}"
if where_clause:
    query += f" WHERE {where_clause}"
if order_by:
    query += f" ORDER BY {order_by}"
if allow_filtering:
    query += " ALLOW FILTERING"
```

**Frontend:**
```typescript
const applyServerSideFilters = () => {
  fetchTableData(keyspace, table, null, true); // Pass filters to backend
};
```
