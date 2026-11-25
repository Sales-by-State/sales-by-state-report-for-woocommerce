<?php
/**
 * The report page and its assets.
 *
 * @package SalesByStateReportForWooCommerce
 */

namespace SBSR\Admin;

use SBSR\Filters;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the report where the store can actually reach it.
 *
 * With WooCommerce Analytics enabled the report joins the Analytics reports.
 * With it disabled the Analytics menu does not exist, so the report gets its
 * own page under the WooCommerce menu instead.
 *
 * Both load the same bundle and look the same, because the components come
 * from WooCommerce Admin rather than from the Analytics feature.
 */
class Page {

	/**
	 * Menu slug for the standalone page.
	 */
	const SLUG = 'sbsr-sales-by-state';

	/**
	 * Route used inside Analytics.
	 */
	const ANALYTICS_PATH = '/analytics/sales-by-state';

	/**
	 * Register hooks.
	 *
	 * @return void
	 */
	public function register() {
		add_action( 'admin_menu', array( $this, 'register_page' ), 20 );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
	}

	/**
	 * Whether WooCommerce Analytics is switched on.
	 *
	 * @return bool
	 */
	public static function analytics_available() {
		$available = false;

		if ( method_exists( '\Automattic\WooCommerce\Admin\Features\Features', 'is_analytics_disabled_by_legacy_filters' ) ) {
			// WooCommerce 11.1+ deprecated is_enabled( 'analytics' ): same check, without the deprecated call.
			$available = ! \Automattic\WooCommerce\Admin\Features\Features::is_analytics_disabled_by_legacy_filters()
				&& 'yes' === get_option( 'woocommerce_analytics_enabled', 'yes' );
		} elseif ( class_exists( '\Automattic\WooCommerce\Admin\Features\Features' ) && method_exists( '\Automattic\WooCommerce\Admin\Features\Features', 'is_enabled' ) ) {
			$available = (bool) \Automattic\WooCommerce\Admin\Features\Features::is_enabled( 'analytics' );
		}

		/**
		 * Filters whether the report is rendered inside WooCommerce Analytics.
		 *
		 * @since 1.0.0
		 *
		 * @param bool $available Whether Analytics is considered available.
		 */
		return (bool) apply_filters( 'sbsr_analytics_available', $available );
	}

	/**
	 * Add the report to whichever menu exists.
	 *
	 * @return void
	 */
	public function register_page() {
		if ( self::analytics_available() && function_exists( 'wc_admin_register_page' ) ) {
			wc_admin_register_page(
				array(
					'id'     => 'sbsr-sales-by-state',
					'title'  => __( 'Sales by State', 'sales-by-state-report-for-woocommerce' ),
					'parent' => 'woocommerce-analytics',
					'path'   => self::ANALYTICS_PATH,
				)
			);

			return;
		}

		add_submenu_page(
			'woocommerce',
			__( 'Sales by State', 'sales-by-state-report-for-woocommerce' ),
			__( 'Sales by State', 'sales-by-state-report-for-woocommerce' ),
			'view_woocommerce_reports',
			self::SLUG,
			array( $this, 'render' )
		);
	}

	/**
	 * Render the root element for the standalone page.
	 *
	 * @return void
	 */
	public function render() {
		printf(
			'<div class="wrap sbsr-wrap">
				<div class="sbsr-page-header"><h1 class="sbsr-page-header__title">%s</h1></div>
				<div id="sbsr-root"></div>
			</div>',
			esc_html__( 'Sales by State', 'sales-by-state-report-for-woocommerce' )
		);
	}

	/**
	 * Enqueue the right bundle for the current screen.
	 *
	 * @param string $hook Current admin page hook.
	 * @return void
	 */
	public function enqueue( $hook ) {
		$on_report_screen = self::analytics_available()
			? $this->is_wc_admin_screen()
			: ( 'woocommerce_page_' . self::SLUG === $hook );

		if ( ! $on_report_screen ) {
			return;
		}

		$script = SBSR_DIR . 'assets/js/report.js';
		$style  = SBSR_DIR . 'assets/css/report.css';

		// wc-components is registered by WooCommerce Admin itself rather than by
		// the Analytics feature, so it is available on a plain admin page too.
		// That is what lets one bundle serve both places.
		wp_register_script(
			'sbsr-report',
			SBSR_URL . 'assets/js/report.js',
			array(
				'wp-hooks',
				'wp-element',
				'wp-i18n',
				'wp-api-fetch',
				'wp-url',
				'wp-components',
				'wc-settings',
				'wc-components',
				'wc-navigation',
			),
			file_exists( $script ) ? (string) filemtime( $script ) : SBSR_VERSION,
			true
		);

		wp_set_script_translations( 'sbsr-report', 'sales-by-state-report-for-woocommerce', SBSR_DIR . 'languages' );
		wp_localize_script( 'sbsr-report', 'sbsrConfig', $this->config() );
		wp_enqueue_script( 'sbsr-report' );

		wp_enqueue_style( 'wc-components' );

		wp_enqueue_style(
			'sbsr-report',
			SBSR_URL . 'assets/css/report.css',
			array( 'wc-components' ),
			file_exists( $style ) ? (string) filemtime( $style ) : SBSR_VERSION
		);
	}

	/**
	 * Whether the current screen is part of the WooCommerce Admin app.
	 *
	 * @return bool
	 */
	private function is_wc_admin_screen() {
		if ( function_exists( 'wc_admin_is_registered_page' ) && wc_admin_is_registered_page() ) {
			return true;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- reading the current screen, not acting on it.
		$page = isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : '';

		return 'wc-admin' === $page;
	}

	/**
	 * Data both bundles need to draw their controls.
	 *
	 * @return array
	 */
	private function config() {
		$measures = array();

		foreach ( Filters::measures() as $key => $measure ) {
			$measures[] = array(
				'key'   => $key,
				'label' => $measure['label'],
				'type'  => $measure['type'],
			);
		}

		$statuses = array();

		foreach ( Filters::order_statuses() as $key => $label ) {
			$statuses[] = array(
				'value' => $key,
				'label' => $label,
			);
		}

		$years = array();

		foreach ( Filters::years() as $year ) {
			$years[] = array(
				'value' => (string) $year,
				'label' => (string) $year,
			);
		}

		$countries = array();

		foreach ( WC()->countries->get_countries() as $code => $label ) {
			if ( ! WC()->countries->get_states( $code ) ) {
				continue;
			}

			$countries[] = array(
				'value' => $code,
				'label' => html_entity_decode( $label, ENT_QUOTES, 'UTF-8' ),
			);
		}

		return array(
			'measures'        => $measures,
			'statuses'        => $statuses,
			'years'           => $years,
			'countries'       => $countries,
			'defaultCountry'  => Filters::default_country(),
			'defaultYear'     => (string) Filters::default_year(),
			'defaultStatuses' => Filters::default_statuses(),
			'perPageOptions'  => array( 10, 25, 50, 100 ),
			'title'           => __( 'Sales by State', 'sales-by-state-report-for-woocommerce' ),
			'canBuild'        => current_user_can( 'manage_woocommerce' ),
			// Which host the bundle should mount into. The scripts wc-navigation
			// and wc-components load either way, so the browser cannot tell the
			// two apart on its own.
			'mode'            => self::analytics_available() ? 'analytics' : 'standalone',
		);
	}
}
