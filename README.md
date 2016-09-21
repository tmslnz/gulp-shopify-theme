# Gulp Shopify Theme

Gulp plugin to automatically upload Shopify themes during development.

## Examples

```js
gulp.task( 'copy', function () {
    return gulp.src( [ 'src/{layout,config,snippets,templates,locales}/**/*.*' ] )
        .pipe( plumber() )
        .pipe( changed( DESTINATION, {hasChanged: changed.compareSha1Digest} ) )
        .pipe( gulp.dest( DESTINATION ) )
        .pipe( shopifytheme.sync() );
});
```
