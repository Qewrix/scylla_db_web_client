from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any

from database import get_session

router = APIRouter(prefix="/explorer", tags=["explorer"])


@router.get("/keyspaces")
async def list_keyspaces() -> List[str]:
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
async def list_tables(keyspace: str) -> List[str]:
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
async def get_table_schema(keyspace: str, table: str) -> Dict[str, Any]:
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
    limit: int = 100
) -> Dict[str, Any]:
    """Get rows from a table with pagination."""
    session = get_session()
    try:
        query = f"SELECT * FROM {keyspace}.{table} LIMIT {limit}"
        result = session.execute(query)
        
        # Convert rows to list of dicts
        rows = []
        for row in result:
            row_dict = {}
            for key in row._fields:
                value = getattr(row, key)
                # Convert non-serializable types to strings
                row_dict[key] = str(value) if value is not None else None
            rows.append(row_dict)
        
        return {
            "keyspace": keyspace,
            "table": table,
            "rows": rows,
            "count": len(rows)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
