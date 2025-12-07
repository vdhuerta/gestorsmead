
import { createClient } from '@supabase/supabase-js';

// ==============================================================================================
// ⚠️ IMPORTANTE: REEMPLAZA ESTAS VARIABLES CON TUS DATOS REALES DE SUPABASE
// Ve a https://supabase.com/dashboard/project/_/settings/api y copia "Project URL" y "anon public"
// ==============================================================================================

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://hpjzfgwpegeinfsaffdq.supabase.co'; // Ej: https://xyz.supabase.co
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwanpmZ3dwZWdlaW5mc2FmZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0Mjg3NDksImV4cCI6MjA3NjAwNDc0OX0.cPgCt-8WBQyWPoAhwXQLjAkvFmY-ajEF8eTeLfO_3Tk'; // Ej: eyJhbGci...

// Validación básica para evitar errores silenciosos
if (SUPABASE_URL === 'https://hpjzfgwpegeinfsaffdq.supabase.co' || SUPABASE_ANON_KEY === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwanpmZ3dwZWdlaW5mc2FmZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0Mjg3NDksImV4cCI6MjA3NjAwNDc0OX0.cPgCt-8WBQyWPoAhwXQLjAkvFmY-ajEF8eTeLfO_3Tk') {
    console.warn("⚠️ ADVERTENCIA: No has configurado las credenciales de Supabase en services/supabaseClient.ts");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Función para probar si la conexión es exitosa.
 * Intenta leer la tabla 'users'. Si falla por red o auth, retorna false.
 */
export const checkConnection = async (): Promise<{ success: boolean; message?: string }> => {
    try {
        // Intentamos una lectura muy ligera (solo 1 fila, solo el campo rut)
        const { data, error } = await supabase.from('users').select('rut').limit(1);
        
        if (error) {
            console.error("Supabase Connection Error:", error);
            return { success: false, message: error.message };
        }
        
        return { success: true };
    } catch (e: any) {
        console.error("Network/Client Error:", e);
        return { success: false, message: e.message || 'Error de red' };
    }
};
