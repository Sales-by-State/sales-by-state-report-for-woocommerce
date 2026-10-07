=== Sales by State Report for WooCommerce ===
Contributors: BusinessBloomer
Donate link: https://salesbystate.com/
Tags: sales-report, sales-by-state, woocommerce, analytics, sales-tax
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.3
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

See a yearly breakdown of WooCommerce sales by state / county / province for a given country, filterable by order status.

== Description ==

Sales by State Report for WooCommerce adds a report showing net and gross sales grouped by state, county or province, for a chosen year and a chosen set of order statuses.

With WooCommerce Analytics enabled the report appears under **Analytics**, alongside Revenue and Orders, drawn with the same components so it looks like a built-in report. With Analytics disabled it appears under **WooCommerce** instead, and looks the same there.

It answers the question sales tax and territory planning actually ask: how much did each state buy in a given year, counting only the orders that matter.

This plugin requires [WooCommerce](https://wordpress.org/plugins/woocommerce/).

Documentation: [salesbystate.com](https://salesbystate.com/)

= What the report shows =

* Net Sales and Gross Sales for every state in the selected country
* A summary of both figures across all states
* Sortable columns and paginated results
* States with no sales, shown as zero rather than hidden

= Filters =

* **Country** — any country WooCommerce defines states or provinces for. Defaults to the store's base country.
* **Year** — a rolling list that starts ten years back and gains a year each January without dropping one. Defaults to the current year.
* **Order status** — a checkbox list of WooCommerce order statuses. Defaults to Completed.

= How the figures are calculated =

Gross Sales is the order total. Net Sales is the order total minus tax and shipping. Both use the values WooCommerce stores on the order, so they reconcile with WooCommerce's own reporting.

Refunds are not modelled as separate records. An order that has been fully refunded carries the Refunded status, so the status filter controls whether it is counted. A partial refund is not deducted from its order's total.

= Performance =

Sales for a whole year are answered by one indexed query that returns one row per state. The response size does not grow with the number of orders.

= Data and privacy =

The plugin creates one custom database table holding, per order: the order ID, order status, creation and payment dates, billing and shipping country and state codes, currency, and the order, tax, shipping and net totals. It stores no names, addresses, email addresses or any other personal data.

Nothing is sent anywhere. The plugin makes no external HTTP requests, includes no third-party services, and collects no analytics or telemetry.

Deleting the plugin removes the table and its options.

= Compatibility =

* High-Performance Order Storage (HPOS)
* Cart and Checkout blocks
* WooCommerce Analytics — used for the menu location when enabled, never for the figures

== Installation ==

1. Upload the plugin to `/wp-content/plugins/sales-by-state-report-for-woocommerce`, or install it through the Plugins screen.
2. Activate the plugin. WooCommerce must already be installed and active.
3. Go to **Analytics → Sales by State**, or **WooCommerce → Sales by State** if Analytics is disabled.

On a store that already has orders, those orders are read into the report table once. This starts on its own. If it has not finished when you open the report, a progress bar shows how far along it is.

== Frequently Asked Questions ==

= The report shows zeros but I have orders. =

Your existing orders are still being read into the report table. Open the report and the progress bar will show how far along it is. It continues on its own; you can leave the page.

If the figures still look wrong once it has finished, rebuild from **WooCommerce → Status → Tools → Sales by State: rebuild from scratch**.

= Where does the report appear? =

Under **Analytics** when WooCommerce Analytics is enabled, and under **WooCommerce** when it is not. The report itself is identical either way.

= Does this require WooCommerce Analytics? =

No. The figures come from a table this plugin maintains from order saves, never from the Analytics tables, so turning Analytics off changes only where the report sits in the menu.

= Which address does it group by? =

The shipping address, falling back to the billing address for orders that have no shipping address, such as virtual-only orders.

= Are refunds deducted? =

A fully refunded order takes the Refunded status, so the status filter decides whether it counts. Partial refunds are not deducted from the order's total.

= Which date does the year filter use? =

The date the order was paid, falling back to the date it was created for orders that were never paid.

= Can I change the default order status? =

Yes, with the `sbsr_default_statuses` filter.

= Does it work with High-Performance Order Storage? =

Yes. The plugin declares HPOS compatibility and reads orders from whichever storage is active.

= Where can I get support? =

Use the [WordPress.org support forum](https://wordpress.org/support/plugin/sales-by-state-report-for-woocommerce/) for this plugin.

== Changelog ==

= 1.0.3 =
* Fixed: the report opened sorted smallest first. It now opens with the top states first, by net sales.
* Tested up to WooCommerce 11.1.

= 1.0.2 =
* Excluded a stray .wordpress-org directory from the shipped plugin files.

= 1.0.1 =
* Tested up to WordPress 7.1.
* Excluded doc-sync source files from the WP.org package.

= 1.0.0 =
* Initial release.

== Upgrade Notice ==

= 1.0.3 =
The report now opens with your top states first.

= 1.0.2 =
No functional changes.

= 1.0.1 =
Tested up to WordPress 7.1. No functional changes.

= 1.0.0 =
Initial release.
