<?php
/**
 * Plugin Name:          Sales by State Report for WooCommerce
 * Plugin URI:           https://salesbystate.com/
 * Description:          See a yearly breakdown of WooCommerce sales by state / county / province for a given country, filterable by order status.
 * Version:              1.0.4
 * Author:               Rodolfo Melogli
 * Author URI:           https://businessbloomer.com/
 * Developer:            Rodolfo Melogli
 * Developer URI:        https://businessbloomer.com/
 * Text Domain:          sales-by-state-report-for-woocommerce
 * Domain Path:          /languages
 * Requires at least:    6.4
 * Tested up to:         7.1
 * Requires PHP:         7.4
 * Requires Plugins:     woocommerce
 * WC requires at least: 8.0
 * WC tested up to:      11.1
 * License:              GPL-2.0-or-later
 * License URI:          https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package SalesByStateReportForWooCommerce
 * @copyright 2026 Rodolfo Melogli
 */

defined( 'ABSPATH' ) || exit;

define( 'SBSR_VERSION', '1.0.4' );
define( 'SBSR_FILE', __FILE__ );
define( 'SBSR_DIR', plugin_dir_path( __FILE__ ) );
define( 'SBSR_URL', plugin_dir_url( __FILE__ ) );

spl_autoload_register(
	function ( $class_name ) {
		$prefix = 'SBSR\\';

		if ( 0 !== strpos( $class_name, $prefix ) ) {
			return;
		}

		$relative = substr( $class_name, strlen( $prefix ) );
		$path     = SBSR_DIR . 'src/' . str_replace( '\\', '/', $relative ) . '.php';

		if ( is_readable( $path ) ) {
			require_once $path;
		}
	}
);

add_action(
	'before_woocommerce_init',
	function () {
		if ( ! class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			return;
		}

		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', SBSR_FILE, true );
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', SBSR_FILE, true );
	}
);

add_action(
	'plugins_loaded',
	function () {
		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action(
				'admin_notices',
				function () {
					if ( ! current_user_can( 'activate_plugins' ) ) {
						return;
					}

					printf(
						'<div class="notice notice-error"><p>%s</p></div>',
						esc_html__( 'Sales by State Report for WooCommerce requires WooCommerce to be installed and active.', 'sales-by-state-report-for-woocommerce' )
					);
				}
			);

			return;
		}

		SBSR\Plugin::instance()->init();
	},
	20
);

register_activation_hook(
	SBSR_FILE,
	function () {
		require_once SBSR_DIR . 'src/Install/Schema.php';
		SBSR\Install\Schema::install();
	}
);

register_deactivation_hook(
	SBSR_FILE,
	function () {
		if ( function_exists( 'as_unschedule_all_actions' ) ) {
			as_unschedule_all_actions( 'sbsr_backfill_batch', array(), 'sales-by-state-report-for-woocommerce' );
		}
	}
);
