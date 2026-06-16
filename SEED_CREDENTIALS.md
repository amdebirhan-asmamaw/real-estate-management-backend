# Dev Authentication Reference

## Login Endpoint

```
POST /api/v1/auth/login
```

## Accounts

| Role           | Email                       | Password          |
| -------------- | --------------------------- | ----------------- |
| Super Admin    | `superadmin@realestate.dev` | `SuperAdmin1!`    |
| Admin          | `admin@realestate.dev`      | `PlatformAdmin1!` |
| Property Owner | `owner@realestate.dev`      | `PropertyOwner1!` |
| Property Owner | `abebe@realestate.dev`      | `AbebeOwner1!`    |
| Property Owner | `tigist@realestate.dev`     | `TigistOwner1!`   |
| Property Owner | `dawit@realestate.dev`      | `DawitOwner1!`    |
| Property Owner | `sara@realestate.dev`       | `SaraOwner1!`     |
| Tenant         | `tenant@realestate.dev`     | `TenantUser1!`    |

## Sample Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "name": "Super Admin",
      "role": "super_admin",
      "accountStatus": "active",
      "kycStatus": "verified"
    },
    "tokens": {
      "accessToken": "eyJhbG...",
      "refreshToken": "eyJhbG..."
    }
  }
}
```

## Authorization Header

```
Authorization: Bearer <accessToken>
```

## Role Permissions

| Role               | Capabilities                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **super_admin**    | Full access, create/manage admins, system configuration                                     |
| **admin**          | Listing review, KYC review, user management, compliance, chain transactions                 |
| **property_owner** | Create/manage listings, respond to offers & inquiries, manage leases, submit broker license |
| **tenant**         | Browse listings, submit offers & inquiries, rental applications, manage leases              |
