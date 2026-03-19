import socket
import ssl

def start_client():
    raw_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    client = context.wrap_socket(raw_socket, server_hostname="localhost")
    client.connect(('localhost', 9999))

    print("[SECURE CONNECTED] Connected to SSL server 🔐")
    print("Commands: BOOK <seat1> ... | VIEW | EXIT\n")

    while True:
        try:
            command = input("Enter command: ").strip()
            if not command:
                continue

            client.send(command.encode())
            response = client.recv(1024).decode()
            print(f"[SERVER] {response}\n")

            if command.upper().startswith("EXIT"):
                break

        except KeyboardInterrupt:
            print("\n[DISCONNECTED]")
            break
        except Exception as e:
            print(f"[ERROR] {e}")
            break

    client.close()


if __name__ == "__main__":
    start_client()
