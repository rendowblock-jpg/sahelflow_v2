// Direct route suites use a disposable unconfigured database. Authentication
// tests explicitly delete this variable so configured session authority remains
// fully exercised. Vitest runs setupFiles before every test file, preventing one
// strict auth suite from leaking its environment into later business-route tests.
process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY = "vitest-business-routes";
