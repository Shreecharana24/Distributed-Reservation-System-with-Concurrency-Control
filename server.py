import socket
import threading

# Shared resources
seats = {
    "A1": None,
    "A2": None,
    "A3": None
}

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
                if len(parts) != 2:
                    response = "Invalid format. Use: BOOK <seat>"
                else:
                    seat = parts[1].upper()
                    with lock:
                        if seat not in seats:
                            response = "Invalid seat"
                        elif seats[seat] is None:
                            seats[seat] = addr
                            response = f"{seat} booked successfully"
                        else:
                            response = f"{seat} already booked"
                        print(f"[SEATS] {seats}")  
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
    print("[SERVER STARTED] Listening on port 9999...")

    while True:
        conn, addr = server.accept()
        thread = threading.Thread(target=handle_client, args=(conn, addr))
        thread.start() 

if __name__ == "__main__":
    start_server()