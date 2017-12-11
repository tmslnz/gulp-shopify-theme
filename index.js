const PLUGIN_NAME = 'gulp-shopify-theme';

const gutil = require('gulp-util');
const PluginError = gutil.PluginError;
const through = require('through2');
const async = require('async');
const Shopify = require('shopify-api-node');

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
        return options.shop_name === instance._shop_name && options.api_key === instance._api_key;
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

class ShopifyTheme {
    constructor(options) {
        this.makeConfig(options);
    }

    init (options) {
        this.makeConfig(options, true);
    }

    makeConfig (options, isInit) {
        options = options || {};
        this._options = options;
        this._queueTasks = [];
        this._shop_name = options.shop_name;
        this._api_key = options.api_key;
        this._password = options.password;
        this._theme_id = options.theme_id;
        this._root = options.root;
        if (isInit && (!options.shop_name || !options.api_key)) {
            throw new Error('Missing configuration');
        } else if (options.shop_name && options.api_key) {
            this.api = new Shopify( options.shop_name, options.api_key, options.password );
            this._initialised = true;
        }
    }

    _makeAssetKey (file) {
        var themeRoot = this._root ? this._root + '/' : null;
        var fullpath = file.path ? file.path : file.history.slice(-1).pop();
        var basepath = fullpath.split(themeRoot).pop().match(basedirsRegExp);
        if (!basepath) {
            gutil.log('Invalid resource path');
            throw new Error('Invalid resource path');
        }
        basepath = basepath[0];
        return encodeURI(basepath);
    }

    _handleTaskError (error, file) {
        if (!error) return;
        var errorCode = error.code || error.statusCode;
        switch (errorCode) {
            case 429 :
                gutil.log(error);
                this._addTask(file);
                break;
            case 422 :
                gutil.log(gutil.colors.red('Likely a Liquid syntax error'));
            case 406 :
            case 403 :
                gutil.log(error, file);
                break;
            case 401 :
                gutil.log(error);
                break;
            case 'ETIMEDOUT':
                gutil.log(error);
                this._addTask(file);
                break;
            case 'ECONNRESET':
                gutil.log(error);
                this._addTask(file);
                break;
            default:
                gutil.log(error);
        }
    }

    /*
        Returns a wrapper around _runAssetTask()
        used to call async.whilst() next() callback
    */
    _makeConsumer (file) {
        var wait = (this.api.callLimits.remaining <= 1) ? 600 : 0;
        var _this = this;
        return function (next) {
            _this._runAssetTask(file, function (err) {
                _this._handleTaskError (err, file);
                gutil.log('File', gutil.colors.green(_this._makeAssetKey(file)), file.action);
                file.done(null);
            });
            setTimeout(()=>next(), wait);
        };
    }

    /*
        Runs Shopify API calls from `file`.
        The callback(err) is called by the Promise returned by the API
        A file is a Vinyl object or a hash.
    */
    _runAssetTask (file, callback) {
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
        this.api.asset[verb](this._theme_id, params)
            .then(function () { callback(null) })
            .catch(function (err) { callback(err) });
    }

    /*
    Continously take tasks from the _queueTasks list,
    A task is a hash of:
        - key: 'templates/index.liquid'
        - consumer: fn(callback)
    */
    _queue () {
        var _this = this;
        async.whilst(
            function condition () {
                return !!_this._queueTasks.length || _this._break;
            },
            function iterator (next) {
                var task = _this._queueTasks.shift();
                task.consumer(next);
            },
            function end () {
                setTimeout(_this._queue.bind(_this), 100);
            }
        );
    }

    _queueStart () { this._break = false; this._queue(); }
    _queueStop () { this._break = true; }

    _addTask (file) {
        var key = this._makeAssetKey(file);
        for (var index = 0; index < this._queueTasks.length; index++) {
            if (this._queueTasks[index].key === key) {
                gutil.log('Replacing task for:', key);
                this._queueTasks.splice(index, 1);
            }
        }
        this._queueTasks.push({
            key: key,
            consumer: this._makeConsumer(file)
        });
    }

    purge (options, done) {
        if (!this._initialised) return this._passthrough();

        done = done || function () {};
        this._theme_id = (options) ? options.theme_id : this._theme_id;
        if (!this._theme_id) {
            throw new Error('Missing {theme_id: "xxxx"}');
        }
        setTimeout(this._queueStart.bind(this), 0);
        var _this = this;
        this.api.asset.list(this._theme_id)
            .then(function (list) {
                list.forEach(function (asset) {
                    if (protectedKeys.indexOf(asset.key) >= 0) return;
                    _this._addTask({
                        path: asset.key,
                        action: 'deleted',
                        done: function (err) { done(err); }
                    });
                });
            })
            .catch(function (err) {
                gutil.log(err);
            });
    }

    _passthrough () {
        return through.obj(function (file, enc, cb) {
            this.push();
            cb();
        });
    }

    stream (options) {
        // Stream right through if we are not initialised.
        if (!this._initialised) return this._passthrough();

        // Theme ID is required for /assets operations
        this._theme_id = (options) ? options.theme_id : this._theme_id;
        if (!this._theme_id) {
            throw new Error('Missing {theme_id: "xxxx"}');
        }
        // Start the queue loop
        setTimeout(this._queueStart.bind(this), 0);
        var _this = this;

        // Return a Transform stream
        return through.obj(function(file, encoding, callback) {
            if (file.path && file.path.match(/\s+/)) {
                gutil.log(gutil.colors.red('Error:'), 'filenames cannot contain spaces!', gutil.colors.green(file.path));
                this.push(file);
                return callback;
            }
            file.done = function (err) {
                callback(err);
            };
            if (file.isBuffer()) {
                _this._addTask(file);
            }
            else if (file.isNull()) {
                file.action = 'deleted';
                _this._addTask(file);
            }
            else if (file.isStream()) {
                process.nextTick(function () {
                    callback(new PluginError('Streams are not supported'));
                });
            }
            this.push(file);
        });
    }
}