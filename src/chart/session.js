const { genSessionID } = require('../utils');

const studyConstructor = require('./study');

/**
 * @typedef {'HeikinAshi' | 'Renko' | 'LineBreak' | 'Kagi' | 'PointAndFigure'
 *  | 'Range'} ChartType Custom chart type
 */

const ChartTypes = {
  HeikinAshi: 'BarSetHeikenAshi@tv-basicstudies-60!',
  Renko: 'BarSetRenko@tv-prostudies-40!',
  LineBreak: 'BarSetPriceBreak@tv-prostudies-34!',
  Kagi: 'BarSetKagi@tv-prostudies-34!',
  PointAndFigure: 'BarSetPnF@tv-prostudies-34!',
  Range: 'BarSetRange@tv-basicstudies-72!',
};

/**
 * @typedef {Object} ChartInputs Custom chart type
 * @prop {number} [atrLength] Renko/Kagi/PointAndFigure ATR length
 * @prop {'open' | 'high' | 'low' | 'close' | 'hl2'
 *  | 'hlc3' | 'ohlc4'} [source] Renko/LineBreak/Kagi source
 * @prop {'ATR' | string} [style] Renko/Kagi/PointAndFigure style
 * @prop {number} [boxSize] Renko/PointAndFigure box size
 * @prop {number} [reversalAmount] Kagi/PointAndFigure reversal amount
 * @prop {'Close'} [sources] Renko/PointAndFigure sources
 * @prop {boolean} [wicks] Renko wicks
 * @prop {number} [lb] LineBreak Line break
 * @prop {boolean} [oneStepBackBuilding] PointAndFigure oneStepBackBuilding
 * @prop {boolean} [phantomBars] Range phantom bars
 * @prop {boolean} [range] Range range
 */

/** @typedef {Object<string, Function[]>} StudyListeners */

/**
 * @typedef {Object} ChartSessionBridge
 * @prop {string} sessionID
 * @prop {StudyListeners} studyListeners
 * @prop {Object<number, number>} indexes
 * @prop {import('../client').SendPacket} send
*/

/**
 * @typedef {'seriesLoaded' | 'symbolLoaded' | 'update' | 'error'} ChartEvent
 */

/**
 * @typedef {Object} PricePeriod
 * @prop {number} time Period timestamp
 * @prop {number} open Period open value
 * @prop {number} close Period close value
 * @prop {number} max Period max value
 * @prop {number} min Period min value
 * @prop {number} volume Period volume value
 */

/**
 * @typedef {Object} Subsession
 * @prop {string} id Subsession ID (ex: 'regular')
 * @prop {string} description Subsession description (ex: 'Regular')
 * @prop {boolean} private If private
 * @prop {string} session Session (ex: '24x7')
 * @prop {string} session-correction Session correction
 * @prop {string} session-display Session display (ex: '24x7')
 *
 * @typedef {Object} MarketInfos
 * @prop {string} series_id            Used series (ex: 'ser_1')
 * @prop {string} base_currency        Base currency (ex: 'BTC')
 * @prop {string} base_currency_id     Base currency ID (ex: 'XTVCBTC')
 * @prop {string} name                 Market short name (ex: 'BTCEUR')
 * @prop {string} full_name            Market full name (ex: 'COINBASE:BTCEUR')
 * @prop {string} pro_name             Market pro name (ex: 'COINBASE:BTCEUR')
 * @prop {string} description          Market symbol description (ex: 'BTC/EUR')
 * @prop {string} short_description    Market symbol short description (ex: 'BTC/EUR')
 * @prop {string} exchange             Market exchange (ex: 'COINBASE')
 * @prop {string} listed_exchange      Market exchange (ex: 'COINBASE')
 * @prop {string} provider_id          Values provider ID (ex: 'coinbase')
 * @prop {string} currency_id          Used currency ID (ex: 'EUR')
 * @prop {string} currency_code        Used currency code (ex: 'EUR')
 * @prop {string} variable_tick_size   Variable tick size
 * @prop {number} pricescale           Price scale
 * @prop {number} pointvalue           Point value
 * @prop {string} session              Session (ex: '24x7')
 * @prop {string} session_display      Session display (ex: '24x7')
 * @prop {string} type                 Market type (ex: 'crypto')
 * @prop {boolean} has_intraday        If intraday values are available
 * @prop {boolean} fractional          If market is fractional
 * @prop {boolean} is_tradable         If the market is curently tradable
 * @prop {number} minmov               Minimum move value
 * @prop {number} minmove2             Minimum move value 2
 * @prop {string} timezone             Used timezone
 * @prop {boolean} is_replayable       If the replay mode is available
 * @prop {boolean} has_adjustment      If the adjustment mode is enabled
 * @prop {boolean} has_extended_hours  Has extended hours
 * @prop {string} bar_source           Bar source
 * @prop {string} bar_transform        Bar transform
 * @prop {boolean} bar_fillgaps        Bar fill gaps
 * @prop {string} allowed_adjustment   Allowed adjustment (ex: 'none')
 * @prop {string} subsession_id        Subsession ID (ex: 'regular')
 * @prop {string} pro_perm             Pro permission (ex: '')
 * @prop {[]} base_name                Base name (ex: ['COINBASE:BTCEUR'])
 * @prop {[]} legs                     Legs (ex: ['COINBASE:BTCEUR'])
 * @prop {Subsession[]} subsessions    Sub sessions
 * @prop {[]} typespecs                Typespecs (ex: [])
 * @prop {[]} resolutions              Resolutions (ex: [])
 * @prop {[]} aliases                  Aliases (ex: [])
 * @prop {[]} alternatives             Alternatives (ex: [])
 */

/**
 * @param {import('../client').ClientBridge} client
 */
module.exports = (client) => class ChartSession {
  #sessionID = genSessionID('cs');

  /** Parent client */
  #client = client;

  /** @type {StudyListeners} */
  #studyListeners = {};

  /**
   * Table of periods values indexed by timestamp
   * @type {Object<number, PricePeriod[]>}
   */
  #periods = {};

  /** @return {PricePeriod[]} List of periods values */
  get periods() {
    return Object.values(this.#periods).sort((a, b) => b.time - a.time);
  }

  /**
   * Current market infos
   * @type {MarketInfos}
   */
  #infos = {};

  /** @return {MarketInfos} Current market infos */
  get infos() {
    return this.#infos;
  }

  #callbacks = {
    seriesLoaded: [],
    symbolLoaded: [],
    update: [],

    event: [],
    error: [],
  };

  /**
   * @param {ChartEvent} ev Client event
   * @param {...{}} data Packet data
   */
  #handleEvent(ev, ...data) {
    this.#callbacks[ev].forEach((e) => e(...data));
    this.#callbacks.event.forEach((e) => e(ev, ...data));
  }

  #handleError(...msgs) {
    if (this.#callbacks.error.length === 0) console.error(...msgs);
    else this.#handleEvent('error', ...msgs);
  }

  constructor() {
    this.#client.sessions[this.#sessionID] = {
      type: 'chart',
      onData: (packet) => {
        if (global.TW_DEBUG) console.log('§90§30§106 CHART SESSION §0 DATA', packet);

        if (typeof packet.data[1] === 'string' && this.#studyListeners[packet.data[1]]) {
          this.#studyListeners[packet.data[1]](packet);
          return;
        }

        if (packet.type === 'symbol_resolved') {
          this.#infos = {
            series_id: packet.data[1],
            ...packet.data[2],
          };

          this.#handleEvent('symbolLoaded');
          return;
        }

        if (['timescale_update', 'du'].includes(packet.type)) {
          Object.keys(packet.data[1]).forEach((k) => {
            if (k === '$prices') {
              const periods = packet.data[1].$prices;
              if (!periods || !periods.s) return;

              periods.s.forEach((p) => {
                [this.#chartSession.indexes[p.i]] = p.v;
                this.#periods[p.v[0]] = {
                  time: p.v[0],
                  open: p.v[1],
                  close: p.v[4],
                  max: p.v[2],
                  min: p.v[3],
                  volume: Math.round(p.v[5] * 100) / 100,
                };
              });

              return;
            }

            if (this.#studyListeners[k]) this.#studyListeners[k](packet);
          });

          this.#handleEvent('update');
          return;
        }

        if (packet.type === 'symbol_error') {
          this.#handleError(`(${packet.data[1]}) Symbol error:`, packet.data[2]);
          return;
        }

        if (packet.type === 'series_error') {
          this.#handleError('Series error:', packet.data[3]);
          return;
        }

        if (packet.type === 'critical_error') {
          const [, name, description] = packet.data;
          this.#handleError('Critical error:', name, description);
        }
      },
    };

    this.#client.send('chart_create_session', [this.#sessionID]);
  }

  #seriesCreated = false;

  #currentSeries = 0;

  /**
   * @param {import('../types').TimeFrame} timeframe Chart period timeframe
   * @param {number} [range] Number of loaded periods/candles (Default: 100)
   * @param {number} [reference] Reference candle timestamp (Default is now)
   */
  setSeries(timeframe = '240', range = 100, reference = null) {
    if (!this.#currentSeries) {
      this.#handleError('Please set the market before setting series');
      return;
    }

    const calcRange = !reference ? range : ['bar_count', reference, range];

    this.#periods = {};

    this.#client.send(`${this.#seriesCreated ? 'modify' : 'create'}_series`, [
      this.#sessionID,
      '$prices',
      's1',
      `ser_${this.#currentSeries}`,
      timeframe,
      this.#seriesCreated ? '' : calcRange,
    ]);

    this.#seriesCreated = true;
  }

  /**
   * Set the chart market
   * @param {string} symbol Market symbol
   * @param {Object} [options] Chart options
   * @param {import('../types').TimeFrame} [options.timeframe] Chart period timeframe
   * @param {number} [options.range] Number of loaded periods/candles (Default: 100)
   * @param {number} [options.to] Last candle timestamp (Default is now)
   * @param {'splits' | 'dividends'} [options.adjustment] Market adjustment
   * @param {'regular' | 'extended'} [options.session] Chart session
   * @param {'EUR' | 'USD' | string} [options.currency] Chart currency
   * @param {ChartType} [options.type] Chart custom type
   * @param {ChartInputs} [options.inputs] Chart custom inputs
   */
  setMarket(symbol, options = {}) {
    this.#periods = {};

    const symbolInit = {
      symbol: symbol || 'BTCEUR',
      adjustment: options.adjustment || 'splits',
    };

    if (options.session) symbolInit.session = options.session;

    if (options.currency) symbolInit['currency-id'] = options.currency;

    const chartInit = (options.type && ChartTypes[options.type]) ? {} : symbolInit;

    if (options.type && ChartTypes[options.type]) {
      chartInit.symbol = symbolInit;
      chartInit.type = ChartTypes[options.type];
      chartInit.inputs = { ...options.inputs };
    }

    this.#currentSeries += 1;

    this.#client.send('resolve_symbol', [
      this.#sessionID,
      `ser_${this.#currentSeries}`,
      `=${JSON.stringify(chartInit)}`,
    ]);

    this.setSeries(options.timeframe, options.range, options.to);
  }

  /**
   * Set the chart timezone
   * @param {import('../types').Timezone} timezone New timezone
   */
  setTimezone(timezone) {
    this.#periods = {};
    this.#client.send('switch_timezone', [this.#sessionID, timezone]);
  }

  /**
   * Fetch x additional previous periods/candles values
   * @param {number} number Number of additional periods/candles you want to fetch
   */
  fetchMore(number = 1) {
    this.#client.send('request_more_data', [this.#sessionID, '$prices', number]);
  }

  /**
   * When a symbol is loaded
   * @param {() => void} cb
   * @event
   */
  onSymbolLoaded(cb) {
    this.#callbacks.symbolLoaded.push(cb);
  }

  /**
   * When a chart update happens
   * @param {() => void} cb
   * @event
   */
  onUpdate(cb) {
    this.#callbacks.update.push(cb);
  }

  /**
   * When chart error happens
   * @param {(...any) => void} cb Callback
   * @event
   */
  onError(cb) {
    this.#callbacks.error.push(cb);
  }

  /** @type {ChartSessionBridge} */
  #chartSession = {
    sessionID: this.#sessionID,
    studyListeners: this.#studyListeners,
    indexes: {},
    send: (t, p) => this.#client.send(t, p),
  };

  Study = studyConstructor(this.#chartSession);

  /** Delete the chart session */
  delete() {
    this.#client.send('quote_delete_session', [this.#sessionID]);
    delete this.#client.sessions[this.#sessionID];
  }
};
