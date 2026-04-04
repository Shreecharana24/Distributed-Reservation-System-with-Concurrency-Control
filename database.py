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
    """Cancel a seat booking (only if booked by this user)"""
    with db_connection() as conn:
        # Check if seat is booked by this user
        cursor = conn.execute(
            "SELECT booked_by FROM seats WHERE id = ? AND booked_by = ?",
            (seat_id, user_id)
        )
        if not cursor.fetchone():
            return False
        
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
    """Force sync seat as available (used after TCP server confirms cancellation)"""
    with db_connection() as conn:
        # Unconditionally mark seat as available
        conn.execute(
            "UPDATE seats SET booked_by = NULL, booked_at = NULL WHERE id = ?",
            (seat_id,)
        )
        return True

def admin_force_cancel(seat_id):
    """Force cancel a seat (admin only)"""
    with db_connection() as conn:
        # Get current booking info
        cursor = conn.execute(
            "SELECT booked_by FROM seats WHERE id = ?",
            (seat_id,)
        )
        row = cursor.fetchone()
        if row and row['booked_by']:
            # Log force cancel
            conn.execute(
                "INSERT INTO booking_history (seat_id, user_id, action) VALUES (?, ?, ?)",
                (seat_id, row['booked_by'], 'FORCE_CANCEL')
            )
        
        # Cancel the booking
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

# Metrics operations
def log_metric(endpoint, latency):
    """Log API metrics"""
    with db_connection() as conn:
        conn.execute(
            "INSERT INTO metrics (endpoint, latency) VALUES (?, ?)",
            (endpoint, latency)
        )
        
        # Keep only last 1000 records
        conn.execute("""
            DELETE FROM metrics 
            WHERE id NOT IN (
                SELECT id FROM metrics 
                ORDER BY timestamp DESC 
                LIMIT 1000
            )
        """)

def get_metrics_stats():
    """Get aggregated metrics"""
    with db_connection() as conn:
        # Average latency for last 100 requests
        cursor = conn.execute("""
            SELECT AVG(latency) as avg_latency, COUNT(*) as total_requests
            FROM metrics 
            WHERE timestamp > datetime('now', '-5 minutes')
        """)
        recent = cursor.fetchone()
        
        # Throughput (requests per second) for last minute
        cursor = conn.execute("""
            SELECT COUNT(*) as count 
            FROM metrics 
            WHERE timestamp > datetime('now', '-1 minute')
        """)
        minute_count = cursor.fetchone()
        
        return {
            'avg_latency': recent['avg_latency'] or 0,
            'throughput': minute_count['count'] / 60 if minute_count['count'] else 0,
            'total_requests': recent['total_requests'] or 0
        }

def get_booking_history(user_id=None, limit=100):
    """Get booking history for audit"""
    with db_connection() as conn:
        if user_id:
            cursor = conn.execute("""
                SELECT bh.*, u.username, s.id as seat_id
                FROM booking_history bh
                JOIN users u ON bh.user_id = u.id
                JOIN seats s ON bh.seat_id = s.id
                WHERE bh.user_id = ?
                ORDER BY bh.timestamp DESC
                LIMIT ?
            """, (user_id, limit))
        else:
            cursor = conn.execute("""
                SELECT bh.*, u.username, s.id as seat_id
                FROM booking_history bh
                JOIN users u ON bh.user_id = u.id
                JOIN seats s ON bh.seat_id = s.id
                ORDER BY bh.timestamp DESC
                LIMIT ?
            """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

# Admin operations
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
