const gutil = require('gulp-util');
const PluginError = gutil.PluginError;
const through = require('through2');
const async = require('async');
const path = require('path');
const EventEmitter = require('events');
const Shopify = require('shopify-api-node');

const PLUGIN_NAME = 'gulp-shopify-theme';
const PLUGIN_NAME_COLOR = gutil.colors.inverse(' ', PLUGIN_NAME, ' ');
const PLUGIN_NAME_ERROR_COLOR = gutil.colors.white.bgRed(' ', PLUGIN_NAME, ' ');

const basedirs = ['layout', 'templates', 'snippets', 'assets', 'config', 'locales', 'sections'];
const basedirsRegExp = new RegExp('(' + basedirs.join('|') + ').+', 'i');
const protectedKeys = [
    'config/settings_data.json',
    'config/settings_schema.json',
    'layout/theme.liquid',
    'templates/cart.liquid',
    'templates/blog.liquid',
    'templates/index.liquid',
    'templates/gift_card.liquid',
    'templates/collection.liquid',
    'templates/product.liquid',
    'templates/page.liquid',
];
var shopifyThemeInstances = [];

function makeShopifyTheme (options) {
    var shopifyTheme;
    var previous = shopifyThemeInstances.filter((instance)=>{
        return options.shop_name === instance._shopName && options.api_key === instance._apiKey;
    });
    if (previous.length) return previous[0];
    shopifyTheme = new ShopifyTheme( options );
    shopifyThemeInstances.push(shopifyTheme);
    return shopifyTheme;
}

/*
var theme = shopifytheme.create();
gulp.src().pipe(theme.stream());
theme.init(options);
*/

/*
Asset API
---------
shopify.asset.create(themeId, params)
shopify.asset.delete(themeId, params)
shopify.asset.get(themeId, params)
shopify.asset.list(themeId[, params])
shopify.asset.update(themeId, params)

Possible error codes
--------------------
statusCode:
401 - API Request is not valid for this shop. You are either not using the right Access Token or the permission for that token has been revoked
404 - The resource does not exist
406 - Invalid request
422 - There was a problem with the body of your Request. Inspect the response body for the errors
429 - You've gone through your API Limit.
500 - various

code:
ECONNRESET
ETIMEDOUT
ENOTFOUND
EADDRINFO
*/

module.exports = {
    create: create,
};

function create (options) {
    return makeShopifyTheme(options);
}

class ShopifyTheme extends EventEmitter {
    constructor(options) {
        super();
        this.makeConfig(options);
    }

    init (options) {
        this.makeConfig(options, true);
    }

    makeConfig (options, isInit) {
        options = options || {};
        this._options = options;
        this._taskQueue = [];
        this._shopName = options.shop_name || options.shopName;
        this._apiKey = options.api_key || options.apiKey;
        this._themeId = options.theme_id || options.shopName;
        this._password = options.password;
        this._autoLimit = options.autoLimit || false;
        this._timeout = options.timeout;
        this._root = options.root;
        if (isInit && (!options.shop_name || !options.api_key)) {
            throw new Error('Missing configuration');
        } else if (options.shop_name && options.api_key) {
            this.api = new Shopify({
                shopName: this._shopName,
                apiKey: this._apiKey,
                password: this._password,
                autoLimit: this._autoLimit,
                timeout: this._timeout,
            });
            this._initialised = true;
        }
    }

    _makeAssetKey (file) {
        var themeRoot = this._root ? path.posix.join(this._root, '/') : null;
        var fullpath = file.path ? file.path : file.history.slice(-1).pop();
        var basepath = fullpath.split(themeRoot).pop().match(basedirsRegExp);
        if (!basepath) {
            gutil.log('Invalid resource path');
            throw new Error('Invalid resource path');
        }
        basepath = path.posix.join(basepath[0]);
        return encodeURI(basepath);
    }

    _handleTaskError (error, file) {
        if (!error) return;
        var errorCode = error.code || error.statusCode;
        switch (errorCode) {
        // Retry
        case 429 :
        case 'ETIMEDOUT':
        case 'ECONNRESET':
            gutil.log(PLUGIN_NAME_COLOR, 'retry: ' + gutil.colors.yellow(this._makeAssetKey(file)));
            this._addTask(file);
            break;
        // Unprocessable entity
        case 422 :
            gutil.log(PLUGIN_NAME_ERROR_COLOR, 'syntax error or wrong path at ' + gutil.colors.red(this._makeAssetKey(file)));
            break;
        // Invalid request
        case 406 :
        case 403 :
            gutil.log(PLUGIN_NAME_ERROR_COLOR, 'invalid request at ' + gutil.colors.red(this._makeAssetKey(file)))
            break;
        // API Request is not valid for this shop
        case 401 :
            gutil.log(PLUGIN_NAME_ERROR_COLOR, 'invalid shop. Check your config.')
            break;
        default:
        }
    }

    /*
        Returns a wrapper around _runAssetTask()
        used to call async.whilst() next() callback
    */
    _makeConsumer (file) {
        var _this = this;
        return function (next) {
            return _this._runAssetTask(file)
                .then(function (res) {
                    gutil.log(PLUGIN_NAME_COLOR, file.action + ':', gutil.colors.green(_this._makeAssetKey(file)));
                    _this._taskQueue.shift();
                    file.done();
                    next();
                    return res;
                })
                .catch(function (error) {
                    _this._taskQueue.shift();
                    file.done(new PluginError(PLUGIN_NAME, error));
                    _this._handleTaskError (error, file);
                    next(error);
                    return error;
                })
        };
    }

    /*
        Runs Shopify API calls from `file`.
        The callback(err) is called by the Promise returned by the API
        A file is a Vinyl object or a hash.
    */
    _runAssetTask (file) {
        var params = {};
        var verb;
        switch (file.action) {
        case 'deleted':
            params.asset = {key: this._makeAssetKey(file)};
            verb = 'delete'; break;
        case 'added':
            params.key = this._makeAssetKey(file);
            params.attachment = file.contents.toString('base64');
            verb = 'create'; break;
        case 'changed':
            params.key = this._makeAssetKey(file);
            params.attachment = file.contents.toString('base64');
            verb = 'update'; break;
        default:
            params.key = this._makeAssetKey(file);
            params.attachment = file.contents.toString('base64');
            file.action = 'added';
            verb = 'create';
        }
        return this.api.asset[verb](this._themeId, params);
    }

    /*
    Continously take tasks from the _taskQueue list,
    A task is a hash of:
        - key: 'templates/index.liquid'
        - consumer: fn(callback)
    */
    _queue () {
        if (this._queueRunning) return;
        this._queueRunning = true;
        var _this = this;
        var taskPromisers = [];
        async.whilst(
            function condition () {
                return _this._taskQueue.length !== 0;
            },
            function iterator (next) {
                var task = _this._taskQueue[0];
                taskPromisers.push(task.consumer(next));
            },
            /*
                end() is reached *before* all files have finished uploading.
                Promise.all() will complete once all tasks are finished or any error out.
            */
            function end (error) {
                _this._queueRunning = false;
                if (error) {
                    _this._taskQueue = [];
                    return;
                }
                // if (!taskPromisers.length) return;
                Promise.all(taskPromisers)
                    .then((responses)=>{
                        _this.emit('done', responses);
                        gutil.log(PLUGIN_NAME_COLOR, gutil.colors.bold('Done'));
                    })
                    .catch((error)=>{
                        _this.emit('error', error);
                        gutil.log( new PluginError(PLUGIN_NAME, error, {showStack: true}) );
                    })
            }
        );
    }

    _addTask (file) {
        var key = this._makeAssetKey(file);

        gutil.log(PLUGIN_NAME_COLOR, 'queued: ' + gutil.colors.yellow(key));

        for (var index = 0; index < this._taskQueue.length; index++) {
            if (this._taskQueue[index].key === key) {
                gutil.log(PLUGIN_NAME_COLOR, 'requeued: ' + gutil.colors.yellow(key));
                this._taskQueue.splice(index, 1);
            }
        }

        this._taskQueue.push({
            key: key,
            consumer: this._makeConsumer(file)
        });

        this._queue();
    }

    purge (options) {
        if (!this._initialised) return this._passthrough();

        this._themeId = (options) ? options.theme_id : this._themeId;
        if (!this._themeId) {
            throw new Error('Missing {theme_id: "xxxx"}');
        }
        if (this._taskQueue.length === 0) {
            setTimeout(this._queue.bind(this), 0);
        }
        var _this = this;
        this.api.asset.list(this._themeId)
            .then(function (list) {
                list.forEach(function (asset) {
                    if (protectedKeys.indexOf(asset.key) >= 0) return;
                    _this._addTask({
                        path: asset.key,
                        action: 'deleted',
                        done: function () {},
                    });
                });
            })
            .catch(function (err) {
                gutil.log( new PluginError(PLUGIN_NAME, err) );
            });
    }

    _passthrough () {
        return through.obj(function (file, enc, cb) {
            this.push();
            cb();
        });
    }

    stream (options) {
        var _this = this;

        // Stream right through if we are not initialised.
        if (!this._initialised) return this._passthrough();

        // Theme ID is required for /assets operations
        this._themeId = (options) ? options.theme_id : this._themeId;
        if (!this._themeId) {
            throw new Error('Missing {theme_id: "xxxx"}');
        }

        // Return a Transform stream
        return through.obj(function(file, encoding, callback) {

            // Move the file down the chain right away
            this.push(file);

            if (options && options.batchMode) {
                callback();
                file.done = function () {};
            } else {
                file.done = function (err) {
                    callback(err);
                }
            }

            if (file.path && file.path.match(/\s+/)) {
                let err = new PluginError(PLUGIN_NAME, 'Shopify filenames cannot contain spaces: ' + gutil.colors.green(file.path));
                this.push(file);
                return callback(err);
            }

            if (file.isBuffer()) {
                _this._addTask(file);
            } else if (file.isNull()) {
                file.action = 'deleted';
                _this._addTask(file);
            } else if (file.isStream()) {
                process.nextTick(function () {
                    callback(new PluginError('Streams are not supported'));
                });
            }
        });
    }
}
