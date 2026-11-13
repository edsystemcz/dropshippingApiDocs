# Errors

The API may return a standard JSON error body in the `ProblemDetails` format. Typical structure:

```json
{
  "type": "string",
  "title": "string",
  "status": 400,
  "detail": "string",
  "instance": "string"
}
```

| Field      | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| `type`     | Error type or a link to the error type.                      |
| `title`    | Short error title.                                           |
| `status`   | HTTP status code.                                            |
| `detail`   | More detailed error description.                             |
| `instance` | Identification of the specific error instance, if populated. |

We recommend storing the entire error body in your technical logs.

## Support

If you have a problem, contact your account manager or customer care: [customercare@edsystem.cz](mailto:customercare@edsystem.cz)

Include the following in your report:

- the date and time of the problem,
- the endpoint used,
- the HTTP status code,
- `transactionId`,
- `fileName`, if it was returned,
- `state`, `stateChanged`, `errorCode` and `errorMessage`, if they were returned,
- a sample of the request and response body without sensitive data.
