import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { api } from '../api';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        api.getProfile()
          .then(res => setUserProfile(res.data.user))
          .catch(err => console.error('profile err:', err))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
        } else {
          setUser(null);
          setUserProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email, password
    });
    if (error) throw error;
    const profile = await api.getProfile().catch(() => null);
    const isFirmMember = profile?.data?.user?.is_firm_member;
    if (!data.user.email_confirmed_at && !isFirmMember) {
      await supabase.auth.signOut();
      throw new Error('UNVERIFIED_EMAIL');
    }
    setUser(data.user);
    try {
      const res = await api.getProfile();
      setUserProfile(res.data.user);
    } catch (e) {
      console.error('profile fetch err:', e);
    }
    return data;
  };

  const signup = async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`
      }
    });
    if (error) throw error;
    if (name) localStorage.setItem('pending_name', name);
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    try {
      const res = await api.getProfile();
      setUserProfile(res.data.user);
    } catch (e) {
      console.error('refresh err:', e);
    }
  };

  const forgotPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    if (error) throw error;
  };

  const resetPassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
  };

  const isEmailVerified = () => !!user?.email_confirmed_at;

  return (
    <AuthContext.Provider value={{
      user, userProfile, loading,
      login, signup, logout, refreshProfile,
      forgotPassword, resetPassword, isEmailVerified
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};