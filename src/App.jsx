import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Upload, FileText, AlertCircle, CheckCircle, Users, TrendingUp, AlertTriangle, Filter, Square, CheckSquare, RefreshCw } from 'lucide-react';

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1zJZ5m-AVmiz1UHrAJCwKrLI0gW3aR04n/export?format=csv';

export default function TeachingGapDashboard() {
  const [rawData, setRawData] = useState([]); // Almacena todos los datos cargados
  const [data, setData] = useState([]); // Datos filtrados y procesados
  const [fileName, setFileName] = useState(null);
  const [viewMode, setViewMode] = useState('chart'); // 'chart' or 'table'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Nuevo estado: un array para múltiples selecciones de régimen laboral
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


  // Effect para recalcular los datos cuando cambia el filtro o el rawData
  useEffect(() => {
    if (rawData.length > 0) {
      // 1. Aplicar filtro: Si no hay filtros seleccionados, mostramos todo.
      const filteredData = reglabFilter.length === 0 || reglabFilter.length === uniqueRegLabs.length
        ? rawData
        : rawData.filter(row => reglabFilter.includes(row['REGLAB_UNIFICADO']));

      // 2. Procesar los datos filtrados
      processData(filteredData);
    } else {
      setData([]);
    }
  }, [rawData, reglabFilter, uniqueRegLabs]);


  // Handler para la selección múltiple
  const handleReglabFilterChange = (reglab) => {
    if (reglab === 'ALL') {
      // Si se selecciona "ALL", seleccionamos o deseleccionamos todos
      if (reglabFilter.length === uniqueRegLabs.length) {
        setReglabFilter([]);
      } else {
        setReglabFilter(uniqueRegLabs);
      }
    } else {
      // Toggle de una sola opción
      if (reglabFilter.includes(reglab)) {
        setReglabFilter(reglabFilter.filter(r => r !== reglab));
      } else {
        setReglabFilter([...reglabFilter, reglab]);
      }
    }
  };


  // Detectar el delimitador más probable (coma o punto y coma)
  const detectDelimiter = (text) => {
    const firstLine = text.split('\n')[0];
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;

    if (tabs > commas && tabs > semicolons) return '\t';
    if (semicolons > commas) return ';';
    return ',';
  };

  // Función auxiliar para parsear CSV manualmente con delimitador dinámico
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

  // Función centralizada para procesar el texto CSV
  const processCSVText = (text, sourceName) => {
    try {
      const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');

      if (lines.length < 2) {
        throw new Error("El archivo parece estar vacío o no tiene datos suficientes.");
      }

      const delimiter = detectDelimiter(text);

      // Limpiar encabezados de BOM y comillas
      const headers = parseCSVLine(lines[0], delimiter).map(h =>
        h.trim().replace(/^"|"$/g, '').replace(/^\uFEFF/, '')
      );

      // Validar columnas requeridas (Añadimos REGLAB_UNIFICADO)
      const requiredCols = ['GRUPO_ESP_SUBESP', 'CAPACIT_DOC_UNIFICADO', 'REGLAB_UNIFICADO'];
      const missingCols = requiredCols.filter(col => !headers.includes(col));

      if (missingCols.length > 0) {
        throw new Error(`Faltan columnas requeridas en el CSV: ${missingCols.join(', ')}. Verifica los nombres de los encabezados.`);
      }

      const parsedData = [];

      for (let i = 1; i < lines.length; i++) {
        const currentLine = parseCSVLine(lines[i], delimiter);
        // Permitir cierta flexibilidad en la longitud de la línea
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
        throw new Error("No se pudieron extraer datos válidos del archivo.");
      }

      setRawData(parsedData);
      setFileName(sourceName);
      setReglabFilter([]); // Resetear filtro
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
      if (!response.ok) {
        throw new Error(`Error al conectar con Google Sheets: ${response.statusText}`);
      }
      const text = await response.text();
      processCSVText(text, 'Google Sheets (Automático)');
    } catch (err) {
      console.error(err);
      setError(`No se pudo cargar desde Google Sheets: ${err.message}. Puedes intentar subir el archivo manualmente.`);
      setLoading(false);
    }
  };

  // Cargar datos automáticamente al iniciar
  useEffect(() => {
    fetchGoogleSheetData();
  }, []);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validar extensión
    if (!file.name.match(/\.(csv|txt)$/i)) {
      setError("Por favor sube un archivo con extensión .csv (El formato Excel .xlsx directo no es soportado, debes guardarlo como CSV).");
      return;
    }

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      processCSVText(text, file.name);
    };

    reader.onerror = () => {
      setError("Error al leer el archivo.");
      setLoading(false);
    };

    reader.readAsText(file, 'ISO-8859-1');
  };

  const processData = (currentData) => {
    // 1. Agrupar por GRUPO_ESP_SUBESP
    const grouped = currentData.reduce((acc, row) => {
      const grupo = row['GRUPO_ESP_SUBESP'];
      const capacitadoRaw = row['CAPACIT_DOC_UNIFICADO'];

      // Validar que el grupo exista (evitar filas vacías o sucias)
      if (!grupo) return acc;

      if (!acc[grupo]) {
        acc[grupo] = {
          grupo,
          totalPersonal: 0,
          capacitados: 0
        };
      }

      acc[grupo].totalPersonal += 1;

      // Lógica: Si tiene algún valor en CAPACIT_DOC_UNIFICADO, cuenta como capacitado
      if (capacitadoRaw && capacitadoRaw.trim() !== '' && capacitadoRaw !== 'NULL') {
        acc[grupo].capacitados += 1;
      }

      return acc;
    }, {});

    // 2. Calcular métricas y Brechas
    const metrics = Object.values(grouped).map(item => {
      const targetPct = 0.10; // 10% Umbral
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
        targetPercentage: 10 // Para referencia en gráfica
      };
    });

    // Ordenar: Primero los que tienen mayor brecha (gap)
    metrics.sort((a, b) => b.gap - a.gap || a.percentage - b.percentage);

    setData(metrics);
  };

  // KPI Calculations
  const summary = useMemo(() => {
    if (data.length === 0) return null;
    const totalStaff = data.reduce((sum, item) => sum + item.totalPersonal, 0);
    const totalTrained = data.reduce((sum, item) => sum + item.capacitados, 0);
    const totalGap = data.reduce((sum, item) => sum + item.gap, 0);
    const groupsMet = data.filter(item => item.status === 'Cumple').length;
    const groupsTotal = data.length;

    // Generar el nombre del filtro para el display
    let filterName = 'TODOS';
    if (reglabFilter.length > 0 && reglabFilter.length < uniqueRegLabs.length) {
      filterName = reglabFilter.join(', ');
    } else if (reglabFilter.length === 0 && rawData.length > 0) {
      filterName = 'Ninguno seleccionado (TODOS)';
    }


    return {
      totalStaff,
      totalTrained,
      totalGap,
      groupsMet,
      groupsTotal,
      filterName: filterName
    };
  }, [data, reglabFilter, uniqueRegLabs, rawData.length]);

  // Determina si el checkbox de "TODOS" debe estar marcado
  const isAllSelected = reglabFilter.length === uniqueRegLabs.length;


  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-gray-200 shadow-lg rounded-lg text-sm z-50">
          <p className="font-bold text-gray-800 mb-2 max-w-xs break-words">{d.grupo}</p>
          <p>Personal Total: <span className="font-medium">{d.totalPersonal}</span></p>
          <p>Capacitados: <span className="font-medium text-blue-600">{d.capacitados}</span> ({d.percentage}%)</p>
          <hr className="my-2 border-gray-100" />
          <p>Meta (10%): <span className="font-medium">{d.targetCount} personas</span></p>
          <p className={`${d.gap > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}`}>
            {d.gap > 0 ? `Faltan capacitar: ${d.gap}` : 'Meta Cumplida'}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            Dashboard de Brechas en Docencia
          </h1>
          <p className="text-slate-500 mt-2">
            Análisis de cumplimiento del umbral del 10% por Grupo de Especialidad/Subespecialidad.
          </p>
        </div>

        {/* File Upload Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
          {!rawData.length ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors relative group">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="flex flex-col items-center">
                {loading ? (
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-3"></div>
                ) : (
                  <Upload className="w-12 h-12 text-slate-400 mb-3 group-hover:text-blue-500 transition-colors" />
                )}
                <h3 className="text-lg font-medium text-slate-700">
                  {loading ? 'Cargando datos...' : 'Carga tu archivo CSV manualmente'}
                </h3>
                <p className="text-sm text-slate-500 mt-1">Soporta delimitadores de coma (,) o punto y coma (;). Requiere las columnas: GRUPO_ESP_SUBESP, CAPACIT_DOC_UNIFICADO, REGLAB_UNIFICADO.</p>
                {error && (
                  <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-md flex items-center gap-2 max-w-md mx-auto z-20 relative">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                {!loading && error && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Evitar que abra el file dialog
                      e.preventDefault();
                      fetchGoogleSheetData();
                    }}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 z-20 relative flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" /> Reintentar Carga Automática
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center bg-blue-50 p-4 rounded-lg border border-blue-100">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900">Fuente: {fileName}</p>
                  <p className="text-xs text-blue-700">{rawData.length} Registros totales</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={fetchGoogleSheetData}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1 border border-blue-200 rounded-md bg-white hover:bg-blue-50 flex items-center gap-2"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Actualizando...' : 'Actualizar'}
                </button>
                <button
                  onClick={() => { setRawData([]); setData([]); setError(null); setFileName(null); setReglabFilter([]); }}
                  className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1 border border-red-200 rounded-md bg-white hover:bg-red-50"
                >
                  Reiniciar / Cargar otro
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filtro y Sumario */}
        {rawData.length > 0 && (
          <div className="mb-6 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Filtrar por Régimen Laboral (Selección Múltiple)
            </h2>
            <div className="flex flex-wrap gap-4 items-center">

              {/* Checkbox para TODOS */}
              <button
                onClick={() => handleReglabFilterChange('ALL')}
                className={`flex items-center gap-2 p-2 rounded-lg transition-colors border text-sm font-medium 
                        ${isAllSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-blue-50 hover:text-blue-700'}`}
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                TODOS ({uniqueRegLabs.length} categorías)
              </button>

              {/* Checkboxes para Regímenes Individuales */}
              {uniqueRegLabs.map(reglab => {
                const isSelected = reglabFilter.includes(reglab);
                return (
                  <button
                    key={reglab}
                    onClick={() => handleReglabFilterChange(reglab)}
                    className={`flex items-center gap-2 p-2 rounded-lg transition-colors border text-sm font-medium 
                                ${isSelected ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-700 border-slate-300 hover:bg-blue-50 hover:border-blue-500'}`}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    {reglab}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {summary && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <p className="text-sm text-slate-500 font-medium uppercase">Personal Total Filtrado</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{summary.totalStaff}</p>
                <p className="text-xs text-slate-400 mt-1 overflow-hidden whitespace-nowrap overflow-ellipsis" title={summary.filterName}>
                  Régimen(es): {summary.filterName}
                </p>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <p className="text-sm text-slate-500 font-medium uppercase">Capacitados Actuales</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{summary.totalTrained}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {((summary.totalTrained / summary.totalStaff) * 100).toFixed(1)}% del personal filtrado
                </p>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <p className="text-sm text-slate-500 font-medium uppercase">Grupos con Brecha</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-bold text-red-500 mt-1">
                    {summary.groupsTotal - summary.groupsMet}
                  </p>
                  <p className="text-sm text-slate-400 mb-1">de {summary.groupsTotal} grupos analizados</p>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-l-orange-500 shadow-orange-50 border-y border-r border-slate-200">
                <p className="text-sm text-orange-800 font-medium uppercase">Brecha Total (Personas)</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{summary.totalGap}</p>
                <p className="text-xs text-orange-700 mt-1">Necesarios para llegar al 10% en estos grupos</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-slate-200">
              <button
                className={`pb-3 px-1 font-medium text-sm flex items-center gap-2 ${viewMode === 'chart' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
                onClick={() => setViewMode('chart')}
              >
                <TrendingUp className="w-4 h-4" />
                Gráficos de Brecha
              </button>
              <button
                className={`pb-3 px-1 font-medium text-sm flex items-center gap-2 ${viewMode === 'table' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
                onClick={() => setViewMode('table')}
              >
                <FileText className="w-4 h-4" />
                Tabla de Datos
              </button>
            </div>

            {viewMode === 'chart' && (
              <div className="space-y-8">
                {/* Chart 1: Personas Faltantes (Brecha Absoluta) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Top 20 Grupos con Mayor Brecha (Régimen(es): {summary.filterName})</h3>
                  <p className="text-sm text-slate-500 mb-6">Cantidad de personas que faltan capacitar para llegar al umbral del 10%.</p>
                  <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.filter(d => d.gap > 0).slice(0, 20)} // Solo mostrar los que tienen brecha, top 20
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke="#e2e8f0" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis
                          dataKey="grupo"
                          type="category"
                          width={250}
                          tick={{ fontSize: 11 }}
                          interval={0}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                        <Legend />
                        <Bar dataKey="gap" name="Personas Faltantes (Brecha)" fill="#f97316" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 2: Porcentaje de Avance */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Porcentaje de Avance vs Meta (10%) (Régimen(es): {summary.filterName})</h3>
                  <p className="text-sm text-slate-500 mb-6">Visualización del % actual. Las barras verdes cumplen la meta, las rojas no.</p>
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.slice(0, 30)} // Top 30 para legibilidad
                        margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="grupo"
                          angle={-45}
                          textAnchor="end"
                          height={120}
                          tick={{ fontSize: 10 }}
                          interval={0}
                        />
                        <YAxis unit="%" />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={10} label={{ value: 'Meta 10%', position: 'insideTopRight', fill: 'red', fontSize: 12 }} stroke="red" strokeDasharray="3 3" />
                        <Bar dataKey="percentage" name="% Capacitado" radius={[4, 4, 0, 0]}>
                          {data.slice(0, 30).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.percentage >= 10 ? '#22c55e' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'table' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4">Grupo Especialidad/Subespecialidad</th>
                        <th className="px-6 py-4 text-center">Total Personal</th>
                        <th className="px-6 py-4 text-center">Capacitados</th>
                        <th className="px-6 py-4 text-center">% Avance</th>
                        <th className="px-6 py-4 text-center">Meta (10%)</th>
                        <th className="px-6 py-4 text-center">Brecha (Faltan)</th>
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
                            <span className={`px-2 py-1 rounded text-xs font-bold ${row.percentage >= 10 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
          </>
        )}
      </div>
    </div>
  );
}