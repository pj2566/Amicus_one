import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

const WORKFLOWS = [
  { icon: 'file', title: 'Guided Legal Drafting', text: 'Pick from 64 standard Indian instruments across 12 practice areas. Fill the particulars and watch the A4 engrossment assemble beside the form, then generate the complete instrument.' },
  { icon: 'search', title: 'Statutory Research', text: 'Ask about the BNS, BNSS or BSA. Answers are drawn from the official Gazette text, every section cited is checked, and old IPC/CrPC equivalents are noted.' },
  { icon: 'swap', title: 'Courtroom Translation', text: 'Translate deeds, notices and orders between English and Hindi, Marathi, Bengali, Tamil and seven more Indian languages — scanned PDFs and photos included.' },
  { icon: 'clipboard', title: 'Comparative Draft Audit', text: 'Upload up to five versions of an agreement. Clause-by-clause comparison, missing protections and risk, with every quotation traced back to the drafts.' },
];

const TRUST = [
  { icon: 'book', title: 'Official statutory text', text: 'All 1,059 sections of the BNS, BNSS and BSA as published in the Gazette of India — not summaries.' },
  { icon: 'checkCircle', title: 'Every citation verified', text: 'Section and sub-section numbers in each answer are checked against that text before you see them.' },
  { icon: 'shield', title: 'No invented case law', text: 'Research answers never cite judgments, so there are no fabricated case names or citations to catch.' },
  { icon: 'scale', title: 'Old and new law by date', text: 'Offences before 1 July 2024 are treated under the IPC, later ones under the BNS, with the savings provisions applied.' },
];

const PLANS = [
  { plan: 'Free', price: '₹0', period: '/month', credits: '3 documents/month', features: ['Guided drafting', 'Statutory research', 'PDF & Word download', 'Basic support'], cta: 'Get Started Free', highlight: false },
  { plan: 'Starter', price: '₹299', period: '/month', credits: '20 documents/month', features: ['Everything in Free', 'Priority generation', 'Document history', 'Email support'], cta: 'Coming Soon', highlight: true },
  { plan: 'Pro', price: '₹699', period: '/month', credits: 'Unlimited documents', features: ['Everything in Starter', 'Client directory', 'Multi-language drafts', 'Priority support'], cta: 'Coming Soon', highlight: false },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const signup = () => navigate('/auth?mode=signup');

  return (
    <div className="am-landing">
      {/* Nav */}
      <header className="am-lp-nav">
        <div className="am-lp-wrap am-lp-nav-inner">
          <button className="am-lp-brand" onClick={() => navigate('/')}>
            <span className="am-brand-mark"><Icon name="scale" size={17} /></span>
            <span className="am-brand-name">Amicus One</span>
          </button>
          <nav className="am-lp-links">
            <a href="#workflows">Workflows</a>
            <a href="#trust">Why it is reliable</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="am-lp-actions">
            <button className="am-btn" onClick={() => navigate('/auth?mode=login')}>Log in</button>
            <button className="am-btn am-btn-primary" onClick={signup}>Get started</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="am-lp-hero am-lp-wrap">
        <div className="am-eyebrow">For Indian advocates & chambers</div>
        <h1 className="am-lp-title">A chambers desk for drafting, statutory research and translation.</h1>
        <p className="am-lp-lede">
          Amicus One prepares standard Indian instruments, answers questions from the official text of the
          BNS, BNSS and BSA with verified citations, and translates documents across Indian languages.
        </p>
        <div className="am-lp-cta">
          <button className="am-btn am-btn-primary am-lp-cta-btn" onClick={signup}>Start drafting free <Icon name="arrowRight" size={16} /></button>
          <button className="am-btn am-lp-cta-btn" onClick={() => navigate('/auth?mode=login')}>Sign in</button>
        </div>

        {/* Product preview */}
        <div className="am-lp-preview">
          <div className="am-lp-preview-bar"><span /><span /><span /><em>amicusone.web.app/dashboard</em></div>
          <div className="am-lp-preview-body">
            <div className="am-lp-preview-side">
              <div className="am-lp-preview-brand"><span className="am-brand-mark" style={{ width: 24, height: 24 }}><Icon name="scale" size={13} /></span> Amicus One</div>
              {['Overview', 'Drafting Studio', 'Legal Research', 'Vernacular Translator', 'Redline & Review'].map((l, i) => (
                <div key={l} className={`am-lp-preview-nav ${i === 0 ? 'active' : ''}`}>{l}</div>
              ))}
            </div>
            <div className="am-lp-preview-main">
              <div className="am-eyebrow" style={{ fontSize: 10 }}>Thursday, 12 November 2026</div>
              <div className="am-lp-preview-greeting">Good afternoon, Adv. Sharma</div>
              <div className="am-lp-preview-stats">
                {[['Drafts Prepared', '28'], ['Client Directory', '11'], ['Research Briefs', '19'], ['Allowance', '14']].map(([l, v]) => (
                  <div key={l}><div className="am-lp-preview-label">{l}</div><div className="am-lp-preview-value">{v}</div></div>
                ))}
              </div>
              {[['Residential Leave & License Agreement', 'Property Law'], ['Notice under Section 138 NI Act', 'Civil Litigation'], ['Founders’ Vesting & Shareholders Agreement', 'Corporate Law']].map(([t, a]) => (
                <div key={t} className="am-lp-preview-row"><span>{t}</span><span className="am-badge">{a}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="am-lp-numbers">
        <div className="am-lp-wrap am-lp-numbers-grid">
          {[['12', 'Practice areas'], ['64', 'Standard instruments'], ['1,059', 'Statutory sections, verified'], ['12', 'Languages for translation']].map(([n, l]) => (
            <div key={l}><div className="am-lp-number">{n}</div><div className="am-lp-number-label">{l}</div></div>
          ))}
        </div>
      </section>

      {/* Workflows */}
      <section className="am-lp-section am-lp-wrap" id="workflows">
        <div className="am-eyebrow">Chambers workflows</div>
        <h2 className="am-lp-h2">Four tools that fit how a practice runs</h2>
        <div className="am-lp-grid-2">
          {WORKFLOWS.map(w => (
            <div key={w.title} className="am-lp-card">
              <div className="am-workflow-icon"><Icon name={w.icon} size={19} /></div>
              <h3 className="am-lp-h3">{w.title}</h3>
              <p className="am-lp-text">{w.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="am-lp-band" id="trust">
        <div className="am-lp-wrap am-lp-section">
          <div className="am-eyebrow">Why it is reliable</div>
          <h2 className="am-lp-h2">Built to avoid the mistakes generic AI makes</h2>
          <div className="am-lp-grid-4">
            {TRUST.map(t => (
              <div key={t.title}>
                <div className="am-lp-trust-icon"><Icon name={t.icon} size={18} /></div>
                <h3 className="am-lp-h3" style={{ fontSize: 17 }}>{t.title}</h3>
                <p className="am-lp-text">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Translation example */}
      <section className="am-lp-section am-lp-wrap am-lp-split">
        <div>
          <div className="am-eyebrow">Vernacular translator</div>
          <h2 className="am-lp-h2">Translate legal documents without losing context</h2>
          <p className="am-lp-text" style={{ fontSize: 16 }}>
            Long documents are translated section by section with the preceding text carried forward, so parties,
            defined terms and numbering stay consistent across every page. Works in both directions.
          </p>
          <button className="am-btn am-btn-primary" style={{ marginTop: 20 }} onClick={signup}>Try the translator</button>
        </div>
        <div className="am-lp-translation">
          <div className="am-lp-translation-tag">Hindi</div>
          <p lang="hi">यह किरायानामा मकान मालिक और किरायेदार के बीच निष्पादित किया गया है। मासिक किराया ₹15,000 निर्धारित किया गया है।</p>
          <div className="am-lp-translation-arrow"><Icon name="arrowRight" size={16} /></div>
          <div className="am-lp-translation-tag">English</div>
          <p>This rent agreement is executed between the landlord and the tenant. The monthly rent is fixed at ₹15,000.</p>
        </div>
      </section>

      {/* Pricing */}
      <section className="am-lp-band" id="pricing">
        <div className="am-lp-wrap am-lp-section">
          <div className="am-eyebrow">Pricing</div>
          <h2 className="am-lp-h2">Simple, transparent pricing</h2>
          <div className="am-lp-grid-3">
            {PLANS.map(p => (
              <div key={p.plan} className={`am-lp-plan ${p.highlight ? 'highlight' : ''}`}>
                <div className="am-lp-plan-name">{p.plan}</div>
                <div className="am-lp-plan-price">{p.price}<span>{p.period}</span></div>
                <div className="am-lp-plan-credits">{p.credits}</div>
                <ul>
                  {p.features.map(f => <li key={f}><Icon name="check" size={15} /> {f}</li>)}
                </ul>
                <button
                  className={`am-btn ${p.highlight ? 'am-btn-primary' : ''}`}
                  style={{ width: '100%' }}
                  disabled={p.cta !== 'Get Started Free'}
                  onClick={signup}
                >
                  {p.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="am-lp-section am-lp-wrap" style={{ textAlign: 'center' }}>
        <h2 className="am-lp-h2" style={{ margin: '0 auto' }}>Bring your next matter to Amicus One</h2>
        <p className="am-lp-text" style={{ maxWidth: 520, margin: '12px auto 0', fontSize: 16 }}>Three free documents to start. No card required.</p>
        <div className="am-lp-cta" style={{ justifyContent: 'center' }}>
          <button className="am-btn am-btn-primary am-lp-cta-btn" onClick={signup}>Create your account</button>
          <button className="am-btn am-lp-cta-btn" onClick={() => navigate('/firm/signup')}>Register a law firm</button>
        </div>
      </section>

      <footer className="am-lp-footer">
        <div className="am-lp-wrap am-lp-footer-inner">
          <span className="am-brand-name" style={{ fontSize: 18 }}>Amicus One</span>
          <span>Research and drafting aid for advocates. Outputs should be reviewed before use.</span>
          <span>© {new Date().getFullYear()} Amicus One</span>
        </div>
      </footer>
    </div>
  );
}
