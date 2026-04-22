import socket
import threading
import ssl
import os
import time
import sys
sys.path.append('/home/hemant/Desktop/project')
import database

HOST = '0.0.0.0'
PORT = 9999
CERT_FILE = "cert.pem"
KEY_FILE = "key.pem"

# Store seats with username instead of socket address
seats = {f"A{i}": {"booked_by": None, "username": None} for i in range(1, 21)}
lock = threading.Lock()

def load_seats_from_database():
    """Load seat data from database on server startup"""
    global seats
    try:
        with database.db_connection() as conn:
            # Load all seat data
            seat_data = conn.execute("SELECT id, booked_by FROM seats").fetchall()
            for seat in seat_data:
                seat_id = seat['id']
                booked_by = seat['booked_by']
                username = None
                
                if booked_by:
                    # Get username for this booking
                    user_data = conn.execute("SELECT username FROM users WHERE id = ?", (booked_by,)).fetchone()
                    if user_data:
                        username = user_data['username']
                
                seats[seat_id] = {"booked_by": booked_by, "username": username}
        
        print(f"[DATABASE] Loaded {sum(1 for s in seats.values() if s['booked_by'])} booked seats from database")
    except Exception as e:
        print(f"[DATABASE] Error loading seats: {e}")
        # Initialize empty seats if database is empty
        initialize_seats_in_database()

def initialize_seats_in_database():
    """Initialize seats in database if they don't exist"""
    try:
        with database.db_connection() as conn:
            # Create all seats if they don't exist
            for i in range(1, 21):
                seat_id = f"A{i}"
                conn.execute("INSERT OR IGNORE INTO seats (id) VALUES (?)", (seat_id,))
        print(f"[DATABASE] Initialized {20} seats in database")
    except Exception as e:
        print(f"[DATABASE] Error initializing seats: {e}")

def save_seat_to_database(seat_id, booked_by, username):
    """Save seat booking to database"""
    try:
        with database.db_connection() as conn:
            if booked_by:
                # Get user_id from username
                user_data = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
                if user_data:
                    user_id = user_data['id']
                    # Update seat with booking
                    conn.execute("UPDATE seats SET booked_by = ?, booked_at = CURRENT_TIMESTAMP WHERE id = ?", 
                               (user_id, seat_id))
                    # Add to booking history
                    conn.execute("INSERT INTO booking_history (seat_id, user_id, action) VALUES (?, ?, 'BOOK')", 
                               (seat_id, user_id))
                    print(f"[DATABASE] Saved booking: {seat_id} -> {username}")
            else:
                # Cancel booking
                conn.execute("UPDATE seats SET booked_by = NULL, booked_at = NULL WHERE id = ?", (seat_id,))
                print(f"[DATABASE] Cancelled booking: {seat_id}")
    except Exception as e:
        print(f"[DATABASE] Error saving seat {seat_id}: {e}")

def generate_cert():
    """Generate self-signed certificate"""
    server_ip = "10.20.204.87"
    os.system(f'openssl req -x509 -newkey rsa:2048 -nodes -keyout {KEY_FILE} -out {CERT_FILE} -days 365 -subj "/CN={server_ip}" -addext "subjectAltName=IP:{server_ip},IP:127.0.0.1" 2>/dev/null')
    print(f"[SSL] Certificate generated for {server_ip}")

def handle_client(ssl_socket, address):
    """Handle client with persistent connection support"""
    print(f"[+] Connected: {address}")
    
    try:
        ssl_socket.settimeout(30)  # Longer timeout for persistent connections
        
        while True:
            try:
                data = ssl_socket.recv(1024).decode().strip()
                
                if not data:
                    break  # Client disconnected
                
                print(f"[->] {address}: {data}")
                parts = data.split()
                cmd = parts[0].upper()
                
                # Extract username if provided (for BOOK/CANCEL commands)
                username = None
                if cmd in ["BOOK", "CANCEL"] and len(parts) >= 3:
                    # Format: "BOOK A1 A2 username" or "CANCEL A1 username"
                    # Last parameter is username
                    username = parts[-1]
                    seats_list = parts[1:-1]  # Seats are between command and username
                elif cmd == "VIEW":
                    seats_list = []
                else:
                    # Old format for backward compatibility
                    seats_list = parts[1:] if len(parts) > 1 else []
                
                if cmd == "VIEW":
                    with lock:
                        available = [s for s, info in seats.items() if info["booked_by"] is None]
                    response = f"AVAILABLE:{','.join(available)}"
                    
                elif cmd == "BOOK" and seats_list:
                    booked, already, invalid = [], [], []
                    with lock:
                        for seat in seats_list:
                            seat = seat.upper()
                            if seat not in seats:
                                invalid.append(seat)
                            elif seats[seat]["booked_by"] is not None:
                                already.append(seat)
                            else:
                                seats[seat]["booked_by"] = address[0]  # Temporarily store client address
                                seats[seat]["username"] = username
                                booked.append(seat)
                                # Save to database
                                save_seat_to_database(seat, address[0], username)
                    response = f"BOOKED:{','.join(booked)}|ALREADY:{','.join(already)}|INVALID:{','.join(invalid)}"
                    
                elif cmd == "CANCEL" and seats_list:
                    cancelled, not_booked, not_owner, invalid = [], [], [], []
                    with lock:
                        for seat in seats_list:
                            seat = seat.upper()
                            if seat not in seats:
                                invalid.append(seat)
                            elif seats[seat]["booked_by"] is None:
                                not_booked.append(seat)
                            elif seats[seat]["username"] != username:
                                not_owner.append(seat)
                            else:
                                seats[seat]["booked_by"] = None
                                seats[seat]["username"] = None
                                cancelled.append(seat)
                                # Save to database
                                save_seat_to_database(seat, None, None)
                    response = f"CANCELLED:{','.join(cancelled)}|NOT_BOOKED:{','.join(not_booked)}|NOT_OWNER:{','.join(not_owner)}|INVALID:{','.join(invalid)}"
                else:
                    response = "ERROR: Invalid command"
                
                # Send response
                ssl_socket.send(response.encode())
                print(f"[<-] {address}: {response[:80]}...")
                
                # For VIEW commands, we can keep connection alive
                # For BOOK/CANCEL, we can also keep connection alive for next commands
                
            except socket.timeout:
                # Timeout is normal for persistent connections, continue waiting
                continue
            except ConnectionResetError:
                break  # Client disconnected
            except Exception as e:
                print(f"[!] Command error: {e}")
                break
        
    except Exception as e:
        print(f"[!] Connection error: {e}")
    finally:
        try:
            ssl_socket.close()
        except:
            pass
        print(f"[-] Disconnected: {address}")

def start_server():
    # Initialize database and load existing seat data
    print("[DATABASE] Initializing...")
    database.init_db()
    load_seats_from_database()
    
    if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
        generate_cert()
    
    # FIXED SSL CONFIGURATION
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(CERT_FILE, KEY_FILE)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    # FIXED: Add compatible cipher settings
    context.set_ciphers('ALL:@SECLEVEL=0')
    
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind((HOST, PORT))
        server.listen(5)
        print("============================================================")
        print("TCP SERVER RUNNING")
        print(f"Host: {HOST}:{PORT}")
        print("============================================================")
        print(f"Loaded {sum(1 for s in seats.values() if s['booked_by'])} existing bookings")
        print("Waiting for connections...")
        
        while True:
            try:
                client, addr = server.accept()
                # FIXED: Use proper SSL wrapping
                ssl_socket = context.wrap_socket(client, server_side=True)
                thread = threading.Thread(target=handle_client, args=(ssl_socket, addr))
                thread.daemon = True
                thread.start()
            except Exception as e:
                print(f"[!] Accept error: {e}")

if __name__ == "__main__":
    start_server()
