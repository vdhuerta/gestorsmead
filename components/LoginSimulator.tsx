
import React, { useState } from 'react';
import { UserRole, User } from '../types';
import { useData } from '../context/DataContext';
import { supabase } from '../services/supabaseClient'; // Importar cliente para fallback

interface LoginSimulatorProps {
  onLogin: (user: User) => void;
}

export const LoginSimulator: React.FC<LoginSimulatorProps> = ({ onLogin }) => {
  const { users } = useData(); 
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
        const { email, password } = credentials;

        // 1. VALIDACIÓN ADMINISTRADOR MAESTRO (Hardcoded para seguridad de acceso/rescate)
        if (email === 'admin@upla.cl' && password === '112358') {
            const adminUser: User = {
                rut: '1-9',
                names: 'Víctor',
                paternalSurname: 'Huerta',
                maternalSurname: '',
                email: 'admin@upla.cl',
                systemRole: UserRole.ADMIN,
                photoUrl: 'https://github.com/vdhuerta/assets-aplications/blob/main/Foto%20Vi%CC%81ctor%20Huerta.JPG?raw=true'
            };
            onLogin(adminUser);
            setIsLoading(false);
            return;
        }

        // 2. VALIDACIÓN BASE DE DATOS (ASESORES / ADMINS / DOCENTES)
        
        // A. Intento 1: Buscar en Memoria (Contexto Global)
        // Esto es rápido, pero puede fallar si la carga inicial de "users" aún no termina.
        let foundUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());

        // B. Intento 2: Fallback directo a Supabase (Si no está en memoria)
        // Esto soluciona el problema de latencia o listas incompletas en la carga inicial.
        if (!foundUser) {
             try {
                 const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .ilike('email', email)
                    .limit(1) // CRITICAL FIX: Limit to 1 to handle potential duplicates if constraint is dropped
                    .maybeSingle(); // CRITICAL FIX: Use maybeSingle() instead of single() to avoid error on multiples
                 
                 if (data) {
                     // Mapear de snake_case a camelCase para uso interno
                     foundUser = {
                         rut: data.rut,
                         names: data.names,
                         paternal_surname: data.paternal_surname,
                         maternal_surname: data.maternal_surname,
                         email: data.email,
                         phone: data.phone,
                         photoUrl: data.photo_url,
                         systemRole: data.system_role,
                         password: data.password, // Asegurar lectura de password
                         academicRole: data.academic_role,
                         faculty: data.faculty,
                         department: data.department,
                         career: data.career,
                         contractType: data.contract_type,
                         teachingSemester: data.teaching_semester,
                         campus: data.campus,
                         title: data.title
                     } as any;
                 }
             } catch (fetchError) {
                 console.warn("Fallback login fetch failed (Offline?):", fetchError);
                 // Don't error out, just continue to check if we found a user or not
             }
        }

        // 3. Verificación de Credenciales
        if (foundUser) {
            // Validar si tiene rol permitido para Login con Password
            if (foundUser.systemRole === UserRole.ASESOR || foundUser.systemRole === UserRole.ADMIN) {
                // Verificar password
                if (foundUser.password === password) {
                    onLogin(foundUser);
                    return;
                } else {
                    setError('Contraseña incorrecta.');
                }
            } else {
                setError('Este usuario no tiene perfil de administración. Ingrese como Estudiante.');
            }
        } else {
            setError('Usuario no encontrado en la Base de Datos.');
        }

    } catch (err) {
        console.error("Login Error:", err);
        setError("Error de conexión al intentar validar credenciales.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleGuestAccess = () => {
      // Mock estudiante para visita rápida
      const studentUser: User = {
          rut: '9.876.543-2',
          names: 'Estudiante',
          paternalSurname: 'Invitado',
          maternalSurname: '',
          email: 'estudiante@upla.cl',
          systemRole: UserRole.ESTUDIANTE,
          academicRole: 'Estudiante',
          career: 'Pedagogía General'
      };
      onLogin(studentUser);
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center p-4">
      {/* SE ELIMINÓ overflow-hidden DE AQUÍ PARA QUE EL LOGO NO SE CORTE */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full border border-[#91ADC8]/30 mt-12">
        
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-10">
            <div className="w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center p-1 border-4 border-[#F9F8F6]">
                <img 
                    src="https://github.com/vdhuerta/assets-aplications/blob/main/Logo_SMEAD.png?raw=true" 
                    alt="Logo SMEAD" 
                    className="w-full h-full object-contain"
                />
            </div>
        </div>

        <div className="bg-[#647FBC] p-8 pt-16 text-center flex flex-col items-center rounded-t-2xl">
          <h1 className="text-2xl font-bold text-white mb-1">GestorSMEAD</h1>
          <p className="text-blue-100 text-sm">Plataforma de Gestión Académica</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Correo Institucional</label>
                  <input 
                    type="email" 
                    name="email"
                    required
                    placeholder="admin@upla.cl"
                    value={credentials.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:bg-white text-sm"
                  />
              </div>

              <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Contraseña</label>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    name="password"
                    required
                    placeholder="••••••••"
                    value={credentials.password}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:bg-white text-sm"
                  />
                  <div className="flex justify-end mt-1">
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-xs text-slate-400 hover:text-slate-600">
                          {showPassword ? 'Ocultar' : 'Mostrar'}
                      </button>
                  </div>
              </div>

              {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs p-3 rounded-lg flex items-center gap-2 animate-fadeIn">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {error}
                  </div>
              )}

              <button type="submit" disabled={isLoading} className="w-full bg-[#647FBC] text-white py-3 rounded-lg font-bold text-sm hover:bg-blue-800 transition-colors shadow-md disabled:opacity-70 flex justify-center items-center gap-2">
                {isLoading ? (
                    <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Verificando...
                    </>
                ) : (
                    'Acceso Administrativo / Asesor'
                )}
              </button>
          </form>

          <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
              <div className="relative flex justify-center text-xs"><span className="px-2 bg-white text-slate-400">Acceso Público</span></div>
          </div>

          <button onClick={handleGuestAccess} className="w-full border border-slate-200 bg-white text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            Ingresar como Estudiante (Solo Consulta)
          </button>
        </div>
      </div>
    </div>
  );
};
