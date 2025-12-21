import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserRole, User } from '../types';
import { useData } from '../context/DataContext';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';
import { useReloadDirective } from '../hooks/useReloadDirective';

// Utility para formatear RUT
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

const normalizeRut = (rut: string): string => {
    if (!rut) return '';
    return rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '').toLowerCase();
};

// Helper de Normalización de Texto (Quita tildes, minúsculas)
const normalizeText = (str: string): string => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

// Helper de Normalización de Valores para Listas
const normalizeValue = (val: string, masterList: string[]): string => {
    if (!val) return '';
    const trimmed = val.trim();
    if (masterList.includes(trimmed)) return trimmed;
    const match = masterList.find(item => normalizeText(item) === normalizeText(trimmed));
    return match || trimmed;
};

export const ParticipantManager: React.FC = () => {
  const { upsertUsers, getUser, deleteUser, users, config } = useData(); 
  const { isSyncing, executeReload } = useReloadDirective(); 

  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  
  // DYNAMIC LISTS
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "TAV Invierno", "TAV Verano", "Anual"];

  const studentsOnly = users.filter(u => u.systemRole === UserRole.ESTUDIANTE);

  const [isEditing, setIsEditing] = useState(false);
  
  // Search States
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<'rut' | 'paternalSurname' | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // --- Audit States ---
  const [filterMode, setFilterMode] = useState<'inconsistent' | 'incomplete' | null>(null);

  // --- Audit Logic ---
  const checkInconsistency = (u: User) => {
      if (u.faculty && !listFaculties.includes(u.faculty)) return true;
      if (u.department && !listDepts.includes(u.department)) return true;
      if (u.career && !listCareers.includes(u.career)) return true;
      if (u.academicRole && !listRoles.includes(u.academicRole)) return true;
      if (u.contractType && !listContracts.includes(u.contractType)) return true;
      if (u.teachingSemester && !listSemesters.includes(u.teachingSemester)) return true;
      return false;
  };

  const checkIncomplete = (u: User) => {
      if (!u.email || u.email === '') return true;
      if (!u.campus || u.campus === '') return true;
      if (!u.names || u.names === '') return true;
      return false;
  };

  const inconsistentUsers = useMemo(() => studentsOnly.filter(checkInconsistency), [studentsOnly, listFaculties, listDepts, listCareers, listRoles, listContracts, listSemesters]);
  const incompleteUsers = useMemo(() => studentsOnly.filter(checkIncomplete), [studentsOnly]);

  // Click outside suggestions
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
              setActiveSearchField(null);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Manual Form State
  const [manualForm, setManualForm] = useState({
    rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
    faculty: '', department: '', career: '', contractType: '', teachingSemester: '',
    campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE
  });
  
  const [manualStatus, setManualStatus] = useState<'idle' | 'error' | 'success' | 'deleted'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [rutError, setRutError] = useState<string | null>(null);

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);
  const [fileReport, setFileReport] = useState<{ total: number, success: number, updated: number, existing: number, errors: any[] } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectUser = (user: User) => {
      setManualForm({
          rut: user.rut,
          names: user.names,
          paternalSurname: user.paternalSurname,
          maternalSurname: user.maternalSurname || '',
          email: user.email || '',
          phone: user.phone || '',
          faculty: user.faculty || '',
          department: user.department || '',
          career: user.career || '',
          contractType: user.contractType || '',
          teachingSemester: user.teachingSemester || '',
          campus: user.campus || '',
          academicRole: user.academicRole || '',
          systemRole: user.systemRole || UserRole.ESTUDIANTE
      });
      setIsEditing(true);
      setShowSuggestions(false);
      setSuggestions([]);
      setActiveSearchField(null);
      setManualStatus('idle');
      setStatusMsg('Usuario cargado para edición.');
      setActiveTab('manual');
      setFilterMode(null); // Ocultar lista para editar
      window.scrollTo({ top: 200, behavior: 'smooth' });
  };

  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setManualForm(prev => ({ ...prev, [name]: value }));
    if (name === 'rut') setRutError(null);

    if (name === 'rut' || name === 'paternalSurname') {
        let matches: User[] = [];
        if (name === 'rut') {
            const rawInput = normalizeRut(value);
            if (rawInput.length >= 2) {
                setActiveSearchField('rut');
                matches = users.filter(u => normalizeRut(u.rut).includes(rawInput));
            } else { setActiveSearchField(null); }
        } else if (name === 'paternalSurname') {
            const rawInput = value.toLowerCase();
            if (rawInput.length >= 2) {
                setActiveSearchField('paternalSurname');
                matches = users.filter(u => u.paternalSurname.toLowerCase().includes(rawInput));
            } else { setActiveSearchField(null); }
        }
        if (matches.length > 0) { setSuggestions(matches.slice(0, 5)); setShowSuggestions(true); } 
        else { setSuggestions([]); setShowSuggestions(false); }
    }
  };

  const handleRutBlur = () => {
      setTimeout(() => {
          if (showSuggestions && activeSearchField === 'rut') setShowSuggestions(false);
          if (!manualForm.rut) return;
          const formatted = cleanRutFormat(manualForm.rut);
          const rawSearch = normalizeRut(formatted);
          setManualForm(prev => ({ ...prev, rut: formatted }));
          const existingUser = users.find(u => normalizeRut(u.rut) === rawSearch);
          if (existingUser) { handleSelectUser(existingUser); } 
          else { setIsEditing(false); }
      }, 200);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.rut || !manualForm.names || !manualForm.paternalSurname) {
        setManualStatus('error');
        setRutError('Complete los campos obligatorios');
        return;
    }
    const existing = getUser(manualForm.rut);
    const roleToSave = existing ? existing.systemRole : (manualForm.systemRole as UserRole);

    const newUser: User = { ...manualForm, systemRole: roleToSave, password: existing?.password, photoUrl: existing?.photoUrl };

    try {
        await upsertUsers([newUser]);
        await executeReload();
        setManualStatus('success');
        setStatusMsg(isEditing ? 'Usuario actualizado.' : 'Usuario creado.');
        if (!isEditing) {
            setTimeout(() => {
                setManualStatus('idle');
                setStatusMsg('');
                setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE });
            }, 2000);
        }
    } catch (error) {
        setManualStatus('error');
        setStatusMsg('Error al guardar.');
    }
  };

  const handleDelete = async () => {
      if (confirm(`¿Eliminar al estudiante ${manualForm.rut} de la Base Maestra?`)) {
          try {
              await deleteUser(manualForm.rut);
              await executeReload();
              setManualStatus('deleted');
              setStatusMsg('Estudiante eliminado.');
              setIsEditing(false);
              setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE });
          } catch (error) { setManualStatus('error'); setStatusMsg('Error al eliminar.'); }
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) { setFile(e.target.files[0]); setFileReport(null); }
  };

  const processFile = () => {
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = async (e) => {
      let rows: any[][] = [];
      if (isExcel) {
          const data = e.target?.result;
          const workbook = read(data, { type: 'array' });
          rows = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
      } else {
          const text = e.target?.result as string;
          const lines = text.split(/\r\n|\n/).filter(l => l.trim() !== '');
          if (lines.length > 0) rows = lines.map(line => line.split(lines[0].includes(';') ? ';' : ','));
      }

      if (rows.length === 0) { setIsProcessing(false); return; }

      const validUsers: User[] = [];
      let startRow = hasHeaders ? 1 : 0;

      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const rowStrings = row.map(cell => cell ? String(cell).trim() : '');
        if (!rowStrings[0]) continue;
        const rut = cleanRutFormat(rowStrings[0]);
        const existingUser = users.find(u => u.rut === rut);
        validUsers.push({
             rut: rut, names: rowStrings[1] || '', paternalSurname: rowStrings[2] || '', maternalSurname: rowStrings[3] || '', email: rowStrings[4] || '', phone: rowStrings[5] || '', 
             academicRole: normalizeValue(rowStrings[6], listRoles), faculty: normalizeValue(rowStrings[7], listFaculties), department: normalizeValue(rowStrings[8], listDepts), career: normalizeValue(rowStrings[9], listCareers), contractType: normalizeValue(rowStrings[10], listContracts), teachingSemester: normalizeValue(rowStrings[11], listSemesters), campus: rowStrings[12] || '', 
             systemRole: existingUser ? existingUser.systemRole : UserRole.ESTUDIANTE, password: existingUser?.password, photoUrl: existingUser?.photoUrl, title: existingUser?.title
        });
      }

      const result = await upsertUsers(validUsers);
      await executeReload();
      setFileReport({ total: validUsers.length, success: result.added, updated: result.updated, existing: 0, errors: [] });
      setIsProcessing(false);
      setFile(null); 
    };
    isExcel ? reader.readAsArrayBuffer(file) : reader.readAsText(file);
  };

  return (
    <div className="animate-fadeIn max-w-6xl mx-auto space-y-8">
      
      <div className="bg-[#647FBC]/5 border border-[#647FBC]/20 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h2 className="text-2xl font-bold text-[#647FBC]">Base Maestra de Estudiantes</h2>
            <p className="text-[#647FBC]/80">Auditoría y administración de perfiles institucionales.</p>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-4 md:mt-0">
               <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <div className={`w-2.5 h-2.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`}></div>
                    <span className="text-[10px] font-bold uppercase text-slate-500">{isSyncing ? 'Sincronizando...' : 'Conectado'}</span>
               </div>

               <button 
                  onClick={() => setFilterMode(prev => prev === 'inconsistent' ? null : 'inconsistent')} 
                  className={`px-4 py-2 rounded-lg border font-bold uppercase text-xs transition-all shadow-sm flex items-center gap-2 ${filterMode === 'inconsistent' ? 'bg-red-600 border-red-700 text-white' : 'bg-white border-slate-200 text-red-600 hover:bg-red-50'}`}
               >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                   Inconsistencias: {inconsistentUsers.length}
               </button>
               <button 
                  onClick={() => setFilterMode(prev => prev === 'incomplete' ? null : 'incomplete')} 
                  className={`px-4 py-2 rounded-lg border font-bold uppercase text-xs transition-all shadow-sm flex items-center gap-2 ${filterMode === 'incomplete' ? 'bg-amber-500 border-amber-600 text-white' : 'bg-white border-slate-200 text-amber-600 hover:bg-amber-50'}`}
               >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   Incompletos: {incompleteUsers.length}
               </button>
          </div>
      </div>

      {/* --- VISTA DE AUDITORÍA (SOLO SE MUESTRA CUANDO SE FILTRA) --- */}
      {filterMode && (
          <div className="bg-white rounded-xl shadow-xl border-t-4 border-[#647FBC] border-x border-b border-slate-200 overflow-hidden animate-fadeInDown">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2 uppercase text-sm tracking-widest">
                      {filterMode === 'inconsistent' ? 'Reporte de Registros Inconsistentes' : 'Reporte de Datos Faltantes'}
                  </h3>
                  <button onClick={() => setFilterMode(null)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">&times;</button>
              </div>
              <div className="overflow-x-auto max-h-96 custom-scrollbar">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-slate-500 font-bold sticky top-0 z-10 border-b border-slate-200">
                          <tr>
                              <th className="px-4 py-3 w-32">RUT</th>
                              <th className="px-4 py-3 min-w-[180px] max-w-[220px]">Estudiante</th>
                              <th className="px-4 py-3 min-w-[200px] max-w-[250px]">Unidad</th>
                              <th className="px-4 py-3">Inconsistencia Detectada</th>
                              <th className="px-4 py-3 text-center w-24">Acción</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                          {(filterMode === 'inconsistent' ? inconsistentUsers : incompleteUsers).map((u) => (
                              <tr key={u.rut} className="hover:bg-blue-50/50 transition-colors group">
                                  <td className="px-4 py-4 font-mono font-bold text-indigo-700 whitespace-nowrap">{u.rut}</td>
                                  <td className="px-4 py-4">
                                      <div className="font-bold text-slate-700 truncate" title={`${u.paternalSurname}, ${u.names}`}>{u.paternalSurname}, {u.names}</div>
                                      <div className="text-[10px] text-slate-400 truncate" title={u.email}>{u.email}</div>
                                  </td>
                                  <td className="px-4 py-4 text-xs text-slate-500">
                                      <div className="font-medium leading-tight mb-0.5 line-clamp-1" title={u.faculty}>{u.faculty}</div>
                                      <div className="italic leading-tight line-clamp-1" title={u.department}>{u.department}</div>
                                  </td>
                                  <td className="px-4 py-4">
                                      {filterMode === 'inconsistent' ? (
                                          <div className="flex flex-wrap gap-1">
                                              {u.faculty && !listFaculties.includes(u.faculty) && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Facultad</span>}
                                              {u.department && !listDepts.includes(u.department) && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Departamento</span>}
                                              {u.career && !listCareers.includes(u.career) && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Carrera</span>}
                                              {u.academicRole && !listRoles.includes(u.academicRole) && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Rol</span>}
                                              {u.contractType && !listContracts.includes(u.contractType) && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Contrato</span>}
                                          </div>
                                      ) : (
                                          <div className="flex flex-wrap gap-1">
                                              {!u.email && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Sin Email</span>}
                                              {!u.campus && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Sin Sede</span>}
                                              {!u.names && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Sin Nombres</span>}
                                          </div>
                                      )}
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                      <button 
                                          onClick={() => handleSelectUser(u)} 
                                          className="bg-[#647FBC] hover:bg-blue-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm uppercase"
                                      >
                                          Corregir
                                      </button>
                                  </td>
                              </tr>
                          ))}
                          {(filterMode === 'inconsistent' ? inconsistentUsers : incompleteUsers).length === 0 && (
                              <tr><td colSpan={5} className="py-20 text-center text-slate-400 italic">No se detectaron problemas en esta categoría.</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px]">
          <div className="flex items-end gap-2 border-b border-[#647FBC]/30 pl-4 bg-[#F9F8F6] pt-4">
             <button onClick={() => setActiveTab('manual')} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 transition-all ${activeTab === 'manual' ? 'bg-white text-[#647FBC] border-t-[#647FBC] shadow-sm z-10' : 'bg-slate-200 text-slate-500 border-transparent hover:bg-slate-100'}`}>Gestión Individual</button>
             <button onClick={() => setActiveTab('upload')} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 transition-all ${activeTab === 'upload' ? 'bg-white text-[#647FBC] border-t-[#647FBC] shadow-sm z-10' : 'bg-slate-200 text-slate-500 border-transparent hover:bg-slate-100'}`}>Carga Masiva (CSV)</button>
          </div>

          <div className="p-8">
            {activeTab === 'manual' && (
              <div className="animate-fadeIn">
                 <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-700">{isEditing ? 'Editar Perfil de Estudiante' : 'Registro de Nuevo Participante'}</h3>
                    <div className="flex items-center gap-3">
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] uppercase font-bold rounded border border-blue-100">Base Maestra: {studentsOnly.length} registros</span>
                    </div>
                 </div>

                 <form onSubmit={handleManualSubmit} className="space-y-8">
                    <div className="space-y-3">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1 flex items-center gap-2">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                             Identificación
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-1 relative">
                                <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label>
                                <input type="text" name="rut" placeholder="12345678-9" value={manualForm.rut} onChange={handleManualChange} onBlur={handleRutBlur} autoComplete="off" className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] font-bold"/>
                                {showSuggestions && activeSearchField === 'rut' && suggestions.length > 0 && (
                                    <div ref={suggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                        <div className="px-2 py-1 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase">Sugerencias por RUT</div>
                                        {suggestions.map((s) => (
                                            <div key={s.rut} onMouseDown={() => handleSelectUser(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{s.rut}</span><span className="text-xs text-slate-500">{s.names} {s.paternalSurname}</span></div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Nombres *</label><input type="text" name="names" value={manualForm.names} onChange={handleManualChange} className="w-full px-3 py-2 border rounded text-sm"/></div>
                            <div className="md:col-span-1 relative">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Ap. Paterno *</label>
                                <input type="text" name="paternalSurname" value={manualForm.paternalSurname} onChange={handleManualChange} autoComplete="off" className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#647FBC] text-sm"/>
                                {showSuggestions && activeSearchField === 'paternalSurname' && suggestions.length > 0 && (
                                    <div ref={suggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                        <div className="px-2 py-1 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase">Sugerencias por Apellido</div>
                                        {suggestions.map((s) => (
                                            <div key={s.rut} onMouseDown={() => handleSelectUser(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{s.paternalSurname} {s.maternalSurname}</span><span className="text-xs text-slate-500">{s.names} ({s.rut})</span></div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={manualForm.maternalSurname} onChange={handleManualChange} className="w-full px-3 py-2 border rounded text-sm"/></div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Contacto</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-xs font-medium text-slate-700 mb-1">Correo Institucional</label><input type="email" name="email" value={manualForm.email} onChange={handleManualChange} className="w-full px-3 py-2 border rounded text-sm"/></div>
                            <div><label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label><input type="tel" name="phone" value={manualForm.phone} onChange={handleManualChange} className="w-full px-3 py-2 border rounded text-sm"/></div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">Ubicación y Ficha Institucional</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><SmartSelect label="Sede / Campus" name="campus" value={manualForm.campus} options={config.campuses || ["Valparaíso", "San Felipe"]} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Facultad" name="faculty" value={manualForm.faculty} options={listFaculties} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Departamento" name="department" value={manualForm.department} options={listDepts} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Carrera" name="career" value={manualForm.career} options={listCareers} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Rol Académico" name="academicRole" value={manualForm.academicRole} options={listRoles} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Tipo Contrato" name="contractType" value={manualForm.contractType} options={listContracts} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Semestre Docencia" name="teachingSemester" value={manualForm.teachingSemester} options={listSemesters} onChange={handleManualChange} /></div>
                        </div>
                    </div>

                    <div className="pt-6 flex justify-between items-center gap-4">
                        {isEditing ? (
                            <>
                                <button type="button" onClick={handleDelete} disabled={isSyncing} className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>Eliminar de Base Maestra</button>
                                <div className="flex-1 flex justify-end gap-3 items-center">
                                     {manualStatus === 'success' && <span className="text-green-600 font-bold text-sm animate-pulse">{statusMsg}</span>}
                                     <button type="submit" disabled={isSyncing} className="px-8 py-2.5 bg-amber-500 text-white hover:bg-amber-600 rounded-lg font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-70"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>Guardar Cambios</button>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex justify-end gap-3 items-center">
                                 {manualStatus === 'success' && <span className="text-green-600 font-bold text-sm animate-pulse">{statusMsg}</span>}
                                 <button type="submit" disabled={isSyncing} className="px-8 py-2.5 bg-[#647FBC] text-white hover:bg-blue-800 rounded-lg font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-70"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Crear Estudiante</button>
                            </div>
                        )}
                    </div>
                 </form>
              </div>
            )}

            {activeTab === 'upload' && (
              <div className="max-w-3xl mx-auto animate-fadeIn">
                   <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 mb-8 flex items-start gap-4">
                       <div className="p-3 bg-white rounded-full shadow-sm text-indigo-600"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg></div>
                       <div><h3 className="text-lg font-bold text-indigo-900">Importación Masiva</h3><p className="text-sm text-indigo-700 mt-1">El sistema utilizará el RUT como llave primaria para crear o actualizar perfiles.</p></div>
                   </div>
                   <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 flex flex-col items-center space-y-6">
                       <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all ${file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-[#647FBC]'}`}><div className="flex flex-col items-center justify-center pt-5 pb-6">{file ? (<><div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-3 text-emerald-600 shadow-sm"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div><p className="mb-1 text-lg font-bold text-emerald-700">{file.name}</p></>) : (<><div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-3 text-[#647FBC] shadow-sm"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></div><p className="mb-2 text-sm text-slate-500"><span className="font-bold text-[#647FBC]">Haga clic para seleccionar</span> o arrastre el archivo aquí</p></>)}</div><input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={handleFileChange} /></label>
                       <div className="flex items-center gap-2 self-start pl-2"><input type="checkbox" id="hasHeaders" checked={hasHeaders} onChange={e => setHasHeaders(e.target.checked)} className="w-4 h-4 text-[#647FBC] rounded border-slate-300 focus:ring-[#647FBC]"/><label htmlFor="hasHeaders" className="text-sm text-slate-600 cursor-pointer select-none">Ignorar primera fila (encabezados)</label></div>
                       <button onClick={processFile} disabled={!file || isProcessing} className={`w-full py-4 rounded-xl font-bold text-lg shadow-md transition-all flex items-center justify-center gap-3 ${!file ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : isProcessing ? 'bg-slate-800 text-white cursor-wait' : 'bg-[#647FBC] text-white hover:bg-blue-800 hover:-translate-y-1 shadow-lg'}`}>{isProcessing ? 'Procesando...' : 'Cargar Estudiantes'}</button>
                       {fileReport && (<div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-6"><h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">Resumen de Carga</h4><div className="grid grid-cols-3 gap-4 text-center"><div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm"><span className="block text-2xl font-bold text-slate-800">{fileReport.total}</span><span className="text-[10px] text-slate-500 uppercase font-bold">Total</span></div><div className="bg-white p-3 rounded-lg border border-green-200 shadow-sm"><span className="block text-2xl font-bold text-green-600">{fileReport.success}</span><span className="text-[10px] text-green-600 uppercase font-bold">Nuevos</span></div><div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm"><span className="block text-2xl font-bold text-blue-600">{fileReport.updated}</span><span className="text-[10px] text-blue-600 uppercase font-bold">Actualizados</span></div></div></div>)}
                   </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
};