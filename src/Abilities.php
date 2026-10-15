<?php
/**
 * Exposes the report to AI agents through the WordPress Abilities API.
 *
 * @package SalesByStateReportForWooCommerce
 */

namespace SBSR;

use SBSR\Data\Backfill;
use SBSR\Data\OrderSource;
use SBSR\Data\Report;
use SBSR\Install\Schema;

defined( 'ABSPATH' ) || exit;

/**
 * Registers Sales by State abilities, so an agent (for example through the
 * WordPress MCP Adapter) can read the report.
 *
 * Each ability calls the same code as the plugin's REST API and needs the
 * same capability: view_woocommerce_reports or manage_woocommerce. The names
 * match the Pro plugin's, so an agent keeps working after an upgrade. The
 * Abilities API is in core from WordPress 6.9; on older versions the hooks
 * never fire and nothing happens.
 */
class Abilities {

	/**
	 * Ability category slug, also the ability name prefix.
	 */
	const CATEGORY = 'sales-by-state';

	/**
	 * Register hooks.
	 *
	 * @return void
	 */
	public function register() {
		add_action( 'wp_abilities_api_categories_init', array( $this, 'register_category' ) );
		add_action( 'wp_abilities_api_init', array( $this, 'register_abilities' ) );
	}

	/**
	 * Register the Sales by State category.
	 *
	 * @return void
	 */
	public function register_category() {
		if ( ! function_exists( 'wp_register_ability_category' ) ) {
			return;
		}

		wp_register_ability_category(
			self::CATEGORY,
			array(
				'label'       => __( 'Sales by State', 'sales-by-state-report-for-woocommerce' ),
				'description' => __( 'Yearly sales by state or province.', 'sales-by-state-report-for-woocommerce' ),
			)
		);
	}

	/**
	 * Register every ability.
	 *
	 * @return void
	 */
	public function register_abilities() {
		if ( ! function_exists( 'wp_register_ability' ) ) {
			return;
		}

		wp_register_ability(
			self::CATEGORY . '/get-report',
			array(
				'label'               => __( 'Get sales by state report', 'sales-by-state-report-for-woocommerce' ),
				'description'         => __( 'Returns gross and net sales for every state or province of one country in one calendar year, plus totals. States with no sales are included with zero.', 'sales-by-state-report-for-woocommerce' ),
				'category'            => self::CATEGORY,
				'input_schema'        => array(
					'type'                 => 'object',
					'additionalProperties' => false,
					'properties'           => array(
						'year'     => array(
							'type'        => 'integer',
							'description' => __( 'Calendar year. Defaults to the current year.', 'sales-by-state-report-for-woocommerce' ),
						),
						'country'  => array(
							'type'        => 'string',
							'description' => __( 'Two-letter country code, for example US or CA. Defaults to the store country.', 'sales-by-state-report-for-woocommerce' ),
						),
						'statuses' => array(
							'type'        => 'string',
							'description' => __( 'Comma-separated order statuses without the wc- prefix, for example completed,processing. Defaults to the report defaults.', 'sales-by-state-report-for-woocommerce' ),
						),
					),
				),
				'execute_callback'    => array( $this, 'get_report' ),
				'permission_callback' => array( $this, 'can_read' ),
				'meta'                => $this->meta(),
			)
		);

		wp_register_ability(
			self::CATEGORY . '/data-check',
			array(
				'label'               => __( 'Check report data', 'sales-by-state-report-for-woocommerce' ),
				'description'         => __( 'Returns how many orders the report table holds, how many are still waiting to be recorded, and whether the store uses HPOS. Run this first if figures look incomplete.', 'sales-by-state-report-for-woocommerce' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( $this, 'data_check' ),
				'permission_callback' => array( $this, 'can_read' ),
				'meta'                => $this->meta(),
			)
		);
	}

	/**
	 * Whether the current user may read the report.
	 *
	 * @return bool
	 */
	public function can_read() {
		return current_user_can( 'view_woocommerce_reports' ) || current_user_can( 'manage_woocommerce' );
	}

	/**
	 * Run the report.
	 *
	 * @param array|null $input Ability input.
	 * @return array|\WP_Error
	 */
	public function get_report( $input = null ) {
		$input = is_array( $input ) ? $input : array();

		Schema::maybe_install();

		if ( ! Schema::table_exists() ) {
			return new \WP_Error( 'sbsr_no_table', __( 'The report table does not exist yet.', 'sales-by-state-report-for-woocommerce' ) );
		}

		return ( new Report() )->get(
			isset( $input['year'] ) ? (int) $input['year'] : 0,
			isset( $input['country'] ) ? (string) $input['country'] : '',
			isset( $input['statuses'] ) ? (string) $input['statuses'] : ''
		);
	}

	/**
	 * Report table health.
	 *
	 * @return array
	 */
	public function data_check() {
		Schema::maybe_install();

		$counts = Schema::counts();

		return array(
			'table_exists' => Schema::table_exists(),
			'rows'         => $counts['rows'],
			'orders'       => $counts['orders'],
			'remaining'    => Backfill::remaining(),
			'hpos'         => OrderSource::hpos_enabled(),
		);
	}

	/**
	 * Meta shared by both abilities: public for REST, MCP and agents, and
	 * read-only.
	 *
	 * @return array
	 */
	private function meta() {
		return array(
			'public'       => true,
			'show_in_rest' => true,
			'annotations'  => array(
				'readonly'    => true,
				'destructive' => false,
				'idempotent'  => true,
			),
		);
	}
}
