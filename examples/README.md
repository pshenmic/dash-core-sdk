# Examples

## Prerequisites

From the repository root:

```bash
yarn install
yarn build:grpc
yarn build
```

## Node

Run:

```bash
node examples/node-smoke.mjs
```

Optional environment variables:

```bash
DASH_NETWORK=mainnet DAPI_URL=https://158.160.14.115:443 node examples/node-smoke.mjs
```

What it does:

- creates a `DashCoreSDK` instance
- overrides the default connection pool
- generates an address
- performs a network smoke check with `getBlockchainStatus()` and `getBestBlockHeight()`

## Browser

Serve the repository root as static files:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/examples/browser/
```

What it does:

- imports the built SDK from `dist/`
- imports the bundled browser build from `dist/browser.js`
- generates an address in the browser
- optionally performs a blockchain status smoke check against the selected DAPI URL

Notes:

- network calls may still fail if the selected DAPI endpoint does not allow browser grpc-web/CORS requests
