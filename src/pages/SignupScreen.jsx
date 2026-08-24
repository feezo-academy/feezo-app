import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, signUp } from '../lib/supabaseClient';
import AuthBackdrop from '../components/AuthBackdrop';

// Symbols we accept as "1 number or 1 symbol". Anything outside letters/
// numbers/this set triggers a "please remove the symbol" message instead
// of a silent failure.
const ALLOWED_SYMBOLS = '!@#$%^&*-+';
const symbolRe = new RegExp(`[${ALLOWED_SYMBOLS.replace(/[-]/g, '\\-')}]`);
const disallowedRe = /[^A-Za-z0-9!@#$%^&*\-+]/;

function evaluatePassword(pw) {
  const hasLength = pw.length >= 8;
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNumberOrSymbol = /[0-9]/.test(pw) || symbolRe.test(pw);
  const hasDisallowed = pw.length > 0 && disallowedRe.test(pw);

  const passed = [hasLength, hasUpper && hasLower, hasNumberOrSymbol].filter(Boolean).length;
  let strength = 'Weak';
  let pct = pw.length === 0 ? 0 : 33;
  if (passed === 2) { strength = 'Medium'; pct = 66; }
  if (passed === 3) { strength = 'Strong'; pct = 100; }

  return { hasLength, hasUpper, hasLower, hasNumberOrSymbol, hasDisallowed, strength, pct, valid: passed === 3 && !hasDisallowed };
}

// Turns a bare username into a Gmail address, and leaves anything that
// already has an "@" (any domain) untouched.
function normalizeEmail(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.includes('@') ? trimmed : `${trimmed}@gmail.com`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// academies.slug is a separate, url-safe identifier from academies.name —
// derive it automatically so users only have to type a normal academy name.
function slugify(name) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  // Append a short random suffix so two academies with similar names
  // ("Sunrise Sports" / "Sunrise Sports Academy") don't collide on a
  // unique slug column.
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : suffix;
}

export default function SignupScreen() {
  const navigate = useNavigate();

  const [academyName, setAcademyName] = useState('');
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // contactNumber only ever holds digits typed after the fixed +91 prefix,
  // capped at 10 by the input's onChange handler — so it IS the 10-digit
  // number already, no stripping needed here.
  const digitsOnly = contactNumber;

  const email = useMemo(() => normalizeEmail(usernameOrEmail), [usernameOrEmail]);
  const check = useMemo(() => evaluatePassword(password), [password]);
  const confirmMismatch = confirm.length > 0 && confirm !== password;

  const doSubmit = async () => {
    setError('');

    if (!academyName.trim()) { setError('Please enter your academy name.'); return; }
    if (academyName.trim().length < 3) { setError('Academy name should be at least 3 characters.'); return; }

    if (!usernameOrEmail.trim()) { setError('Please enter a username or Gmail address.'); return; }
    if (!EMAIL_RE.test(email)) { setError('Please enter a valid username or email address.'); return; }

    if (digitsOnly.length < 10) { setError('Please enter a valid 10-digit contact number.'); return; }

    if (check.hasDisallowed) { setError('Please remove the symbol you entered and try a different one or a number.'); return; }
    if (!check.valid) { setError('Please meet all the password requirements below.'); return; }
    if (confirmMismatch || confirm.length === 0) { setError('Passwords don\'t match.'); return; }

    setBusy(true);
    try {
      const { data: signUpData, error: signUpError } = await signUp(email, password);
      if (signUpError) throw signUpError;

      const authUser = signUpData?.user;
      if (!authUser) {
        // If your Supabase project has email confirmation turned ON, signUp
        // succeeds but returns no active session/user until the address is
        // confirmed. Turn OFF "Confirm email" under Authentication >
        // Providers > Email for this flow to work end-to-end.
        throw new Error('Account created but not activated. Ask your admin to disable email confirmation for this project.');
      }

      // Create the academy record.
      const { data: academy, error: academyError } = await supabase
        .from('academies')
        .insert({ name: academyName.trim(), slug: slugify(academyName), phone: digitsOnly })
        .select()
        .single();
      if (academyError) throw academyError;

      // Link this auth user to the new academy as its admin.
      const { error: appUserError } = await supabase
        .from('app_users')
        .insert({ id: authUser.id, academy_id: academy.id, role: 'admin' });
      if (appUserError) throw appUserError;

      navigate('/signup/success', { state: { academyName: academyName.trim() } });
    } catch (e) {
      setError(e.message || 'Something went wrong creating your academy. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const eyeIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="#e8392f" strokeWidth="2" width="17" height="17">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );

  return (
    <div id="loginScreen" className="signup-compact">
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
          <label>Academy name</label>
          <div className="field-wrap">
            <span className="login-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="#e8392f" strokeWidth="2" width="17" height="17">
                <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M14 9h1M14 13h1M9 21v-4h6v4" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="e.g. Sunrise Sports Academy"
              autoComplete="off"
              value={academyName}
              onChange={e => setAcademyName(e.target.value)}
            />
          </div>
        </div>

        <div className="login-field">
          <label>Username / Gmail</label>
          <div className="field-wrap">
            <span className="login-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="#e8392f" strokeWidth="2" width="17" height="17">
                <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="e.g. sunrisesports or you@gmail.com"
              autoComplete="off"
              value={usernameOrEmail}
              onChange={e => setUsernameOrEmail(e.target.value)}
            />
          </div>
          {usernameOrEmail.trim() && !usernameOrEmail.includes('@') && (
            <div style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 4 }}>
              Will sign up as <strong>{email}</strong>
            </div>
          )}
        </div>

        <div className="login-field">
          <label>Contact number</label>
          <div className="field-wrap">
            <span className="login-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="#e8392f" strokeWidth="2" width="17" height="17">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.85.55 2.81.68A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <span className="cc-prefix">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="10-digit number"
              autoComplete="off"
              value={contactNumber}
              onChange={e => setContactNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
            />
          </div>
        </div>

        <div className="login-field">
          <label>New password</label>
          <div className="field-wrap">
            <span className="login-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="#e8392f" strokeWidth="2" width="17" height="17">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Enter new password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button type="button" className="login-eye" title="Show/hide password" onClick={() => setShowPw(v => !v)}>
              {eyeIcon}
            </button>
          </div>
        </div>

        {password.length > 0 && (
          <div className="pwck-strength-row">
            <span className="pwck-strength-label" data-level={check.strength}>{check.strength}</span>
            <div className="pwck-bar-track">
              <div className={`pwck-bar-fill pwck-${check.strength.toLowerCase()}`} style={{ width: `${check.pct}%` }} />
            </div>
          </div>
        )}

        <ul className="pwck-list">
          <li className={check.hasLength && check.hasUpper && check.hasLower && check.hasNumberOrSymbol ? 'pwck-ok' : ''}>
            <i className="ti ti-check" /> 8+ chars · upper &amp; lowercase · number or symbol
          </li>
        </ul>

        <div className="login-field">
          <label>Confirm password</label>
          <div className="field-wrap">
            <span className="login-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="#e8392f" strokeWidth="2" width="17" height="17">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSubmit()}
            />
            <button type="button" className="login-eye" title="Show/hide password" onClick={() => setShowConfirm(v => !v)}>
              {eyeIcon}
            </button>
          </div>
          {confirmMismatch && <div className="pwck-mismatch">Passwords don't match.</div>}
        </div>

        <button className="btn-login" onClick={doSubmit} disabled={busy} style={{ cursor: 'pointer' }}>
          {busy ? 'Creating your academy…' : 'Confirm'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
          <span style={{ color: 'var(--gray)' }}>Already have an academy? </span>
          <Link to="/login" style={{ color: '#e8392f', fontWeight: 600, textDecoration: 'none' }}>Log in</Link>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--gray)', opacity: .8 }}>
          © 2026 FeeZo Solutions · v3
        </div>
      </div>

      <style>{`
        .pwck-strength-row { display: flex; align-items: center; gap: 10px; margin: -4px 0 8px; }
        .pwck-strength-label { font-size: 10.5px; font-weight: 700; min-width: 40px; }
        .pwck-strength-label[data-level="Weak"] { color: #e8392f; }
        .pwck-strength-label[data-level="Medium"] { color: #d98c00; }
        .pwck-strength-label[data-level="Strong"] { color: #1f9d55; }
        .pwck-bar-track { flex: 1; height: 4px; border-radius: 3px; background: rgba(150,150,150,.25); overflow: hidden; }
        .pwck-bar-fill { height: 100%; border-radius: 3px; transition: width .25s ease, background-color .25s ease; }
        .pwck-bar-fill.pwck-weak { background: #e8392f; }
        .pwck-bar-fill.pwck-medium { background: #d98c00; }
        .pwck-bar-fill.pwck-strong { background: #1f9d55; }
        .pwck-list { list-style: none; margin: 0 0 8px; padding: 0; }
        .pwck-list li { display: flex; align-items: center; gap: 5px; font-size: 9.5px; line-height: 1.2; color: var(--gray); opacity: .75; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pwck-list li i { font-size: 10px; flex: 0 0 auto; }
        .pwck-list li.pwck-ok { color: #1f9d55; opacity: 1; font-weight: 500; }
        .pwck-mismatch { color: #e8392f; font-size: 10.5px; margin-top: 4px; }

        /* Compact layout — this screen has more fields than the other
           auth screens, so it gets its own tighter sizing instead of
           changing the shared .login-box rules everyone else uses. */
        .signup-compact .login-box { padding-top: 22px; padding-bottom: 22px; }
        .signup-compact .login-title { font-size: 19px; margin-top: 6px; }
        .signup-compact .login-sub { font-size: 12px; margin-bottom: 14px; }
        .signup-compact .login-field { margin-bottom: 10px; }
        .signup-compact .login-field label { font-size: 11.5px; margin-bottom: 4px; }
        .signup-compact .field-wrap input { font-size: 12px; line-height: 1.1; padding-top: 0; padding-bottom: 0; height: 30px; }
        .signup-compact .field-wrap input::placeholder { font-size: 11.5px; }
        .signup-compact .login-ico svg { width: 12px; height: 12px; }
        .signup-compact .login-eye svg { width: 13px; height: 13px; }
        .signup-compact .field-wrap { min-height: 0; }
        .signup-compact .cc-prefix { line-height: 1.1; }
        .signup-compact .btn-login { padding-top: 11px; padding-bottom: 11px; font-size: 14px; margin-top: 4px; }
        .signup-compact .cc-prefix { font-size: 13px; font-weight: 600; color: #444; padding-right: 6px; border-right: 1px solid rgba(150,150,150,.35); margin-right: 8px; }
      `}</style>
    </div>
  );
}
