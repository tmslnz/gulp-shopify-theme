const PLUGIN_NAME = 'gulp-shopify-theme';

const gutil = require('gulp-util');
const PluginError = gutil.PluginError;
const through = require('through2');
const async = require('async');
const Shopify = require('shopify-api-node');
const path = require('path');

var shopify = new Shopify( shopifyAppConfig.shop_name, shopifyAppConfig.api_key, shopifyAppConfig.password );
var queueWait = 0;
var queueFiles = [];

/*
Asset API
---------
shopify.asset.create(themeId, params)
shopify.asset.delete(themeId, params)
shopify.asset.get(themeId, params)
shopify.asset.list(themeId[, params])
shopify.asset.update(themeId, params)
*/

/*
Shopify error codes
statusCode:
401 - API Request is not valid for this shop. You are either not using the right Access Token or the permission for that token has been revoked
404 - The resource does not exist
422 - There was a problem with the body of your Request. Inspect the response body for the errors
429 - You've gone through your API Limit.
500 - various

Nodejs
code:
ECONNRESET
ETIMEDOUT
ENOTFOUND
EADDRINFO
*/

function setQueueWait() {
    if (shopify.callLimits.remaining === 0) {
        queueWait = 500;
    } else {
        queueWait = 0;
    }
}

/*
Loops over the file queue to create, delete or update assets.
*/
function queueLoop () {
    async.whilst(
        function() { return queueFiles.length; },
        function(callback) {
            setQueueWait();
            setTimeout(function() {
                var file = queueFiles.shift();
                runAssetTask(file, function (err) {
                    if (err) {
                        if (err.statusCode === 429) {
                            queueFiles.push(file);
                        }
                        return callback(err);
                    }
                    callback(null);
                });
            }, queueWait);
        },
        function (err) {
            var pause = 100;
            if (err) {
                if (err.statusCode === 429) { pause = 500 }
            }

            setTimeout( function () {
                queueLoop();
            }, pause);
        }
    );
}

queueLoop();

function addToQueue (file, done) {
    file.done = done || function () {};
    queueFiles.push(file);
}

function makeAssetKey (file) {
    var fullpath = file.path ? file.path : file.history.slice(-1).pop();
    var basedir = path.dirname(fullpath).split('/').slice(-1).pop();
    var basename = path.basename(fullpath);
    return encodeURI(path.join(basedir, basename));
}

function runAssetTask (file, callback) {
    var themeId = shopifyAppConfig.theme_id;
    var params = {
        key: makeAssetKey(file),
        attachment: file.contents.toString('base64'),
    };
    var action;
    switch (file.action) {
        case 'deleted': action = 'delete'; break;
        case 'added': action = 'create'; break;
        case 'changed': action = 'update'; break;
        default: action = 'create';
    }
    shopify.asset[action](themeId, params)
        .then(function () { file.done(); callback(null) })
        .catch(function (err) { file.done(err); callback(err) });
}

/*
Receives Vinyl object from gulp.pipe()
*/
function sync () {
    return through.obj(function(file, encoding, callback) {
        if (file.isBuffer()) {
            addToQueue(file, function (err) {
                callback(err);
            });
        }
        else if (file.isNull()) {
            file.action = 'deleted';
            addToQueue(file, function (err) {
                callback(err);
            });
        }
        else if (file.isStream()) {
            process.nextTick(function () {
                callback(new PluginError('Streams are not supported'));
            });
        }
        this.push(file);
    });
}

module.exports = {
    sync: sync,
};
