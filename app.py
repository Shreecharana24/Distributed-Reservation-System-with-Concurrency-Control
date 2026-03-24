import socket
import ssl
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

TCP_HOST = "localhost"
TCP_PORT = 9999


# Create SSL connection to TCP server
def get_tcp_connection():
    raw_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE   # OK for local TCP server
    context.minimum_version = ssl.TLSVersion.TLSv1_2

    secure_socket = context.wrap_socket(raw_socket, server_hostname="localhost")
    secure_socket.connect((TCP_HOST, TCP_PORT))

    return secure_socket


# Send command to TCP server
def send_command(command: str) -> str:
    conn = get_tcp_connection()
    try:
        conn.send(command.encode())
        response = conn.recv(4096).decode()
        return response
    finally:
        try:
            conn.send("EXIT".encode())
            conn.recv(1024)
        except:
            pass
        conn.close()
 
@app.route("/")
def home():
    return "Flask API is running 🚀"


@app.route("/api/seats", methods=["GET"])
def view_seats():
    try:
        raw = send_command("VIEW")

        if raw.startswith("Available:"):
            available = [s.strip() for s in raw.replace("Available:", "").split(",") if s.strip()]
        else:
            available = []

        all_seats = [f"A{i}" for i in range(1, 21)]

        seats = [
            {"id": seat, "available": seat in available}
            for seat in all_seats
        ]

        return jsonify({"seats": seats, "message": raw})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/book", methods=["POST"])
def book_seats():
    data = request.get_json()

    if not data or "seats" not in data or not data["seats"]:
        return jsonify({"error": "Provide seats"}), 400

    seats_list = [s.strip().upper() for s in data["seats"]]
    command = "BOOK " + " ".join(seats_list)

    try:
        raw = send_command(command)

        result = {"booked": [], "already_booked": [], "invalid": []}

        for part in raw.split("|"):
            part = part.strip()

            if part.startswith("Booked:"):
                result["booked"] = [s.strip() for s in part.replace("Booked:", "").split(",") if s.strip()]

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

    if not data or "seats" not in data or not data["seats"]:
        return jsonify({"error": "Provide seats"}), 400

    seats_list = [s.strip().upper() for s in data["seats"]]
    command = "CANCEL " + " ".join(seats_list)

    try:
        raw = send_command(command)

        result = {
            "cancelled": [],
            "not_booked": [],
            "not_owner": [],
            "invalid": []
        }

        for part in raw.split("|"):
            part = part.strip()

            if part.startswith("Cancelled:"):
                result["cancelled"] = [s.strip() for s in part.replace("Cancelled:", "").split(",") if s.strip()]

            elif part.startswith("Not booked:"):
                result["not_booked"] = [s.strip() for s in part.replace("Not booked:", "").split(",") if s.strip()]

            elif part.startswith("Not your booking:"):
                result["not_owner"] = [s.strip() for s in part.replace("Not your booking:", "").split(",") if s.strip()]

            elif part.startswith("Invalid:"):
                result["invalid"] = [s.strip() for s in part.replace("Invalid:", "").split(",") if s.strip()]

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route("/api/health", methods=["GET"])
def health():
    try:
        conn = get_tcp_connection()
        conn.send("VIEW".encode())
        conn.recv(1024)
        conn.send("EXIT".encode())
        conn.recv(1024)
        conn.close()

        return jsonify({"status": "ok", "tcp_server": "reachable"})

    except Exception as e:
        return jsonify({"status": "error", "detail": str(e)}), 503

# RUN FLASK 

if __name__ == "__main__":
    print("Flask running at https://localhost:5000")

    app.run(
        debug=True,
        port=5000,
        ssl_context=("localhost.pem", "localhost-key.pem") 
    )
