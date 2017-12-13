<img src="https://imgur.com/asPMNcE.png" alt="gulp-shopify-theme" width="363" height="140"/>

[![npm](https://img.shields.io/npm/v/gulp-shopify-theme.svg?maxAge=2592000?style=flat-square)](https://www.npmjs.com/package/gulp-shopify-theme)

# Gulp Shopify Theme

[Gulp.js](https://gulpjs.com) plugin for Shopify theme development.

Highlights:

- Asynchronous theme assets uploads.
- Retry on error.
- Bulk theme files deletion.
- Multiple instance support.

## Install

```shell
$ npm install --save-dev gulp-shopify-theme
```

## Features

- Queue [Shopify API][sapi] calls respecting the 40-call<small>/burst</small> / 2 call<small>/sec</small> limits
- Support idiomatic Gulp.js workflow: `.pipe(shopifytheme.stream( options ))`
- Support purging all theme files on Shopify (for cleanup and reupload)
- Multiple instance support. Sync multiple themes via a single `gulpfile.js`
- Uses the excellent Microapps' [`shopify-api-node`](https://github.com/microapps/Shopify-api-node) as the API wrapper

## Usage

A working example can be found here: [gist.github.com/tmslnz/1d025baaa…](https://gist.github.com/tmslnz/1d025baaa7557a2d994032aa88fb61b3)

```js
var shopifytheme = require('gulp-shopify-theme').create();
var shopifyconfig = {
    "api_key": "8a1a2001d06ff…",
    "password": "51f8c8de49ee28…",
    "shared_secret": "51f8c8de49ee51…",
    "shop_name": "yourshopname…",
    "theme_id": "12345678…"
}

gulp.task( 'copy', ['shopify-theme-init'], function () {
    return gulp.src( [ 'src/{layout,config,snippets,templates,locales}/**/*.*' ] )
        .pipe( shopifytheme.stream() );
});

gulp.task( 'shopify-theme-init', function () {
    shopifytheme.init(shopifyconfig);
});

gulp.task( 'watch', function () {
	//
	// …watch and compile tasks…
	//

	shopifytheme.on('done', browserSync.reload());
});

```

### Methods

- shopifytheme.**create( _options_ )**

	Returns a new instance. The instance will do nothing until `.init( options )` is called on it.
- shopifytheme.**init( _options_ )**

	Initialises an instance with `options`. The plugin will wait for, and queue, new files as they come through.
- shopifytheme.**stream( _options_ )**

	Use this to stream any theme file to the plugin.

	Options are:
	
	- batchMode
	- theme_id

	```js
	gulp.src( [ 'src/js/*.js' ] )
        .pipe( shopifytheme.stream( {theme_id: 12345} ) )
        .pipe( gulp.dest( 'dist' ) )
	```

	`batchMode` will force `stream()` to return the Gulp stream immediately.
	In this mode you can subscribe to `done` and `error` to be notified when all tasks have ended.

	Passing **`theme_id` is optional** if you have already passed it to the instance's configuration on `init()`. However if used it will override the pre-exisiting `theme_id`. If no `theme_id` is present an error is thrown.


- shopifytheme.**purge()**

	This will **delete** all theme files from Shopify. Equivalent to going to the Shopify Admin and deleting each file by hand (eww!).
	Use with caution, of course.

	`.purge()` honours a blacklist of _un_deletable files (e.g. `layout/theme.liquid`)

### Options

For now it's just API configuration.

- **apiKey**
- **password**
- **shopName**
- **themeId**
- **autoLimit** (see [`shopify-api-node`](https://www.npmjs.com/package/shopify-api-node))
- **timeout**

### Events

The plugin instance emits two events `done` and `error` at the end of a sync task queue.

On `done` the event handler receives the list of files that have successfully synced.  
On `error` the handler is passed whatever error was thrown in the process. 

[sapi]: https://help.shopify.com/api/reference/asset
