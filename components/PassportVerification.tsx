import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { PEI_COMPETENCIES, PMI_COMPETENCIES, ACADEMIC_PROFILE_COMPETENCIES } from '../constants';
import { ActivityState } from '../types';

export const PassportVerification: React.FC<{ code: string }> = ({ code }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const verify = async () => {
            try {
                // 1. Buscar usuario por el código persistido
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('passport_code', code)
                    .maybeSingle();

                if (userError || !userData) throw new Error('Código de micro-credencial no encontrado o expirado.');

                // 2. Obtener sus inscripciones aprobadas
                const { data: enrData, error: enrError } = await supabase
                    .from('enrollments')
                    .select('*, activity:activities(*)')
                    .eq('user_rut', userData.rut)
                    .eq('state', ActivityState.APROBADO);

                if (enrError) throw enrError;

                // 3. Procesar taxonomía de competencias (Copia de lógica DashboardEstudiante)
                const competencyStats: Record<string, any> = {};
                const masterList = [...PEI_COMPETENCIES, ...PMI_COMPETENCIES, ...ACADEMIC_PROFILE_COMPETENCIES];

                enrData.forEach(enr => {
                    const act = enr.activity;
                    if (act && act.competency_codes) {
                        act.competency_codes.forEach((cCode: string) => {
                            if (!competencyStats[cCode]) {
                                const meta = masterList.find(m => m.code === cCode);
                                let dimension = (meta as any)?.dimension;
                                if (!dimension) {
                                    if (cCode.startsWith('PEI')) dimension = 'Plan Estratégico';
                                    else if (cCode.startsWith('PMI')) dimension = 'Plan de Mejora';
                                }
                                competencyStats[cCode] = { 
                                    code: cCode, 
                                    name: meta?.name || 'Competencia Institucional', 
                                    dimension,
                                    hours: 0, 
                                    activities: [] 
                                };
                            }
                            competencyStats[cCode].hours += Number(act.hours || 0);
                            competencyStats[cCode].activities.push({ name: act.name, grade: enr.final_grade });
                        });
                    }
                });

                setData({
                    user: userData,
                    competencies: Object.values(competencyStats).sort((a, b) => b.hours - a.hours)
                });

            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (code) verify();
        else { setError('Código de verificación no proporcionado'); setLoading(false); }
    }, [code]);

    if (loading) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#647FBC]"></div>
        </div>
    );

    if (error || !data) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md w-full border-t-8 border-red-500">
                <h2 className="text-2xl font-black text-slate-800 mb-4 uppercase tracking-tight">Verificación Fallida</h2>
                <p className="text-slate-600 mb-8 text-sm leading-relaxed">{error}</p>
                <a href="/" className="inline-block bg-[#647FBC] text-white px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-blue-800 transition-all">Ir al Inicio</a>
            </div>
        </div>
    );

    const { user, competencies } = data;

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-10 animate-fadeIn">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200">
                <div className="bg-gradient-to-br from-[#647FBC] to-indigo-800 p-10 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                    <div className="relative z-10">
                        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter leading-tight">Micro-credenciales de Competencia</h1>
                        <p className="text-blue-100 text-sm mt-2 font-bold uppercase tracking-widest opacity-80">Documento Verificado Institucionalmente</p>
                    </div>
                </div>
                
                <div className="p-8 sm:p-12 space-y-10">
                    <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-50 p-6 rounded-3xl border border-slate-100 gap-6">
                        <div className="text-center sm:text-left">
                            <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Docente Acreditado</span>
                            <h2 className="text-2xl font-black text-slate-800 leading-tight">{user.names} {user.paternal_surname}</h2>
                            <p className="text-sm font-mono text-slate-500 mt-1">RUT: {user.rut}</p>
                        </div>
                        <div className="bg-emerald-100 text-emerald-700 px-6 py-3 rounded-2xl border-2 border-emerald-200 flex items-center gap-3">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            <span className="font-black text-xs uppercase tracking-widest">Acreditado</span>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Capacidades y Competencias</h3>
                        <div className="grid grid-cols-1 gap-4">
                            {competencies.map((comp: any) => (
                                <div key={comp.code} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-indigo-200 transition-colors group">
                                    <div className="w-14 h-14 bg-indigo-50 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        {comp.code}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {comp.dimension && <span className="block text-[8px] font-black text-slate-400 uppercase mb-0.5">{comp.dimension}</span>}
                                        <h4 className="font-bold text-slate-800 text-sm truncate uppercase tracking-tight">{comp.name}</h4>
                                        <div className="flex items-center gap-4 mt-1">
                                            <span className="text-[10px] text-emerald-600 font-black">{comp.hours} Horas Formativas</span>
                                            <span className="text-[10px] text-slate-400">• {comp.activities.length} programas aprobados</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-8 border-t border-slate-100 text-center space-y-4">
                        <p className="text-xs text-slate-500 leading-relaxed max-w-lg mx-auto">
                            Este reporte consolida las competencias obtenidas mediante la aprobación formal de programas académicos tributantes a la taxonomía UPLA.
                        </p>
                        <div className="font-mono text-[10px] text-slate-400 bg-slate-50 inline-block px-4 py-1 rounded-full border border-slate-100">
                            ID VERIFICACIÓN: {code}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};