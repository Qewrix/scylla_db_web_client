import { useState, useEffect } from 'react';
import { Database, Table, Play, ChevronRight, ChevronDown, Home, LogOut, RefreshCw, Edit2, Trash2, Check, X } from 'lucide-react';
import axios from 'axios';
import { Login } from './components/Login';
import { Signup } from './components/Signup';
import './index.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

interface SystemStats {
  total_keyspaces: number;
  total_tables: number;
  user_keyspaces: number;
  system_keyspaces: number;
  keyspaces: Array<{
    name: string;
    table_count: number;
    is_system: boolean;
  }>;
}

interface TableSchema {
  keyspace: string;
  table: string;
  columns: Array<{ name: string; type: string; kind: string }>;
  partition_keys: string[];
  clustering_keys: string[];
}

interface TableRow {
  [key: string]: any;
}

interface PaginatedData {
  rows: TableRow[];
  page_size: number;
  has_more: boolean;
  next_page_state: string | null;
  count: number;
}

function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [view, setView] = useState<'dashboard' | 'explorer'>('dashboard');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [keyspaces, setKeyspaces] = useState<string[]>([]);
  const [expandedKeyspaces, setExpandedKeyspaces] = useState<Set<string>>(new Set());
  const [tables, setTables] = useState<Record<string, string[]>>({});
  const [selectedTable, setSelectedTable] = useState<TableSchema | null>(null);
  const [tableData, setTableData] = useState<PaginatedData | null>(null);
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPageState, setCurrentPageState] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Row selection and edit state
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editingRow, setEditingRow] = useState<{ index: number; data: TableRow } | null>(null);
  const [editFormData, setEditFormData] = useState<TableRow>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Server-side filtering state (database queries)
  const [filterColumn, setFilterColumn] = useState<string>('');
  const [filterOperator, setFilterOperator] = useState<string>('=');
  const [filterValue, setFilterValue] = useState<string>('');
  const [queryLimit, setQueryLimit] = useState<number>(1000); // Max results to fetch

  // Client-side sorting state (sorts data already loaded in browser)
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');

  // Load auth token from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('scylla_auth_token');
    const savedUsername = localStorage.getItem('scylla_username');

    if (savedToken && savedUsername) {
      setUsername(savedUsername);
      setIsAuthenticated(true);
      setupAxiosInterceptor(savedToken);
    }
  }, []);

  const setupAxiosInterceptor = (authToken: string) => {
    axios.interceptors.request.use(config => {
      if (authToken) {
        config.headers['Authorization'] = `Bearer ${authToken}`;
      }
      return config;
    });
  };

  const fetchDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_BASE}/explorer/stats`);
      setStats(response.data);
      setView('dashboard');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchKeyspaces = async () => {
    try {
      const response = await axios.get(`${API_BASE}/explorer/keyspaces`);
      setKeyspaces(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const fetchTables = async (keyspace: string) => {
    try {
      const response = await axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables`);
      setTables(prev => ({ ...prev, [keyspace]: response.data }));
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const fetchTableData = async (keyspace: string, table: string, pageState: string | null = null, applyFilters: boolean = false) => {
    setLoading(true);
    setError(null);
    setSelectedRows(new Set());
    try {
      // Build query parameters
      const params: any = {
        page_size: Math.min(pageSize, queryLimit), // Don't exceed query limit
        page_state: pageState || undefined
      };

      let whereClause = '';

      // Build WHERE clause from filter UI if applying
      if (applyFilters && filterColumn && filterValue) {
        // Detect if value is a number (int or decimal)
        const isNumber = /^-?\d+(\.\d+)?$/.test(filterValue.trim());

        // Build WHERE clause based on operator
        if (filterOperator === 'CONTAINS') {
          // For CONTAINS, we need ALLOW FILTERING
          whereClause = `${filterColumn} LIKE '%${filterValue}%'`;
          params.allow_filtering = true;
        } else {
          // Quote the value only if it's not a number
          const quotedValue = isNumber ? filterValue : `'${filterValue}'`;
          whereClause = `${filterColumn} ${filterOperator} ${quotedValue}`;
        }

        params.where_clause = whereClause;
        params.allow_filtering = true; // Auto-enable for any filtering
      }

      // Build count params with same filters
      const countParams: any = {};
      if (whereClause) {
        countParams.where_clause = whereClause;
        countParams.allow_filtering = true; // Auto-enable for filtering
      }

      const [schemaRes, rowsRes, countRes] = await Promise.all([
        axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables/${table}`),
        axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables/${table}/rows`, { params }),
        axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables/${table}/count`, { params: countParams })
      ]);

      setSelectedTable(schemaRes.data);
      setTableData(rowsRes.data);
      setRowCount(countRes.data.estimated_count);
      setCurrentPageState(pageState);
      setView('explorer');
      setQueryResult(null);

      // Auto-populate CQL query with actual executed query
      let cqlQuery = rowsRes.data.query_executed || `SELECT * FROM ${keyspace}.${table}`;
      if (!cqlQuery.includes('LIMIT')) {
        cqlQuery += ` LIMIT ${Math.min(pageSize, queryLimit)}`;
      }
      cqlQuery += ';';
      setQuery(cqlQuery);

      // Reset filters for new table (but not when paginating or applying filters)
      if (!pageState && !applyFilters) {
        setFilterColumn('');
        setFilterOperator('=');
        setFilterValue('');
        setSortColumn('');
        setSortDirection('ASC');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleKeyspace = (keyspace: string) => {
    const newExpanded = new Set(expandedKeyspaces);
    if (newExpanded.has(keyspace)) {
      newExpanded.delete(keyspace);
    } else {
      newExpanded.add(keyspace);
      if (!tables[keyspace]) {
        fetchTables(keyspace);
      }
    }
    setExpandedKeyspaces(newExpanded);
  };

  const handleNextPage = () => {
    if (tableData?.next_page_state && selectedTable) {
      setPageHistory([...pageHistory, currentPageState || '']);
      // Reapply filters if any are active
      const hasFilters = Boolean(filterColumn && filterValue);
      fetchTableData(selectedTable.keyspace, selectedTable.table, tableData.next_page_state, hasFilters);
    }
  };

  const handlePreviousPage = () => {
    if (pageHistory.length > 0 && selectedTable) {
      const newHistory = [...pageHistory];
      const prevState = newHistory.pop() || null;
      setPageHistory(newHistory);
      // Reapply filters if any are active
      const hasFilters = Boolean(filterColumn && filterValue);
      fetchTableData(selectedTable.keyspace, selectedTable.table, prevState, hasFilters);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPageHistory([]);
    if (selectedTable) {
      fetchTableData(selectedTable.keyspace, selectedTable.table, null);
    }
  };

  const applyServerSideFilters = () => {
    if (selectedTable) {
      setPageHistory([]);
      fetchTableData(selectedTable.keyspace, selectedTable.table, null, true);
    }
  };

  const clearServerSideFilters = () => {
    setFilterColumn('');
    setFilterOperator('=');
    setFilterValue('');
    setSortColumn('');
    setSortDirection('ASC');
    if (selectedTable) {
      setPageHistory([]);
      fetchTableData(selectedTable.keyspace, selectedTable.table, null, false);
    }
  };


  // Client-side sorting - sorts data already loaded in the browser
  const handleColumnSort = (columnName: string) => {
    if (sortColumn === columnName) {
      // Toggle sort direction if clicking the same column
      setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC');
    } else {
      // New column - sort ascending
      setSortColumn(columnName);
      setSortDirection('ASC');
    }
  };

  // Get sorted table data for display
  const getSortedTableData = (): TableRow[] => {
    if (!tableData || !sortColumn) return tableData?.rows || [];

    const sorted = [...tableData.rows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Try to parse as numbers if possible
      const aNum = Number(aVal);
      const bNum = Number(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        // Numeric sort
        return sortDirection === 'ASC' ? aNum - bNum : bNum - aNum;
      } else {
        // String sort
        const comparison = String(aVal).localeCompare(String(bVal));
        return sortDirection === 'ASC' ? comparison : -comparison;
      }
    });

    return sorted;
  };

  // Row selection handlers
  const toggleSelectAll = () => {
    if (selectedRows.size === tableData?.rows.length) {
      setSelectedRows(new Set());
    } else {
      const allIndices = new Set((tableData?.rows || []).map((_, idx) => idx));
      setSelectedRows(allIndices);
    }
  };

  const toggleRowSelection = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const deleteSelectedRows = async () => {
    if (!selectedTable || selectedRows.size === 0) return;

    setLoading(true);
    setError(null);
    setShowDeleteConfirm(false);
    try {
      const rowsToDelete = Array.from(selectedRows).map(idx => tableData!.rows[idx]);
      const primaryKeys = [...selectedTable.partition_keys, ...selectedTable.clustering_keys];

      const deletePayload = rowsToDelete.map(row => {
        const pk: Record<string, any> = {};
        primaryKeys.forEach(key => {
          pk[key] = row[key];
        });
        return pk;
      });

      await axios.delete(`${API_BASE}/explorer/keyspaces/${selectedTable.keyspace}/tables/${selectedTable.table}/rows`, {
        data: { rows: deletePayload }
      });

      // Refresh table data
      setSelectedRows(new Set());
      await fetchTableData(selectedTable.keyspace, selectedTable.table, currentPageState);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEditRow = (index: number) => {
    const row = getSortedTableData()[index];
    setEditingRow({ index, data: row });
    setEditFormData({ ...row });
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditFormData({});
  };

  const updateEditFormField = (field: string, value: string) => {
    setEditFormData({ ...editFormData, [field]: value });
  };

  const saveEditRow = async () => {
    if (!selectedTable || !editingRow) return;

    setLoading(true);
    setError(null);
    try {
      const primaryKeys = [...selectedTable.partition_keys, ...selectedTable.clustering_keys];
      const pk: Record<string, any> = {};
      primaryKeys.forEach(key => {
        pk[key] = editingRow.data[key];
      });

      const updates: Record<string, any> = {};
      Object.keys(editFormData).forEach(key => {
        if (!primaryKeys.includes(key) && editFormData[key] !== editingRow.data[key]) {
          updates[key] = editFormData[key];
        }
      });

      if (Object.keys(updates).length === 0) {
        setError('No changes detected');
        return;
      }

      await axios.put(`${API_BASE}/explorer/keyspaces/${selectedTable.keyspace}/tables/${selectedTable.table}/rows`, {
        primary_key: pk,
        updates
      });

      // Refresh table data
      cancelEdit();
      await fetchTableData(selectedTable.keyspace, selectedTable.table, currentPageState);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const executeQuery = async () => {
    setLoading(true);
    setError(null);
    setQueryResult(null);
    try {
      const response = await axios.post(`${API_BASE}/query/execute`, { cql: query });
      setQueryResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Authentication handlers
  const handleLogin = (authToken: string, user: string) => {
    setUsername(user);
    setIsAuthenticated(true);
    localStorage.setItem('scylla_auth_token', authToken);
    localStorage.setItem('scylla_username', user);
    setupAxiosInterceptor(authToken);
    fetchDashboardStats();
    fetchKeyspaces();
  };

  const handleLogout = () => {
    setUsername('');
    setIsAuthenticated(false);
    localStorage.removeItem('scylla_auth_token');
    localStorage.removeItem('scylla_username');
    setView('dashboard');
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardStats();
      fetchKeyspaces();
    }
  }, [isAuthenticated]);

  // Show login/signup if not authenticated
  if (!isAuthenticated) {
    if (authView === 'login') {
      return <Login onLogin={handleLogin} onSwitchToSignup={() => setAuthView('signup')} />;
    } else {
      return <Signup onSignup={handleLogin} onSwitchToLogin={() => setAuthView('login')} />;
    }
  }


  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            Scylla DB Client
          </h1>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">@{username}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 font-medium"
              title="Logout"
            >
              <LogOut className="w-3 h-3" />
              Logout
            </button>
          </div>
        </div>

        <div className="p-2">
          <button
            onClick={fetchDashboardStats}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 rounded mb-2"
          >
            <Home className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-gray-700">Dashboard</span>
          </button>

          {/* User Keyspaces */}
          {keyspaces.filter(ks => !ks.startsWith('system')).map(keyspace => (
            <div key={keyspace}>
              <button
                onClick={() => toggleKeyspace(keyspace)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 rounded"
              >
                {expandedKeyspaces.has(keyspace) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Database className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-gray-700 truncate" title={keyspace}>{keyspace}</span>
              </button>
              {expandedKeyspaces.has(keyspace) && tables[keyspace] && (
                <div className="ml-6">
                  {tables[keyspace].map(table => (
                    <button
                      key={table}
                      onClick={() => fetchTableData(keyspace, table)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 rounded"
                    >
                      <Table className="w-4 h-4 text-green-600" />
                      <span className="text-gray-600 truncate" title={table}>{table}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* System Keyspaces - Separator */}
          {keyspaces.filter(ks => ks.startsWith('system')).length > 0 && (
            <>
              <div className="border-t border-gray-200 my-2"></div>
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">
                System Keyspaces
              </div>
            </>
          )}

          {/* System Keyspaces */}
          {keyspaces.filter(ks => ks.startsWith('system')).map(keyspace => (
            <div key={keyspace}>
              <button
                onClick={() => toggleKeyspace(keyspace)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 rounded"
              >
                {expandedKeyspaces.has(keyspace) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Database className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-500 truncate" title={keyspace}>{keyspace}</span>
              </button>
              {expandedKeyspaces.has(keyspace) && tables[keyspace] && (
                <div className="ml-6">
                  {tables[keyspace].map(table => (
                    <button
                      key={table}
                      onClick={() => fetchTableData(keyspace, table)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 rounded"
                    >
                      <Table className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-500 truncate" title={table}>{table}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Query Editor */}
        <div className="border-b border-gray-200 bg-white p-4">
          <div className="flex gap-2">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter CQL query..."
              className="flex-1 p-3 border border-gray-300 rounded font-mono text-sm resize-none"
              rows={3}
            />
            <button
              onClick={executeQuery}
              disabled={loading || !query}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Execute
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-4">
              {error}
            </div>
          )}

          {loading && (
            <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" />
              Loading...
            </div>
          )}

          {/* Dashboard View */}
          {view === 'dashboard' && stats && !loading && (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">System Overview</h2>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                  <div className="text-3xl font-bold text-blue-600">{stats.total_keyspaces}</div>
                  <div className="text-gray-600 text-sm">Total Keyspaces</div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                  <div className="text-3xl font-bold text-green-600">{stats.total_tables}</div>
                  <div className="text-gray-600 text-sm">Total Tables</div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                  <div className="text-3xl font-bold text-purple-600">{stats.user_keyspaces}</div>
                  <div className="text-gray-600 text-sm">User Keyspaces</div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                  <div className="text-3xl font-bold text-gray-600">{stats.system_keyspaces}</div>
                  <div className="text-gray-600 text-sm">System Keyspaces</div>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-800 mb-4">Application Keyspaces</h3>
              <div className="grid grid-cols-3 gap-4">
                {stats.keyspaces.filter(ks => !ks.is_system).map(ks => (
                  <div
                    key={ks.name}
                    className="bg-white p-4 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      toggleKeyspace(ks.name);
                      setView('explorer');
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="w-5 h-5 text-blue-600" />
                      <span className="font-semibold text-gray-800">{ks.name}</span>
                    </div>
                    <div className="text-sm text-gray-600">{ks.table_count} tables</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Query Results */}
          {queryResult && !loading && (
            <div className="bg-white rounded border border-gray-200 p-4 mb-4">
              <h3 className="font-semibold text-gray-700 mb-2">Query Result</h3>
              {queryResult.type === 'select' && queryResult.rows && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {queryResult.columns.map((col: string) => (
                          <th key={col} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {queryResult.rows.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          {queryResult.columns.map((col: string) => (
                            <td key={col} className="px-4 py-2 whitespace-nowrap text-gray-700">
                              {row[col]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {queryResult.type === 'modification' && (
                <p className="text-green-600">{queryResult.message}</p>
              )}
            </div>
          )}

          {/* Table View */}
          {view === 'explorer' && selectedTable && tableData && !queryResult && !loading && (
            <div className="bg-white rounded border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  {selectedTable.keyspace}.{selectedTable.table}
                  {rowCount !== null && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({rowCount.toLocaleString()} rows)
                    </span>
                  )}
                </h2>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Schema</h3>
                <div className="space-y-1">
                  {selectedTable.columns.map(col => (
                    <div key={col.name} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-blue-600">{col.name}</span>
                      <span className="text-gray-500">{col.type}</span>
                      {col.kind === 'partition_key' && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">PK</span>
                      )}
                      {col.kind === 'clustering' && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">CK</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Firebase-Style Filters */}
              <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span>🔍</span>
                  Filters (Database-Level)
                </h3>
                <div className="space-y-3">
                  {/* Filter Row */}
                  <div className="flex gap-2 items-center">
                    <select
                      value={filterColumn}
                      onChange={(e) => setFilterColumn(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 rounded bg-white"
                    >
                      <option value="">Select column...</option>
                      {selectedTable.columns.map(col => (
                        <option key={col.name} value={col.name}>{col.name}</option>
                      ))}
                    </select>

                    <select
                      value={filterOperator}
                      onChange={(e) => setFilterOperator(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 rounded bg-white"
                      disabled={!filterColumn}
                    >
                      <option value="=">=</option>
                      <option value="!=">!=</option>
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<=">&lt;=</option>
                      <option value="CONTAINS">contains</option>
                    </select>

                    <input
                      type="text"
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      placeholder="Value..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded"
                      disabled={!filterColumn}
                    />
                  </div>


                  {/* Query Limit */}
                  <div className="flex gap-2 items-center justify-between">
                    <div className="flex gap-2 items-center">
                      <label className="text-sm text-gray-700 font-medium">Max results:</label>
                      <input
                        type="number"
                        value={queryLimit}
                        onChange={(e) => setQueryLimit(Math.max(1, parseInt(e.target.value) || 1000))}
                        min="1"
                        max="1000000"
                        className="w-32 px-3 py-2 text-sm border border-gray-300 rounded"
                        placeholder="Max results..."
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={applyServerSideFilters}
                        disabled={!filterColumn || !filterValue}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Apply Filter
                      </button>
                      <button
                        onClick={clearServerSideFilters}
                        className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    💡 Tip: Filter by partition keys for best performance. Click column headers to sort loaded data.
                  </p>
                </div>
              </div>

              {tableData.rows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-medium text-gray-600">
                        Data (showing {tableData.count} of {rowCount?.toLocaleString() || '?'} total rows)
                      </h3>
                      {rowCount && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          Page {pageHistory.length + 1} / {Math.ceil(rowCount / pageSize)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handlePreviousPage}
                        disabled={pageHistory.length === 0}
                        className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={handleNextPage}
                        disabled={!tableData.has_more}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  {/* Bulk Actions Toolbar */}
                  {selectedRows.size > 0 && (
                    <div className="bg-blue-50 p-2 mb-2 rounded flex items-center justify-between border border-blue-100">
                      <span className="text-sm text-blue-700 font-medium">
                        {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
                      </span>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete Selected
                      </button>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-10">
                            <input
                              type="checkbox"
                              checked={tableData.rows.length > 0 && selectedRows.size === tableData.rows.length}
                              onChange={toggleSelectAll}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          {selectedTable.columns.map(col => (
                            <th
                              key={col.name}
                              onClick={() => handleColumnSort(col.name)}
                              className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                            >
                              <div className="flex items-center gap-1">
                                {col.name}
                                {sortColumn === col.name && (
                                  <span className="text-blue-600 font-bold">
                                    {sortDirection === 'ASC' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {getSortedTableData().map((row, idx) => (
                          <tr key={idx} className={`hover:bg-gray-50 ${selectedRows.has(idx) ? 'bg-blue-50' : ''}`}>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(idx)}
                                onChange={() => toggleRowSelection(idx)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            {selectedTable.columns.map(col => (
                              <td key={col.name} className="px-4 py-2 whitespace-nowrap text-gray-700">
                                {row[col.name]}
                              </td>
                            ))}
                            <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => startEditRow(idx)}
                                className="text-blue-600 hover:text-blue-900 mr-3"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Rows</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>

              <p className="text-gray-700 mb-6">
                Are you sure you want to delete <strong>{selectedRows.size}</strong> row{selectedRows.size !== 1 ? 's' : ''}?
                This will permanently remove {selectedRows.size !== 1 ? 'them' : 'it'} from the database.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteSelectedRows}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete {selectedRows.size !== 1 ? 'Rows' : 'Row'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Row Modal */}
      {editingRow && selectedTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Edit Row</h3>
              <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                {selectedTable.columns.map(col => {
                  const isPrimaryKey = selectedTable.partition_keys.includes(col.name) ||
                    selectedTable.clustering_keys.includes(col.name);

                  return (
                    <div key={col.name}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {col.name}
                        {isPrimaryKey && <span className="text-xs text-blue-600 ml-2">(Primary Key)</span>}
                        <span className="text-xs text-gray-500 ml-2">({col.type})</span>
                      </label>
                      <input
                        type="text"
                        value={editFormData[col.name] || ''}
                        onChange={(e) => updateEditFormField(col.name, e.target.value)}
                        disabled={isPrimaryKey}
                        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${isPrimaryKey ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'
                          }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={cancelEdit}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEditRow}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}

export default App;
