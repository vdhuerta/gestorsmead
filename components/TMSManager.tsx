
import React, { useState, useMemo, useEffect } from 'react';
import { useData, normalizeRut } from '../context/DataContext';
import { PEI_COMPETENCIES, PMI_COMPETENCIES } from '../constants';
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
    const approvedEnrollments = enrollments.filter(e => 
      normalizeRut(e.rut) === userRut && e.state === ActivityState.APROBADO
    );

    const counts: Record<string, number> = {};
    approvedEnrollments.forEach(enr => {
      const act = activities.find(a => a.id === enr.activityId);
      act?.competencyCodes?.forEach(code => {
        counts[code] = (counts[code] || 0) + 1;
      });
    });

    return [...PEI_COMPETENCIES, ...PMI_COMPETENCIES].map(c => {
      const count = counts[c.code] || 0;
      let level = 'Pendiente';
      let percentage = 0;
      let colorClass = 'bg-slate-200';
      let textColorClass = 'text-slate-400';

      if (count >= 3) {
          level = 'Consolidación';
          percentage = 100;
          colorClass = 'bg-emerald-500';
          textColorClass = 'text-emerald-700';
      } else if (count === 2) {
          level = 'Desarrollo';
          percentage = 66;
          colorClass = 'bg-indigo-500';
          textColorClass = 'text-indigo-700';
      } else if (count === 1) {
          level = 'Iniciación';
          percentage = 33;
          colorClass = 'bg-blue-400';
          textColorClass = 'text-blue-700';
      }

      return {
        code: c.code,
        name: c.name,
        count,
        level,
        percentage,
        colorClass,
        textColorClass,
        type: c.code.startsWith('PEI') ? 'PEI' : 'PMI'
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

    return [...PEI_COMPETENCIES, ...PMI_COMPETENCIES].map(c => ({
      code: c.code,
      name: c.name,
      count: counts[c.code] || 0
    })).sort((a, b) => b.count - a.count);
  }, [activities, selectedYear]);

  // --- LÓGICA: BÚSQUEDA DE TALENTO ---
  const expertUsers = useMemo(() => {
    if (!selectedSkill) return [];
    
    const matchingEnrollments = enrollments.filter(e => {
      if (e.state !== ActivityState.APROBADO) return false;
      const act = activities.find(a => a.id === e.activityId);
      return act?.year === selectedYear && act?.competencyCodes?.includes(selectedSkill);
    });

    const expertRuts = Array.from(new Set(matchingEnrollments.map(e => normalizeRut(e.rut))));
    return expertRuts.map(rut => users.find(u => normalizeRut(u.rut) === rut)).filter(u => u !== undefined) as User[];
  }, [selectedSkill, enrollments, activities, users, selectedYear]);

  // --- AI INSIGHTS CON GEMINI ---
  const generateAiInsight = async () => {
    if (!process.env.API_KEY) return;
    setIsAnalyzing(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const dataStr = JSON.stringify(coverageData);
    const prompt = `Analiza la siguiente matriz de cobertura de competencias institucionales (PEI/PMI) de la Universidad. 
    Datos: ${dataStr}. 
    Identifica los 2 mayores vacíos de formación (competencias con menor frecuencia) y genera una recomendación estratégica breve (máximo 60 palabras) para la UAD sobre qué tipo de capacitaciones priorizar para el próximo semestre. Responde en español con un tono profesional.`;

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
    else alert("Docente no encontrado en la Base Maestra.");
  };

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
          <button 
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-[#647FBC] hover:text-white transition-all font-black uppercase text-[10px] tracking-widest border border-slate-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Ayuda
          </button>
          <div className="flex items-center bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-200 shadow-inner group">
            <label className="text-[9px] font-black text-slate-400 uppercase mr-2">Periodo:</label>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))} 
              className="text-xs font-black text-[#647FBC] bg-transparent border-none focus:ring-0 p-0 cursor-pointer uppercase"
            >
                <option value={currentYear}>{currentYear}</option>
                <option value={currentYear - 1}>{currentYear - 1}</option>
            </select>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('individual')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'individual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Mi Perfil</button>
            <button onClick={() => setActiveTab('institutional')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'institutional' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Cobertura</button>
            <button onClick={() => setActiveTab('search')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'search' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Buscador</button>
          </div>
        </div>
      </div>

      {/* --- VISTA: PERFIL INDIVIDUAL (RUTAS FORMATIVAS) --- */}
      {activeTab === 'individual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 uppercase text-xs tracking-widest">Consultar Docente</h3>
              <form onSubmit={handleSearchTeacher} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="RUT Docente..." 
                  value={searchRut} 
                  onChange={e => setSearchRut(e.target.value)}
                  className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold"
                />
                <button type="submit" className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 shadow-md">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>
              </form>
            </div>

            {selectedUser && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner border border-white">
                    {selectedUser.names.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">{selectedUser.names} {selectedUser.paternalSurname}</h4>
                    <p className="text-xs text-slate-400 font-mono uppercase">{selectedUser.rut}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-xl text-center">
                    <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Índice de Madurez Profesional</span>
                    <span className="text-xl font-black text-indigo-600">
                        {maturityIndex}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-8 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative min-h-[500px] flex flex-col">
            <h3 className="text-lg font-black text-slate-800 mb-2 uppercase tracking-tight flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0116 0z" /></svg>
              Logro de Ruta Formativa (Niveles PEI / PMI)
            </h3>
            <p className="text-xs text-slate-400 mb-8 font-medium">Evolución del desempeño basada en el cumplimiento de hitos de capacitación institucionales.</p>
            
            {selectedUser ? (
              <div className="flex-1 w-full space-y-8 overflow-y-auto max-h-[600px] pr-4 custom-scrollbar">
                {/* GRUPO PEI */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Dimensiones PEI</span>
                        <div className="h-px flex-1 bg-slate-100"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        {individualProgressData.filter(d => d.type === 'PEI').map(comp => (
                            <div key={comp.code} className="space-y-1.5 group">
                                <div className="flex justify-between items-end">
                                    <div className="min-w-0">
                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter block leading-none">{comp.code}</span>
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
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                                    <div 
                                        className={`h-full transition-all duration-1000 ${comp.colorClass}`}
                                        style={{ width: `${comp.percentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* GRUPO PMI */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Ejes PMI</span>
                        <div className="h-px flex-1 bg-slate-100"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        {individualProgressData.filter(d => d.type === 'PMI').map(comp => (
                            <div key={comp.code} className="space-y-1.5 group">
                                <div className="flex justify-between items-end">
                                    <div className="min-w-0">
                                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter block leading-none">{comp.code}</span>
                                        <span className="text-xs font-bold text-slate-700 truncate block group-hover:text-emerald-600 transition-colors">{comp.name}</span>
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
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                                    <div 
                                        className={`h-full transition-all duration-1000 ${comp.colorClass}`}
                                        style={{ width: `${comp.percentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* LEYENDA DE NIVELES */}
                <div className="mt-10 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap justify-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-blue-400"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Iniciación (1 Curso)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-indigo-500"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Desarrollo (2 Cursos)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-emerald-500"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Consolidación (3+ Cursos)</span>
                    </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 opacity-50 space-y-4">
                <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                <p className="font-bold text-lg">Busque un RUT para generar la ruta formativa</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- VISTA: COBERTURA INSTITUCIONAL (BARS + AI) --- */}
      {activeTab === 'institutional' && (
        <div className="space-y-8 animate-fadeIn">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Mapa de Gaps Formativos</h3>
                  <p className="text-xs text-slate-400 font-medium">Densidad de la oferta académica por competencia en {selectedYear}.</p>
                </div>
                <div className="flex items-center gap-2">
                   <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span className="text-[9px] font-bold text-slate-400">Optimo</span></div>
                   <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div><span className="text-[9px] font-bold text-slate-400">Medio</span></div>
                   <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div><span className="text-[9px] font-bold text-slate-400">Crítico</span></div>
                </div>
              </div>

              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={coverageData} layout="vertical" margin={{ left: 40, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="code" type="category" width={60} tick={{ fontSize: 10, fontWeight: 'black', fill: '#64748b' }} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      content={({ payload }) => {
                        if (payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-xl">
                              <p className="text-xs font-black text-indigo-600 mb-1">{d.code}</p>
                              <p className="text-[10px] font-bold text-slate-700">{d.name}</p>
                              <p className="text-[10px] text-slate-400 mt-2">N° Cursos Tributando: <span className="text-slate-900 font-black">{d.count}</span></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                      {coverageData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.count >= 5 ? '#10b981' : entry.count >= 2 ? '#f59e0b' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <h4 className="text-xl font-black mb-2 uppercase tracking-tight">AI Curricular Analysis</h4>
                  <p className="text-blue-100 text-sm mb-8 leading-relaxed">¿Deseas que Gemini analice los gaps de formación y sugiera la oferta del próximo semestre?</p>
                  
                  <button 
                    onClick={generateAiInsight}
                    disabled={isAnalyzing}
                    className="w-full py-4 bg-white text-indigo-700 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Analizando Datos...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                        Generar Insights
                      </>
                    )}
                  </button>
                </div>
              </div>

              {aiInsight && (
                <div className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm animate-fadeInUp">
                  <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Recomendación de la IA
                  </h5>
                  <p className="text-sm text-slate-700 leading-relaxed italic">
                    "{aiInsight}"
                  </p>
                </div>
              )}
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
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Filtrar por Competencia Adquirida</label>
                <div className="flex flex-wrap gap-2">
                  {[...PEI_COMPETENCIES, ...PMI_COMPETENCIES].map(c => (
                    <button 
                      key={c.code}
                      onClick={() => setSelectedSkill(c.code)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${selectedSkill === c.code ? 'bg-indigo-600 border-indigo-700 text-white shadow-md scale-105' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-indigo-50'}`}
                    >
                      {c.code}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-indigo-900 mb-1">Resultados Encontrados</h4>
                  <p className="text-xs text-indigo-700">Expertos calificados en la competencia seleccionada.</p>
                </div>
                <div className="text-center">
                  <span className="block text-4xl font-black text-indigo-600">{expertUsers.length}</span>
                  <span className="text-[10px] font-bold uppercase text-indigo-400">Docentes</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {expertUsers.map(user => (
              <div key={user.rut} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-xl transition-all group relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-indigo-50 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-black text-xl shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    {user.names.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-800 truncate">{user.names} {user.paternalSurname}</h4>
                    <p className="text-[10px] text-slate-400 font-mono">{user.rut}</p>
                  </div>
                </div>
                <div className="space-y-2 mb-6">
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    {user.faculty}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    {user.academicRole}
                  </p>
                </div>
                
                <div className="pt-4 border-t border-slate-50">
                  <button 
                    onClick={() => {
                      setSearchRut(user.rut);
                      setSelectedUser(user);
                      setActiveTab('individual');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="w-full py-2 bg-slate-50 text-[#647FBC] text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-100 hover:bg-[#647FBC] hover:text-white transition-all"
                  >
                    Ver Perfil de Logro
                  </button>
                </div>
              </div>
            ))}
            {selectedSkill && expertUsers.length === 0 && (
              <div className="col-span-full py-16 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <p className="text-slate-400 font-medium italic">No se encontraron docentes con certificación aprobada para la competencia {selectedSkill} en la base de datos.</p>
              </div>
            )}
            {!selectedSkill && (
              <div className="col-span-full py-16 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <p className="text-slate-400 font-medium">Seleccione una competencia arriba para listar a los expertos.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE AYUDA TMS */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-indigo-100">
            <div className="p-8 bg-indigo-600 text-white flex justify-between items-center shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center border border-white/30">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 block mb-1">Guía del Usuario</span>
                        <h3 className="text-3xl font-black tracking-tighter uppercase leading-none">Manual del Sistema TMS</h3>
                    </div>
                </div>
                <button onClick={() => setShowHelpModal(false)} className="text-white/60 hover:text-white text-4xl font-light transition-all active:scale-90 relative z-10">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 bg-[#F9F8F6] custom-scrollbar space-y-12">
                
                {/* SECCION 1: MI PERFIL */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 border-b-2 border-indigo-100 pb-2">
                        <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-sm">01</span>
                        <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Módulo "Mi Perfil" (Rutas Formativas)</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h5 className="font-bold text-indigo-700 text-sm mb-2 uppercase">Lógica de Logro</h5>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                El sistema analiza el historial completo de inscripciones del docente que tengan estado <strong>APROBADO</strong>. 
                                Cada curso está vinculado a una o más competencias PEI/PMI. El nivel se determina por la repetición:
                            </p>
                            <ul className="mt-4 space-y-2 text-[11px] text-slate-500">
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-blue-400"></div> <strong>Iniciación:</strong> 1 curso aprobado en el área.</li>
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-indigo-500"></div> <strong>Desarrollo:</strong> 2 cursos aprobados.</li>
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-emerald-500"></div> <strong>Consolidación:</strong> 3 o más cursos.</li>
                            </ul>
                        </div>
                        <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 shadow-sm">
                            <h5 className="font-bold text-indigo-800 text-sm mb-2 uppercase">¿Qué es el Índice de Madurez?</h5>
                            <p className="text-xs text-slate-700 leading-relaxed">
                                Es un <strong>indicador ponderado de completitud curricular</strong>. Representa qué tan cerca está el docente de cubrir la totalidad de la taxonomía institucional.
                            </p>
                            <p className="text-[11px] text-indigo-900/60 mt-3 italic">
                                Se calcula promediando el progreso de todas las competencias PEI/PMI. Un valor del 100% significaría que el docente ha alcanzado el nivel de Consolidación en todas las áreas de la Universidad.
                            </p>
                        </div>
                    </div>
                </section>

                {/* SECCION 2: COBERTURA */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 border-b-2 border-emerald-100 pb-2">
                        <span className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center font-bold text-sm">02</span>
                        <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Módulo "Cobertura" (Mapa de Gaps)</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h5 className="font-bold text-emerald-700 text-sm mb-2 uppercase">Visualización de la Oferta</h5>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Muestra cuántos cursos están tributando a cada competencia en el <strong>Periodo Seleccionado</strong>. 
                                Utiliza un sistema semafórico para detectar vacíos:
                            </p>
                            <ul className="mt-4 space-y-2 text-[11px] text-slate-500">
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-rose-500"></div> <strong>Crítico:</strong> Menos de 2 cursos ofrecidos.</li>
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-amber-500"></div> <strong>Medio:</strong> Entre 2 y 4 cursos.</li>
                                <li className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-emerald-500"></div> <strong>Óptimo:</strong> 5 o más cursos.</li>
                            </ul>
                        </div>
                        <div className="bg-slate-800 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full -mr-10 -mt-10"></div>
                            <h5 className="font-bold text-indigo-300 text-sm mb-2 uppercase flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                AI Insights
                            </h5>
                            <p className="text-xs text-slate-300 leading-relaxed">
                                Gemini analiza las barras de cobertura y detecta las competencias con menor frecuencia. Genera una recomendación automática sobre qué áreas priorizar para nivelar el currículo institucional el próximo semestre.
                            </p>
                        </div>
                    </div>
                </section>

                {/* SECCION 3: BUSCADOR */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 border-b-2 border-blue-100 pb-2">
                        <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">03</span>
                        <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Módulo "Buscador" (Expertise Finder)</h4>
                    </div>
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Transforma la Base Maestra en una base de capital humano experto. Permite filtrar por una competencia específica para encontrar a todos los docentes que ya han aprobado cursos en esa área.
                        </p>
                        <div className="bg-blue-50 p-4 rounded-xl border-l-4 border-blue-500">
                            <p className="text-xs text-blue-700">
                                <strong>Utilidad Estratégica:</strong> Ideal para identificar posibles relatores internos, conformar comités técnicos o asignar mentores para procesos de acreditación.
                            </p>
                        </div>
                    </div>
                </section>

            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-200 text-center">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] italic">
                Strategic Intelligence Unit • GestorSMEAD TMS
              </p>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER TMS */}
      <div className="bg-white border-t border-slate-100 p-6 text-center rounded-b-3xl">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] italic">
          GestorSMEAD TMS Engine • Strategic Intelligence Platform
        </p>
      </div>
    </div>
  );
};
