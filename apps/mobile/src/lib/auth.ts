import { useEffect, useState } from 'react';
import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { crossDomainAuthStorage } from './crossDomainAuthStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Single Supabase project shared across all *.tourneypilot.com apps. The session
// is persisted to a .tourneypilot.com cookie (see crossDomainAuthStorage) so a
// login on any TourneyPilot-family app is recognised here automatically.
export const supabase: SupabaseClient | null =
    supabaseUrl && supabasePublishableKey
        ? createClient(supabaseUrl, supabasePublishableKey, {
              auth: {
                  persistSession: true,
                  autoRefreshToken: true,
                  detectSessionInUrl: true,
                  storage: crossDomainAuthStorage,
              },
          })
        : null;

export interface AuthState {
    user: User | null;
    session: Session | null;
    loading: boolean;
    isConfigured: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(Boolean(supabase));

    useEffect(() => {
        if (!supabase) return;
        let active = true;
        void supabase.auth.getSession().then(({ data }) => {
            if (!active) return;
            setSession(data.session);
            setLoading(false);
        });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
            setSession(next);
            setLoading(false);
        });
        return () => {
            active = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    return {
        user: session?.user ?? null,
        session,
        loading,
        isConfigured: Boolean(supabase),
        signInWithGoogle: async () => {
            if (!supabase) return;
            await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin },
            });
        },
        signOut: async () => {
            await supabase?.auth.signOut();
        },
    };
}