# Distributed Reservation System with Concurrency Control

## 🚀 Overview

This project implements a **secure distributed seat reservation system** using low-level socket programming, designed to handle **concurrent client requests without data inconsistency**.

It demonstrates how to combine:

* **TCP networking**
* **Concurrency control**
* **TLS encryption**
* **Modern web stack (React + Flask)**

to build a real-world distributed system.

---

## 🎯 Key Objectives

* Implement **TCP socket-based communication**
* Handle **multiple concurrent clients**
* Ensure **atomic operations and data consistency**
* Prevent **race conditions and double booking**
* Design a **custom request-response protocol**
* Integrate **secure communication using TLS**
* Build a **full-stack system (React + Flask + TCP server)**

---

## 🧠 System Architecture

```
React Frontend (HTTPS - Vite)
            ↓
Flask API Layer (HTTPS - TLS)
            ↓
TCP Server (SSL/TLS + Multithreading + Locking)
            ↓
SQLite Database (Persistent Storage)
```

---

## 🧩 Components

### 1. TCP Server (`server.py`)

* Handles multiple client connections using **threads**
* Maintains shared seat state
* Uses `threading.Lock()` for **mutual exclusion**
* Ensures **atomic booking and cancellation**

---

### 2. Flask Backend (`app.py`)

* Acts as a **middleware API layer**
* Communicates with TCP server via **secure SSL sockets**
* Exposes REST APIs for frontend
* Handles request validation and response formatting

---

### 3. Database Layer (`database.py`)

* Uses **SQLite** for persistence
* Stores:

  * Users
  * Seat bookings
  * Booking history
* Provides thread-safe DB access
* Supports authentication and audit logging

---

### 4. Frontend (`frontend/`)

* Built with **React (Vite)**
* Communicates with backend via **HTTPS**
* Displays real-time seat availability
* Handles:

  * Booking
  * Cancellation
  * User-specific seat tracking (`myBooked` state)

---

### 5. CLI Client (`client.py`)

* Lightweight TCP client
* Sends commands directly to server
* Useful for testing concurrency scenarios

---

## ⚙️ Technologies Used

* **Python**
* **Socket Programming (`socket`)**
* **Multithreading (`threading`)**
* **SSL/TLS (`ssl`)**
* **Flask**
* **SQLite**
* **React (Vite)**

---

## ✨ Features

### Core Features

* Multi-client support
* Real-time seat reservation
* Prevention of double booking
* Custom TCP protocol

### Advanced Features

* Concurrency control using locks
* End-to-end TLS encryption
* REST API abstraction layer
* Persistent storage with SQLite
* User authentication system
* Booking history tracking

---

## 📡 Communication Protocol

| Command                | Description          |
| ---------------------- | -------------------- |
| `BOOK <seat1> <seat2>` | Book seats           |
| `CANCEL <seat1>`       | Cancel booked seats  |
| `VIEW`                 | View available seats |
| `EXIT`                 | Disconnect           |

---

## 📁 Project Structure

```
Distributed-Reservation-System/
├── server.py
├── app.py
├── database.py
├── client.py
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
├── certs/
│   ├── localhost.pem
│   ├── localhost-key.pem
├── README.md
```

---

## ⚙️ Setup Guide

### 1. Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/Distributed-Reservation-System.git
cd Distributed-Reservation-System
```

---

### 2. Backend Setup

```bash
python -m venv venv
source venv/bin/activate
pip install flask flask-cors bcrypt
```

---

### 3. Frontend Setup

```bash
cd frontend
npm install
cd ..
```

---

### 4. Setup SSL (mkcert)

```bash
sudo apt install libnss3-tools

mkcert -install
mkcert localhost 127.0.0.1
```

Generated files:

```
localhost.pem
localhost-key.pem
```

Place them in root or `certs/` folder.

---

### 5. Run the System

#### Start TCP Server

```bash
python server.py
```

#### Start Flask Backend

```bash
python app.py
```

Open:

```
https://localhost:5000
```

#### Start Frontend

```bash
cd frontend
npm run dev
```

Open:

```
https://localhost:5173
```

---

## 🔌 API Endpoints

### GET `/api/seats`

Returns all seats with availability status.

---

### POST `/api/book`

```json
{
  "seats": ["A1", "A2"],
  "userId": 1
}
```

---

### POST `/api/cancel`

```json
{
  "seats": ["A1"],
  "userId": 1
}
```

---

## 🧪 Example Scenario

Client 1:

```
BOOK A1 A2
→ Booked: A1, A2
```

Client 2:

```
BOOK A2 A3
→ Already booked: A2 | Booked: A3
```

---

## 🔒 Concurrency Control

* Uses `threading.Lock()`
* Guarantees:

  * Atomic seat updates
  * No race conditions
  * No double booking under concurrent access

---

## 🔐 Security

* TLS encryption across all layers:

  * Frontend ↔ Flask (HTTPS)
  * Flask ↔ TCP Server (SSL)
* Uses **mkcert** for local trusted certificates
* Prevents plaintext data transmission

---

## 📈 Learning Outcomes

This project demonstrates:

* Distributed system design
* Concurrency handling in shared resources
* Secure communication using TLS
* Integration of low-level networking with modern web technologies
* Full-stack system architecture

---

## 📌 Future Improvements

* WebSocket-based real-time updates
* Load testing & benchmarking
* Docker containerization
* Deployment on cloud (AWS/GCP)

---

