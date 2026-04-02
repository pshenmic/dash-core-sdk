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
node examples/node-smoke.js
```

Wait for a payment:

```bash
node examples/wait-for-payment.js
```

Create an asset lock transaction from known UTXOs:

```bash
node examples/create-asset-lock.js
```

Create Platform asset lock proofs from an existing asset lock transaction:

```bash
node examples/create-asset-lock-proofs.js
```

What it does:

- creates a `DashCoreSDK` instance
- generates an address
- performs a network smoke check with `getBlockchainStatus()` and `getBestBlockHeight()`
- waits for a payment using `waitForPayment()`
- builds an asset lock transaction from explicitly provided UTXOs and credit outputs
- builds instant or chain asset lock proofs from an asset lock transaction and lock data

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
