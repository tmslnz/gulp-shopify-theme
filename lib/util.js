const jsYaml = require('js-yaml');

function replaceYAMLwithJSON (match, g1) {
    if (match) {
        var yamlString = g1.replace(/{% (end)?schema %}/, '');
        var parsedYaml = jsYaml.safeLoad(yamlString);
        var jsonString = JSON.stringify(parsedYaml, null, '    ');
        return '{% schema %}\n' + jsonString + '\n{% endschema %}';
    }
}

function makeLiquidSourceMappingURL (file) {
    return '{{"' + file.relative + '.map" | asset_url }}';
}

function appendLiquidExt (path) {
    if (path.extname === '.map') return;
    if (path.extname === '.css') {
        path.extname = '.scss';
    }
    path.basename += path.extname;
    path.extname = '.liquid';
}

function flatten (path) {
    if (path.dirname !== '.') {
        path.basename = path.dirname.replace('/', '_') + '_' + path.basename;
    }
}

const sourceMappingURLCSSregExp = new RegExp('(.*?[/*]{2,}# sourceMappingURL=)(.*?)([/*]{2})', 'g');
const sourceMappingURLJSregExp = new RegExp('(.*?[/*]{2,}# sourceMappingURL=)(.*?)', 'g');
const sourceMappingURLCSSreplace = '{% raw %}$1{% endraw %}$2{% raw %}$3{% endraw %}';
const sourceMappingURLJSreplace = '{% raw %}$1{% endraw %}$2';

module.exports = {
    replaceYAMLwithJSON,
    makeLiquidSourceMappingURL,
    appendLiquidExt,
    flatten,
    sourceMappingURLCSSregExp,
    sourceMappingURLJSregExp,
    sourceMappingURLCSSreplace,
    sourceMappingURLJSreplace,
}
