import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthBackdrop from '../components/AuthBackdrop';

export default function SignupDetailsScreen() {
  const navigate = useNavigate();
  const [academyName, setAcademyName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [error, setError] = useState('');

  const digitsOnly = contactNumber.replace(/\D/g, '');

  const doContinue = () => {
    setError('');
    if (!academyName.trim()) { setError('Please enter your academy name / username.'); return; }
    if (academyName.trim().length < 3) { setError('Academy username should be at least 3 characters.'); return; }
    if (/\s/.test(academyName.trim())) { setError('Academy username can\'t contain spaces — try something like "sunrise-sports".'); return; }
    if (digitsOnly.length < 10) { setError('Please enter a valid 10-digit contact number.'); return; }

    // Handed to the next step via router state, not stored anywhere yet —
    // nothing is created until the password step succeeds.
    navigate('/signup/password', {
      state: { academyName: academyName.trim(), contactNumber: digitsOnly },
    });
  };

  return (
    <div id="loginScreen">
      <AuthBackdrop />
      <div className="login-box">
        <div className="login-logo">
          <svg viewBox="0 0 24 24" fill="#e8392f" width="40" height="40">
            <circle cx="12" cy="8" r="4" />
            <path d="M12 14c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z" />
          </svg>
        </div>
        <div className="login-title">Set up your academy</div>
        <div className="login-sub">Tell us a bit about your academy to get started</div>
        {error && <div className="login-error show">⚠️ <span>{error}</span></div>}

        <div className="login-field">
          <label>Academy username</label>
          <div className="field-wrap">
            <span className="login-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="#e8392f" strokeWidth="2" width="17" height="17">
                <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M14 9h1M14 13h1M9 21v-4h6v4" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="e.g. sunrise-sports"
              autoComplete="off"
              value={academyName}
              onChange={e => setAcademyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doContinue()}
            />
          </div>
        </div>

        <div className="login-field">
          <label>Contact number</label>
          <div className="field-wrap">
            <span className="login-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="#e8392f" strokeWidth="2" width="17" height="17">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.85.55 2.81.68A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <input
              type="tel"
              placeholder="Enter contact number"
              autoComplete="off"
              value={contactNumber}
              onChange={e => setContactNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doContinue()}
            />
          </div>
        </div>

        <button className="btn-login" onClick={doContinue} style={{ cursor: 'pointer' }}>
          Continue
        </button>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
          <span style={{ color: 'var(--gray)' }}>Already have an academy? </span>
          <Link to="/login" style={{ color: '#e8392f', fontWeight: 600, textDecoration: 'none' }}>Log in</Link>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--gray)', opacity: .8 }}>
          © 2026 FeeZo Solutions · v3
        </div>
      </div>
    </div>
  );
}
