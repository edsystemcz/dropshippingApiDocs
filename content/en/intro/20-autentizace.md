# Authentication

The API uses OAuth 2.0. The access token is sent in the header of every Dropshipping API call:

```http
Authorization: Bearer {access_token}
```

## Getting access

To obtain a token, you need two pairs of credentials: `client_id` and `client_secret` from eD system, and the `username` and `password` of an API account.

### Client ID and Client Secret

Ask your account manager or customer care to put you in touch with the IT department, which will arrange the assignment with you. You will find the contact details in the [Support](50-chyby.md#support) section.

### API account

The `username` and `password` belong to an API account, which you create yourself in eD SHOP. This requires a signed dealer agreement with eD system a. s.

1. Log in to eD SHOP with an administrator account: [edshopb2b.edsystem.cz](https://edshopb2b.edsystem.cz) (Czech localization). For the Slovak localization at [edshop.edsystem.sk](https://edshop.edsystem.sk), the procedure is the same.
2. The “Moje nastavení” (My settings) section lists the contact persons. Create a new contact person that will serve as the account for data exchange.
3. Mark it as “API účet” (API account) and save it.
4. Use the “Změnit heslo” (Change password) button to set a password for the new account.

Do the entire setup in eD SHOP, not through a link from an email. The forgotten password form sends no email for an API account: an API account is a special type of account that has no access to eD SHOP.

## Obtaining a token

Tokens are issued by the token endpoint `{{tokenUrl}}`. To obtain the first token, send the `password` grant type with all four credentials. Scopes are not required.

```bash
curl -X POST '{{tokenUrl}}' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'client_id={clientId}' \
  --data-urlencode 'client_secret={clientSecret}' \
  --data-urlencode 'username={username}' \
  --data-urlencode 'password={password}'
```

The access token is valid for approximately 10 minutes.

## Renewing a token

To renew the token, send the `refresh_token` grant type to the same address:

```bash
curl -X POST '{{tokenUrl}}' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=refresh_token' \
  --data-urlencode 'client_id={clientId}' \
  --data-urlencode 'client_secret={clientSecret}' \
  --data-urlencode 'refresh_token={refreshToken}'
```

You can cache the access token locally and renew it using the refresh token, or you can request a new token before starting each job. The API does not restrict this in any way.
