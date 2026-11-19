import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we have a valid recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true);
      } else {
        toast.error('Invalid or expired reset link');
        navigate('/login');
      }
    });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(password);
      toast.success('Password updated successfully!');
      navigate('/login');
    } catch (err) {
      toast.error(err.message || 'Failed to reset password');
    }
    setLoading(false);
  };

  if (!validSession) return null;

  return (
    <div className="auth-page">
      <div className="auth-card-new" data-theme="light">
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon"><Icon name="lock" /></div>
          <h1 className="auth-brand">Reset Password</h1>
          <p className="auth-tagline">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">New Password</label>
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Confirm New Password</label>
            <input
              type="password"
              className="auth-input"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat your new password"
              required
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? '⏳ Updating...' : 'Update Password →'}
          </button>
        </form>
      </div>
    </div>
  );
}