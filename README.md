# Distributed Reservation System with Concurrency Control

## Project Overview
This project implements a **network-based distributed reservation system** using low-level socket programming in Python.  
It ensures **atomic and consistent booking of shared resources** under multiple concurrent client requests.

The system follows a **client-server architecture** and prevents issues like **double booking** using concurrency control mechanisms.

---

## Objectives
- Implement TCP socket communication  
- Handle multiple concurrent clients  
- Ensure data consistency and atomicity  
- Prevent race conditions and double booking  
- Design a custom request-response protocol  
- Evaluate system performance under load  

---

## Architecture
- **Server**
  - Handles multiple clients using threads  
  - Maintains shared resource state (e.g., seats)  
  - Applies concurrency control (locking)  

- **Clients**
  - Connect to server via TCP  
  - Send booking/view requests  
  - Receive responses  

---

## Technologies Used
- Python  
- Socket Programming (`socket`)  
- Multithreading (`threading`)  
- SSL/TLS (`ssl`) *(for secure communication)*  

---

## Features

### Core Features
- Multi-client support  
- Real-time booking system  
- Prevention of double booking  
- Custom communication protocol  

### Advanced Features
- Concurrency control using locks  
- Error handling for disconnections  
- Scalable design  
- Secure communication (SSL/TLS)  

---

## Communication Protocol

| Command        | Description                  |
|----------------|------------------------------|
| `BOOK <seat>` | Book a specific seat         |
| `VIEW`        | View available seats         |
| `EXIT`        | Disconnect from server       |

## Example

### Client Interaction

Client 1:
> **BOOK A1**  
> A1 booked successfully

Client 2:
> **BOOK A1**  
> A1 already booked

Client 3:
> **VIEW**  
> Available seats: A2, A3

Client 1:
> **EXIT**  
> Disconnected from server

## 🚀 How to Run

### 1. Clone Repository
```bash
git clone https://github.com/Shreecharana24/Distributed-Reservation-System-with-Concurrency-Control
cd Distributed-Reservation-System-with-Concurrency-Control
```

### 2. Run Server
```bash
python server.py
```

### 3. Run Client (multiple terminals)
```bash
python client.py
```
