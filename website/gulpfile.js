var path = require('path');
var concat = require('gulp-concat');
var connect = require('gulp-connect');
var del = require('del');
var Dgeni = require('dgeni');
var gulp = require('gulp');
var less = require('gulp-less');
var markdown = require('gulp-markdown');
var cleanCSS = require('gulp-clean-css');
var rename = require('gulp-rename');
var replace = require('gulp-replace');

var paths = {
  build: ['build', 'docgen/build'],
  docs: ['../docs/*.md'],
  dgeniTemplates: ['docgen/templates/*.txt', 'docgen/processors/*.js'],
  html: ['index.html', 'partials/*.html'],
  js: [
    'js/modules.js',
    'js/**/*.js',
    'bower_components/bootstrap/dist/js/bootstrap.min.js',
    'bower_components/lodash/dist/lodash.min.js'
  ],
  less: ['css/protractor.less'],
  outputDir: 'build/'
};

gulp.task('clean', function(cb) {
  del(paths.build, cb);
});

// Generate the table of contents json file using Dgeni. This is output to
// docgen/build/toc.json
gulp.task('dgeni', function(done) {
  var packages = [require('./docgen/dgeni-config')];
  var dgeni = new Dgeni(packages);

  dgeni.generate().then(function(docs) {
    console.log(docs.length, 'docs generated');
  }).then(function() {
    // Check that docs were generated correctly
    var toc = require('./docgen/build/toc.json');
    if (!toc || !Array.isArray(toc.items)) {
      return Promise.reject('Generated toc.json file is malformatted');
    }
    var isBrowser = function(item) {
      return item.alias == 'browser';
    };
    if (!toc.items.some(isBrowser)) {
      return Promise.reject('Generated toc.json missing docs for Protractor function.');
    }

    // Copy files over
    gulp.src(['docgen/build/*.json'])
        .pipe(gulp.dest(paths.outputDir + '/apiDocs'));
    done();
  }).catch(function(error) {
    done(
        'Could not generate docs.  ' +
        'Try running `npm run compile_to_es5` from Protractor\'s root folder.\n' +
        'Origonal Error: ' + error);
  });
});

gulp.task('copyFiles', function() {
  // html.
  gulp.src('index.html')
      .pipe(gulp.dest(paths.outputDir));
  gulp.src('partials/*.html')
      .pipe(gulp.dest(paths.outputDir + '/partials'));

  // Images.
  gulp.src('img/**')
      .pipe(gulp.dest('build/img'));
});

gulp.task('js', function() {
  gulp.src(paths.js)
      .pipe(concat('protractorApp.js'))
      .pipe(gulp.dest(paths.outputDir));
});

gulp.task('less', function() {
  gulp.src(paths.less)
      .pipe(less())
      .pipe(cleanCSS())
      .pipe(gulp.dest(paths.outputDir + '/css'));
});

gulp.task('connect', function() {
  connect.server({
    root: 'build',
    livereload: true,
    open: {
      browser: 'Google Chrome'
    }
  });
});

gulp.task('reloadServer', function() {
  gulp.src(paths.outputDir)
      .pipe(connect.reload());
});

gulp.task('watch', function() {
  gulp.watch(paths.html, ['copyFiles', 'reloadServer']);
  gulp.watch(paths.docs, ['markdown', 'reloadServer']);
  gulp.watch(paths.js, ['js', 'reloadServer']);
  gulp.watch(paths.less, ['less', 'reloadServer']);
  gulp.watch(paths.dgeniTemplates, ['dgeni', 'copyFiles', 'reloadServer']);
});

// Transform md files to html.
gulp.task('markdown', function() {
  var version = require('../package.json').version
  gulp.src(['../docs/*.md', '!../docs/api.md'])
      // Parse markdown.
      .pipe(markdown())
      // Fix urls which reference files only on github.
      .pipe(replace(
          /(href|src)="(?:([\-\.\w\/]+)\/)?(\w+\.\w+(?:#.*)?)?"/g,
          function(match, attr, folder, file) {
            var ext = file ? file.match(/\w+\.(\w+)(?:#.*)?/)[1] : null;
            // Don't process .md and .png files which are on the website
            if (((ext == 'md') || (ext == 'png')) && (!folder ||
                (path.resolve('/docs', folder).split('/')[1] == 'docs'))) {
              return match;
            }
            if (!folder) {
              folder = 'docs';
            } else if (folder[0] == '/') {
              folder = folder.slice(1);
            }
            return attr + '="https://github.com/angular/protractor/blob/' +
                version + '/' + folder + '/' + (file || '') + '"';
          }
      ))
      // Fix in-page hash paths.
      .pipe(replace(/"#([^ ]*?)"/g, '#{{path}}#$1'))
      // Fix md urls.
      .pipe(replace(/"(?:\/docs\/)?([\w\-]+)\.md/g, '"#/$1'))
      // Fix png urls.
      .pipe(replace(/"(?:\/docs\/)?([\w\-]+\.png)"/g, '"img/$1"'))
      // Add anchor links
      .pipe(replace(/<h2 id="([^"]*)">(.*?)<\/h2>/g, '<h2 id="$1" class="' +
          'anchored"><div><a href="#{{path}}#$1">&#x1f517;</a>$2</div></h2>'))
      // Decorate tables.
      .pipe(replace(/<table>/g, '<table class="table table-striped">'))
      // Fix <code> blocks to not interpolate Angular
      .pipe(replace(/<code>/g, '<code ng-non-bindable>'))
      .pipe(rename(function(path) {
        path.extname = '.html';
      }))
      .pipe(gulp.dest('./build/partials'));
});

// Make version of testapp for github page
gulp.task('testapp', function() {
  var stream = gulp.src('../testapp/**/*').
      pipe(gulp.dest('build/testapp'));
  gulp.src('testapp/*').
      pipe(gulp.dest('build/testapp/ng1'));
  var angular_version = require('../testapp/ng1/lib/angular_version.js');
  gulp.src('../testapp/ng1/lib/angular_v' + angular_version + '/**/*').
      pipe(gulp.dest('build/testapp/ng1/lib/angular'));
  return stream;
});

gulp.task('cleanup_testapp', ['testapp'], function() {
  del('build/testapp/ng1/lib/angular_v*');
});

// Start a server and watch for changes.
gulp.task('liveReload', [
  'default',
  'connect',
  'watch'
]);

gulp.task('default', [
  'testapp',
  'cleanup_testapp',
  'dgeni',
  'less',
  'markdown',
  'js',
  'copyFiles'
]);
