const ShopifyTheme = require('./lib/theme.js')
const util = require('./lib/util.js')
const shopifyThemeInstances = [];

/*
var theme = shopifytheme.create();
gulp.src().pipe(theme.stream());
theme.init(options);
*/

function make (options) {
    var shopifyTheme;
    var previous = shopifyThemeInstances.filter((instance)=>{
        return options.shop_name === instance._shopName && options.api_key === instance._apiKey;
    });
    if (previous.length) return previous[0];
    shopifyTheme = new ShopifyTheme( options );
    shopifyThemeInstances.push(shopifyTheme);
    return shopifyTheme;
}

module.exports = {
    create: make,
    make,
    util,
};
