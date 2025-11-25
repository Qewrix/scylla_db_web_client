from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any

from database import get_session
from auth import get_api_key

router = APIRouter(prefix="/explorer", tags=["explorer"])


@router.get("/stats")
async def get_system_stats(api_key: str = Depends(get_api_key)) -> Dict[str, Any]:
    """Get system-wide statistics."""
    session = get_session()
    try:
        # Get all keyspaces
        keyspaces_result = session.execute(
            "SELECT keyspace_name FROM system_schema.keyspaces"
        )
        all_keyspaces = [row.keyspace_name for row in keyspaces_result]
        
        # System keyspaces start with 'system'
        system_keyspaces = [ks for ks in all_keyspaces if ks.startswith('system')]
        user_keyspaces = [ks for ks in all_keyspaces if not ks.startswith('system')]
        
        # Get table counts for each keyspace
        keyspace_stats = []
        total_tables = 0
        
        for ks in all_keyspaces:
            tables_result = session.execute(
                "SELECT table_name FROM system_schema.tables WHERE keyspace_name = %s",
                [ks]
            )
            table_count = len(list(tables_result))
            total_tables += table_count
            
            keyspace_stats.append({
                "name": ks,
                "table_count": table_count,
                "is_system": ks.startswith('system')
            })
        
        # Sort by table count (descending) and name
        keyspace_stats.sort(key=lambda x: (-x['table_count'], x['name']))
        
        return {
            "total_keyspaces": len(all_keyspaces),
            "total_tables": total_tables,
            "user_keyspaces": len(user_keyspaces),
            "system_keyspaces": len(system_keyspaces),
            "keyspaces": keyspace_stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keyspaces")
async def list_keyspaces(api_key: str = Depends(get_api_key)) -> List[str]:
    """List all keyspaces in the cluster."""
    session = get_session()
    try:
        result = session.execute(
            "SELECT keyspace_name FROM system_schema.keyspaces"
        )
        keyspaces = [row.keyspace_name for row in result]
        return sorted(keyspaces)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keyspaces/{keyspace}/tables")
async def list_tables(keyspace: str, api_key: str = Depends(get_api_key)) -> List[str]:
    """List all tables in a keyspace."""
    session = get_session()
    try:
        result = session.execute(
            "SELECT table_name FROM system_schema.tables WHERE keyspace_name = %s",
            [keyspace]
        )
        tables = [row.table_name for row in result]
        return sorted(tables)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keyspaces/{keyspace}/tables/{table}")
async def get_table_schema(keyspace: str, table: str, api_key: str = Depends(get_api_key)) -> Dict[str, Any]:
    """Get schema information for a specific table."""
    session = get_session()
    try:
        # Get column information
        columns_result = session.execute(
            """
            SELECT column_name, type, kind
            FROM system_schema.columns
            WHERE keyspace_name = %s AND table_name = %s
            """,
            [keyspace, table]
        )
        
        columns = []
        partition_keys = []
        clustering_keys = []
        
        for row in columns_result:
            col_info = {
                "name": row.column_name,
                "type": row.type,
                "kind": row.kind
            }
            columns.append(col_info)
            
            if row.kind == "partition_key":
                partition_keys.append(row.column_name)
            elif row.kind == "clustering":
                clustering_keys.append(row.column_name)
        
        return {
            "keyspace": keyspace,
            "table": table,
            "columns": columns,
            "partition_keys": partition_keys,
            "clustering_keys": clustering_keys
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keyspaces/{keyspace}/tables/{table}/rows")
async def get_table_rows(
    keyspace: str,
    table: str,
    page_size: int = 100,
    page_state: str = None,
    api_key: str = Depends(get_api_key)
) -> Dict[str, Any]:
    """Get rows from a table with pagination support."""
    session = get_session()
    try:
        # Validate page_size
        if page_size not in [20, 50, 100]:
            page_size = 100
        
        query = f"SELECT * FROM {keyspace}.{table}"
        
        # Prepare statement for pagination
        statement = session.prepare(query)
        statement.fetch_size = page_size
        
        # Execute with page state if provided
        if page_state:
            import base64
            decoded_state = base64.b64decode(page_state)
            result = session.execute(statement, paging_state=decoded_state)
        else:
            result = session.execute(statement)
        
        # Convert rows to list of dicts
        rows = []
        for row in result.current_rows:
            row_dict = {}
            for key in row._fields:
                value = getattr(row, key)
                # Convert non-serializable types to strings
                row_dict[key] = str(value) if value is not None else None
            rows.append(row_dict)
        
        # Get next page state
        next_page_state = None
        if result.paging_state:
            import base64
            next_page_state = base64.b64encode(result.paging_state).decode('utf-8')
        
        return {
            "keyspace": keyspace,
            "table": table,
            "rows": rows,
            "page_size": page_size,
            "has_more": result.has_more_pages,
            "next_page_state": next_page_state,
            "count": len(rows)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keyspaces/{keyspace}/tables/{table}/count")
async def get_table_count(keyspace: str, table: str, api_key: str = Depends(get_api_key)) -> Dict[str, Any]:
    """Estimate the row count for a table."""
    session = get_session()
    try:
        # Try to get estimate from system tables
        count_query = f"SELECT COUNT(*) FROM {keyspace}.{table}"
        result = session.execute(count_query)
        count = result.one()[0] if result else 0
        
        return {
            "keyspace": keyspace,
            "table": table,
            "estimated_count": count,
            "is_estimate": False
        }
    except Exception as e:
        # If COUNT fails, return unknown
        return {
            "keyspace": keyspace,
            "table": table,
            "estimated_count": 0,
            "is_estimate": True,
            "error": str(e)
        }
