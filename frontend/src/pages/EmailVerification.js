import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';

export default function EmailVerification() {
  const [resending, setResending] = useState(false);
  const email = localStorage.getItem('pending_email') || '';

  const handleResend = async () => {
    if (!email) {
      toast.error('Email not found. Please sign up again.');
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`
        }
      });
      if (error) throw error;
      toast.success('Verification email sent! Check your inbox.');
    } catch (err) {
      toast.error(err.message || 'Failed to resend email');
    }
    setResending(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card-new" data-theme="light">
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon">📧</div>
          <h1 className="auth-brand">Check Your Email</h1>
          <p className="auth-tagline">Almost there — one step left</p>
        </div>

        <div className="verify-content">
          <div className="verify-icon-wrap">✉️</div>
          <h2 className="verify-title">Verify your email address</h2>
          <p className="verify-desc">
            We sent a verification link to{' '}
            {email && <strong>{email}</strong>}.
            Click the link in the email to activate your account.
          </p>

          <div className="verify-steps">
            <div className="verify-step">
              <span className="verify-step-num">1</span>
              <span>Open your email inbox</span>
            </div>
            <div className="verify-step">
              <span className="verify-step-num">2</span>
              <span>Find the email from Lexora</span>
            </div>
            <div className="verify-step">
              <span className="verify-step-num">3</span>
              <span>Click the verification link</span>
            </div>
          </div>

          <button
            className="auth-submit-btn"
            onClick={handleResend}
            disabled={resending}
            style={{ marginTop: '8px' }}
          >
            {resending ? '⏳ Sending...' : '🔄 Resend Verification Email'}
          </button>

          <div className="verify-note">
            <p>Didn't receive the email? Check your spam folder.</p>
          </div>
        </div>

        <p className="auth-footer">
          Wrong email?{' '}
          <Link to="/signup" className="auth-link-btn">Sign up again</Link>
          {' · '}
          <Link to="/login" className="auth-link-btn">Sign in</Link>
        </p>
      </div>
    </div>
  );
}