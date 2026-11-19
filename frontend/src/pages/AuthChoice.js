import React from 'react';
import Icon from '../components/Icon';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function AuthChoice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'login'; // 'login' or 'signup'
  const signup = mode === 'signup';

  const options = [
    {
      icon: 'users', title: 'Individual Advocate', path: signup ? '/signup' : '/login',
      desc: 'Solo advocates, consultants and law students. A personal workspace for drafting, research and translation.',
      tags: ['Guided Drafting', 'Statutory Research', 'Translation'],
      cta: signup ? 'Create advocate account' : 'Sign in as advocate'
    },
    {
      icon: 'building', title: 'Law Firm', path: signup ? '/firm/signup' : '/firm/login',
      desc: 'Chambers and legal teams. A shared workspace with member management, a shared document library and a pooled credit allowance.',
      tags: ['Team Members', 'Shared Documents', 'Credit Pool'],
      cta: signup ? 'Register your firm' : 'Sign in as firm'
    }
  ];

  return (
    <div className="am-auth">
      <div className="am-auth-brand">
        <div className="am-brand-mark"><Icon name="scale" size={18} /></div>
        <span className="am-brand-name">Amicus One</span>
      </div>

      <h1 className="am-title" style={{ textAlign: 'center' }}>{signup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="am-subtitle" style={{ textAlign: 'center' }}>
        {signup ? 'Choose how you will use Amicus One.' : 'Choose how you want to sign in.'}
      </p>

      <div className="am-choice-grid">
        {options.map(o => (
          <button key={o.title} className="am-choice" onClick={() => navigate(o.path)}>
            <div className="am-workflow-icon"><Icon name={o.icon} size={20} /></div>
            <div className="am-choice-title">{o.title}</div>
            <div className="am-choice-desc">{o.desc}</div>
            <div className="am-choice-tags">
              {o.tags.map(t => <span key={t} className="am-badge">{t}</span>)}
            </div>
            <div className="am-choice-cta">{o.cta} <Icon name="arrowRight" size={15} /></div>
          </button>
        ))}
      </div>

      <p className="am-auth-foot">
        Have an invite code from your firm?{' '}
        <button className="am-link" onClick={() => navigate('/firm/join')}>Join a firm</button>
      </p>
    </div>
  );
}
