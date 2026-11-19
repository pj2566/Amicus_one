import React, { useState } from 'react';
import Icon from '../components/Icon';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { login, forgotPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      if (err.message === 'UNVERIFIED_EMAIL') {
        localStorage.setItem('pending_email', email);
        toast.error('Please verify your email first.');
        navigate('/verify-email');
      } else {
        toast.error(err.message || 'Login failed');
      }
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail) {
      toast.error('Please enter your email');
      return;
    }
    setForgotLoading(true);
    try {
      await forgotPassword(forgotEmail);
      setForgotSent(true);
      toast.success('Reset link sent! Check your inbox.');
    } catch (err) {
      toast.error(err.message || 'Failed to send reset email');
    }
    setForgotLoading(false);
  };

  // Forgot Password View
  if (showForgot) {
    return (
      <div className="auth-page">
        <div className="auth-card-new" data-theme="light">
          <div className="auth-logo-wrap">
            <div className="auth-logo-icon"><Icon name="lock" /></div>
            <h1 className="auth-brand">Amicus One</h1>
          <p className="auth-tagline">Reset your password</p>
          </div>

          {forgotSent ? (
            <div className="forgot-sent-wrap">
              <div className="forgot-sent-icon"><Icon name="checkCircle" /></div>
              <h3 className="forgot-sent-title">Reset link sent!</h3>
              <p className="forgot-sent-desc">
                Check your email inbox for the password reset link.
                It may take a few minutes to arrive.
              </p>
              <button
                className="auth-submit-btn"
                onClick={() => {
                  setShowForgot(false);
                  setForgotSent(false);
                  setForgotEmail('');
                }}
              >
                ← Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="auth-form">
              <h2 className="auth-form-title">Forgot your password?</h2>
              <p className="auth-form-desc">
                Enter your email and we'll send you a reset link.
              </p>

              <div className="auth-field">
                <label className="auth-label">Email Address</label>
                <input
                  type="email"
                  className="auth-input"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="lawyer@example.com"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={forgotLoading}
              >
                {forgotLoading ? '⏳ Sending...' : 'Send Reset Link →'}
              </button>

              <button
                type="button"
                className="auth-back-btn"
                onClick={() => setShowForgot(false)}
              >
                ← Back to Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Main Login View
  return (
    <div className="auth-page">
      <div className="auth-card-new" data-theme="light">

        {/* Logo */}
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon"><Icon name="scale" /></div>
          <h1 className="auth-brand">Amicus One</h1>
          <p className="auth-tagline">Chambers workspace for Indian advocates</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <h2 className="auth-form-title">Sign in to your account</h2>

          <div className="auth-field">
            <label className="auth-label">Email Address</label>
            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="lawyer@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label className="auth-label">Password</label>
              <button
                type="button"
                className="auth-forgot-link"
                onClick={() => setShowForgot(true)}
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
            ) : 'Sign In →'}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account?{' '}
          <Link to="/signup" className="auth-link-btn">Create account</Link>
        </p>

        {/* Features */}
        <div className="auth-features">
          <div className="auth-feature-item">Guided Drafting</div>
          <div className="auth-feature-item">Statutory Research</div>
          <div className="auth-feature-item">Vernacular Translation</div>
          <div className="auth-feature-item">64 Standard Instruments</div>
        </div>

      </div>
    </div>
  );
}