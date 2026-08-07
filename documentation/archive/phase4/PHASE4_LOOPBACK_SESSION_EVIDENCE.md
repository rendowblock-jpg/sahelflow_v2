# Phase 4 installed loopback seller-session evidence

Date: 2026-08-07

## Scope

This note records the final installed-runner transport defect isolated while closing Phase 4. It is evidence for PR #207 only; it does not change the product authentication contract or make a release claim.

## Observed boundary

Exact installed evidence on candidate `00f3be9a22a22d5932ab9297b9d7a11223edb976` proved the MSI lifecycle and authenticated hydrated WebView, then failed at the first protected seller API request in `verify-phase4-replacement-install.ps1`.

The setup/login ceremony mints the canonical `sf_session` cookie with the production `Secure` attribute. The installed evidence harness talks to the application's loopback HTTP listener through `System.Net` / PowerShell. That HTTP client correctly refuses to resend a `Secure` cookie over HTTP, so the harness lost the seller session before the first protected customer search even though the real WebView authentication boundary remained valid.

## Repair

Commit `a7106ac856d5403d682f8aa06f96a48317d433ad` keeps the production cookie contract unchanged and repairs only the ephemeral installed evidence client:

- setup/login responses expose their `Set-Cookie` headers only to the in-process harness response object;
- the harness extracts the exact server-minted `sf_session` value;
- it copies that value into a host-only, non-Secure cookie inside the disposable loopback `WebRequestSession` so `System.Net` can exercise authenticated HTTP APIs;
- the value is never logged or written to retained evidence;
- production `setSessionCookie()` remains unchanged and continues to mark seller authentication `Secure` in production.

The installed contract test now requires this bounded evidence adapter and continues to require the native WebView runtime-cookie boundary.

## Closure rule

This repair is not sufficient by assertion. Phase 4 remains open until the repaired exact PR head passes the selected source, native, Windows, installed replacement/restore and required PR gates and final review is clean. Only then may PR #207 merge and issue #204 close.
