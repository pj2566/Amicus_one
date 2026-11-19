import React, { useState } from 'react';
import Icon from '../../components/Icon';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabase';
import toast from 'react-hot-toast';

export default function FirmLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const { login, forgotPassword } = useAuth();
  const navigate = useNavigate();

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error('Please enter your email');
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      toast.success('Password reset email sent! Check your inbox.');
      setForgotMode(false);
    } catch (err) {
      toast.error(err.message || 'Failed to send reset email');
    }
    setForgotLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/firm/dashboard');
    } catch (err) {
      toast.error(err.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card-new" style={{
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)'
}}>
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon"><Icon name="building" /></div>
          <h1 className="auth-brand">Amicus One</h1>
          <p className="auth-tagline">Law Firm Workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <h2 className="auth-form-title">Sign in to your firm</h2>

          <div className="auth-field">
            <label className="auth-label">Email Address</label>
            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="firm@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="auth-label">Password</label>
              <button
                type="button"
                onClick={() => setForgotMode(true)}
                style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-btn-loading">
                <span className="auth-spinner" /> Signing in...
              </span>
            ) : 'Sign In to Firm →'}
          </button>
        </form>

        <p className="auth-footer">
          New firm?{' '}
          <Link to="/firm/signup" className="auth-link-btn">Register your firm</Link>
        </p>
        <p className="auth-footer">
          Joining with invite code?{' '}
          <Link to="/firm/join" className="auth-link-btn">Join a firm</Link>
        </p>
        <p className="auth-footer" style={{ marginTop: '0.5rem' }}>
          Individual lawyer?{' '}
          <Link to="/login" className="auth-link-btn">Login here</Link>
        </p>

        <div className="auth-features">
          <div className="auth-feature-item">Firm Dashboard</div>
          <div className="auth-feature-item">Team Management</div>
          <div className="auth-feature-item">Shared Documents</div>
          <div className="auth-feature-item">Firm Analytics</div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotMode && (
        <div className="modal-overlay" onClick={() => setForgotMode(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Reset Password</h3>
              <button className="modal-close" onClick={() => setForgotMode(false)}>×</button>
            </div>
            <form onSubmit={handleForgotPassword} style={{ padding: '1.5rem' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Enter your firm email address and we'll send you a password reset link.
              </p>
              <div className="auth-field">
                <label className="auth-label">Firm Email</label>
                <input
                  type="email"
                  className="auth-input"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="firm@example.com"
                  required
                />
              </div>
              <button
                type="submit"
                className="auth-submit-btn"
                disabled={forgotLoading}
                style={{ marginTop: '1rem' }}
              >
                {forgotLoading ? 'Sending...' : 'Send Reset Link →'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}