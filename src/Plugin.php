<?php
/**
 * Plugin bootstrap.
 *
 * @package SalesByStateReportForWooCommerce
 */

namespace SBSR;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the plugin's features.
 */
class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Retrieve the singleton instance.
	 *
	 * @return Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Register hooks.
	 *
	 * @return void
	 */
	public function init() {
		Install\Schema::maybe_install();

		( new Data\Sync() )->register();
		( new Data\Scheduler() )->register();
		( new Api\Controller() )->register();
		( new Admin\Page() )->register();
		( new Admin\Tools() )->register();
		( new Abilities() )->register();
	}
}
