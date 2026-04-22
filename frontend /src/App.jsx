import React, { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Dynamic API URL - always use HTTP for development to avoid SSL issues
const getApiUrl = () => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (isLocalhost) {
    return 'http://localhost:5000/api';  // Force HTTP for localhost
  } else {
    // For external access (different computers)
    return 'http://10.20.204.87:5000/api';  // Force HTTP for external
  }
};

const API = getApiUrl();

// Debug helper to log connection errors
const logError = (context, error) => {
  console.error(`[${context}]`, {
    message: error?.message,
    name: error?.name,
    status: error?.status,
    statusText: error?.statusText,
    type: error?.type,
    stack: error?.stack
  });
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #05080f;
    --surface: #0b1018;
    --surface2: #0f1520;
    --border: rgba(255,255,255,0.06);
    --border-hi: rgba(255,255,255,0.13);
    --text: #dde4ef;
    --muted: #3d4a5c;
    --muted2: #667080;
    --accent: #00d4ff;
    --accent-dim: rgba(0,212,255,0.1);
    --accent-glow: rgba(0,212,255,0.3);
    --green: #00ff88;
    --green-dim: rgba(0,255,136,0.09);
    --red: #ff3d6b;
    --red-dim: rgba(255,61,107,0.09);
    --amber: #ffc23b;
    --amber-dim: rgba(255,194,59,0.09);
    --purple: #b06eff;
    --mono: 'Space Mono', monospace;
    --sans: 'Syne', sans-serif;
  }
  html, body, #root { height: 100%; }
  body { background: var(--bg); color: var(--text); font-family: var(--sans); overflow-x: hidden; }
  input:-webkit-autofill { -webkit-box-shadow: 0 0 0 100px var(--surface2) inset !important; -webkit-text-fill-color: var(--text) !important; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-hi); border-radius: 2px; }
  @keyframes fadeUp   { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
  @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
  @keyframes slideInR { from { transform:translateX(110%); opacity:0 } to { transform:translateX(0); opacity:1 } }
  @keyframes pulse-ring { 0% { transform:scale(1); opacity:.8 } 100% { transform:scale(2.6); opacity:0 } }
  @keyframes blink    { 0%,100% { opacity:1 } 50% { opacity:0 } }
  @keyframes ticker   { from { transform:translateX(0) } to { transform:translateX(-50%) } }
  @keyframes seatPop  { 0% { transform:scale(1) } 45% { transform:scale(1.2) } 100% { transform:scale(1) } }
  @keyframes scanline { from { transform:translateY(-200%) } to { transform:translateY(200vh) } }
  @keyframes glitch1  { 0%{clip-path:inset(40% 0 61% 0);transform:translate(-3px)} 50%{clip-path:inset(10% 0 80% 0);transform:translate(3px)} 100%{clip-path:inset(70% 0 20% 0);transform:translate(-3px)} }
  @keyframes lockPulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,194,59,0)} 50%{box-shadow:0 0 0 6px rgba(255,194,59,0.15)} }
`;

function injectCSS() {
  if (document.getElementById("rsys-css")) return;
  const s = document.createElement("style");
  s.id = "rsys-css"; s.textContent = CSS;
  document.head.appendChild(s);
}

// ─── User Store (localStorage) ────────────────────────────────────────────────
const STORE_KEY = "rsys_users";
const SESSION_KEY = "rsys_session";

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

const ts = () => new Date().toLocaleTimeString("en-US", { hour12: false });

// ─── Background ───────────────────────────────────────────────────────────────
function GridBG() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(0,212,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.025) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 90% 50% at 50% -10%, rgba(0,212,255,0.05) 0%, transparent 60%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 40% at 80% 100%, rgba(176,110,255,0.04) 0%, transparent 60%)" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "rgba(0,212,255,0.06)", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120, background: "linear-gradient(180deg, rgba(0,212,255,0.5) 0%, transparent 100%)", animation: "scanline 6s linear infinite", opacity: 0.2 }} />
      </div>
    </div>
  );
}

function Noise() {
  return (
    <svg style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.02 }} aria-hidden>
      <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width="100%" height="100%" filter="url(#n)" />
    </svg>
  );
}

// ─── Status Dot ───────────────────────────────────────────────────────────────
function StatusDot({ color = "var(--green)", pulse = true }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 12, height: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {pulse && <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, animation: "pulse-ring 2s ease-out infinite" }} />}
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, display: "block" }} />
    </span>
  );
}

// ─── Ticker ───────────────────────────────────────────────────────────────────
function TickerBar({ items }) {
  const t = items.join("   ·   ");
  return (
    <div style={{ height: 26, background: "rgba(0,212,255,0.03)", borderBottom: "1px solid var(--border)", overflow: "hidden", display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", whiteSpace: "nowrap", animation: "ticker 22s linear infinite", fontFamily: "var(--mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.1em" }}>
        <span style={{ paddingRight: 100 }}>{t}</span>
        <span style={{ paddingRight: 100 }}>{t}</span>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toasts, onRemove }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999 }}>
      {toasts.map((t) => {
        let toastColor;
        if (t.type === "error") toastColor = "var(--red)";
        else if (t.type === "warn") toastColor = "var(--amber)";
        else if (t.type === "lock") toastColor = "var(--purple)";
        else toastColor = "var(--green)";
        
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 16px", background: "var(--surface)", border: `1px solid ${toastColor}44`, borderRadius: 10, fontFamily: "var(--mono)", fontSize: 11, color: toastColor, maxWidth: 380, animation: "slideInR 0.25s ease", boxShadow: "0 8px 30px rgba(0,0,0,0.6)", lineHeight: 1.5 }}>
            <span style={{ flex: 1 }}>{t.msg}</span>
            <button onClick={() => onRemove(t.id)} style={{ background: "none", border: "none", color: toastColor, cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0, opacity: 0.6 }}>×</button>
          </div>
        );
      })}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const id = useRef(0);
  const add = useCallback((msg, type = "success") => {
    const tid = ++id.current;
    setToasts((p) => [...p, { id: tid, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== tid)), 4500);
  }, []);
  const remove = useCallback((tid) => setToasts((p) => p.filter((t) => t.id !== tid)), []);
  return { toasts, add, remove };
}

// ─── Thread Lock Visualiser ───────────────────────────────────────────────────
function LockVisualiser({ active }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 8, border: `1px solid ${active ? "rgba(255,194,59,0.4)" : "var(--border)"}`, background: active ? "rgba(255,194,59,0.07)" : "transparent", transition: "all 0.3s", animation: active ? "lockPulse 1s ease-in-out infinite" : "none" }}>
      <span style={{ fontSize: 13 }}>{active ? "🔒" : "🔓"}</span>
      <div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: active ? "var(--amber)" : "var(--muted2)", letterSpacing: "0.1em" }}>{active ? "LOCK ACQUIRED" : "LOCK FREE"}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 7, color: "var(--muted)", marginTop: 1 }}>threading.Lock()</div>
      </div>
    </div>
  );
}

// ─── Seat Cell ────────────────────────────────────────────────────────────────
function SeatCell({ seat, selected, myBooked, onToggle, loading, flash }) {
  const unavail = !seat.available;
  const isMine = myBooked.includes(seat.id);
  const isSel = selected.includes(seat.id);

  let bg, border, color, cursor = "pointer";

  // Flash takes precedence
  if (flash === "booked") { bg = "rgba(0,212,255,0.2)"; border = "var(--accent)"; color = "var(--accent)"; }
  else if (flash === "cancelled") { bg = "rgba(0,255,136,0.15)"; border = "var(--green)"; color = "var(--green)"; } // Fixed: now uses green
  else if (flash === "conflict") { bg = "rgba(255,194,59,0.18)"; border = "var(--amber)"; color = "var(--amber)"; }
  else if (isMine && isSel) { bg = "rgba(255,61,107,0.15)"; border = "var(--red)"; color = "var(--red)"; }
  else if (isMine) { bg = "rgba(255,194,59,0.1)"; border = "rgba(255,194,59,0.45)"; color = "var(--amber)"; }
  else if (unavail) { bg = "var(--red-dim)"; border = "rgba(255,61,107,0.18)"; color = "var(--red)"; cursor = "not-allowed"; }
  else if (isSel) { bg = "rgba(0,212,255,0.12)"; border = "var(--accent)"; color = "var(--accent)"; }
  else { bg = "var(--green-dim)"; border = "rgba(0,255,136,0.22)"; color = "var(--green)"; }

  const icon = isMine && isSel ? "×" : unavail && !isMine ? "✕" : isSel ? "●" : isMine ? "★" : "○";

  return (
    <button
      disabled={(unavail && !isMine) || loading}
      onClick={() => { if (!unavail || isMine) onToggle(seat.id); }}
      title={`${seat.id} — ${isMine ? "YOUR BOOKING" : unavail ? "TAKEN" : isSel ? "SELECTED" : "AVAILABLE"}`}
      style={{ background: bg, border: `1px solid ${border}`, borderRadius: 9, color, cursor: (unavail && !isMine) || loading ? "not-allowed" : "pointer", padding: "9px 4px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 60, fontFamily: "var(--mono)", transition: "all 0.14s ease", opacity: unavail && !isMine ? 0.5 : 1, animation: flash ? "seatPop 0.35s ease" : "none", position: "relative" }}
    >
      {isMine && !isSel && <span style={{ position: "absolute", top: 3, right: 4, fontSize: 6, color: "var(--amber)" }}>★</span>}
      <span style={{ fontSize: 11, fontWeight: 700 }}>{seat.id}</span>
      <span style={{ fontSize: 9, marginTop: 3, opacity: 0.75 }}>{icon}</span>
    </button>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = "var(--accent)", h = 36 }) {
  if (data.length < 2) return <div style={{ height: h }} />;
  const max = Math.max(...data, 0.0001);
  const W = 160;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={W} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) / (data.length - 1) * W} cy={h - (data[data.length - 1] / max) * h} r="2.5" fill={color} />
    </svg>
  );
}

function MetricCard({ label, value, sub, color = "var(--accent)", spark }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", animation: "fadeUp 0.35s ease both" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.14em", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>{sub}</div>}
      {spark && <div style={{ marginTop: 10 }}><Sparkline data={spark} color={color} /></div>}
    </div>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [glitch, setGlitch] = useState(false);

  const doGlitch = () => { setGlitch(true); setTimeout(() => setGlitch(false), 500); };

  const handleSubmit = async () => {
    setError("");
    if (!username.trim() || !password.trim()) { setError("All fields required"); doGlitch(); return; }
    setLoading(true);

    try {
      if (tab === "login") {
        const response = await fetch(`${API}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim().toLowerCase(), password })
        });
        const data = await response.json();
        
        if (response.ok) {
          const sess = { 
            username: data.username, 
            role: data.role,
            userId: data.userId
          };
          saveSession(sess);
          onLogin(sess);
        } else {
          setError(data.error || "ACCESS DENIED — Invalid credentials");
          doGlitch();
        }
      } else {
        if (password !== confirm) { setError("Passwords do not match"); doGlitch(); setLoading(false); return; }
        if (password.length < 4) { setError("Password must be ≥ 4 characters"); doGlitch(); setLoading(false); return; }
        
        const response = await fetch(`${API}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim().toLowerCase(), password })
        });
        const data = await response.json();
        
        if (response.ok) {
          const sess = { 
            username: data.username, 
            role: data.role,
            userId: data.userId
          };
          saveSession(sess);
          onLogin(sess);
        } else {
          setError(data.error || "Registration failed");
          doGlitch();
        }
      }
    } catch (err) {
      logError("AUTH_REQUEST", err);
      if (err.message === "Failed to fetch") {
        setError("❌ Certificate Not Trusted — Open https://localhost:5000/api/health, accept the warning, then retry login");
      } else {
        setError("⚠ Connection failed — is server running? Check /api/health");
      }
      doGlitch();
    } finally {
      setLoading(false);
    }
  };

  const inp = (err) => ({ width: "100%", padding: "10px 13px", background: "var(--bg)", border: `1px solid ${err ? "var(--red)" : "var(--border-hi)"}`, borderRadius: 9, color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, outline: "none", transition: "border-color 0.2s" });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
      <GridBG /><Noise />

      <div style={{ textAlign: "center", marginBottom: 40, animation: "fadeUp 0.5s ease" }}>
        <div style={{ width: 64, height: 64, margin: "0 auto 14px", border: "1.5px solid var(--accent)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 32px var(--accent-glow), inset 0 0 20px var(--accent-dim)" }}>
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none"><rect x="2" y="2" width="11" height="11" rx="2" fill="var(--accent)" /><rect x="17" y="2" width="11" height="11" rx="2" fill="var(--accent)" opacity=".35" /><rect x="2" y="17" width="11" height="11" rx="2" fill="var(--accent)" opacity=".35" /><rect x="17" y="17" width="11" height="11" rx="2" fill="var(--accent)" /></svg>
        </div>
        <div style={{ position: "relative", display: "inline-block" }}>
          <span style={{ fontFamily: "var(--sans)", fontWeight: 800, fontSize: 26, letterSpacing: "-0.03em" }}>RESERVE<span style={{ color: "var(--accent)" }}>X</span></span>
          {glitch && <span style={{ position: "absolute", inset: 0, fontFamily: "var(--sans)", fontWeight: 800, fontSize: 26, color: "var(--red)", animation: "glitch1 0.4s steps(1) infinite" }}>RESERVE<span style={{ color: "var(--red)" }}>X</span></span>}
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.18em", marginTop: 4 }}>DISTRIBUTED SEAT RESERVATION</div>
      </div>

      <div style={{ width: 360, padding: "30px 32px", background: "var(--surface)", border: "1px solid var(--border-hi)", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,0.7)", animation: "fadeUp 0.4s ease 0.1s both", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", background: "var(--bg)", borderRadius: 8, padding: 3, marginBottom: 24, border: "1px solid var(--border)" }}>
          {["login", "register"].map((t) => (
            <button key={t} onClick={() => { setTab(t); setError(""); }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "none", background: tab === t ? "var(--accent)" : "transparent", color: tab === t ? "#000" : "var(--muted2)", fontFamily: "var(--sans)", fontWeight: 700, fontSize: 12, letterSpacing: "0.07em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.18s" }}>
              {t === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "USERNAME", val: username, set: setUsername, type: "text" },
            { label: "PASSWORD", val: password, set: setPassword, type: "password" },
            ...(tab === "register" ? [{ label: "CONFIRM PASSWORD", val: confirm, set: setConfirm, type: "password" }] : []),
          ].map(({ label, val, set, type }) => (
            <div key={label}>
              <label style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.15em", display: "block", marginBottom: 5 }}>{label}</label>
              <input type={type} value={val} onChange={(e) => { set(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={inp(error)} onFocus={(e) => (e.target.style.borderColor = "var(--accent)")} onBlur={(e) => (e.target.style.borderColor = error ? "var(--red)" : "var(--border-hi)")} />
            </div>
          ))}
        </div>

        {error && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--red)", marginTop: 10, letterSpacing: "0.04em", animation: "fadeIn 0.2s ease" }}>✕ {error}</div>}

        {tab === "login" && <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", marginTop: 10 }}>Default admin: <span style={{ color: "var(--accent)" }}>admin / admin123</span></div>}

        <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "12px 0", marginTop: 20, background: loading ? "var(--border)" : "var(--accent)", border: "none", borderRadius: 9, color: loading ? "var(--muted2)" : "#000", fontFamily: "var(--sans)", fontWeight: 700, fontSize: 13, letterSpacing: "0.07em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 0 20px var(--accent-glow)", transition: "all 0.2s" }}>
          {loading ? "AUTHENTICATING…" : tab === "login" ? "ENTER SYSTEM →" : "CREATE ACCOUNT →"}
        </button>
      </div>

      <div style={{ marginTop: 18, fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", letterSpacing: "0.14em", display: "flex", alignItems: "center", gap: 8, animation: "fadeIn 0.5s ease 0.4s both", position: "relative", zIndex: 1 }}>
        <StatusDot color="var(--green)" pulse /> TLS 1.2+ · TCP:9999 → FLASK:5000 → REACT
      </div>
    </div>
  );
}

// ─── USER VIEW ────────────────────────────────────────────────────────────────
function UserView({ session, onLogout, addLog }) {
  const [seats, setSeats] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState("checking");
  const [flashMap, setFlashMap] = useState({});
  const [lockActive, setLockActive] = useState(false);
  const [myBooked, setMyBooked] = useState([]);
  const { toasts, add: notify, remove: removeToast } = useToast();

  const fetchSeats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/seats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setSeats(data.seats);
      setServerStatus("online");
    } catch (err) { 
      logError("FETCH_SEATS", err);
      setServerStatus("offline"); 
    }
  }, []);

  const fetchMyBookings = useCallback(async () => {
    if (!session?.userId) return;
    try {
      const res = await fetch(`${API}/users/me/bookings?userId=${session.userId}`);
      if (res.ok) {
        const data = await res.json();
        setMyBooked(data.bookings);
      }
    } catch (err) {
      console.error("Failed to fetch bookings:", err);
    }
  }, [session?.userId]);

  useEffect(() => { fetchSeats(); fetchMyBookings(); }, [fetchSeats, fetchMyBookings]);
  useEffect(() => { 
    // Reduced polling from 5s to 10s to reduce server load
    const iv = setInterval(() => {
      fetchSeats();
      fetchMyBookings();
    }, 10000); 
    return () => clearInterval(iv); 
  }, [fetchSeats, fetchMyBookings]);

  const setFlash = (ids, type, dur = 1100) => {
    setFlashMap((p) => { const n = { ...p }; ids.forEach((id) => (n[id] = type)); return n; });
    setTimeout(() => setFlashMap((p) => { const n = { ...p }; ids.forEach((id) => delete n[id]); return n; }), dur);
  };

  const toggleSeat = (id) => {
    const seat = seats.find((s) => s.id === id);
    if (!seat) return;
    if (seat.available || myBooked.includes(id)) {
      setSelected((p) => p.includes(id) ? p.filter((s) => s !== id) : [...p, id]);
    }
  };

  const selBookable = selected.filter((id) => {
    const s = seats.find((s) => s.id === id);
    return s && s.available && !myBooked.includes(id);
  });
  const selCancellable = selected.filter((id) => {
    const s = seats.find((s) => s.id === id);
    return s && !s.available && myBooked.includes(id);
  });

  const handleBook = async () => {
    if (!selBookable.length) { notify("Select available seats to book", "error"); return; }
    setLoading(true); setLockActive(true);
    try {
      const res = await fetch(`${API}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            seats: selBookable, 
            userId: session.userId,
            username: session.username  // Add this line
        })
    });
      const data = await res.json();
      setLockActive(false);
      if (data.error) { notify(data.error, "error"); return; }
      if (data.booked?.length) {
        setFlash(data.booked, "booked");
        notify(`✓ Booked: ${data.booked.join(", ")}`, "success");
        addLog({ msg: `[${session.username}] BOOKED ${data.booked.join(", ")}`, type: "book" });
        
        // IMMEDIATELY update local state: add booked seats to myBooked
        setMyBooked(prev => [...new Set([...prev, ...data.booked])]);
        
        // Update seats to mark booked ones as unavailable
        setSeats(prev => prev.map(seat => 
          data.booked.includes(seat.id) 
            ? { ...seat, available: false }  // Mark as unavailable immediately
            : seat
        ));
      }
      if (data.already_booked?.length) {
        setFlash(data.already_booked, "conflict");
        notify(`⚠ Thread conflict — seat taken by another user: ${data.already_booked.join(", ")}`, "lock");
        
        // Update seats for conflicting bookings
        setSeats(prev => prev.map(seat => 
          data.already_booked.includes(seat.id) 
            ? { ...seat, available: false }
            : seat
        ));
      }
      setSelected([]);
      // Verify state with server (fetch in background)
      setTimeout(() => {
        fetchMyBookings();
        fetchSeats();
      }, 500); // Small delay to ensure TCP server has processed
    } catch (err) { 
      logError("HANDLE_BOOK", err);
      notify("Booking failed — is server running?", "error"); 
      setLockActive(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selCancellable.length) { notify("Select your booked seats (star) to cancel", "error"); return; }
    setLoading(true); setLockActive(true);
    try {
      const res = await fetch(`${API}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            seats: selCancellable, 
            userId: session.userId,
            username: session.username
        })
      });
      const data = await res.json();
      setLockActive(false);
      if (data.error) { notify(data.error, "error"); return; }
      if (data.cancelled?.length) {
        setFlash(data.cancelled, "cancelled"); // Now flashes green
        notify(`Cancelled: ${data.cancelled.join(", ")}`, "success");
        addLog({ msg: `[${session.username}] CANCELLED ${data.cancelled.join(", ")}`, type: "cancel" });
        
        // IMMEDIATELY update local state: remove cancelled seats from myBooked
        setMyBooked(prev => prev.filter(seatId => !data.cancelled.includes(seatId)));
        
        // Update seats to mark cancelled ones as available
        setSeats(prev => prev.map(seat => 
          data.cancelled.includes(seat.id) 
            ? { ...seat, available: true }  // Mark as available immediately
            : seat
        ));
      }
      setSelected([]);
      // Verify state with server (fetch in background)
      setTimeout(() => {
        fetchMyBookings();
        fetchSeats();
      }, 500); // Small delay to ensure TCP server has processed
    } catch (err) { 
      logError("HANDLE_CANCEL", err);
      notify("Cancel failed", "error"); 
      setLockActive(false);
    }
    finally { setLoading(false); }
  };

  const available = seats.filter((s) => s.available).length;
  const taken = seats.length - available;
  const occupancy = seats.length ? Math.round((taken / seats.length) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <GridBG /><Noise />
      <TickerBar items={[`USER: ${session.username.toUpperCase()}`, `AVAILABLE: ${available}/20`, `BOOKED: ${taken}/20`, `MY SEATS: ${myBooked.length}`, `SERVER: ${serverStatus.toUpperCase()}`, "TLS 1.2+ ACTIVE", "threading.Lock() ACTIVE"]} />

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: "1px solid var(--border)", background: "rgba(11,16,24,0.85)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, border: "1.5px solid var(--accent)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 14px var(--accent-glow)" }}>
            <svg width="16" height="16" viewBox="0 0 30 30" fill="none"><rect x="2" y="2" width="11" height="11" rx="2" fill="var(--accent)" /><rect x="17" y="2" width="11" height="11" rx="2" fill="var(--accent)" opacity=".35" /><rect x="2" y="17" width="11" height="11" rx="2" fill="var(--accent)" opacity=".35" /><rect x="17" y="17" width="11" height="11" rx="2" fill="var(--accent)" /></svg>
          </div>
          <div>
            <div style={{ fontFamily: "var(--sans)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>RESERVE<span style={{ color: "var(--accent)" }}>X</span></div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--muted2)", letterSpacing: "0.12em" }}>SESSION: {session.username.toUpperCase()}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LockVisualiser active={lockActive} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <StatusDot color={serverStatus === "online" ? "var(--green)" : "var(--red)"} pulse={serverStatus === "online"} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)" }}>{serverStatus === "online" ? "ONLINE" : serverStatus === "checking" ? "CONNECTING" : "OFFLINE"}</span>
          </div>
          <button onClick={onLogout} style={{ padding: "6px 13px", background: "transparent", border: "1px solid var(--border-hi)", borderRadius: 7, color: "var(--muted2)", fontFamily: "var(--mono)", fontSize: 9, cursor: "pointer", letterSpacing: "0.08em" }}>LOGOUT</button>
        </div>
      </header>

      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "rgba(11,16,24,0.5)" }}>
        {[
          { label: "TOTAL", val: 20, color: "var(--text)" },
          { label: "AVAILABLE", val: available, color: "var(--green)" },
          { label: "BOOKED", val: taken, color: "var(--red)" },
          { label: "MY BOOKINGS", val: myBooked.length, color: "var(--amber)" },
          { label: "SELECTED", val: selected.length, color: "var(--accent)" },
        ].map(({ label, val, color }, i, arr) => (
          <div key={label} style={{ flex: 1, padding: "12px 0", textAlign: "center", borderRight: i < arr.length - 1 ? "1px solid var(--border)" : "none" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--muted2)", letterSpacing: "0.12em" }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 20, padding: "24px 28px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px", animation: "fadeUp 0.35s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.15em" }}>SEAT MAP</div>
            <button onClick={() => { fetchSeats(); fetchMyBookings(); }} style={{ padding: "5px 11px", borderRadius: 7, background: "var(--accent-dim)", border: "1px solid rgba(0,212,255,0.2)", color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 9, cursor: "pointer" }}>⟳ SYNC</button>
          </div>

          <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            {["var(--green)", "var(--amber)", "var(--accent)", "var(--red)"].map((color, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            {[["var(--green)", "Available (click to book)"], ["var(--amber)", "My Booking ★ (click to cancel)"], ["var(--accent)", "Selected"], ["var(--red)", "Taken by others"]].map(([color, label]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: color, display: "block", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)" }}>{label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7, marginBottom: 20 }}>
            {seats.length === 0
              ? Array.from({ length: 20 }).map((_, i) => <div key={i} style={{ height: 60, borderRadius: 9, background: "var(--border)", opacity: 0.5 }} />)
              : seats.map((s) => <SeatCell key={s.id} seat={s} selected={selected} myBooked={myBooked} onToggle={toggleSeat} loading={loading} flash={flashMap[s.id]} />)
            }
          </div>

          {selected.length > 0 && (
            <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", lineHeight: 1.8 }}>
              {selBookable.length > 0 && <div>BOOK: <span style={{ color: "var(--accent)" }}>{selBookable.join("  ·  ")}</span></div>}
              {selCancellable.length > 0 && <div>CANCEL: <span style={{ color: "var(--red)" }}>{selCancellable.join("  ·  ")}</span></div>}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selBookable.length > 0 && selCancellable.length > 0 ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleBook} disabled={loading} style={{ flex: 1, padding: "11px 0", background: "var(--accent)", border: "none", borderRadius: 9, color: "#000", fontFamily: "var(--sans)", fontWeight: 700, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 0 16px var(--accent-glow)", opacity: loading ? 0.5 : 1 }}>
                  {loading ? "…" : `BOOK ${selBookable.length} →`}
                </button>
                <button onClick={handleCancel} disabled={loading} style={{ flex: 1, padding: "11px 0", background: "var(--red)", border: "none", borderRadius: 9, color: "#fff", fontFamily: "var(--sans)", fontWeight: 700, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 0 16px rgba(255,61,107,0.3)", opacity: loading ? 0.5 : 1 }}>
                  {loading ? "…" : `CANCEL ${selCancellable.length} →`}
                </button>
              </div>
            ) : selCancellable.length > 0 ? (
              <button onClick={handleCancel} disabled={loading || serverStatus !== "online"} style={{ width: "100%", padding: "12px 0", background: loading ? "var(--border)" : "var(--red)", border: "none", borderRadius: 9, color: loading ? "var(--muted2)" : "#fff", fontFamily: "var(--sans)", fontWeight: 700, fontSize: 13, letterSpacing: "0.07em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 0 16px rgba(255,61,107,0.3)", transition: "all 0.2s" }}>
                {loading ? "PROCESSING…" : `CANCEL ${selCancellable.length} SEAT${selCancellable.length > 1 ? "S" : ""} →`}
              </button>
            ) : (
              <button onClick={selBookable.length ? handleBook : undefined} disabled={loading || !selBookable.length || serverStatus !== "online"} style={{ width: "100%", padding: "12px 0", background: !selBookable.length || loading ? "var(--border)" : "var(--accent)", border: "none", borderRadius: 9, color: !selBookable.length || loading ? "var(--muted2)" : "#000", fontFamily: "var(--sans)", fontWeight: 700, fontSize: 13, letterSpacing: "0.07em", textTransform: "uppercase", cursor: !selBookable.length || loading ? "not-allowed" : "pointer", boxShadow: selBookable.length && !loading ? "0 0 16px var(--accent-glow)" : "none", transition: "all 0.2s" }}>
                {loading ? "PROCESSING…" : selBookable.length ? `BOOK ${selBookable.length} SEAT${selBookable.length > 1 ? "S" : ""} →` : "SELECT SEATS TO CONTINUE"}
              </button>
            )}

            {selected.length > 0 && (
              <button onClick={() => setSelected([])} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 7, color: "var(--muted2)", fontFamily: "var(--mono)", fontSize: 9, cursor: "pointer", padding: "7px 0", letterSpacing: "0.09em" }}>CLEAR SELECTION</button>
            )}
          </div>
        </div>

        <div style={{ width: 256, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px", animation: "fadeUp 0.35s ease 0.1s both" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.14em", marginBottom: 12 }}>MY BOOKINGS ({myBooked.length})</div>
            {myBooked.length === 0
              ? <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", textAlign: "center", padding: "14px 0" }}>No bookings yet</div>
              : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {myBooked.map((id) => (
                    <div key={id} style={{ padding: "4px 9px", borderRadius: 6, background: "var(--amber-dim)", border: "1px solid rgba(255,194,59,0.3)", fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber)", cursor: "pointer" }}
                      onClick={() => toggleSeat(id)} title={`Click to select ${id} for cancellation`}>
                      {id} ★
                    </div>
                  ))}
                </div>
            }
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px", animation: "fadeUp 0.35s ease 0.15s both" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.14em", marginBottom: 10 }}>OCCUPANCY</div>
            <div style={{ height: 5, background: "var(--bg)", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${occupancy}%`, borderRadius: 3, transition: "width 0.6s ease", background: occupancy > 80 ? "var(--red)" : occupancy > 50 ? "var(--amber)" : "var(--green)" }} />
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)" }}>{taken}/{seats.length} seats · {occupancy}%</div>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px", animation: "fadeUp 0.35s ease 0.2s both", flex: 1, overflow: "hidden" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.14em", marginBottom: 10 }}>ALL SEATS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
              {seats.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: myBooked.includes(s.id) ? "var(--amber)" : "var(--muted2)" }}>{s.id}{myBooked.includes(s.id) ? " ★" : ""}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: s.available ? "var(--green)" : myBooked.includes(s.id) ? "var(--amber)" : "var(--red)" }}>
                    {s.available ? "FREE" : myBooked.includes(s.id) ? "MINE" : "TAKEN"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// ─── ADMIN VIEW (Enhanced Dashboard) ──────────────────────────────────────────
function AdminView({ session, onLogout, globalLog, addLog }) {
  const [tab, setTab] = useState("dashboard");
  const [dashboardData, setDashboardData] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toasts, add: notify, remove: removeToast } = useToast();
  const firstLoadRef = useRef(true);

  useEffect(() => {
    const fetchData = async () => {
      if (firstLoadRef.current) setLoading(true);
      try {
        // Fetch dashboard data
        const dashRes = await fetch(`${API}/admin/dashboard`);
        if (dashRes.ok) {
          const data = await dashRes.json();
          console.log('Dashboard data:', data); // Debug log
          setDashboardData(data);
        } else {
          console.error('Dashboard API error:', dashRes.status);
        }
        
        // Fetch users
        const usersRes = await fetch(`${API}/admin/users`);
        if (usersRes.ok) {
          const userData = await usersRes.json();
          console.log('Users data:', userData); // Debug log
          setUsers(userData);
        } else {
          console.error('Users API error:', usersRes.status);
        }
      } catch (err) {
        logError("ADMIN_FETCH", err);
        notify("Failed to load dashboard", "error");
      } finally {
        if (firstLoadRef.current) {
          setLoading(false);
          firstLoadRef.current = false;
        }
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const DashboardTab = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
      {/* System Status */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, gridColumn: "1 / -1" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted2)", letterSpacing: "0.1em", marginBottom: 12 }}>SYSTEM STATUS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4 }}>API</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot color={dashboardData?.health?.api_status === "online" ? "var(--green)" : "var(--red)"} pulse={false} />
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: dashboardData?.health?.api_status === "online" ? "var(--green)" : "var(--red)" }}>
                {dashboardData?.health?.api_status?.toUpperCase() || "UNKNOWN"}
              </span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4 }}>TCP SERVER</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot color={dashboardData?.health?.tcp_server === "connected" ? "var(--green)" : "var(--amber)"} pulse={false} />
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: dashboardData?.health?.tcp_server === "connected" ? "var(--green)" : "var(--amber)" }}>
                {dashboardData?.health?.tcp_server?.toUpperCase() || "UNKNOWN"}
              </span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4 }}>DATABASE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot color={dashboardData?.health?.database === "connected" ? "var(--green)" : "var(--red)"} pulse={false} />
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: dashboardData?.health?.database === "connected" ? "var(--green)" : "var(--red)" }}>
                {dashboardData?.health?.database?.toUpperCase() || "UNKNOWN"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <MetricCard label="Throughput" value={dashboardData?.metrics?.throughput_rps?.toFixed(2) + " RPS" || "0.00 RPS"} sub="Requests per second" color="var(--accent)" />
      <MetricCard label="Avg Latency" value={dashboardData?.metrics?.avg_latency_ms?.toFixed(1) + " ms" || "0 ms"} sub="Average response time" color="var(--green)" />
      <MetricCard label="Peak Latency" value={dashboardData?.metrics?.max_latency_ms?.toFixed(1) + " ms" || "0 ms"} sub="Maximum response time" color="var(--amber)" />
      <MetricCard label="Min Latency" value={dashboardData?.metrics?.min_latency_ms?.toFixed(1) + " ms" || "0 ms"} sub="Minimum response time" color="var(--purple)" />

      {/* Dashboard Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "var(--bg)", padding: 16, borderRadius: 10, border: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.12em", marginBottom: 4 }}>TOTAL USERS</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>{dashboardData?.users?.total_users || 0}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span>Admins:</span>
            <span style={{ color: "var(--purple)", fontWeight: 700 }}>{dashboardData?.users?.admin_count || 0}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span>Regular:</span>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>{dashboardData?.users?.regular_count || 0}</span>
          </div>
        </div>

        <div style={{ background: "var(--bg)", padding: 16, borderRadius: 10, border: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.12em", marginBottom: 4 }}>BOOKINGS</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--amber)", fontWeight: 700 }}>{dashboardData?.bookings?.total_bookings || 0}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span>Unique Users:</span>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>{dashboardData?.bookings?.unique_users || 0}</span>
          </div>
        </div>

        <div style={{ background: "var(--bg)", padding: 16, borderRadius: 10, border: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.12em", marginBottom: 4 }}>SEAT OCCUPANCY</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--red)", fontWeight: 700 }}>{dashboardData?.seats?.occupancy_rate || 0}%</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span>Available:</span>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>{dashboardData?.seats?.available_seats || 0}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span>Booked:</span>
            <span style={{ color: "var(--red)", fontWeight: 700 }}>{dashboardData?.seats?.booked_seats || 0}</span>
          </div>
        </div>
      </div>

          {/* Real-time API Latency Graph */}
      <div style={{ background: "var(--bg)", padding: 20, borderRadius: 10, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.12em", marginBottom: 16 }}>REAL-TIME API LATENCY (ms)</div>
        <div style={{ height: 220, width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dashboardData?.metrics_timeseries || []} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hi)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--muted2)" fontSize={10} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis stroke="var(--muted2)" fontSize={10} tickLine={false} axisLine={false} width={40} />
              <Tooltip 
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, fontFamily: "var(--mono)", color: "var(--text)" }}
                itemStyle={{ color: "var(--accent)" }}
              />
              <Area type="monotone" dataKey="latency" stroke="var(--accent)" strokeWidth={2} fillOpacity={1} fill="url(#colorLatency)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const CertificateTab = () => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, maxWidth: 800 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--purple)", marginBottom: 16, fontWeight: 700 }}>SSL/TLS CERTIFICATE</div>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4, letterSpacing: "0.1em" }}>CERTIFICATE FILE</div>
          <div style={{ fontSize: 12, color: "var(--text)", fontFamily: "var(--mono)", background: "var(--bg)", padding: 9, borderRadius: 6, border: "1px solid var(--border)" }}>
            {dashboardData?.certificate?.file || "N/A"}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4, letterSpacing: "0.1em" }}>KEY FILE</div>
          <div style={{ fontSize: 12, color: "var(--text)", fontFamily: "var(--mono)", background: "var(--bg)", padding: 9, borderRadius: 6, border: "1px solid var(--border)" }}>
            {dashboardData?.certificate?.key_file || "N/A"}
          </div>
        </div>

        <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4, letterSpacing: "0.1em" }}>SUBJECT</div>
          <div style={{ fontSize: 11, color: "var(--text)", fontFamily: "var(--mono)", background: "var(--bg)", padding: 9, borderRadius: 6, border: "1px solid var(--border)", wordBreak: "break-word" }}>
            {dashboardData?.certificate?.subject ? dashboardData.certificate.subject.substring(0, 100) : "N/A"}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4, letterSpacing: "0.1em" }}>ISSUER</div>
          <div style={{ fontSize: 11, color: "var(--text)", fontFamily: "var(--mono)", background: "var(--bg)", padding: 9, borderRadius: 6, border: "1px solid var(--border)" }}>
            {dashboardData?.certificate?.issuer?.substring(0, 80) || "Self-signed"}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4, letterSpacing: "0.1em" }}>VALID FROM</div>
            <div style={{ fontSize: 11, color: "var(--text)", fontFamily: "var(--mono)" }}>
              {dashboardData?.certificate?.valid_from?.substring(0, 20) || "N/A"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4, letterSpacing: "0.1em" }}>VALID UNTIL</div>
            <div style={{ fontSize: 11, color: "var(--text)", fontFamily: "var(--mono)" }}>
              {dashboardData?.certificate?.valid_until?.substring(0, 20) || "N/A"}
            </div>
          </div>
        </div>

        {dashboardData?.certificate?.san && (
          <div>
            <div style={{ fontSize: 9, color: "var(--muted2)", marginBottom: 4, letterSpacing: "0.1em" }}>SAN (Subject Alt Name)</div>
            <div style={{ fontSize: 11, color: "var(--green)", fontFamily: "var(--mono)" }}>
              {dashboardData.certificate.san}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const SystemTab = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--purple)", letterSpacing: "0.1em", marginBottom: 12, fontWeight: 700 }}>NETWORK CONFIGURATION</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11 }}>
          <div>
            <div style={{ color: "var(--muted2)", marginBottom: 2 }}>TCP Server Host:</div>
            <div style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>{dashboardData?.system?.tcp_host || "localhost"}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted2)", marginBottom: 2 }}>TCP Server Port:</div>
            <div style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{dashboardData?.system?.tcp_port || 9999}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted2)", marginBottom: 2 }}>Database:</div>
            <div style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>{dashboardData?.system?.database || "reservation.db"}</div>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--green)", letterSpacing: "0.1em", marginBottom: 12, fontWeight: 700 }}>API STATISTICS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11 }}>
          <div>
            <div style={{ color: "var(--muted2)", marginBottom: 2 }}>Total API Calls:</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{dashboardData?.metrics?.total_api_calls || 0}</div>
          </div>
          <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <div style={{ color: "var(--muted2)", marginBottom: 2 }}>Current Throughput:</div>
            <div style={{ fontFamily: "var(--mono)", color: "var(--green)" }}>{dashboardData?.metrics?.throughput_rps?.toFixed(2) || 0} RPS</div>
          </div>
        </div>
      </div>
    </div>
  );

  const UsersTab = () => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", marginBottom: 16, fontWeight: 700 }}>REGISTERED USERS ({users.length})</div>
      <div style={{ maxHeight: 500, overflowY: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {users.map((user) => (
            <div key={user.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: "var(--bg)", borderRadius: 6, fontSize: 11, borderLeft: `3px solid ${user.role === 'admin' ? 'var(--purple)' : 'var(--green)'}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>
                  {user.role === 'admin' && <span style={{ color: "var(--purple)", marginRight: 4 }}>👤</span>}
                  {user.username}
                </div>
                <div style={{ color: "var(--muted2)", fontSize: 9, marginTop: 2 }}>
                  Role: {user.role} • Joined: {new Date(user.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ color: "var(--muted2)", fontSize: 9 }}>
                Last: {user.last_login ? new Date(user.last_login).toLocaleDateString() : "Never"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const tabs = [
    { id: "dashboard", label: "DASHBOARD", icon: "📊" },
    { id: "certificate", label: "SSL CERTIFICATE", icon: "🔐" },
    { id: "system", label: "SYSTEM", icon: "⚙" },
    { id: "users", label: "USERS", icon: "👥" }
  ];

  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <GridBG /><Noise />
      <TickerBar items={["ADMIN DASHBOARD", "METRICS & MONITORING", "SYSTEM HEALTH", "TLS 1.2+ ENCRYPTED"]} />

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: "1px solid var(--border)", background: "rgba(11,16,24,0.9)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, border: "1.5px solid var(--purple)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 14px rgba(176,110,255,0.35)" }}>
            <span style={{ fontSize: 15 }}>⬡</span>
          </div>
          <div>
            <div style={{ fontFamily: "var(--sans)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>RESERVE<span style={{ color: "var(--purple)" }}>X</span> <span style={{ color: "var(--muted2)", fontSize: 12, fontWeight: 500 }}>ADMIN</span></div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--muted2)", letterSpacing: "0.12em" }}>ELEVATED ACCESS · {session.username.toUpperCase()}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ padding: "6px 13px", background: "transparent", border: "1px solid rgba(176,110,255,0.3)", borderRadius: 7, color: "var(--purple)", fontFamily: "var(--mono)", fontSize: 9, cursor: "pointer", letterSpacing: "0.08em" }}>LOGOUT</button>
      </header>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 2, padding: "12px 28px", background: "var(--surface)", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 14px",
              background: tab === t.id ? "var(--accent)" : "var(--bg)",
              border: `1px solid ${tab === t.id ? "var(--accent)" : "var(--border)"}`,
              color: tab === t.id ? "#000" : "var(--muted2)",
              borderRadius: 6,
              fontFamily: "var(--mono)",
              fontSize: 9,
              fontWeight: tab === t.id ? 700 : 400,
              cursor: "pointer",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
              transition: "all 0.2s"
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "24px 28px", maxWidth: 1400, margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted2)" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>Loading dashboard...</div>
          </div>
        ) : (
          <>
            {tab === "dashboard" && <DashboardTab />}
            {tab === "certificate" && <CertificateTab />}
            {tab === "system" && <SystemTab />}
            {tab === "users" && <UsersTab />}
          </>
        )}
      </div>

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => injectCSS(), []);
  const [session, setSession] = useState(() => loadSession());
  const [globalLog, setGlobalLog] = useState([]);

  const addLog = useCallback(({ msg, type }) => {
    setGlobalLog((p) => [...p, { msg, type, time: ts() }]);
  }, []);

  const handleLogin = (sess) => {
    setSession(sess);
    addLog({ msg: `SESSION STARTED — ${sess.username.toUpperCase()} (${sess.role})`, type: "sys" });
  };

  const handleLogout = () => {
    if (session) addLog({ msg: `SESSION ENDED — ${session.username.toUpperCase()}`, type: "sys" });
    clearSession();
    setSession(null);
  };

  if (!session) return <AuthScreen onLogin={handleLogin} />;
  if (session.role === "admin") return <AdminView session={session} onLogout={handleLogout} globalLog={globalLog} addLog={addLog} />;
  return <UserView session={session} onLogout={handleLogout} addLog={addLog} />;
}
