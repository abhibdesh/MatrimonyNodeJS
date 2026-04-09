# Matrimony Backend with Tamper Evident Audit Chains

## Overview

This project is a backend system for a matrimonial trust verification platform designed to ensure non repudiable and tamper evident human approvals.

It implements a cryptographic accountability layer where every approval decision is:

* Signed by the human approver
* Independently co signed by the system
* Stored in a hash linked audit chain

The system is based on the Silvbak framework, a consensus free dual attestation architecture for human driven workflows.

---

## Problem

Traditional backend systems store approvals as database records.

This creates critical issues:

* Approvals can be modified or deleted
* No cryptographic link between decision and human
* Fraud investigation requires months of forensic reconstruction

Real world failures such as banking frauds and identity scams stem from this exact weakness.

---

## Solution

This system introduces:

* Cryptographic identity for each approver
* Dual attestation for every approval
* Hash linked audit chains
* Idempotency based replay protection
* Concurrency safe chain updates

Every approval becomes:

* Tamper evident
* Non repudiable
* Independently verifiable

---

## Architecture

Approval Flow:

Client Request
→ Node.js Backend
→ Approval Engine
→ Cryptographic Signing
→ Hash Chain Append
→ Global Audit Chain
→ Database

---

## Core Design

### Dual Attestation

Each approval is signed twice:

* Admin signature using RSA PSS
* System signature using RSA PSS

Both must be valid for the record to exist.

This ensures:

* No single actor can forge or modify approvals
* Any tampering breaks signature verification

---

### Hash Linked Chains

Each approver maintains a daily chain:

* First record starts from GENESIS
* Each record links to previous hash
* Any modification breaks the chain

A global chain connects all approvals across the system.

---

### Envelope Encryption

* Private keys are encrypted using AES 256 GCM
* Keys are decrypted only in memory during signing
* Never stored in plaintext

This ensures secure key lifecycle management.

---

## Concurrency Handling

Concurrency is handled using a compare and swap pattern on the chain state.

* Each approval reads the latest hash
* Update succeeds only if hash matches
* If mismatch occurs, transaction retries with jitter

This guarantees:

* Strict ordering of approvals
* No duplicate or conflicting entries
* No chain forks

In real testing:

* Zero retry conflicts under normal load
* Stable performance with concurrent users

---

## Load Handling and Performance

System was tested using k6 load testing.

Results:

* 1785 approvals processed in 2 minutes
* 5 concurrent admins achieved approximately 14.8 approvals per second
* Median latency around 36 milliseconds
* No performance degradation compared to baseline

Cryptographic overhead:

* Around 6 milliseconds per request
* Negligible impact on system performance

This demonstrates that strong cryptographic guarantees can be achieved without sacrificing throughput.

---

## Security Guarantees

The system protects against:

* Database compromise
* Replay attacks
* Retroactive forgery
* Admin collusion
* Record tampering

Tampering scenarios:

* Payload modification → signature invalid
* Record deletion → chain breaks
* Record insertion → hash mismatch

All attacks are either prevented or immediately detectable.

---

## Tech Stack

* Node.js
* MongoDB
* Crypto module (RSA PSS, AES 256 GCM, SHA 256)
* k6 for load testing

---

---

## Why This Project Matters

This is not just a CRUD backend.

It demonstrates:

* Designing tamper evident systems
* Applying cryptography in real applications
* Handling concurrency in distributed workflows
* Building audit systems with zero reconstruction

---

## Limitations

* System keys stored in environment variables
* No hardware security module integration
* Monolithic deployment

Future work includes extracting this into a standalone Go service with full isolation.

---

## Key Takeaways

* Built a cryptographically verifiable approval system
* Eliminated need for forensic audit reconstruction
* Achieved strong security guarantees with minimal overhead
* Designed for real world fraud resistant workflows

---
