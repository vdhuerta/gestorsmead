
import { createClient } from '@supabase/supabase-js';

// NOTA: En un entorno de producción real (Vite/Next.js), estas variables vendrían de import.meta.env o process.env
// Para este prototipo, dejaremos placeholders que el usuario debe reemplazar o configurar.

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://hpjzfgwpegeinfsaffdq.supabase.co';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwanpmZ3dwZWdlaW5mc2FmZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0Mjg3NDksImV4cCI6MjA3NjAwNDc0OX0.cPgCt-8WBQyWPoAhwXQLjAkvFmY-ajEF8eTeLfO_3Tk';

// Singleton del cliente
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Helper para verificar conexión
 */
export const checkConnection = async () => {
    try {
        const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error conectando a Supabase:", e);
        return false;
    }
};
