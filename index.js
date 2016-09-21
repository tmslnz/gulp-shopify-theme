const PLUGIN_NAME = 'gulp-shopify-theme';

const through = require('through2');

function sync () {
    return through.obj(function(file, encoding, callback) {
        this.push(file);
        callback();
    });
}

module.exports = {
    sync: sync,
};
