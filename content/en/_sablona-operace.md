# Operation description template

How to use the template:

1. Copy the text below the line into a new file in the `operations/` folder. Name the file after the method and path of the operation: the method in lower case, two underscores, and the path with underscores instead of slashes, with the same letter case as in the specification. For example, the description of `GET /codelists/ProductCategory` goes into `get__codelists_ProductCategory.md`.
2. In each section, replace the hint with your own text. Keep the order of the sections; delete a section together with its heading if there is nothing to say.
3. Write the API address as `{{baseUrl}}` and the token endpoint address as `{{tokenUrl}}`. The build fills in the value for each environment.
4. Link to another text through its file, for example `[introduction](../intro/10-uvod.md)`. The build turns the link into an address on the website. Link to an operation that has no description yet in the same way: through the file its description will be in, for example `[creating an order](post__b2c_orders.md)`.

Do not copy the parameters or the response structure. The website shows them below the description, straight from the specification.

---

One or two sentences for a non-programmer: what the operation is for.

## When to call it

In which situation and at which step of the integration the operation is called, and what has to be done beforehand.

## What to watch out for

Rules and limits that the parameters do not show. For context, link to the introductory chapters.

## Example

```bash
curl -X GET '{{baseUrl}}/operation/path' \
  -H 'Authorization: Bearer {access_token}' \
  -H 'Accept: application/json'
```

## Common errors

| Status code | When it occurs | What to do |
| ----------- | -------------- | ---------- |
| `400`       |                |            |
