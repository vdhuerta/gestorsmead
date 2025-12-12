
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Enrollment, User, Activity } from '../types';

export const CertificateVerification: React.FC<{ code: string }> = ({ code }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ enrollment: Enrollment, user: User, activity: Activity } | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const verify = async () => {
            try {
                // Fetch enrollment by certificate_code
                const { data: enrData, error: enrError } = await supabase
                    .from('enrollments')
                    .select('*, user:users(*), activity:activities(*)')
                    .eq('certificate_code', code)
                    .single();

                if (enrError || !enrData) throw new Error('Certificado no encontrado o código inválido.');

                // Map data (simplified mapping for display)
                const enrollment = {
                    ...enrData,
                    certificateCode: enrData.certificate_code,
                    finalGrade: enrData.final_grade,
                    attendancePercentage: enrData.attendance_percentage
                } as any; // Cast generic for UI

                const user = {
                    names: enrData.user.names,
                    paternalSurname: enrData.user.paternal_surname,
                    maternalSurname: enrData.user.maternal_surname,
                    rut: enrData.user.rut
                } as User;

                const activity = {
                    name: enrData.activity.name,
                    year: enrData.activity.year,
                    hours: enrData.activity.hours,
                    modality: enrData.activity.modality,
                    endDate: enrData.activity.end_date
                } as Activity;

                setData({ enrollment, user, activity });

            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (code) verify();
        else { setError('Código no proporcionado'); setLoading(false); }
    }, [code]);

    if (loading) return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#647FBC]"></div>
        </div>
    );

    if (error || !data) return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full border-t-4 border-red-500">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Verificación Fallida</h2>
                <p className="text-slate-600 mb-6">{error}</p>
                <a href="/" className="text-[#647FBC] hover:underline text-sm font-bold">Ir al Inicio</a>
            </div>
        </div>
    );

    const { user, activity, enrollment } = data;

    return (
        <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
                <div className="bg-[#647FBC] p-6 text-white text-center">
                    <h1 className="text-xl font-bold uppercase tracking-widest">Certificado Válido</h1>
                    <p className="text-blue-100 text-sm mt-1">Unidad de Acompañamiento Docente</p>
                </div>
                
                <div className="p-8 space-y-6">
                    <div className="text-center">
                        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">Certificación Académica</h2>
                        <span className="inline-block bg-slate-100 text-slate-500 text-xs px-3 py-1 rounded-full mt-2 font-mono border border-slate-200">
                            {enrollment.certificateCode}
                        </span>
                    </div>

                    <div className="space-y-4 border-t border-slate-100 pt-6">
                        <div>
                            <span className="block text-xs font-bold text-slate-400 uppercase">Estudiante</span>
                            <p className="text-slate-800 font-bold text-lg leading-tight">{user.names} {user.paternalSurname} {user.maternalSurname}</p>
                            <p className="text-slate-500 text-sm">{user.rut}</p>
                        </div>
                        
                        <div>
                            <span className="block text-xs font-bold text-slate-400 uppercase">Actividad Formativa</span>
                            <p className="text-[#647FBC] font-bold text-lg leading-tight">{activity.name}</p>
                            <div className="flex gap-4 mt-1 text-sm text-slate-600">
                                <span>{activity.year}</span>
                                <span>• {activity.hours} Horas</span>
                                <span>• {activity.modality}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                            <div>
                                <span className="block text-xs font-bold text-slate-400 uppercase">Nota Final</span>
                                <span className="text-slate-800 font-bold">{enrollment.finalGrade || '-'}</span>
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-slate-400 uppercase">Asistencia</span>
                                <span className="text-slate-800 font-bold">{enrollment.attendancePercentage || 0}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="text-center pt-4">
                        <p className="text-xs text-slate-400">
                            Este documento ha sido verificado digitalmente por el sistema de gestión académica de la Universidad de Playa Ancha.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
