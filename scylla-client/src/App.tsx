import { useState, useEffect } from 'react';
import { Database, Table, Play, ChevronRight, ChevronDown, Home, Key, RefreshCw } from 'lucide-react';
import axios from 'axios';
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
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
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

  // Client-side sorting state (for current page)
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Server-side filtering and sorting state (database queries)
  const [whereClause, setWhereClause] = useState<string>('');
  const [orderBy, setOrderBy] = useState<string>('');
  const [allowFiltering, setAllowFiltering] = useState<boolean>(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('scylla_api_key');
    const envKey = import.meta.env.VITE_API_KEY;

    if (savedKey) {
      setApiKey(savedKey);
      setupAxiosInterceptor(savedKey);
    } else if (envKey) {
      setApiKey(envKey);
      setupAxiosInterceptor(envKey);
      localStorage.setItem('scylla_api_key', envKey);
    } else {
      setShowApiKeyInput(true);
    }
  }, []);

  const setupAxiosInterceptor = (key: string) => {
    axios.interceptors.request.use(config => {
      if (key) {
        config.headers['X-API-Key'] = key;
      }
      return config;
    });
  };

  const handleSetApiKey = () => {
    localStorage.setItem('scylla_api_key', apiKey);
    setupAxiosInterceptor(apiKey);
    setShowApiKeyInput(false);
    fetchDashboardStats();
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
    try {
      // Build query parameters
      const params: any = {
        page_size: pageSize,
        page_state: pageState || undefined
      };

      // Add server-side filters if applying
      if (applyFilters) {
        if (whereClause) params.where_clause = whereClause;
        if (orderBy) params.order_by = orderBy;
        if (allowFiltering) params.allow_filtering = true;
      }

      const [schemaRes, rowsRes, countRes] = await Promise.all([
        axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables/${table}`),
        axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables/${table}/rows`, { params }),
        axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables/${table}/count`)
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
        cqlQuery += ` LIMIT ${pageSize}`;
      }
      cqlQuery += ';';
      setQuery(cqlQuery);

      // Reset server-side filters for new table
      if (!pageState && !applyFilters) {
        setWhereClause('');
        setOrderBy('');
        setAllowFiltering(false);
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
      fetchTableData(selectedTable.keyspace, selectedTable.table, tableData.next_page_state);
    }
  };

  const handlePreviousPage = () => {
    if (pageHistory.length > 0 && selectedTable) {
      const newHistory = [...pageHistory];
      const prevState = newHistory.pop() || null;
      setPageHistory(newHistory);
      fetchTableData(selectedTable.keyspace, selectedTable.table, prevState);
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
    setWhereClause('');
    setOrderBy('');
    setAllowFiltering(false);
    if (selectedTable) {
      setPageHistory([]);
      fetchTableData(selectedTable.keyspace, selectedTable.table, null, false);
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

  useEffect(() => {
    if (apiKey && !showApiKeyInput) {
      fetchDashboardStats();
      fetchKeyspaces();
    }
  }, [apiKey, showApiKeyInput]);

  if (showApiKeyInput) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-96">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-800">API Key Required</h2>
          </div>
          <p className="text-gray-600 mb-4">Enter your API key to access ScyllaDB</p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key..."
            className="w-full p-3 border border-gray-300 rounded mb-4"
            onKeyPress={(e) => e.key === 'Enter' && handleSetApiKey()}
          />
          <button
            onClick={handleSetApiKey}
            className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700"
          >
            Connect
          </button>
          <p className="text-xs text-gray-500 mt-4">Leave empty if authentication is disabled</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            ScyllaDB Client
          </h1>
          <button
            onClick={() => setShowApiKeyInput(true)}
            className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <Key className="w-3 h-3" />
            Change API Key
          </button>
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
                <span className="font-medium text-gray-700 truncate">{keyspace}</span>
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
                      <span className="text-gray-600 truncate">{table}</span>
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
                <span className="font-medium text-gray-500 truncate">{keyspace}</span>
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
                      <span className="text-gray-500 truncate">{table}</span>
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

              <h3 className="text-lg font-semibold text-gray-800 mb-4">Keyspaces</h3>
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

              {tableData.rows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-600">
                      Data (showing {tableData.count} of {rowCount?.toLocaleString() || '?'} total rows)
                    </h3>
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
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {selectedTable.columns.map(col => (
                            <th
                              key={col.name}
                              className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                            >
                              {col.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {tableData.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            {selectedTable.columns.map(col => (
                              <td key={col.name} className="px-4 py-2 whitespace-nowrap text-gray-700">
                                {row[col.name]}
                              </td>
                            ))}
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
    </div >
  );
}

export default App;
