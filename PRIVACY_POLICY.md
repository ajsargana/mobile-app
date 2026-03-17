# AURA50 Privacy Policy

**Effective Date:** March 1, 2026
**Last Updated:** March 1, 2026
**App Name:** AURA50
**Developer:** AURA50 Team

---

## 1. Introduction

AURA50 ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains what information we collect when you use the AURA50 mobile application ("App"), how we use it, with whom we share it, and what rights you have over your data.

By downloading or using the App, you agree to this Privacy Policy. If you do not agree, please do not use the App.

---

## 2. Information We Collect

### 2.1 Account Information

When you register an account, we collect:

- **Username** — your chosen display name
- **User ID** — a unique identifier assigned to your account
- **Referral code** — the code you use or generate for invitations
- **Account creation date**

We do **not** collect your email address or phone number unless you provide one voluntarily.

---

### 2.2 Wallet and Transaction Data

To provide blockchain functionality, we collect and store:

- **Wallet addresses** — your public A50 receiving addresses
- **Transaction history** — records of A50 sent, received, and block participation credits earned
- **Account balance** — your current A50 token balance
- **Block participation records** — which blocks you contributed to and the associated credits

**Your 24-word seed phrase (mnemonic) and private keys are stored exclusively on your device** using your operating system's secure, encrypted storage (iOS Keychain / Android Keystore). They are **never transmitted** to our servers.

---

### 2.3 Device Information

To detect fraudulent accounts, prevent Sybil attacks, and optimize performance, we collect:

- **Device ID** — a unique identifier assigned by your device's operating system
- **Device model and manufacturer** — (e.g., "Samsung Galaxy S24")
- **Operating system and version** — (e.g., "Android 14" or "iOS 17")
- **Device name** — as set in your device settings
- **Total memory and available storage** — to optimize the App's performance
- **Battery level and charging status** — to pause block participation when your battery is critically low
- **Emulator detection flag** — to verify you are using a real physical device
- **Build number and App version**
- **Whether device lock (PIN, fingerprint, face ID) is enabled** — a boolean yes/no flag only; your actual biometric data is never accessed or stored

This data is used solely for **network integrity verification** (Sybil resistance) and **performance optimization**. It is linked to your account on our servers.

---

### 2.4 Location Data

To comply with decentralization requirements and verify geographic diversity of network participants, we collect approximate location information:

- **IP address** — obtained automatically when you connect to our servers, and separately through two third-party geolocation lookup services listed in Section 5
- **Approximate geographic location** — derived from your IP address (country, region, city level accuracy only)

We use **expo-location** on your device solely to obtain GPS permission for node geographic diversity checks where required by the network protocol. Precise GPS coordinates (latitude/longitude) are collected **only if you grant location permission**, and only for the purpose of verifying that you are a distinct geographic participant in the network. We do not use location data for advertising or sell it to any third party.

You can deny location permission in your device settings at any time. Denying it will use IP-based approximate location instead.

---

### 2.5 Camera and Video Data

The App may request camera access for:

- **Identity liveness verification** — a short video clip recorded on your device to confirm you are a real person (not a bot or photo)
- **QR code scanning** — to scan referral codes or wallet addresses

Video clips used for liveness verification are **encrypted on your device** before transmission using AES-256 encryption. Encrypted video is submitted to our servers at `[your-backend-url]/api/verification/submit-video` for automated verification only. Videos are deleted from our servers after verification is complete (within 30 days maximum). Encryption keys are stored locally in your device's secure storage.

You can deny camera permission. Doing so will make liveness verification unavailable, which may limit certain features.

---

### 2.6 Network and Connectivity Data

We collect:

- **Network type** — whether you are on WiFi, 4G/LTE, 5G, 3G, or 2G
- **Connection status** — whether you are online or offline

This is used to optimize data synchronization, adjust block participation parameters for low-bandwidth connections, and queue transactions while offline. It is not linked to your carrier or phone number.

---

### 2.7 Behavioral and Usage Data

To maintain network integrity and detect fraudulent activity, we collect:

- **Block participation session data** — start time, end time, session duration, and number of hash operations completed
- **Validation voting statistics** — frequency, accuracy, and timing patterns of your network votes
- **Mining history** — a record of which blocks you participated in
- **Account activity patterns** — consistency of participation timing, used for Sybil resistance scoring
- **Referral and security circle activity** — who you have invited and whether they are active participants

This behavioral data creates an integrity score (Sybil resistance score) that helps ensure only real humans participate in the network. It is stored on our servers and associated with your account.

---

### 2.8 Data Stored on Your Device

The following categories of data are stored locally on your device:

| Storage Type | Data Stored |
|---|---|
| **Secure OS Storage** (encrypted) | Seed phrase (mnemonic), video encryption keys, master encryption key |
| **Local App Storage** | Auth token, wallet structure, transaction cache, block participation history, device attestation, Sybil scores, validation statistics, referral data, node configuration |

---

## 3. How We Use Your Information

| Purpose | Data Used |
|---|---|
| Operate your wallet and process transactions | Wallet addresses, transaction history, account balance |
| Verify you are a real, unique human participant | Device ID, emulator flag, liveness video, location, behavioral patterns |
| Prevent Sybil attacks and fraud | Device fingerprint, location, behavioral data, account age |
| Display your block participation history and credits | Participation session data, block records |
| Enable the Security Circle referral system | User ID, referral codes, invite activity |
| Optimize performance for your device | Battery level, memory, network type |
| Pause block participation on low battery | Battery level and charging status |
| Operate the monthly referral leaderboard | Username, verified referral count |
| Maintain network geographic diversity | IP-based approximate location |
| Comply with legal obligations | Any data as required by applicable law |

We do **not** use your data for:
- Targeted advertising
- Selling to data brokers
- Profiling unrelated to network integrity
- Any automated decision-making with legal effect on you

---

## 4. Data Retention

| Data Category | Retention Period |
|---|---|
| Account data | Until account deletion |
| Wallet addresses and transaction history | Until account deletion (blockchain records are permanent by their nature) |
| Device attestation | 12 months, refreshed on each app launch |
| Block participation session data | 24 months |
| Behavioral/Sybil score data | 24 months |
| Liveness verification videos (server copies) | 30 days maximum after verification |
| Video encryption keys (device only) | Until liveness session is verified or manually cleared |
| IP address logs | 90 days |
| Location data | Session only; not persistently stored |

---

## 5. Third-Party Services

We use the following third-party services that may receive limited data:

### 5.1 IP Geolocation Services

- **ipapi.co** — receives your IP address; returns approximate city/region/country. [Privacy Policy](https://ipapi.co/privacy/)
- **api.ipify.org** — used to look up your current public IP address. [Privacy Policy](https://www.ipify.org/terms-of-service)

These services receive your IP address as part of normal HTTP request headers. We do not send any personal account information to them.

### 5.2 Expo / React Native Platform

The App is built on Expo and React Native. Expo may collect limited diagnostic and crash data subject to their own privacy policy at [expo.dev/privacy](https://expo.dev/privacy).

### 5.3 No Advertising Networks

We do **not** integrate any advertising SDKs, analytics platforms (Google Analytics, Firebase Analytics, Mixpanel, etc.), or social media tracking pixels.

---

## 6. Data Security

We implement the following security measures:

- **Seed phrase and private keys** are stored only in your device's OS-level encrypted storage (iOS Keychain / Android Keystore) and never leave your device
- **Liveness verification videos** are AES-256 encrypted on your device before transmission
- **All API communication** uses HTTPS/TLS encryption in transit
- **Authentication tokens** are stored in secure device storage and expire automatically
- **No plaintext passwords** are ever stored (we use token-based authentication)

Despite these measures, no method of electronic storage or transmission is 100% secure. We cannot guarantee absolute security.

---

## 7. Children's Privacy

The App is not directed at children under the age of 13 (or 16 in jurisdictions requiring higher protection). We do not knowingly collect personal information from children. If you believe a child under 13 has provided us with personal information, please contact us at the address below and we will delete it.

---

## 8. Your Rights

Depending on where you live, you may have the following rights:

### 8.1 All Users

- **Access** — request a copy of the personal data we hold about you
- **Deletion** — request deletion of your account and associated personal data
- **Correction** — request correction of inaccurate data

### 8.2 EEA, UK, and Switzerland (GDPR)

- **Data portability** — receive your data in a machine-readable format
- **Restrict processing** — ask us to limit how we use your data
- **Object** — object to processing based on legitimate interests
- **Withdraw consent** — where processing is based on consent, withdraw it at any time
- **Lodge a complaint** — with your local supervisory authority (e.g., ICO in the UK)

Our legal basis for processing personal data is:
- **Contract performance** — operating your wallet and blockchain account
- **Legitimate interests** — Sybil resistance and network integrity
- **Consent** — location and camera access (which you grant or deny via OS permission dialogs)

### 8.3 California (CCPA / CPRA)

California residents have the right to:
- Know what personal information we collect and how it is used
- Delete personal information (with exceptions)
- Opt out of the "sale" of personal information — **we do not sell your personal information**
- Non-discrimination for exercising privacy rights

### 8.4 How to Exercise Your Rights

Submit a request by emailing: **privacy@aura50.network**

We will respond within 30 days. We may need to verify your identity before processing requests.

---

## 9. Data Transfers

Our servers may be located outside your country of residence. If you are located in the EEA, UK, or Switzerland, your data may be transferred to countries that do not have the same level of data protection as your home country. Where required, we rely on Standard Contractual Clauses or other appropriate safeguards for such transfers.

---

## 10. Permissions We Request

| Permission | Why We Need It |
|---|---|
| **Internet** | Required to connect to the blockchain network and API |
| **Camera** | Liveness verification and QR code scanning |
| **Location (approximate)** | Geographic diversity verification for network participation |
| **Location (precise / GPS)** | Optional — only if you grant it; used for node geographic verification |
| **Biometric / Device Lock** | To check whether your device has security enabled (yes/no only) |
| **Background execution** | To maintain your node connection during the session |
| **Vibration** | Haptic feedback on button interactions |
| **Network state** | To detect WiFi vs mobile data and adjust performance |

All permissions that are not strictly required for core functionality are optional and can be denied in your device settings.

---

## 11. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. When we do, we will update the "Last Updated" date at the top. For material changes, we will notify you within the App. Your continued use of the App after changes are posted constitutes your acceptance of the updated policy.

---

## 12. Contact Us

If you have any questions, concerns, or requests regarding this Privacy Policy, please contact:

**AURA50 Team**
Email: **privacy@aura50.network**

For GDPR-related enquiries:
Email: **gdpr@aura50.network**

---

*This Privacy Policy was prepared to comply with the Google Play Developer Distribution Agreement, Apple App Store Review Guidelines, the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA/CPRA), and applicable mobile platform privacy requirements.*
