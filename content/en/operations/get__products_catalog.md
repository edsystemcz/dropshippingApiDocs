Returns the job status for a `transactionId`. The status tells you whether the catalog file is ready and under which name you download it.

## When to call it

After starting a job with [`POST /products/catalog`](post__products_catalog.md), repeatedly, until the job ends. The guide describes how often to ask in the [Scheduling](../intro/30-synchronizace-katalogu.md#scheduling) section and how long a job takes in the [How long a job takes](../intro/30-synchronizace-katalogu.md#how-long-a-job-takes) section.

## What to watch out for

The `transactionId` is used to query the status of a specific job and is available for a limited time: assume 24 hours after generation. Starting a new job does not delete the previous `transactionId`.

The job status (`state`) can have these values:

| Status       | Meaning                                           |
| ------------ | ------------------------------------------------- |
| `Undefined`  | The job has been created and is waiting to start. |
| `Accepted`   | The job has been accepted for processing.         |
| `InProcess`  | The job is being processed.                       |
| `Inserted`   | Internal intermediate status.                     |
| `Updated`    | Internal intermediate status.                     |
| `Deleted`    | Internal status.                                  |
| `Rejected`   | The job was rejected.                             |
| `Cancelled`  | The job was cancelled.                            |
| `Error`      | The job ended with an error.                      |
| `Generated`  | The catalog file has been generated.              |
| `Successful` | General success status.                           |

The guide describes how to tell from the status that the job has ended, and what to do next, in the [When a job ends](../intro/30-synchronizace-katalogu.md#when-a-job-ends) section.

## Example

```bash
curl -X GET '{{baseUrl}}/products/catalog?transactionId=3fa85f64-5717-4562-b3fc-2c963f66afa6' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

You can pick the response examples for a waiting job, a job in progress and a generated file in the `200` response.

## Common errors

| Status code | When it occurs                                                     | What to do                                                                                               |
| ----------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `400`       | Invalid request, for example a missing or invalid `transactionId`. | Send the `transactionId` from the response of `POST /products/catalog`.                                  |
| `401`       | The token is missing, invalid, or expired.                         | [Renew the token](../intro/20-autentizace.md#renewing-a-token) or obtain a new one and repeat the call.  |
| `404`       | The job was not found.                                             | Check the `transactionId`. If it is no longer available, start a new job.                                |
| `500`       | Internal server error.                                             | Follow the [Retrying after errors](../intro/30-synchronizace-katalogu.md#retrying-after-errors) section. |
| `503`       | The service is temporarily unavailable.                            | Follow the [Retrying after errors](../intro/30-synchronizace-katalogu.md#retrying-after-errors) section. |
