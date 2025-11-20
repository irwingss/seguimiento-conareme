import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Upload, FileText, AlertCircle, CheckCircle, Users, TrendingUp, AlertTriangle, Filter, Square, CheckSquare, RefreshCw, Settings, LayoutDashboard, Table as TableIcon } from 'lucide-react';

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1zJZ5m-AVmiz1UHrAJCwKrLI0gW3aR04n/export?format=csv';

export default function TeachingGapDashboard() {
  const [rawData, setRawData] = useState([]);
  const [data, setData] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' or 'table'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Configuración
  const [targetPercentage, setTargetPercentage] = useState(10);
  const [reglabFilter, setReglabFilter] = useState([]);

  // Obtener la lista única de regímenes laborales
  const uniqueRegLabs = useMemo(() => {
    if (rawData.length === 0) return [];
    const regimes = new Set();
    rawData.forEach(row => {
      if (row['REGLAB_UNIFICADO']) {
        regimes.add(row['REGLAB_UNIFICADO']);
      }
    });
    return Array.from(regimes).sort();
  }, [rawData]);

  // Effect para recalcular los datos
  useEffect(() => {
    if (rawData.length > 0) {
      const filteredData = reglabFilter.length === 0 || reglabFilter.length === uniqueRegLabs.length
        ? rawData
        : rawData.filter(row => reglabFilter.includes(row['REGLAB_UNIFICADO']));

      processData(filteredData, targetPercentage);
    } else {
      setData([]);
    }
  }, [rawData, reglabFilter, uniqueRegLabs, targetPercentage]);

  const handleReglabFilterChange = (reglab) => {
    if (reglab === 'ALL') {
      if (reglabFilter.length === uniqueRegLabs.length) {
        setReglabFilter([]);
      } else {
        setReglabFilter(uniqueRegLabs);
      }
    } else {
      if (reglabFilter.includes(reglab)) {
        setReglabFilter(reglabFilter.filter(r => r !== reglab));
      } else {
        setReglabFilter([...reglabFilter, reglab]);
      }
    }
  };

  const detectDelimiter = (text) => {
    const firstLine = text.split('\n')[0];
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;

    if (tabs > commas && tabs > semicolons) return '\t';
    if (semicolons > commas) return ';';
    return ',';
  };

  const parseCSVLine = (text, delimiter) => {
    const result = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(cell);
        cell = '';
      } else {
        cell += char;
      }
    }
    result.push(cell);
    return result;
  };

  const processCSVText = (text, sourceName) => {
    try {
      const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');

      if (lines.length < 2) {
        throw new Error("El archivo parece estar vacío o no tiene datos suficientes.");
      }

      const delimiter = detectDelimiter(text);
      const headers = parseCSVLine(lines[0], delimiter).map(h =>
        h.trim().replace(/^"|"$/g, '').replace(/^\uFEFF/, '')
      );

      const requiredCols = ['GRUPO_ESP_SUBESP', 'CAPACIT_DOC_UNIFICADO', 'REGLAB_UNIFICADO'];
      const missingCols = requiredCols.filter(col => !headers.includes(col));

      if (missingCols.length > 0) {
        throw new Error(`Faltan columnas requeridas: ${missingCols.join(', ')}`);
      }

      const parsedData = [];
      for (let i = 1; i < lines.length; i++) {
        const currentLine = parseCSVLine(lines[i], delimiter);
        if (currentLine.length > 1) {
          const obj = {};
          headers.forEach((header, index) => {
            let val = currentLine[index] || '';
            val = val.trim().replace(/^"|"$/g, '');
            obj[header] = val;
          });
          parsedData.push(obj);
        }
      }

      if (parsedData.length === 0) {
        throw new Error("No se pudieron extraer datos válidos.");
      }

      setRawData(parsedData);
      setFileName(sourceName);
      setReglabFilter([]);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error al procesar los datos.");
      setRawData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchGoogleSheetData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(GOOGLE_SHEET_CSV_URL);
      if (!response.ok) throw new Error(`Error HTTP: ${response.statusText}`);
      const text = await response.text();
      processCSVText(text, 'Google Sheets (Automático)');
    } catch (err) {
      console.error(err);
      setError(`Error de conexión: ${err.message}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoogleSheetData();
  }, []);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.match(/\.(csv|txt)$/i)) {
      setError("Solo se permiten archivos .csv");
      return;
    }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => processCSVText(e.target.result, file.name);
    reader.onerror = () => { setError("Error al leer archivo"); setLoading(false); };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const processData = (currentData, targetPctVal) => {
    const grouped = currentData.reduce((acc, row) => {
      const grupo = row['GRUPO_ESP_SUBESP'];
      const capacitadoRaw = row['CAPACIT_DOC_UNIFICADO'];
      if (!grupo) return acc;

      if (!acc[grupo]) {
        acc[grupo] = { grupo, totalPersonal: 0, capacitados: 0 };
      }

      acc[grupo].totalPersonal += 1;
      if (capacitadoRaw && capacitadoRaw.trim() !== '' && capacitadoRaw !== 'NULL') {
        acc[grupo].capacitados += 1;
      }
      return acc;
    }, {});

    const metrics = Object.values(grouped).map(item => {
      const targetPct = targetPctVal / 100;
      const targetCount = Math.ceil(item.totalPersonal * targetPct);
      const currentPct = (item.capacitados / item.totalPersonal) * 100;
      const gapHeadcount = Math.max(0, targetCount - item.capacitados);
      const isMet = item.capacitados >= targetCount;

      return {
        ...item,
        targetCount,
        percentage: parseFloat(currentPct.toFixed(1)),
        gap: gapHeadcount,
        status: isMet ? 'Cumple' : 'Brecha',
        targetPercentage: targetPctVal
      };
    });

    metrics.sort((a, b) => b.gap - a.gap || a.percentage - b.percentage);
    setData(metrics);
  };

  const summary = useMemo(() => {
    if (data.length === 0) return null;
    const totalStaff = data.reduce((sum, item) => sum + item.totalPersonal, 0);
    const totalTrained = data.reduce((sum, item) => sum + item.capacitados, 0);
    const totalGap = data.reduce((sum, item) => sum + item.gap, 0);
    const groupsMet = data.filter(item => item.status === 'Cumple').length;
    const groupsTotal = data.length;

    let filterName = 'TODOS';
    if (reglabFilter.length > 0 && reglabFilter.length < uniqueRegLabs.length) {
      filterName = reglabFilter.join(', ');
    }

    return { totalStaff, totalTrained, totalGap, groupsMet, groupsTotal, filterName };
  }, [data, reglabFilter, uniqueRegLabs]);

  const isAllSelected = reglabFilter.length === uniqueRegLabs.length;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-sm p-3 border border-slate-200 shadow-xl rounded-lg text-xs z-50">
          <p className="font-bold text-slate-800 mb-1">{d.grupo}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-slate-500">Personal:</span> <span className="font-medium text-right">{d.totalPersonal}</span>
            <span className="text-slate-500">Capacitados:</span> <span className="font-medium text-blue-600 text-right">{d.capacitados} ({d.percentage}%)</span>
            <span className="text-slate-500">Meta ({targetPercentage}%):</span> <span className="font-medium text-right">{d.targetCount}</span>
            <span className="text-slate-500">Estado:</span>
            <span className={`font-bold text-right ${d.gap > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {d.gap > 0 ? `Faltan ${d.gap}` : 'Cumple'}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // --- RENDER ---

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden text-slate-800">

      {/* Top Bar: Header + Global Controls */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex-shrink-0 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-slate-900">Dashboard de Brechas</h1>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              {loading ? <span className="animate-pulse">Sincronizando...</span> : fileName}
              {rawData.length > 0 && <span className="bg-slate-100 px-1.5 rounded text-slate-600 font-medium">{rawData.length} reg.</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Threshold Slider */}
          <div className="flex flex-col w-48">
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-slate-500">Meta Objetivo</span>
              <span className="text-blue-600">{targetPercentage}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={targetPercentage}
              onChange={(e) => setTargetPercentage(Number(e.target.value))}
              className="h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div className="h-8 w-px bg-slate-200 mx-2"></div>

          {/* View Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('dashboard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <TableIcon className="w-4 h-4" /> Datos
            </button>
          </div>

          {/* Refresh / Upload */}
          <div className="flex gap-2">
            <button
              onClick={fetchGoogleSheetData}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <label className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors cursor-pointer" title="Subir CSV manual">
              <Upload className="w-5 h-5" />
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">

        {/* Sidebar Filters (Collapsible logic could be added, keeping it static for now) */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Filter className="w-3 h-3" /> Filtros
            </h3>

            <div className="space-y-2">
              <button
                onClick={() => handleReglabFilterChange('ALL')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isAllSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                <span>TODOS</span>
              </button>
              {uniqueRegLabs.map(reglab => (
                <button
                  key={reglab}
                  onClick={() => handleReglabFilterChange(reglab)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${reglabFilter.includes(reglab) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {reglabFilter.includes(reglab) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  <span className="truncate text-left">{reglab}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error Display in Sidebar if exists */}
          {error && (
            <div className="p-4 mt-auto">
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-lg text-xs">
                <AlertTriangle className="w-4 h-4 mb-1" />
                {error}
              </div>
            </div>
          )}
        </aside>

        {/* Dashboard View */}
        {viewMode === 'dashboard' && summary && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">

            {/* KPI Row */}
            <div className="grid grid-cols-4 gap-4 p-6 pb-2 flex-shrink-0">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Personal Total</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-slate-800">{summary.totalStaff}</span>
                  <span className="text-xs text-slate-400">filtrado</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Capacitados</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-blue-600">{summary.totalTrained}</span>
                  <span className="text-xs text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded">
                    {((summary.totalTrained / summary.totalStaff) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Grupos con Brecha</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-red-500">{summary.groupsTotal - summary.groupsMet}</span>
                  <span className="text-xs text-slate-400">de {summary.groupsTotal} grupos</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-l-orange-500">
                <p className="text-xs font-bold text-orange-800 uppercase">Brecha Total</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-orange-600">{summary.totalGap}</span>
                  <span className="text-xs text-orange-700">personas faltantes</span>
                </div>
              </div>
            </div>

            {/* Charts Area - Auto sizing grid */}
            <div className="flex-1 p-6 pt-4 grid grid-cols-2 gap-6 min-h-0">

              {/* Chart 1: Gap Magnitude */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700 text-sm">Top Grupos con Mayor Brecha</h3>
                  <span className="text-xs text-slate-400">Personas faltantes para llegar al {targetPercentage}%</span>
                </div>
                <div className="flex-1 p-4 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.filter(d => d.gap > 0).slice(0, 15)}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke="#f1f5f9" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                      <YAxis dataKey="grupo" type="category" width={180} tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="gap" fill="#f97316" radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Percentage Status */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700 text-sm">Avance Porcentual vs Meta</h3>
                  <span className="text-xs text-slate-400">Línea roja: Meta del {targetPercentage}%</span>
                </div>
                <div className="flex-1 p-4 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.slice(0, 25)}
                      margin={{ top: 10, right: 10, left: 10, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="grupo"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        tick={{ fontSize: 9, fill: '#64748b' }}
                        interval={0}
                      />
                      <YAxis unit="%" tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={targetPercentage} stroke="red" strokeDasharray="3 3" label={{ value: `${targetPercentage}%`, fill: 'red', fontSize: 10, position: 'right' }} />
                      <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                        {data.slice(0, 25).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.percentage >= targetPercentage ? '#22c55e' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="flex-1 overflow-auto p-6 bg-slate-50">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4">Grupo Especialidad/Subespecialidad</th>
                    <th className="px-6 py-4 text-center">Total Personal</th>
                    <th className="px-6 py-4 text-center">Capacitados</th>
                    <th className="px-6 py-4 text-center">% Avance</th>
                    <th className="px-6 py-4 text-center">Meta ({targetPercentage}%)</th>
                    <th className="px-6 py-4 text-center">Brecha</th>
                    <th className="px-6 py-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-800">{row.grupo}</td>
                      <td className="px-6 py-3 text-center">{row.totalPersonal}</td>
                      <td className="px-6 py-3 text-center text-blue-600 font-medium">{row.capacitados}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${row.percentage >= targetPercentage ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {row.percentage}%
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center text-slate-500">{row.targetCount}</td>
                      <td className="px-6 py-3 text-center font-bold">
                        {row.gap > 0 ? (
                          <span className="text-red-600 flex items-center justify-center gap-1">
                            <AlertCircle className="w-4 h-4" /> {row.gap}
                          </span>
                        ) : (
                          <span className="text-green-600 flex items-center justify-center gap-1">
                            <CheckCircle className="w-4 h-4" /> 0
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {row.status === 'Cumple' ? (
                          <span className="text-green-600 text-xs font-bold border border-green-200 bg-green-50 px-2 py-1 rounded-full">CUMPLE</span>
                        ) : (
                          <span className="text-red-600 text-xs font-bold border border-red-200 bg-red-50 px-2 py-1 rounded-full">BRECHA</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {rawData.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center max-w-md">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">No hay datos cargados</h2>
                <p className="text-slate-500 mb-6">No pudimos cargar los datos automáticamente. Por favor, intenta recargar o sube un archivo manualmente.</p>
                <button onClick={fetchGoogleSheetData} className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Reintentar Carga
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}