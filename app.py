import socket
import ssl
from flask import Flask, jsonify, request
from flask_cors import CORS
import time
import database
import os

app = Flask(__name__)

# Fixed: CORS for both HTTP and HTTPS React dev server
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:5173", 
            "http://127.0.0.1:5173",
            "https://localhost:5173", 
            "https://127.0.0.1:5173"
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

TCP_HOST = "localhost"
TCP_PORT = 9999

metrics = {
    "latencies": [],
    "timestamps": []
}

# Certificate files (should match server.py)
CERT_FILE = "localhost.pem"
KEY_FILE = "localhost-key.pem"

# Initialize database on startup
database.init_db()

# Create SSL connection to TCP server
def get_tcp_connection():
    raw_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    raw_socket.settimeout(10)  # 10 second timeout
    
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    
    secure_socket = context.wrap_socket(raw_socket, server_hostname="localhost")
    secure_socket.connect((TCP_HOST, TCP_PORT))
    
    return secure_socket

# Send command to TCP server
def send_command(command: str) -> tuple[str, float]:
    start = time.time()
    
    conn = get_tcp_connection()
    try:
        conn.send(command.encode())
        response = conn.recv(4096).decode()
    finally:
        conn.close()
    
    end = time.time()
    latency = end - start
    
    metrics["latencies"].append(latency)
    metrics["timestamps"].append(time.time())
    
    if len(metrics["latencies"]) > 100:
        metrics["latencies"].pop(0)
        metrics["timestamps"].pop(0)
    
    return response, latency

# Auth endpoints
@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters"}), 400
    
    user_id = database.create_user(username, password)
    if user_id:
        return jsonify({
            "message": "User created successfully",
            "username": username,
            "userId": user_id,
            "role": "user"
        }), 201
    else:
        return jsonify({"error": "Username already exists"}), 409

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = database.authenticate_user(username, password)
    if user:
        return jsonify({
            "message": "Login successful",
            "username": user['username'],
            "userId": user['id'],
            "role": user['role']
        })
    else:
        return jsonify({"error": "Invalid credentials"}), 401

@app.route("/api/users/me/bookings", methods=["GET"])
def get_my_bookings():
    user_id = request.args.get('userId')
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    try:
        bookings = database.get_user_bookings(int(user_id))
        return jsonify({"bookings": bookings})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/seats", methods=["GET"])
def view_seats():
    try:
        # Get seats from database
        db_seats = database.get_all_seats()
        
        # Get TCP server state for real-time status
        tcp_available = []
        try:
            raw, latency = send_command("VIEW")
            
            if raw.startswith("Available:"):
                tcp_available = [s.strip().upper() for s in raw.replace("Available:", "").split(",") if s.strip()]
            elif raw == "No seats available":
                tcp_available = []
        except Exception as tcp_err:
            print(f"[WARNING] TCP sync failed: {tcp_err}")
            # Fall back to database state if TCP fails
            tcp_available = None
        
        # Build seat list - trust TCP if available, else use database
        seats = []
        for seat in db_seats:
            seat_id = seat['id'].upper()
            
            if tcp_available is not None:
                # Use TCP server as source of truth for real-time updates
                available = seat_id in tcp_available
            else:
                # Fall back to database if TCP unavailable
                available = seat['booked_by'] is None
            
            seats.append({"id": seat['id'], "available": available})
        
        return jsonify({"seats": seats})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/book", methods=["POST"])
def book_seats():
    data = request.get_json()
    seats_list = data.get('seats', [])
    user_id = data.get('userId')
    
    if not seats_list:
        return jsonify({"error": "Provide seats"}), 400
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    command = "BOOK " + " ".join([s.upper() for s in seats_list])
    
    try:
        raw, latency = send_command(command)
        
        # Log metric
        database.log_metric('/api/book', latency)
        
        result = {"booked": [], "already_booked": [], "invalid": []}
        
        for part in raw.split("|"):
            part = part.strip()
            
            if part.startswith("Booked:"):
                booked_seats = [s.strip() for s in part.replace("Booked:", "").split(",") if s.strip()]
                result["booked"] = booked_seats
                # Update database for booked seats
                for seat in booked_seats:
                    database.book_seat(seat, int(user_id))
            
            elif part.startswith("Already booked:"):
                result["already_booked"] = [s.strip() for s in part.replace("Already booked:", "").split(",") if s.strip()]
            
            elif part.startswith("Invalid:"):
                result["invalid"] = [s.strip() for s in part.replace("Invalid:", "").split(",") if s.strip()]
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cancel", methods=["POST"])
def cancel_seats():
    data = request.get_json()
    seats_list = data.get('seats', [])
    user_id = data.get('userId')
    
    if not seats_list:
        return jsonify({"error": "Provide seats"}), 400
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    command = "CANCEL " + " ".join([s.upper() for s in seats_list])
    
    try:
        raw, latency = send_command(command)
        
        # Log metric
        database.log_metric('/api/cancel', latency)
        
        result = {
            "cancelled": [],
            "not_booked": [],
            "not_owner": [],
            "invalid": []
        }
        
        for part in raw.split("|"):
            part = part.strip()
            
            if part.startswith("Cancelled:"):
                cancelled_seats = [s.strip() for s in part.replace("Cancelled:", "").split(",") if s.strip()]
                result["cancelled"] = cancelled_seats
                # Sync database for cancelled seats - ensure they're marked available
                for seat in cancelled_seats:
                    database.cancel_seat(seat, int(user_id))
                    database.sync_seat_available(seat)  # Force sync to ensure availability
            
            elif part.startswith("Not booked:"):
                result["not_booked"] = [s.strip() for s in part.replace("Not booked:", "").split(",") if s.strip()]
            
            elif part.startswith("Not your booking:"):
                result["not_owner"] = [s.strip() for s in part.replace("Not your booking:", "").split(",") if s.strip()]
            
            elif part.startswith("Invalid:"):
                result["invalid"] = [s.strip() for s in part.replace("Invalid:", "").split(",") if s.strip()]
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/users", methods=["GET"])
def admin_get_users():
    try:
        users = database.get_all_users()
        return jsonify(users)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
def admin_delete_user(user_id):
    try:
        if database.delete_user(user_id):
            return jsonify({"message": "User deleted successfully"})
        return jsonify({"error": "Cannot delete admin user"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/users/<int:user_id>/role", methods=["PUT"])
def admin_update_role(user_id):
    data = request.get_json()
    role = data.get('role')
    try:
        if database.update_user_role(user_id, role):
            return jsonify({"message": "Role updated successfully"})
        return jsonify({"error": "Invalid role"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/admin/history", methods=["GET"])
def admin_get_history():
    user_id = request.args.get('userId')
    try:
        if user_id:
            history = database.get_booking_history(int(user_id))
        else:
            history = database.get_booking_history()
        return jsonify(history)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/health", methods=["GET"])
def health():
    try:
        conn = get_tcp_connection()
        conn.send("VIEW".encode())
        conn.recv(1024)
        conn.close()
        
        # Check database
        database.get_all_seats()
        
        return jsonify({"status": "ok", "tcp_server": "reachable", "database": "connected"})
        
    except Exception as e:
        return jsonify({"status": "error", "detail": str(e)}), 503

@app.route("/api/metrics", methods=["GET"])
def get_metrics():
    now = time.time()
    
    recent_requests = [t for t in metrics["timestamps"] if now - t <= 5]
    throughput = len(recent_requests) / 5 if recent_requests else 0
    recent_latencies = metrics["latencies"][-10:]
    
    if recent_latencies:
        avg_latency = sum(recent_latencies) / len(recent_latencies)
    else:
        avg_latency = 0
    
    # Get database metrics
    try:
        db_metrics = database.get_metrics_stats()
    except:
        db_metrics = {'avg_latency': 0, 'total_requests': 0}
    
    return jsonify({
        "throughput": round(throughput, 2),
        "avg_latency": round(avg_latency, 5),
        "db_avg_latency": round(db_metrics.get('avg_latency', 0), 5),
        "total_requests": db_metrics.get('total_requests', 0),
        "latencies": [round(l, 5) for l in recent_latencies]  # For graphing
    })

@app.route("/api/admin/dashboard", methods=["GET"])
def admin_dashboard():
    """Comprehensive admin dashboard with system info, SSL cert, and metrics"""
    try:
        import ssl
        import subprocess
        from datetime import datetime
        
        # SSL Certificate Information
        cert_info = {}
        try:
            # Read certificate
            with open(CERT_FILE, 'r') as f:
                cert_data = f.read()
            
            # Get cert details using openssl
            result = subprocess.run(
                ['openssl', 'x509', '-in', CERT_FILE, '-text', '-noout'],
                capture_output=True, text=True, timeout=5
            )
            cert_output = result.stdout
            
            # Parse certificate info
            cert_info = {
                "file": CERT_FILE,
                "key_file": KEY_FILE,
                "valid": True,
                "common_name": "CN=localhost",
                "issuer": "",
                "subject": "",
                "valid_from": "",
                "valid_until": "",
                "algorithm": "",
            }
            
            # Extract details from openssl output
            for line in cert_output.split('\n'):
                if 'Subject:' in line:
                    cert_info["subject"] = line.split('Subject:')[1].strip()
                elif 'Issuer:' in line:
                    cert_info["issuer"] = line.split('Issuer:')[1].strip()
                elif 'Not Before:' in line:
                    cert_info["valid_from"] = line.split('Not Before:')[1].strip()
                elif 'Not After:' in line:
                    cert_info["valid_until"] = line.split('Not After:')[1].strip()
                elif 'Public-Key:' in line or 'RSA Public-Key:' in line:
                    cert_info["algorithm"] = line.strip()
                elif 'DNS:localhost' in line:
                    cert_info["san"] = "DNS:localhost"
        except Exception as e:
            cert_info = {"error": str(e), "file": CERT_FILE}
        
        # System Health
        health = {
            "database": "connected",
            "tcp_server": "unknown",
            "api_status": "online",
            "timestamp": datetime.now().isoformat()
        }
        
        # Try to ping TCP server
        try:
            conn = get_tcp_connection()
            conn.send(b"VIEW")
            conn.recv(1024)
            conn.close()
            health["tcp_server"] = "connected"
        except:
            health["tcp_server"] = "disconnected"
        
        # Metrics
        now = time.time()
        recent_requests = [t for t in metrics["timestamps"] if now - t <= 60]  # Last minute
        throughput = round(len(recent_requests) / 60 if recent_requests else 0, 2)
        
        all_latencies = metrics["latencies"][-100:]  # Last 100 requests
        if all_latencies:
            avg_latency = sum(all_latencies) / len(all_latencies)
            max_latency = max(all_latencies)
            min_latency = min(all_latencies)
        else:
            avg_latency = max_latency = min_latency = 0
        
        try:
            db_metrics = database.get_metrics_stats()
        except:
            db_metrics = {'avg_latency': 0, 'total_requests': 0}
        
        # Get seat statistics
        try:
            all_seats = database.get_all_seats()
            booked_seats = [s for s in all_seats if s['booked_by'] is not None]
            seat_stats = {
                "total": len(all_seats),
                "available": len(all_seats) - len(booked_seats),
                "booked": len(booked_seats),
                "occupancy_percent": round((len(booked_seats) / len(all_seats) * 100) if all_seats else 0, 1)
            }
        except:
            seat_stats = {"total": 20, "available": 0, "booked": 0, "occupancy_percent": 0}
        
        # User statistics
        try:
            all_users = database.get_all_users()
            user_stats = {
                "total_users": len(all_users),
                "admin_count": len([u for u in all_users if u.get('role') == 'admin']),
                "regular_users": len([u for u in all_users if u.get('role') == 'user'])
            }
        except:
            user_stats = {"total_users": 0, "admin_count": 0, "regular_users": 0}
        
        return jsonify({
            "certificate": cert_info,
            "health": health,
            "metrics": {
                "throughput_rps": throughput,
                "avg_latency_ms": round(avg_latency * 1000, 2),
                "max_latency_ms": round(max_latency * 1000, 2),
                "min_latency_ms": round(min_latency * 1000, 2),
                "total_api_calls": db_metrics.get('total_requests', 0),
                "recent_latencies": [round(l * 1000, 2) for l in all_latencies]
            },
            "seats": seat_stats,
            "users": user_stats,
            "system": {
                "certificate_file": CERT_FILE,
                "key_file": KEY_FILE,
                "tcp_host": TCP_HOST,
                "tcp_port": TCP_PORT,
                "database": "reservation.db"
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/")
def home():
    return "Flask API running with Database 🚀"

def check_certificates():
    """Check if certificates exist, generate if not"""
    if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
        print("[INFO] Generating SSL certificates for Flask...")
        try:
            import subprocess
            subprocess.run([
                "openssl", "req", "-x509", "-newkey", "rsa:4096",
                "-keyout", KEY_FILE, "-out", CERT_FILE,
                "-days", "365", "-nodes",
                "-subj", "/CN=localhost",
                "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"
            ], check=True, capture_output=True)
            print("[INFO] Certificates generated successfully")
        except Exception as e:
            print(f"[ERROR] Failed to generate certificates: {e}")
            return False
    return True

if __name__ == "__main__":
    if check_certificates():
        print("Flask running at https://localhost:5000 with SQLite database")
        print("CORS enabled for: http://localhost:5173, http://127.0.0.1:5173")
        app.run(
            debug=True,
            port=5000,
            ssl_context=(CERT_FILE, KEY_FILE)
        )
    else:
        print("[ERROR] Cannot start without SSL certificates")
