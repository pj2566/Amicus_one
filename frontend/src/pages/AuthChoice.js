import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function AuthChoice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'login'; // 'login' or 'signup'

return (
    <div className="auth-page">
      <div className="auth-choice-wrap">

        {/* Logo */}
        <div className="auth-choice-logo">
          <div style={{ fontSize: '2.5rem' }}>⚖️</div>
          <h1 className="auth-brand" style={{ fontSize: '1.8rem' }}>Amicus One</h1>
          <p className="auth-tagline">The Modern AI Workspace for Legal Professionals</p>
        </div>

        <h2 className="auth-choice-title">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="auth-choice-sub">
          {mode === 'signup'
            ? 'Choose how you want to use Amicus One'
            : 'Choose how you want to sign in'}
        </p>

        <div className="auth-choice-grid">

          {/* Individual Lawyer */}
          <div
            className="auth-choice-card"
            onClick={() => navigate(mode === 'signup' ? '/signup' : '/login')}
          >
            <div style={{ fontSize: '2.2rem' }}>👤</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
              Individual Lawyer
            </div>
            <div style={{ fontSize: '0.85rem', color: '#cccccc', lineHeight: 1.65, flex: 1 }}>
              Solo advocates, legal consultants, and law students.
              Personal workspace with AI drafting and research tools.
            </div>
            <div className="auth-choice-tags">
              <span className="auth-choice-tag">✍️ AI Drafting</span>
              <span className="auth-choice-tag">⚖️ LawGPT</span>
              <span className="auth-choice-tag">🌐 Translator</span>
            </div>
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 600,
              textAlign: 'center',
              background: 'var(--accent)',
              color: '#ffffff',
              border: '1.5px solid var(--accent)',
            }}>
              {mode === 'signup' ? 'Sign Up as Lawyer →' : 'Login as Lawyer →'}
            </div>
          </div>

          {/* Law Firm */}
          <div
            className="auth-choice-card auth-choice-card-firm"
            onClick={() => navigate(mode === 'signup' ? '/firm/signup' : '/firm/login')}
          >
            <div style={{ fontSize: '2.2rem' }}>🏛️</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
              Law Firm
            </div>
            <div style={{ fontSize: '0.85rem', color: '#cccccc', lineHeight: 1.65, flex: 1 }}>
              Law firms and legal teams. Shared workspace with team
              management, shared documents, and firm-wide analytics.
            </div>
            <div className="auth-choice-tags">
              <span className="auth-choice-tag">👥 Team Management</span>
              <span className="auth-choice-tag">📁 Shared Docs</span>
              <span className="auth-choice-tag">📊 Analytics</span>
            </div>
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 600,
              textAlign: 'center',
              background: 'var(--accent)',
              color: '#ffffff',
              border: '1.5px solid var(--accent)',
            }}>
              {mode === 'signup' ? 'Register Your Firm →' : 'Login as Firm →'}
            </div>
          </div>

        </div>

        {/* Join with code */}
        <p className="auth-choice-footer">
          Got an invite code?{' '}
          <button
            className="auth-link-btn"
            onClick={() => navigate('/firm/join')}
          >
            Join a firm →
          </button>
        </p>

      </div>
    </div>
  );
}