/**
 * Compatibility loader for the advanced AI tool set.
 *
 * The legacy module still owns tools 19–30. The governed profitability report
 * is registered last so the runtime registry exposes one current
 * `get_revenue_report` implementation without changing the public tool count.
 */
export * from "./advanced-tools-legacy";
import "./profitability-revenue-report";
