/**
 * Sales by State Report for WooCommerce.
 *
 * Drawn with WooCommerce's own components in both places it can appear. Those
 * components are registered by WooCommerce Admin itself, not by the Analytics
 * feature, so they are available on a plain admin page too — which is why the
 * report looks identical whether Analytics is enabled or not.
 *
 * Data comes from this plugin's REST endpoint rather than an Analytics data
 * store, so the figures never depend on the Analytics tables.
 *
 * @package SalesByStateReportForWooCommerce
 */

( function ( wp, wc, config ) {
	'use strict';

	if ( ! wp || ! wp.hooks || ! wp.element || ! wc || ! wc.components ) {
		return;
	}

	var el = wp.element.createElement;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var useRef = wp.element.useRef;
	var __ = wp.i18n.__;

	var TableCard = wc.components.TableCard;
	var SummaryList = wc.components.SummaryList;
	var SummaryNumber = wc.components.SummaryNumber;

	var CheckboxControl = wp.components.CheckboxControl;
	var Dropdown = wp.components.Dropdown;
	var Button = wp.components.Button;

	var navigation = wc.navigation || {};
	var settings = config || {};

	// Supplied by PHP. wc-navigation loads on both screens, so its presence says
	// nothing about whether the WooCommerce Admin router is actually driving
	// this page.
	var IS_ANALYTICS = 'analytics' === settings.mode;
	var measures = settings.measures || [];
	var statusOptions = settings.statuses || [];

	var API = '/sbsr/v1/report';
	var DIAGNOSTICS = '/sbsr/v1/diagnostics';
	var BACKFILL = '/sbsr/v1/backfill';
	var DEFAULT_PER_PAGE = 25;

	/**
	 * Progress of the one-off import of orders that pre-date the plugin.
	 *
	 * Shown because the figures are incomplete until it finishes, which would
	 * otherwise read as wrong numbers. It reports the import rather than asking
	 * permission to run it.
	 *
	 * @param {Object} props Component props.
	 * @return {Object|null} Element.
	 */
	function ImportStatus( props ) {
		var diag = props.diagnostics;

		if ( ! diag ) {
			return null;
		}

		if ( ! diag.table_exists ) {
			return el(
				'div',
				{ className: 'sbsr-notice is-error' },
				el( 'p', { className: 'sbsr-notice__title' }, __( 'The report table is missing.', 'sales-by-state-report-for-woocommerce' ) ),
				el( 'p', null, __( 'Deactivate and reactivate the plugin to create it. If it still does not appear, the database user may not have permission to create tables.', 'sales-by-state-report-for-woocommerce' ) )
			);
		}

		if ( diag.remaining <= 0 ) {
			return null;
		}

		var done = Math.max( 0, diag.orders - diag.remaining );
		var pct = props.running
			? props.progress
			: ( diag.orders > 0 ? Math.round( ( done / diag.orders ) * 100 ) : 0 );

		return el(
			'div',
			{ className: 'sbsr-importing', role: 'status', 'aria-live': 'polite' },
			el(
				'div',
				{ className: 'sbsr-importing__row' },
				el( 'span', { className: 'sbsr-importing__label' }, __( 'Reading past orders…', 'sales-by-state-report-for-woocommerce' ) ),
				el( 'span', { className: 'sbsr-importing__count' }, pct + '%' )
			),
			el(
				'div',
				{ className: 'sbsr-progress' },
				el( 'div', { className: 'sbsr-progress__bar', style: { width: pct + '%' } } )
			),
			el(
				'p',
				{ className: 'sbsr-importing__hint' },
				__( 'Figures below are incomplete until this finishes.', 'sales-by-state-report-for-woocommerce' )
			)
		);
	}

	/**
	 * Read the selected statuses from the URL.
	 *
	 * @param {Object} query Current query.
	 * @return {Array} Status keys.
	 */
	function readStatuses( query ) {
		var raw = query && query.sbsStatuses;

		if ( ! raw ) {
			return ( settings.defaultStatuses || [ 'wc-completed' ] ).slice();
		}

		return String( raw ).split( ',' ).filter( function ( s ) {
			return !! s;
		} );
	}

	/**
	 * Build the onQueryChange handler TableCard expects.
	 *
	 * TableCard calls onQueryChange( param )( value, extra ) for sorting, paging
	 * and rows-per-page. Supplying it from one setter keeps the table behaving
	 * the same in both hosts.
	 *
	 * @param {Function} setQuery Query setter.
	 * @return {Function} Handler factory.
	 */
	function makeOnQueryChange( setQuery ) {
		return function ( param ) {
			return function ( value, extra ) {
				if ( 'sort' === param ) {
					setQuery( { orderby: value, order: extra } );
					return;
				}

				if ( 'paged' === param ) {
					setQuery( { paged: value } );
					return;
				}

				if ( 'per_page' === param ) {
					setQuery( { per_page: value, paged: 1 } );
					return;
				}

				var next = {};
				next[ param ] = value;
				setQuery( next );
			};
		};
	}

	/**
	 * Sort rows in the browser.
	 *
	 * The endpoint returns every state at once, so sorting and paging need no
	 * further requests.
	 *
	 * @param {Array}  rows    Rows.
	 * @param {string} orderby Column key, or 'state'.
	 * @param {string} order   asc or desc.
	 * @return {Array} Sorted rows.
	 */
	function sortRows( rows, orderby, order ) {
		var direction = 'asc' === order ? 1 : -1;
		var copy = rows.slice();

		if ( 'state' === orderby ) {
			copy.sort( function ( a, b ) {
				return direction * String( a.state_name ).localeCompare( String( b.state_name ) );
			} );

			return copy;
		}

		copy.sort( function ( a, b ) {
			var left = Number( a[ orderby ] ) || 0;
			var right = Number( b[ orderby ] ) || 0;

			if ( left === right ) {
				return String( a.state_name ).localeCompare( String( b.state_name ) );
			}

			return direction * ( left - right );
		} );

		return copy;
	}

	/**
	 * The order status filter, as a dropdown of checkboxes.
	 *
	 * The last ticked status cannot be unticked, since no statuses would produce
	 * an empty report indistinguishable from a failure.
	 *
	 * @param {Object} props Component props.
	 * @return {Object} Element.
	 */
	function StatusFilter( props ) {
		var selected = props.value;
		var label;

		if ( 1 === selected.length ) {
			var match = statusOptions.filter( function ( o ) {
				return o.value === selected[ 0 ];
			} )[ 0 ];

			label = match ? match.label : selected[ 0 ];
		} else if ( selected.length === statusOptions.length ) {
			label = __( 'All statuses', 'sales-by-state-report-for-woocommerce' );
		} else {
			label = selected.length + ' ' + __( 'statuses selected', 'sales-by-state-report-for-woocommerce' );
		}

		function toggle( value, checked ) {
			var next = selected.filter( function ( s ) {
				return s !== value;
			} );

			if ( checked ) {
				next = next.concat( [ value ] );
			}

			if ( ! next.length ) {
				return;
			}

			next = statusOptions
				.map( function ( o ) {
					return o.value;
				} )
				.filter( function ( v ) {
					return next.indexOf( v ) !== -1;
				} );

			props.onChange( next );
		}

		return el(
			'div',
			{ className: 'sbsr-filter' },
			el( 'span', { className: 'sbsr-filter__label' }, __( 'Order status', 'sales-by-state-report-for-woocommerce' ) ),
			el( Dropdown, {
				className: 'sbsr-filter__dropdown',
				contentClassName: 'sbsr-status-popover',
				position: 'bottom left',
				renderToggle: function ( toggleProps ) {
					// No variant: the WordPress secondary button is blue, which
					// would not match the plain selects beside it. Styled as a
					// select in CSS instead.
					return el(
						Button,
						{
							className: 'sbsr-filter__toggle',
							onClick: toggleProps.onToggle,
							'aria-expanded': toggleProps.isOpen
						},
						el( 'span', null, label )
					);
				},
				renderContent: function () {
					return el(
						'div',
						{ className: 'sbsr-status-popover__list' },
						statusOptions.map( function ( option ) {
							var checked = selected.indexOf( option.value ) !== -1;

							return el( CheckboxControl, {
								key: option.value,
								label: option.label,
								checked: checked,
								disabled: checked && 1 === selected.length,
								onChange: function ( isChecked ) {
									toggle( option.value, isChecked );
								}
							} );
						} )
					);
				}
			} )
		);
	}

	/**
	 * A labelled select that writes its value into the URL.
	 *
	 * @param {Object} props Component props.
	 * @return {Object} Element.
	 */
	function Filter( props ) {
		return el(
			'label',
			{ className: 'sbsr-filter' },
			el( 'span', { className: 'sbsr-filter__label' }, props.label ),
			el(
				'select',
				{
					className: 'sbsr-filter__select',
					value: props.value,
					onChange: function ( event ) {
						props.onChange( event.target.value );
					}
				},
				( props.options || [] ).map( function ( option ) {
					return el( 'option', { key: option.value, value: option.value }, option.label );
				} )
			)
		);
	}

	/**
	 * The report.
	 *
	 * @param {Object} props Component props.
	 * @return {Object} Element.
	 */
	function SalesByStateReport( props ) {
		var query = props.query || {};
		var onQueryChange = makeOnQueryChange( props.setQuery );

		function setFilter( next ) {
			next.paged = 1;
			props.setQuery( next );
		}

		var dataState = useState( { rows: [], totals: null, loading: true, error: null } );
		var data = dataState[ 0 ];
		var setData = dataState[ 1 ];

		var diagState = useState( null );
		var diagnostics = diagState[ 0 ];
		var setDiagnostics = diagState[ 1 ];

		var importState = useState( { running: false, progress: 0 } );
		var importing = importState[ 0 ];
		var setImporting = importState[ 1 ];

		var reloadState = useState( 0 );
		var reload = reloadState[ 0 ];
		var setReload = reloadState[ 1 ];

		// Guards against restarting an import that has already stalled.
		var started = useRef( false );

		var country = query.sbsCountry || settings.defaultCountry || 'US';
		var year = query.sbsYear || settings.defaultYear;
		var statuses = readStatuses( query );
		var statusKey = statuses.join( ',' );

		var orderby = query.orderby || 'net_revenue';
		var order = query.order || 'desc';
		var perPage = Math.max( 1, parseInt( query.per_page, 10 ) || DEFAULT_PER_PAGE );

		useEffect(
			function () {
				var cancelled = false;

				setData( function ( current ) {
					return {
						rows: current.rows,
						totals: current.totals,
						loading: true,
						error: null
					};
				} );

				wp.apiFetch( {
					path: wp.url.addQueryArgs( API, {
						year: year,
						country: country,
						statuses: statusKey
					} )
				} )
					.then( function ( result ) {
						if ( ! cancelled ) {
							setData( {
								rows: result.rows || [],
								totals: result.totals || null,
								loading: false,
								error: null
							} );
						}
					} )
					.catch( function ( err ) {
						if ( ! cancelled ) {
							setData( {
								rows: [],
								totals: null,
								loading: false,
								error: ( err && err.message ) || __( 'Could not load the report.', 'sales-by-state-report-for-woocommerce' )
							} );
						}
					} );

				return function () {
					cancelled = true;
				};
			},
			[ year, country, statusKey, reload ]
		);

		useEffect(
			function () {
				var cancelled = false;

				wp.apiFetch( { path: DIAGNOSTICS } )
					.then( function ( result ) {
						if ( ! cancelled ) {
							setDiagnostics( result );
						}
					} )
					.catch( function () {
						if ( ! cancelled ) {
							setDiagnostics( null );
						}
					} );

				return function () {
					cancelled = true;
				};
			},
			[ reload ]
		);

		// The import needs no permission from the reader: it is the only way the
		// report can be correct, so it starts itself and reports progress.
		useEffect(
			function () {
				if ( ! diagnostics || ! settings.canBuild ) {
					return;
				}

				if ( ! diagnostics.table_exists || diagnostics.remaining <= 0 ) {
					return;
				}

				if ( importing.running || started.current ) {
					return;
				}

				started.current = true;
				runImport();
			},
			[ diagnostics ]
		);

		/**
		 * Loop the import endpoint until nothing remains.
		 */
		function runImport() {
			setImporting( { running: true, progress: 0 } );

			var total = diagnostics ? diagnostics.orders : 0;

			function step() {
				wp.apiFetch( { path: BACKFILL, method: 'POST', data: { limit: 1000 } } )
					.then( function ( result ) {
						var pct = total > 0
							? Math.min( 100, Math.round( ( ( total - result.remaining ) / total ) * 100 ) )
							: 0;

						setImporting( { running: true, progress: pct } );

						if ( ! result.complete && result.processed > 0 ) {
							step();
							return;
						}

						setImporting( { running: false, progress: 100 } );
						setReload( function ( n ) {
							return n + 1;
						} );
					} )
					.catch( function () {
						setImporting( { running: false, progress: 0 } );
					} );
			}

			step();
		}

		var sorted = sortRows( data.rows, orderby, order );
		var pages = Math.max( 1, Math.ceil( sorted.length / perPage ) );
		var page = Math.min( Math.max( 1, parseInt( query.paged, 10 ) || 1 ), pages );
		var pageRows = sorted.slice( ( page - 1 ) * perPage, page * perPage );

		var headers = [
			{
				key: 'state',
				label: __( 'State', 'sales-by-state-report-for-woocommerce' ),
				isLeftAligned: true,
				required: true,
				isSortable: true
			}
		].concat(
			measures.map( function ( m ) {
				return {
					key: m.key,
					label: m.label,
					isNumeric: true,
					isSortable: true,
					required: true,
					defaultSort: 'net_revenue' === m.key,
					defaultOrder: 'desc'
				};
			} )
		);

		var rows = pageRows.map( function ( row ) {
			return [ { display: row.state_name, value: row.state_name } ].concat(
				measures.map( function ( m ) {
					return {
						display: row[ m.key + '_formatted' ],
						value: row[ m.key ]
					};
				} )
			);
		} );

		var summary = data.totals
			? el( SummaryList, null, function () {
				return measures.map( function ( m ) {
					return el( SummaryNumber, {
						key: m.key,
						label: m.label,
						value: data.totals[ m.key + '_formatted' ],
						href: '',
						selected: false,
						prevLabel: '',
						prevValue: null,
						delta: null
					} );
				} );
			} )
			: null;

		var children = [
			el( ImportStatus, {
				key: 'import',
				diagnostics: diagnostics,
				running: importing.running,
				progress: importing.progress
			} ),
			el(
				'div',
				{ key: 'filters', className: 'sbsr-filters' },
				el( Filter, {
					label: __( 'Country', 'sales-by-state-report-for-woocommerce' ),
					value: country,
					options: settings.countries || [],
					onChange: function ( value ) {
						setFilter( { sbsCountry: value } );
					}
				} ),
				el( Filter, {
					label: __( 'Year', 'sales-by-state-report-for-woocommerce' ),
					value: String( year ),
					options: settings.years || [],
					onChange: function ( value ) {
						setFilter( { sbsYear: value } );
					}
				} ),
				el( StatusFilter, {
					value: statuses,
					onChange: function ( next ) {
						setFilter( { sbsStatuses: next.join( ',' ) } );
					}
				} )
			)
		];

		if ( data.error ) {
			children.push(
				el(
					'div',
					{ key: 'error', className: 'notice notice-error sbsr-error' },
					el( 'p', null, data.error )
				)
			);
		}

		if ( summary ) {
			children.push( el( 'div', { key: 'summary' }, summary ) );
		}

		children.push(
			el( TableCard, {
				key: 'table',
				title: __( 'Sales by State', 'sales-by-state-report-for-woocommerce' ),
				headers: headers,
				rows: rows,
				rowsPerPage: perPage,
				totalRows: sorted.length,
				isLoading: data.loading,
				query: query,
				onQueryChange: onQueryChange,
				showMenu: false
			} )
		);

		return el( 'div', { className: 'woocommerce-analytics__report sbsr-report' }, children );
	}

	/* ---------------------------------------------------------------------
	 * Hosts
	 *
	 * The report itself is host-agnostic: it takes a query object and a setter.
	 * Only where those two come from differs.
	 * ------------------------------------------------------------------ */

	/**
	 * Inside WooCommerce Admin, the router owns the query string.
	 *
	 * @param {Object} props Props supplied by the Analytics report controller.
	 * @return {Object} Element.
	 */
	function RoutedReport( props ) {
		return el( SalesByStateReport, {
			query: props.query || navigation.getQuery(),
			setQuery: navigation.updateQueryString
		} );
	}

	/**
	 * On a standalone admin page there is no router, so the report keeps the
	 * query in component state and mirrors it to the address bar itself.
	 *
	 * @return {Object} Element.
	 */
	function StandaloneReport() {
		var state = useState( readUrlQuery );
		var query = state[ 0 ];
		var setState = state[ 1 ];

		useEffect( function () {
			function onPop() {
				setState( readUrlQuery() );
			}

			window.addEventListener( 'popstate', onPop );

			return function () {
				window.removeEventListener( 'popstate', onPop );
			};
		}, [] );

		function setQuery( next ) {
			setState( function ( current ) {
				var merged = Object.assign( {}, current, next );

				writeUrlQuery( merged );

				return merged;
			} );
		}

		return el( SalesByStateReport, { query: query, setQuery: setQuery } );
	}

	/**
	 * Read the report's parameters out of the address bar.
	 *
	 * @return {Object} Query.
	 */
	function readUrlQuery() {
		var query = {};
		var keys = [ 'sbsCountry', 'sbsYear', 'sbsStatuses', 'orderby', 'order', 'paged', 'per_page' ];
		var search = window.location.search.replace( /^\?/, '' );
		var found = {};

		search.split( '&' ).forEach( function ( pair ) {
			if ( ! pair ) {
				return;
			}

			var parts = pair.split( '=' );

			found[ decodeURIComponent( parts[ 0 ] ) ] = decodeURIComponent( ( parts[ 1 ] || '' ).replace( /\+/g, ' ' ) );
		} );

		keys.forEach( function ( key ) {
			if ( found[ key ] ) {
				query[ key ] = found[ key ];
			}
		} );

		query.page = found.page || 'sbsr-sales-by-state';

		return query;
	}

	/**
	 * Mirror the query to the address bar so a view can be shared or reloaded.
	 *
	 * @param {Object} query Query.
	 */
	function writeUrlQuery( query ) {
		var params = [];

		Object.keys( query ).forEach( function ( key ) {
			if ( '' !== query[ key ] && null !== query[ key ] && undefined !== query[ key ] ) {
				params.push( encodeURIComponent( key ) + '=' + encodeURIComponent( query[ key ] ) );
			}
		} );

		window.history.pushState( null, '', window.location.pathname + '?' + params.join( '&' ) );
	}

	if ( IS_ANALYTICS ) {
		wp.hooks.addFilter(
			'woocommerce_admin_reports_list',
			'sales-by-state-report-for-woocommerce',
			function ( reports ) {
				return reports.concat( [
					{
						report: 'sales-by-state',
						title: __( 'Sales by State', 'sales-by-state-report-for-woocommerce' ),
						component: RoutedReport,
						navArgs: { id: 'sbsr-sales-by-state' }
					}
				] );
			}
		);
	} else {
		mountStandalone();
	}

	/**
	 * Render the report into the standalone page's root element.
	 */
	function mountStandalone() {
		function render() {
			var node = document.getElementById( 'sbsr-root' );

			if ( ! node ) {
				return;
			}

			if ( wp.element.createRoot ) {
				wp.element.createRoot( node ).render( el( StandaloneReport ) );
				return;
			}

			wp.element.render( el( StandaloneReport ), node );
		}

		if ( 'loading' === document.readyState ) {
			document.addEventListener( 'DOMContentLoaded', render );
			return;
		}

		render();
	}
} )( window.wp, window.wc, window.sbsrConfig );
