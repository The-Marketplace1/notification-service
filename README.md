# Notification Repository 

The **Notification Repository** is the Marketplace communication delivery system responsible for sending, managing, and tracking notifications across all channels.

It receives events from Marketplace services and delivers notifications reliably to customers, professionals, and administrators.

---

# Responsibilities

The Notification Service handles:

- Push notifications
- Email notifications
- SMS notifications
- In-app notifications
- Notification preferences
- Notification templates
- Delivery tracking
- Retry handling
- Notification history
- Multi-language notifications
- Timezone-aware delivery

---

# Notification Channels

## Push Notifications

Used for:

- Booking updates
- Payment updates
- Messages
- Professional job alerts
- Security alerts

Technology:

- Firebase Cloud Messaging (FCM)
- Apple Push Notification Service (APNs)

---

## Email Notifications

Used for:

- Account events
- Receipts
- Verification updates
- Legal updates
- Important announcements

---

## SMS Notifications

Used for:

- Verification codes
- Security alerts
- Critical updates

---

## In-App Notifications

Used inside:

- customer-app
- professional-app
- admin-dashboard

---

# Event Sources

Receives events from:

- auth-service
- backend-api
- payment-service
- realtime-service
- communication-service

Examples:

- user.registered
- booking.created
- booking.completed
- payment.completed
- escrow.released
- message.received
- withdrawal.completed

---

# Notification Types

Supported categories:

- Account
- Booking
- Payment
- Escrow
- Message
- Call
- Security
- Verification
- System
- Promotions

---

# User Preferences

Supports:

- Notification permissions
- Channel preferences
- Language preferences
- Timezone settings
- Quiet hours

---

# Delivery Management

Handles:

- Delivery status tracking
- Failed notifications
- Automatic retries
- Provider failures
- Rate limiting

Statuses:

- Pending
- Sent
- Delivered
- Failed
- Read

---

# Global Support

Supports:

- Multiple languages
- Multiple countries
- Multiple timezones
- Regional notification providers

---

# Integrations

## customer-app

Receives:

- Booking updates
- Payment notifications
- Messages
- Reviews
- Security alerts

---

## professional-app

Receives:

- Booking requests
- Job updates
- Earnings updates
- Withdrawal updates
- Customer messages

---

## admin-dashboard

Receives:

- System alerts
- Security notifications
- Platform events

---

# Database Ownership

Owns notification data:

- Notifications
- Notification preferences
- Notification templates
- Delivery attempts
- User devices

---

# Security

Includes:

- Secure provider credentials
- User consent management
- Rate limiting
- Audit logging
- Secure API communication

---

# Monitoring

Tracks:

- Delivery success rate
- Failed notifications
- Queue status
- Provider health
- Processing latency

---

# CI/CD

Validates:

- Tests
- Code quality
- Security checks
- Docker builds
- Deployment readiness

---

# Architecture

Service Events

↓

Notification Service

↓

Push / Email / SMS / In-App

↓

Customer / Professional / Admin

---

# License

See LICENSE file.
