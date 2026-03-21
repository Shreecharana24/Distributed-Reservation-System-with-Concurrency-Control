import { useState, useEffect, useCallback } from "react";

const API = "https://localhost:5000/api";
// ── Seat grid component ──────────────────────────────────────────────────────
function SeatGrid({ seats, selected, onToggle, loading }) {
  return (
    <div style={styles.gridWrap}>
      {seats.map((seat) => {
        const isSelected = selected.includes(seat.id);
        const unavailable = !seat.available;
        return (
          <button
            key={seat.id}
            disabled={unavailable || loading}
            onClick={() => !unavailable && onToggle(seat.id)}
            style={{
              ...styles.seat,
              ...(unavailable ? styles.seatTaken : {}),
              ...(isSelected && !unavailable ? styles.seatSelected : {}),
              ...(!unavailable && !isSelected ? styles.seatFree : {}),
            }}
            title={unavailable ? `${seat.id} — Taken` : `${seat.id} — Click to select`}
          >
            <span style={styles.seatLabel}>{seat.id}</span>
            <span style={styles.seatDot}>
              {unavailable ? "✕" : isSelected ? "✓" : "○"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;
  return (
    <div style={{ ...styles.toast, ...(type === "error" ? styles.toastError : styles.toastSuccess) }}>
      <span>{msg}</span>
      <button onClick={onClose} style={styles.toastClose}>×</button>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  const items = [
    { color: "#22c55e", label: "Available" },
    { color: "#f59e0b", label: "Selected" },
    { color: "#ef4444", label: "Booked" },
  ];
  return (
    <div style={styles.legend}>
      {items.map(({ color, label }) => (
        <div key={label} style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: color }} />
          <span style={styles.legendText}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [seats, setSeats] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "success" });
  const [bookingLog, setBookingLog] = useState([]);
  const [serverStatus, setServerStatus] = useState("checking");

  const notify = (msg, type = "success") => setToast({ msg, type });

  const fetchSeats = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`${API}/seats`);
      const data = await res.json();
      if (data.error) { notify(data.error, "error"); setServerStatus("offline"); return; }
      setSeats(data.seats);
      setServerStatus("online");
    } catch {
      notify("Cannot reach Flask API. Is app.py running?", "error");
      setServerStatus("offline");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSeats(); }, [fetchSeats]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchSeats(true), 5000);
    return () => clearInterval(interval);
  }, [fetchSeats]);

  const toggleSeat = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleBook = async () => {
    if (!selected.length) { notify("Select at least one seat first.", "error"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats: selected }),
      });
      const data = await res.json();
      if (data.error) { notify(data.error, "error"); return; }

      const parts = [];
      if (data.booked.length) parts.push(`✓ Booked: ${data.booked.join(", ")}`);
      if (data.already_booked.length) parts.push(`⚠ Already taken: ${data.already_booked.join(", ")}`);
      if (data.invalid.length) parts.push(`✕ Invalid: ${data.invalid.join(", ")}`);

      const summary = parts.join("  |  ");
      notify(summary, data.booked.length ? "success" : "error");
      setBookingLog((prev) => [{ time: new Date().toLocaleTimeString(), summary }, ...prev.slice(0, 9)]);
      setSelected([]);
      await fetchSeats(true);
    } catch {
      notify("Booking failed. Check your connection.", "error");
    } finally {
      setLoading(false);
    }
  };

  const available = seats.filter((s) => s.available).length;
  const taken = seats.length - available;

  return (
    <div style={styles.root}>
      {/* ── Background decoration ── */}
      <div style={styles.bgAccent1} />
      <div style={styles.bgAccent2} />

      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>◈</div>
          <div>
            <h1 style={styles.title}>ReserveX</h1>
            <p style={styles.subtitle}>Distributed Seat Reservation System</p>
          </div>
        </div>
        <div style={styles.statusBadge}>
          <span style={{ ...styles.statusDot, background: serverStatus === "online" ? "#22c55e" : "#ef4444" }} />
          <span style={styles.statusText}>
            {serverStatus === "checking" ? "Connecting…" : serverStatus === "online" ? "Server Online" : "Server Offline"}
          </span>
        </div>
      </header>

      {/* ── Stats bar ── */}
      <div style={styles.statsBar}>
        <div style={styles.statCard}>
          <span style={styles.statNum}>{seats.length}</span>
          <span style={styles.statLabel}>Total</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statCard}>
          <span style={{ ...styles.statNum, color: "#22c55e" }}>{available}</span>
          <span style={styles.statLabel}>Available</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statCard}>
          <span style={{ ...styles.statNum, color: "#ef4444" }}>{taken}</span>
          <span style={styles.statLabel}>Booked</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statCard}>
          <span style={{ ...styles.statNum, color: "#f59e0b" }}>{selected.length}</span>
          <span style={styles.statLabel}>Selected</span>
        </div>
      </div>

      {/* ── Main content ── */}
      <main style={styles.main}>
        {/* Seat panel */}
        <section style={styles.seatPanel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Seat Map</h2>
            <button onClick={() => fetchSeats()} disabled={refreshing} style={styles.refreshBtn}>
              {refreshing ? "⟳ Refreshing…" : "⟳ Refresh"}
            </button>
          </div>
          <Legend />
          {seats.length === 0
            ? <p style={styles.emptyMsg}>Loading seats…</p>
            : <SeatGrid seats={seats} selected={selected} onToggle={toggleSeat} loading={loading} />
          }
          {/* Book button */}
          <div style={styles.bookArea}>
            {selected.length > 0 && (
              <p style={styles.selectedPreview}>
                Booking: <strong>{selected.join(", ")}</strong>
              </p>
            )}
            <button
              onClick={handleBook}
              disabled={loading || !selected.length || serverStatus !== "online"}
              style={{
                ...styles.bookBtn,
                ...(loading || !selected.length ? styles.bookBtnDisabled : {}),
              }}
            >
              {loading ? "Booking…" : selected.length ? `Book ${selected.length} Seat${selected.length > 1 ? "s" : ""}` : "Select Seats to Book"}
            </button>
            {selected.length > 0 && (
              <button onClick={() => setSelected([])} style={styles.clearBtn}>
                Clear Selection
              </button>
            )}
          </div>
        </section>

        {/* Log panel */}
        <aside style={styles.logPanel}>
          <h2 style={styles.panelTitle}>Booking Log</h2>
          {bookingLog.length === 0
            ? <p style={styles.emptyMsg}>No bookings yet this session.</p>
            : bookingLog.map((entry, i) => (
              <div key={i} style={styles.logEntry}>
                <span style={styles.logTime}>{entry.time}</span>
                <span style={styles.logMsg}>{entry.summary}</span>
              </div>
            ))
          }
        </aside>
      </main>

      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: "", type: "success" })} />

      <footer style={styles.footer}>
        Distributed Reservation System · TCP Socket Server ↔ Flask API ↔ React UI
      </footer>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh",
    background: "#0a0f1a",
    color: "#e2e8f0",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    position: "relative",
    overflow: "hidden",
  },
  bgAccent1: {
    position: "fixed", top: -200, right: -200,
    width: 600, height: 600,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  bgAccent2: {
    position: "fixed", bottom: -150, left: -150,
    width: 500, height: 500,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "24px 40px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.02)",
    backdropFilter: "blur(12px)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  logo: {
    fontSize: 36, color: "#6366f1",
    lineHeight: 1,
    filter: "drop-shadow(0 0 12px rgba(99,102,241,0.6))",
  },
  title: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#f8fafc" },
  subtitle: { margin: 0, fontSize: 12, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" },
  statusBadge: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 16px",
    borderRadius: 20,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  statusDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  statusText: { fontSize: 12, color: "#94a3b8" },
  statsBar: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 0, padding: "16px 40px",
    background: "rgba(255,255,255,0.02)",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  statCard: { display: "flex", flexDirection: "column", alignItems: "center", padding: "0 32px" },
  statNum: { fontSize: 28, fontWeight: 700, color: "#f8fafc" },
  statLabel: { fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" },
  statDivider: { width: 1, height: 40, background: "rgba(255,255,255,0.06)" },
  main: {
    display: "flex", gap: 24,
    padding: "32px 40px",
    maxWidth: 1200, margin: "0 auto",
    alignItems: "flex-start",
  },
  seatPanel: {
    flex: 1,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
    padding: 28,
  },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  panelTitle: { margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#94a3b8" },
  refreshBtn: {
    fontSize: 12, padding: "6px 14px",
    background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: 8, color: "#818cf8", cursor: "pointer",
    transition: "all 0.2s",
  },
  legend: { display: "flex", gap: 20, marginBottom: 20 },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3, display: "inline-block" },
  legendText: { fontSize: 12, color: "#64748b" },
  gridWrap: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 10,
    marginBottom: 24,
  },
  seat: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "10px 4px", borderRadius: 10,
    border: "1px solid transparent",
    cursor: "pointer", transition: "all 0.15s ease",
    minHeight: 64,
  },
  seatFree: {
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.3)",
    color: "#22c55e",
  },
  seatSelected: {
    background: "rgba(245,158,11,0.15)",
    border: "1px solid rgba(245,158,11,0.6)",
    color: "#f59e0b",
    transform: "scale(1.05)",
    boxShadow: "0 0 12px rgba(245,158,11,0.2)",
  },
  seatTaken: {
    background: "rgba(239,68,68,0.06)",
    border: "1px solid rgba(239,68,68,0.15)",
    color: "#ef4444", opacity: 0.5,
    cursor: "not-allowed",
  },
  seatLabel: { fontSize: 13, fontWeight: 700, letterSpacing: "0.02em" },
  seatDot: { fontSize: 10, marginTop: 2 },
  bookArea: { display: "flex", flexDirection: "column", gap: 10, alignItems: "center", marginTop: 8 },
  selectedPreview: { fontSize: 13, color: "#94a3b8", textAlign: "center" },
  bookBtn: {
    width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700,
    background: "linear-gradient(135deg, #6366f1, #818cf8)",
    border: "none", borderRadius: 12, color: "#fff", cursor: "pointer",
    letterSpacing: "0.04em", textTransform: "uppercase",
    transition: "all 0.2s",
    boxShadow: "0 4px 20px rgba(99,102,241,0.35)",
  },
  bookBtnDisabled: { opacity: 0.4, cursor: "not-allowed", boxShadow: "none" },
  clearBtn: {
    background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, color: "#64748b", fontSize: 12, cursor: "pointer", padding: "6px 16px",
  },
  logPanel: {
    width: 300, flexShrink: 0,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16, padding: 28,
    maxHeight: 600, overflowY: "auto",
  },
  logEntry: {
    padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
    display: "flex", flexDirection: "column", gap: 4,
  },
  logTime: { fontSize: 10, color: "#475569", letterSpacing: "0.06em" },
  logMsg: { fontSize: 12, color: "#94a3b8", lineHeight: 1.6 },
  emptyMsg: { fontSize: 13, color: "#334155", textAlign: "center", padding: "24px 0" },
  toast: {
    position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
    padding: "14px 24px", borderRadius: 12,
    display: "flex", alignItems: "center", gap: 12,
    fontSize: 13, fontWeight: 500,
    zIndex: 999, maxWidth: 500,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    animation: "slideUp 0.3s ease",
  },
  toastSuccess: { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#86efac" },
  toastError: { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5" },
  toastClose: { background: "none", border: "none", color: "inherit", fontSize: 18, cursor: "pointer", lineHeight: 1 },
  footer: {
    textAlign: "center", fontSize: 11, color: "#1e293b",
    letterSpacing: "0.06em", padding: "24px 0",
    borderTop: "1px solid rgba(255,255,255,0.03)",
  },
};
