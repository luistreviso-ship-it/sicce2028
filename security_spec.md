# Security Specification & Payload-First TDD — ANR 2027

## 1. Data Invariants
1. **Strict Verified Identity**: Every read/write requires `request.auth != null && request.auth.token.email_verified == true`.
2. **No Self-Privilege Escalation**: On `users/{userId}` create, a user may only assign `role: 'operador'` unless their verified email is the bootstrapped admin (`fcinmobiliariapy@gmail.com`). Users can never update their own `role` or `active` status.
3. **Complete Candidature Integrity**: Every `Candidature` created or updated must have `isComplete == true` and `totalCandidates == requiredCandidates` and `requiredCandidates > 0`, enforcing at the security rules boundary that no incomplete candidacy list can ever be persisted.
4. **Master Gate on Attachments**: Documents in `/candidatures/{candidatureId}/documents/{docId}` verify parent `/candidatures/{candidatureId}` exists via `exists()`/`get()` and validate size `<= 700000` bytes.
5. **Immutable Audit & Versions**: `audit_logs` and `list_versions` are append-only (`allow update, delete: if false;`), preserving historical integrity.
6. **No `get()`/`exists()` inside `allow list`**: Every `allow list` rule evaluates `resource.data` against `request.auth.uid` or `isBootstrappedAdmin()`.
7. **Server Timestamps**: All `createdAt` and `updatedAt` fields must equal `request.time`.

## 2. The "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Read `/candidatures/c1` with `auth == null`.
2. **Unverified Email Write**: Create `/candidatures/c1` with `email_verified: false`.
3. **Self-Admin Escalation on Signup**: Create `/users/attacker` with `role: 'admin'` from non-admin email.
4. **Self-Role Update**: Update own `/users/op1` changing `role` from `'operador'` to `'admin'`.
5. **PII Cross-User Read**: Read `/users/otherUid` as non-admin `'operador'`.
6. **Shadow Field Injection**: Create `/candidatures/c1` with extra ghost field `isSuperApproved: true`.
7. **Incomplete Candidature Save**: Create `/candidatures/c1` with `isComplete: false` or `totalCandidates: 5, requiredCandidates: 45`.
8. **ID Poisoning**: Create `/candidatures/invalid id with spaces and $$$` or > 128 chars.
9. **Spoofed Creator UID**: Create `/candidatures/c1` with `createdByUid: 'someone_else'`.
10. **Approved Candidature Tampering**: Non-admin operator updating an already `'APROBADA'` candidature.
11. **Audit Log Tampering**: Attempting to `update` or `delete` `/audit_logs/log1`.
12. **Client Timestamp Spoofing**: Creating `/audit_logs/log1` with `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time`.
