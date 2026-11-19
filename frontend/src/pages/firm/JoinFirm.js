import React, { useState } from 'react';
import Icon from '../../components/Icon';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import toast from 'react-hot-toast';

export default function JoinFirm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    inviteCode: '',
    name: '',
    email: '',
    password: '',
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
      const res = await api.firmJoinWithCode({ ...form, inviteCode: form.inviteCode.trim() });
      toast.success(res.data.message || 'Joined firm! Please sign in.');
      navigate('/firm/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to join firm');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card-new" style={{background: 'var(--bg-secondary)', borderColor: 'var(--border-color)'}}>
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon"><Icon name="building" /></div>
          <h1 className="auth-brand">Amicus One</h1>
          <p className="auth-tagline">Join Your Law Firm</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <h2 className="auth-form-title">Join with invite code</h2>

          <div className="auth-field">
            <label className="auth-label">Invite Code</label>
            <input
              type="text"
              name="inviteCode"
              className="auth-input"
              value={form.inviteCode}
              onChange={handleChange}
              placeholder="Code shared by your firm admin"
              style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Your Name</label>
            <input
              type="text"
              name="name"
              className="auth-input"
              value={form.name}
              onChange={handleChange}
              placeholder="Adv. Your Name"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              type="email"
              name="email"
              className="auth-input"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
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

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-btn-loading">
                <span className="auth-spinner" /> Joining Firm...
              </span>
            ) : 'Join Firm →'}
          </button>
        </form>

        <p className="auth-footer">
          Already a member?{' '}
          <Link to="/firm/login" className="auth-link-btn">Sign in</Link>
        </p>
        <p className="auth-footer">
          Registering a new firm?{' '}
          <Link to="/firm/signup" className="auth-link-btn">Create firm account</Link>
        </p>
      </div>
    </div>
  );
}
