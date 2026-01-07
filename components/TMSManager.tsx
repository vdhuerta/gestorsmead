import React, { useState, useMemo, useEffect } from 'react';
import { useData, normalizeRut } from '../context/DataContext';
import { PEI_COMPETENCIES, PMI_COMPETENCIES, ACADEMIC_PROFILE_COMPETENCIES } from '../constants';
import { User, Activity, ActivityState, Enrollment } from '../types';
import { GoogleGenAI } from "@google/genai";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell 
} from 'recharts';

type TMSTab = 'individual' | 'institutional' | 'search';

export const TMSManager: React.FC = () => {
  const { users, activities, enrollments } = useData();
  const [activeTab, setActiveTab] = useState<TMSTab>('individual');
  const [showHelpModal, setShowHelpModal] = useState(false);
  
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // States for Individual Profile
  const [searchRut, setSearchRut] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // States for Institutional Coverage
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // States for Talent Search
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  // --- LÓGICA: PERFIL INDIVIDUAL (LOGRO DE RUTA FORMATIVA) ---
  const individualProgressData = useMemo(() => {
    if (!selectedUser) return [];
    
    const userRut = normalizeRut(selectedUser.rut);
    
    // FILTRADO DE LOGROS: Aplicando regla diferenciada por categoría
    const achievementEnrollments = enrollments.filter(e => {
      if (normalizeRut(e.rut) !== userRut) return false;
      const act = activities.find(a => a.id === e.activityId);
      if (!act) return false;

      // REGLA TMS: 
      // 1. Cursos y Postítulos requieren APROBADO
      // 2. Extensión y Asesorías basta con la participación registrada
      if (act.category === 'ACADEMIC' || act.category === 'POSTGRADUATE') {
          return e.state === ActivityState.APROBADO;
      }
      return true;
    });

    const counts: Record<string, number> = {};
    achievementEnrollments.forEach(enr => {
      const act = activities.find(a => a.id === enr.activityId);
      act?.competencyCodes?.forEach(code => {
        counts[code] = (counts[code] || 0) + 1;
      });
    });

    // UNIFICACIÓN DE TAXONOMÍAS: PEI + PMI + PERFIL ACADÉMICO (PA)
    return [...PEI_COMPETENCIES, ...PMI_COMPETENCIES, ...ACADEMIC_PROFILE_COMPETENCIES].map(c => {
      const count = counts[c.code] || 0;
      let level = 'Pendiente';
      let percentage = 0;
      let colorClass = 'bg-slate-200';

      if (count >= 3) {
          level = 'Consolidación';
          percentage = 100;
          colorClass = 'bg-emerald-500';
      } else if (count === 2) {
          level = 'Desarrollo';
          percentage = 66;
          colorClass = 'bg-indigo-500';
      } else if (count === 1) {
          level = 'Iniciación';
          percentage = 33;
          colorClass = 'bg-blue-400';
      }

      return {
        code: c.code,
        name: c.name,
        count,
        level,
        percentage,
        colorClass,
        type: c.code.startsWith('PEI') ? 'PEI' : c.code.startsWith('PMI') ? 'PMI' : 'PA',
        dimension: (c as any).dimension || null
      };
    });
  }, [selectedUser, enrollments, activities]);

  const maturityIndex = useMemo(() => {
    if (individualProgressData.length === 0) return 0;
    return Math.round((individualProgressData.reduce((acc, curr) => acc + curr.percentage, 0) / (individualProgressData.length * 100)) * 100);
  }, [individualProgressData]);

  // --- LÓGICA: COBERTURA INSTITUCIONAL (BAR CHART) ---
  const coverageData = useMemo(() => {
    const counts: Record<string, number> = {};
    activities.filter(a => a.year === selectedYear).forEach(act => {
      act.competencyCodes?.forEach(code => {
        counts[code] = (counts[code] || 0) + 1;
      });
    });

    return [...PEI_COMPETENCIES, ...PMI_COMPETENCIES, ...ACADEMIC_PROFILE_COMPETENCIES].map(c => ({
      code: c.code,
      name: c.name,
      count: counts[c.code] || 0
    })).sort((a, b) => b.count - a.count);
  }, [activities, selectedYear]);

  // --- LÓGICA: BÚSQUEDA DE TALENTO (EXPERT FINDER) ---
  const expertUsers = useMemo(() => {
    if (!selectedSkill) return [];
    
    const matchingEnrollments = enrollments.filter(e => {
      const act = activities.find(a => a.id === e.activityId);
      if (!act || act.year !== selectedYear || !act.competencyCodes?.includes(selectedSkill)) return false;
      if (act.category === 'ACADEMIC' || act.category === 'POSTGRADUATE') {
          return e.state === ActivityState.APROBADO;
      }
      return true;
    });

    const expertRuts = Array.from(new Set(matchingEnrollments.map(e => normalizeRut(e.rut))));
    return expertRuts.map(rut => users.find(u => normalizeRut(u.rut) === rut)).filter(u => u !== undefined) as User[];
  }, [selectedSkill, enrollments, activities, users, selectedYear]);

  // --- AI INSIGHTS ---
  const generateAiInsight = async () => {
    if (!process.env.API_KEY) return;
    setIsAnalyzing(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const dataStr = JSON.stringify(coverageData);
    const prompt = `Analiza la cobertura de competencias institucionales UPLA (PEI, PMI y Perfil Académico). Datos: ${dataStr}. Identifica los 2 mayores vacíos y genera una recomendación estratégica breve.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAiInsight(response.text || "No se pudo generar el análisis.");
    } catch (err) {
      setAiInsight("Error conectando con la IA.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSearchTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    const found = users.find(u => normalizeRut(u.rut) === normalizeRut(searchRut));
    if (found) setSelectedUser(found);
    else alert("Docente no encontrado.");
  };

  // Helper para renderizar grupos de progreso
  const renderProgressGroup = (title: string, data: any[], colorClass: string) => (
    <div className="space-y-4">
        <div className="flex items-center gap-3">
            <span className={`${colorClass} text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest`}>{title}</span>
            <div className="h-px flex-1 bg-slate-100"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {data.map(comp => (
                <div key={comp.code} className="space-y-1.5 group">
                    <div className="flex justify-between items-end">
                        <div className="min-w-0">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter block leading-none">{comp.code}</span>
                            <span className="text-xs font-bold text-slate-700 truncate block group-hover:text-indigo-600 transition-colors">{comp.name}</span>
                        </div>
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${
                            comp.level === 'Consolidación' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            comp.level === 'Desarrollo' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                            comp.level === 'Iniciación' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            'bg-slate-50 text-slate-400 border-slate-100'
                        }`}>
                            {comp.level}
                        </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                        <div 
                            className={`h-full transition-all duration-1000 ${comp.colorClass}`}
                            style={{ width: `${comp.percentage}%` }}
                        ></div>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* HEADER TMS */}
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">Talent Management System (TMS)</h2>
            <p className="text-slate-500 font-medium">Analítica avanzada de capacidades institucionales UPLA.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex items-center bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-200 shadow-inner group">
            <label className="text-[9px] font-black text-slate-400 uppercase mr-2">Periodo:</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="text-xs font-black text-[#647FBC] bg-transparent border-none focus:ring-0 p-0 cursor-pointer uppercase">
                <option value={currentYear}>{currentYear}</option>
                <option value={currentYear - 1}>{currentYear - 1}</option>
            </select>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {['individual', 'institutional', 'search'].map((t) => (
                <button key={t} onClick={() => setActiveTab(t as TMSTab)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{t === 'individual' ? 'Mi Perfil' : t === 'institutional' ? 'Cobertura' : 'Buscador'}</button>
            ))}
          </div>
          <button onClick={() => setShowHelpModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-[#647FBC] hover:text-white transition-all font-black uppercase text-[10px] tracking-widest border border-slate-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Ayuda
          </button>
        </div>
      </div>

      {/* --- VISTA: PERFIL INDIVIDUAL --- */}
      {activeTab === 'individual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest">Consultar Docente</h3>
              <form onSubmit={handleSearchTeacher} className="flex gap-2">
                <input type="text" placeholder="RUT Docente..." value={searchRut} onChange={e => setSearchRut(e.target.value)} className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold"/>
                <button type="submit" className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 shadow-md">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>
              </form>
            </div>
            {selectedUser && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner border border-white">{selectedUser.names.charAt(0)}</div>
                  <div><h4 className="font-bold text-slate-800">{selectedUser.names} {selectedUser.paternalSurname}</h4><p className="text-xs text-slate-400 font-mono uppercase">{selectedUser.rut}</p></div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                    <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Índice de Madurez Profesional</span>
                    <span className="text-xl font-black text-indigo-600">{maturityIndex}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-8 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative min-h-[500px] flex flex-col">
            <h3 className="text-lg font-black text-slate-800 mb-2 uppercase tracking-tight flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0116 0z" /></svg>
              Evolución de Competencias y Perfil Académico
            </h3>
            <p className="text-xs text-slate-400 mb-8 font-medium">Estado de tributación institucional basado en hitos de formación continua.</p>
            
            {selectedUser ? (
              <div className="flex-1 w-full space-y-12 overflow-y-auto max-h-[700px] pr-4 custom-scrollbar">
                {/* GRUPO PEI */}
                {renderProgressGroup('Dimensiones PEI', individualProgressData.filter(d => d.type === 'PEI'), 'bg-indigo-600')}

                {/* GRUPO PMI */}
                {renderProgressGroup('Ejes PMI', individualProgressData.filter(d => d.type === 'PMI'), 'bg-emerald-600')}

                {/* --- SECCIÓN: DIMENSIONES DEL PERFIL ACADÉMICO UPLA --- */}
                <div className="space-y-6 pt-4 border-t border-slate-50">
                    <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <h4 className="text-sm font-black text-rose-600 uppercase tracking-[0.2em]">Dimensiones del Perfil Académico</h4>
                    </div>

                    <div className="space-y-10">
                        {['Pedagógica', 'Investigación y/o Creación', 'Vinculación', 'Interpersonal y Ética', 'Formación Continua'].map(dim => {
                            const dimData = individualProgressData.filter(d => d.type === 'PA' && d.dimension === dim);
                            if (dimData.length === 0) return null;
                            
                            const dimColor = dim === 'Pedagógica' ? 'bg-rose-500' : dim === 'Investigación y/o Creación' ? 'bg-emerald-500' : dim === 'Vinculación' ? 'bg-purple-500' : dim === 'Interpersonal y Ética' ? 'bg-blue-500' : 'bg-pink-500';

                            return (
                                <div key={dim} className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${dimColor}`}></div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{dim}</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                        {dimData.map(comp => (
                                            <div key={comp.code} className="space-y-1.5">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-[10px] font-bold text-slate-700 truncate pr-2" title={comp.name}>{comp.name}</span>
                                                    <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded border border-slate-100 ${comp.percentage > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{comp.level}</span>
                                                </div>
                                                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                                                    <div className={`h-full transition-all duration-1000 ${comp.percentage === 100 ? 'bg-emerald-400' : comp.percentage > 0 ? 'bg-indigo-400' : 'bg-slate-200'}`} style={{ width: `${comp.percentage}%` }}></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* LEYENDA */}
                <div className="mt-10 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap justify-center gap-6">
                    {['Iniciación', 'Desarrollo', 'Consolidación'].map((lvl, i) => (
                        <div key={lvl} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded ${i === 0 ? 'bg-blue-400' : i === 1 ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{lvl} ({i+1} Act.)</span>
                        </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 opacity-50 space-y-4">
                <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                <p className="font-bold text-lg uppercase tracking-widest">Ingrese un RUT para auditar el perfil</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- VISTA: COBERTURA INSTITUCIONAL --- */}
      {activeTab === 'institutional' && (
        <div className="space-y-8 animate-fadeIn">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <div><h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Mapa de Gaps Formativos</h3><p className="text-xs text-slate-400 font-medium">Densidad de la oferta académica en {selectedYear}.</p></div>
                <div className="flex items-center gap-2">
                   {['Optimo', 'Medio', 'Crítico'].map((l, i) => (
                       <div key={l} className="flex items-center gap-1"><div className={`w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-emerald-500' : i === 1 ? 'bg-amber-500' : 'bg-rose-500'}`}></div><span className="text-[9px] font-black text-slate-400 uppercase">{l}</span></div>
                   ))}
                </div>
              </div>
              <div className="h-[600px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={coverageData} layout="vertical" margin={{ left: 40, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="code" type="category" width={70} tick={{ fontSize: 9, fontWeight: 'black', fill: '#64748b' }} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} content={({ payload }) => {
                        if (payload && payload.length) {
                          const d = payload[0].payload;
                          return (<div className="bg-white border border-slate-200 p-3 rounded-xl shadow-xl"><p className="text-xs font-black text-indigo-600 mb-1">{d.code}</p><p className="text-[10px] font-bold text-slate-700">{d.name}</p><p className="text-[10px] text-slate-400 mt-2">Actividades vinculadas: <span className="text-slate-900 font-black">{d.count}</span></p></div>);
                        }
                        return null;
                    }}/>
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                      {coverageData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.count >= 5 ? '#10b981' : entry.count >= 2 ? '#f59e0b' : '#ef4444'} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                  <h4 className="text-xl font-black mb-2 uppercase tracking-tight">AI Curricular Analysis</h4>
                  <p className="text-blue-100 text-sm mb-8 leading-relaxed">¿Deseas que Gemini analice los gaps y sugiera la oferta del próximo periodo?</p>
                  <button onClick={generateAiInsight} disabled={isAnalyzing} className="w-full py-4 bg-white text-indigo-700 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    {isAnalyzing ? <><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Analizando...</> : "Generar Insights"}
                  </button>
                </div>
              </div>
              {aiInsight && (<div className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm animate-fadeInUp"><h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-2"><span className="w-2 h-2 bg-green-500 rounded-full"></span>Recomendación de la IA</h5><p className="text-sm text-slate-700 leading-relaxed italic">"{aiInsight}"</p></div>)}
            </div>
          </div>
        </div>
      )}

      {/* --- VISTA: BUSCADOR DE TALENTO --- */}
      {activeTab === 'search' && (
        <div className="space-y-8 animate-fadeIn">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-6">Expertise Finder (Buscador de Talentos)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Filtrar por Competencia o Dimensión</label>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {[...PEI_COMPETENCIES, ...PMI_COMPETENCIES, ...ACADEMIC_PROFILE_COMPETENCIES].map(c => (
                    <button key={c.code} onClick={() => setSelectedSkill(c.code)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${selectedSkill === c.code ? 'bg-indigo-600 border-indigo-700 text-white shadow-md scale-105' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-indigo-50'}`}>{c.code}</button>
                  ))}
                </div>
              </div>
              <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 flex items-center justify-between">
                <div><h4 className="text-sm font-bold text-indigo-900 mb-1">Resultados Encontrados</h4><p className="text-xs text-indigo-700">Docentes acreditados en la competencia.</p></div>
                <div className="text-center"><span className="block text-4xl font-black text-indigo-600">{expertUsers.length}</span><span className="text-[10px] font-bold uppercase text-indigo-400">Docentes</span></div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {expertUsers.map(user => (
              <div key={user.rut} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-xl transition-all group relative overflow-hidden">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-black text-xl shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-colors">{user.names.charAt(0)}</div>
                  <div className="min-w-0"><h4 className="font-bold text-slate-800 truncate">{user.names} {user.paternalSurname}</h4><p className="text-[10px] text-slate-400 font-mono">{user.rut}</p></div>
                </div>
                <div className="space-y-2 mb-6">
                  <p className="text-xs text-slate-500 flex items-center gap-2 truncate"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>{user.faculty}</p>
                </div>
                <div className="pt-4 border-t border-slate-50">
                  <button onClick={() => { setSearchRut(user.rut); setSelectedUser(user); setActiveTab('individual'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-full py-2 bg-slate-50 text-[#647FBC] text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-100 hover:bg-[#647FBC] hover:text-white transition-all">Ver Perfil de Logro</button>
                </div>
              </div>
            ))}
            {selectedSkill && expertUsers.length === 0 && <div className="col-span-full py-16 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400">No se encontraron docentes certificados en {selectedSkill} para este periodo.</div>}
            {!selectedSkill && <div className="col-span-full py-16 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400">Seleccione una competencia para listar a los expertos acreditados.</div>}
          </div>
        </div>
      )}

      {/* MODAL DE AYUDA TMS */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden border border-indigo-100">
            <div className="p-8 bg-indigo-600 text-white flex justify-between items-center shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center border border-white/30"><svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <div><span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 block mb-1">Guía del Usuario</span><h3 className="text-3xl font-black tracking-tighter uppercase leading-none">Manual del Sistema TMS</h3></div>
                </div>
                <button onClick={() => setShowHelpModal(false)} className="text-white/60 hover:text-white text-5xl font-light transition-all active:scale-90 relative z-10">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 bg-[#F9F8F6] custom-scrollbar space-y-12">
                <section className="space-y-4">
                    <div className="flex items-center gap-3 border-b-2 border-indigo-100 pb-2"><span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-sm">01</span><h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Módulo "Mi Perfil" (Índice de Madurez)</h4></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h5 className="font-bold text-indigo-700 text-sm mb-2 uppercase">Mecánica de Progresión</h5><p className="text-xs text-slate-600 leading-relaxed">El sistema mide la <strong>densidad curricular</strong> analizando participaciones registradas y aprobación formal.</p>
                            <ul className="mt-4 space-y-2 text-[11px] text-slate-500">
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-blue-400"></div> <strong>Iniciación (33%):</strong> 1 actividad registrada.</li>
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-indigo-500"></div> <strong>Desarrollo (66%):</strong> 2 actividades acumuladas.</li>
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-emerald-500"></div> <strong>Consolidación (100%):</strong> 3+ actividades. Maestría en el área.</li>
                            </ul>
                        </div>
                        <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 shadow-sm"><h5 className="font-bold text-indigo-800 text-sm mb-2 uppercase">Perfil Académico UPLA</h5><p className="text-xs text-slate-700 leading-relaxed">Ahora el sistema audita las 5 dimensiones clave: Pedagógica, Investigación, Vinculación, Ética y Formación Continua, cruzando sus logros con el Plan Estratégico Institucional.</p></div>
                    </div>
                </section>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-200 text-center"><p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] italic">Strategic Intelligence Unit • GestorSMEAD TMS</p></div>
          </div>
        </div>
      )}
      <div className="bg-white border-t border-slate-100 p-6 text-center rounded-b-3xl"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] italic">GestorSMEAD TMS Engine • Strategic Intelligence Platform</p></div>
    </div>
  );
};