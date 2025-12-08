import { createClient } from '@supabase/supabase-js';

// ==============================================================================================
// ⚠️ IMPORTANTE: CONFIGURACIÓN DE CONEXIÓN
// Soporte híbrido para Vite (import.meta.env) y Create React App (process.env)
// ==============================================================================================

// 1. Intentar leer variables de entorno (Vite tiene prioridad en entornos modernos)
// Usamos 'as any' para evitar errores de TS si el tipo ImportMeta no tiene 'env' definido
const ENV_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_URL) 
    || process.env.REACT_APP_SUPABASE_URL 
    || process.env.SUPABASE_URL;

const ENV_KEY = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_SUPABASE_ANON_KEY) 
    || process.env.REACT_APP_SUPABASE_ANON_KEY 
    || process.env.SUPABASE_ANON_KEY;

// 2. Valores por defecto (Fallback de seguridad / Demo)
const DEFAULT_URL = 'https://hpjzfgwpegeinfsaffdq.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwanpmZ3dwZWdlaW5mc2FmZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0Mjg3NDksImV4cCI6MjA3NjAwNDc0OX0.cPgCt-8WBQyWPoAhwXQLjAkvFmY-ajEF8eTeLfO_3Tk';

// Función segura para validar URLs
const getValidUrl = (url: string | undefined, fallback: string): string => {
    try {
        if (!url || url.trim() === '') return fallback;
        new URL(url); 
        return url;
    } catch (e) {
        console.warn(`URL Supabase inválida: "${url}". Usando fallback.`);
        return fallback;
    }
};

const SUPABASE_URL = getValidUrl(ENV_URL, DEFAULT_URL);
const SUPABASE_ANON_KEY = ENV_KEY || DEFAULT_KEY;

// Inicialización del cliente
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true, // Mantiene la sesión (si la hubiera)
        autoRefreshToken: true,
    },
    realtime: {
        params: {
            eventsPerSecond: 10, // Evita saturación en redes lentas
        }
    }
});

/**
 * Función para probar si la conexión es exitosa.
 */
export const checkConnection = async (): Promise<{ success: boolean; message?: string }> => {
    try {
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