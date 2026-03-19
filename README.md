# Distributed Reservation System with Concurrency Control

## Project Overview

This project implements a **network-based distributed reservation system** using low-level socket programming in Python.
It ensures **atomic and consistent booking of shared resources** under multiple concurrent client requests.

The system follows a **client-server architecture** and prevents issues like **double booking** using concurrency control mechanisms.

---

## Objectives

* Implement TCP socket communication
* Handle multiple concurrent clients
* Ensure data consistency and atomicity
* Prevent race conditions and double booking
* Design a custom request-response protocol
* Evaluate system performance under load

---

## Architecture

```
Frontend (React - HTTPS)
        ↓
Flask API (HTTPS - TLS)
        ↓
TCP Server (SSL/TLS + Threads)
```

---

## Components

**1. TCP Server (`server.py`)**

* Handles multiple clients using threads
* Maintains shared seat data
* Uses locks to prevent race conditions

**2. Flask Backend (`app.py`)**

* Acts as an API layer
* Communicates with TCP server using SSL
* Exposes REST endpoints

**3. Client (`client.py`)**

* CLI-based TCP client
* Sends commands to server securely

**4. Frontend (`frontend/`)**

* React (Vite) application
* Calls Flask API over HTTPS

---

## Technologies Used

* Python
* Socket Programming (`socket`)
* Multithreading (`threading`)
* SSL/TLS (`ssl`)
* Flask
* React (Vite)

---

## Features

### Core Features

* Multi-client support
* Real-time booking system
* Prevention of double booking
* Custom communication protocol

### Advanced Features

* Concurrency control using locks
* Secure communication (SSL/TLS)
* REST API layer (Flask)
* Web frontend (React)

---

## Communication Protocol

| Command                    | Description          |
| -------------------------- | -------------------- |
| `BOOK <seat1> <seat2> ...` | Book seats           |
| `VIEW`                     | View available seats |
| `EXIT`                     | Disconnect           |

---

## Project Structure

```
Reservation system/
├── server.py
├── client.py
├── app.py
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
├── README.md
```

---

## Setup Guide

### Step 1: Clone Repository

```bash
git clone https://github.com/Shreecharana24/Distributed-Reservation-System-with-Concurrency-Control
cd Reservation\ system
```

---

### Step 2: Install Requirements

#### Backend

```bash
python -m venv venv
source venv/bin/activate
pip install flask flask-cors
```

#### Frontend

```bash
cd frontend
npm install
cd ..
```

---

### Step 3: Setup SSL

```bash
sudo apt install libnss3-tools

curl -JLO https://dl.filippo.io/mkcert/latest?for=linux/amd64
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

mkcert -install
mkcert localhost
```

Generated files:

```
localhost.pem
localhost-key.pem
```

Place them in the root folder.

---

### Step 4: Run the System

#### 1. Start TCP Server

```bash
python server.py
```

#### 2. Start Flask Backend

```bash
python app.py
```

Open:

```
https://localhost:5000
```

#### 3. Start Frontend

```bash
cd frontend
npm run dev
```

Open:

```
https://localhost:5173
```

#### 4. Run CLI Client (Optional)

```bash
python client.py
```

---

## API Endpoints

### GET /api/seats

Returns all seats and availability.

### POST /api/book

```json
{
  "seats": ["A1", "A2"]
}
```

---

## Example Interaction

Client 1:

```
BOOK A1 A2
Booked: A1, A2
```

Client 2:

```
BOOK A2 A3
Already booked: A2 | Booked: A3
```

Client 3:

```
VIEW
Available: A4, A5
```

---

## Concurrency Control

* Uses `threading.Lock()`
* Ensures:

  * Atomic booking
  * No race conditions
  * No double booking

---

## Security

* TLS encryption between:

  * Client ↔ Server
  * Flask ↔ TCP server
  * Frontend ↔ Flask

* Uses locally trusted certificates via mkcert


---

## Conclusion

This project demonstrates:

* Distributed system design
* Secure communication using TLS
* Concurrency control in real-world systems
* Integration of low-level networking with modern web technologies
