
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Enrollment, SessionLog } from '../types';

interface StudentSignatureProps {
  enrollmentId: string;
  sessionId: string;
}

export const StudentSignature: React.FC<StudentSignatureProps> = ({ enrollmentId, sessionId }) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'signing' | 'success' | 'error'>('loading');
  const [sessionData, setSessionData] = useState<SessionLog | null>(null);
  const [advisorName, setAdvisorName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadSessionData();
  }, []);

  const loadSessionData = async () => {
    try {
      // 1. Obtener Inscripción
      const { data: enrollment, error } = await supabase
        .from('enrollments')
        .select('session_logs, activity_id, user_rut')
        .eq('id', enrollmentId)
        .single();

      if (error || !enrollment) throw new Error('No se encontró la sesión.');

      // 2. Buscar la sesión específica dentro del JSON
      const logs = enrollment.session_logs as SessionLog[];
      const session = logs.find(l => l.id === sessionId);

      if (!session) throw new Error('La sesión no existe o ya expiró.');
      if (session.verified) {
          setStatus('success'); // Ya estaba firmada
          return;
      }

      setSessionData(session);
      setAdvisorName(session.advisorName || 'Asesor UPLA');
      setStatus('ready');

    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  const handleSign = async () => {
    setStatus('signing');
    try {
      // 1. Re-fetch para asegurar atomicidad (básica)
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('session_logs')
        .eq('id', enrollmentId)
        .single();

      if (!enrollment) throw new Error("Error de conexión");

      const currentLogs = enrollment.session_logs as SessionLog[];
      
      // 2. Generar Hash de Verificación Real
      const verificationCode = `VER-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      const timestamp = new Date().toISOString();

      // 3. Actualizar el log específico
      const updatedLogs = currentLogs.map(log => {
          if (log.id === sessionId) {
              return { 
                  ...log, 
                  verified: true, 
                  verificationCode, 
                  signedAt: timestamp 
              };
          }
          return log;
      });

      // 4. Guardar en BD
      const { error } = await supabase
        .from('enrollments')
        .update({ session_logs: updatedLogs })
        .eq('id', enrollmentId);

      if (error) throw error;

      setStatus('success');

    } catch (err: any) {
      setStatus('error');
      setErrorMsg("No se pudo firmar. Intente nuevamente.");
    }
  };

  if (status === 'loading') {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
      );
  }

  if (status === 'error') {
      return (
          <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
              <div className="text-center">
                  <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">✕</div>
                  <h2 className="text-xl font-bold text-red-700 mb-2">Error</h2>
                  <p className="text-red-600">{errorMsg}</p>
              </div>
          </div>
      );
  }

  if (status === 'success') {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-green-50 p-6 text-center animate-fadeIn">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h1 className="text-2xl font-bold text-green-800 mb-2">¡Sesión Firmada!</h1>
              <p className="text-green-700 mb-8">La asistencia ha sido registrada correctamente en el sistema.</p>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-green-200 w-full max-w-sm">
                  <p className="text-xs text-slate-400 uppercase font-bold mb-1">Código de Autenticidad</p>
                  <p className="font-mono text-lg font-bold text-slate-700 tracking-wider">VERIFICADO</p>
              </div>
              <p className="mt-8 text-xs text-green-600/60">Ya puedes cerrar esta ventana.</p>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden mt-8">
            <div className="bg-indigo-600 p-6 text-white text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <h2 className="text-lg font-bold uppercase tracking-wide opacity-90 relative z-10">Confirmación de Asistencia</h2>
                <p className="text-indigo-200 text-xs mt-1 relative z-10">Sistema de Asesorías UPLA</p>
            </div>
            
            <div className="p-8 space-y-6">
                <div className="text-center space-y-1">
                    <p className="text-xs text-slate-400 font-bold uppercase">Asesor Responsable</p>
                    <p className="text-xl font-bold text-slate-800">{advisorName}</p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                        <span className="text-sm text-slate-500">Fecha</span>
                        <span className="text-sm font-bold text-slate-700">{sessionData?.date}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                        <span className="text-sm text-slate-500">Duración</span>
                        <span className="text-sm font-bold text-slate-700">{sessionData?.duration} min</span>
                    </div>
                    <div className="pt-1">
                        <span className="text-xs text-slate-400 block mb-1">Temática Tratada:</span>
                        <p className="text-sm text-slate-600 italic">"{sessionData?.observation}"</p>
                    </div>
                </div>

                <button 
                    onClick={handleSign}
                    disabled={status === 'signing'}
                    className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
                >
                    {status === 'signing' ? (
                        <>
                           <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           Firmando...
                        </>
                    ) : (
                        <>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Confirmar Asistencia
                        </>
                    )}
                </button>
                <p className="text-[10px] text-center text-slate-400">
                    Al confirmar, certificas que has participado en esta sesión de asesoría.
                </p>
            </div>
        </div>
    </div>
  );
};
