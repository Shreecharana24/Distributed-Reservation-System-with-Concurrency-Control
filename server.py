import socket
import threading
import ssl

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
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(('localhost', 9999))
    server.listen(5)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")
    print("[SERVER STARTED] Listening on port 9999...")

    while True:
        conn, addr = server.accept()
        conn = context.wrap_socket(conn, server_side=True)
        thread = threading.Thread(target=handle_client, args=(conn, addr))
        thread.start() 

if __name__ == "__main__":
    start_server()