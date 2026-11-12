import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const heroRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Intersection Observer for fade-in animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('lp-visible');
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -50px 0px' }
    );
    document.querySelectorAll('.lp-animate').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lp-root">

      {/* ── NAVBAR ── */}
      <nav className={`lp-nav ${scrolled ? 'lp-nav-scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <div className="lp-logo" onClick={() => navigate('/')}>
            Lex<span>ora</span>
          </div>
          <div className={`lp-nav-links ${menuOpen ? 'lp-nav-open' : ''}`}>
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#workspace" onClick={() => setMenuOpen(false)}>Workspace</a>
            <a href="#howitworks" onClick={() => setMenuOpen(false)}>How it Works</a>
            <a href="#pricing-placeholder" onClick={() => setMenuOpen(false)}>Pricing</a>
          </div>
          <div className="lp-nav-right">
            <button className="lp-btn-ghost" onClick={() => navigate('/auth?mode=login')}>Log in</button>
            <button className="lp-btn-primary" onClick={() => navigate('/auth?mode=signup')}>Get Started</button>
          </div>
          <button className="lp-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero" ref={heroRef}>
        <div className="lp-hero-glow"></div>
        <div className="lp-hero-glow2"></div>

        <div className="lp-badge">
          <span className="lp-badge-dot"></span>
          AI-Powered Legal Intelligence for India
        </div>

        <h1 className="lp-hero-title">
          The Modern <span className="lp-gradient-text">AI Workspace</span>
          <br />for Legal Professionals
        </h1>

        <p className="lp-hero-sub">
          Draft legal documents, research case law, manage clients, and work smarter —
          all powered by AI built specifically for Indian law.
        </p>

        <div className="lp-hero-ctas">
          <button className="lp-cta-main" onClick={() => navigate('/auth?mode=signup')}>
            Start Drafting Free
          </button>
          <button className="lp-cta-sec" onClick={() => navigate('/auth?mode=signup')}>
            Open LawGPT →
          </button>
          <button className="lp-cta-sec lp-cta-ghost" onClick={() => navigate('/auth?mode=signup')}>
            Explore Workspace
          </button>
        </div>

        {/* Dashboard Preview */}
        <div className="lp-dashboard-preview lp-animate">
          <div className="lp-dash-topbar">
            <span className="lp-dot lp-dot-red"></span>
            <span className="lp-dot lp-dot-yellow"></span>
            <span className="lp-dot lp-dot-green"></span>
            <span className="lp-dash-url">app.lexora.in — Dashboard</span>
          </div>
          <div className="lp-dash-body">
            <div className="lp-dash-sidebar">
              <div className="lp-dash-brand">Lexora</div>
              {[
                { icon: '⊞', label: 'Dashboard', active: true },
                { icon: '✦', label: 'Generate' },
                { icon: '💬', label: 'LawGPT' },
                { icon: '📄', label: 'Documents' },
                { icon: '👥', label: 'Clients' },
                { icon: '💳', label: 'Billing' },
              ].map((item) => (
                <div key={item.label} className={`lp-dash-nav-item ${item.active ? 'active' : ''}`}>
                  <span>{item.icon}</span> {item.label}
                </div>
              ))}
            </div>
            <div className="lp-dash-main">
              <div className="lp-dash-greeting">Good morning, Advocate Sharma ⚖️</div>
              <div className="lp-stat-row">
                <div className="lp-stat-card">
                  <div className="lp-stat-label">Documents</div>
                  <div className="lp-stat-val">47</div>
                </div>
                <div className="lp-stat-card">
                  <div className="lp-stat-label">Credits Left</div>
                  <div className="lp-stat-val lp-gold">18</div>
                </div>
                <div className="lp-stat-card">
                  <div className="lp-stat-label">Clients</div>
                  <div className="lp-stat-val lp-purple">12</div>
                </div>
              </div>
              <div className="lp-doc-list">
                {[
                  { name: 'Rent Agreement — Sharma vs Gupta', tag: 'Property Law', tagClass: '' },
                  { name: 'NDA — TechCorp Private Limited', tag: 'Corporate', tagClass: 'gold' },
                  { name: 'FIR Draft — Section 420 IPC', tag: 'Criminal', tagClass: '' },
                ].map((doc) => (
                  <div key={doc.name} className="lp-doc-item">
                    <span className="lp-doc-name">{doc.name}</span>
                    <span className={`lp-doc-tag ${doc.tagClass}`}>{doc.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="lp-section" id="features">
        <div className="lp-section-inner">
          <div className="lp-section-label lp-animate">Platform Features</div>
          <h2 className="lp-section-title lp-animate">Everything a modern lawyer needs</h2>
          <p className="lp-section-sub lp-animate">
            One unified workspace replacing hours of manual drafting, research, and document management.
          </p>
          <div className="lp-feature-grid">
            {[
              {
                icon: '✦', color: 'purple',
                title: 'AI Legal Drafting',
                desc: 'Generate professional documents across 12 categories and 80+ document types in seconds. Multilingual — English, Hindi & 5 regional languages.',
              },
              {
                icon: '💬', color: 'gold',
                title: 'LawGPT Workspace',
                desc: 'Ask complex legal questions, upload PDFs and Word documents for contextual AI analysis with section citations from 18 Indian acts.',
              },
              {
                icon: '📄', color: 'teal',
                title: 'Document Intelligence',
                desc: 'Upload agreements, judgments, or notices. AI explains clauses, summarizes content, and flags risks in plain language.',
              },
              {
                icon: '👥', color: 'pink',
                title: 'Client CRM',
                desc: 'Manage your client roster, link documents to cases, and keep all matter-related files organized in one place.',
              },
              {
                icon: '⚖️', color: 'purple',
                title: '441+ Legal Sections',
                desc: 'Searchable database of IPC, BNS, CrPC, IT Act, GST Act, and 14 other Indian acts — instantly cited in your documents.',
              },
              {
                icon: '🌐', color: 'gold',
                title: '7 Indian Languages',
                desc: 'Draft in English, Hindi, Marathi, Bengali, Tamil, Kannada, or Telugu. Every document sounds professionally drafted.',
                },
                { 
                icon: '🔄', color: 'teal',
                title: 'Legal Document Translator',
                desc: 'Translate Hindi, Marathi, Bengali, Tamil, Kannada & Telugu legal documents to English — with full context preserved across all pages. No broken storyline.',
                },
            ].map((feat, i) => (
              <div key={feat.title} className={`lp-feat-card lp-animate`} style={{ animationDelay: `${i * 0.08}s` }}>
                <div className={`lp-feat-icon ${feat.color}`}>{feat.icon}</div>
                <div className="lp-feat-title">{feat.title}</div>
                <div className="lp-feat-desc">{feat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="lp-section lp-section-dark" id="howitworks">
        <div className="lp-section-inner">
          <div className="lp-section-label lp-animate">Workflow</div>
          <h2 className="lp-section-title lp-animate">Draft in 60 seconds</h2>
          <p className="lp-section-sub lp-animate">
            From blank page to signed-ready legal document in four simple steps.
          </p>
          <div className="lp-steps">
            {[
              { num: '01', title: 'Pick a category', desc: 'Choose from 12 legal categories — Property, Corporate, Criminal, Family, and more.' },
              { num: '02', title: 'Fill the form', desc: 'Enter party names, dates, and key details. Smart fields adapt to the document type.' },
              { num: '03', title: 'AI generates', desc: 'Groq-powered AI drafts a complete, professionally worded legal document instantly.' },
              { num: '04', title: 'Edit & download', desc: 'Review, edit inline, and download as PDF. Clean formatting ready for court filing.' },
            ].map((step, i) => (
              <div key={step.num} className="lp-step lp-animate" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="lp-step-num">{step.num}</div>
                <div className="lp-step-title">{step.title}</div>
                <div className="lp-step-desc">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LAWGPT SECTION ── */}
      <section className="lp-section" id="workspace">
        <div className="lp-section-inner lp-lawgpt-grid">
          <div className="lp-animate">
            <div className="lp-section-label">LawGPT</div>
            <h2 className="lp-section-title">Your AI legal<br />research assistant</h2>
            <p className="lp-lawgpt-sub">
              Upload case files, judgments, or agreements. Ask questions in plain English and get cited,
              structured legal answers — powered by 441+ Indian legal sections.
            </p>
            <div className="lp-lawgpt-checks">
              {[
                'Upload PDF, DOCX, TXT, images',
                'Multi-session chat history',
                'Legal section citations in answers',
                'Completely free to use',
              ].map((item) => (
                <div key={item} className="lp-check-item">
                  <span className="lp-check-icon">✓</span>
                  {item}
                </div>
              ))}
            </div>
            <button className="lp-cta-main" style={{ marginTop: '1.75rem' }} onClick={() => navigate('/auth?mode=signup')}>
              Try LawGPT Free →
            </button>
          </div>
          <div className="lp-lawgpt-preview lp-animate">
            <div className="lp-chat-label">You</div>
            <div className="lp-chat-bubble lp-chat-user">
              What sections apply in a cheque bounce case under ₹2 lakh?
            </div>
            <div className="lp-chat-label" style={{ marginTop: '0.75rem' }}>Lexora AI</div>
            <div className="lp-chat-bubble lp-chat-ai">
              For a cheque bounce case, the primary provision is{' '}
              <span className="lp-cite">Section 138 NI Act</span>. You should also consider{' '}
              <span className="lp-cite">Section 141 NI Act</span> for company liability and{' '}
              <span className="lp-cite">Section 420 IPC</span> if fraud is alleged.
              <br /><br />
              A legal notice must be sent within 30 days of dishonour. The complainant has 1 month from
              expiry of notice period to file a complaint.
            </div>
            <div className="lp-chat-input-row">
              <div className="lp-chat-input-fake">Ask a legal question...</div>
              <button className="lp-chat-send">↑</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRANSLATOR SECTION ── */}
<section className="lp-section lp-section-dark">
  <div className="lp-section-inner lp-lawgpt-grid">
    <div className="lp-animate">
      <div className="lp-section-label">Document Translator</div>
      <h2 className="lp-section-title">Translate legal documents<br />without losing context</h2>
      <p className="lp-lawgpt-sub">
        Receive drafts in Hindi, Marathi, Bengali, Tamil, Kannada, or Telugu?
        Upload and get a complete English translation — every page connected,
        no broken storyline, no missing context. Saving you ₹200–250 per page.
      </p>
      <div className="lp-lawgpt-checks">
        {[
          'Supports PDF, DOCX, TXT — up to 100+ pages',
          'Context preserved across every page',
          'Hindi, Marathi, Bengali, Tamil, Kannada, Telugu',
          'Download as PDF or Word',
        ].map((item) => (
          <div key={item} className="lp-check-item">
            <span className="lp-check-icon">✓</span>
            {item}
          </div>
        ))}
      </div>
      <button
        className="lp-cta-main"
        style={{ marginTop: '1.75rem' }}
        onClick={() => navigate('/auth?mode=signup')}
      >
        Try Translator →
      </button>
    </div>
    <div className="lp-lawgpt-preview lp-animate">
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '10px',
        padding: '1rem',
        marginBottom: '0.75rem',
        border: '0.5px solid rgba(255,255,255,0.08)'
      }}>
        <div className="lp-chat-label" style={{ marginBottom: '0.5rem' }}>
          📄 Original — Hindi
        </div>
        <div style={{ fontSize: '0.82rem', color: '#8888a0', lineHeight: 1.6 }}>
          यह किरायानामा दिनांक 15 जनवरी 2025 को श्री राजेश शर्मा (मकान मालिक)
          और श्री अमित गुप्ता (किरायेदार) के बीच निष्पादित किया गया है।
          मासिक किराया ₹15,000 निर्धारित किया गया है...
        </div>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.2rem',
        color: '#a78bfa',
        margin: '0.5rem 0',
      }}>
        ↓ Lexora AI Translation
      </div>
      <div className="lp-chat-bubble lp-chat-ai">
        <div className="lp-chat-label" style={{ marginBottom: '0.5rem' }}>
          ✅ Translated — English
        </div>
        This Rent Agreement is executed on 15th January 2025 between
        Mr. Rajesh Sharma (Landlord) and Mr. Amit Gupta (Tenant).
        The monthly rent is fixed at ₹15,000...
        <br /><br />
        <span className="lp-cite">Full context preserved across all pages</span>
      </div>
    </div>
  </div>
</section>

      {/* ── STATS ── */}
      <section className="lp-section lp-section-stats">
        <div className="lp-section-inner" style={{ textAlign: 'center' }}>
          <div className="lp-section-label lp-animate">Built for India</div>
          <h2 className="lp-section-title lp-animate">Numbers that matter</h2>
          <div className="lp-stats-row">
            {[
              { num: '80+', label: 'Document types' },
              { num: '441+', label: 'Legal sections indexed' },
              { num: '12', label: 'Legal categories' },
              { num: '7', label: 'Indian languages' },
              { num: '60s', label: 'Avg. draft time' },
            ].map((stat, i) => (
              <div key={stat.label} className="lp-stat-big lp-animate" style={{ animationDelay: `${i * 0.07}s` }}>
                <div className="lp-stat-big-num">{stat.num}</div>
                <div className="lp-stat-big-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING PLACEHOLDER ── */}
      <section className="lp-section" id="pricing-placeholder">
        <div className="lp-section-inner" style={{ textAlign: 'center' }}>
          <div className="lp-section-label lp-animate">Pricing</div>
          <h2 className="lp-section-title lp-animate">Simple, transparent pricing</h2>
          <p className="lp-section-sub lp-animate" style={{ margin: '0 auto 2.5rem' }}>
            Start free. Scale as you grow. No hidden fees.
          </p>
          <div className="lp-pricing-grid">
            {[
              {
                plan: 'Free', price: '₹0', period: '/month',
                credits: '3 documents/month', features: ['AI document drafting', 'LawGPT access (free)', 'PDF download', 'Basic support'],
                cta: 'Get Started Free', highlight: false,
              },
              {
                plan: 'Starter', price: '₹299', period: '/month',
                credits: '20 documents/month', features: ['Everything in Free', 'Priority generation', 'Document history', 'Email support'],
                cta: 'Coming Soon', highlight: true,
              },
              {
                plan: 'Pro', price: '₹699', period: '/month',
                credits: 'Unlimited documents', features: ['Everything in Starter', 'Clients CRM', 'Multi-language drafts', 'Priority support'],
                cta: 'Coming Soon', highlight: false,
              },
            ].map((plan) => (
              <div key={plan.plan} className={`lp-pricing-card lp-animate ${plan.highlight ? 'lp-pricing-highlight' : ''}`}>
                {plan.highlight && <div className="lp-pricing-badge">Most Popular</div>}
                <div className="lp-pricing-plan">{plan.plan}</div>
                <div className="lp-pricing-price">
                  {plan.price}<span className="lp-pricing-period">{plan.period}</span>
                </div>
                <div className="lp-pricing-credits">{plan.credits}</div>
                <ul className="lp-pricing-features">
                  {plan.features.map((f) => (
                    <li key={f}><span className="lp-check-icon">✓</span> {f}</li>
                  ))}
                </ul>
                <button
                  className={plan.highlight ? 'lp-cta-main' : 'lp-cta-sec'}
                  style={{ width: '100%' }}
                  onClick={() => plan.cta === 'Get Started Free' && navigate('/auth?mode=signup')}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="lp-cta-banner lp-animate">
        <div className="lp-cta-banner-inner">
          <h2 className="lp-cta-banner-title">
            Ready to transform your legal practice?
          </h2>
          <p className="lp-cta-banner-sub">
            Join lawyers across India using Lexora to draft faster, research smarter, and serve clients better.
          </p>
          <div className="lp-hero-ctas" style={{ justifyContent: 'center' }}>
            <button className="lp-cta-main" onClick={() => navigate('/auth?mode=signup')}>
              Start Free Today
            </button>
            <button className="lp-cta-sec" onClick={() => navigate('/auth?mode=login')}>
              Log in →
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <div className="lp-logo">Lex<span>ora</span></div>
              <p>The modern AI workspace for Indian legal professionals. Draft smarter. Work faster.</p>
            </div>
            <div className="lp-footer-col">
  <h4>Product</h4>
  <a href="#features">AI Drafting</a>
  <a href="#workspace">LawGPT</a>
  <a href="#features">Translator</a>
  <a href="#features">Documents</a>
  <a href="#features">Clients CRM</a>
</div>
<div className="lp-footer-col">
  <h4>Company</h4>
  <button className="lp-footer-btn" style={{color:'#8888a0'}}>About</button>
  <a href="#pricing-placeholder" style={{color:'#8888a0', display:'block', fontSize:'0.8rem', marginBottom:'0.5rem', textDecoration:'none'}}>Pricing</a>
  <button className="lp-footer-btn" style={{color:'#8888a0'}}>Blog</button>
  <button className="lp-footer-btn" style={{color:'#8888a0'}}>Contact</button>
</div>
<div className="lp-footer-col">
  <h4>Legal</h4>
  <button className="lp-footer-btn" style={{color:'#8888a0'}}>Privacy Policy</button>
  <button className="lp-footer-btn" style={{color:'#8888a0'}}>Terms of Service</button>
  <button className="lp-footer-btn" style={{color:'#8888a0'}}>Refund Policy</button>
</div>
          </div>
          <div className="lp-footer-bottom">
            <span>© 2025 Lexora. All rights reserved.</span>
            <span>Built for Indian lawyers ⚖️</span>
          </div>
        </div>
      </footer>

    </div>
  );
}