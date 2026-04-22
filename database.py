import sqlite3
import bcrypt
from contextlib import contextmanager
from datetime import datetime
import threading

DATABASE = "reservation.db"

# Thread-local storage for database connections
thread_local = threading.local()

def get_db():
    """Get database connection for current thread"""
    if not hasattr(thread_local, "db"):
        thread_local.db = sqlite3.connect(DATABASE, check_same_thread=False)
        thread_local.db.row_factory = sqlite3.Row
    return thread_local.db

def close_db():
    """Close database connection for current thread"""
    if hasattr(thread_local, "db"):
        thread_local.db.close()
        del thread_local.db

@contextmanager
def db_connection():
    """Context manager for database operations"""
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise

def init_db():
    """Initialize database with tables and default data"""
    with db_connection() as conn:
        # Create users table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        """)
        
        # Create seats table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS seats (
                id TEXT PRIMARY KEY,
                booked_by INTEGER,
                booked_at TIMESTAMP,
                FOREIGN KEY (booked_by) REFERENCES users(id)
            )
        """)
        
        # Create booking_history table for audit trail
        conn.execute("""
            CREATE TABLE IF NOT EXISTS booking_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seat_id TEXT NOT NULL,
                user_id INTEGER,
                action TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # Create metrics table for performance tracking
        conn.execute("""
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint TEXT,
                latency REAL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Initialize seats A1-A20 if not exists
        for i in range(1, 21):
            seat_id = f"A{i}"
            conn.execute("INSERT OR IGNORE INTO seats (id) VALUES (?)", (seat_id,))
        
        # Create default admin user if not exists
        admin_password = bcrypt.hashpw("admin123".encode('utf-8'), bcrypt.gensalt())
        conn.execute("""
            INSERT OR IGNORE INTO users (username, password_hash, role)
            VALUES (?, ?, ?)
        """, ("admin", admin_password, "admin"))
        
        print("[DATABASE] Initialized successfully")

# User operations
def create_user(username, password, role='user'):
    """Create a new user"""
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    with db_connection() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                (username.lower(), password_hash, role)
            )
            return cursor.lastrowid
        except sqlite3.IntegrityError:
            return None

def authenticate_user(username, password):
    """Authenticate user and return user data if valid"""
    with db_connection() as conn:
        cursor = conn.execute(
            "SELECT id, username, password_hash, role FROM users WHERE username = ?",
            (username.lower(),)
        )
        user = cursor.fetchone()
        
        if user and bcrypt.checkpw(password.encode('utf-8'), user['password_hash']):
            # Update last login
            conn.execute(
                "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
                (user['id'],)
            )
            return dict(user)
    return None

def get_user_by_id(user_id):
    """Get user by ID"""
    with db_connection() as conn:
        cursor = conn.execute(
            "SELECT id, username, role FROM users WHERE id = ?",
            (user_id,)
        )
        user = cursor.fetchone()
        return dict(user) if user else None

def get_all_users():
    """Get all users for admin panel"""
    with db_connection() as conn:
        cursor = conn.execute(
            "SELECT id, username, role, created_at, last_login FROM users ORDER BY id"
        )
        return [dict(row) for row in cursor.fetchall()]

# Seat operations
def get_all_seats():
    """Get all seats with booking status"""
    with db_connection() as conn:
        cursor = conn.execute("""
            SELECT s.id, s.booked_by, u.username as booked_by_username
            FROM seats s
            LEFT JOIN users u ON s.booked_by = u.id
            ORDER BY s.id
        """)
        return [dict(row) for row in cursor.fetchall()]

def book_seat(seat_id, user_id):
    """Book a seat for a user"""
    with db_connection() as conn:
        # Check if seat is available
        cursor = conn.execute(
            "SELECT booked_by FROM seats WHERE id = ? AND booked_by IS NULL",
            (seat_id,)
        )
        if not cursor.fetchone():
            return False
        
        # Book the seat
        conn.execute(
            "UPDATE seats SET booked_by = ?, booked_at = CURRENT_TIMESTAMP WHERE id = ?",
            (user_id, seat_id)
        )
        
        # Log to history
        conn.execute(
            "INSERT INTO booking_history (seat_id, user_id, action) VALUES (?, ?, ?)",
            (seat_id, user_id, 'BOOK')
        )
        return True

def cancel_seat(seat_id, user_id):
    """Cancel a seat booking"""
    with db_connection() as conn:
        # Cancel the booking
        conn.execute(
            "UPDATE seats SET booked_by = NULL, booked_at = NULL WHERE id = ?",
            (seat_id,)
        )
        
        # Log to history
        conn.execute(
            "INSERT INTO booking_history (seat_id, user_id, action) VALUES (?, ?, ?)",
            (seat_id, user_id, 'CANCEL')
        )
        return True

def sync_seat_available(seat_id):
    """Force sync seat as available"""
    with db_connection() as conn:
        conn.execute(
            "UPDATE seats SET booked_by = NULL, booked_at = NULL WHERE id = ?",
            (seat_id,)
        )
        return True

def get_user_bookings(user_id):
    """Get all seats booked by a user"""
    with db_connection() as conn:
        cursor = conn.execute(
            "SELECT id FROM seats WHERE booked_by = ?",
            (user_id,)
        )
        return [row['id'] for row in cursor.fetchall()]

def delete_user(user_id):
    """Delete a user (admin only)"""
    with db_connection() as conn:
        # First, free any seats booked by this user
        conn.execute(
            "UPDATE seats SET booked_by = NULL, booked_at = NULL WHERE booked_by = ?",
            (user_id,)
        )
        # Then delete the user
        conn.execute("DELETE FROM users WHERE id = ? AND role != 'admin'", (user_id,))
        return True

def update_user_role(user_id, role):
    """Update user role (admin only)"""
    if role not in ['user', 'admin']:
        return False
    with db_connection() as conn:
        conn.execute(
            "UPDATE users SET role = ? WHERE id = ?",
            (role, user_id)
        )
        return True

def get_dashboard_stats():
    """Get dashboard statistics for admin"""
    with db_connection() as conn:
        # User statistics
        users = conn.execute("SELECT COUNT(*) as total, SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins FROM users").fetchone()
        
        # Booking statistics (using seats table)
        bookings = conn.execute("SELECT COUNT(*) as total_bookings, COUNT(DISTINCT booked_by) as unique_users FROM seats WHERE booked_by IS NOT NULL").fetchone()
        
        # Seat statistics
        total_seats = 20
        available_seats = conn.execute("SELECT COUNT(*) FROM seats WHERE booked_by IS NULL").fetchone()[0]
        booked_seats = total_seats - available_seats
        
        # Recent activity (last 10 bookings from booking_history)
        recent = conn.execute("""
            SELECT b.seat_id, b.user_id, b.timestamp, u.username 
            FROM booking_history b 
            JOIN users u ON b.user_id = u.id 
            WHERE b.action = 'BOOK'
            ORDER BY b.timestamp DESC 
            LIMIT 10
        """).fetchall()
        
        # Metrics
        total_calls = conn.execute("SELECT COUNT(*) FROM metrics").fetchone()[0] or 0
        
        # Performance over last 60 seconds
        perf = conn.execute("""
            SELECT AVG(latency) as avg_lat, MAX(latency) as max_lat, MIN(latency) as min_lat 
            FROM metrics WHERE timestamp >= datetime('now', '-60 seconds')
        """).fetchone()
        
        # Throughput RPS over last 10 seconds
        recent_count = conn.execute("SELECT COUNT(*) FROM metrics WHERE timestamp >= datetime('now', '-10 seconds')").fetchone()[0] or 0
        throughput_rps = recent_count / 10.0
        
        # Timeseries raw (last 50 requests)
        ts_raw = conn.execute("SELECT latency, strftime('%H:%M:%S', timestamp) as time FROM metrics ORDER BY id DESC LIMIT 50").fetchall()
        timeseries = [{"time": r['time'], "latency": r['latency']} for r in reversed(ts_raw)]
        
        return {
            "users": {
                "total_users": users['total'] or 0,
                "admin_count": users['admins'] or 0,
                "regular_count": (users['total'] or 0) - (users['admins'] or 0)
            },
            "bookings": {
                "total_bookings": bookings['total_bookings'] or 0,
                "unique_users": bookings['unique_users'] or 0
            },
            "seats": {
                "total_seats": total_seats,
                "available_seats": available_seats,
                "booked_seats": booked_seats,
                "occupancy_rate": round((booked_seats / total_seats) * 100, 1)
            },
            "recent_activity": [
                {
                    "seat_id": r['seat_id'],
                    "username": r['username'],
                    "booked_at": r['timestamp']
                } for r in recent
            ],
            "metrics": {
                "total_api_calls": total_calls,
                "throughput_rps": throughput_rps,
                "avg_latency_ms": perf['avg_lat'] or 0,
                "max_latency_ms": perf['max_lat'] or 0,
                "min_latency_ms": perf['min_lat'] or 0
            },
            "metrics_timeseries": timeseries
        }

def log_api_metric(endpoint, latency_ms):
    """Log API request latency to metrics table"""
    with db_connection() as conn:
        conn.execute(
            "INSERT INTO metrics (endpoint, latency) VALUES (?, ?)",
            (endpoint, latency_ms)
        )

def get_all_users():
    """Get all users for admin"""
    with db_connection() as conn:
        users = conn.execute("""
            SELECT id, username, role, created_at 
            FROM users 
            ORDER BY created_at DESC
        """).fetchall()
        
        return [
            {
                "id": u['id'],
                "username": u['username'],
                "role": u['role'],
                "created_at": u['created_at']
            }
            for u in users
        ]

def get_all_bookings():
    """Get all bookings for admin"""
    with db_connection() as conn:
        bookings = conn.execute("""
            SELECT s.id as seat_id, s.booked_by as user_id, s.booked_at, u.username 
            FROM seats s 
            JOIN users u ON s.booked_by = u.id 
            WHERE s.booked_by IS NOT NULL
            ORDER BY s.booked_at DESC
        """).fetchall()
        
        return [
            {
                "seat_id": b['seat_id'],
                "username": b['username'],
                "user_id": b['user_id'],
                "booked_at": b['booked_at']
            }
            for b in bookings
        ]