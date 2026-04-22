import socket
import ssl
import time
import threading
from flask import Flask, jsonify, request, g
from flask_cors import CORS
import subprocess
import os
from functools import wraps
import database

class TCPConnectionPool:
    """Connection pool for persistent TCP connections to server"""
    def __init__(self, host, port, pool_size=5):
        self.host = host
        self.port = port
        self.pool_size = pool_size
        self.connections = []
        self.lock = threading.Lock()
        self._initialize_pool()
    
    def _create_connection(self):
        """Create a new SSL connection to TCP server"""
        try:
            # Create socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            sock.connect((self.host, self.port))
            
            # SSL context
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            # FIXED: Add compatible cipher settings
            context.set_ciphers('ALL:@SECLEVEL=0')
            
            # Wrap socket with SSL
            ssl_sock = context.wrap_socket(sock, server_hostname=None)
            return ssl_sock
        except Exception as e:
            print(f"[TCP Pool] Failed to create connection: {e}")
            return None
    
    def _initialize_pool(self):
        """Initialize the connection pool"""
        for _ in range(self.pool_size):
            conn = self._create_connection()
            if conn:
                self.connections.append(conn)
        print(f"[TCP Pool] Initialized with {len(self.connections)} connections")
    
    def get_connection(self):
        """Get a connection from the pool"""
        with self.lock:
            if self.connections:
                conn = self.connections.pop()
                # Test if connection is still alive
                try:
                    conn.send(b"VIEW")
                    response = conn.recv(1024)
                    if response.startswith(b"AVAILABLE:"):
                        return conn
                except:
                    pass
                # Connection is dead, create new one
                new_conn = self._create_connection()
                if new_conn:
                    return new_conn
            # No connections available, create new one
            return self._create_connection()
    
    def return_connection(self, conn):
        """Return a connection to the pool"""
        if conn:
            with self.lock:
                if len(self.connections) < self.pool_size:
                    try:
                        # Test connection before returning
                        conn.settimeout(1)
                        conn.send(b"VIEW")
                        response = conn.recv(1024)
                        if response.startswith(b"AVAILABLE:"):
                            self.connections.append(conn)
                            return
                    except:
                        pass
                    # Connection is bad, close it
                    try:
                        conn.close()
                    except:
                        pass
                else:
                    # Pool is full, close connection
                    try:
                        conn.close()
                    except:
                        pass
    
    def send_command(self, command, username=None):
        """Send command using pooled connection"""
        conn = None
        try:
            conn = self.get_connection()
            if not conn:
                return f"ERROR:No connection available"
            
            # Add username to command if provided
            if username and command.startswith(("BOOK", "CANCEL")):
                full_command = f"{command} {username}"
            else:
                full_command = command
            
            conn.settimeout(5)
            conn.send(full_command.encode())
            response = conn.recv(4096).decode()
            
            # Return connection to pool
            self.return_connection(conn)
            return response
            
        except Exception as e:
            print(f"[TCP Pool] Command failed: {e}")
            if conn:
                try:
                    conn.close()
                except:
                    pass
            # Remove failed connection from pool and try to create a new one
            with self.lock:
                if conn in self.connections:
                    self.connections.remove(conn)
            # Try to create a replacement connection
            new_conn = self._create_connection()
            if new_conn:
                self.connections.append(new_conn)
            return f"ERROR:{str(e)}"

app = Flask(__name__)

@app.before_request
def start_timer():
    if request.path.startswith('/api/'):
        g.start = time.time()

@app.after_request
def log_request(response):
    if request.path.startswith('/api/') and hasattr(g, 'start'):
        latency_ms = (time.time() - g.start) * 1000
        try:
            database.log_api_metric(request.path, latency_ms)
        except:
            pass
    return response

# Authentication decorator
def auth_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # For now, skip authentication - can be added later
        # In production, implement proper JWT/session validation
        return f({"username": "admin", "role": "admin", "user_id": 1}, *args, **kwargs)
    return decorated_function

CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5173", "http://127.0.0.1:5173", "http://10.20.204.87:5173",
                   "https://localhost:5173", "https://10.20.204.87:5173", "https://10.20.204.87:5174"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

# Read server IP from file
with open('server_ip.txt', 'r') as f:
    TCP_HOST = f.read().strip()
TCP_PORT = 9999

database.init_db()
print(f"[DATABASE] Initialized")

# Initialize connection pool
tcp_pool = TCPConnectionPool(TCP_HOST, TCP_PORT, pool_size=10)
print(f"[TCP POOL] Connected to {TCP_HOST}:{TCP_PORT}")

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    try:
        response = tcp_pool.send_command("VIEW")
        tcp_ok = not response.startswith("ERROR")
        return jsonify({
            "status": "ok",
            "api": "online",
            "tcp_server": "connected" if tcp_ok else "disconnected",
            "database": "connected"
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 503

@app.route('/api/seats', methods=['GET'])
def get_seats():
    try:
        # Get seats directly from database for consistency and performance
        with database.db_connection() as conn:
            seats_data = conn.execute("""
                SELECT s.id, s.booked_by, u.username 
                FROM seats s 
                LEFT JOIN users u ON s.booked_by = u.id 
                ORDER BY s.id
            """).fetchall()
            
            seats_list = []
            for seat in seats_data:
                seats_list.append({
                    "id": seat['id'],
                    "available": seat['booked_by'] is None,
                    "booked_by": seat['username'] if seat['username'] else None
                })
            
            return jsonify({"seats": seats_list})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/book', methods=['POST'])
def book_seats():
    """Book seats"""
    data = request.json
    seats_list = data.get('seats', [])
    user_id = data.get('userId')
    username = data.get('username')  # Get username from request
    
    if not seats_list:
        return jsonify({"error": "No seats"}), 400
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    if not username:
        return jsonify({"error": "Username required"}), 400
    
    # Send BOOK command with username
    command = f"BOOK {' '.join(seats_list)}"
    response = tcp_pool.send_command(command, username)
    
    result = {"booked": [], "already_booked": [], "invalid": []}
    
    for part in response.split('|'):
        if part.startswith("BOOKED:"):
            booked = [s for s in part.replace("BOOKED:", "").split(',') if s]
            result["booked"] = booked
            for seat in booked:
                database.book_seat(seat, int(user_id))
        elif part.startswith("ALREADY:"):
            already = [s for s in part.replace("ALREADY:", "").split(',') if s]
            result["already_booked"] = already
        elif part.startswith("INVALID:"):
            invalid = [s for s in part.replace("INVALID:", "").split(',') if s]
            result["invalid"] = invalid
    
    return jsonify(result)

@app.route('/api/cancel', methods=['POST'])
def cancel_seats():
    """Cancel seats"""
    data = request.json
    seats_list = data.get('seats', [])
    user_id = data.get('userId')
    username = data.get('username')  # Get username from request
    
    if not seats_list:
        return jsonify({"error": "No seats"}), 400
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    if not username:
        return jsonify({"error": "Username required"}), 400
    
    # Send CANCEL command with username
    command = f"CANCEL {' '.join(seats_list)}"
    response = tcp_pool.send_command(command, username)
    
    result = {"cancelled": [], "not_booked": [], "not_owner": [], "invalid": []}
    
    for part in response.split('|'):
        if part.startswith("CANCELLED:"):
            cancelled = [s for s in part.replace("CANCELLED:", "").split(',') if s]
            result["cancelled"] = cancelled
            for seat in cancelled:
                database.cancel_seat(seat, int(user_id))
        elif part.startswith("NOT_BOOKED:"):
            not_booked = [s for s in part.replace("NOT_BOOKED:", "").split(',') if s]
            result["not_booked"] = not_booked
        elif part.startswith("NOT_OWNER:"):
            not_owner = [s for s in part.replace("NOT_OWNER:", "").split(',') if s]
            result["not_owner"] = not_owner
        elif part.startswith("INVALID:"):
            invalid = [s for s in part.replace("INVALID:", "").split(',') if s]
            result["invalid"] = invalid
    
    return jsonify(result)

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    
    user_id = database.create_user(username, password)
    if user_id:
        return jsonify({
            "userId": user_id,
            "username": username,
            "role": "user"
        }), 201
    return jsonify({"error": "Username exists"}), 409

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    user = database.authenticate_user(data.get('username'), data.get('password'))
    if user:
        return jsonify({
            "userId": user['id'],
            "username": user['username'],
            "role": user['role']
        })
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/api/users/me/bookings', methods=['GET'])
def get_my_bookings():
    user_id = request.args.get('userId')
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    bookings = database.get_user_bookings(int(user_id))
    return jsonify({"bookings": bookings})

@app.route('/')
def home():
    return "Seat Reservation API Running"

# Admin endpoints
@app.route('/api/admin/dashboard', methods=['GET'])
@auth_required
def admin_dashboard(user):
    if user['role'] != 'admin':
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        # Get dashboard statistics
        stats = database.get_dashboard_stats()
        
        # Add system config
        stats['system'] = {
            'tcp_host': TCP_HOST,
            'tcp_port': TCP_PORT,
            'database': database.DATABASE
        }
        
        # Add health
        response = tcp_pool.send_command("VIEW")
        tcp_ok = not response.startswith("ERROR")
        stats['health'] = {
            'api_status': 'online',
            'tcp_server': 'connected' if tcp_ok else 'disconnected',
            'database': 'connected'
        }
        
        # Add certificate info
        cert_info = {
            'file': 'cert.pem',
            'key_file': 'key.pem',
            'subject': 'N/A',
            'issuer': 'N/A',
            'valid_from': 'N/A',
            'valid_until': 'N/A',
            'san': ''
        }
        try:
            if os.path.exists('cert.pem'):
                out = subprocess.check_output(['openssl', 'x509', '-in', 'cert.pem', '-noout', '-subject', '-issuer', '-dates', '-ext', 'subjectAltName'], text=True, stderr=subprocess.DEVNULL)
                for line in out.splitlines():
                    if line.startswith('subject='):
                        cert_info['subject'] = line.replace('subject=', '').strip()
                    elif line.startswith('issuer='):
                        cert_info['issuer'] = line.replace('issuer=', '').strip()
                    elif line.startswith('notBefore='):
                        cert_info['valid_from'] = line.replace('notBefore=', '').strip()
                    elif line.startswith('notAfter='):
                        cert_info['valid_until'] = line.replace('notAfter=', '').strip()
                    elif 'IP Address:' in line or 'DNS:' in line:
                        cert_info['san'] = line.strip()
        except:
            pass
            
        stats['certificate'] = cert_info
        
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/users', methods=['GET'])
@auth_required
def admin_users(user):
    if user['role'] != 'admin':
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        users = database.get_all_users()
        return jsonify(users)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/bookings', methods=['GET'])
@auth_required
def admin_bookings(user):
    if user['role'] != 'admin':
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        bookings = database.get_all_bookings()
        return jsonify(bookings)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("=" * 60)
    print("FLASK API SERVER")
    print(f"TCP Server: {TCP_HOST}:{TCP_PORT}")
    print(f"API URL: http://0.0.0.0:5000")
    print("=" * 60)
    # Use HTTP for development to avoid certificate issues
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
