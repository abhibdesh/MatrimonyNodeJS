# Matrimony Backend with Tamper-Evident Audit Chains

A cryptographically verifiable backend system designed to make human approvals tamper-evident, non-repudiable, and audit-proof.

---

## Context

This repository is a simplified and self-contained representation of a production-grade system designed to address data integrity and non-repudiation challenges in approval workflows.

The core design reflects real-world requirements where auditability, fraud resistance, and traceability are critical.

---

## Overview

This system implements a backend for a matrimonial trust verification platform where every approval decision is cryptographically secured and linked in an immutable audit chain.

Each approval is:

* Signed by the human approver
* Co-signed by the system
* Linked via a hash chain

This ensures that every decision is independently verifiable and tamper-evident.

The design is based on the **Silvbak framework**, a consensus-free dual attestation architecture for human-driven workflows.

---

## Problem

Traditional backend systems store approvals as mutable database records, leading to critical weaknesses:

* Approvals can be modified or deleted
* No cryptographic binding between decision and approver
* Lack of traceability and audit guarantees
* Fraud investigations require extensive reconstruction

These issues are common in financial fraud and identity verification systems.

---

## Solution

This system introduces a cryptographic accountability layer with:

* Cryptographic identity for each approver
* Dual attestation for every approval
* Hash-linked audit chains
* Idempotency-based replay protection
* Concurrency-safe chain updates

Every approval becomes:

* Tamper-evident
* Non-repudiable
* Independently verifiable

---

## Architecture

The system follows a layered processing pipeline:

* API Layer: Handles request validation and routing
* Approval Engine: Executes business logic and concurrency control
* Cryptographic Layer: Performs signing and hashing
* Audit Chain Layer: Maintains hash-linked records
* Persistence Layer: Stores approval data

Flow:

Client → API → Approval Engine → Cryptographic Layer → Audit Chain → Database

---

## Core Design

### Dual Attestation

Each approval is signed using two independent signatures:

* Admin signature using RSA-PSS
* System signature using RSA-PSS

Both signatures must be valid for the record to be accepted.

This ensures:

* No single actor can forge approvals
* Any modification invalidates verification

---

### Hash-Linked Chains

Each approver maintains a daily chain:

* First record starts from a genesis state
* Each record links to the previous hash
* Any modification breaks the chain

A global chain connects all approvals across the system, ensuring full traceability.

---

### Envelope Encryption

* Private keys are encrypted using AES-256-GCM
* Keys are decrypted only in memory during signing
* Keys are never stored in plaintext

This ensures secure key lifecycle management.

---

## Concurrency Handling

Concurrency control is implemented using an optimistic locking (compare-and-swap) strategy on the audit chain state.

* Each approval reads the latest chain hash
* Update succeeds only if the hash matches
* On mismatch, the transaction retries with jitter

This ensures:

* Linearizable updates to the audit chain
* No duplicate or conflicting entries
* No chain forks under concurrent access

Observed behavior:

* Zero retry conflicts under normal load
* Stable performance under concurrent users

---

## Load Handling and Performance

System tested using k6 load testing.

Results:

* 1785 approvals processed in 2 minutes
* ~14.8 approvals per second with 5 concurrent users
* Median latency: ~36 ms
* No degradation compared to baseline

Cryptographic overhead:

* ~6 ms per request
* Negligible impact on throughput

This demonstrates that strong cryptographic guarantees can be achieved without sacrificing performance.

---

## Security Guarantees

The system protects against:

* Database compromise
* Replay attacks
* Retroactive forgery
* Record tampering
* Unauthorized modifications

Tampering scenarios:

* Payload modification → signature invalid
* Record deletion → chain integrity breaks
* Record insertion → hash mismatch

All inconsistencies are either prevented or immediately detectable.

---

## Failure Handling

* Invalid or partial updates are rejected through chain validation
* Transactions retry on concurrency conflicts with jitter
* Signature validation ensures corrupted data is not accepted
* Chain integrity guarantees detection of inconsistent state

---

## Tech Stack

* Node.js
* MongoDB
* Crypto module (RSA-PSS, AES-256-GCM, SHA-256)
* k6 for load testing

---

## Limitations

* Key management relies on environment variables (no HSM integration)
* Monolithic deployment (no service isolation)
* No distributed consensus across multiple nodes
* Chain storage depends on database persistence

These trade-offs were made to balance system complexity and performance.

---

## Future Improvements

* Integration with Hardware Security Modules (HSM)
* Extraction into a dedicated Go-based verification service
* Distributed audit chain validation
* Append-only storage for stronger immutability guarantees

---

## Why This Project Matters

This system demonstrates:

* Designing tamper-evident backend systems
* Applying cryptographic primitives in real workflows
* Handling concurrency in integrity-critical systems
* Eliminating the need for forensic audit reconstruction

---

## Key Takeaways

* Built a cryptographically verifiable approval system
* Ensured non-repudiation and tamper evidence
* Achieved high performance with minimal cryptographic overhead
* Designed for fraud-resistant, real-world workflows

---

## Author

Abhilasha Deshmukh
Backend Engineer
