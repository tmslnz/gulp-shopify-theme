# Gulp Shopify Theme

Gulp plugin to automatically upload Shopify themes during development.

## Example

```js
var shopifyTheme = require('gulp-shopify-theme').create();
var shopifyConfig = {
    "api_key": "8a1a2001d06ff…",
    "password": "51f8c8de49ee28…",
    "shared_secret": "51f8c8de49ee51…",
    "shop_name": "yourshopname…",
    "theme_id": "12345678…"
}

gulp.task( 'copy', ['init'], function () {
    return gulp.src( [ 'src/{layout,config,snippets,templates,locales}/**/*.*' ] )
        .pipe( shopifytheme.sync() );
});

gulp.task( 'shopifyThemeInit', function () {
    shopifyTheme.init(shopifyConfig);
});
```
