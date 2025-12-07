
import React, { useState } from 'react';
import { UserRole, User } from '../types';
import { useData } from '../context/DataContext'; // Usar contexto real para validar passwords

interface LoginSimulatorProps {
  onLogin: (user: User) => void;
}

export const LoginSimulator: React.FC<LoginSimulatorProps> = ({ onLogin }) => {
  const { users } = useData(); // Acceso a la base de datos real cargada en memoria
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
        const { email, password } = credentials;

        // 1. VALIDACIÓN ADMINISTRADOR MAESTRO (Hardcoded para seguridad de acceso)
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
            return;
        }

        // 2. VALIDACIÓN BASE DE DATOS (ASESORES)
        const dbUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (dbUser) {
            // Validar si tiene rol de Asesor o Admin
            if (dbUser.systemRole === UserRole.ASESOR || dbUser.systemRole === UserRole.ADMIN) {
                // Verificar password (simulación simple, en prod usar bcrypt)
                if (dbUser.password === password) {
                    onLogin(dbUser);
                    return;
                } else {
                    setError('Contraseña incorrecta.');
                }
            } else {
                setError('Este usuario no tiene perfil de administración. Ingrese como Estudiante.');
            }
        } else {
            setError('Usuario no encontrado.');
        }

        setIsLoading(false);
    }, 800);
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
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full border border-[#91ADC8]/30 mt-12 overflow-hidden">
        
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-10">
            <div className="w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center p-1 border-4 border-[#F9F8F6]">
                <img 
                    src="https://github.com/vdhuerta/assets-aplications/blob/main/Logo_SMEAD.png?raw=true" 
                    alt="Logo SMEAD" 
                    className="w-full h-full object-contain"
                />
            </div>
        </div>

        <div className="bg-[#647FBC] p-8 pt-16 text-center flex flex-col items-center">
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
                {isLoading ? 'Autenticando...' : 'Acceso Administrativo / Asesor'}
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
