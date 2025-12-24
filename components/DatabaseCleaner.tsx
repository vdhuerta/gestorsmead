import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
// @ts-ignore
import { read, utils, writeFile } from 'xlsx';

// --- Utility: Text Normalization (Removes accents, lowercase) ---
const normalizeString = (str: string): string => {
    if (!str) return '';
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
};

// --- Utility: RUT Normalization (Preservando/Agregando 0 inicial para 7 dígitos + DV) ---
const formatRutWithPadding = (raw: string): string => {
    // Limpiar caracteres no permitidos
    let clean = raw.replace(/[^0-9kK]/g, '');
    if (clean.length < 7) return raw;

    // NORMA: Si tiene 8 caracteres (7 dígitos + DV), agregar el 0 a la izquierda
    // para estandarizar a 9 caracteres (8 dígitos + DV)
    if (clean.length === 8) {
        clean = '0' + clean;
    }

    // Si tiene 9 caracteres, se asume que ya viene con el 0 o es un RUT de 8 dígitos + DV
    if (clean.length === 9) {
        const body = clean.substring(0, 8);
        const dv = clean.substring(8).toUpperCase();
        return `${body}-${dv}`;
    }

    return raw;
};

// --- Advanced Similarity Helper: Token-based keyword matching ---
const getSmartSuggestions = (val: string, masterList: string[]) => {
    if (!val || val.length < 3) return [];
    
    const inputNorm = normalizeString(val);
    const inputTokens = inputNorm.split(/\s+/).filter(t => t.length > 2); // Solo palabras significativas
    
    if (inputTokens.length === 0) return [];

    // Mapear opciones con puntaje de relevancia
    const scoredOptions = masterList.map(option => {
        const optionNorm = normalizeString(option);
        let score = 0;

        // Regla 1: Coincidencia exacta (Puntaje máximo)
        if (optionNorm === inputNorm) score += 100;

        // Regla 2: Coincidencia por tokens (palabras clave)
        inputTokens.forEach(token => {
            if (optionNorm.includes(token)) {
                score += 10; // Punto por cada palabra encontrada
                // Bonus si la palabra es el inicio de la opción
                if (optionNorm.startsWith(token)) score += 5;
            }
        });

        return { option, score };
    });

    // Filtrar opciones con puntaje y ordenar por relevancia
    return scoredOptions
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(item => item.option);
};

interface RowData {
    id: string;
    rut: string;
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
    correo: string;
    telefono: string;
    rol: string;
    facultad: string;
    departamento: string;
    carrera: string;
    contrato: string;
    semestreDocente: string;
    sede: string;
}

export const DatabaseCleaner: React.FC = () => {
    const { config } = useData();
    const [data, setData] = useState<RowData[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [editingRowId, setEditingRowId] = useState<string | null>(null);

    // Listas Maestras para validación
    const masterLists = useMemo(() => ({
        rol: config.academicRoles || [],
        facultad: config.faculties || [],
        departamento: config.departments || [],
        carrera: config.careers || [],
        contrato: config.contractTypes || [],
        semestreDocente: config.semesters || [],
        sede: config.campuses || []
    }), [config]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const workbook = read(bstr, { type: 'binary' });
                const wsname = workbook.SheetNames[0];
                const ws = workbook.Sheets[wsname];
                const json = utils.sheet_to_json(ws, { header: 1 }) as any[][];

                if (json.length < 2) throw new Error("Archivo sin datos");

                const cleanedData: RowData[] = json.slice(1).map((row, idx) => {
                    const rutRaw = String(row[0] || '').trim();
                    return {
                        id: `TEMP-${idx}-${Date.now()}`,
                        rut: formatRutWithPadding(rutRaw),
                        nombre: String(row[1] || '').trim(),
                        apellidoPaterno: String(row[2] || '').trim(),
                        apellidoMaterno: String(row[3] || '').trim(),
                        correo: String(row[4] || '').trim(),
                        telefono: String(row[5] || '').trim(),
                        rol: String(row[6] || '').trim(),
                        facultad: String(row[7] || '').trim(),
                        departamento: String(row[8] || '').trim(),
                        carrera: String(row[9] || '').trim(),
                        contrato: String(row[10] || '').trim(),
                        semestreDocente: String(row[11] || '').trim(),
                        sede: String(row[12] || '').trim()
                    };
                });

                setData(cleanedData);
            } catch (err) {
                alert("Error al procesar archivo. Asegúrese que tenga el formato correcto.");
            } finally {
                setIsUploading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleExport = () => {
        const headers = ["RUT", "Nombre", "Apellido Paterno", "Apellido Materno", "Correo", "Teléfono", "Rol", "Facultad", "Departamento", "Carrera", "Contrato", "Semestre Docente", "Sede"];
        const rows = data.map(r => [r.rut, r.nombre, r.apellidoPaterno, r.apellidoMaterno, r.correo, r.telefono, r.rol, r.facultad, r.departamento, r.carrera, r.contrato, r.semestreDocente, r.sede]);
        
        const ws = utils.aoa_to_sheet([headers, ...rows]);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Base Maestra Depurada");
        writeFile(wb, `BASE_DEPURADA_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleSaveRow = (updated: RowData) => {
        setData(prev => prev.map(r => r.id === updated.id ? updated : r));
        setEditingRowId(null);
    };

    const selectedRow = useMemo(() => data.find(r => r.id === editingRowId), [data, editingRowId]);

    const isFieldInvalid = (fieldName: keyof RowData, value: string) => {
        if (!value) return false;
        const list = (masterLists as any)[fieldName];
        if (!list) return false;
        return !list.includes(value);
    };

    return (
        <div className="animate-fadeIn space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        Depurador de Listas Masivas
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Limpia y normaliza tus planillas antes de cargarlas a la Base Maestra.</p>
                </div>
                <div className="flex gap-3">
                    <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold shadow-md transition-all cursor-pointer flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        {isUploading ? "Procesando..." : "Subir Planilla (.xlsx)"}
                        <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={isUploading} />
                    </label>
                    <button 
                        onClick={handleExport}
                        disabled={data.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Descargar xls Limpio
                    </button>
                </div>
            </div>

            {data.length > 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Vista de Depuración ({data.length} registros)</span>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                <span className="text-[10px] font-bold text-slate-400">Inconsistencia Detectada</span>
                            </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white text-slate-500 font-bold border-b border-slate-100 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-3 whitespace-nowrap">RUT (Normalizado)</th>
                                    <th className="px-6 py-3">Nombre</th>
                                    <th className="px-6 py-3">Ap. Paterno</th>
                                    <th className="px-6 py-3">Facultad</th>
                                    <th className="px-6 py-3">Carrera</th>
                                    <th className="px-6 py-3 text-center">Gestión</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {data.map((row) => (
                                    <tr key={row.id} onClick={() => setEditingRowId(row.id)} className="hover:bg-slate-50 cursor-pointer group transition-colors">
                                        <td className="px-6 py-3 font-mono font-bold text-indigo-700">{row.rut}</td>
                                        <td className="px-6 py-3 text-slate-700">{row.nombre}</td>
                                        <td className="px-6 py-3 text-slate-700">{row.apellidoPaterno}</td>
                                        <td className={`px-6 py-3 font-medium ${isFieldInvalid('facultad', row.facultad) ? 'text-red-600 bg-red-50' : 'text-slate-600'}`}>
                                            {row.facultad || '---'}
                                        </td>
                                        <td className={`px-6 py-3 font-medium ${isFieldInvalid('carrera', row.carrera) ? 'text-red-600 bg-red-50' : 'text-slate-600'}`}>
                                            {row.carrera || '---'}
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <button className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity font-bold">Corregir</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="py-24 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 shadow-sm">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <p className="text-slate-400 font-medium">Sube un archivo para comenzar la depuración masiva.</p>
                </div>
            )}

            {/* MODAL DE EDICIÓN Y LIMPIEZA */}
            {editingRowId && selectedRow && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-indigo-200">
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Depuración de Registro Individual</h3>
                                <p className="text-xs text-slate-500 font-mono">ID: {selectedRow.id}</p>
                            </div>
                            <button onClick={() => setEditingRowId(null)} className="text-slate-400 hover:text-slate-600 text-3xl">&times;</button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                            <form className="space-y-8" id="edit-row-form" onSubmit={(e) => {
                                e.preventDefault();
                                const form = e.target as HTMLFormElement;
                                const formData = new FormData(form);
                                const updated: RowData = {
                                    ...selectedRow,
                                    rut: formatRutWithPadding(formData.get('rut') as string),
                                    nombre: formData.get('nombre') as string,
                                    apellidoPaterno: formData.get('apellidoPaterno') as string,
                                    apellidoMaterno: formData.get('apellidoMaterno') as string,
                                    correo: formData.get('correo') as string,
                                    telefono: formData.get('telefono') as string,
                                    rol: formData.get('rol') as string,
                                    facultad: formData.get('facultad') as string,
                                    departamento: formData.get('departamento') as string,
                                    carrera: formData.get('carrera') as string,
                                    contrato: formData.get('contrato') as string,
                                    semestreDocente: formData.get('semestreDocente') as string,
                                    sede: formData.get('sede') as string,
                                };
                                handleSaveRow(updated);
                            }}>
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-widest border-b pb-1">Datos de Identidad</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">RUT (X-DV)</label>
                                            <input name="rut" defaultValue={selectedRow.rut} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono font-bold" />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre</label>
                                            <input name="nombre" defaultValue={selectedRow.nombre} className="w-full px-3 py-2 border rounded-lg" />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ap. Paterno</label>
                                            <input name="apellidoPaterno" defaultValue={selectedRow.apellidoPaterno} className="w-full px-3 py-2 border rounded-lg" />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ap. Materno</label>
                                            <input name="apellidoMaterno" defaultValue={selectedRow.apellidoMaterno} className="w-full px-3 py-2 border rounded-lg" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-widest border-b pb-1">Campos de Verificación Institucional</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        <CleanerField label="Facultad" name="facultad" value={selectedRow.facultad} masterList={masterLists.facultad} />
                                        <CleanerField label="Departamento" name="departamento" value={selectedRow.departamento} masterList={masterLists.departamento} />
                                        <CleanerField label="Carrera" name="carrera" value={selectedRow.carrera} masterList={masterLists.carrera} />
                                        <CleanerField label="Rol Académico" name="rol" value={selectedRow.rol} masterList={masterLists.rol} />
                                        <CleanerField label="Tipo Contrato" name="contrato" value={selectedRow.contrato} masterList={masterLists.contrato} />
                                        <CleanerField label="Sede" name="sede" value={selectedRow.sede} masterList={masterLists.sede} />
                                        <CleanerField label="Semestre Docente" name="semestreDocente" value={selectedRow.semestreDocente} masterList={masterLists.semestreDocente} />
                                        
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Correo</label>
                                            <input name="correo" defaultValue={selectedRow.correo} className="w-full px-3 py-2 border rounded-lg text-sm" />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Teléfono</label>
                                            <input name="telefono" defaultValue={selectedRow.telefono} className="w-full px-3 py-2 border rounded-lg text-sm" />
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                            <button onClick={() => setEditingRowId(null)} className="px-6 py-2 text-slate-500 font-bold hover:text-slate-800">Cancelar</button>
                            <button form="edit-row-form" type="submit" className="px-8 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all">Guardar Depuración</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Sub-Component: Smart Field with Dropdown + Advanced Fuzzy Suggestions ---
const CleanerField: React.FC<{ label: string, name: string, value: string, masterList: string[] }> = ({ label, name, value, masterList }) => {
    const [currentValue, setCurrentValue] = useState(value);
    
    const sortedOptions = useMemo(() => [...masterList].sort((a, b) => a.localeCompare(b)), [masterList]);

    const isInvalid = useMemo(() => {
        if (!currentValue || currentValue === "") return false;
        return !masterList.includes(currentValue);
    }, [currentValue, masterList]);

    const suggestions = useMemo(() => {
        if (isInvalid) return getSmartSuggestions(currentValue, masterList);
        return [];
    }, [isInvalid, currentValue, masterList]);

    return (
        <div className="flex flex-col space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase">{label}</label>
            <div className="relative">
                <select 
                    name={name}
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg transition-all focus:ring-2 focus:outline-none appearance-none pr-10 ${isInvalid ? 'border-red-500 bg-red-50 ring-red-100 focus:ring-red-200 text-red-900' : 'border-slate-200 focus:ring-indigo-500 bg-white text-slate-700'}`} 
                >
                    <option value="">Seleccione...</option>
                    {sortedOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {isInvalid && (
                        <option value={currentValue} disabled className="bg-red-100 text-red-800 font-bold">
                            ⚠ {currentValue} (Dato Original)
                        </option>
                    )}
                </select>
                <div className="absolute right-3 top-2.5 pointer-events-none flex items-center gap-1">
                    {isInvalid && (
                        <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    )}
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
            </div>
            {isInvalid && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 animate-fadeIn">
                    <span className="text-[9px] text-red-500 font-black w-full italic mb-1 uppercase tracking-tighter">Sugerencias Inteligentes:</span>
                    {suggestions.map(s => (
                        <button 
                            key={s} 
                            type="button" 
                            onClick={() => setCurrentValue(s)}
                            className="text-[10px] bg-white hover:bg-indigo-600 hover:text-white text-indigo-700 border border-indigo-200 px-2 py-1 rounded shadow-sm transition-all transform hover:scale-105 active:scale-95"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
            {isInvalid && suggestions.length === 0 && currentValue.length > 3 && (
                <span className="text-[9px] text-slate-400 italic">No se encontraron coincidencias cercanas.</span>
            )}
        </div>
    );
};