import React, { useState } from 'react';
import Icon from '../../components/Icon';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import toast from 'react-hot-toast';

export default function FirmSignup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [form, setForm] = useState({
    firmName: '',
    adminName: '',
    email: '',
    password: '',
    barCouncilNumber: '',
  });

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await api.firmSignup(form);
      toast.success('Firm registered! Please sign in.');
      navigate('/firm/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Signup failed');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card-new" style={{background: 'var(--bg-secondary)', borderColor: 'var(--border-color)'}}>
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon"><Icon name="building" /></div>
          <h1 className="auth-brand">Amicus One</h1>
          <p className="auth-tagline">Register Your Law Firm</p>
        </div>

        {registered ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div style={{ marginBottom: '1rem', color: 'var(--am-green)' }}><Icon name="checkCircle" size={40} /></div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Firm Registered!</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
              A verification email has been sent to <strong>{form.email}</strong>
            </p>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Please verify your email before signing in.
            </p>
            <button
              className="auth-submit-btn"
              onClick={() => navigate('/firm/login')}
            >
              Go to Firm Login →
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <h2 className="auth-form-title">Create firm account</h2>

          <div className="auth-free-badge">
            10 free credits included on signup
          </div>

          <div className="auth-field">
            <label className="auth-label">Firm Name</label>
            <input
              type="text"
              name="firmName"
              className="auth-input"
              value={form.firmName}
              onChange={handleChange}
              placeholder="e.g. Sharma & Associates"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Admin Name (Your Name)</label>
            <input
              type="text"
              name="adminName"
              className="auth-input"
              value={form.adminName}
              onChange={handleChange}
              placeholder="Adv. Your Name"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Firm Email</label>
            <input
              type="email"
              name="email"
              className="auth-input"
              value={form.email}
              onChange={handleChange}
              placeholder="firm@example.com"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input
              type="password"
              name="password"
              className="auth-input"
              value={form.password}
              onChange={handleChange}
              placeholder="Minimum 6 characters"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">
              Bar Council Registration Number{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(Optional)</span>
            </label>
            <input
              type="text"
              name="barCouncilNumber"
              className="auth-input"
              value={form.barCouncilNumber}
              onChange={handleChange}
              placeholder="e.g. MH/1234/2020"
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-btn-loading">
                <span className="auth-spinner" /> Creating Firm Account...
              </span>
            ) : 'Register Firm →'}
          </button>
        </form>

        )}
        {!registered && (
          <>
        <p className="auth-footer">
          Already registered?{' '}
          <Link to="/firm/login" className="auth-link-btn">Sign in</Link>
        </p>
        <p className="auth-footer">
          Individual lawyer?{' '}
          <Link to="/signup" className="auth-link-btn">Sign up here</Link>
        </p>
          </>
        )}

        <div className="auth-features">
          <div className="auth-feature-item">Firm Dashboard</div>
          <div className="auth-feature-item">Team Management</div>
          <div className="auth-feature-item">Shared Documents</div>
          <div className="auth-feature-item">Firm Analytics</div>
        </div>
      </div>
    </div>
  );
}