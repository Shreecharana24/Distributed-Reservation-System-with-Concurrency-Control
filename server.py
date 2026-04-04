import socket
import threading
import ssl
import os

# Shared resources
seats = {f"A{i}": None for i in range(1, 21)}

# Lock for concurrency control
lock = threading.Lock()

def handle_client(conn, addr):
    print(f"[CONNECTED] {addr}")

    while True:
        try:
            data = conn.recv(1024).decode()
            if not data:
                break
            print(f"[REQUEST] {addr}: {data}")
            parts = data.split()
            if not parts:
                response = "Invalid command"
                conn.send(response.encode())
                continue
            parts[0] = parts[0].upper()

            # PROTOCOL

            if parts[0] == "BOOK":
                if len(parts) < 2:
                    response = "Invalid format. Use: BOOK <seat1> <seat2> ..."
                else:
                    requested_seats = [s.upper() for s in parts[1:]]
                    booked = []
                    already = []
                    invalid = []

                    with lock:
                        for seat in requested_seats:
                            if seat not in seats:
                                invalid.append(seat)
                            elif seats[seat] is None:
                                seats[seat] = addr
                                booked.append(seat)
                            else:
                                already.append(seat)
                        print(f"[SEATS] {seats}")

                    response_parts = []
                    if booked:
                        response_parts.append("Booked: " + ", ".join(booked))
                    if already:
                        response_parts.append("Already booked: " + ", ".join(already))
                    if invalid:
                        response_parts.append("Invalid: " + ", ".join(invalid))
                    
                    if response_parts:
                        response = " | ".join(response_parts)
                    else:
                        response = "No valid seats provided" 
            elif parts[0] == "CANCEL":
                if len(parts) < 2:
                    response = "Invalid format. Use: CANCEL <seat1> <seat2> ..."
                else:
                    requested_seats = [s.upper() for s in parts[1:]]

                    cancelled = []
                    not_booked = []
                    invalid = []

                    with lock:
                        for seat in requested_seats:
                            if seat not in seats:
                                invalid.append(seat)
                            elif seats[seat] is None:
                                not_booked.append(seat)
                            else:
                                # CANCEL is allowed from any connection since Flask verified ownership
                                seats[seat] = None
                                cancelled.append(seat)

                        print(f"[SEATS] {seats}")

                    response_parts = []
                    if cancelled:
                        response_parts.append("Cancelled: " + ", ".join(cancelled))
                    if not_booked:
                        response_parts.append("Not booked: " + ", ".join(not_booked))
                    if invalid:
                        response_parts.append("Invalid: " + ", ".join(invalid))

                    if response_parts:
                        response = " | ".join(response_parts)
                    else:
                        response = "No valid seats provided"
            elif parts[0] == "VIEW":
                available = [s for s, v in seats.items() if v is None]
                if available:
                    response = "Available: " + ", ".join(available)
                else:
                    response = "No seats available"
            elif parts[0] == "EXIT":
                response = "Goodbye!"
                conn.send(response.encode())
                break
            else:
                response = "Invalid command"

            conn.send(response.encode())

        except Exception as e:
            print(f"[ERROR] {addr}: {e}")
            break
    conn.close()
    print(f"[DISCONNECTED] {addr}")
        

def start_server():
    # Certificate files (mkcert generated localhost certificates)
    cert_file = "localhost.pem"
    key_file = "localhost-key.pem"
    
    # Check for certificates
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print(f"[WARNING] Certificates not found: {cert_file}, {key_file}")
        print("[INFO] Generating self-signed certificates...")
        try:
            import subprocess
            subprocess.run([
                "openssl", "req", "-x509", "-newkey", "rsa:4096",
                "-keyout", key_file, "-out", cert_file,
                "-days", "365", "-nodes",
                "-subj", "/CN=localhost",
                "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"
            ], check=True, capture_output=True)
            print("[INFO] Certificates generated successfully")
        except Exception as e:
            print(f"[ERROR] Failed to generate certificates: {e}")
            print("[INFO] Please generate certificates manually:")
            print("openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=localhost'")
            return

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('localhost', 9999))
    server.listen(5)
    
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=cert_file, keyfile=key_file)
    
    print("[SERVER STARTED] Listening on port 9999...")
    print(f"[TLS] Using certificates: {cert_file}, {key_file}")

    while True:
        try:
            conn, addr = server.accept()
            conn = context.wrap_socket(conn, server_side=True)
            thread = threading.Thread(target=handle_client, args=(conn, addr))
            thread.daemon = True
            thread.start()
        except Exception as e:
            print(f"[ERROR] Server error: {e}")

if __name__ == "__main__":
    start_server()
