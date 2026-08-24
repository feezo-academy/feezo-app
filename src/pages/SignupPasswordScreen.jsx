import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase, signUp, toAuthEmail } from '../lib/supabaseClient';
import AuthBackdrop from '../components/AuthBackdrop';

// Symbols we accept as "1 number or 1 symbol". Anything outside letters/
// numbers/this set triggers the same "please remove the symbol" message
// your screenshot shows, instead of a silent failure.
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

export default function SignupPasswordScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { academyName, contactNumber } = location.state || {};

  useEffect(() => {
    // Direct/refresh visits with no details from step 1 — send them back
    // instead of letting this screen create an academy with no name.
    if (!academyName || !contactNumber) navigate('/signup', { replace: true });
  }, [academyName, contactNumber, navigate]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useMemo(() => evaluatePassword(password), [password]);
  const confirmMismatch = confirm.length > 0 && confirm !== password;

  const doSubmit = async () => {
    setError('');
    if (check.hasDisallowed) { setError('Please remove the symbol you entered and try a different one or a number.'); return; }
    if (!check.valid) { setError('Please meet all the password requirements below.'); return; }
    if (confirmMismatch || confirm.length === 0) { setError('Passwords don\'t match.'); return; }

    setBusy(true);
    try {
      const email = toAuthEmail(academyName);

      const { data: signUpData, error: signUpError } = await signUp(email, password);
      if (signUpError) throw signUpError;

      const authUser = signUpData?.user;
      if (!authUser) {
        // If your Supabase project has email confirmation turned ON, signUp
        // succeeds but returns no active session/user until they click a
        // confirmation link — which won't work here since the email is a
        // synthetic one, not a real inbox. For this flow to work end-to-end,
        // turn OFF "Confirm email" under Authentication > Providers > Email.
        throw new Error('Account created but not activated. Ask your admin to disable email confirmation for this project.');
      }

      // Create the academy record.
      const { data: academy, error: academyError } = await supabase
        .from('academies')
        .insert({ name: academyName, contact_number: contactNumber })
        .select()
        .single();
      if (academyError) throw academyError;

      // Link this auth user to the new academy as its admin.
      const { error: appUserError } = await supabase
        .from('app_users')
        .insert({ id: authUser.id, academy_id: academy.id, role: 'admin' });
      if (appUserError) throw appUserError;

      navigate('/signup/success', { state: { academyName } });
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
    <div id="loginScreen">
      <AuthBackdrop />
      <div className="login-box">
        <div className="login-logo">
          <svg viewBox="0 0 24 24" fill="#e8392f" width="40" height="40">
            <circle cx="12" cy="8" r="4" />
            <path d="M12 14c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z" />
          </svg>
        </div>
        <div className="login-title">Create your password</div>
        <div className="login-sub">Make sure your new password is unique and cannot be easily guessed.</div>
        {error && <div className="login-error show">⚠️ <span>{error}</span></div>}

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
          <li className={check.hasLength ? 'pwck-ok' : ''}><i className="ti ti-check" /> Use at least 8 characters</li>
          <li className={check.hasUpper && check.hasLower ? 'pwck-ok' : ''}><i className="ti ti-check" /> Include at least 1 uppercase letter and 1 lowercase letter</li>
          <li className={check.hasNumberOrSymbol ? 'pwck-ok' : ''}><i className="ti ti-check" /> Include at least 1 number or 1 symbol (e.g. !@#$%^&*-+)</li>
        </ul>

        <div className="login-field">
          <label>Re-enter password</label>
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

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--gray)', opacity: .8 }}>
          © 2026 FeeZo Solutions · v3
        </div>
      </div>

      <style>{`
        .pwck-strength-row { display: flex; align-items: center; gap: 10px; margin: -6px 0 14px; }
        .pwck-strength-label { font-size: 12px; font-weight: 700; min-width: 46px; }
        .pwck-strength-label[data-level="Weak"] { color: #e8392f; }
        .pwck-strength-label[data-level="Medium"] { color: #d98c00; }
        .pwck-strength-label[data-level="Strong"] { color: #1f9d55; }
        .pwck-bar-track { flex: 1; height: 5px; border-radius: 3px; background: rgba(150,150,150,.25); overflow: hidden; }
        .pwck-bar-fill { height: 100%; border-radius: 3px; transition: width .25s ease, background-color .25s ease; }
        .pwck-bar-fill.pwck-weak { background: #e8392f; }
        .pwck-bar-fill.pwck-medium { background: #d98c00; }
        .pwck-bar-fill.pwck-strong { background: #1f9d55; }
        .pwck-list { list-style: none; margin: 0 0 18px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .pwck-list li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--gray); opacity: .75; }
        .pwck-list li i { font-size: 15px; }
        .pwck-list li.pwck-ok { color: #1f9d55; opacity: 1; font-weight: 500; }
        .pwck-mismatch { color: #e8392f; font-size: 12px; margin-top: 6px; }
      `}</style>
    </div>
  );
}
