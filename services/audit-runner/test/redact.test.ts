import assert from "node:assert/strict";
import test from "node:test";

import { redactSecrets } from "../src/redact.ts";

const cloneError = `Failed to clone Acrylic125/itsme: Cloning into 'itsme'...
remote: Write access to repository not granted.
fatal: unable to access 'https://github.com/Acrylic125/itsme.git/': The requested URL returned error: 403`;

test("does not replace short tokens that would scramble error text", () => {
  assert.equal(redactSecrets(cloneError, "s"), cloneError);
});

test("redacts a full token without touching nearby s letters", () => {
  const token = "github_pat_11AAAAAAA0123456789_abcdefghijklmnopqrstuvwxyzABCDEF";
  const text = `Cloning into 'itsme'...
fatal: unable to access 'https://x-access-token:${token}@github.com/Acrylic125/itsme.git/'`;

  const redacted = redactSecrets(text, token);

  assert.equal(redacted.includes(token), false);
  assert.equal(redacted.includes("itsme"), true);
  assert.equal(redacted.includes("access"), true);
  assert.equal(redacted.includes("https"), true);
  assert.equal(redacted.includes("["), false);
});
