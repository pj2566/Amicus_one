import React, { useState } from 'react';
import Icon from '../components/Icon';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await signup(email, password, name);
      localStorage.setItem('pending_name', name);
      navigate('/dashboard');
      toast.success('Account created! Welcome to Amicus One.');
    } catch (err) {
      toast.error(err.message || 'Signup failed');
      setLoading(false);
    }
  };

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
          <h2 className="auth-form-title">Create your lawyer account</h2>

          <div className="auth-free-badge">
            Free to start — 3 credits included
          </div>

          <div className="auth-field">
            <label className="auth-label">Full Name</label>
            <input
              type="text"
              className="auth-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Adv. Your Name"
              required
            />
          </div>

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
            <label className="auth-label">Password</label>
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              required
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-btn-loading">
                <span className="auth-spinner" /> Creating Account...
              </span>
            ) : 'Create Account →'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link-btn">Sign in</Link>
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